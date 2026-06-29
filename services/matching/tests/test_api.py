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
    def test_search_returns_401_when_x_user_id_missing(self):
        """
        /search returns 401 when the gateway-injected X-User-ID header is
        missing entirely (defensive — shouldn't happen behind the gateway,
        but this service must not trust an unauthenticated caller).
        """
        resp = client.post("/search", json={"query": "quiet place near campus"})
        assert resp.status_code == 401

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
                resp = client.post(
                    "/search",
                    json={"query": "quiet place near campus"},
                    headers={"X-User-ID": "user-1"},
                )

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
                resp = client.post(
                    "/search",
                    json={"query": "studio", "university": "UCLA"},
                    headers={"X-User-ID": "user-1"},
                )

        assert resp.status_code == 200
        # Verify the filter was passed to Pinecone
        call_kwargs = mock_idx.query.call_args.kwargs
        assert call_kwargs["filter"]["university"]["$eq"] == "UCLA"

    def test_search_empty_results(self):
        with patch.object(matching_main, "embed_text", return_value=[0.0] * 1536):
            with patch.object(matching_main, "index") as mock_idx:
                mock_idx.query.return_value = {"matches": []}
                resp = client.post(
                    "/search",
                    json={"query": "something very unusual"},
                    headers={"X-User-ID": "user-1"},
                )

        assert resp.status_code == 200
        assert resp.json() == []


class TestMatchesEndpoint:
    def test_matches_returns_401_when_x_user_id_missing(self):
        """
        /matches/{user_id} returns 401 when the gateway-injected X-User-ID
        header is missing entirely (defensive — shouldn't happen behind the
        gateway, but this service must not trust an unauthenticated caller).
        """
        resp = client.get("/matches/user-no-profile")
        assert resp.status_code == 401

    def test_matches_returns_403_when_user_id_mismatch(self):
        """
        /matches/{user_id} returns 403 when the URL's user_id doesn't match
        the authenticated caller's X-User-ID header.
        """
        resp = client.get(
            "/matches/someone-elses-id",
            headers={"X-User-ID": "user-no-profile"},
        )
        assert resp.status_code == 403

    def test_matches_returns_404_when_no_profile(self):
        """
        /matches/{user_id} returns 404 when the user has no profile in the DB.
        """
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None  # no profile

        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
        mock_conn.cursor.return_value.__exit__.return_value = False

        with patch.object(matching_main, "get_db", return_value=mock_conn):
            resp = client.get(
                "/matches/user-no-profile",
                headers={"X-User-ID": "user-no-profile"},
            )
        assert resp.status_code == 404

    def test_matches_returns_list_for_known_user(self):
        """
        /matches/{user_id} returns a list when user profile exists and the
        X-User-ID header matches the requested user_id.

        After the embedding-cache refactor, _load_or_compute_user_embedding and
        _fetch_listing_details manage their own DB connections internally.  We
        mock both helpers directly so the handler wiring is tested without
        reimplementing their internal cursor sequences.
        """
        fake_embedding = [0.5] * 1536

        pinecone_results = {
            "matches": [
                {
                    "id": "listing-xyz",
                    "score": 0.88,
                    "metadata": {"university": "UT AUSTIN", "rent_cents": 130000, "bedrooms": 2},
                }
            ]
        }

        # _load_or_compute_user_embedding returns (embedding, vibe, university, max_rent, min_bed)
        loce_return = (fake_embedding, "quiet place near campus", "UT AUSTIN", 150000, 2)
        # _fetch_listing_details returns (scam_scores_dict, listing_details_dict)
        listing_detail = {
            "title": "Cozy 2BR near UT",
            "address": "123 Main St",
            "image_url": "https://example.com/photo.jpg",
            "available_from": "2026-05-15",
        }
        fetch_return = ({"listing-xyz": 0.1}, {"listing-xyz": listing_detail})

        with patch.object(matching_main, "_load_or_compute_user_embedding", return_value=loce_return):
            with patch.object(matching_main, "_fetch_listing_details", return_value=fetch_return):
                with patch.object(matching_main, "index") as mock_idx:
                    mock_idx.query.return_value = pinecone_results
                    resp = client.get(
                        "/matches/user-with-profile",
                        headers={"X-User-ID": "user-with-profile"},
                    )

        assert resp.status_code == 200
        results = resp.json()
        assert isinstance(results, list)
        assert results[0]["listing_id"] == "listing-xyz"
        assert results[0]["scam_score"] == 0.1
        assert results[0]["title"] == "Cozy 2BR near UT"
        assert results[0]["address"] == "123 Main St"
        assert results[0]["image_url"] == "https://example.com/photo.jpg"
        assert results[0]["available_from"] == "2026-05-15"

    def test_matches_includes_null_fields_when_listing_not_found(self):
        """
        If a Pinecone match's listing_id has no corresponding row in the
        listings table (e.g. deleted), title/address/image_url/available_from
        should be null rather than raising a KeyError.

        After the embedding-cache refactor we mock both helpers directly.
        """
        fake_embedding = [0.5] * 1536

        pinecone_results = {
            "matches": [
                {
                    "id": "listing-deleted",
                    "score": 0.5,
                    "metadata": {"university": "UT AUSTIN", "rent_cents": 130000, "bedrooms": 2},
                }
            ]
        }

        loce_return = (fake_embedding, "quiet place near campus", "UT AUSTIN", 150000, 2)
        # _fetch_listing_details returns empty dicts — the listing row was deleted
        fetch_return = ({}, {})

        with patch.object(matching_main, "_load_or_compute_user_embedding", return_value=loce_return):
            with patch.object(matching_main, "_fetch_listing_details", return_value=fetch_return):
                with patch.object(matching_main, "index") as mock_idx:
                    mock_idx.query.return_value = pinecone_results
                    resp = client.get(
                        "/matches/user-with-profile",
                        headers={"X-User-ID": "user-with-profile"},
                    )

        assert resp.status_code == 200
        results = resp.json()
        assert results[0]["title"] is None
        assert results[0]["address"] is None
        assert results[0]["image_url"] is None
        assert results[0]["available_from"] is None


class TestEmbedEndpoint:
    def test_embed_without_internal_header_returns_403(self):
        resp = client.post("/embed/listing-abc")
        assert resp.status_code == 403

    def test_embed_with_wrong_internal_header_value_returns_403(self):
        resp = client.post("/embed/listing-abc", headers={"X-Internal-Call": "false"})
        assert resp.status_code == 403

    def test_embed_with_internal_header_succeeds(self):
        with patch.object(matching_main, "embed_listing", new=MagicMock()) as mock_embed:
            async def _noop(*args, **kwargs):
                return None
            mock_embed.side_effect = _noop
            resp = client.post(
                "/embed/listing-abc",
                headers={"X-Internal-Call": "true"},
            )
        assert resp.status_code == 200
        assert resp.json() == {"listing_id": "listing-abc", "status": "embedded"}
