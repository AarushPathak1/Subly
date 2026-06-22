package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// ── ProposeViewing ────────────────────────────────────────────────────────────

func TestHandleProposeViewing_MissingUserID(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodPost, "/conversations/abc/viewings", bytes.NewBufferString(`{}`))
	req.SetPathValue("id", "abc")
	w := httptest.NewRecorder()
	s.handleProposeViewing(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestIntegration_ProposeViewing_MissingProposedAt(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings", bytes.NewBufferString(`{}`))
	req.SetPathValue("id", convID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleProposeViewing(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "invalid_proposed_at" {
		t.Errorf("expected error=invalid_proposed_at, got %q", resp["error"])
	}
}

func TestIntegration_ProposeViewing_PastProposedAt(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	past := time.Now().Add(-1 * time.Hour).Format(time.RFC3339)
	body := fmt.Sprintf(`{"proposed_at":%q}`, past)
	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings", bytes.NewBufferString(body))
	req.SetPathValue("id", convID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleProposeViewing(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "invalid_proposed_at" {
		t.Errorf("expected error=invalid_proposed_at, got %q", resp["error"])
	}
}

func TestIntegration_ProposeViewing_NoteTooLong(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	future := time.Now().Add(48 * time.Hour).Format(time.RFC3339)
	longNote := make([]rune, 281)
	for i := range longNote {
		longNote[i] = 'a'
	}
	payload, _ := json.Marshal(map[string]string{"proposed_at": future, "note": string(longNote)})
	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings", bytes.NewReader(payload))
	req.SetPathValue("id", convID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleProposeViewing(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "note_too_long" {
		t.Errorf("expected error=note_too_long, got %q", resp["error"])
	}
}

func TestIntegration_ProposeViewing_HappyPath(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	future := time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339)
	body := fmt.Sprintf(`{"proposed_at":%q,"note":"Happy to give a tour then."}`, future)
	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings", bytes.NewBufferString(body))
	req.SetPathValue("id", convID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleProposeViewing(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var msg Message
	if err := json.NewDecoder(w.Body).Decode(&msg); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if msg.Kind != "viewing_proposal" {
		t.Errorf("expected kind=viewing_proposal, got %q", msg.Kind)
	}
	if msg.Viewing == nil {
		t.Fatal("expected viewing payload, got nil")
	}
	var vp ViewingPayload
	json.Unmarshal(msg.Viewing, &vp)
	if vp.Status != "pending" {
		t.Errorf("expected status=pending, got %q", vp.Status)
	}
	if vp.Note != "Happy to give a tour then." {
		t.Errorf("expected note to be persisted, got %q", vp.Note)
	}
}

func TestIntegration_ProposeViewing_AccessDenied(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	seedSecondUser(t, db, testRenterID, "renter@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	future := time.Now().Add(48 * time.Hour).Format(time.RFC3339)
	body := fmt.Sprintf(`{"proposed_at":%q}`, future)
	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings", bytes.NewBufferString(body))
	req.SetPathValue("id", convID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testRenterID) // not part of this conversation
	w := httptest.NewRecorder()
	s.handleProposeViewing(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

func TestIntegration_ProposeViewing_SupersedesPriorPending(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	propose := func(hoursFromNow int) Message {
		future := time.Now().Add(time.Duration(hoursFromNow) * time.Hour).Format(time.RFC3339)
		body := fmt.Sprintf(`{"proposed_at":%q}`, future)
		req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings", bytes.NewBufferString(body))
		req.SetPathValue("id", convID)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-User-ID", testUserID)
		w := httptest.NewRecorder()
		s.handleProposeViewing(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
		}
		var msg Message
		json.NewDecoder(w.Body).Decode(&msg)
		return msg
	}

	first := propose(24)
	propose(48)

	var firstStatus string
	err := db.QueryRow(context.Background(),
		`SELECT viewing->>'status' FROM messages WHERE id = $1`, first.ID,
	).Scan(&firstStatus)
	if err != nil {
		t.Fatalf("could not query first proposal: %v", err)
	}
	if firstStatus != "superseded" {
		t.Errorf("expected first proposal status=superseded, got %q", firstStatus)
	}
}

func TestIntegration_ProposeViewing_ConversationConfirmed(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	db.Exec(context.Background(), `UPDATE conversations SET confirmed_at = NOW() WHERE id = $1`, convID)
	s := &server{db: db}

	future := time.Now().Add(48 * time.Hour).Format(time.RFC3339)
	body := fmt.Sprintf(`{"proposed_at":%q}`, future)
	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings", bytes.NewBufferString(body))
	req.SetPathValue("id", convID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleProposeViewing(w, req)

	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "conversation_confirmed" {
		t.Errorf("expected error=conversation_confirmed, got %q", resp["error"])
	}
}

// ── RespondViewing ────────────────────────────────────────────────────────────

func TestHandleRespondViewing_MissingUserID(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodPost, "/conversations/abc/viewings/def/respond", bytes.NewBufferString(`{"action":"accept"}`))
	req.SetPathValue("id", "abc")
	req.SetPathValue("message_id", "def")
	w := httptest.NewRecorder()
	s.handleRespondViewing(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func seedViewingProposal(t *testing.T, s *server, convID, senderID string, hoursFromNow int) Message {
	t.Helper()
	future := time.Now().Add(time.Duration(hoursFromNow) * time.Hour).Format(time.RFC3339)
	body := fmt.Sprintf(`{"proposed_at":%q}`, future)
	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings", bytes.NewBufferString(body))
	req.SetPathValue("id", convID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", senderID)
	w := httptest.NewRecorder()
	s.handleProposeViewing(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("seedViewingProposal: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var msg Message
	json.NewDecoder(w.Body).Decode(&msg)
	return msg
}

func TestIntegration_RespondViewing_AcceptByOtherParty(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	proposal := seedViewingProposal(t, s, convID, testUserID, 24)

	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings/"+proposal.ID+"/respond",
		bytes.NewBufferString(`{"action":"accept"}`))
	req.SetPathValue("id", convID)
	req.SetPathValue("message_id", proposal.ID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testListerID)
	w := httptest.NewRecorder()
	s.handleRespondViewing(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var msg Message
	json.NewDecoder(w.Body).Decode(&msg)
	var vp ViewingPayload
	json.Unmarshal(msg.Viewing, &vp)
	if vp.Status != "accepted" {
		t.Errorf("expected status=accepted, got %q", vp.Status)
	}
	if vp.ResponderID == nil || *vp.ResponderID != testListerID {
		t.Errorf("expected responder_id=%s, got %v", testListerID, vp.ResponderID)
	}
	if vp.RespondedAt == nil {
		t.Error("expected responded_at to be set")
	}
}

func TestIntegration_RespondViewing_DeclineByOtherParty(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	proposal := seedViewingProposal(t, s, convID, testUserID, 24)

	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings/"+proposal.ID+"/respond",
		bytes.NewBufferString(`{"action":"decline"}`))
	req.SetPathValue("id", convID)
	req.SetPathValue("message_id", proposal.ID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testListerID)
	w := httptest.NewRecorder()
	s.handleRespondViewing(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var msg Message
	json.NewDecoder(w.Body).Decode(&msg)
	var vp ViewingPayload
	json.Unmarshal(msg.Viewing, &vp)
	if vp.Status != "declined" {
		t.Errorf("expected status=declined, got %q", vp.Status)
	}
}

func TestIntegration_RespondViewing_SelfRespondForbidden(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	proposal := seedViewingProposal(t, s, convID, testUserID, 24)

	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings/"+proposal.ID+"/respond",
		bytes.NewBufferString(`{"action":"accept"}`))
	req.SetPathValue("id", convID)
	req.SetPathValue("message_id", proposal.ID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID) // sender trying to respond to own proposal
	w := httptest.NewRecorder()
	s.handleRespondViewing(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "cannot_respond_to_own_proposal" {
		t.Errorf("expected error=cannot_respond_to_own_proposal, got %q", resp["error"])
	}
}

func TestIntegration_RespondViewing_AlreadyRespondedConflict(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	proposal := seedViewingProposal(t, s, convID, testUserID, 24)

	respond := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings/"+proposal.ID+"/respond",
			bytes.NewBufferString(`{"action":"accept"}`))
		req.SetPathValue("id", convID)
		req.SetPathValue("message_id", proposal.ID)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-User-ID", testListerID)
		w := httptest.NewRecorder()
		s.handleRespondViewing(w, req)
		return w
	}

	w1 := respond()
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200 on first respond, got %d: %s", w1.Code, w1.Body.String())
	}
	w2 := respond()
	if w2.Code != http.StatusConflict {
		t.Fatalf("expected 409 on second respond, got %d: %s", w2.Code, w2.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w2.Body).Decode(&resp)
	if resp["error"] != "proposal_not_pending" {
		t.Errorf("expected error=proposal_not_pending, got %q", resp["error"])
	}
}

func TestIntegration_RespondViewing_InvalidAction(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	proposal := seedViewingProposal(t, s, convID, testUserID, 24)

	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings/"+proposal.ID+"/respond",
		bytes.NewBufferString(`{"action":"maybe"}`))
	req.SetPathValue("id", convID)
	req.SetPathValue("message_id", proposal.ID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testListerID)
	w := httptest.NewRecorder()
	s.handleRespondViewing(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "invalid_action" {
		t.Errorf("expected error=invalid_action, got %q", resp["error"])
	}
}

func TestIntegration_RespondViewing_WrongConversationMessagePair(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	seedSecondUser(t, db, testRenterID, "renter2@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)

	// A second, unrelated conversation between the lister and a different renter.
	listingID2 := seedTestListing(t, db, testListerID, 120000)
	convID2 := seedTestConversation(t, db, listingID2, testRenterID, testListerID, 120000)
	s := &server{db: db}

	proposal := seedViewingProposal(t, s, convID, testUserID, 24)

	// Try to respond to the proposal using the *other* conversation's id.
	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID2+"/viewings/"+proposal.ID+"/respond",
		bytes.NewBufferString(`{"action":"accept"}`))
	req.SetPathValue("id", convID2)
	req.SetPathValue("message_id", proposal.ID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testListerID)
	w := httptest.NewRecorder()
	s.handleRespondViewing(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

// ── GetMessages with viewing fields ───────────────────────────────────────────

func TestIntegration_GetMessages_IncludesKindAndViewing(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	// Plain text message.
	textReq := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/messages", bytes.NewBufferString(`{"body":"Hello"}`))
	textReq.SetPathValue("id", convID)
	textReq.Header.Set("Content-Type", "application/json")
	textReq.Header.Set("X-User-ID", testUserID)
	textW := httptest.NewRecorder()
	s.handleSendMessage(textW, textReq)
	if textW.Code != http.StatusCreated {
		t.Fatalf("expected 201 for text message, got %d", textW.Code)
	}

	// Viewing proposal message.
	seedViewingProposal(t, s, convID, testUserID, 24)

	req := httptest.NewRequest(http.MethodGet, "/conversations/"+convID+"/messages", nil)
	req.SetPathValue("id", convID)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleGetMessages(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var msgs []Message
	if err := json.NewDecoder(w.Body).Decode(&msgs); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}

	var sawText, sawProposal bool
	for _, m := range msgs {
		if m.Kind == "text" {
			sawText = true
			if m.Viewing != nil {
				t.Errorf("expected nil viewing for text message, got %s", m.Viewing)
			}
		}
		if m.Kind == "viewing_proposal" {
			sawProposal = true
			if m.Viewing == nil {
				t.Error("expected non-nil viewing for proposal message")
			}
		}
	}
	if !sawText || !sawProposal {
		t.Errorf("expected both text and viewing_proposal messages, sawText=%v sawProposal=%v", sawText, sawProposal)
	}
}
