package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Fixtures ──────────────────────────────────────────────────────────────────

func seedConfirmedConversation(t *testing.T, db *pgxpool.Pool, listingID, renterID, listerID string, rentCents int) string {
	t.Helper()
	convID := seedTestConversation(t, db, listingID, renterID, listerID, rentCents)
	_, err := db.Exec(context.Background(),
		`UPDATE conversations SET confirmed_at = NOW() WHERE id = $1`, convID)
	if err != nil {
		t.Fatalf("seedConfirmedConversation: %v", err)
	}
	return convID
}

func cleanupReview(t *testing.T, db *pgxpool.Pool, id string) {
	t.Helper()
	t.Cleanup(func() {
		db.Exec(context.Background(), "DELETE FROM reviews WHERE id = $1", id)
	})
}

// ── CreateReview ──────────────────────────────────────────────────────────────

func TestIntegration_CreateReview_Success(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	body := `{"conversation_id":"` + convID + `","rating":5,"body":"Great experience!"}`
	req := httptest.NewRequest(http.MethodPost, "/reviews", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreateReview(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["id"] == "" {
		t.Fatal("expected review ID in response")
	}
	cleanupReview(t, db, resp["id"])

	var rating int
	var reviewBody, reviewerID, listingIDCol string
	err := db.QueryRow(context.Background(),
		`SELECT rating, body, reviewer_id, listing_id FROM reviews WHERE id = $1`, resp["id"],
	).Scan(&rating, &reviewBody, &reviewerID, &listingIDCol)
	if err != nil {
		t.Fatalf("could not query review: %v", err)
	}
	if rating != 5 {
		t.Errorf("expected rating=5, got %d", rating)
	}
	if reviewBody != "Great experience!" {
		t.Errorf("expected body, got %q", reviewBody)
	}
	if reviewerID != testUserID {
		t.Errorf("expected reviewer_id=%s, got %s", testUserID, reviewerID)
	}
	if listingIDCol != listingID {
		t.Errorf("expected listing_id=%s, got %s", listingID, listingIDCol)
	}
}

func TestIntegration_CreateReview_NotConfirmed(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	body := `{"conversation_id":"` + convID + `","rating":5,"body":"Great!"}`
	req := httptest.NewRequest(http.MethodPost, "/reviews", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreateReview(w, req)

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "conversation_not_confirmed" {
		t.Errorf("expected error=conversation_not_confirmed, got %q", resp["error"])
	}
}

func TestIntegration_CreateReview_NotRenter(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	body := `{"conversation_id":"` + convID + `","rating":5,"body":"Great!"}`
	req := httptest.NewRequest(http.MethodPost, "/reviews", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testListerID) // lister tries to review
	w := httptest.NewRecorder()
	s.handleCreateReview(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

func TestIntegration_CreateReview_Duplicate(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	makeReq := func() *httptest.ResponseRecorder {
		body := `{"conversation_id":"` + convID + `","rating":4,"body":"Nice"}`
		req := httptest.NewRequest(http.MethodPost, "/reviews", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-User-ID", testUserID)
		w := httptest.NewRecorder()
		s.handleCreateReview(w, req)
		return w
	}

	w1 := makeReq()
	if w1.Code != http.StatusCreated {
		t.Fatalf("expected 201 on first review, got %d: %s", w1.Code, w1.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w1.Body).Decode(&resp)
	cleanupReview(t, db, resp["id"])

	w2 := makeReq()
	if w2.Code != http.StatusConflict {
		t.Errorf("expected 409 on duplicate review, got %d: %s", w2.Code, w2.Body.String())
	}
	var resp2 map[string]string
	json.NewDecoder(w2.Body).Decode(&resp2)
	if resp2["error"] != "already_reviewed" {
		t.Errorf("expected error=already_reviewed, got %q", resp2["error"])
	}
}

// TestIntegration_CreateReview_ConcurrentDuplicate exercises the real Postgres
// unique-constraint violation path (not just a re-request after the first
// completes) — two goroutines race to insert the same (reviewer_id,
// conversation_id) pair. Exactly one must win with 201; the other must be
// mapped to 409 already_reviewed by isUniqueViolation against the *actual*
// pgx error text, not a fabricated one.
func TestIntegration_CreateReview_ConcurrentDuplicate(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	makeReq := func() *httptest.ResponseRecorder {
		body := `{"conversation_id":"` + convID + `","rating":4,"body":"Racing"}`
		req := httptest.NewRequest(http.MethodPost, "/reviews", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-User-ID", testUserID)
		w := httptest.NewRecorder()
		s.handleCreateReview(w, req)
		return w
	}

	results := make(chan *httptest.ResponseRecorder, 2)
	for i := 0; i < 2; i++ {
		go func() { results <- makeReq() }()
	}
	w1, w2 := <-results, <-results

	codes := []int{w1.Code, w2.Code}
	created, conflict := 0, 0
	for _, c := range codes {
		if c == http.StatusCreated {
			created++
		} else if c == http.StatusConflict {
			conflict++
		}
	}
	if created != 1 || conflict != 1 {
		t.Fatalf("expected exactly one 201 and one 409, got codes=%v (bodies: %s | %s)", codes, w1.Body.String(), w2.Body.String())
	}

	// Clean up whichever one succeeded.
	for _, w := range []*httptest.ResponseRecorder{w1, w2} {
		if w.Code == http.StatusCreated {
			var resp map[string]string
			json.NewDecoder(w.Body).Decode(&resp)
			cleanupReview(t, db, resp["id"])
		}
	}

	var count int
	db.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM reviews WHERE reviewer_id = $1 AND conversation_id = $2`,
		testUserID, convID,
	).Scan(&count)
	if count != 1 {
		t.Errorf("expected exactly 1 review row to persist, got %d", count)
	}
}

func TestIntegration_CreateReview_InvalidRating(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	for _, rating := range []int{0, 6} {
		body := fmt.Sprintf(`{"conversation_id":%q,"rating":%d,"body":"x"}`, convID, rating)
		req := httptest.NewRequest(http.MethodPost, "/reviews", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-User-ID", testUserID)
		w := httptest.NewRecorder()
		s.handleCreateReview(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("rating=%d: expected 400, got %d: %s", rating, w.Code, w.Body.String())
		}
	}
}

func TestIntegration_CreateReview_BodyTooLong(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	longBody := make([]rune, 1001)
	for i := range longBody {
		longBody[i] = 'a'
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"conversation_id": convID,
		"rating":          5,
		"body":            string(longBody),
	})
	req := httptest.NewRequest(http.MethodPost, "/reviews", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreateReview(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for body too long, got %d: %s", w.Code, w.Body.String())
	}
}

func TestIntegration_CreateReview_ConversationNotFound(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	s := &server{db: db}

	body := `{"conversation_id":"00000000-0000-0000-0000-000000000099","rating":5,"body":"x"}`
	req := httptest.NewRequest(http.MethodPost, "/reviews", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreateReview(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleCreateReview_MissingUserID(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodPost, "/reviews", bytes.NewBufferString(`{}`))
	w := httptest.NewRecorder()
	s.handleCreateReview(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

// ── ReviewEligibility ─────────────────────────────────────────────────────────

func TestIntegration_ReviewEligibility_Eligible(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/reviews/eligibility?conversation_id="+convID, nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleReviewEligibility(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp ReviewEligibility
	json.NewDecoder(w.Body).Decode(&resp)
	if !resp.Eligible || resp.AlreadyReviewed {
		t.Errorf("expected eligible=true, already_reviewed=false, got %+v", resp)
	}
}

func TestIntegration_ReviewEligibility_AlreadyReviewed(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	var reviewID string
	err := db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body)
		 VALUES ($1, $2, $3, 5, 'great') RETURNING id`,
		testUserID, convID, listingID,
	).Scan(&reviewID)
	if err != nil {
		t.Fatalf("could not seed review: %v", err)
	}
	cleanupReview(t, db, reviewID)

	req := httptest.NewRequest(http.MethodGet, "/reviews/eligibility?conversation_id="+convID, nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleReviewEligibility(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp ReviewEligibility
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Eligible || !resp.AlreadyReviewed || resp.Reason != "already_reviewed" {
		t.Errorf("expected already_reviewed reason, got %+v", resp)
	}
}

func TestIntegration_ReviewEligibility_NotConfirmed(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/reviews/eligibility?conversation_id="+convID, nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleReviewEligibility(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp ReviewEligibility
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Eligible || resp.Reason != "not_confirmed" {
		t.Errorf("expected reason=not_confirmed, got %+v", resp)
	}
}

func TestIntegration_ReviewEligibility_NotRenter(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/reviews/eligibility?conversation_id="+convID, nil)
	req.Header.Set("X-User-ID", testListerID) // lister, not renter
	w := httptest.NewRecorder()
	s.handleReviewEligibility(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp ReviewEligibility
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Eligible || resp.Reason != "not_renter" {
		t.Errorf("expected reason=not_renter, got %+v", resp)
	}
}

func TestIntegration_ReviewEligibility_NotFound(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/reviews/eligibility?conversation_id=00000000-0000-0000-0000-000000000099", nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleReviewEligibility(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 (never 404), got %d: %s", w.Code, w.Body.String())
	}
	var resp ReviewEligibility
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Eligible || resp.Reason != "not_found" {
		t.Errorf("expected reason=not_found, got %+v", resp)
	}
}

func TestHandleReviewEligibility_MissingUserID(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodGet, "/reviews/eligibility?conversation_id=abc", nil)
	w := httptest.NewRecorder()
	s.handleReviewEligibility(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestHandleReviewEligibility_MissingConversationID(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodGet, "/reviews/eligibility", nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleReviewEligibility(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// ── ListPublicReviews ─────────────────────────────────────────────────────────

func TestIntegration_ListPublicReviews_Empty(t *testing.T) {
	db := requireDB(t)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/reviews", nil)
	w := httptest.NewRecorder()
	s.handleListPublicReviews(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var reviews []PublicReview
	if err := json.NewDecoder(w.Body).Decode(&reviews); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if reviews == nil {
		t.Error("expected empty array, not null")
	}
}

func TestIntegration_ListPublicReviews_FiltersUnpublishedAndEmptyBody(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)

	var publishedID, unpublishedID, emptyBodyID string
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 5, 'A wonderful experience', true) RETURNING id`,
		testUserID, convID, listingID,
	).Scan(&publishedID)
	cleanupReview(t, db, publishedID)

	seedSecondUser(t, db, testRenterID, "renter2@university.edu")
	listingID2 := seedTestListing(t, db, testListerID, 120000)
	convID2 := seedConfirmedConversation(t, db, listingID2, testRenterID, testListerID, 120000)
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 5, 'Should not show up', false) RETURNING id`,
		testRenterID, convID2, listingID2,
	).Scan(&unpublishedID)
	cleanupReview(t, db, unpublishedID)

	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 4, '', true) RETURNING id`,
		testRenterID, convID2, listingID2,
	).Scan(&emptyBodyID)
	cleanupReview(t, db, emptyBodyID)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/reviews", nil)
	w := httptest.NewRecorder()
	s.handleListPublicReviews(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var reviews []PublicReview
	json.NewDecoder(w.Body).Decode(&reviews)
	for _, rv := range reviews {
		if rv.ID == unpublishedID {
			t.Error("unpublished review should not appear")
		}
		if rv.ID == emptyBodyID {
			t.Error("empty-body review should not appear")
		}
	}
	found := false
	for _, rv := range reviews {
		if rv.ID == publishedID {
			found = true
		}
	}
	if !found {
		t.Error("expected published review with body to appear")
	}
}

func TestIntegration_ListPublicReviews_LimitClamping(t *testing.T) {
	db := requireDB(t)
	s := &server{db: db}

	// Invalid limit falls back to default (6); we cannot easily assert the
	// exact default count without seeding 6+ reviews, so assert no error and
	// that an oversized limit value does not crash the handler.
	req := httptest.NewRequest(http.MethodGet, "/reviews?limit=abc", nil)
	w := httptest.NewRecorder()
	s.handleListPublicReviews(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 for invalid limit, got %d", w.Code)
	}

	req2 := httptest.NewRequest(http.MethodGet, "/reviews?limit=9999", nil)
	w2 := httptest.NewRecorder()
	s.handleListPublicReviews(w2, req2)
	if w2.Code != http.StatusOK {
		t.Errorf("expected 200 for huge limit, got %d", w2.Code)
	}
}

// TestIntegration_ListPublicReviews_LimitActuallyClamps seeds more than 24
// published reviews and asserts that an oversized ?limit= value is clamped to
// 24 (not honored verbatim), and that a small explicit limit is respected.
func TestIntegration_ListPublicReviews_LimitActuallyClamps(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)

	const seedCount = 26
	for i := 0; i < seedCount; i++ {
		renterID := fmt.Sprintf("00000000-0000-0000-0000-0000000001%02d", i)
		seedSecondUser(t, db, renterID, fmt.Sprintf("renter%d@university.edu", i))
		convID := seedConfirmedConversation(t, db, listingID, renterID, testListerID, 120000)
		var reviewID string
		db.QueryRow(context.Background(),
			`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
			 VALUES ($1, $2, $3, 5, $4, true) RETURNING id`,
			renterID, convID, listingID, fmt.Sprintf("Review number %d", i),
		).Scan(&reviewID)
		cleanupReview(t, db, reviewID)
	}

	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/reviews?limit=9999", nil)
	w := httptest.NewRecorder()
	s.handleListPublicReviews(w, req)
	var reviews []PublicReview
	json.NewDecoder(w.Body).Decode(&reviews)
	if len(reviews) != 24 {
		t.Errorf("expected oversized limit to clamp to 24, got %d reviews", len(reviews))
	}

	req2 := httptest.NewRequest(http.MethodGet, "/reviews?limit=3", nil)
	w2 := httptest.NewRecorder()
	s.handleListPublicReviews(w2, req2)
	var reviews2 []PublicReview
	json.NewDecoder(w2.Body).Decode(&reviews2)
	if len(reviews2) != 3 {
		t.Errorf("expected explicit limit=3 to be respected, got %d reviews", len(reviews2))
	}

	req3 := httptest.NewRequest(http.MethodGet, "/reviews?limit=abc", nil)
	w3 := httptest.NewRecorder()
	s.handleListPublicReviews(w3, req3)
	var reviews3 []PublicReview
	json.NewDecoder(w3.Body).Decode(&reviews3)
	if len(reviews3) != 6 {
		t.Errorf("expected invalid limit to fall back to default of 6, got %d reviews", len(reviews3))
	}
}

// TestIntegration_ListPublicReviews_NullListingFallsBackToEmptyTitle covers a
// review row whose listing_id is NULL (the column is nullable per schema) —
// the handler's COALESCE(l.title, "") must still return a valid (empty
// string, not null/error) listing_title rather than failing the LEFT JOIN
// scan. Note: in practice conversations.listing_id is ON DELETE CASCADE, so
// deleting the listing cascades away the conversation and review entirely
// rather than merely nulling reviews.listing_id — this test exercises the
// nullable column directly instead of relying on that (non-existent) cascade
// path.
func TestIntegration_ListPublicReviews_NullListingFallsBackToEmptyTitle(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)

	var reviewID string
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, NULL, 5, 'Loved this place', true) RETURNING id`,
		testUserID, convID,
	).Scan(&reviewID)
	cleanupReview(t, db, reviewID)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/reviews", nil)
	w := httptest.NewRecorder()
	s.handleListPublicReviews(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var reviews []PublicReview
	json.NewDecoder(w.Body).Decode(&reviews)
	found := false
	for _, rv := range reviews {
		if rv.ID == reviewID {
			found = true
			if rv.ListingTitle != "" {
				t.Errorf("expected empty listing_title for a review with NULL listing_id, got %q", rv.ListingTitle)
			}
		}
	}
	if !found {
		t.Error("expected review with NULL listing_id to still appear in public reviews")
	}
}

// ── PublicStats ───────────────────────────────────────────────────────────────

func TestIntegration_PublicStats_EmptyDB(t *testing.T) {
	db := requireDB(t)
	s := &server{db: db}

	// Guard: this test asserts behavior on a *genuinely* empty reviews/
	// listings/conversations set. If other tests leak rows (cleanup failure),
	// this would silently pass without exercising the nullable-field path.
	var listingsCount, conversationsCount, reviewsCount int
	db.QueryRow(context.Background(), "SELECT COUNT(*) FROM listings").Scan(&listingsCount)
	db.QueryRow(context.Background(), "SELECT COUNT(*) FROM conversations").Scan(&conversationsCount)
	db.QueryRow(context.Background(), "SELECT COUNT(*) FROM reviews").Scan(&reviewsCount)
	if listingsCount != 0 || conversationsCount != 0 || reviewsCount != 0 {
		t.Skipf("DB not empty (listings=%d conversations=%d reviews=%d) — skipping to avoid a false-positive null check; run in isolation against a fresh DB", listingsCount, conversationsCount, reviewsCount)
	}

	req := httptest.NewRequest(http.MethodGet, "/stats", nil)
	w := httptest.NewRecorder()
	s.handlePublicStats(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var stats PublicStats
	if err := json.NewDecoder(w.Body).Decode(&stats); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if stats.ListingsTotal != 0 {
		t.Errorf("expected listings_total=0, got %d", stats.ListingsTotal)
	}
	if stats.UniversitiesTotal != 0 {
		t.Errorf("expected universities_total=0, got %d", stats.UniversitiesTotal)
	}
	if stats.ReviewCount != 0 {
		t.Errorf("expected review_count=0, got %d", stats.ReviewCount)
	}
	if stats.MatchSatisfactionPct != nil {
		t.Errorf("expected match_satisfaction_pct=nil on empty DB, got %v", *stats.MatchSatisfactionPct)
	}
	if stats.AvgTimeToMatchHours != nil {
		t.Errorf("expected avg_time_to_match_hours=nil on empty DB, got %v", *stats.AvgTimeToMatchHours)
	}
}

func TestIntegration_PublicStats_ComputedFromSeededData(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)

	var reviewID string
	err := db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 5, 'Loved it', true) RETURNING id`,
		testUserID, convID, listingID,
	).Scan(&reviewID)
	if err != nil {
		t.Fatalf("could not seed review: %v", err)
	}
	cleanupReview(t, db, reviewID)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/stats", nil)
	w := httptest.NewRecorder()
	s.handlePublicStats(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var stats PublicStats
	json.NewDecoder(w.Body).Decode(&stats)

	if stats.ListingsTotal < 1 {
		t.Errorf("expected listings_total >= 1, got %d", stats.ListingsTotal)
	}
	if stats.ReviewCount < 1 {
		t.Errorf("expected review_count >= 1, got %d", stats.ReviewCount)
	}
	if stats.MatchSatisfactionPct == nil || *stats.MatchSatisfactionPct != 100 {
		t.Errorf("expected match_satisfaction_pct=100, got %v", stats.MatchSatisfactionPct)
	}
	if stats.AvgTimeToMatchHours == nil {
		t.Error("expected avg_time_to_match_hours to be set")
	}
}

// ── displayNameFromEmail (unit) ───────────────────────────────────────────────

func TestDisplayNameFromEmail(t *testing.T) {
	cases := []struct {
		email string
		want  string
	}{
		{"priya.rao@university.edu", "Priya R."},
		{"marcus.thompson@ucla.edu", "Marcus T."},
		{"jsmith@school.edu", "Jsmith."},
		{"alex@university.edu", "Alex."},
		{"a.b@university.edu", "A B."},
		{"@university.edu", ""},
		{"", ""},
		// Multiple dots: only the segment immediately after the first dot
		// is used for the last-initial; anything after a second dot is dropped.
		{"a.b.c@university.edu", "A B."},
		// Trailing dot with nothing after it falls back to first-name-only form.
		{"alex.@university.edu", "Alex."},
		// Leading dot: first segment is empty, so the whole thing degrades to "".
		{".alex@university.edu", ""},
		// No "@" at all (defensive — should never happen in practice since this
		// is always called with a users.email value, but the function must not
		// panic on malformed input).
		{"noatsign", "Noatsi."},
		// Single-character local part before "@".
		{"x@y", "X."},
	}
	for _, c := range cases {
		got := displayNameFromEmail(c.email)
		if got != c.want {
			t.Errorf("displayNameFromEmail(%q) = %q, want %q", c.email, got, c.want)
		}
	}
}
