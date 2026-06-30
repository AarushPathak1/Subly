package main

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// ── Fix 3 (handleUpdate 401) — unit test, no DB required ─────────────────────

// TestHandleUpdate_MissingUserID_Returns401 confirms the early-return added
// in Fix 3: when X-User-ID is absent from the request, handleUpdate must
// immediately return 401 without hitting the database.
func TestHandleUpdate_MissingUserID_Returns401(t *testing.T) {
	s := &server{} // no DB needed — auth check fires before any DB access
	body := `{"title":"Should Not Matter"}`
	req := httptest.NewRequest(http.MethodPatch, "/listings/some-listing-id", bytes.NewBufferString(body))
	req.SetPathValue("id", "some-listing-id")
	// Deliberately omit the X-User-ID header
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.handleUpdate(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 when X-User-ID is absent from handleUpdate, got %d: %s", w.Code, w.Body.String())
	}
}

// TestHandleUpdate_EmptyUserID_Returns401 is the same test but sends an
// explicit empty string header value, which must also be rejected.
func TestHandleUpdate_EmptyUserID_Returns401(t *testing.T) {
	s := &server{}
	body := `{"title":"Also Should Not Matter"}`
	req := httptest.NewRequest(http.MethodPatch, "/listings/some-id", bytes.NewBufferString(body))
	req.SetPathValue("id", "some-id")
	req.Header.Set("X-User-ID", "") // explicit empty value
	w := httptest.NewRecorder()
	s.handleUpdate(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for empty X-User-ID on handleUpdate, got %d: %s", w.Code, w.Body.String())
	}
}

// ── Fix 2 (handleGet draft/expired visibility) — integration tests ────────────
//
// These tests require a live database and are skipped when DATABASE_URL is
// not set.

// TestIntegration_HandleGet_NonOwner_DraftListing_Returns404 verifies Fix 2:
// a caller who is NOT the listing owner must receive 404 when the listing's
// status is "draft".
func TestIntegration_HandleGet_NonOwner_DraftListing_Returns404(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)                                             // testUserID — the NON-owner
	seedSecondUser(t, db, testListerID, "lister@university.edu")    // testListerID — the owner
	listingID := seedTestListing(t, db, testListerID, 120000)

	// Ensure listing is in "draft" status
	db.Exec(context.Background(), `UPDATE listings SET status = 'draft' WHERE id = $1`, listingID)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/listings/"+listingID, nil)
	req.SetPathValue("id", listingID)
	req.Header.Set("X-User-ID", testUserID) // non-owner caller
	w := httptest.NewRecorder()
	s.handleGet(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for non-owner requesting a draft listing, got %d: %s", w.Code, w.Body.String())
	}
}

// TestIntegration_HandleGet_NonOwner_ExpiredListing_Returns404 verifies Fix 2:
// a non-owner caller must receive 404 when the listing status is "expired".
func TestIntegration_HandleGet_NonOwner_ExpiredListing_Returns404(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)

	db.Exec(context.Background(), `UPDATE listings SET status = 'expired' WHERE id = $1`, listingID)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/listings/"+listingID, nil)
	req.SetPathValue("id", listingID)
	req.Header.Set("X-User-ID", testUserID) // non-owner caller
	w := httptest.NewRecorder()
	s.handleGet(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for non-owner requesting an expired listing, got %d: %s", w.Code, w.Body.String())
	}
}

// TestIntegration_HandleGet_Owner_DraftListing_Returns200 confirms Fix 2 does
// NOT block the owner from viewing their own draft listing.
func TestIntegration_HandleGet_Owner_DraftListing_Returns200(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)                                          // testUserID — also the owner here
	listingID := seedTestListing(t, db, testUserID, 120000)

	db.Exec(context.Background(), `UPDATE listings SET status = 'draft' WHERE id = $1`, listingID)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/listings/"+listingID, nil)
	req.SetPathValue("id", listingID)
	req.Header.Set("X-User-ID", testUserID) // owner requesting their own draft
	w := httptest.NewRecorder()
	s.handleGet(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 for owner requesting their own draft listing, got %d: %s", w.Code, w.Body.String())
	}
}

// TestIntegration_HandleGet_Owner_ExpiredListing_Returns200 confirms an owner
// can still view their own expired listing (Fix 2 only blocks non-owners).
func TestIntegration_HandleGet_Owner_ExpiredListing_Returns200(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	listingID := seedTestListing(t, db, testUserID, 120000)

	db.Exec(context.Background(), `UPDATE listings SET status = 'expired' WHERE id = $1`, listingID)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/listings/"+listingID, nil)
	req.SetPathValue("id", listingID)
	req.Header.Set("X-User-ID", testUserID) // owner
	w := httptest.NewRecorder()
	s.handleGet(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 for owner requesting their own expired listing, got %d: %s", w.Code, w.Body.String())
	}
}

// TestIntegration_HandleGet_NonOwner_ActiveListing_Returns200 guards against
// Fix 2 over-blocking: active listings must still be visible to non-owners.
func TestIntegration_HandleGet_NonOwner_ActiveListing_Returns200(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)

	// seedTestListing creates with status='active' — no UPDATE needed
	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/listings/"+listingID, nil)
	req.SetPathValue("id", listingID)
	req.Header.Set("X-User-ID", testUserID) // non-owner
	w := httptest.NewRecorder()
	s.handleGet(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 for non-owner requesting an active listing, got %d: %s", w.Code, w.Body.String())
	}
}

// TestIntegration_HandleUpdate_OwnershipEnforced confirms Fix 3's WHERE clause:
// a PATCH from a different user must not mutate the listing (404 or ownership
// mismatch) because the WHERE clause now unconditionally appends AND user_id=$N.
func TestIntegration_HandleUpdate_OwnershipEnforced(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)

	s := &server{db: db}
	body := `{"title":"Hijacked Title"}`
	req := httptest.NewRequest(http.MethodPatch, "/listings/"+listingID, bytes.NewBufferString(body))
	req.SetPathValue("id", listingID)
	req.Header.Set("X-User-ID", testUserID) // NOT the owner
	w := httptest.NewRecorder()
	s.handleUpdate(w, req)

	// Must not succeed (the listing belongs to testListerID, not testUserID)
	if w.Code == http.StatusOK {
		t.Errorf("expected non-200 when a non-owner tries to update a listing, got %d", w.Code)
	}
}
