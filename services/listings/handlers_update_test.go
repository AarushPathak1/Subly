package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// ── Unit tests (no DB required) ───────────────────────────────────────────────

func TestValidateListingFields_TableDriven(t *testing.T) {
	cases := []struct {
		name          string
		title         string
		description   string
		address       string
		rentCents     int
		bedrooms      int
		bathrooms     float64
		availableFrom string
		availableTo   string
		wantCode      string
	}{
		{"valid", "A Nice Place To Live", "Cozy and bright", "123 Main Street", 120000, 2, 1.5, "2026-06-01", "2026-08-31", ""},
		{"rent too low", "A Nice Place To Live", "", "123 Main Street", 9999, 1, 1, "", "", "invalid_rent_cents"},
		{"rent too high", "A Nice Place To Live", "", "123 Main Street", 5000001, 1, 1, "", "", "invalid_rent_cents"},
		{"rent at min boundary ok", "A Nice Place To Live", "", "123 Main Street", 10000, 1, 1, "", "", ""},
		{"rent at max boundary ok", "A Nice Place To Live", "", "123 Main Street", 5000000, 1, 1, "", "", ""},
		{"bedrooms negative", "A Nice Place To Live", "", "123 Main Street", 120000, -1, 1, "", "", "invalid_bedrooms"},
		{"bedrooms too high", "A Nice Place To Live", "", "123 Main Street", 120000, 21, 1, "", "", "invalid_bedrooms"},
		{"bathrooms negative", "A Nice Place To Live", "", "123 Main Street", 120000, 1, -0.5, "", "", "invalid_bathrooms"},
		{"bathrooms too high", "A Nice Place To Live", "", "123 Main Street", 120000, 1, 20.5, "", "", "invalid_bathrooms"},
		{"available_to before available_from", "A Nice Place To Live", "", "123 Main Street", 120000, 1, 1, "2026-08-01", "2026-07-01", "available_to_before_available_from"},
		{"available_to equals available_from ok", "A Nice Place To Live", "", "123 Main Street", 120000, 1, 1, "2026-08-01", "2026-08-01", ""},
		{"title too short", "Tiny", "", "123 Main Street", 120000, 1, 1, "", "", "invalid_title"},
		{"title too long", string(make([]rune, 201)), "", "123 Main Street", 120000, 1, 1, "", "", "invalid_title"},
		{"description too long", "A Nice Place To Live", string(make([]rune, 5001)), "123 Main Street", 120000, 1, 1, "", "", "invalid_description"},
		{"address too short", "A Nice Place To Live", "", "123", 120000, 1, 1, "", "", "invalid_address"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := validateListingFields(c.title, c.description, c.address, c.rentCents, c.bedrooms, c.bathrooms, c.availableFrom, c.availableTo)
			if got != c.wantCode {
				t.Errorf("expected %q, got %q", c.wantCode, got)
			}
		})
	}
}

func TestHandleCreate_InvalidRentCents_Returns400(t *testing.T) {
	s := &server{}
	body := `{"title":"A Nice Place To Live","address":"123 Main Street","rent_cents":500}`
	req := httptest.NewRequest(http.MethodPost, "/listings", bytes.NewBufferString(body))
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreate(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "invalid_rent_cents" {
		t.Errorf("expected invalid_rent_cents, got %q", resp["error"])
	}
}

func TestHandleCreate_TitleTooShort_Returns400(t *testing.T) {
	s := &server{}
	body := `{"title":"Hi","address":"123 Main Street","rent_cents":120000}`
	req := httptest.NewRequest(http.MethodPost, "/listings", bytes.NewBufferString(body))
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreate(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "invalid_title" {
		t.Errorf("expected invalid_title, got %q", resp["error"])
	}
}

// ── Integration tests (requires DATABASE_URL env var) ────────────────────────

// TestIntegration_HandleUpdate_TrustRelevantChange_ResetsStatusAndScore is the
// C3 regression test: editing title/description/address/rent_cents on an
// active listing with a nonzero scam_score must reset it to draft with
// scam_score=0, even though the caller didn't explicitly request that.
func TestIntegration_HandleUpdate_TrustRelevantChange_ResetsStatusAndScore(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	listingID := seedTestListing(t, db, testUserID, 120000)
	db.Exec(context.Background(), `UPDATE listings SET status = 'active', scam_score = 0.8 WHERE id = $1`, listingID)

	s := &server{db: db}

	body := `{"title":"A Brand New Title For This Place"}`
	req := httptest.NewRequest(http.MethodPatch, "/listings/"+listingID, bytes.NewBufferString(body))
	req.SetPathValue("id", listingID)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleUpdate(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var status string
	var scamScore float64
	err := db.QueryRow(context.Background(),
		`SELECT status, scam_score FROM listings WHERE id = $1`, listingID,
	).Scan(&status, &scamScore)
	if err != nil {
		t.Fatalf("failed to fetch listing: %v", err)
	}
	if status != "draft" {
		t.Errorf("expected status=draft after trust-relevant edit, got %q", status)
	}
	if scamScore != 0 {
		t.Errorf("expected scam_score=0 after trust-relevant edit, got %v", scamScore)
	}
}

// TestIntegration_HandleUpdate_TrustRelevantChange_PausedListingForcedToDraft
// confirms a paused (not just active) listing is also forced back to draft
// on a trust-relevant edit, per spec ("force back to draft so the lister
// knows the listing is pending re-review before going live again").
func TestIntegration_HandleUpdate_TrustRelevantChange_PausedListingForcedToDraft(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	listingID := seedTestListing(t, db, testUserID, 120000)
	db.Exec(context.Background(), `UPDATE listings SET status = 'paused', scam_score = 0.3 WHERE id = $1`, listingID)

	s := &server{db: db}

	body := `{"rent_cents":140000}`
	req := httptest.NewRequest(http.MethodPatch, "/listings/"+listingID, bytes.NewBufferString(body))
	req.SetPathValue("id", listingID)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleUpdate(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var status string
	err := db.QueryRow(context.Background(),
		`SELECT status FROM listings WHERE id = $1`, listingID,
	).Scan(&status)
	if err != nil {
		t.Fatalf("failed to fetch listing: %v", err)
	}
	if status != "draft" {
		t.Errorf("expected status=draft after trust-relevant edit on a paused listing, got %q", status)
	}
}

// TestIntegration_HandleUpdate_NonTrustRelevantChange_DoesNotResetStatus
// confirms editing a field that's NOT trust-relevant (e.g. amenities) leaves
// status/scam_score untouched.
func TestIntegration_HandleUpdate_NonTrustRelevantChange_DoesNotResetStatus(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	listingID := seedTestListing(t, db, testUserID, 120000)
	db.Exec(context.Background(), `UPDATE listings SET status = 'active', scam_score = 0.1 WHERE id = $1`, listingID)

	s := &server{db: db}

	body := `{"amenities":["wifi","laundry"]}`
	req := httptest.NewRequest(http.MethodPatch, "/listings/"+listingID, bytes.NewBufferString(body))
	req.SetPathValue("id", listingID)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleUpdate(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var status string
	var scamScore float64
	err := db.QueryRow(context.Background(),
		`SELECT status, scam_score FROM listings WHERE id = $1`, listingID,
	).Scan(&status, &scamScore)
	if err != nil {
		t.Fatalf("failed to fetch listing: %v", err)
	}
	if status != "active" {
		t.Errorf("expected status to remain active, got %q", status)
	}
	if scamScore != 0.1 {
		t.Errorf("expected scam_score to remain 0.1, got %v", scamScore)
	}
}

// TestIntegration_HandleUpdate_InvalidRentCents_Returns400 confirms H4
// validation applies to handleUpdate, not just handleCreate.
func TestIntegration_HandleUpdate_InvalidRentCents_Returns400(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	listingID := seedTestListing(t, db, testUserID, 120000)

	s := &server{db: db}

	body := `{"rent_cents":5000001}`
	req := httptest.NewRequest(http.MethodPatch, "/listings/"+listingID, bytes.NewBufferString(body))
	req.SetPathValue("id", listingID)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleUpdate(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["error"] != "invalid_rent_cents" {
		t.Errorf("expected invalid_rent_cents, got %q", resp["error"])
	}

	// Confirm the listing was NOT mutated.
	var rentCents int
	db.QueryRow(context.Background(), `SELECT rent_cents FROM listings WHERE id = $1`, listingID).Scan(&rentCents)
	if rentCents != 120000 {
		t.Errorf("expected rent_cents to remain unchanged at 120000, got %d", rentCents)
	}
}

// TestIntegration_HandleUpdate_NotFound_Returns404 confirms a nonexistent
// listing ID 404s instead of panicking now that handleUpdate pre-fetches the
// current row before applying the update.
func TestIntegration_HandleUpdate_NotFound_Returns404(t *testing.T) {
	db := requireDB(t)
	s := &server{db: db}

	body := `{"title":"Doesn't Matter Here"}`
	req := httptest.NewRequest(http.MethodPatch, "/listings/00000000-0000-0000-0000-000000000099", bytes.NewBufferString(body))
	req.SetPathValue("id", "00000000-0000-0000-0000-000000000099")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleUpdate(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}
