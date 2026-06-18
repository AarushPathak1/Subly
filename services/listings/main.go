package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	amqp "github.com/rabbitmq/amqp091-go"
)

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
	Amenities      []string  `json:"amenities"`
	Images         []string  `json:"images"`
	Status         string    `json:"status"`
	ScamScore      float64   `json:"scam_score"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type Conversation struct {
	ID                string     `json:"id"`
	ListingID         string     `json:"listing_id"`
	ListingTitle      string     `json:"listing_title"`
	RenterID          string     `json:"renter_id"`
	ListerID          string     `json:"lister_id"`
	OtherEmail        string     `json:"other_email"`
	LastMessageAt     *time.Time `json:"last_message_at,omitempty"`
	LastMessage       string     `json:"last_message"`
	UnreadCount       int        `json:"unread_count"`
	CreatedAt         time.Time  `json:"created_at"`
	InitialRentCents  int        `json:"initial_rent_cents"`
	ConfirmedAt       *time.Time `json:"confirmed_at,omitempty"`
}

type UserProfile struct {
	ID          string    `json:"id"`
	University  string    `json:"university"`
	VibeText    string    `json:"vibe_text"`
	MemberSince time.Time `json:"member_since"`
}

type Message struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversation_id"`
	SenderID       string    `json:"sender_id"`
	Body           string    `json:"body"`
	CreatedAt      time.Time `json:"created_at"`
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
	mux.HandleFunc("GET /conversations/{id}", s.handleGetConversation)
	mux.HandleFunc("GET /conversations/{id}/messages", s.handleGetMessages)
	mux.HandleFunc("POST /conversations/{id}/messages", s.handleSendMessage)
	mux.HandleFunc("POST /conversations/{id}/confirm", s.handleConfirmConversation)
	mux.HandleFunc("GET /users/{id}/profile", s.handleGetUserProfile)
	return mux
}

// ─── Handlers ────────────────────────────────────────────────────────────────

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "listings"})
}

func (s *server) handleList(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	const selectCols = `SELECT id, user_id, title, description, address, university_near,
	              rent_cents, available_from::text, available_to::text, bedrooms, bathrooms,
	              amenities, images, status, scam_score, created_at, updated_at
	              FROM listings`

	userID := r.URL.Query().Get("user_id")
	var query string
	var args []any
	if userID != "" {
		requestingUserID := r.Header.Get("X-User-ID")
		if requestingUserID != "" && requestingUserID != userID {
			// Public profile view: only show active listings
			query = selectCols + ` WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 100`
		} else {
			// Own listings: show all statuses
			query = selectCols + ` WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`
		}
		args = []any{userID}
	} else {
		query = selectCols + ` WHERE status = 'active' ORDER BY created_at DESC LIMIT 50`
	}

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()

	listings := make([]Listing, 0)
	for rows.Next() {
		var l Listing
		if err := rows.Scan(&l.ID, &l.UserID, &l.Title, &l.Description, &l.Address,
			&l.UniversityNear, &l.RentCents, &l.AvailableFrom, &l.AvailableTo,
			&l.Bedrooms, &l.Bathrooms, &l.Amenities, &l.Images,
			&l.Status, &l.ScamScore, &l.CreatedAt, &l.UpdatedAt); err != nil {
			writeErr(w, http.StatusInternalServerError, err)
			return
		}
		if r.Header.Get("X-User-ID") != l.UserID {
			l.ScamScore = 0
		}
		listings = append(listings, l)
	}
	writeJSON(w, http.StatusOK, listings)
}

func (s *server) handleCreate(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}

	var body Listing
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}

	ctx := r.Context()
	var availableTo interface{}
	if body.AvailableTo != "" {
		availableTo = body.AvailableTo
	}
	var id string
	err := s.db.QueryRow(ctx,
		`INSERT INTO listings
		   (user_id, title, description, address, university_near,
		    rent_cents, available_from, available_to, bedrooms, bathrooms,
		    amenities, images, status)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft')
		 RETURNING id`,
		userID, body.Title, body.Description, body.Address, body.UniversityNear,
		body.RentCents, body.AvailableFrom, availableTo,
		body.Bedrooms, body.Bathrooms, body.Amenities, body.Images,
	).Scan(&id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
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
	var l Listing
	err := s.db.QueryRow(r.Context(),
		`SELECT id, user_id, title, description, address, university_near,
		        rent_cents, available_from::text, available_to::text, bedrooms, bathrooms,
		        amenities, images, status, scam_score, created_at, updated_at
		 FROM listings WHERE id = $1`, id,
	).Scan(&l.ID, &l.UserID, &l.Title, &l.Description, &l.Address,
		&l.UniversityNear, &l.RentCents, &l.AvailableFrom, &l.AvailableTo,
		&l.Bedrooms, &l.Bathrooms, &l.Amenities, &l.Images,
		&l.Status, &l.ScamScore, &l.CreatedAt, &l.UpdatedAt)
	if err != nil {
		writeErr(w, http.StatusNotFound, err)
		return
	}
	if r.Header.Get("X-User-ID") != l.UserID {
		l.ScamScore = 0
	}
	writeJSON(w, http.StatusOK, l)
}

func (s *server) handleUpdate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	userID := r.Header.Get("X-User-ID")

	var body struct {
		Title          *string  `json:"title"`
		Description    *string  `json:"description"`
		Address        *string  `json:"address"`
		UniversityNear *string  `json:"university_near"`
		RentCents      *int     `json:"rent_cents"`
		AvailableFrom  *string  `json:"available_from"`
		AvailableTo    *string  `json:"available_to"`
		Bedrooms       *int     `json:"bedrooms"`
		Bathrooms      *float64 `json:"bathrooms"`
		Amenities      []string `json:"amenities"`
		Images         []string `json:"images"`
		Status         *string  `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}

	setClauses := []string{"updated_at = NOW()"}
	args := []any{}
	idx := 1

	add := func(col string, val any) {
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", col, idx))
		args = append(args, val)
		idx++
	}

	if body.Title != nil          { add("title", *body.Title) }
	if body.Description != nil    { add("description", *body.Description) }
	if body.Address != nil        { add("address", *body.Address) }
	if body.UniversityNear != nil { add("university_near", *body.UniversityNear) }
	if body.RentCents != nil      { add("rent_cents", *body.RentCents) }
	if body.AvailableFrom != nil  { add("available_from", *body.AvailableFrom) }
	if body.AvailableTo != nil    { add("available_to", *body.AvailableTo) }
	if body.Bedrooms != nil       { add("bedrooms", *body.Bedrooms) }
	if body.Bathrooms != nil      { add("bathrooms", *body.Bathrooms) }
	if body.Amenities != nil      { add("amenities", body.Amenities) }
	if body.Images != nil         { add("images", body.Images) }
	if body.Status != nil         { add("status", *body.Status) }

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

	tag, err := s.db.Exec(r.Context(), q, args...)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeErr(w, http.StatusNotFound, fmt.Errorf("listing not found or not owned by you"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": id})
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
		writeErr(w, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	tag, err := s.db.Exec(r.Context(), `DELETE FROM listings WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeErr(w, http.StatusNotFound, fmt.Errorf("listing not found or not owned by you"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Conversation handlers ───────────────────────────────────────────────────

func (s *server) handleCreateConversation(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	var body struct {
		ListingID string `json:"listing_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ListingID == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("listing_id required"))
		return
	}
	ctx := r.Context()

	var listerID string
	var rentCents int
	err := s.db.QueryRow(ctx, `SELECT user_id, rent_cents FROM listings WHERE id = $1`, body.ListingID).Scan(&listerID, &rentCents)
	if err != nil {
		writeErr(w, http.StatusNotFound, fmt.Errorf("listing not found"))
		return
	}
	if listerID == userID {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("cannot message your own listing"))
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
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": convID})
}

func (s *server) handleListConversations(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT
			c.id, c.listing_id, l.title,
			c.renter_id, c.lister_id,
			CASE WHEN c.renter_id = $1 THEN ul.email ELSE ur.email END,
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
		writeErr(w, http.StatusInternalServerError, err)
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
			writeErr(w, http.StatusInternalServerError, err)
			return
		}
		c.LastMessageAt = lastMsgAt
		convs = append(convs, c)
	}
	writeJSON(w, http.StatusOK, convs)
}

func (s *server) handleGetConversation(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	var c Conversation
	var lastMsgAt *time.Time
	var confirmedAt *time.Time
	err := s.db.QueryRow(r.Context(), `
		SELECT c.id, c.listing_id, l.title,
		       c.renter_id, c.lister_id,
		       CASE WHEN c.renter_id = $2 THEN ul.email ELSE ur.email END,
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
		writeErr(w, http.StatusNotFound, fmt.Errorf("conversation not found"))
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
		writeErr(w, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	ctx := r.Context()

	// Verify user is a party and mark as read
	var renterID, listerID string
	err := s.db.QueryRow(ctx, `SELECT renter_id, lister_id FROM conversations WHERE id = $1`, id).Scan(&renterID, &listerID)
	if err != nil {
		writeErr(w, http.StatusNotFound, fmt.Errorf("conversation not found"))
		return
	}
	if renterID != userID && listerID != userID {
		writeErr(w, http.StatusForbidden, fmt.Errorf("access denied"))
		return
	}

	col := "lister_read_at"
	if renterID == userID {
		col = "renter_read_at"
	}
	s.db.Exec(ctx, fmt.Sprintf(`UPDATE conversations SET %s = NOW() WHERE id = $1`, col), id)

	rows, err := s.db.Query(ctx,
		`SELECT id, conversation_id, sender_id, body, created_at
		 FROM messages WHERE conversation_id = $1
		 ORDER BY created_at ASC LIMIT 100`, id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()

	msgs := make([]Message, 0)
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Body, &m.CreatedAt); err != nil {
			writeErr(w, http.StatusInternalServerError, err)
			return
		}
		msgs = append(msgs, m)
	}
	writeJSON(w, http.StatusOK, msgs)
}

func (s *server) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeErr(w, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	var body struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Body) == "" {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("body required"))
		return
	}
	if len([]rune(strings.TrimSpace(body.Body))) > 2000 {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("message body exceeds 2000 character limit"))
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
		writeErr(w, http.StatusNotFound, fmt.Errorf("conversation not found"))
		return
	}
	if renterID != userID && listerID != userID {
		writeErr(w, http.StatusForbidden, fmt.Errorf("access denied"))
		return
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	defer tx.Rollback(ctx)

	var msg Message
	err = tx.QueryRow(ctx,
		`INSERT INTO messages (conversation_id, sender_id, body)
		 VALUES ($1, $2, $3) RETURNING id, conversation_id, sender_id, body, created_at`,
		id, userID, strings.TrimSpace(body.Body),
	).Scan(&msg.ID, &msg.ConversationID, &msg.SenderID, &msg.Body, &msg.CreatedAt)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	if _, err := tx.Exec(ctx, `UPDATE conversations SET last_message_at = NOW() WHERE id = $1`, id); err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeErr(w, http.StatusInternalServerError, err)
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

func (s *server) handleConfirmConversation(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	userID := r.Header.Get("X-User-ID")
	isInternal := r.Header.Get("X-Internal-Call") == "true"
	if userID == "" && !isInternal {
		writeErr(w, http.StatusUnauthorized, fmt.Errorf("missing X-User-ID"))
		return
	}
	var body struct {
		StripeSessionID string `json:"stripe_session_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, fmt.Errorf("invalid body"))
		return
	}
	ctx := r.Context()

	var listerID, renterID, listingTitle string
	if err := s.db.QueryRow(ctx, `
		SELECT c.lister_id, c.renter_id, l.title
		FROM conversations c
		JOIN listings l ON l.id = c.listing_id
		WHERE c.id = $1`, id).Scan(&listerID, &renterID, &listingTitle); err != nil {
		writeErr(w, http.StatusNotFound, fmt.Errorf("conversation not found"))
		return
	}
	if !isInternal && listerID != userID {
		writeErr(w, http.StatusForbidden, fmt.Errorf("only the lister can confirm a match"))
		return
	}

	// Idempotent: preserve existing confirmed_at if already set
	if _, err := s.db.Exec(ctx, `
		UPDATE conversations
		SET confirmed_at      = COALESCE(confirmed_at, NOW()),
		    stripe_session_id = COALESCE(stripe_session_id, $2)
		WHERE id = $1`,
		id, body.StripeSessionID,
	); err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	s.publishNotification("notifications.match_confirmed", map[string]interface{}{
		"lister_id":       listerID,
		"renter_id":       renterID,
		"listing_title":   listingTitle,
		"conversation_id": id,
	})

	writeJSON(w, http.StatusOK, map[string]string{"status": "confirmed"})
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
		writeErr(w, http.StatusNotFound, fmt.Errorf("user not found"))
		return
	}
	writeJSON(w, http.StatusOK, p)
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
			log.Printf("[listings] expiration worker: %v", err)
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
		log.Printf("[listings] failed to publish to %s: %v", queue, err)
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
		log.Printf("[listings] failed to publish scam check: %v", err)
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
		log.Printf("[listings] failed to publish new listing: %v", err)
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, err error) {
	log.Printf("[listings] error: %v", err)
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

// ─── Main ────────────────────────────────────────────────────────────────────

func main() {
	requireEnv("DATABASE_URL", "RABBITMQ_URL", "AUTH_SERVICE_URL")

	ctx := context.Background()

	db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("[listings] db connect: %v", err)
	}
	defer db.Close()

	var mqCh *amqp.Channel
	mqConn, err := amqp.Dial(os.Getenv("RABBITMQ_URL"))
	if err != nil {
		log.Fatalf("[listings] rabbitmq connect: %v", err)
	} else {
		mqCh, _ = mqConn.Channel()
		mqCh.QueueDeclare("listing.scam_check", true, false, false, false, nil)
		mqCh.QueueDeclare("listings.new", true, false, false, false, nil)
		mqCh.QueueDeclare("notifications.new_message", true, false, false, false, nil)
		mqCh.QueueDeclare("notifications.match_confirmed", true, false, false, false, nil)
		mqCh.QueueDeclare("notifications.listing_expired", true, false, false, false, nil)
		defer mqConn.Close()
	}

	s := &server{db: db, mq: mqCh, mqQueue: "listing.scam_check", mqNewQueue: "listings.new"}

	go s.startExpirationWorker()

	port := envOr("PORT", "3002")
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      s.routes(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
	}
	log.Printf("[listings] listening on :%s", port)
	log.Fatal(srv.ListenAndServe())
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
		log.Fatalf("[listings] missing required env vars: %s", strings.Join(missing, ", "))
	}
}
