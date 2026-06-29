package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ─── Unit tests for validateListingFields — new fields ───────────────────────

// validBase returns the minimum valid arguments for all fields except
// leaseType, furnished, amenities, and utilitiesIncluded, so tests that
// exercise only those fields can rely on the other fields passing validation.
func validBase() (title, description, address string, rentCents, bedrooms int, bathrooms float64, from, to string) {
	return "A Nice Place To Live", "", "123 Main Street, Austin TX", 120000, 1, 1.0, "", ""
}

func TestValidateListingFields_InvalidLeaseType(t *testing.T) {
	title, desc, addr, rent, beds, baths, from, to := validBase()

	cases := []struct {
		name      string
		leaseType string
		wantCode  string
	}{
		{"empty is valid", "", ""},
		{"whole_place is valid", "whole_place", ""},
		{"private_room is valid", "private_room", ""},
		{"shared_room is valid", "shared_room", ""},
		{"weird is invalid", "weird", "invalid_lease_type"},
		{"garage is invalid", "garage", "invalid_lease_type"},
		{"WHOLE_PLACE (uppercase) is invalid", "WHOLE_PLACE", "invalid_lease_type"},
		{"space-padded value is invalid", " whole_place", "invalid_lease_type"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := validateListingFields(title, desc, addr, rent, beds, baths, from, to, c.leaseType, "", nil, nil)
			if got != c.wantCode {
				t.Errorf("lease_type=%q: expected %q, got %q", c.leaseType, c.wantCode, got)
			}
		})
	}
}

func TestValidateListingFields_InvalidFurnished(t *testing.T) {
	title, desc, addr, rent, beds, baths, from, to := validBase()

	cases := []struct {
		name      string
		furnished string
		wantCode  string
	}{
		{"empty is valid", "", ""},
		{"furnished is valid", "furnished", ""},
		{"partially is valid", "partially", ""},
		{"unfurnished is valid", "unfurnished", ""},
		{"halfway is invalid", "halfway", "invalid_furnished"},
		{"Furnished (uppercase) is invalid", "Furnished", "invalid_furnished"},
		{"semi is invalid", "semi", "invalid_furnished"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := validateListingFields(title, desc, addr, rent, beds, baths, from, to, "", c.furnished, nil, nil)
			if got != c.wantCode {
				t.Errorf("furnished=%q: expected %q, got %q", c.furnished, c.wantCode, got)
			}
		})
	}
}

func TestValidateListingFields_AmenitiesBounds(t *testing.T) {
	title, desc, addr, rent, beds, baths, from, to := validBase()

	// 31 entries (max allowed is 30)
	tooManyAmenities := make([]string, 31)
	for i := range tooManyAmenities {
		tooManyAmenities[i] = "WiFi"
	}

	// exactly 30 is fine
	maxAmenities := make([]string, 30)
	for i := range maxAmenities {
		maxAmenities[i] = "WiFi"
	}

	// 51-rune entry (max allowed per entry is 50)
	longEntry := strings.Repeat("a", 51)

	// 50-rune entry (ok at boundary)
	okEntry := strings.Repeat("a", 50)

	// blank-space-only entry — trims to 0 runes, should reject
	blankEntry := " "

	cases := []struct {
		name     string
		ams      []string
		wantCode string
	}{
		{"nil slice is valid", nil, ""},
		{"empty slice is valid", []string{}, ""},
		{"30 entries is valid", maxAmenities, ""},
		{"31 entries exceeds limit", tooManyAmenities, "invalid_amenities"},
		{"50-rune entry is valid", []string{okEntry}, ""},
		{"51-rune entry exceeds limit", []string{longEntry}, "invalid_amenities"},
		{"whitespace-only entry is invalid", []string{blankEntry}, "invalid_amenities"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := validateListingFields(title, desc, addr, rent, beds, baths, from, to, "", "", c.ams, nil)
			if got != c.wantCode {
				t.Errorf("expected %q, got %q", c.wantCode, got)
			}
		})
	}
}

func TestValidateListingFields_UtilitiesBounds(t *testing.T) {
	title, desc, addr, rent, beds, baths, from, to := validBase()

	// 11 entries (max allowed is 10)
	tooManyUtils := make([]string, 11)
	for i := range tooManyUtils {
		tooManyUtils[i] = "Water"
	}

	// exactly 10 is fine
	maxUtils := make([]string, 10)
	for i := range maxUtils {
		maxUtils[i] = "Water"
	}

	// 51-rune entry (max allowed per entry is 50)
	longEntry := strings.Repeat("a", 51)

	// 50-rune entry (ok at boundary)
	okEntry := strings.Repeat("a", 50)

	cases := []struct {
		name     string
		utils    []string
		wantCode string
	}{
		{"nil slice is valid", nil, ""},
		{"empty slice is valid", []string{}, ""},
		{"10 entries is valid", maxUtils, ""},
		{"11 entries exceeds limit", tooManyUtils, "invalid_utilities_included"},
		{"50-rune entry is valid", []string{okEntry}, ""},
		{"51-rune entry exceeds limit", []string{longEntry}, "invalid_utilities_included"},
		{"whitespace-only entry is invalid", []string{" "}, "invalid_utilities_included"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := validateListingFields(title, desc, addr, rent, beds, baths, from, to, "", "", nil, c.utils)
			if got != c.wantCode {
				t.Errorf("expected %q, got %q", c.wantCode, got)
			}
		})
	}
}

// ─── Integration tests for the new fields ────────────────────────────────────

// TestIntegration_HandleCreate_PersistsWhatsIncluded POSTs all four new fields
// and then GETs the listing back to verify they round-trip correctly.
func TestIntegration_HandleCreate_PersistsWhatsIncluded(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	s := &server{db: db}

	payload := map[string]interface{}{
		"title":              "Furnished Studio Near Campus",
		"description":        "All included",
		"address":            "456 University Ave, Austin TX 78705",
		"university_near":    "UT Austin",
		"rent_cents":         150000,
		"available_from":     "2026-07-01",
		"available_to":       "2026-12-31",
		"bedrooms":           1,
		"bathrooms":          1.0,
		"lease_type":         "private_room",
		"furnished":          "furnished",
		"amenities":          []string{"WiFi", "Parking"},
		"utilities_included": []string{"Water", "Electric"},
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/listings", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreate(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var created map[string]string
	json.NewDecoder(w.Body).Decode(&created)
	id := created["id"]
	t.Cleanup(func() { db.Exec(context.Background(), "DELETE FROM listings WHERE id = $1", id) })

	// GET back
	getReq := httptest.NewRequest(http.MethodGet, "/listings/"+id, nil)
	getReq.SetPathValue("id", id)
	getReq.Header.Set("X-User-ID", testUserID)
	gw := httptest.NewRecorder()
	s.handleGet(gw, getReq)

	if gw.Code != http.StatusOK {
		t.Fatalf("expected 200 on GET, got %d: %s", gw.Code, gw.Body.String())
	}
	var got Listing
	json.NewDecoder(gw.Body).Decode(&got)

	if got.LeaseType != "private_room" {
		t.Errorf("lease_type: want %q, got %q", "private_room", got.LeaseType)
	}
	if got.Furnished != "furnished" {
		t.Errorf("furnished: want %q, got %q", "furnished", got.Furnished)
	}
	if len(got.Amenities) != 2 || got.Amenities[0] != "WiFi" || got.Amenities[1] != "Parking" {
		t.Errorf("amenities: want [WiFi Parking], got %v", got.Amenities)
	}
	if len(got.UtilitiesIncluded) != 2 || got.UtilitiesIncluded[0] != "Water" || got.UtilitiesIncluded[1] != "Electric" {
		t.Errorf("utilities_included: want [Water Electric], got %v", got.UtilitiesIncluded)
	}
}

// TestIntegration_HandleCreate_NullableNewFields POSTs a listing without any
// of the new fields and confirms the GET returns empty strings/arrays
// (backward-compat check).
func TestIntegration_HandleCreate_NullableNewFields(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	s := &server{db: db}

	payload := map[string]interface{}{
		"title":         "Plain Listing No New Fields",
		"address":       "789 Old St, Austin TX 78701",
		"rent_cents":    120000,
		"available_from": "2026-07-01",
		"bedrooms":      1,
		"bathrooms":     1.0,
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/listings", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleCreate(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var created map[string]string
	json.NewDecoder(w.Body).Decode(&created)
	id := created["id"]
	t.Cleanup(func() { db.Exec(context.Background(), "DELETE FROM listings WHERE id = $1", id) })

	getReq := httptest.NewRequest(http.MethodGet, "/listings/"+id, nil)
	getReq.SetPathValue("id", id)
	getReq.Header.Set("X-User-ID", testUserID)
	gw := httptest.NewRecorder()
	s.handleGet(gw, getReq)

	if gw.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", gw.Code, gw.Body.String())
	}
	var got Listing
	json.NewDecoder(gw.Body).Decode(&got)

	if got.LeaseType != "" {
		t.Errorf("expected empty lease_type, got %q", got.LeaseType)
	}
	if got.Furnished != "" {
		t.Errorf("expected empty furnished, got %q", got.Furnished)
	}
	if got.UtilitiesIncluded == nil {
		t.Error("utilities_included should be non-nil empty slice, got nil")
	} else if len(got.UtilitiesIncluded) != 0 {
		t.Errorf("expected empty utilities_included, got %v", got.UtilitiesIncluded)
	}
}

// TestIntegration_HandleUpdate_PatchLeaseType confirms that PATCHing only
// lease_type updates that column and does NOT reset status or scam_score
// (since it's not a trust-relevant field).
func TestIntegration_HandleUpdate_PatchLeaseType(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	listingID := seedTestListing(t, db, testUserID, 120000)
	db.Exec(context.Background(), `UPDATE listings SET status = 'active', scam_score = 0.2 WHERE id = $1`, listingID)

	s := &server{db: db}

	body := `{"lease_type":"private_room"}`
	req := httptest.NewRequest(http.MethodPatch, "/listings/"+listingID, bytes.NewBufferString(body))
	req.SetPathValue("id", listingID)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleUpdate(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var leaseType string
	var status string
	var scamScore float64
	err := db.QueryRow(context.Background(),
		`SELECT COALESCE(lease_type,''), status, scam_score FROM listings WHERE id = $1`, listingID,
	).Scan(&leaseType, &status, &scamScore)
	if err != nil {
		t.Fatalf("failed to fetch listing: %v", err)
	}
	if leaseType != "private_room" {
		t.Errorf("lease_type: want %q, got %q", "private_room", leaseType)
	}
	if status != "active" {
		t.Errorf("status must remain active after non-trust edit, got %q", status)
	}
	if scamScore != 0.2 {
		t.Errorf("scam_score must remain 0.2, got %v", scamScore)
	}
}

// TestIntegration_HandleUpdate_ClearLeaseType confirms that sending
// {"lease_type":""} writes NULL to the DB and GET returns an empty string.
func TestIntegration_HandleUpdate_ClearLeaseType(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	listingID := seedTestListing(t, db, testUserID, 120000)
	// Pre-set lease_type to something
	db.Exec(context.Background(), `UPDATE listings SET lease_type = 'whole_place' WHERE id = $1`, listingID)

	s := &server{db: db}

	body := `{"lease_type":""}`
	req := httptest.NewRequest(http.MethodPatch, "/listings/"+listingID, bytes.NewBufferString(body))
	req.SetPathValue("id", listingID)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleUpdate(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify DB stores NULL
	var leaseType *string
	db.QueryRow(context.Background(), `SELECT lease_type FROM listings WHERE id = $1`, listingID).Scan(&leaseType)
	if leaseType != nil {
		t.Errorf("expected NULL lease_type in DB, got %q", *leaseType)
	}

	// Verify GET returns empty string
	getReq := httptest.NewRequest(http.MethodGet, "/listings/"+listingID, nil)
	getReq.SetPathValue("id", listingID)
	getReq.Header.Set("X-User-ID", testUserID)
	gw := httptest.NewRecorder()
	s.handleGet(gw, getReq)
	if gw.Code != http.StatusOK {
		t.Fatalf("expected 200 on GET, got %d", gw.Code)
	}
	var got Listing
	json.NewDecoder(gw.Body).Decode(&got)
	if got.LeaseType != "" {
		t.Errorf("GET should return empty string for NULL lease_type, got %q", got.LeaseType)
	}
}

// TestIntegration_HandleUpdate_InvalidLeaseType_Rejected confirms that
// PATCHing an invalid lease_type value returns 400 with "invalid_lease_type".
func TestIntegration_HandleUpdate_InvalidLeaseType_Rejected(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	listingID := seedTestListing(t, db, testUserID, 120000)

	s := &server{db: db}

	body := `{"lease_type":"garage"}`
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
	if resp["error"] != "invalid_lease_type" {
		t.Errorf("expected error=invalid_lease_type, got %q", resp["error"])
	}
}

// TestIntegration_HandleUpdate_NewFieldsNonTrustDoesNotResetStatus confirms
// that editing lease_type, furnished, and utilities_included does NOT reset
// status to draft or clear scam_score (they are not trust-relevant fields).
func TestIntegration_HandleUpdate_NewFieldsNonTrustDoesNotResetStatus(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	listingID := seedTestListing(t, db, testUserID, 120000)
	db.Exec(context.Background(), `UPDATE listings SET status = 'active', scam_score = 0.15 WHERE id = $1`, listingID)

	s := &server{db: db}

	body := `{"lease_type":"shared_room","furnished":"furnished","utilities_included":["Water","Gas"]}`
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
		t.Errorf("status should remain active after non-trust edit, got %q", status)
	}
	if scamScore != 0.15 {
		t.Errorf("scam_score should remain 0.15, got %v", scamScore)
	}
}

// TestIntegration_HandleGet_ReturnsNewFields seeds a listing with all four
// new fields directly in the DB and confirms GET returns them correctly.
func TestIntegration_HandleGet_ReturnsNewFields(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)

	var id string
	err := db.QueryRow(context.Background(), `
		INSERT INTO listings
		  (user_id, title, address, rent_cents, available_from, status,
		   lease_type, furnished, amenities, utilities_included)
		VALUES ($1, 'New Fields Test', '10 Elm St, Austin TX', 130000, '2026-07-01', 'active',
		        'whole_place', 'partially', '{"Gym","Pool"}', '{"Internet","Trash"}')
		RETURNING id`,
		testUserID,
	).Scan(&id)
	if err != nil {
		t.Fatalf("seed listing with new fields: %v", err)
	}
	t.Cleanup(func() { db.Exec(context.Background(), "DELETE FROM listings WHERE id = $1", id) })

	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/listings/"+id, nil)
	req.SetPathValue("id", id)
	req.Header.Set("X-User-ID", testUserID)
	w := httptest.NewRecorder()
	s.handleGet(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var got Listing
	json.NewDecoder(w.Body).Decode(&got)

	if got.LeaseType != "whole_place" {
		t.Errorf("lease_type: want %q, got %q", "whole_place", got.LeaseType)
	}
	if got.Furnished != "partially" {
		t.Errorf("furnished: want %q, got %q", "partially", got.Furnished)
	}
	if len(got.Amenities) != 2 {
		t.Errorf("amenities: want 2 items, got %v", got.Amenities)
	}
	if len(got.UtilitiesIncluded) != 2 {
		t.Errorf("utilities_included: want 2 items, got %v", got.UtilitiesIncluded)
	}
}

// TestIntegration_HandleList_IncludesNewFields confirms that the list endpoint
// returns the new fields on each listing row.
func TestIntegration_HandleList_IncludesNewFields(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)

	var id string
	err := db.QueryRow(context.Background(), `
		INSERT INTO listings
		  (user_id, title, address, rent_cents, available_from, status,
		   lease_type, furnished, amenities, utilities_included)
		VALUES ($1, 'List New Fields Test', '20 Pine St, Austin TX', 140000, '2026-07-01', 'active',
		        'private_room', 'unfurnished', '{"WiFi","AC"}', '{"Water"}')
		RETURNING id`,
		testUserID,
	).Scan(&id)
	if err != nil {
		t.Fatalf("seed listing with new fields: %v", err)
	}
	t.Cleanup(func() { db.Exec(context.Background(), "DELETE FROM listings WHERE id = $1", id) })

	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/listings", nil)
	w := httptest.NewRecorder()
	s.handleList(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var listings []Listing
	json.NewDecoder(w.Body).Decode(&listings)

	var found *Listing
	for i := range listings {
		if listings[i].ID == id {
			found = &listings[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("seeded listing %s not found in list response", id)
	}
	if found.LeaseType != "private_room" {
		t.Errorf("lease_type: want %q, got %q", "private_room", found.LeaseType)
	}
	if found.Furnished != "unfurnished" {
		t.Errorf("furnished: want %q, got %q", "unfurnished", found.Furnished)
	}
	if len(found.Amenities) != 2 {
		t.Errorf("amenities: want 2, got %v", found.Amenities)
	}
	if len(found.UtilitiesIncluded) != 1 || found.UtilitiesIncluded[0] != "Water" {
		t.Errorf("utilities_included: want [Water], got %v", found.UtilitiesIncluded)
	}
}

// TestIntegration_HandleListSaved_IncludesNewFields saves a listing that has
// new fields set and confirms the saved-listings API exposes them.
func TestIntegration_HandleListSaved_IncludesNewFields(t *testing.T) {
	db := requireDB(t)
	seedTestUser(t, db)
	// Need a second user to save (owners don't typically save their own, but API
	// allows it — the handler just reads X-User-ID for saved_listings).
	const saverUserID = "00000000-0000-0000-0000-000000000011"
	seedSecondUser(t, db, saverUserID, "saver@university.edu")

	var listingID string
	err := db.QueryRow(context.Background(), `
		INSERT INTO listings
		  (user_id, title, address, rent_cents, available_from, status,
		   lease_type, furnished, amenities, utilities_included)
		VALUES ($1, 'Saved Fields Test', '30 Oak St, Austin TX', 110000, '2026-07-01', 'active',
		        'shared_room', 'furnished', '{"Gym"}', '{"Gas","Internet"}')
		RETURNING id`,
		testUserID,
	).Scan(&listingID)
	if err != nil {
		t.Fatalf("seed listing: %v", err)
	}
	t.Cleanup(func() { db.Exec(context.Background(), "DELETE FROM listings WHERE id = $1", listingID) })

	// Save the listing as the saver user
	_, err = db.Exec(context.Background(),
		`INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		saverUserID, listingID,
	)
	if err != nil {
		t.Fatalf("save listing: %v", err)
	}
	t.Cleanup(func() {
		db.Exec(context.Background(), "DELETE FROM saved_listings WHERE user_id = $1 AND listing_id = $2", saverUserID, listingID)
	})

	s := &server{db: db}

	req := httptest.NewRequest(http.MethodGet, "/saved", nil)
	req.Header.Set("X-User-ID", saverUserID)
	w := httptest.NewRecorder()
	s.handleListSaved(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var saved []SavedListing
	json.NewDecoder(w.Body).Decode(&saved)

	var found *SavedListing
	for i := range saved {
		if saved[i].ID == listingID {
			found = &saved[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("saved listing %s not found in saved-listings response", listingID)
	}
	if found.LeaseType != "shared_room" {
		t.Errorf("lease_type: want %q, got %q", "shared_room", found.LeaseType)
	}
	if found.Furnished != "furnished" {
		t.Errorf("furnished: want %q, got %q", "furnished", found.Furnished)
	}
	if len(found.Amenities) != 1 || found.Amenities[0] != "Gym" {
		t.Errorf("amenities: want [Gym], got %v", found.Amenities)
	}
	if len(found.UtilitiesIncluded) != 2 {
		t.Errorf("utilities_included: want 2 items, got %v", found.UtilitiesIncluded)
	}
}
