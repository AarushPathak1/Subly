"""
API tests for the Matching Service using FastAPI's TestClient.
All external calls (OpenAI, Pinecone, DB, RabbitMQ) are mocked via conftest.py.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
import main as matching_main  # noqa: E402


client = TestClient(matching_main.app)


class TestHealthEndpoint:
    def test_healthz_returns_ok(self):
        resp = client.get("/healthz")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
        assert resp.json()["service"] == "matching"


class TestSearchEndpoint:
    def test_search_returns_list(self):
        """
        /search should call embed_text and Pinecone, returning a list of results.
        """
        fake_embedding = [0.1] * 1536

        mock_results = {
            "matches": [
                {
                    "id": "listing-abc",
                    "score": 0.92,
                    "metadata": {"university": "UT AUSTIN", "rent_cents": 120000, "bedrooms": 2},
                }
            ]
        }

        with patch.object(matching_main, "embed_text", return_value=fake_embedding):
            with patch.object(matching_main, "index") as mock_idx:
                mock_idx.query.return_value = mock_results
                resp = client.post("/search", json={"query": "quiet place near campus"})

        assert resp.status_code == 200
        results = resp.json()
        assert isinstance(results, list)
        assert results[0]["listing_id"] == "listing-abc"
        assert results[0]["score"] == 0.92

    def test_search_with_university_filter(self):
        fake_embedding = [0.0] * 1536
        with patch.object(matching_main, "embed_text", return_value=fake_embedding):
            with patch.object(matching_main, "index") as mock_idx:
                mock_idx.query.return_value = {"matches": []}
                resp = client.post("/search", json={"query": "studio", "university": "UCLA"})

        assert resp.status_code == 200
        # Verify the filter was passed to Pinecone
        call_kwargs = mock_idx.query.call_args.kwargs
        assert call_kwargs["filter"]["university"]["$eq"] == "UCLA"

    def test_search_empty_results(self):
        with patch.object(matching_main, "embed_text", return_value=[0.0] * 1536):
            with patch.object(matching_main, "index") as mock_idx:
                mock_idx.query.return_value = {"matches": []}
                resp = client.post("/search", json={"query": "something very unusual"})

        assert resp.status_code == 200
        assert resp.json() == []


class TestMatchesEndpoint:
    def test_matches_returns_404_when_no_profile(self):
        """
        /matches/{user_id} returns 404 when the user has no profile in the DB.
        """
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None  # no profile
        matching_main.db_conn.cursor.return_value = mock_cursor

        resp = client.get("/matches/user-no-profile")
        assert resp.status_code == 404

    def test_matches_returns_list_for_known_user(self):
        """
        /matches/{user_id} returns a list when user profile exists.
        """
        fake_embedding = [0.5] * 1536

        def cursor_side_effect():
            c = MagicMock()
            # First call: user profile
            c.fetchone.return_value = ("quiet place near campus", "UT AUSTIN", 150000, 2)
            # Second call: scam scores
            c.fetchall.return_value = [("listing-xyz", 0.1)]
            return c

        matching_main.db_conn.cursor.side_effect = cursor_side_effect

        pinecone_results = {
            "matches": [
                {
                    "id": "listing-xyz",
                    "score": 0.88,
                    "metadata": {"university": "UT AUSTIN", "rent_cents": 130000, "bedrooms": 2},
                }
            ]
        }

        with patch.object(matching_main, "embed_text", return_value=fake_embedding):
            with patch.object(matching_main, "index") as mock_idx:
                mock_idx.query.return_value = pinecone_results
                resp = client.get("/matches/user-with-profile")

        assert resp.status_code == 200
        results = resp.json()
        assert isinstance(results, list)
        assert results[0]["listing_id"] == "listing-xyz"
        assert results[0]["scam_score"] == 0.1
