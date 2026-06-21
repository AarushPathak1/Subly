package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Fixtures ──────────────────────────────────────────────────────────────────

func cleanupSavedListing(t *testing.T, db *pgxpool.Pool, userID, listingID string) {
	t.Helper()
	t.Cleanup(func() {
		db.Exec(context.Background(), "DELETE FROM saved_listings WHERE user_id = $1 AND listing_id = $2", userID, listingID)
	})
}

// backfillNullableListingCols sets university_near and available_to on a
// listing seeded via seedTestListing (which leaves both NULL). handleListSaved
// scans both into non-nullable string fields — the same shape handleList/
// handleGet already use — so any test exercising that scan path needs
// non-NULL values here.
func backfillNullableListingCols(t *testing.T, db *pgxpool.Pool, listingID string) {
	t.Helper()
	if _, err := db.Exec(context.Background(),
		`UPDATE listings SET university_near = 'Test University', available_to = '2026-12-31' WHERE id = $1`, listingID); err != nil {
		t.Fatalf("backfillNullableListingCols: %v", err)
	}
}

// ── Unit tests (no DB) ────────────────────────────────────────────────────────

func TestHandleSaveListing_MissingUserID(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodPost, "/saved", bytes.NewBufferString(`{"listing_id":"some-id"}`))
	w := httptest.NewRecorder()
	s.handleSaveListing(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestHandleUnsaveListing_MissingUserID(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodDelete, "/saved/some-id", nil)
	req.SetPathValue("listing_id", "some-id")
	w := httptest.NewRecorder()
	s.handleUnsaveListing(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestHandleListSaved_MissingUserID(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodGet, "/saved", nil)
	w := httptest.NewRecorder()
	s.handleListSaved(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

// ── SaveListing ───────────────────────────────────────────────────────────────

func TestIntegration_SaveListing_Success(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	cleanupSavedListing(t, db, testUserID, listingID)
	s := &server{db: db}

	body := `{"listing_id":"` + listingID + `"}`
	req := httptest.NewRequest(http.MethodPost, "/saved", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleSaveListing(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["listing_id"] != listingID {
		t.Errorf("expected listing_id=%s, got %v", listingID, resp["listing_id"])
	}
	if resp["saved"] != true {
		t.Errorf("expected saved=true, got %v", resp["saved"])
	}

	var count int
	db.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM saved_listings WHERE user_id = $1 AND listing_id = $2`,
		testUserID, listingID,
	).Scan(&count)
	if count != 1 {
		t.Errorf("expected exactly 1 saved_listings row, got %d", count)
	}
}

func TestIntegration_SaveListing_IdempotentResave(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	cleanupSavedListing(t, db, testUserID, listingID)
	s := &server{db: db}

	makeReq := func() *httptest.ResponseRecorder {
		body := `{"listing_id":"` + listingID + `"}`
		req := httptest.NewRequest(http.MethodPost, "/saved", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-User-ID", testUserID)
		w := httptest.NewRecorder()
		s.handleSaveListing(w, req)
		return w
	}

	w1 := makeReq()
	if w1.Code != http.StatusCreated {
		t.Fatalf("expected 201 on first save, got %d: %s", w1.Code, w1.Body.String())
	}

	w2 := makeReq()
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200 on idempotent re-save, got %d: %s", w2.Code, w2.Body.String())
	}

	var count int
	db.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM saved_listings WHERE user_id = $1 AND listing_id = $2`,
		testUserID, listingID,
	).Scan(&count)
	if count != 1 {
		t.Errorf("expected exactly 1 row after idempotent re-save, got %d", count)
	}
}

// TestIntegration_SaveListing_ConcurrentDoubleSave races two goroutines
// saving the same listing for the same user — exactly one row must persist
// regardless of which request "wins".
func TestIntegration_SaveListing_ConcurrentDoubleSave(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	cleanupSavedListing(t, db, testUserID, listingID)
	s := &server{db: db}

	makeReq := func() *httptest.ResponseRecorder {
		body := `{"listing_id":"` + listingID + `"}`
		req := httptest.NewRequest(http.MethodPost, "/saved", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-User-ID", testUserID)
		w := httptest.NewRecorder()
		s.handleSaveListing(w, req)
		return w
	}

	results := make(chan *httptest.ResponseRecorder, 2)
	for i := 0; i < 2; i++ {
		go func() { results <- makeReq() }()
	}
	w1, w2 := <-results, <-results

	for _, w := range []*httptest.ResponseRecorder{w1, w2} {
		if w.Code != http.StatusCreated && w.Code != http.StatusOK {
			t.Errorf("expected 201 or 200, got %d: %s", w.Code, w.Body.String())
		}
	}

	var count int
	db.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM saved_listings WHERE user_id = $1 AND listing_id = $2`,
		testUserID, listingID,
	).Scan(&count)
	if count != 1 {
		t.Errorf("expected exactly 1 row to persist after concurrent saves, got %d", count)
	}
}

func TestIntegration_SaveListing_NotFound(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	s := &server{db: db}

	body := `{"listing_id":"00000000-0000-0000-0000-000000000099"}`
	req := httptest.NewRequest(http.MethodPost, "/saved", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleSaveListing(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleSaveListing_MissingBody(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodPost, "/saved", bytes.NewBufferString(`{}`))
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleSaveListing(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// ── UnsaveListing ─────────────────────────────────────────────────────────────

func TestIntegration_UnsaveListing_Success(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	db.Exec(context.Background(),
		`INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2)`, testUserID, listingID)
	cleanupSavedListing(t, db, testUserID, listingID)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodDelete, "/saved/"+listingID, nil)
	req.SetPathValue("listing_id", listingID)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleUnsaveListing(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", w.Code, w.Body.String())
	}

	var count int
	db.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM saved_listings WHERE user_id = $1 AND listing_id = $2`,
		testUserID, listingID,
	).Scan(&count)
	if count != 0 {
		t.Errorf("expected row to be deleted, got %d remaining", count)
	}
}

func TestIntegration_UnsaveListing_IdempotentWhenNotSaved(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodDelete, "/saved/"+listingID, nil)
	req.SetPathValue("listing_id", listingID)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleUnsaveListing(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("expected 204 (idempotent unsave-when-not-saved), got %d: %s", w.Code, w.Body.String())
	}
}

func TestIntegration_UnsaveListing_OnlyAffectsCallersOwnRow(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	seedSecondUser(t, db, testRenterID, "renter2@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)

	db.Exec(context.Background(),
		`INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2)`, testUserID, listingID)
	db.Exec(context.Background(),
		`INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2)`, testRenterID, listingID)
	cleanupSavedListing(t, db, testUserID, listingID)
	cleanupSavedListing(t, db, testRenterID, listingID)

	s := &server{db: db}

	req := httptest.NewRequest(http.MethodDelete, "/saved/"+listingID, nil)
	req.SetPathValue("listing_id", listingID)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleUnsaveListing(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", w.Code, w.Body.String())
	}

	var otherCount int
	db.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM saved_listings WHERE user_id = $1 AND listing_id = $2`,
		testRenterID, listingID,
	).Scan(&otherCount)
	if otherCount != 1 {
		t.Errorf("expected other user's saved row to remain untouched, got %d", otherCount)
	}

	var callerCount int
	db.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM saved_listings WHERE user_id = $1 AND listing_id = $2`,
		testUserID, listingID,
	).Scan(&callerCount)
	if callerCount != 0 {
		t.Errorf("expected caller's saved row to be deleted, got %d", callerCount)
	}
}

func TestIntegration_UnsaveListing_MalformedListingID(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodDelete, "/saved/not-a-uuid", nil)
	req.SetPathValue("listing_id", "not-a-uuid")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleUnsaveListing(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for malformed listing_id, got %d: %s", w.Code, w.Body.String())
	}
}

// ── ListSaved ─────────────────────────────────────────────────────────────────

func TestIntegration_ListSaved_Empty(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/saved", nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleListSaved(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var saved []SavedListing
	if err := json.NewDecoder(w.Body).Decode(&saved); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if saved == nil {
		t.Error("expected empty array, not null")
	}
}

func TestIntegration_ListSaved_OrderedByRecencyAndIncludesSavedAt(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingA := seedTestListing(t, db, testListerID, 100000)
	listingB := seedTestListing(t, db, testListerID, 200000)
	backfillNullableListingCols(t, db, listingA)
	backfillNullableListingCols(t, db, listingB)

	db.Exec(context.Background(),
		`INSERT INTO saved_listings (user_id, listing_id, created_at) VALUES ($1, $2, NOW() - interval '1 hour')`,
		testUserID, listingA)
	db.Exec(context.Background(),
		`INSERT INTO saved_listings (user_id, listing_id, created_at) VALUES ($1, $2, NOW())`,
		testUserID, listingB)
	cleanupSavedListing(t, db, testUserID, listingA)
	cleanupSavedListing(t, db, testUserID, listingB)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/saved", nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleListSaved(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var saved []SavedListing
	json.NewDecoder(w.Body).Decode(&saved)

	if len(saved) != 2 {
		t.Fatalf("expected 2 saved listings, got %d", len(saved))
	}
	if saved[0].ID != listingB || saved[1].ID != listingA {
		t.Errorf("expected newest-first order [B, A], got [%s, %s]", saved[0].ID, saved[1].ID)
	}
	if saved[0].SavedAt.IsZero() {
		t.Error("expected saved_at to be populated")
	}
}

func TestIntegration_ListSaved_HidesOtherUsersSaves(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	seedSecondUser(t, db, testRenterID, "renter2@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)

	db.Exec(context.Background(),
		`INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2)`, testRenterID, listingID)
	cleanupSavedListing(t, db, testRenterID, listingID)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/saved", nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleListSaved(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var saved []SavedListing
	json.NewDecoder(w.Body).Decode(&saved)
	for _, sl := range saved {
		if sl.ID == listingID {
			t.Error("expected another user's saved listing to be hidden")
		}
	}
}

func TestIntegration_ListSaved_RedactsScamScoreForNonOwnedListings(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	backfillNullableListingCols(t, db, listingID)
	db.Exec(context.Background(), `UPDATE listings SET scam_score = 0.9 WHERE id = $1`, listingID)

	db.Exec(context.Background(),
		`INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2)`, testUserID, listingID)
	cleanupSavedListing(t, db, testUserID, listingID)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/saved", nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleListSaved(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var saved []SavedListing
	json.NewDecoder(w.Body).Decode(&saved)

	found := false
	for _, sl := range saved {
		if sl.ID == listingID {
			found = true
			if sl.ScamScore != 0 {
				t.Errorf("expected scam_score redacted to 0 for non-owned listing, got %v", sl.ScamScore)
			}
		}
	}
	if !found {
		t.Error("expected saved listing to appear in list")
	}
}

func TestIntegration_ListSaved_DoesNotRedactScamScoreForOwnedListing(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	listingID := seedTestListing(t, db, testUserID, 120000)
	backfillNullableListingCols(t, db, listingID)
	db.Exec(context.Background(), `UPDATE listings SET scam_score = 0.9 WHERE id = $1`, listingID)

	db.Exec(context.Background(),
		`INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2)`, testUserID, listingID)
	cleanupSavedListing(t, db, testUserID, listingID)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/saved", nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleListSaved(w, req)

	var saved []SavedListing
	json.NewDecoder(w.Body).Decode(&saved)

	found := false
	for _, sl := range saved {
		if sl.ID == listingID {
			found = true
			if sl.ScamScore != 0.9 {
				t.Errorf("expected scam_score visible for owned listing, got %v", sl.ScamScore)
			}
		}
	}
	if !found {
		t.Error("expected saved listing to appear in list")
	}
}

// ── Cascade deletes ───────────────────────────────────────────────────────────

func TestIntegration_SavedListings_CascadeOnListingDelete(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)

	db.Exec(context.Background(),
		`INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2)`, testUserID, listingID)

	db.Exec(context.Background(), `DELETE FROM listings WHERE id = $1`, listingID)

	var count int
	db.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM saved_listings WHERE listing_id = $1`, listingID,
	).Scan(&count)
	if count != 0 {
		t.Errorf("expected saved_listings row to cascade-delete when listing is deleted, got %d remaining", count)
	}
}

func TestIntegration_SavedListings_CascadeOnUserDelete(t *testing.T) {
	db := requireDB(t)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	seedSecondUser(t, db, testRenterID, "renter2@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)

	db.Exec(context.Background(),
		`INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2)`, testRenterID, listingID)

	db.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, testRenterID)

	var count int
	db.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM saved_listings WHERE user_id = $1`, testRenterID,
	).Scan(&count)
	if count != 0 {
		t.Errorf("expected saved_listings row to cascade-delete when user is deleted, got %d remaining", count)
	}
}
