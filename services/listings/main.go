package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	amqp "github.com/rabbitmq/amqp091-go"

	"github.com/subly/listings/logger"
)

var log = logger.New(logger.ConfigFromEnv("listings"))

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// ─── Types ───────────────────────────────────────────────────────────────────

type Listing struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	Title          string    `json:"title"`
	Description    string    `json:"description"`
	Address        string    `json:"address"`
	UniversityNear string    `json:"university_near"`
	RentCents      int       `json:"rent_cents"`
	AvailableFrom  string    `json:"available_from"`
	AvailableTo    string    `json:"available_to,omitempty"`
	Bedrooms       int       `json:"bedrooms"`
	Bathrooms      float64   `json:"bathrooms"`
	Amenities         []string `json:"amenities"`
	LeaseType         string   `json:"lease_type"`
	Furnished         string   `json:"furnished"`
	UtilitiesIncluded []string `json:"utilities_included"`
	Images            []string `json:"images"`
	Status         string    `json:"status"`
	ScamScore      float64   `json:"scam_score"`
	ViewCount      int       `json:"view_count"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type Conversation struct {
	ID               string     `json:"id"`
	ListingID        string     `json:"listing_id"`
	ListingTitle     string     `json:"listing_title"`
	RenterID         string     `json:"renter_id"`
	ListerID         string     `json:"lister_id"`
	OtherEmail       string     `json:"other_email"`
	LastMessageAt    *time.Time `json:"last_message_at,omitempty"`
	LastMessage      string     `json:"last_message"`
	UnreadCount      int        `json:"unread_count"`
	CreatedAt        time.Time  `json:"created_at"`
	InitialRentCents int        `json:"initial_rent_cents"`
	ConfirmedAt      *time.Time `json:"confirmed_at,omitempty"`
}

type UserProfile struct {
	ID          string    `json:"id"`
	University  string    `json:"university"`
	VibeText    string    `json:"vibe_text"`
	MemberSince time.Time `json:"member_since"`
}

type Message struct {
	ID             string          `json:"id"`
	ConversationID string          `json:"conversation_id"`
	SenderID       string          `json:"sender_id"`
	Body           string          `json:"body"`
	CreatedAt      time.Time       `json:"created_at"`
	Kind           string          `json:"kind"`
	Viewing        json.RawMessage `json:"viewing,omitempty"`
}

// ViewingPayload mirrors the JSON shape stored in messages.viewing.
type ViewingPayload struct {
	ProposedAt  time.Time  `json:"proposed_at"`
	Status      string     `json:"status"`
	RespondedAt *time.Time `json:"responded_at"`
	ResponderID *string    `json:"responder_id"`
	Note        string     `json:"note,omitempty"`
}

type Review struct {
	ID             string    `json:"id"`
	ReviewerID     string    `json:"reviewer_id"`
	ConversationID string    `json:"conversation_id"`
	ListingID      string    `json:"listing_id,omitempty"`
	Rating         int       `json:"rating"`
	Body           string    `json:"body"`
	Published      bool      `json:"published"`
	CreatedAt      time.Time `json:"created_at"`
}

type PublicReview struct {
	ID                  string    `json:"id"`
	Rating              int       `json:"rating"`
	Body                string    `json:"body"`
	CreatedAt           time.Time `json:"created_at"`
	ReviewerDisplayName string    `json:"reviewer_display_name"`
	ReviewerUniversity  string    `json:"reviewer_university"`
	ListingTitle        string    `json:"listing_title"`
}

type ReviewSummary struct {
	Average *float64 `json:"average"`
	Count   int      `json:"count"`
}

type PublicStats struct {
	ListingsTotal        int       `json:"listings_total"`
	UniversitiesTotal    int       `json:"universities_total"`
	MatchSatisfactionPct *int      `json:"match_satisfaction_pct"`
	AvgTimeToMatchHours  *int      `json:"avg_time_to_match_hours"`
	ReviewCount          int       `json:"review_count"`
	AsOf                 time.Time `json:"as_of"`
}

type ReviewEligibility struct {
	Eligible        bool   `json:"eligible"`
	AlreadyReviewed bool   `json:"already_reviewed"`
	Reason          string `json:"reason,omitempty"`
}

type SavedListing struct {
	Listing
	SavedAt time.Time `json:"saved_at"`
}

type CreateReportRequest struct {
	TargetKind string `json:"target_kind"`
	TargetID   string `json:"target_id"`
	Reason     string `json:"reason"`
	Details    string `json:"details"`
}

type Report struct {
	ID            string    `json:"id"`
	ReporterID    string    `json:"reporter_id"`
	ReporterEmail string    `json:"reporter_email,omitempty"`
	TargetKind    string    `json:"target_kind"`
	TargetID      string    `json:"target_id"`
	Reason        string    `json:"reason"`
	Details       string    `json:"details"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
}

type UpdateReportStatusRequest struct {
	Status string `json:"status"`
}

// ─── Server ──────────────────────────────────────────────────────────────────

type server struct {
	db         *pgxpool.Pool
	mq         *amqp.Channel
	mqQueue    string
	mqNewQueue string
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /listings", s.handleList)
	mux.HandleFunc("POST /listings", s.handleCreate)
	mux.HandleFunc("GET /listings/{id}", s.handleGet)
	mux.HandleFunc("PATCH /listings/{id}", s.handleUpdate)
	mux.HandleFunc("DELETE /listings/{id}", s.handleDelete)
	mux.HandleFunc("POST /conversations", s.handleCreateConversation)
	mux.HandleFunc("GET /conversations", s.handleListConversations)
	mux.HandleFunc("GET /conversations/unread_count", s.handleUnreadCount)
	mux.HandleFunc("GET /conversations/{id}", s.handleGetConversation)
	mux.HandleFunc("GET /conversations/{id}/messages", s.handleGetMessages)
	mux.HandleFunc("POST /conversations/{id}/messages", s.handleSendMessage)
	mux.HandleFunc("POST /conversations/{id}/viewings", s.handleProposeViewing)
	mux.HandleFunc("POST /conversations/{id}/viewings/{message_id}/respond", s.handleRespondViewing)
	mux.HandleFunc("POST /conversations/{id}/confirm", s.handleConfirmConversation)
	mux.HandleFunc("GET /users/{id}/profile", s.handleGetUserProfile)
	mux.HandleFunc("POST /reviews", s.handleCreateReview)
	mux.HandleFunc("GET /reviews/eligibility", s.handleReviewEligibility)
	// Registered without a "/public" segment because the gateway's
	// /api/public prefix is stripped entirely before forwarding (see
	// gateway/main.go buildRoutes + http.StripPrefix), unlike /api/listings
	// and /api/messages which forward their remainder verbatim.
	mux.HandleFunc("GET /reviews", s.handleListPublicReviews)
	mux.HandleFunc("GET /reviews/summary", s.handleReviewSummary)
	mux.HandleFunc("GET /stats", s.handlePublicStats)
	mux.HandleFunc("GET /saved", s.handleListSaved)
	mux.HandleFunc("POST /saved", s.handleSaveListing)
	mux.HandleFunc("DELETE /saved/{listing_id}", s.handleUnsaveListing)
	mux.HandleFunc("POST /reports", s.handleCreateReport)
	mux.HandleFunc("GET /reports", s.handleListReports)
	mux.HandleFunc("PATCH /reports/{id}", s.handleUpdateReportStatus)
	return mux
}

// ─── Handlers ────────────────────────────────────────────────────────────────

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "listings"})
}

func (s *server) handleList(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	const selectCols = `SELECT l.id, l.user_id, l.title, l.description, l.address, l.university_near,
	              l.rent_cents, l.available_from::text, l.available_to::text, l.bedrooms, l.bathrooms,
	              l.amenities, l.images, l.status, l.scam_score, l.view_count, l.created_at, l.updated_at,
	              l.lease_type, l.furnished, l.utilities_included
	              FROM listings l JOIN users u ON u.id = l.user_id`

	userID := r.URL.Query().Get("user_id")
	var query string
	var args []any
	if userID != "" {
		requestingUserID := r.Header.Get("X-User-ID")
		if requestingUserID != "" && requestingUserID != userID {
			// Public profile view: only show active listings from a non-deleted owner
			query = selectCols + ` WHERE l.user_id = $1 AND l.status = 'active' AND u.deleted_at IS NULL ORDER BY l.created_at DESC LIMIT 100`
		} else {
			// Own listings: show all statuses regardless of (own) deletion state
			query = selectCols + ` WHERE l.user_id = $1 ORDER BY l.created_at DESC LIMIT 100`
		}
		args = []any{userID}
	} else {
		query = selectCols + ` WHERE l.status = 'active' AND u.deleted_at IS NULL ORDER BY l.created_at DESC LIMIT 50`
	}

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()

	listings := make([]Listing, 0)
	for rows.Next() {
		var l Listing
		var description, universityNear, availableTo sql.NullString
		var lType, furn sql.NullString
		var utils []string
		if err := rows.Scan(&l.ID, &l.UserID, &l.Title, &description, &l.Address,
			&universityNear, &l.RentCents, &l.AvailableFrom, &availableTo,
			&l.Bedrooms, &l.Bathrooms, &l.Amenities, &l.Images,
			&l.Status, &l.ScamScore, &l.ViewCount, &l.CreatedAt, &l.UpdatedAt,
			&lType, &furn, &utils); err != nil {
			writeErr(w, r, http.StatusInternalServerError, err)
			return
		}
		l.Description, l.UniversityNear, l.AvailableTo = description.String, universityNear.String, availableTo.String
		l.LeaseType = lType.String
		l.Furnished = furn.String
		l.UtilitiesIncluded = utils
		if l.UtilitiesIncluded == nil {
			l.UtilitiesIncluded = []string{}
		}
		if r.Header.Get("X-User-ID") != l.UserID {
			l.ScamScore = 0
		}
		listings = append(listings, l)
	}
	writeJSON(w, http.StatusOK, listings)
}

// validateListingFields applies shared bounds/length checks to listing
// create/update payloads. Returns a machine-readable error code (matching
// the {"error": "..."} shape the handlers already write) or "" if valid.
// available_from/available_to are passed as strings (possibly empty, meaning
// "not provided in this request") since both handleCreate and handleUpdate
// work with string-typed date fields.
func validateListingFields(
	title, description, address string,
	rentCents, bedrooms int,
	bathrooms float64,
	availableFrom, availableTo string,
	leaseType, furnished string,
	amenities, utilitiesIncluded []string,
) string {
	if rentCents < 10000 || rentCents > 5000000 {
		return "invalid_rent_cents"
	}
	if bedrooms < 0 || bedrooms > 20 {
		return "invalid_bedrooms"
	}
	if bathrooms < 0.0 || bathrooms > 20.0 {
		return "invalid_bathrooms"
	}
	if availableFrom != "" && availableTo != "" && availableTo < availableFrom {
		return "available_to_before_available_from"
	}
	if n := len([]rune(title)); n < 5 || n > 200 {
		return "invalid_title"
	}
	if n := len([]rune(description)); n > 5000 {
		return "invalid_description"
	}
	if n := len([]rune(address)); n < 5 || n > 500 {
		return "invalid_address"
	}
	if leaseType != "" && leaseType != "whole_place" && leaseType != "private_room" && leaseType != "shared_room" {
		return "invalid_lease_type"
	}
	if furnished != "" && furnished != "furnished" && furnished != "partially" && furnished != "unfurnished" {
		return "invalid_furnished"
	}
	if len(amenities) > 30 {
		return "invalid_amenities"
	}
	for _, a := range amenities {
		if n := len([]rune(strings.TrimSpace(a))); n == 0 || n > 50 {
			return "invalid_amenities"
		}
	}
	if len(utilitiesIncluded) > 10 {
		return "invalid_utilities_included"
	}
	for _, u := range utilitiesIncluded {
		if n := len([]rune(strings.TrimSpace(u))); n == 0 || n > 50 {
			return "invalid_utilities_included"
		}
	}
	return ""
}

func (s *server) handleCreate(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}

	var body Listing
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, http.StatusBadRequest, err)
		return
	}

	if code := validateListingFields(body.Title, body.Description, body.Address, body.RentCents, body.Bedrooms, body.Bathrooms, body.AvailableFrom, body.AvailableTo, body.LeaseType, body.Furnished, body.Amenities, body.UtilitiesIncluded); code != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": code})
		return
	}

	ctx := r.Context()
	var availableTo interface{}
	if body.AvailableTo != "" {
		availableTo = body.AvailableTo
	}
	var leaseTypeVal, furnishedVal interface{}
	if body.LeaseType != "" {
		leaseTypeVal = body.LeaseType
	}
	if body.Furnished != "" {
		furnishedVal = body.Furnished
	}
	var id string
	err := s.db.QueryRow(ctx,
		`INSERT INTO listings
		   (user_id, title, description, address, university_near,
		    rent_cents, available_from, available_to, bedrooms, bathrooms,
		    amenities, lease_type, furnished, utilities_included, images, status)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'draft')
		 RETURNING id`,
		userID, body.Title, body.Description, body.Address, body.UniversityNear,
		body.RentCents, body.AvailableFrom, availableTo,
		body.Bedrooms, body.Bathrooms, body.Amenities, leaseTypeVal, furnishedVal, body.UtilitiesIncluded, body.Images,
	).Scan(&id)
	if err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}

	body.ID = id
	body.UserID = userID
	s.publishScamCheck(id)
	s.publishNewListing(body)

	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (s *server) handleGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	var l Listing
	var description, universityNear, availableTo sql.NullString
	var leaseType, furnished sql.NullString
	var utilitiesIncluded []string
	err := s.db.QueryRow(r.Context(),
		`WITH bumped AS (
		    UPDATE listings
		       SET view_count = view_count + 1
		     WHERE id = $1
		       AND user_id <> $2
		       AND status NOT IN ('draft', 'expired')
		    RETURNING id, user_id, title, description, address, university_near,
		              rent_cents, available_from::text, available_to::text, bedrooms, bathrooms,
		              amenities, images, status, scam_score, view_count, created_at, updated_at,
		              lease_type, furnished, utilities_included
		)
		SELECT * FROM bumped
		UNION ALL
		SELECT id, user_id, title, description, address, university_near,
		       rent_cents, available_from::text, available_to::text, bedrooms, bathrooms,
		       amenities, images, status, scam_score, view_count, created_at, updated_at,
		       lease_type, furnished, utilities_included
		  FROM listings
		 WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM bumped)
		 LIMIT 1`, id, userID,
	).Scan(&l.ID, &l.UserID, &l.Title, &description, &l.Address,
		&universityNear, &l.RentCents, &l.AvailableFrom, &availableTo,
		&l.Bedrooms, &l.Bathrooms, &l.Amenities, &l.Images,
		&l.Status, &l.ScamScore, &l.ViewCount, &l.CreatedAt, &l.UpdatedAt,
		&leaseType, &furnished, &utilitiesIncluded)
	if err != nil {
		writeErr(w, r, http.StatusNotFound, err)
		return
	}
	l.Description, l.UniversityNear, l.AvailableTo = description.String, universityNear.String, availableTo.String
	l.LeaseType = leaseType.String
	l.Furnished = furnished.String
	l.UtilitiesIncluded = utilitiesIncluded
	if l.UtilitiesIncluded == nil {
		l.UtilitiesIncluded = []string{}
	}
	if userID != l.UserID {
		l.ScamScore = 0

		var ownerDeleted bool
		if err := s.db.QueryRow(r.Context(),
			`SELECT deleted_at IS NOT NULL FROM users WHERE id = $1`, l.UserID,
		).Scan(&ownerDeleted); err == nil && ownerDeleted {
			writeErr(w, r, http.StatusNotFound, fmt.Errorf("listing not found"))
			return
		}
	}
	writeJSON(w, http.StatusOK, l)
}

func (s *server) handleUpdate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	userID := r.Header.Get("X-User-ID")

	var body struct {
		Title             *string  `json:"title"`
		Description       *string  `json:"description"`
		Address           *string  `json:"address"`
		UniversityNear    *string  `json:"university_near"`
		RentCents         *int     `json:"rent_cents"`
		AvailableFrom     *string  `json:"available_from"`
		AvailableTo       *string  `json:"available_to"`
		Bedrooms          *int     `json:"bedrooms"`
		Bathrooms         *float64 `json:"bathrooms"`
		Amenities         []string `json:"amenities"`
		Images            []string `json:"images"`
		Status            *string  `json:"status"`
		LeaseType         *string  `json:"lease_type"`
		Furnished         *string  `json:"furnished"`
		UtilitiesIncluded []string `json:"utilities_included"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, http.StatusBadRequest, err)
		return
	}

	ctx := r.Context()

	// Fetch current trust-relevant fields so we can (a) validate the
	// resulting merged values and (b) detect whether title/description/
	// address/rent_cents are actually changing — if so, the listing must be
	// re-scored and re-embedded before it's allowed to be active again.
	var curTitle, curDescription, curAddress string
	var curRentCents int
	if err := s.db.QueryRow(ctx,
		`SELECT title, COALESCE(description, ''), address, rent_cents FROM listings WHERE id = $1`, id,
	).Scan(&curTitle, &curDescription, &curAddress, &curRentCents); err != nil {
		writeErr(w, r, http.StatusNotFound, fmt.Errorf("listing not found"))
		return
	}

	newTitle, newDescription, newAddress := curTitle, curDescription, curAddress
	newRentCents := curRentCents
	if body.Title != nil {
		newTitle = *body.Title
	}
	if body.Description != nil {
		newDescription = *body.Description
	}
	if body.Address != nil {
		newAddress = *body.Address
	}
	if body.RentCents != nil {
		newRentCents = *body.RentCents
	}

	newBedrooms, newBathrooms := 0, 0.0
	var newAvailableFrom, newAvailableTo string
	var curLeaseType, curFurnished sql.NullString
	var curUtilitiesIncluded []string
	if err := s.db.QueryRow(ctx,
		`SELECT bedrooms, bathrooms, available_from::text, COALESCE(available_to::text, ''),
		        lease_type, furnished, utilities_included
		 FROM listings WHERE id = $1`, id,
	).Scan(&newBedrooms, &newBathrooms, &newAvailableFrom, &newAvailableTo,
		&curLeaseType, &curFurnished, &curUtilitiesIncluded); err != nil {
		writeErr(w, r, http.StatusNotFound, fmt.Errorf("listing not found"))
		return
	}
	if body.Bedrooms != nil {
		newBedrooms = *body.Bedrooms
	}
	if body.Bathrooms != nil {
		newBathrooms = *body.Bathrooms
	}
	if body.AvailableFrom != nil {
		newAvailableFrom = *body.AvailableFrom
	}
	if body.AvailableTo != nil {
		newAvailableTo = *body.AvailableTo
	}

	newLeaseType := curLeaseType.String
	newFurnished := curFurnished.String
	newUtilitiesIncluded := curUtilitiesIncluded
	if body.LeaseType != nil {
		newLeaseType = *body.LeaseType
	}
	if body.Furnished != nil {
		newFurnished = *body.Furnished
	}
	if body.UtilitiesIncluded != nil {
		newUtilitiesIncluded = body.UtilitiesIncluded
	}

	newAmenities := body.Amenities

	if code := validateListingFields(newTitle, newDescription, newAddress, newRentCents, newBedrooms, newBathrooms, newAvailableFrom, newAvailableTo, newLeaseType, newFurnished, newAmenities, newUtilitiesIncluded); code != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": code})
		return
	}

	trustRelevantChange := newTitle != curTitle || newDescription != curDescription ||
		newAddress != curAddress || newRentCents != curRentCents

	setClauses := []string{"updated_at = NOW()"}
	args := []any{}
	idx := 1

	add := func(col string, val any) {
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", col, idx))
		args = append(args, val)
		idx++
	}

	if body.Title != nil {
		add("title", *body.Title)
	}
	if body.Description != nil {
		add("description", *body.Description)
	}
	if body.Address != nil {
		add("address", *body.Address)
	}
	if body.UniversityNear != nil {
		add("university_near", *body.UniversityNear)
	}
	if body.RentCents != nil {
		add("rent_cents", *body.RentCents)
	}
	if body.AvailableFrom != nil {
		add("available_from", *body.AvailableFrom)
	}
	if body.AvailableTo != nil {
		add("available_to", *body.AvailableTo)
	}
	if body.Bedrooms != nil {
		add("bedrooms", *body.Bedrooms)
	}
	if body.Bathrooms != nil {
		add("bathrooms", *body.Bathrooms)
	}
	if body.Amenities != nil {
		add("amenities", body.Amenities)
	}
	if body.Images != nil {
		add("images", body.Images)
	}
	if body.Status != nil {
		add("status", *body.Status)
	}
	if body.LeaseType != nil {
		var v interface{}
		if *body.LeaseType != "" {
			v = *body.LeaseType
		}
		add("lease_type", v)
	}
	if body.Furnished != nil {
		var v interface{}
		if *body.Furnished != "" {
			v = *body.Furnished
		}
		add("furnished", v)
	}
	if body.UtilitiesIncluded != nil {
		add("utilities_included", body.UtilitiesIncluded)
	}

	// A trust-relevant edit invalidates the existing scam score and trust
	// badge — force the listing back to draft (even if it was active/paused/
	// leased) and reset scam_score so it can't keep riding a score that no
	// longer reflects the current content. This overrides any status the
	// caller explicitly requested in this same request.
	if trustRelevantChange {
		add("status", "draft")
		add("scam_score", 0)
	}

	// Build WHERE: match id, and if gateway provided X-User-ID enforce ownership
	where := fmt.Sprintf("id = $%d", idx)
	args = append(args, id)
	idx++
	if userID != "" {
		where += fmt.Sprintf(" AND user_id = $%d", idx)
		args = append(args, userID)
	}

	q := fmt.Sprintf("UPDATE listings SET %s WHERE %s",
		joinStrings(setClauses, ", "), where)

	tag, err := s.db.Exec(ctx, q, args...)
	if err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeErr(w, r, http.StatusNotFound, fmt.Errorf("listing not found or not owned by you"))
		return
	}

	if trustRelevantChange {
		s.publishScamCheck(id)
		l, err := s.fetchListingForEmbedding(ctx, id)
		if err == nil {
			s.publishNewListing(l)
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"id": id})
}

// fetchListingForEmbedding reloads the full listing row after an update so
// the re-embedding payload published to listings.new reflects the
// post-update content (title/description/etc.), not the stale in-memory
// values from before the edit.
func (s *server) fetchListingForEmbedding(ctx context.Context, id string) (Listing, error) {
	var l Listing
	var description, universityNear, availableTo sql.NullString
	var leaseType, furnished sql.NullString
	var utilitiesIncluded []string
	err := s.db.QueryRow(ctx,
		`SELECT id, user_id, title, description, address, university_near,
		        rent_cents, available_from::text, available_to::text, bedrooms, bathrooms,
		        amenities, images, status, scam_score, view_count, created_at, updated_at,
		        lease_type, furnished, utilities_included
		   FROM listings WHERE id = $1`, id,
	).Scan(&l.ID, &l.UserID, &l.Title, &description, &l.Address,
		&universityNear, &l.RentCents, &l.AvailableFrom, &availableTo,
		&l.Bedrooms, &l.Bathrooms, &l.Amenities, &l.Images,
		&l.Status, &l.ScamScore, &l.ViewCount, &l.CreatedAt, &l.UpdatedAt,
		&leaseType, &furnished, &utilitiesIncluded)
	if err != nil {
		return Listing{}, err
	}
	l.Description, l.UniversityNear, l.AvailableTo = description.String, universityNear.String, availableTo.String
	l.LeaseType = leaseType.String
	l.Furnished = furnished.String
	l.UtilitiesIncluded = utilitiesIncluded
	if l.UtilitiesIncluded == nil {
		l.UtilitiesIncluded = []string{}
	}
	return l, nil
}

func joinStrings(ss []string, sep string) string {
	result := ""
	for i, s := range ss {
		if i > 0 {
			result += sep
		}
		result += s
	}
	return result
}

func (s *server) handleDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	tag, err := s.db.Exec(r.Context(), `DELETE FROM listings WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeErr(w, r, http.StatusNotFound, fmt.Errorf("listing not found or not owned by you"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Conversation handlers ───────────────────────────────────────────────────

func (s *server) handleCreateConversation(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	var body struct {
		ListingID string `json:"listing_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ListingID == "" {
		writeErr(w, r, http.StatusBadRequest, fmt.Errorf("listing_id required"))
		return
	}
	ctx := r.Context()

	var listerID string
	var rentCents int
	err := s.db.QueryRow(ctx, `SELECT user_id, rent_cents FROM listings WHERE id = $1`, body.ListingID).Scan(&listerID, &rentCents)
	if err != nil {
		writeErr(w, r, http.StatusNotFound, fmt.Errorf("listing not found"))
		return
	}
	if listerID == userID {
		writeErr(w, r, http.StatusBadRequest, fmt.Errorf("cannot message your own listing"))
		return
	}

	// Insert or get existing — upsert trick: DO UPDATE with a no-op to get RETURNING on conflict
	var convID string
	err = s.db.QueryRow(ctx, `
		INSERT INTO conversations (listing_id, renter_id, lister_id, initial_rent_cents)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (listing_id, renter_id) DO UPDATE SET listing_id = EXCLUDED.listing_id
		RETURNING id`,
		body.ListingID, userID, listerID, rentCents,
	).Scan(&convID)
	if err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": convID})
}

func (s *server) handleListConversations(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT
			c.id, c.listing_id, l.title,
			c.renter_id, c.lister_id,
			CASE
				WHEN c.renter_id = $1 AND ul.deleted_at IS NOT NULL THEN '[deleted user]'
				WHEN c.lister_id = $1 AND ur.deleted_at IS NOT NULL THEN '[deleted user]'
				WHEN c.confirmed_at IS NOT NULL AND c.renter_id = $1 THEN ul.email
				WHEN c.confirmed_at IS NOT NULL THEN ur.email
				WHEN c.renter_id = $1 THEN SPLIT_PART(ul.email, '@', 1)
				ELSE SPLIT_PART(ur.email, '@', 1)
			END,
			c.last_message_at, c.created_at,
			COALESCE(m.body, ''),
			COALESCE(unread.cnt, 0)::int
		FROM conversations c
		JOIN listings l  ON l.id  = c.listing_id
		JOIN users ur    ON ur.id = c.renter_id
		JOIN users ul    ON ul.id = c.lister_id
		LEFT JOIN LATERAL (
			SELECT body FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
		) m ON true
		LEFT JOIN LATERAL (
			SELECT COUNT(*)::int AS cnt FROM messages
			WHERE conversation_id = c.id
			  AND sender_id != $1
			  AND created_at > COALESCE(
				  CASE WHEN c.renter_id = $1 THEN c.renter_read_at ELSE c.lister_read_at END,
				  '-infinity'::timestamptz
			  )
		) unread ON true
		WHERE c.renter_id = $1 OR c.lister_id = $1
		ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
		userID)
	if err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()

	convs := make([]Conversation, 0)
	for rows.Next() {
		var c Conversation
		var lastMsgAt *time.Time
		if err := rows.Scan(&c.ID, &c.ListingID, &c.ListingTitle,
			&c.RenterID, &c.ListerID, &c.OtherEmail,
			&lastMsgAt, &c.CreatedAt, &c.LastMessage, &c.UnreadCount); err != nil {
			writeErr(w, r, http.StatusInternalServerError, err)
			return
		}
		c.LastMessageAt = lastMsgAt
		convs = append(convs, c)
	}
	writeJSON(w, http.StatusOK, convs)
}

// handleUnreadCount returns just the total unread-message count across all
// of the caller's conversations, so AppNav doesn't need to fetch and sum the
// full conversation list on every page load.
func (s *server) handleUnreadCount(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}

	var count int
	err := s.db.QueryRow(r.Context(), `
		SELECT COALESCE(SUM(unread.cnt), 0)::int
		FROM conversations c
		LEFT JOIN LATERAL (
			SELECT COUNT(*)::int AS cnt FROM messages
			WHERE conversation_id = c.id
			  AND sender_id != $1
			  AND created_at > COALESCE(
				  CASE WHEN c.renter_id = $1 THEN c.renter_read_at ELSE c.lister_read_at END,
				  '-infinity'::timestamptz
			  )
		) unread ON true
		WHERE c.renter_id = $1 OR c.lister_id = $1`,
		userID,
	).Scan(&count)
	if err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"count": count})
}

func (s *server) handleGetConversation(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	var c Conversation
	var lastMsgAt *time.Time
	var confirmedAt *time.Time
	err := s.db.QueryRow(r.Context(), `
		SELECT c.id, c.listing_id, l.title,
		       c.renter_id, c.lister_id,
		       CASE
		           WHEN c.renter_id = $2 AND ul.deleted_at IS NOT NULL THEN '[deleted user]'
		           WHEN c.lister_id = $2 AND ur.deleted_at IS NOT NULL THEN '[deleted user]'
		           WHEN c.confirmed_at IS NOT NULL AND c.renter_id = $2 THEN ul.email
		           WHEN c.confirmed_at IS NOT NULL THEN ur.email
		           WHEN c.renter_id = $2 THEN SPLIT_PART(ul.email, '@', 1)
		           ELSE SPLIT_PART(ur.email, '@', 1)
		       END,
		       c.last_message_at, c.created_at, '', 0,
		       c.initial_rent_cents, c.confirmed_at
		FROM conversations c
		JOIN listings l  ON l.id  = c.listing_id
		JOIN users ur    ON ur.id = c.renter_id
		JOIN users ul    ON ul.id = c.lister_id
		WHERE c.id = $1 AND (c.renter_id = $2 OR c.lister_id = $2)`,
		id, userID,
	).Scan(&c.ID, &c.ListingID, &c.ListingTitle,
		&c.RenterID, &c.ListerID, &c.OtherEmail,
		&lastMsgAt, &c.CreatedAt, &c.LastMessage, &c.UnreadCount,
		&c.InitialRentCents, &confirmedAt)
	if err != nil {
		writeErr(w, r, http.StatusNotFound, fmt.Errorf("conversation not found"))
		return
	}
	c.LastMessageAt = lastMsgAt
	c.ConfirmedAt = confirmedAt
	writeJSON(w, http.StatusOK, c)
}

func (s *server) handleGetMessages(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	ctx := r.Context()

	// Verify user is a party and mark as read
	var renterID, listerID string
	err := s.db.QueryRow(ctx, `SELECT renter_id, lister_id FROM conversations WHERE id = $1`, id).Scan(&renterID, &listerID)
	if err != nil {
		writeErr(w, r, http.StatusNotFound, fmt.Errorf("conversation not found"))
		return
	}
	if renterID != userID && listerID != userID {
		writeErr(w, r, http.StatusForbidden, fmt.Errorf("access denied"))
		return
	}

	col := "lister_read_at"
	if renterID == userID {
		col = "renter_read_at"
	}
	s.db.Exec(ctx, fmt.Sprintf(`UPDATE conversations SET %s = NOW() WHERE id = $1`, col), id)

	rows, err := s.db.Query(ctx,
		`SELECT id, conversation_id, sender_id, body, created_at, kind, viewing
		 FROM messages WHERE conversation_id = $1
		 ORDER BY created_at ASC LIMIT 100`, id)
	if err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()

	msgs := make([]Message, 0)
	for rows.Next() {
		var m Message
		var viewing []byte
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Body, &m.CreatedAt, &m.Kind, &viewing); err != nil {
			writeErr(w, r, http.StatusInternalServerError, err)
			return
		}
		if viewing != nil {
			m.Viewing = json.RawMessage(viewing)
		}
		msgs = append(msgs, m)
	}
	writeJSON(w, http.StatusOK, msgs)
}

func (s *server) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	var body struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Body) == "" {
		writeErr(w, r, http.StatusBadRequest, fmt.Errorf("body required"))
		return
	}
	if len([]rune(strings.TrimSpace(body.Body))) > 2000 {
		writeErr(w, r, http.StatusBadRequest, fmt.Errorf("message body exceeds 2000 character limit"))
		return
	}
	ctx := r.Context()

	var renterID, listerID, listingTitle string
	err := s.db.QueryRow(ctx, `
		SELECT c.renter_id, c.lister_id, l.title
		FROM conversations c
		JOIN listings l ON l.id = c.listing_id
		WHERE c.id = $1`, id).Scan(&renterID, &listerID, &listingTitle)
	if err != nil {
		writeErr(w, r, http.StatusNotFound, fmt.Errorf("conversation not found"))
		return
	}
	if renterID != userID && listerID != userID {
		writeErr(w, r, http.StatusForbidden, fmt.Errorf("access denied"))
		return
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}
	defer tx.Rollback(ctx)

	var msg Message
	err = tx.QueryRow(ctx,
		`INSERT INTO messages (conversation_id, sender_id, body, kind)
		 VALUES ($1, $2, $3, 'text') RETURNING id, conversation_id, sender_id, body, created_at, kind`,
		id, userID, strings.TrimSpace(body.Body),
	).Scan(&msg.ID, &msg.ConversationID, &msg.SenderID, &msg.Body, &msg.CreatedAt, &msg.Kind)
	if err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}

	if _, err := tx.Exec(ctx, `UPDATE conversations SET last_message_at = NOW() WHERE id = $1`, id); err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}

	recipientID := listerID
	if userID == listerID {
		recipientID = renterID
	}
	s.publishNotification("notifications.new_message", map[string]string{
		"recipient_id":    recipientID,
		"sender_id":       userID,
		"listing_title":   listingTitle,
		"conversation_id": id,
	})

	writeJSON(w, http.StatusCreated, msg)
}

func (s *server) handleProposeViewing(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	var body struct {
		ProposedAt string `json:"proposed_at"`
		Note       string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_proposed_at"})
		return
	}
	proposedAt, err := time.Parse(time.RFC3339, body.ProposedAt)
	if err != nil || proposedAt.Before(time.Now().Add(-5*time.Minute)) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_proposed_at"})
		return
	}
	note := strings.TrimSpace(body.Note)
	if len([]rune(note)) > 280 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "note_too_long"})
		return
	}
	ctx := r.Context()

	var renterID, listerID, listingTitle string
	var confirmedAt *time.Time
	err = s.db.QueryRow(ctx, `
		SELECT c.renter_id, c.lister_id, l.title, c.confirmed_at
		FROM conversations c
		JOIN listings l ON l.id = c.listing_id
		WHERE c.id = $1`, id).Scan(&renterID, &listerID, &listingTitle, &confirmedAt)
	if err != nil {
		writeErr(w, r, http.StatusNotFound, fmt.Errorf("conversation not found"))
		return
	}
	if renterID != userID && listerID != userID {
		writeErr(w, r, http.StatusForbidden, fmt.Errorf("access denied"))
		return
	}
	if confirmedAt != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "conversation_confirmed"})
		return
	}

	viewingPayload, _ := json.Marshal(ViewingPayload{
		ProposedAt: proposedAt,
		Status:     "pending",
		Note:       note,
	})
	fallbackBody := fmt.Sprintf("Proposed viewing: %s", proposedAt.Local().Format("2006-01-02 15:04 MST"))

	tx, err := s.db.Begin(ctx)
	if err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1::text))`, id); err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}

	if _, err := tx.Exec(ctx, `
		UPDATE messages SET viewing = jsonb_set(viewing, '{status}', '"superseded"')
		WHERE conversation_id = $1 AND kind = 'viewing_proposal' AND viewing->>'status' = 'pending'`,
		id); err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}

	var msg Message
	var viewing []byte
	err = tx.QueryRow(ctx,
		`INSERT INTO messages (conversation_id, sender_id, body, kind, viewing)
		 VALUES ($1, $2, $3, 'viewing_proposal', $4)
		 RETURNING id, conversation_id, sender_id, body, created_at, kind, viewing`,
		id, userID, fallbackBody, viewingPayload,
	).Scan(&msg.ID, &msg.ConversationID, &msg.SenderID, &msg.Body, &msg.CreatedAt, &msg.Kind, &viewing)
	if err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}
	if viewing != nil {
		msg.Viewing = json.RawMessage(viewing)
	}

	if _, err := tx.Exec(ctx, `UPDATE conversations SET last_message_at = NOW() WHERE id = $1`, id); err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}

	recipientID := listerID
	if userID == listerID {
		recipientID = renterID
	}
	s.publishNotification("notifications.new_message", map[string]string{
		"recipient_id":    recipientID,
		"sender_id":       userID,
		"listing_title":   listingTitle,
		"conversation_id": id,
	})

	writeJSON(w, http.StatusCreated, msg)
}

func (s *server) handleRespondViewing(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	messageID := r.PathValue("message_id")
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	var body struct {
		Action string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_action"})
		return
	}
	var status string
	switch body.Action {
	case "accept":
		status = "accepted"
	case "decline":
		status = "declined"
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_action"})
		return
	}
	ctx := r.Context()

	var renterID, listerID, listingTitle string
	err := s.db.QueryRow(ctx, `
		SELECT c.renter_id, c.lister_id, l.title
		FROM conversations c
		JOIN listings l ON l.id = c.listing_id
		WHERE c.id = $1`, id).Scan(&renterID, &listerID, &listingTitle)
	if err != nil {
		writeErr(w, r, http.StatusNotFound, fmt.Errorf("conversation not found"))
		return
	}
	if renterID != userID && listerID != userID {
		writeErr(w, r, http.StatusForbidden, fmt.Errorf("access denied"))
		return
	}

	var msg Message
	var viewing []byte
	err = s.db.QueryRow(ctx, `
		WITH updated AS (
		    UPDATE messages
		       SET viewing = viewing || jsonb_build_object(
		             'status', $3::text, 'responded_at', to_jsonb(NOW()), 'responder_id', to_jsonb($4::uuid))
		     WHERE id = $1 AND conversation_id = $2 AND kind = 'viewing_proposal'
		       AND sender_id <> $4 AND viewing->>'status' = 'pending'
		     RETURNING id, conversation_id, sender_id, body, created_at, kind, viewing
		)
		SELECT * FROM updated`,
		messageID, id, status, userID,
	).Scan(&msg.ID, &msg.ConversationID, &msg.SenderID, &msg.Body, &msg.CreatedAt, &msg.Kind, &viewing)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			writeErr(w, r, http.StatusInternalServerError, err)
			return
		}
		// Disambiguate why zero rows were updated.
		var senderID, existingStatus string
		lookupErr := s.db.QueryRow(ctx, `
			SELECT sender_id, COALESCE(viewing->>'status', '')
			FROM messages WHERE id = $1 AND conversation_id = $2 AND kind = 'viewing_proposal'`,
			messageID, id,
		).Scan(&senderID, &existingStatus)
		if lookupErr != nil {
			writeErr(w, r, http.StatusNotFound, fmt.Errorf("viewing proposal not found"))
			return
		}
		if senderID == userID {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "cannot_respond_to_own_proposal"})
			return
		}
		writeJSON(w, http.StatusConflict, map[string]string{"error": "proposal_not_pending"})
		return
	}
	if viewing != nil {
		msg.Viewing = json.RawMessage(viewing)
	}

	recipientID := msg.SenderID
	s.publishNotification("notifications.viewing_responded", map[string]string{
		"recipient_id":    recipientID,
		"responder_id":    userID,
		"conversation_id": id,
		"message_id":      msg.ID,
		"status":          status,
		"listing_title":   listingTitle,
	})

	writeJSON(w, http.StatusOK, msg)
}

func (s *server) handleConfirmConversation(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	userID := r.Header.Get("X-User-ID")
	isInternal := r.Header.Get("X-Internal-Call") == "true"
	if userID == "" && !isInternal {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	var body struct {
		StripeSessionID string `json:"stripe_session_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, http.StatusBadRequest, fmt.Errorf("invalid body"))
		return
	}
	ctx := r.Context()

	var listerID, renterID, listingTitle string
	if err := s.db.QueryRow(ctx, `
		SELECT c.lister_id, c.renter_id, l.title
		FROM conversations c
		JOIN listings l ON l.id = c.listing_id
		WHERE c.id = $1`, id).Scan(&listerID, &renterID, &listingTitle); err != nil {
		writeErr(w, r, http.StatusNotFound, fmt.Errorf("conversation not found"))
		return
	}
	if !isInternal && listerID != userID {
		writeErr(w, r, http.StatusForbidden, fmt.Errorf("only the lister can confirm a match"))
		return
	}

	// Idempotent: preserve existing confirmed_at if already set, and report
	// whether this call was the one that newly confirmed it so callers
	// (e.g. the Stripe webhook) can avoid re-publishing on retries.
	var newlyConfirmed bool
	err := s.db.QueryRow(ctx, `
		UPDATE conversations
		SET confirmed_at      = NOW(),
		    stripe_session_id = COALESCE(stripe_session_id, $2)
		WHERE id = $1 AND confirmed_at IS NULL
		RETURNING true`,
		id, body.StripeSessionID,
	).Scan(&newlyConfirmed)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			newlyConfirmed = false // already confirmed; idempotent no-op
		} else {
			writeErr(w, r, http.StatusInternalServerError, err)
			return
		}
	}

	if newlyConfirmed {
		s.publishNotification("notifications.match_confirmed", map[string]interface{}{
			"lister_id":       listerID,
			"renter_id":       renterID,
			"listing_title":   listingTitle,
			"conversation_id": id,
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "confirmed", "newly_confirmed": newlyConfirmed})
}

// ─── User profile handler ────────────────────────────────────────────────────

func (s *server) handleGetUserProfile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var p UserProfile
	err := s.db.QueryRow(r.Context(), `
		SELECT u.id,
		       COALESCE(up.university, u.university, ''),
		       COALESCE(up.vibe_text, ''),
		       u.created_at
		FROM users u
		LEFT JOIN user_profiles up ON up.user_id = u.id
		WHERE u.id = $1 AND u.edu_verified = true`, id,
	).Scan(&p.ID, &p.University, &p.VibeText, &p.MemberSince)
	if err != nil {
		writeErr(w, r, http.StatusNotFound, fmt.Errorf("user not found"))
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// ─── Review handlers ─────────────────────────────────────────────────────────

func (s *server) handleCreateReview(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	var body struct {
		ConversationID string `json:"conversation_id"`
		Rating         int    `json:"rating"`
		Body           string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, http.StatusBadRequest, fmt.Errorf("invalid body"))
		return
	}
	if body.ConversationID == "" {
		writeErr(w, r, http.StatusBadRequest, fmt.Errorf("conversation_id required"))
		return
	}
	if body.Rating < 1 || body.Rating > 5 {
		writeErr(w, r, http.StatusBadRequest, fmt.Errorf("rating must be between 1 and 5"))
		return
	}
	trimmedBody := strings.TrimSpace(body.Body)
	if len([]rune(trimmedBody)) > 1000 {
		writeErr(w, r, http.StatusBadRequest, fmt.Errorf("review body exceeds 1000 character limit"))
		return
	}
	ctx := r.Context()

	var renterID, listingID string
	var confirmedAt *time.Time
	err := s.db.QueryRow(ctx, `
		SELECT renter_id, listing_id, confirmed_at
		FROM conversations WHERE id = $1`, body.ConversationID,
	).Scan(&renterID, &listingID, &confirmedAt)
	if err != nil {
		writeErr(w, r, http.StatusNotFound, fmt.Errorf("conversation not found"))
		return
	}
	if renterID != userID {
		writeErr(w, r, http.StatusForbidden, fmt.Errorf("only the renter can leave a review"))
		return
	}
	if confirmedAt == nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "conversation_not_confirmed"})
		return
	}

	var id string
	err = s.db.QueryRow(ctx, `
		INSERT INTO reviews (reviewer_id, conversation_id, listing_id, rating, body)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`,
		userID, body.ConversationID, listingID, body.Rating, trimmedBody,
	).Scan(&id)
	if err != nil {
		if isUniqueViolation(err) {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "already_reviewed"})
			return
		}
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (s *server) handleCreateReport(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	var body CreateReportRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, http.StatusBadRequest, fmt.Errorf("invalid body"))
		return
	}
	switch body.TargetKind {
	case "listing", "user", "message":
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_target_kind"})
		return
	}
	if !uuidRe.MatchString(body.TargetID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_target_id"})
		return
	}
	switch body.Reason {
	case "scam", "spam", "harassment", "inappropriate", "other":
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_reason"})
		return
	}
	trimmedDetails := strings.TrimSpace(body.Details)
	if len([]rune(trimmedDetails)) > 1000 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "details_too_long"})
		return
	}
	ctx := r.Context()

	var id string
	err := s.db.QueryRow(ctx, `
		INSERT INTO reports (reporter_id, target_kind, target_id, reason, details)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`,
		userID, body.TargetKind, body.TargetID, body.Reason, trimmedDetails,
	).Scan(&id)
	if err != nil {
		if isUniqueViolation(err) {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "already_reported"})
			return
		}
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// handleListReports is an admin-only endpoint reached via the gateway's
// internal-secret bypass — the web app's admin pages call this with
// X-Internal-Secret (validated by the gateway, which then sets
// X-Internal-Call: true), the same mechanism used elsewhere in this service
// for ownership bypass (see handleConfirmConversation).
func (s *server) handleListReports(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Internal-Call") != "true" {
		writeErr(w, r, http.StatusForbidden, fmt.Errorf("admin access required"))
		return
	}

	rows, err := s.db.Query(r.Context(), `
		SELECT rp.id, rp.reporter_id, COALESCE(u.email, ''), rp.target_kind, rp.target_id,
		       rp.reason, rp.details, rp.status, rp.created_at
		FROM reports rp
		LEFT JOIN users u ON u.id = rp.reporter_id
		ORDER BY rp.created_at DESC
		LIMIT 200`)
	if err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()

	reports := make([]Report, 0)
	for rows.Next() {
		var rep Report
		if err := rows.Scan(&rep.ID, &rep.ReporterID, &rep.ReporterEmail, &rep.TargetKind,
			&rep.TargetID, &rep.Reason, &rep.Details, &rep.Status, &rep.CreatedAt); err != nil {
			writeErr(w, r, http.StatusInternalServerError, err)
			return
		}
		reports = append(reports, rep)
	}
	writeJSON(w, http.StatusOK, reports)
}

// handleUpdateReportStatus is the admin-only counterpart to handleListReports
// — same X-Internal-Call gate.
func (s *server) handleUpdateReportStatus(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Internal-Call") != "true" {
		writeErr(w, r, http.StatusForbidden, fmt.Errorf("admin access required"))
		return
	}

	id := r.PathValue("id")
	var body UpdateReportStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, http.StatusBadRequest, fmt.Errorf("invalid body"))
		return
	}
	switch body.Status {
	case "reviewed", "dismissed", "actioned":
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_status"})
		return
	}

	var rep Report
	err := s.db.QueryRow(r.Context(), `
		UPDATE reports SET status = $1 WHERE id = $2
		RETURNING id, reporter_id, target_kind, target_id, reason, details, status, created_at`,
		body.Status, id,
	).Scan(&rep.ID, &rep.ReporterID, &rep.TargetKind, &rep.TargetID,
		&rep.Reason, &rep.Details, &rep.Status, &rep.CreatedAt)
	if err != nil {
		writeErr(w, r, http.StatusNotFound, fmt.Errorf("report not found"))
		return
	}
	writeJSON(w, http.StatusOK, rep)
}

func (s *server) handleReviewEligibility(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	conversationID := r.URL.Query().Get("conversation_id")
	if conversationID == "" {
		writeErr(w, r, http.StatusBadRequest, fmt.Errorf("conversation_id required"))
		return
	}
	ctx := r.Context()

	var renterID string
	var confirmedAt *time.Time
	err := s.db.QueryRow(ctx, `
		SELECT renter_id, confirmed_at
		FROM conversations WHERE id = $1`, conversationID,
	).Scan(&renterID, &confirmedAt)
	if err != nil {
		writeJSON(w, http.StatusOK, ReviewEligibility{Eligible: false, AlreadyReviewed: false, Reason: "not_found"})
		return
	}
	if renterID != userID {
		writeJSON(w, http.StatusOK, ReviewEligibility{Eligible: false, AlreadyReviewed: false, Reason: "not_renter"})
		return
	}
	if confirmedAt == nil {
		writeJSON(w, http.StatusOK, ReviewEligibility{Eligible: false, AlreadyReviewed: false, Reason: "not_confirmed"})
		return
	}

	var existingID string
	err = s.db.QueryRow(ctx, `
		SELECT id FROM reviews WHERE reviewer_id = $1 AND conversation_id = $2`,
		userID, conversationID,
	).Scan(&existingID)
	if err == nil {
		writeJSON(w, http.StatusOK, ReviewEligibility{Eligible: false, AlreadyReviewed: true, Reason: "already_reviewed"})
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, ReviewEligibility{Eligible: true, AlreadyReviewed: false})
}

func (s *server) handleListPublicReviews(w http.ResponseWriter, r *http.Request) {
	listingID := r.URL.Query().Get("listing_id")
	listerID := r.URL.Query().Get("lister_id")
	if listingID != "" && listerID != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "specify listing_id or lister_id, not both"})
		return
	}
	if listingID != "" && !uuidRe.MatchString(listingID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid listing_id"})
		return
	}
	if listerID != "" && !uuidRe.MatchString(listerID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid lister_id"})
		return
	}

	limit := 6
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 1 {
			limit = parsed
			if limit > 24 {
				limit = 24
			}
		}
	}

	var query string
	var args []any
	switch {
	case listingID != "":
		query = `
			SELECT rv.id, rv.rating, rv.body, rv.created_at, u.email,
			       COALESCE(up.university, u.university, ''),
			       COALESCE(l.title, '')
			FROM reviews rv
			JOIN users u       ON u.id = rv.reviewer_id
			LEFT JOIN user_profiles up ON up.user_id = u.id
			LEFT JOIN listings l       ON l.id = rv.listing_id
			WHERE rv.published = true AND rv.listing_id = $1
			ORDER BY rv.created_at DESC
			LIMIT $2`
		args = []any{listingID, limit}
	case listerID != "":
		query = `
			SELECT rv.id, rv.rating, rv.body, rv.created_at, u.email,
			       COALESCE(up.university, u.university, ''),
			       COALESCE(l.title, '')
			FROM reviews rv
			JOIN users u       ON u.id = rv.reviewer_id
			LEFT JOIN user_profiles up ON up.user_id = u.id
			JOIN listings l            ON l.id = rv.listing_id
			WHERE rv.published = true AND l.user_id = $1
			ORDER BY rv.created_at DESC
			LIMIT $2`
		args = []any{listerID, limit}
	default:
		query = `
			SELECT rv.id, rv.rating, rv.body, rv.created_at, u.email,
			       COALESCE(up.university, u.university, ''),
			       COALESCE(l.title, '')
			FROM reviews rv
			JOIN users u       ON u.id = rv.reviewer_id
			LEFT JOIN user_profiles up ON up.user_id = u.id
			LEFT JOIN listings l       ON l.id = rv.listing_id
			WHERE rv.published = true AND rv.body != ''
			ORDER BY rv.created_at DESC
			LIMIT $1`
		args = []any{limit}
	}

	rows, err := s.db.Query(r.Context(), query, args...)
	if err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()

	reviews := make([]PublicReview, 0)
	for rows.Next() {
		var pr PublicReview
		var email string
		if err := rows.Scan(&pr.ID, &pr.Rating, &pr.Body, &pr.CreatedAt, &email,
			&pr.ReviewerUniversity, &pr.ListingTitle); err != nil {
			writeErr(w, r, http.StatusInternalServerError, err)
			return
		}
		pr.ReviewerDisplayName = displayNameFromEmail(email)
		reviews = append(reviews, pr)
	}
	writeJSON(w, http.StatusOK, reviews)
}

func (s *server) handleReviewSummary(w http.ResponseWriter, r *http.Request) {
	listingID := r.URL.Query().Get("listing_id")
	listerID := r.URL.Query().Get("lister_id")
	if listingID == "" && listerID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "listing_id or lister_id required"})
		return
	}
	if listingID != "" && listerID != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "specify listing_id or lister_id, not both"})
		return
	}
	if listingID != "" && !uuidRe.MatchString(listingID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid listing_id"})
		return
	}
	if listerID != "" && !uuidRe.MatchString(listerID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid lister_id"})
		return
	}

	var query string
	var arg string
	if listingID != "" {
		query = `SELECT ROUND(AVG(rating)::numeric, 1), COUNT(*) FROM reviews WHERE published = true AND listing_id = $1`
		arg = listingID
	} else {
		query = `
			SELECT ROUND(AVG(rv.rating)::numeric, 1), COUNT(*)
			FROM reviews rv
			JOIN listings l ON l.id = rv.listing_id
			WHERE rv.published = true AND l.user_id = $1`
		arg = listerID
	}

	var summary ReviewSummary
	if err := s.db.QueryRow(r.Context(), query, arg).Scan(&summary.Average, &summary.Count); err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

// statQuery runs a single stats query and scans it into dest. Failures are
// logged and swallowed rather than failing the whole response — the landing
// page must keep rendering even if one of these five queries breaks, and
// the zero/nil value dest already holds is a valid fallback for every field.
func (s *server) statQuery(ctx context.Context, query string, dest any) {
	if err := s.db.QueryRow(ctx, query).Scan(dest); err != nil {
		log.Error("public stats query failed", "request_id", logger.RequestIDFrom(ctx), "error", err)
	}
}

func (s *server) handlePublicStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var stats PublicStats
	stats.AsOf = time.Now()

	s.statQuery(ctx, `
		SELECT COUNT(*) FROM listings WHERE status IN ('active', 'leased', 'expired')`,
		&stats.ListingsTotal)

	s.statQuery(ctx, `
		SELECT COUNT(DISTINCT lower(trim(university_near)))
		FROM listings
		WHERE status IN ('active', 'leased', 'expired')
		  AND university_near IS NOT NULL AND university_near <> ''`,
		&stats.UniversitiesTotal)

	s.statQuery(ctx, `
		SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE rating >= 4) / NULLIF(COUNT(*), 0))
		FROM reviews WHERE published = true`,
		&stats.MatchSatisfactionPct)

	s.statQuery(ctx, `
		SELECT ROUND(EXTRACT(EPOCH FROM AVG(confirmed_at - created_at)) / 3600)
		FROM conversations WHERE confirmed_at IS NOT NULL`,
		&stats.AvgTimeToMatchHours)

	s.statQuery(ctx, `
		SELECT COUNT(*) FROM reviews WHERE published = true`,
		&stats.ReviewCount)

	writeJSON(w, http.StatusOK, stats)
}

// ─── Saved listing handlers ──────────────────────────────────────────────────

func (s *server) handleSaveListing(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	var body struct {
		ListingID string `json:"listing_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ListingID == "" {
		writeErr(w, r, http.StatusBadRequest, fmt.Errorf("listing_id required"))
		return
	}
	ctx := r.Context()

	var exists bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM listings WHERE id = $1)`, body.ListingID).Scan(&exists); err != nil {
		writeErr(w, r, http.StatusBadRequest, fmt.Errorf("invalid listing_id"))
		return
	}
	if !exists {
		writeErr(w, r, http.StatusNotFound, fmt.Errorf("listing not found"))
		return
	}

	tag, err := s.db.Exec(ctx,
		`INSERT INTO saved_listings (user_id, listing_id) VALUES ($1, $2)
		 ON CONFLICT (user_id, listing_id) DO NOTHING`,
		userID, body.ListingID,
	)
	if err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}

	status := http.StatusOK
	if tag.RowsAffected() > 0 {
		status = http.StatusCreated
	}
	writeJSON(w, status, map[string]interface{}{"listing_id": body.ListingID, "saved": true})
}

func (s *server) handleUnsaveListing(w http.ResponseWriter, r *http.Request) {
	listingID := r.PathValue("listing_id")
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	_, err := s.db.Exec(r.Context(),
		`DELETE FROM saved_listings WHERE user_id = $1 AND listing_id = $2`,
		userID, listingID,
	)
	if err != nil {
		writeErr(w, r, http.StatusBadRequest, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleListSaved(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, r, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT l.id, l.user_id, l.title, l.description, l.address, l.university_near,
		       l.rent_cents, l.available_from::text, l.available_to::text,
		       l.bedrooms, l.bathrooms, l.amenities, l.images,
		       l.status, l.scam_score, l.view_count, l.created_at, l.updated_at,
		       l.lease_type, l.furnished, l.utilities_included, sl.created_at
		FROM saved_listings sl
		JOIN listings l ON l.id = sl.listing_id
		WHERE sl.user_id = $1
		ORDER BY sl.created_at DESC
		LIMIT 200`, userID)
	if err != nil {
		writeErr(w, r, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()

	saved := make([]SavedListing, 0)
	for rows.Next() {
		var sl SavedListing
		var description, universityNear, availableTo sql.NullString
		var lType, furn sql.NullString
		var utils []string
		if err := rows.Scan(&sl.ID, &sl.UserID, &sl.Title, &description, &sl.Address,
			&universityNear, &sl.RentCents, &sl.AvailableFrom, &availableTo,
			&sl.Bedrooms, &sl.Bathrooms, &sl.Amenities, &sl.Images,
			&sl.Status, &sl.ScamScore, &sl.ViewCount, &sl.CreatedAt, &sl.UpdatedAt,
			&lType, &furn, &utils, &sl.SavedAt); err != nil {
			writeErr(w, r, http.StatusInternalServerError, err)
			return
		}
		sl.Description, sl.UniversityNear, sl.AvailableTo = description.String, universityNear.String, availableTo.String
		sl.LeaseType = lType.String
		sl.Furnished = furn.String
		sl.UtilitiesIncluded = utils
		if sl.UtilitiesIncluded == nil {
			sl.UtilitiesIncluded = []string{}
		}
		if userID != sl.UserID {
			sl.ScamScore = 0
		}
		saved = append(saved, sl)
	}
	writeJSON(w, http.StatusOK, saved)
}

func displayNameFromEmail(email string) string {
	local := email
	if i := strings.Index(email, "@"); i >= 0 {
		local = email[:i]
	}
	if i := strings.Index(local, "."); i >= 0 {
		first := local[:i]
		rest := local[i+1:]
		if first == "" {
			return ""
		}
		firstName := strings.ToUpper(first[:1]) + first[1:]
		if rest == "" {
			return firstName + "."
		}
		return firstName + " " + strings.ToUpper(rest[:1]) + "."
	}
	if local == "" {
		return ""
	}
	cut := local
	if len(cut) > 6 {
		cut = cut[:6]
	}
	return strings.ToUpper(cut[:1]) + cut[1:] + "."
}

func isUniqueViolation(err error) bool {
	return strings.Contains(err.Error(), "duplicate key value violates unique constraint")
}

// ─── Expiration worker ───────────────────────────────────────────────────────

func (s *server) startExpirationWorker() {
	expire := func() {
		rows, err := s.db.Query(context.Background(), `
			UPDATE listings SET status = 'expired'
			WHERE status = 'active'
			  AND available_to IS NOT NULL
			  AND available_to < CURRENT_DATE
			RETURNING id, user_id, title`)
		if err != nil {
			log.Error("expiration worker failed", "error", err)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var listingID, listerID, title string
			if err := rows.Scan(&listingID, &listerID, &title); err != nil {
				continue
			}
			s.publishNotification("notifications.listing_expired", map[string]string{
				"lister_id":     listerID,
				"listing_id":    listingID,
				"listing_title": title,
			})
		}
	}
	expire()
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		expire()
	}
}

// ─── MQ helpers ──────────────────────────────────────────────────────────────

func (s *server) publishNotification(queue string, payload interface{}) {
	if s.mq == nil {
		return
	}
	data, _ := json.Marshal(payload)
	if err := s.mq.Publish("", queue, false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         data,
	}); err != nil {
		log.Error("failed to publish notification", "queue", queue, "error", err)
	}
}

func (s *server) publishScamCheck(listingID string) {
	if s.mq == nil {
		return
	}
	payload, _ := json.Marshal(map[string]string{"listing_id": listingID})
	err := s.mq.Publish("", s.mqQueue, false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         payload,
	})
	if err != nil {
		log.Error("failed to publish scam check", "error", err)
	}
}

func (s *server) publishNewListing(l Listing) {
	if s.mq == nil {
		return
	}
	payload, _ := json.Marshal(l)
	err := s.mq.Publish("", s.mqNewQueue, false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         payload,
	})
	if err != nil {
		log.Error("failed to publish new listing", "error", err)
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, r *http.Request, status int, err error) {
	log.Error("handler error", "status", status, "request_id", logger.RequestIDFrom(r.Context()), "error", err)
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

// ─── Main ────────────────────────────────────────────────────────────────────

func main() {
	requireEnv("DATABASE_URL", "RABBITMQ_URL", "AUTH_SERVICE_URL")

	ctx := context.Background()

	db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal("db connect failed", "error", err)
	}
	defer db.Close()

	var mqCh *amqp.Channel
	mqConn, err := amqp.Dial(os.Getenv("RABBITMQ_URL"))
	if err != nil {
		log.Fatal("rabbitmq connect failed", "error", err)
	} else {
		mqCh, _ = mqConn.Channel()
		mqCh.QueueDeclare("listing.scam_check", true, false, false, false, nil)
		mqCh.QueueDeclare("listings.new", true, false, false, false, nil)
		// notifications.* are also declared (with the same dead-letter
		// arguments) by the auth service's consumeNotifications — RabbitMQ
		// requires identical arguments across declares of the same queue,
		// or whichever side declares second gets a channel-closing
		// PRECONDITION_FAILED error. dead.notifications is the DLQ auth
		// nacks failed notification messages into.
		mqCh.QueueDeclare("dead.notifications", true, false, false, false, nil)
		notificationDLXArgs := amqp.Table{
			"x-dead-letter-exchange":    "",
			"x-dead-letter-routing-key": "dead.notifications",
		}
		mqCh.QueueDeclare("notifications.new_message", true, false, false, false, notificationDLXArgs)
		mqCh.QueueDeclare("notifications.match_confirmed", true, false, false, false, notificationDLXArgs)
		mqCh.QueueDeclare("notifications.listing_expired", true, false, false, false, notificationDLXArgs)
		mqCh.QueueDeclare("notifications.viewing_responded", true, false, false, false, notificationDLXArgs)
		defer mqConn.Close()
	}

	s := &server{db: db, mq: mqCh, mqQueue: "listing.scam_check", mqNewQueue: "listings.new"}

	go s.startExpirationWorker()

	port := envOr("PORT", "3002")
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      requestIDMiddleware(recoverMiddleware(log, accessLogMiddleware(log, s.routes()))),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
	}
	log.Info("listening", "port", port)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal("fatal", "error", err)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func requireEnv(keys ...string) {
	var missing []string
	for _, k := range keys {
		if os.Getenv(k) == "" {
			missing = append(missing, k)
		}
	}
	if len(missing) > 0 {
		log.Fatal("missing required env vars", "vars", strings.Join(missing, ", "))
	}
}
