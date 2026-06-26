"""
Unit tests for run_trust_checks' UPDATE statement (H7).
The trust worker must only flip a listing from draft -> active when writing
the scam score — it must never un-pause or un-lease a listing that a lister
(or admin) has already moved out of draft.
conftest.py mocks psycopg2/openai/aio_pika before main is imported.
"""
import asyncio
import sys
import os
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main  # noqa: E402


def _run_trust_checks_with_mocks(monkeypatch, row):
    mock_cursor = MagicMock()
    mock_cursor.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.return_value = row

    mock_conn = MagicMock()
    mock_conn.cursor.return_value = mock_cursor

    monkeypatch.setattr(main, "get_db", lambda: mock_conn)
    monkeypatch.setattr(main, "release_db", lambda conn: None)
    monkeypatch.setattr(main, "compute_keyword_score", lambda title, desc: 0.0)
    monkeypatch.setattr(main, "compute_rent_flag", lambda listing_id, rent_cents, university: 0.0)

    async def fake_llm_score(*args, **kwargs):
        return 0.1, "looks fine"

    monkeypatch.setattr(main, "compute_llm_score", fake_llm_score)

    asyncio.run(main.run_trust_checks("listing-123"))
    return mock_cursor


class TestRunTrustChecksUpdateStatement:
    def test_update_only_targets_draft_listings(self, monkeypatch):
        row = ("Nice place", "Great location", 150000, "UT Austin", 2)
        cursor = _run_trust_checks_with_mocks(monkeypatch, row)

        update_calls = [
            call for call in cursor.execute.call_args_list
            if "UPDATE listings" in call.args[0]
        ]
        assert len(update_calls) == 1
        sql, params = update_calls[0].args
        assert "status = 'draft'" in sql
        assert "SET scam_score" in sql
        assert params[1] == "listing-123"

    def test_listing_not_found_skips_update(self, monkeypatch):
        cursor = _run_trust_checks_with_mocks(monkeypatch, None)

        update_calls = [
            call for call in cursor.execute.call_args_list
            if "UPDATE listings" in call.args[0]
        ]
        assert len(update_calls) == 0
