package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Unit tests (no DB required) ───────────────────────────────────────────────

func TestHandleHealth(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	s.handleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var body map[string]string
	json.NewDecoder(w.Body).Decode(&body)
	if body["status"] != "ok" {
		t.Errorf("expected status=ok, got %q", body["status"])
	}
	if body["service"] != "listings" {
		t.Errorf("expected service=listings, got %q", body["service"])
	}
}

func TestHandleCreate_MissingUserID(t *testing.T) {
	s := &server{} // no DB needed — middleware check happens first
	body := `{"title":"Test","address":"123 St","rent_cents":120000}`
	req := httptest.NewRequest(http.MethodPost, "/listings", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.handleCreate(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 when X-User-ID is absent, got %d", w.Code)
	}
}

func TestHandleCreate_BadJSON(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodPost, "/listings", bytes.NewBufferString("not-json"))
	req.Header.Set("X-User-ID", "00000000-0000-0000-0000-000000000001")
	w := httptest.NewRecorder()
	s.handleCreate(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for malformed JSON, got %d", w.Code)
	}
}

func TestWriteJSON(t *testing.T) {
	w := httptest.NewRecorder()
	writeJSON(w, http.StatusCreated, map[string]string{"id": "abc"})

	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected application/json, got %q", ct)
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["id"] != "abc" {
		t.Errorf("unexpected body: %v", resp)
	}
}

func TestEnvOr(t *testing.T) {
	if envOr("LISTINGS_TEST_UNSET_VAR", "default") != "default" {
		t.Error("expected fallback value")
	}
	t.Setenv("LISTINGS_TEST_VAR", "set")
	if envOr("LISTINGS_TEST_VAR", "default") != "set" {
		t.Error("expected env value")
	}
}

// ── Integration tests (requires DATABASE_URL env var) ────────────────────────

func requireDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set — skipping integration test")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("could not connect to database: %v", err)
	}
	t.Cleanup(func() { pool.Close() })
	return pool
}

func TestIntegration_CreateAndGetListing(t *testing.T) {
	db := requireDB(t)
	s := &server{db: db}

	// Create a listing
	payload := Listing{
		Title:         "Integration Test Listing",
		Description:   "Created by test suite",
		Address:       "1 Test Ave, Austin TX 78701",
		UniversityNear: "UT Austin",
		RentCents:     150000,
		AvailableFrom: "2026-06-01",
		AvailableTo:   "2026-08-31",
		Bedrooms:      2,
		Bathrooms:     1.0,
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/listings", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", "00000000-0000-0000-0000-000000000001")
	w := httptest.NewRecorder()
	s.handleCreate(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 on create, got %d: %s", w.Code, w.Body.String())
	}

	var created map[string]string
	json.NewDecoder(w.Body).Decode(&created)
	id := created["id"]
	if id == "" {
		t.Fatal("expected a listing ID in response")
	}

	// Clean up
	t.Cleanup(func() {
		db.Exec(context.Background(), "DELETE FROM listings WHERE id = $1", id)
	})

	// Get the listing back
	getReq := httptest.NewRequest(http.MethodGet, "/listings/"+id, nil)
	getReq.SetPathValue("id", id)
	gw := httptest.NewRecorder()
	s.handleGet(gw, getReq)

	if gw.Code != http.StatusOK {
		t.Fatalf("expected 200 on get, got %d", gw.Code)
	}
	var got Listing
	json.NewDecoder(gw.Body).Decode(&got)
	if got.Title != payload.Title {
		t.Errorf("expected title %q, got %q", payload.Title, got.Title)
	}
}

func TestIntegration_ListListings(t *testing.T) {
	db := requireDB(t)
	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/listings", nil)
	w := httptest.NewRecorder()
	s.handleList(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 on list, got %d: %s", w.Code, w.Body.String())
	}
	// Response should be a JSON array (may be empty)
	var listings []Listing
	if err := json.NewDecoder(w.Body).Decode(&listings); err != nil {
		t.Errorf("response body is not a valid JSON array: %v", err)
	}
}
