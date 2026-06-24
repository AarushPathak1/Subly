package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
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

// ── ListPublicReviews filters ─────────────────────────────────────────────────

func TestIntegration_ListPublicReviews_FilterByListingID(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)

	var reviewID string
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 5, 'Great listing', true) RETURNING id`,
		testUserID, convID, listingID,
	).Scan(&reviewID)
	cleanupReview(t, db, reviewID)

	listingID2 := seedTestListing(t, db, testListerID, 130000)
	seedSecondUser(t, db, testRenterID, "renter2@university.edu")
	convID2 := seedConfirmedConversation(t, db, listingID2, testRenterID, testListerID, 130000)
	var otherReviewID string
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 4, 'Other listing', true) RETURNING id`,
		testRenterID, convID2, listingID2,
	).Scan(&otherReviewID)
	cleanupReview(t, db, otherReviewID)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/reviews?listing_id="+listingID, nil)
	w := httptest.NewRecorder()
	s.handleListPublicReviews(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var reviews []PublicReview
	json.NewDecoder(w.Body).Decode(&reviews)
	if len(reviews) != 1 || reviews[0].ID != reviewID {
		t.Errorf("expected only the review for listingID, got %+v", reviews)
	}
}

func TestIntegration_ListPublicReviews_FilterByListerID(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	listingID2 := seedTestListing(t, db, testListerID, 130000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)

	seedSecondUser(t, db, testRenterID, "renter2@university.edu")
	convID2 := seedConfirmedConversation(t, db, listingID2, testRenterID, testListerID, 130000)

	var reviewID1, reviewID2 string
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 5, 'First listing of this lister', true) RETURNING id`,
		testUserID, convID, listingID,
	).Scan(&reviewID1)
	cleanupReview(t, db, reviewID1)
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 3, 'Second listing of this lister', true) RETURNING id`,
		testRenterID, convID2, listingID2,
	).Scan(&reviewID2)
	cleanupReview(t, db, reviewID2)

	// A review on an unrelated lister's listing must not appear.
	thirdListerID := "00000000-0000-0000-0000-000000000004"
	seedSecondUser(t, db, thirdListerID, "thirdlister@university.edu")
	listingID3 := seedTestListing(t, db, thirdListerID, 100000)
	renterForThird := "00000000-0000-0000-0000-000000000005"
	seedSecondUser(t, db, renterForThird, "renter3@university.edu")
	convID3 := seedConfirmedConversation(t, db, listingID3, renterForThird, thirdListerID, 100000)
	var unrelatedReviewID string
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 5, 'Unrelated lister', true) RETURNING id`,
		renterForThird, convID3, listingID3,
	).Scan(&unrelatedReviewID)
	cleanupReview(t, db, unrelatedReviewID)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/reviews?lister_id="+testListerID, nil)
	w := httptest.NewRecorder()
	s.handleListPublicReviews(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var reviews []PublicReview
	json.NewDecoder(w.Body).Decode(&reviews)
	if len(reviews) != 2 {
		t.Fatalf("expected 2 reviews across the lister's listings, got %d: %+v", len(reviews), reviews)
	}
	for _, rv := range reviews {
		if rv.ID == unrelatedReviewID {
			t.Error("review on unrelated lister's listing should not appear")
		}
	}
}

func TestIntegration_ListPublicReviews_FilteredIncludesEmptyBody(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)

	var emptyBodyID string
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 4, '', true) RETURNING id`,
		testUserID, convID, listingID,
	).Scan(&emptyBodyID)
	cleanupReview(t, db, emptyBodyID)

	s := &server{db: db}

	reqByListing := httptest.NewRequest(http.MethodGet, "/reviews?listing_id="+listingID, nil)
	wByListing := httptest.NewRecorder()
	s.handleListPublicReviews(wByListing, reqByListing)
	var byListing []PublicReview
	json.NewDecoder(wByListing.Body).Decode(&byListing)
	foundByListing := false
	for _, rv := range byListing {
		if rv.ID == emptyBodyID {
			foundByListing = true
		}
	}
	if !foundByListing {
		t.Error("expected empty-body review to appear when filtering by listing_id")
	}

	reqByLister := httptest.NewRequest(http.MethodGet, "/reviews?lister_id="+testListerID, nil)
	wByLister := httptest.NewRecorder()
	s.handleListPublicReviews(wByLister, reqByLister)
	var byLister []PublicReview
	json.NewDecoder(wByLister.Body).Decode(&byLister)
	foundByLister := false
	for _, rv := range byLister {
		if rv.ID == emptyBodyID {
			foundByLister = true
		}
	}
	if !foundByLister {
		t.Error("expected empty-body review to appear when filtering by lister_id")
	}
}

func TestHandleListPublicReviews_BothFiltersRejected(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodGet,
		"/reviews?listing_id=00000000-0000-0000-0000-000000000001&lister_id=00000000-0000-0000-0000-000000000002", nil)
	w := httptest.NewRecorder()
	s.handleListPublicReviews(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "specify listing_id or lister_id, not both" {
		t.Errorf("unexpected error message: %q", resp["error"])
	}
}

func TestHandleListPublicReviews_InvalidListingIDRejected(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodGet, "/reviews?listing_id=not-a-uuid", nil)
	w := httptest.NewRecorder()
	s.handleListPublicReviews(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "invalid listing_id" {
		t.Errorf("unexpected error message: %q", resp["error"])
	}
}

func TestHandleListPublicReviews_InvalidListerIDRejected(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodGet, "/reviews?lister_id=not-a-uuid", nil)
	w := httptest.NewRecorder()
	s.handleListPublicReviews(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "invalid lister_id" {
		t.Errorf("unexpected error message: %q", resp["error"])
	}
}

// TestHandleListPublicReviews_SQLInjectionAttemptsRejectedAsInvalidUUID
// exercises a handful of classic SQL-injection-shaped strings against both
// the listing_id and lister_id params. Because every query path uses
// parameterized placeholders ($1/$2) rather than string concatenation, this
// is mostly a defense-in-depth/observability check (do we leak a 500 or
// behave oddly?) rather than a true injection vector — but it should still
// always resolve to a clean 400 via uuidRe, never reach the database, and
// never 500.
func TestHandleListPublicReviews_SQLInjectionAttemptsRejectedAsInvalidUUID(t *testing.T) {
	payloads := []string{
		"'; DROP TABLE reviews; --",
		"' OR '1'='1",
		"00000000-0000-0000-0000-000000000001' OR '1'='1",
		"1; SELECT * FROM users",
		"%27%20OR%201=1",
		"\" OR \"\"=\"",
	}
	s := &server{}
	for _, payload := range payloads {
		t.Run(payload, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/reviews?listing_id="+url.QueryEscape(payload), nil)
			w := httptest.NewRecorder()
			s.handleListPublicReviews(w, req)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400 for payload %q, got %d: %s", payload, w.Code, w.Body.String())
			}

			req2 := httptest.NewRequest(http.MethodGet, "/reviews?lister_id="+url.QueryEscape(payload), nil)
			w2 := httptest.NewRecorder()
			s.handleListPublicReviews(w2, req2)
			if w2.Code != http.StatusBadRequest {
				t.Fatalf("expected 400 for lister_id payload %q, got %d: %s", payload, w2.Code, w2.Body.String())
			}
		})
	}
}

// TestUUIDRegex_FormatValidation exercises the uuidRe pattern directly
// against valid/invalid UUID shapes to confirm the 8-4-4-4-12 hex-digit
// structure (case-insensitive) is enforced precisely, with no loose
// trailing/leading garbage permitted.
func TestUUIDRegex_FormatValidation(t *testing.T) {
	cases := []struct {
		name  string
		input string
		want  bool
	}{
		{"valid lowercase", "550e8400-e29b-41d4-a716-446655440000", true},
		{"valid uppercase", "550E8400-E29B-41D4-A716-446655440000", true},
		{"valid mixed case", "550e8400-E29B-41d4-A716-446655440000", true},
		{"all zeros", "00000000-0000-0000-0000-000000000000", true},
		{"wrong segment length (short last group)", "550e8400-e29b-41d4-a716-44665544000", false},
		{"wrong segment length (long first group)", "550e8400a-e29b-41d4-a716-446655440000", false},
		{"missing dashes", "550e8400e29b41d4a716446655440000", false},
		{"extra trailing chars", "550e8400-e29b-41d4-a716-446655440000-extra", false},
		{"leading garbage", "x550e8400-e29b-41d4-a716-446655440000", false},
		{"empty string", "", false},
		{"non-hex characters", "550e8400-e29b-41d4-a716-44665544000g", false},
		{"sql injection attempt", "'; DROP TABLE reviews; --", false},
		{"whitespace only", "   ", false},
		{"uuid with surrounding whitespace", " 550e8400-e29b-41d4-a716-446655440000 ", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := uuidRe.MatchString(c.input)
			if got != c.want {
				t.Errorf("uuidRe.MatchString(%q) = %v, want %v", c.input, got, c.want)
			}
		})
	}
}

// TestIntegration_ListPublicReviews_OrphanedReviewExcludedFromListerFilterButVisibleUnfiltered
// covers a review row whose listing_id is NULL — the same scenario as
// TestIntegration_ListPublicReviews_NullListingFallsBackToEmptyTitle, but
// asserting the filter-exclusion behavior rather than the title fallback.
//
// IMPORTANT SCHEMA FINDING (see infra/postgres/migrate_reviews.sql):
// reviews.listing_id does carry its own `ON DELETE SET NULL` FK to
// listings(id), but reviews.conversation_id carries `ON DELETE CASCADE` to
// conversations(id), and conversations.listing_id *also* carries
// `ON DELETE CASCADE` to listings(id). Because Postgres cascades through
// conversations first, actually deleting a listing deletes the conversation
// (CASCADE) which deletes the review (CASCADE) — the review row is gone
// before its own listing_id FK's SET NULL action would ever have a chance
// to apply to a surviving row. In this schema, reviews.listing_id can only
// become NULL by deleting a *listing whose conversation/review somehow
// still exists independently* — a state that cannot arise via normal FK
// cascade from a listing deletion, only via an UPDATE/INSERT done directly
// against the reviews table. We exercise that directly instead, matching
// the precedent set by NullListingFallsBackToEmptyTitle, and document this
// finding for the Reviewer.
//
// This test confirms:
//  1. a review with NULL listing_id still appears in the unfiltered global
//     feed (LEFT JOIN listings — null listing_id tolerated, matches
//     NullListingFallsBackToEmptyTitle);
//  2. the same review is excluded when filtering by lister_id, because the
//     lister_id path uses an INNER JOIN to listings and a null listing_id
//     can no longer be attributed to any lister.
func TestIntegration_ListPublicReviews_OrphanedReviewExcludedFromListerFilterButVisibleUnfiltered(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)

	var reviewID string
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, NULL, 5, 'Orphaned review (NULL listing_id)', true) RETURNING id`,
		testUserID, convID,
	).Scan(&reviewID)
	cleanupReview(t, db, reviewID)

	s := &server{db: db}

	// Unfiltered: the orphaned review must still appear.
	reqUnfiltered := httptest.NewRequest(http.MethodGet, "/reviews", nil)
	wUnfiltered := httptest.NewRecorder()
	s.handleListPublicReviews(wUnfiltered, reqUnfiltered)
	var unfiltered []PublicReview
	json.NewDecoder(wUnfiltered.Body).Decode(&unfiltered)
	foundUnfiltered := false
	for _, rv := range unfiltered {
		if rv.ID == reviewID {
			foundUnfiltered = true
		}
	}
	if !foundUnfiltered {
		t.Error("expected orphaned review (NULL listing_id) to still appear in the unfiltered feed")
	}

	// Filtered by lister_id: the orphaned review must NOT appear, since it
	// can no longer be attributed to any lister via INNER JOIN.
	reqFiltered := httptest.NewRequest(http.MethodGet, "/reviews?lister_id="+testListerID, nil)
	wFiltered := httptest.NewRecorder()
	s.handleListPublicReviews(wFiltered, reqFiltered)
	if wFiltered.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", wFiltered.Code, wFiltered.Body.String())
	}
	var filtered []PublicReview
	json.NewDecoder(wFiltered.Body).Decode(&filtered)
	for _, rv := range filtered {
		if rv.ID == reviewID {
			t.Error("expected orphaned review (NULL listing_id) to be excluded from lister_id filter via INNER JOIN")
		}
	}

	// Also confirm handleReviewSummary excludes the orphaned review from the
	// lister's average/count.
	reqSummary := httptest.NewRequest(http.MethodGet, "/reviews/summary?lister_id="+testListerID, nil)
	wSummary := httptest.NewRecorder()
	s.handleReviewSummary(wSummary, reqSummary)
	var summary ReviewSummary
	json.NewDecoder(wSummary.Body).Decode(&summary)
	if summary.Count != 0 {
		t.Errorf("expected lister summary count=0 after the only review's listing was deleted, got %d", summary.Count)
	}
	if summary.Average != nil {
		t.Errorf("expected lister summary average=nil after the only review's listing was deleted, got %v", *summary.Average)
	}
}

// ── ReviewSummary ─────────────────────────────────────────────────────────────

func TestIntegration_ReviewSummary_ByListingID(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)

	seedSecondUser(t, db, testRenterID, "renter2@university.edu")
	convID2 := seedConfirmedConversation(t, db, listingID, testRenterID, testListerID, 120000)

	listingID2 := seedTestListing(t, db, testListerID, 130000)
	thirdRenterID := "00000000-0000-0000-0000-000000000006"
	seedSecondUser(t, db, thirdRenterID, "renter3@university.edu")
	convID3 := seedConfirmedConversation(t, db, listingID2, thirdRenterID, testListerID, 130000)

	var id1, id2, id3 string
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 5, 'a', true) RETURNING id`,
		testUserID, convID, listingID,
	).Scan(&id1)
	cleanupReview(t, db, id1)
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 3, 'b', true) RETURNING id`,
		testRenterID, convID2, listingID,
	).Scan(&id2)
	cleanupReview(t, db, id2)
	// Review on a different listing must not be counted.
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 1, 'c', true) RETURNING id`,
		thirdRenterID, convID3, listingID2,
	).Scan(&id3)
	cleanupReview(t, db, id3)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/reviews/summary?listing_id="+listingID, nil)
	w := httptest.NewRecorder()
	s.handleReviewSummary(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var summary ReviewSummary
	json.NewDecoder(w.Body).Decode(&summary)
	if summary.Count != 2 {
		t.Errorf("expected count=2, got %d", summary.Count)
	}
	if summary.Average == nil || *summary.Average != 4.0 {
		t.Errorf("expected average=4.0, got %v", summary.Average)
	}
}

func TestIntegration_ReviewSummary_ByListerIDAcrossListings(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	listingID2 := seedTestListing(t, db, testListerID, 130000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)

	seedSecondUser(t, db, testRenterID, "renter2@university.edu")
	convID2 := seedConfirmedConversation(t, db, listingID2, testRenterID, testListerID, 130000)

	var id1, id2 string
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 5, 'a', true) RETURNING id`,
		testUserID, convID, listingID,
	).Scan(&id1)
	cleanupReview(t, db, id1)
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 2, 'b', true) RETURNING id`,
		testRenterID, convID2, listingID2,
	).Scan(&id2)
	cleanupReview(t, db, id2)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/reviews/summary?lister_id="+testListerID, nil)
	w := httptest.NewRecorder()
	s.handleReviewSummary(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var summary ReviewSummary
	json.NewDecoder(w.Body).Decode(&summary)
	if summary.Count != 2 {
		t.Errorf("expected count=2, got %d", summary.Count)
	}
	if summary.Average == nil || *summary.Average != 3.5 {
		t.Errorf("expected average=3.5, got %v", summary.Average)
	}
}

func TestIntegration_ReviewSummary_NoMatches_AverageIsLiteralNull(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/reviews/summary?listing_id="+listingID, nil)
	w := httptest.NewRecorder()
	s.handleReviewSummary(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"average":null`) {
		t.Errorf("expected literal JSON null for average, got body: %s", w.Body.String())
	}
	var summary ReviewSummary
	json.NewDecoder(strings.NewReader(w.Body.String())).Decode(&summary)
	if summary.Count != 0 {
		t.Errorf("expected count=0, got %d", summary.Count)
	}
	if summary.Average != nil {
		t.Errorf("expected average=nil, got %v", *summary.Average)
	}
}

func TestIntegration_ReviewSummary_ExcludesUnpublished(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedConfirmedConversation(t, db, listingID, testUserID, testListerID, 120000)

	var publishedID, unpublishedID string
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 5, 'a', true) RETURNING id`,
		testUserID, convID, listingID,
	).Scan(&publishedID)
	cleanupReview(t, db, publishedID)

	seedSecondUser(t, db, testRenterID, "renter2@university.edu")
	listingID2 := seedTestListing(t, db, testListerID, 130000)
	convID2 := seedConfirmedConversation(t, db, listingID2, testRenterID, testListerID, 130000)
	db.QueryRow(context.Background(),
		`INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body, published)
		 VALUES ($1, $2, $3, 1, 'b', false) RETURNING id`,
		testRenterID, convID2, listingID2,
	).Scan(&unpublishedID)
	cleanupReview(t, db, unpublishedID)

	s := &server{db: db}
	req := httptest.NewRequest(http.MethodGet, "/reviews/summary?lister_id="+testListerID, nil)
	w := httptest.NewRecorder()
	s.handleReviewSummary(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var summary ReviewSummary
	json.NewDecoder(w.Body).Decode(&summary)
	if summary.Count != 1 {
		t.Errorf("expected count=1 (unpublished excluded), got %d", summary.Count)
	}
	if summary.Average == nil || *summary.Average != 5.0 {
		t.Errorf("expected average=5.0 (unpublished excluded), got %v", summary.Average)
	}
}

func TestHandleReviewSummary_NoParamsRejected(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodGet, "/reviews/summary", nil)
	w := httptest.NewRecorder()
	s.handleReviewSummary(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "listing_id or lister_id required" {
		t.Errorf("unexpected error message: %q", resp["error"])
	}
}

func TestHandleReviewSummary_BothParamsRejected(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodGet,
		"/reviews/summary?listing_id=00000000-0000-0000-0000-000000000001&lister_id=00000000-0000-0000-0000-000000000002", nil)
	w := httptest.NewRecorder()
	s.handleReviewSummary(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "specify listing_id or lister_id, not both" {
		t.Errorf("unexpected error message: %q", resp["error"])
	}
}

func TestHandleReviewSummary_InvalidListingIDRejected(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodGet, "/reviews/summary?listing_id=not-a-uuid", nil)
	w := httptest.NewRecorder()
	s.handleReviewSummary(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "invalid listing_id" {
		t.Errorf("unexpected error message: %q", resp["error"])
	}
}

func TestHandleReviewSummary_InvalidListerIDRejected(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodGet, "/reviews/summary?lister_id=not-a-uuid", nil)
	w := httptest.NewRecorder()
	s.handleReviewSummary(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "invalid lister_id" {
		t.Errorf("unexpected error message: %q", resp["error"])
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
