package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

// ── Unit tests (no DB) ────────────────────────────────────────────────────────

func TestHandleGet_MissingUserID(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodGet, "/listings/some-id", nil)
	req.SetPathValue("id", "some-id")
	w := httptest.NewRecorder()
	s.handleGet(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func getListing(t *testing.T, s *server, listingID, userID string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/listings/"+listingID, nil)
	req.SetPathValue("id", listingID)
	req.Header.Set("X-User-ID", userID)
	w := httptest.NewRecorder()
	s.handleGet(w, req)
	return w
}

// ── Increment behavior ────────────────────────────────────────────────────────

func TestIntegration_GetListing_NonOwnerIncrementsViewCount(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	s := &server{db: db}

	w1 := getListing(t, s, listingID, testUserID)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w1.Code, w1.Body.String())
	}
	var got1 Listing
	json.NewDecoder(w1.Body).Decode(&got1)
	if got1.ViewCount != 1 {
		t.Errorf("expected view_count=1 after first non-owner view, got %d", got1.ViewCount)
	}

	w2 := getListing(t, s, listingID, testUserID)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w2.Code, w2.Body.String())
	}
	var got2 Listing
	json.NewDecoder(w2.Body).Decode(&got2)
	if got2.ViewCount != 2 {
		t.Errorf("expected view_count=2 after second non-owner view, got %d", got2.ViewCount)
	}
}

func TestIntegration_GetListing_OwnerDoesNotIncrementViewCount(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	listingID := seedTestListing(t, db, testUserID, 120000)
	s := &server{db: db}

	for i := 0; i < 3; i++ {
		w := getListing(t, s, listingID, testUserID)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var got Listing
		json.NewDecoder(w.Body).Decode(&got)
		if got.ViewCount != 0 {
			t.Errorf("expected view_count=0 for owner view #%d, got %d", i+1, got.ViewCount)
		}
	}

	var dbViewCount int
	db.QueryRow(context.Background(), `SELECT view_count FROM listings WHERE id = $1`, listingID).Scan(&dbViewCount)
	if dbViewCount != 0 {
		t.Errorf("expected DB view_count=0 after owner-only views, got %d", dbViewCount)
	}
}

func TestIntegration_GetListing_DraftStatus_NonOwnerDoesNotIncrement(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	db.Exec(context.Background(), `UPDATE listings SET status = 'draft' WHERE id = $1`, listingID)
	s := &server{db: db}

	w := getListing(t, s, listingID, testUserID)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var got Listing
	json.NewDecoder(w.Body).Decode(&got)
	if got.ViewCount != 0 {
		t.Errorf("expected view_count=0 for draft listing viewed by non-owner, got %d", got.ViewCount)
	}
}

func TestIntegration_GetListing_ExpiredStatus_NonOwnerDoesNotIncrement(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	db.Exec(context.Background(), `UPDATE listings SET status = 'expired' WHERE id = $1`, listingID)
	s := &server{db: db}

	w := getListing(t, s, listingID, testUserID)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var got Listing
	json.NewDecoder(w.Body).Decode(&got)
	if got.ViewCount != 0 {
		t.Errorf("expected view_count=0 for expired listing viewed by non-owner, got %d", got.ViewCount)
	}
}

func TestIntegration_GetListing_PausedStatus_NonOwnerIncrements(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	db.Exec(context.Background(), `UPDATE listings SET status = 'paused' WHERE id = $1`, listingID)
	s := &server{db: db}

	w := getListing(t, s, listingID, testUserID)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var got Listing
	json.NewDecoder(w.Body).Decode(&got)
	if got.ViewCount != 1 {
		t.Errorf("expected view_count=1 for paused listing viewed by non-owner, got %d", got.ViewCount)
	}
}

func TestIntegration_GetListing_LeasedStatus_NonOwnerIncrements(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	db.Exec(context.Background(), `UPDATE listings SET status = 'leased' WHERE id = $1`, listingID)
	s := &server{db: db}

	w := getListing(t, s, listingID, testUserID)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var got Listing
	json.NewDecoder(w.Body).Decode(&got)
	if got.ViewCount != 1 {
		t.Errorf("expected view_count=1 for leased listing viewed by non-owner, got %d", got.ViewCount)
	}
}

func TestIntegration_GetListing_NotFound(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	s := &server{db: db}

	w := getListing(t, s, "00000000-0000-0000-0000-000000000099", testUserID)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for nonexistent listing, got %d: %s", w.Code, w.Body.String())
	}
}

// ── handleList / handleListSaved expose view_count ────────────────────────────

func TestIntegration_ListListings_IncludesViewCount(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	listingID := seedTestListing(t, db, testUserID, 100000)
	db.Exec(context.Background(), `UPDATE listings SET view_count = 7 WHERE id = $1`, listingID)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/listings", nil)
	w := httptest.NewRecorder()
	s.handleList(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var listings []Listing
	json.NewDecoder(w.Body).Decode(&listings)

	found := false
	for _, l := range listings {
		if l.ID == listingID {
			found = true
			if l.ViewCount != 7 {
				t.Errorf("expected view_count=7 in handleList response, got %d", l.ViewCount)
			}
		}
	}
	if !found {
		t.Fatalf("expected seeded listing %s to appear in list", listingID)
	}
}

// TestIntegration_ListListings_ByUserID_OwnListings_IncludesViewCount exercises
// the `?user_id=` "own listings" branch of handleList (a separate SQL string
// from the default active-only listing), to confirm view_count made it into
// that query's SELECT/Scan too, not just the unfiltered listing branch.
func TestIntegration_ListListings_ByUserID_OwnListings_IncludesViewCount(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	listingID := seedTestListing(t, db, testUserID, 100000)
	db.Exec(context.Background(), `UPDATE listings SET status = 'draft', view_count = 3 WHERE id = $1`, listingID)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/listings?user_id="+testUserID, nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleList(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var listings []Listing
	json.NewDecoder(w.Body).Decode(&listings)

	found := false
	for _, l := range listings {
		if l.ID == listingID {
			found = true
			if l.ViewCount != 3 {
				t.Errorf("expected view_count=3 in own-listings branch, got %d", l.ViewCount)
			}
		}
	}
	if !found {
		t.Fatalf("expected own draft listing %s to appear via ?user_id= (owner view)", listingID)
	}
}

// TestIntegration_ListListings_ByUserID_PublicProfile_IncludesViewCount
// exercises the third SQL branch in handleList: a different non-owner
// viewing a lister's public profile listings (`?user_id=X` with a different
// X-User-ID). This branch filters to status='active' only.
func TestIntegration_ListListings_ByUserID_PublicProfile_IncludesViewCount(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister-public@university.edu")
	listingID := seedTestListing(t, db, testListerID, 100000)
	db.Exec(context.Background(), `UPDATE listings SET view_count = 9 WHERE id = $1`, listingID)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/listings?user_id="+testListerID, nil)
	req.Header.Set("X-User-ID", testUserID) // different from testListerID -> public branch
	w := httptest.NewRecorder()
	s.handleList(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var listings []Listing
	json.NewDecoder(w.Body).Decode(&listings)

	found := false
	for _, l := range listings {
		if l.ID == listingID {
			found = true
			if l.ViewCount != 9 {
				t.Errorf("expected view_count=9 in public-profile branch, got %d", l.ViewCount)
			}
		}
	}
	if !found {
		t.Fatalf("expected active listing %s to appear via public profile view", listingID)
	}
}

func TestIntegration_ListSaved_IncludesViewCount(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	db.Exec(context.Background(), `UPDATE listings SET view_count = 4 WHERE id = $1`, listingID)

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
			if sl.ViewCount != 4 {
				t.Errorf("expected view_count=4 in handleListSaved response, got %d", sl.ViewCount)
			}
		}
	}
	if !found {
		t.Fatalf("expected saved listing %s to appear in list", listingID)
	}
}

// ── Concurrency ───────────────────────────────────────────────────────────────

// TestIntegration_GetListing_ConcurrentNonOwnerViews_NoLostUpdates fires 10
// concurrent non-owner GET requests at the same listing and asserts the final
// DB value is exactly 10 — proving the conditional UPDATE in the CTE is
// atomic and not vulnerable to a lost-update race.
func TestIntegration_GetListing_ConcurrentNonOwnerViews_NoLostUpdates(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	s := &server{db: db}

	const attempts = 10
	var wg sync.WaitGroup
	codes := make([]int, attempts)
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			w := getListing(t, s, listingID, testUserID)
			codes[i] = w.Code
		}(i)
	}
	wg.Wait()

	for _, c := range codes {
		if c != http.StatusOK {
			t.Errorf("expected all concurrent views to succeed with 200, got %d", c)
		}
	}

	var finalCount int
	err := db.QueryRow(context.Background(), `SELECT view_count FROM listings WHERE id = $1`, listingID).Scan(&finalCount)
	if err != nil {
		t.Fatalf("could not read final view_count: %v", err)
	}
	if finalCount != attempts {
		t.Errorf("expected final view_count=%d after %d concurrent non-owner views, got %d", attempts, attempts, finalCount)
	}
}

// TestIntegration_GetListing_ConcurrentNonOwnerViews_Stress50 repeats the
// above at higher concurrency (50 goroutines) as additional confidence that
// the CTE-based conditional UPDATE has no lost-update window under heavier
// contention than the baseline test exercises.
func TestIntegration_GetListing_ConcurrentNonOwnerViews_Stress50(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister-stress@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	s := &server{db: db}

	const attempts = 50
	var wg sync.WaitGroup
	codes := make([]int, attempts)
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			w := getListing(t, s, listingID, testUserID)
			codes[i] = w.Code
		}(i)
	}
	wg.Wait()

	for _, c := range codes {
		if c != http.StatusOK {
			t.Errorf("expected all concurrent views to succeed with 200, got %d", c)
		}
	}

	var finalCount int
	if err := db.QueryRow(context.Background(), `SELECT view_count FROM listings WHERE id = $1`, listingID).Scan(&finalCount); err != nil {
		t.Fatalf("could not read final view_count: %v", err)
	}
	if finalCount != attempts {
		t.Errorf("expected final view_count=%d after %d concurrent non-owner views, got %d", attempts, attempts, finalCount)
	}
}

// TestIntegration_GetListing_ResponseMatchesSingleRow guards against the CTE
// / UNION ALL query ever surfacing more than one row to pgx's QueryRow (which
// silently takes the first row and ignores the rest — a regression here
// could mask a bug where the bumped and fallback branches both fire). It
// verifies the row scanned back by the handler exactly matches the
// view_count durably persisted, for both the bump and no-bump branches.
func TestIntegration_GetListing_ResponseMatchesSingleRow(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister-singlerow@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	s := &server{db: db}

	// Non-owner branch: bumped row must match DB exactly.
	w := getListing(t, s, listingID, testUserID)
	var got Listing
	json.NewDecoder(w.Body).Decode(&got)
	var dbCount int
	db.QueryRow(context.Background(), `SELECT view_count FROM listings WHERE id = $1`, listingID).Scan(&dbCount)
	if got.ViewCount != dbCount {
		t.Errorf("response view_count=%d does not match DB view_count=%d (bump branch)", got.ViewCount, dbCount)
	}

	// Owner branch: fallback row must also match DB exactly (no phantom bump).
	wOwner := getListing(t, s, listingID, testListerID)
	var gotOwner Listing
	json.NewDecoder(wOwner.Body).Decode(&gotOwner)
	db.QueryRow(context.Background(), `SELECT view_count FROM listings WHERE id = $1`, listingID).Scan(&dbCount)
	if gotOwner.ViewCount != dbCount {
		t.Errorf("response view_count=%d does not match DB view_count=%d (fallback branch)", gotOwner.ViewCount, dbCount)
	}
}
