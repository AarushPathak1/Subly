package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func softDeleteUser(t *testing.T, db *pgxpool.Pool, id string) {
	t.Helper()
	_, err := db.Exec(context.Background(),
		`UPDATE users SET deleted_at = NOW() WHERE id = $1`, id)
	if err != nil {
		t.Fatalf("softDeleteUser(%s): %v", id, err)
	}
	t.Cleanup(func() {
		db.Exec(context.Background(), "UPDATE users SET deleted_at = NULL WHERE id = $1", id)
	})
}

// ── Conversation counterparty masking ─────────────────────────────────────────

func TestIntegration_GetConversation_MasksSoftDeletedCounterparty(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	softDeleteUser(t, db, testListerID)
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
	if conv.OtherEmail != "[deleted user]" {
		t.Errorf("expected other_email to be masked, got %q", conv.OtherEmail)
	}
}

func TestIntegration_ListConversations_MasksSoftDeletedCounterparty(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)
	softDeleteUser(t, db, testListerID)
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
		t.Fatal("expected at least one conversation")
	}
	if convs[0].OtherEmail != "[deleted user]" {
		t.Errorf("expected other_email to be masked, got %q", convs[0].OtherEmail)
	}
}

// ── Listing visibility for soft-deleted owners ────────────────────────────────

func TestIntegration_HandleList_ExcludesListingsFromSoftDeletedOwner(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	seedTestListing(t, db, testListerID, 120000)
	softDeleteUser(t, db, testListerID)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/listings", nil)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleList(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var listings []Listing
	if err := json.NewDecoder(w.Body).Decode(&listings); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	for _, l := range listings {
		if l.UserID == testListerID {
			t.Errorf("expected listings from soft-deleted owner %s to be excluded from browse results", testListerID)
		}
	}
}

func TestIntegration_HandleGet_ExcludesListingFromSoftDeletedOwner_ForNonOwner(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	softDeleteUser(t, db, testListerID)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/listings/"+listingID, nil)
	req.SetPathValue("id", listingID)
	req.Header.Set("X-User-ID", testUserID) // not the owner
	w := httptest.NewRecorder()
	s.handleGet(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for a listing owned by a soft-deleted user, got %d: %s", w.Code, w.Body.String())
	}
}

// TestIntegration_HandleGet_OwnerCanStillSeeOwnListingAfterSoftDelete confirms
// the soft-deleted-owner filter only hides listings from OTHER viewers — the
// owner themselves can still fetch their own (now-paused) listing directly.
// This matters for any internal/administrative path that might still reach
// this handler with the deleted owner's own X-User-ID (even though in
// production the gateway's /validate check would block this owner's session
// entirely — see the auth-service-level test for that chain).
func TestIntegration_HandleGet_OwnerCanStillSeeOwnListingAfterSoftDelete(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	listingID := seedTestListing(t, db, testUserID, 120000)
	softDeleteUser(t, db, testUserID)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/listings/"+listingID, nil)
	req.SetPathValue("id", listingID)
	req.Header.Set("X-User-ID", testUserID) // the (soft-deleted) owner viewing their own listing
	w := httptest.NewRecorder()
	s.handleGet(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 when the owner views their own listing even after soft-deletion, got %d: %s", w.Code, w.Body.String())
	}
}

// TestIntegration_HandleList_OwnerStillSeesOwnPausedListingsAfterSoftDelete
// confirms that ?user_id=<self> with a matching X-User-ID still returns all
// statuses (including listings paused by DELETE /me's auto-pause), while a
// different viewer querying the same user_id sees nothing (covered by
// TestIntegration_HandleList_ExcludesListingsFromSoftDeletedOwner above).
func TestIntegration_HandleList_OwnerStillSeesOwnPausedListingsAfterSoftDelete(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	listingID := seedTestListing(t, db, testUserID, 120000)
	_, err := db.Exec(context.Background(), "UPDATE listings SET status = 'paused' WHERE id = $1", listingID)
	if err != nil {
		t.Fatalf("failed to pause listing: %v", err)
	}
	softDeleteUser(t, db, testUserID)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/listings?user_id="+testUserID, nil)
	req.Header.Set("X-User-ID", testUserID) // viewing own listings
	w := httptest.NewRecorder()
	s.handleList(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var listings []Listing
	if err := json.NewDecoder(w.Body).Decode(&listings); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	found := false
	for _, l := range listings {
		if l.ID == listingID {
			found = true
			if l.Status != "paused" {
				t.Errorf("expected status 'paused', got %q", l.Status)
			}
		}
	}
	if !found {
		t.Error("expected the soft-deleted owner to still see their own paused listing in their own listings view")
	}
}
