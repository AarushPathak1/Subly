package main

import (
	"context"
	"encoding/json"
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
	db      *pgxpool.Pool
	mq      *amqp.Channel
	mqQueue string
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
	rows, err := s.db.Query(ctx,
		`SELECT id, user_id, title, description, address, university_near,
		        rent_cents, available_from, available_to, bedrooms, bathrooms,
		        amenities, images, status, scam_score, created_at, updated_at
		 FROM listings WHERE status = 'active' ORDER BY created_at DESC LIMIT 50`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()

	var listings []Listing
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
	var body Listing
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}

	// TODO: extract clerk_id from Authorization header and resolve to user_id
	ctx := r.Context()
	var id string
	err := s.db.QueryRow(ctx,
		`INSERT INTO listings
		   (user_id, title, description, address, university_near,
		    rent_cents, available_from, available_to, bedrooms, bathrooms,
		    amenities, images, status)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft')
		 RETURNING id`,
		body.UserID, body.Title, body.Description, body.Address, body.UniversityNear,
		body.RentCents, body.AvailableFrom, body.AvailableTo,
		body.Bedrooms, body.Bathrooms, body.Amenities, body.Images,
	).Scan(&id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err)
		return
	}

	// Publish to scam-detection queue
	s.publishScamCheck(id)

	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (s *server) handleGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var l Listing
	err := s.db.QueryRow(r.Context(),
		`SELECT id, user_id, title, description, address, university_near,
		        rent_cents, available_from, available_to, bedrooms, bathrooms,
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
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	// Minimal partial update: only status for now
	if status, ok := body["status"].(string); ok {
		_, err := s.db.Exec(r.Context(),
			`UPDATE listings SET status=$1 WHERE id=$2`, status, id)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": id})
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
		defer mqConn.Close()
	}

	s := &server{db: db, mq: mqCh, mqQueue: "listing.scam_check"}

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
