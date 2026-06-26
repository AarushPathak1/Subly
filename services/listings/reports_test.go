package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Fixtures ──────────────────────────────────────────────────────────────────

func cleanupReport(t *testing.T, db *pgxpool.Pool, id string) {
	t.Helper()
	t.Cleanup(func() {
		db.Exec(context.Background(), "DELETE FROM reports WHERE id = $1", id)
	})
}

// ── CreateReport ──────────────────────────────────────────────────────────────

func TestCreateReport_Success(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	s := &server{db: db}

	body := `{"target_kind":"listing","target_id":"` + listingID + `","reason":"scam","details":"Looks fake"}`
	req := httptest.NewRequest(http.MethodPost, "/reports", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreateReport(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["id"] == "" {
		t.Fatal("expected report ID in response")
	}
	cleanupReport(t, db, resp["id"])

	var reporterID, targetKind, targetID, reason, details string
	err := db.QueryRow(context.Background(),
		`SELECT reporter_id, target_kind, target_id, reason, details FROM reports WHERE id = $1`, resp["id"],
	).Scan(&reporterID, &targetKind, &targetID, &reason, &details)
	if err != nil {
		t.Fatalf("could not query report: %v", err)
	}
	if reporterID != testUserID {
		t.Errorf("expected reporter_id=%s, got %s", testUserID, reporterID)
	}
	if targetKind != "listing" {
		t.Errorf("expected target_kind=listing, got %s", targetKind)
	}
	if targetID != listingID {
		t.Errorf("expected target_id=%s, got %s", listingID, targetID)
	}
	if reason != "scam" {
		t.Errorf("expected reason=scam, got %s", reason)
	}
	if details != "Looks fake" {
		t.Errorf("expected details='Looks fake', got %q", details)
	}
}

func TestCreateReport_Duplicate_409(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	s := &server{db: db}

	makeReq := func() *httptest.ResponseRecorder {
		body := `{"target_kind":"listing","target_id":"` + listingID + `","reason":"spam","details":""}`
		req := httptest.NewRequest(http.MethodPost, "/reports", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-User-ID", testUserID)
		w := httptest.NewRecorder()
		s.handleCreateReport(w, req)
		return w
	}

	w1 := makeReq()
	if w1.Code != http.StatusCreated {
		t.Fatalf("expected 201 on first report, got %d: %s", w1.Code, w1.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w1.Body).Decode(&resp)
	cleanupReport(t, db, resp["id"])

	w2 := makeReq()
	if w2.Code != http.StatusConflict {
		t.Errorf("expected 409 on duplicate report, got %d: %s", w2.Code, w2.Body.String())
	}
	var resp2 map[string]string
	json.NewDecoder(w2.Body).Decode(&resp2)
	if resp2["error"] != "already_reported" {
		t.Errorf("expected error=already_reported, got %q", resp2["error"])
	}
}

func TestCreateReport_InvalidKind_400(t *testing.T) {
	s := &server{}
	body := `{"target_kind":"comment","target_id":"00000000-0000-0000-0000-000000000099","reason":"spam"}`
	req := httptest.NewRequest(http.MethodPost, "/reports", bytes.NewBufferString(body))
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreateReport(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "invalid_target_kind" {
		t.Errorf("expected error=invalid_target_kind, got %q", resp["error"])
	}
}

func TestCreateReport_InvalidReason_400(t *testing.T) {
	s := &server{}
	body := `{"target_kind":"listing","target_id":"00000000-0000-0000-0000-000000000099","reason":"annoying"}`
	req := httptest.NewRequest(http.MethodPost, "/reports", bytes.NewBufferString(body))
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreateReport(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "invalid_reason" {
		t.Errorf("expected error=invalid_reason, got %q", resp["error"])
	}
}

func TestCreateReport_MissingUser_401(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodPost, "/reports", bytes.NewBufferString(`{}`))
	w := httptest.NewRecorder()
	s.handleCreateReport(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestCreateReport_NonUUIDTarget_400(t *testing.T) {
	s := &server{}
	body := `{"target_kind":"listing","target_id":"not-a-uuid","reason":"scam"}`
	req := httptest.NewRequest(http.MethodPost, "/reports", bytes.NewBufferString(body))
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreateReport(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "invalid_target_id" {
		t.Errorf("expected error=invalid_target_id, got %q", resp["error"])
	}
}

func TestCreateReport_DetailsTooLong_400(t *testing.T) {
	s := &server{}
	longDetails := strings.Repeat("a", 1001)
	payload, _ := json.Marshal(map[string]interface{}{
		"target_kind": "listing",
		"target_id":   "00000000-0000-0000-0000-000000000099",
		"reason":      "other",
		"details":     longDetails,
	})
	req := httptest.NewRequest(http.MethodPost, "/reports", bytes.NewReader(payload))
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreateReport(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "details_too_long" {
		t.Errorf("expected error=details_too_long, got %q", resp["error"])
	}
}
