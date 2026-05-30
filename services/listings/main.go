package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
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
		query = selectCols + ` WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`
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
	_, err := s.db.Exec(r.Context(), `DELETE FROM listings WHERE id=$1`, id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── MQ helpers ──────────────────────────────────────────────────────────────

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
	ctx := context.Background()

	db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("[listings] db connect: %v", err)
	}
	defer db.Close()

	var mqCh *amqp.Channel
	mqConn, err := amqp.Dial(os.Getenv("RABBITMQ_URL"))
	if err != nil {
		log.Printf("[listings] rabbitmq connect failed (non-fatal): %v", err)
	} else {
		mqCh, _ = mqConn.Channel()
		mqCh.QueueDeclare("listing.scam_check", true, false, false, false, nil)
		mqCh.QueueDeclare("listings.new", true, false, false, false, nil)
		defer mqConn.Close()
	}

	s := &server{db: db, mq: mqCh, mqQueue: "listing.scam_check", mqNewQueue: "listings.new"}

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
