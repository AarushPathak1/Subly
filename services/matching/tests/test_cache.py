"""
Tests for the embedding cache introduced in Change A:
  - _load_or_compute_user_embedding (unit tests)
  - get_matches handler (cache hit, cache miss, auth, 404)
  - search handler (async assertion)

All external dependencies (OpenAI, Pinecone, DB, RabbitMQ) are mocked via
conftest.py.  Each test adds its own fine-grained patches on top.
"""
import sys
import os
import inspect
import pytest
from unittest.mock import MagicMock, patch, call
from fastapi import HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import main as matching_main  # noqa: E402

client = TestClient(matching_main.app)


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _make_mock_conn(fetchone_return):
    """
    Return (mock_conn, actual_cursor) where:
    - mock_conn.cursor() is a context-manager that yields actual_cursor
    - actual_cursor.fetchone() returns fetchone_return
    """
    actual_cursor = MagicMock()
    actual_cursor.fetchone.return_value = fetchone_return

    cursor_cm = MagicMock()
    cursor_cm.__enter__ = MagicMock(return_value=actual_cursor)
    cursor_cm.__exit__ = MagicMock(return_value=False)

    mock_conn = MagicMock()
    mock_conn.cursor.return_value = cursor_cm
    return mock_conn, actual_cursor


# ──────────────────────────────────────────────────────────────────────────────
# 1 & 7 — Handler is async
# ──────────────────────────────────────────────────────────────────────────────

class TestHandlerIsAsync:
    def test_get_matches_handler_is_async(self):
        """get_matches must be a coroutine function (async def)."""
        assert inspect.iscoroutinefunction(matching_main.get_matches)

    def test_search_is_async(self):
        """search must be a coroutine function (async def)."""
        assert inspect.iscoroutinefunction(matching_main.search)


# ──────────────────────────────────────────────────────────────────────────────
# 5 & 6 — Auth checks (no DB needed)
# ──────────────────────────────────────────────────────────────────────────────

class TestGetMatchesAuth:
    def test_get_matches_auth_missing_header_401(self):
        """Missing X-User-ID header must return 401."""
        resp = client.get("/matches/user-1")
        assert resp.status_code == 401

    def test_get_matches_auth_mismatch_403(self):
        """X-User-ID != path user_id must return 403."""
        resp = client.get(
            "/matches/other-user",
            headers={"X-User-ID": "user-1"},
        )
        assert resp.status_code == 403


# ──────────────────────────────────────────────────────────────────────────────
# 4 — Missing profile → 404
# ──────────────────────────────────────────────────────────────────────────────

class TestGetMatchesMissingProfile:
    def test_get_matches_missing_profile_returns_404(self):
        """When _load_or_compute_user_embedding raises HTTPException(404), handler returns 404."""
        with patch.object(
            matching_main,
            "_load_or_compute_user_embedding",
            side_effect=HTTPException(status_code=404, detail="User profile not found"),
        ):
            resp = client.get(
                "/matches/user-no-profile",
                headers={"X-User-ID": "user-no-profile"},
            )
        assert resp.status_code == 404


# ──────────────────────────────────────────────────────────────────────────────
# 2 — Cache HIT: embed_text is never called
# ──────────────────────────────────────────────────────────────────────────────

class TestGetMatchesCacheHit:
    def test_get_matches_cache_hit_skips_openai(self):
        """
        When _load_or_compute_user_embedding returns a pre-built embedding
        (simulating a cache hit), embed_text must never be called.
        """
        fake_embedding = [0.5] * 1536

        with patch.object(
            matching_main,
            "_load_or_compute_user_embedding",
            return_value=(fake_embedding, "vibe", "UT AUSTIN", 150000, 2),
        ):
            with patch.object(matching_main, "index") as mock_idx:
                mock_idx.query.return_value = {"matches": []}
                with patch.object(
                    matching_main, "_fetch_listing_details", return_value=({}, {})
                ):
                    with patch.object(matching_main, "embed_text") as mock_embed:
                        resp = client.get(
                            "/matches/user-1",
                            headers={"X-User-ID": "user-1"},
                        )

        assert resp.status_code == 200
        mock_embed.assert_not_called()


# ──────────────────────────────────────────────────────────────────────────────
# 3 — Cache MISS: embed_text is called and UPDATE is written back
# ──────────────────────────────────────────────────────────────────────────────

class TestGetMatchesCacheMiss:
    def test_get_matches_cache_miss_calls_openai_and_writes_back(self):
        """
        When the DB row has preference_embedding=None, the handler must call
        embed_text once and write the result back via an UPDATE.
        """
        fake_embedding = [0.1] * 1536
        mock_conn, actual_cursor = _make_mock_conn(
            # Five columns: vibe_text, university, max_rent_cents, min_bedrooms, preference_embedding
            fetchone_return=("vibe text", "UT AUSTIN", 150000, 2, None),
        )

        with patch.object(matching_main, "get_db", return_value=mock_conn):
            with patch.object(matching_main, "embed_text", return_value=fake_embedding) as mock_embed:
                with patch.object(matching_main, "index") as mock_idx:
                    mock_idx.query.return_value = {"matches": []}
                    with patch.object(
                        matching_main, "_fetch_listing_details", return_value=({}, {})
                    ):
                        resp = client.get(
                            "/matches/user-1",
                            headers={"X-User-ID": "user-1"},
                        )

        assert resp.status_code == 200
        mock_embed.assert_called_once()

        # Verify an UPDATE was issued to write back the embedding
        execute_calls = actual_cursor.execute.call_args_list
        update_calls = [c for c in execute_calls if "UPDATE" in c.args[0].upper()]
        assert len(update_calls) >= 1, "Expected at least one UPDATE call to cache embedding"


# ──────────────────────────────────────────────────────────────────────────────
# 8 — Unit: _load_or_compute returns cached embedding without calling embed_text
# ──────────────────────────────────────────────────────────────────────────────

class TestLoadOrComputeDirectly:
    """
    Direct unit tests of _load_or_compute_user_embedding (sync function).
    """

    def test_load_or_compute_returns_cached_embedding(self):
        """When DB row has non-null preference_embedding, it is returned unchanged
        and embed_text is never called."""
        cached = [0.1] * 1536
        mock_conn, _ = _make_mock_conn(
            fetchone_return=("vibe", "UT AUSTIN", 150000, 2, cached)
        )

        with patch.object(matching_main, "get_db", return_value=mock_conn):
            with patch.object(matching_main, "embed_text") as mock_embed:
                result = matching_main._load_or_compute_user_embedding("user-1")

        embedding, vibe_text, university, max_rent_cents, min_bedrooms = result
        assert embedding == cached
        assert vibe_text == "vibe"
        assert university == "UT AUSTIN"
        assert max_rent_cents == 150000
        assert min_bedrooms == 2
        mock_embed.assert_not_called()

    # ──────────────────────────────────────────────────────────────────────────
    # 9 — Unit: cache miss writes embedding back
    # ──────────────────────────────────────────────────────────────────────────

    def test_load_or_compute_caches_on_miss(self):
        """On cache miss, embed_text is called once and the result is stored
        via UPDATE user_profiles."""
        fake_embedding = [0.2] * 1536
        mock_conn, actual_cursor = _make_mock_conn(
            fetchone_return=("vibe", "UT AUSTIN", 150000, 2, None)
        )

        with patch.object(matching_main, "get_db", return_value=mock_conn):
            with patch.object(
                matching_main, "embed_text", return_value=fake_embedding
            ) as mock_embed:
                result = matching_main._load_or_compute_user_embedding("user-1")

        embedding, vibe_text, university, max_rent_cents, min_bedrooms = result
        assert embedding == fake_embedding
        mock_embed.assert_called_once()

        # Verify UPDATE was issued with the correct embedding
        execute_calls = actual_cursor.execute.call_args_list
        update_calls = [c for c in execute_calls if "UPDATE" in c.args[0].upper()]
        assert len(update_calls) == 1, "Expected exactly one UPDATE to persist embedding"
        update_params = update_calls[0].args[1]
        assert update_params[0] == fake_embedding, "UPDATE must pass embedding as first param"

    # ──────────────────────────────────────────────────────────────────────────
    # 10 — Unit: OpenAI failure raises 502
    # ──────────────────────────────────────────────────────────────────────────

    def test_load_or_compute_openai_failure_raises_502(self):
        """When embed_text raises any exception, _load_or_compute raises
        HTTPException(502) so callers get a meaningful error."""
        mock_conn, _ = _make_mock_conn(
            fetchone_return=("vibe", "UT AUSTIN", 150000, 2, None)
        )

        with patch.object(matching_main, "get_db", return_value=mock_conn):
            with patch.object(
                matching_main, "embed_text", side_effect=Exception("OpenAI down")
            ):
                with pytest.raises(HTTPException) as exc_info:
                    matching_main._load_or_compute_user_embedding("user-1")

        assert exc_info.value.status_code == 502

    # ──────────────────────────────────────────────────────────────────────────
    # 11 — Unit: DB UPDATE failure does NOT abort the request
    # ──────────────────────────────────────────────────────────────────────────

    def test_load_or_compute_db_update_failure_still_returns_embedding(self):
        """When the write-back UPDATE fails, the function must still return
        the embedding rather than raising — the cache write is best-effort."""
        fake_embedding = [0.3] * 1536
        mock_conn, actual_cursor = _make_mock_conn(
            fetchone_return=("vibe", "UT AUSTIN", 150000, 2, None)
        )

        def execute_side_effect(sql, params=None):
            if "UPDATE" in sql.upper():
                raise Exception("DB connection lost")

        actual_cursor.execute.side_effect = execute_side_effect

        with patch.object(matching_main, "get_db", return_value=mock_conn):
            with patch.object(
                matching_main, "embed_text", return_value=fake_embedding
            ):
                # Must NOT raise despite UPDATE failure
                result = matching_main._load_or_compute_user_embedding("user-1")

        embedding, vibe_text, university, max_rent_cents, min_bedrooms = result
        assert embedding == fake_embedding
        assert vibe_text == "vibe"
