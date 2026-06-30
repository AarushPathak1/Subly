"""
Tests for Fix 4: SearchRequest.query field max_length=500 validation.
A POST /search with a query longer than 500 characters must return 422 (Pydantic
validation error) before any embedding or Pinecone call is made.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from unittest.mock import patch
from fastapi.testclient import TestClient
import main as matching_main  # noqa: E402

client = TestClient(matching_main.app)


class TestSearchQueryMaxLength:
    def test_search_query_exactly_500_chars_is_accepted(self):
        """A query of exactly 500 characters is at the boundary — must be accepted."""
        query = "a" * 500
        with patch.object(matching_main, "embed_text", return_value=[0.0] * 1536):
            with patch.object(matching_main, "index") as mock_idx:
                mock_idx.query.return_value = {"matches": []}
                resp = client.post(
                    "/search",
                    json={"query": query},
                    headers={"X-User-ID": "user-1"},
                )
        assert resp.status_code == 200

    def test_search_query_501_chars_returns_422(self):
        """A query of 501 characters exceeds max_length=500 — must return 422."""
        long_query = "b" * 501
        resp = client.post(
            "/search",
            json={"query": long_query},
            headers={"X-User-ID": "user-1"},
        )
        assert resp.status_code == 422

    def test_search_query_1000_chars_returns_422(self):
        """A query well over the limit also returns 422."""
        long_query = "x" * 1000
        resp = client.post(
            "/search",
            json={"query": long_query},
            headers={"X-User-ID": "user-1"},
        )
        assert resp.status_code == 422

    def test_search_query_too_long_does_not_call_embed_text(self):
        """When query is too long, embed_text must never be called."""
        long_query = "z" * 501
        with patch.object(matching_main, "embed_text") as mock_embed:
            resp = client.post(
                "/search",
                json={"query": long_query},
                headers={"X-User-ID": "user-1"},
            )
        assert resp.status_code == 422
        mock_embed.assert_not_called()

    def test_search_query_too_long_does_not_call_pinecone(self):
        """When query is too long, Pinecone must never be queried."""
        long_query = "y" * 600
        with patch.object(matching_main, "index") as mock_idx:
            resp = client.post(
                "/search",
                json={"query": long_query},
                headers={"X-User-ID": "user-1"},
            )
        assert resp.status_code == 422
        mock_idx.query.assert_not_called()
