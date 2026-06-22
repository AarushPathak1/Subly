package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// ── Genuine concurrency stress tests ──────────────────────────────────────────
//
// These go beyond the coder's sequential "respond twice" test
// (TestIntegration_RespondViewing_AlreadyRespondedConflict) by firing two
// *simultaneous* respond requests (one accept, one decline) from goroutines
// at the same DB row, to verify the conditional UPDATE's WHERE clause is the
// actual source of atomicity rather than an application-level check-then-act
// race that just happens to work when run sequentially.

func TestIntegration_RespondViewing_ConcurrentAcceptAndDecline_OnlyOneWins(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	proposal := seedViewingProposal(t, s, convID, testUserID, 24)

	respondWith := func(action string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings/"+proposal.ID+"/respond",
			bytes.NewBufferString(fmt.Sprintf(`{"action":%q}`, action)))
		req.SetPathValue("id", convID)
		req.SetPathValue("message_id", proposal.ID)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-User-ID", testListerID)
		w := httptest.NewRecorder()
		s.handleRespondViewing(w, req)
		return w
	}

	const attempts = 20
	var wg sync.WaitGroup
	results := make([]int, attempts)
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			action := "accept"
			if i%2 == 1 {
				action = "decline"
			}
			w := respondWith(action)
			results[i] = w.Code
		}(i)
	}
	wg.Wait()

	okCount, conflictCount, other := 0, 0, 0
	for _, code := range results {
		switch code {
		case http.StatusOK:
			okCount++
		case http.StatusConflict:
			conflictCount++
		default:
			other++
		}
	}

	if okCount != 1 {
		t.Errorf("expected exactly 1 winning respond (200), got %d wins out of %d attempts (conflict=%d other=%d)",
			okCount, attempts, conflictCount, other)
	}
	if okCount+conflictCount != attempts {
		t.Errorf("expected all responses to be either 200 or 409, got %d unexpected status codes", other)
	}

	// Verify DB state is consistent with exactly one terminal status, not a mix.
	var finalStatus string
	err := db.QueryRow(context.Background(), `SELECT viewing->>'status' FROM messages WHERE id = $1`, proposal.ID).Scan(&finalStatus)
	if err != nil {
		t.Fatalf("could not read final status: %v", err)
	}
	if finalStatus != "accepted" && finalStatus != "declined" {
		t.Errorf("expected final status to be accepted or declined, got %q", finalStatus)
	}
}

func TestIntegration_ProposeViewing_ConcurrentProposals_NeverTwoPendingSimultaneously(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	const attempts = 10
	var wg sync.WaitGroup
	codes := make([]int, attempts)
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			future := time.Now().Add(time.Duration(24+i) * time.Hour).Format(time.RFC3339)
			body := fmt.Sprintf(`{"proposed_at":%q}`, future)
			req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings", bytes.NewBufferString(body))
			req.SetPathValue("id", convID)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-User-ID", testUserID)
			w := httptest.NewRecorder()
			s.handleProposeViewing(w, req)
			codes[i] = w.Code
		}(i)
	}
	wg.Wait()

	for _, c := range codes {
		if c != http.StatusCreated {
			t.Errorf("expected all concurrent proposals to succeed with 201, got %d", c)
		}
	}

	// After all concurrent inserts + supersede updates have settled, exactly
	// one pending proposal should remain — the supersede-then-insert
	// transaction must serialize correctly even under concurrent callers.
	var pendingCount int
	err := db.QueryRow(context.Background(), `
		SELECT COUNT(*) FROM messages
		WHERE conversation_id = $1 AND kind = 'viewing_proposal' AND viewing->>'status' = 'pending'`,
		convID,
	).Scan(&pendingCount)
	if err != nil {
		t.Fatalf("could not count pending proposals: %v", err)
	}
	if pendingCount != 1 {
		t.Errorf("expected exactly 1 pending proposal after %d concurrent proposals, got %d", attempts, pendingCount)
	}

	var totalProposals int
	err = db.QueryRow(context.Background(), `
		SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND kind = 'viewing_proposal'`,
		convID,
	).Scan(&totalProposals)
	if err != nil {
		t.Fatalf("could not count total proposals: %v", err)
	}
	if totalProposals != attempts {
		t.Errorf("expected %d total proposal rows, got %d", attempts, totalProposals)
	}
}

// ── Note length: runes vs bytes ───────────────────────────────────────────────

func TestIntegration_ProposeViewing_NoteLength_CountsRunesNotBytes(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	// 280 multi-byte runes (each "字" is 3 bytes in UTF-8 -> 840 bytes total).
	// If the implementation were counting bytes instead of runes, this would
	// be incorrectly rejected as too long even though it is exactly the limit.
	runes := make([]rune, 280)
	for i := range runes {
		runes[i] = '字'
	}
	note := string(runes)

	future := time.Now().Add(48 * time.Hour).Format(time.RFC3339)
	payload, _ := json.Marshal(map[string]string{"proposed_at": future, "note": note})
	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings", bytes.NewReader(payload))
	req.SetPathValue("id", convID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleProposeViewing(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 280 multi-byte-rune note to be accepted (281 < limit check should use runes), got %d: %s", w.Code, w.Body.String())
	}

	// 281 runes of multi-byte characters should be rejected.
	runes281 := make([]rune, 281)
	for i := range runes281 {
		runes281[i] = '字'
	}
	payload2, _ := json.Marshal(map[string]string{"proposed_at": future, "note": string(runes281)})
	req2 := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings", bytes.NewReader(payload2))
	req2.SetPathValue("id", convID)
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("X-User-ID", testUserID)
	w2 := httptest.NewRecorder()
	s.handleProposeViewing(w2, req2)

	if w2.Code != http.StatusBadRequest {
		t.Errorf("expected 281 multi-byte-rune note to be rejected as note_too_long, got %d: %s", w2.Code, w2.Body.String())
	}
}

// ── proposed_at boundary: 5-minute skew tolerance ─────────────────────────────

func TestIntegration_ProposeViewing_SkewBoundary_JustInsideToleranceAccepted(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	// 4 minutes 50 seconds in the past — inside the 5-minute tolerance window,
	// should be accepted.
	justInside := time.Now().Add(-4*time.Minute - 50*time.Second).Format(time.RFC3339)
	body := fmt.Sprintf(`{"proposed_at":%q}`, justInside)
	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings", bytes.NewBufferString(body))
	req.SetPathValue("id", convID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleProposeViewing(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected proposed_at 4m50s in the past (within 5m tolerance) to be accepted, got %d: %s", w.Code, w.Body.String())
	}
}

func TestIntegration_ProposeViewing_SkewBoundary_JustOutsideToleranceRejected(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	// 5 minutes 10 seconds in the past — outside the 5-minute tolerance
	// window, should be rejected.
	justOutside := time.Now().Add(-5*time.Minute - 10*time.Second).Format(time.RFC3339)
	body := fmt.Sprintf(`{"proposed_at":%q}`, justOutside)
	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings", bytes.NewBufferString(body))
	req.SetPathValue("id", convID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleProposeViewing(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected proposed_at 5m10s in the past (outside 5m tolerance) to be rejected, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleProposeViewing_MalformedJSON(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodPost, "/conversations/abc/viewings", bytes.NewBufferString(`not-json`))
	req.SetPathValue("id", "abc")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleProposeViewing(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for malformed JSON, got %d", w.Code)
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "invalid_proposed_at" {
		t.Errorf("expected error=invalid_proposed_at for malformed body, got %q", resp["error"])
	}
}

func TestHandleRespondViewing_MalformedJSON(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodPost, "/conversations/abc/viewings/def/respond", bytes.NewBufferString(`not-json`))
	req.SetPathValue("id", "abc")
	req.SetPathValue("message_id", "def")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleRespondViewing(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for malformed JSON, got %d", w.Code)
	}
}

func TestIntegration_ProposeViewing_ConversationNotFound(t *testing.T) {
	db := requireDB(t)
	s := &server{db: db}

	future := time.Now().Add(48 * time.Hour).Format(time.RFC3339)
	body := fmt.Sprintf(`{"proposed_at":%q}`, future)
	req := httptest.NewRequest(http.MethodPost, "/conversations/00000000-0000-0000-0000-00000000ffff/viewings", bytes.NewBufferString(body))
	req.SetPathValue("id", "00000000-0000-0000-0000-00000000ffff")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleProposeViewing(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for nonexistent conversation, got %d: %s", w.Code, w.Body.String())
	}
}

func TestIntegration_RespondViewing_AccessDenied_NonParticipant(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	seedSecondUser(t, db, testRenterID, "outsider@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	proposal := seedViewingProposal(t, s, convID, testUserID, 24)

	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings/"+proposal.ID+"/respond",
		bytes.NewBufferString(`{"action":"accept"}`))
	req.SetPathValue("id", convID)
	req.SetPathValue("message_id", proposal.ID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testRenterID) // not a participant in this conversation
	w := httptest.NewRecorder()
	s.handleRespondViewing(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for non-participant respond attempt, got %d: %s", w.Code, w.Body.String())
	}
}
