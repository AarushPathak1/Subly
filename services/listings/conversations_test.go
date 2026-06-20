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

	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Fixtures ──────────────────────────────────────────────────────────────────

const (
	testListerID = "00000000-0000-0000-0000-000000000002"
	testRenterID = "00000000-0000-0000-0000-000000000003"
)

func seedSecondUser(t *testing.T, db *pgxpool.Pool, id, email string) {
	t.Helper()
	_, err := db.Exec(context.Background(),
		`INSERT INTO users (id, clerk_id, email, edu_verified)
		 VALUES ($1, $2, $3, true)
		 ON CONFLICT (id) DO NOTHING`,
		id, "clerk-"+id, email,
	)
	if err != nil {
		t.Fatalf("seedSecondUser(%s): %v", id, err)
	}
	t.Cleanup(func() {
		db.Exec(context.Background(), "DELETE FROM users WHERE id = $1", id)
	})
}

func seedTestListing(t *testing.T, db *pgxpool.Pool, userID string, rentCents int) string {
	t.Helper()
	var id string
	err := db.QueryRow(context.Background(),
		`INSERT INTO listings
		   (user_id, title, description, address, rent_cents, available_from, status)
		 VALUES ($1, 'Test Listing', 'desc', '123 Main St', $2, '2026-07-01', 'active')
		 RETURNING id`,
		userID, rentCents,
	).Scan(&id)
	if err != nil {
		t.Fatalf("seedTestListing: %v", err)
	}
	t.Cleanup(func() {
		db.Exec(context.Background(), "DELETE FROM listings WHERE id = $1", id)
	})
	return id
}

func seedTestConversation(t *testing.T, db *pgxpool.Pool, listingID, renterID, listerID string, rentCents int) string {
	t.Helper()
	var id string
	err := db.QueryRow(context.Background(),
		`INSERT INTO conversations (listing_id, renter_id, lister_id, initial_rent_cents)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (listing_id, renter_id) DO UPDATE SET listing_id = EXCLUDED.listing_id
		 RETURNING id`,
		listingID, renterID, listerID, rentCents,
	).Scan(&id)
	if err != nil {
		t.Fatalf("seedTestConversation: %v", err)
	}
	t.Cleanup(func() {
		db.Exec(context.Background(), "DELETE FROM conversations WHERE id = $1", id)
	})
	return id
}

// ── Unit tests (no DB) ────────────────────────────────────────────────────────

func TestHandleCreateConversation_MissingUserID(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodPost, "/conversations", bytes.NewBufferString(`{"listing_id":"some-id"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.handleCreateConversation(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestHandleConfirmConversation_MissingUserID(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodPost, "/conversations/abc/confirm", bytes.NewBufferString(`{}`))
	req.SetPathValue("id", "abc")
	w := httptest.NewRecorder()
	s.handleConfirmConversation(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestHandleListConversations_MissingUserID(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodGet, "/conversations", nil)
	w := httptest.NewRecorder()
	s.handleListConversations(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestHandleSendMessage_MissingUserID(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodPost, "/conversations/abc/messages", bytes.NewBufferString(`{"body":"hi"}`))
	req.SetPathValue("id", "abc")
	w := httptest.NewRecorder()
	s.handleSendMessage(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

// ── Integration tests ─────────────────────────────────────────────────────────

func TestIntegration_CreateConversation(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	s := &server{db: db}

	body := fmt.Sprintf(`{"listing_id":%q}`, listingID)
	req := httptest.NewRequest(http.MethodPost, "/conversations", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreateConversation(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["id"] == "" {
		t.Fatal("expected conversation ID in response")
	}
	t.Cleanup(func() {
		db.Exec(context.Background(), "DELETE FROM conversations WHERE id = $1", resp["id"])
	})
}

func TestIntegration_CreateConversation_OwnListing(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	listingID := seedTestListing(t, db, testUserID, 120000)
	s := &server{db: db}

	body := fmt.Sprintf(`{"listing_id":%q}`, listingID)
	req := httptest.NewRequest(http.MethodPost, "/conversations", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreateConversation(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 when messaging own listing, got %d", w.Code)
	}
}

func TestIntegration_CreateConversation_ListingNotFound(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodPost, "/conversations",
		bytes.NewBufferString(`{"listing_id":"00000000-0000-0000-0000-000000000099"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreateConversation(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for non-existent listing, got %d", w.Code)
	}
}

func TestIntegration_CreateConversation_Idempotent(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	s := &server{db: db}

	makeRequest := func() string {
		body := fmt.Sprintf(`{"listing_id":%q}`, listingID)
		req := httptest.NewRequest(http.MethodPost, "/conversations", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-User-ID", testUserID)
		w := httptest.NewRecorder()
		s.handleCreateConversation(w, req)
		var resp map[string]string
		json.NewDecoder(w.Body).Decode(&resp)
		return resp["id"]
	}

	id1 := makeRequest()
	id2 := makeRequest()
	if id1 != id2 {
		t.Errorf("expected same conversation ID on duplicate: got %s and %s", id1, id2)
	}
	t.Cleanup(func() {
		db.Exec(context.Background(), "DELETE FROM conversations WHERE id = $1", id1)
	})
}

func TestIntegration_CreateConversation_CapturesInitialRent(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 150000)
	s := &server{db: db}

	body := fmt.Sprintf(`{"listing_id":%q}`, listingID)
	req := httptest.NewRequest(http.MethodPost, "/conversations", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreateConversation(w, req)

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	t.Cleanup(func() {
		db.Exec(context.Background(), "DELETE FROM conversations WHERE id = $1", resp["id"])
	})

	var rentCents int
	err := db.QueryRow(context.Background(),
		`SELECT initial_rent_cents FROM conversations WHERE id = $1`, resp["id"],
	).Scan(&rentCents)
	if err != nil {
		t.Fatalf("could not query conversation: %v", err)
	}
	if rentCents != 150000 {
		t.Errorf("expected initial_rent_cents=150000, got %d", rentCents)
	}
}

func TestIntegration_ListConversations(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	_ = convID
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/conversations", nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleListConversations(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var convs []Conversation
	if err := json.NewDecoder(w.Body).Decode(&convs); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if len(convs) == 0 {
		t.Error("expected at least one conversation")
	}
}

func TestIntegration_GetConversation(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/conversations/"+convID, nil)
	req.SetPathValue("id", convID)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleGetConversation(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var conv Conversation
	json.NewDecoder(w.Body).Decode(&conv)
	if conv.ID != convID {
		t.Errorf("expected conversation ID %s, got %s", convID, conv.ID)
	}
	if conv.InitialRentCents != 120000 {
		t.Errorf("expected initial_rent_cents=120000, got %d", conv.InitialRentCents)
	}
	if conv.ConfirmedAt != nil {
		t.Error("expected confirmed_at to be nil for new conversation")
	}
}

func TestIntegration_GetConversation_AccessDenied(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	seedSecondUser(t, db, testRenterID, "renter@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	// Conversation between testUserID (renter) and testListerID
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	// testRenterID is not part of this conversation
	req := httptest.NewRequest(http.MethodGet, "/conversations/"+convID, nil)
	req.SetPathValue("id", convID)
	req.Header.Set("X-User-ID", testRenterID)
	w := httptest.NewRecorder()
	s.handleGetConversation(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for unauthorized access, got %d", w.Code)
	}
}

func TestIntegration_SendMessage(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	body := `{"body":"Hello, is the apartment still available?"}`
	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/messages", bytes.NewBufferString(body))
	req.SetPathValue("id", convID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleSendMessage(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var msg Message
	json.NewDecoder(w.Body).Decode(&msg)
	if msg.Body != "Hello, is the apartment still available?" {
		t.Errorf("unexpected message body: %q", msg.Body)
	}
	if msg.SenderID != testUserID {
		t.Errorf("expected sender_id=%s, got %s", testUserID, msg.SenderID)
	}
	if msg.ID == "" {
		t.Error("expected message ID in response")
	}
}

func TestIntegration_SendMessage_AccessDenied(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	seedSecondUser(t, db, testRenterID, "renter@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	body := `{"body":"Trying to send from outside the conversation"}`
	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/messages", bytes.NewBufferString(body))
	req.SetPathValue("id", convID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testRenterID) // not part of this conversation
	w := httptest.NewRecorder()
	s.handleSendMessage(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for outsider, got %d", w.Code)
	}
}

func TestIntegration_GetMessages_MarksRead(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	// Lister reads the conversation
	req := httptest.NewRequest(http.MethodGet, "/conversations/"+convID+"/messages", nil)
	req.SetPathValue("id", convID)
	req.Header.Set("X-User-ID", testListerID)
	w := httptest.NewRecorder()
	s.handleGetMessages(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	// lister_read_at should now be set
	var listerReadAt *time.Time
	db.QueryRow(context.Background(),
		`SELECT lister_read_at FROM conversations WHERE id = $1`, convID,
	).Scan(&listerReadAt)
	if listerReadAt == nil {
		t.Error("expected lister_read_at to be set after GET messages")
	}
}

func TestIntegration_ConfirmConversation(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	body := `{"stripe_session_id":"sess_test123"}`
	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/confirm", bytes.NewBufferString(body))
	req.SetPathValue("id", convID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testListerID) // lister confirms
	w := httptest.NewRecorder()
	s.handleConfirmConversation(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// confirmed_at should now be set in DB
	var confirmedAt *time.Time
	var sessionID string
	db.QueryRow(context.Background(),
		`SELECT confirmed_at, stripe_session_id FROM conversations WHERE id = $1`, convID,
	).Scan(&confirmedAt, &sessionID)
	if confirmedAt == nil {
		t.Error("expected confirmed_at to be set after confirmation")
	}
	if sessionID != "sess_test123" {
		t.Errorf("expected stripe_session_id=sess_test123, got %q", sessionID)
	}
}

func TestIntegration_ConfirmConversation_OnlyListerCanConfirm(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	body := `{"stripe_session_id":"sess_test123"}`
	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/confirm", bytes.NewBufferString(body))
	req.SetPathValue("id", convID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID) // renter trying to confirm — should fail
	w := httptest.NewRecorder()
	s.handleConfirmConversation(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 when renter tries to confirm, got %d", w.Code)
	}
}

func TestIntegration_ConfirmConversation_Idempotent(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	s := &server{db: db}

	confirm := func() bool {
		body := `{"stripe_session_id":"sess_abc"}`
		req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/confirm", bytes.NewBufferString(body))
		req.SetPathValue("id", convID)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-User-ID", testListerID)
		w := httptest.NewRecorder()
		s.handleConfirmConversation(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", w.Code)
		}
		var resp struct {
			NewlyConfirmed bool `json:"newly_confirmed"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		return resp.NewlyConfirmed
	}

	if newlyConfirmed := confirm(); !newlyConfirmed {
		t.Error("expected newly_confirmed=true on first confirm")
	}
	var firstConfirmedAt *time.Time
	db.QueryRow(context.Background(), `SELECT confirmed_at FROM conversations WHERE id = $1`, convID).Scan(&firstConfirmedAt)

	if newlyConfirmed := confirm(); newlyConfirmed { // second call — retry/redelivery
		t.Error("expected newly_confirmed=false on repeated confirm")
	}
	var secondConfirmedAt *time.Time
	db.QueryRow(context.Background(), `SELECT confirmed_at FROM conversations WHERE id = $1`, convID).Scan(&secondConfirmedAt)

	if firstConfirmedAt == nil || secondConfirmedAt == nil {
		t.Fatal("confirmed_at should be set after both calls")
	}
	// confirmed_at must not be touched on the second (no-op) call
	if !firstConfirmedAt.Equal(*secondConfirmedAt) {
		t.Errorf("confirmed_at changed on second call: %v → %v", firstConfirmedAt, secondConfirmedAt)
	}
}

