package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

// requireMQ connects to a real RabbitMQ broker for tests that need to assert
// on the actual shape of a published notification payload. It is skipped
// when RABBITMQ_URL is unset, mirroring requireDB's skip behavior for
// DATABASE_URL so this test only runs where a broker is actually available
// (e.g. local dev with docker-compose up), not in the default CI job which
// intentionally leaves RABBITMQ_URL unset.
func requireMQ(t *testing.T) *amqp.Channel {
	t.Helper()
	url := os.Getenv("RABBITMQ_URL")
	if url == "" {
		t.Skip("RABBITMQ_URL not set — skipping notification payload integration test")
	}
	conn, err := amqp.Dial(url)
	if err != nil {
		t.Fatalf("could not connect to rabbitmq: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	ch, err := conn.Channel()
	if err != nil {
		t.Fatalf("could not open channel: %v", err)
	}
	t.Cleanup(func() { ch.Close() })
	return ch
}

// TestIntegration_RespondViewing_NotificationIncludesListingTitle verifies
// H4: handleRespondViewing's published notifications.viewing_responded
// message includes the joined listing_title (not just IDs), which is what
// sendViewingRespondedEmail in the auth service needs to render the email
// subject/body without a second round-trip lookup.
func TestIntegration_RespondViewing_NotificationIncludesListingTitle(t *testing.T) {
	db := requireDB(t)
	mq := requireMQ(t)

	seedTestUser(t, db)
	seedSecondUser(t, db, testListerID, "lister@university.edu")
	listingID := seedTestListing(t, db, testListerID, 120000)
	convID := seedTestConversation(t, db, listingID, testUserID, testListerID, 120000)

	var wantTitle string
	if err := db.QueryRow(context.Background(), `SELECT title FROM listings WHERE id = $1`, listingID).Scan(&wantTitle); err != nil {
		t.Fatalf("could not read seeded listing title: %v", err)
	}

	s := &server{db: db, mq: mq}

	// publishNotification publishes to the default exchange ("") with the
	// queue name as routing key, and the default exchange routes directly
	// to a queue of the same name — no explicit binding needed.
	respQueue, err := mq.QueueDeclare("notifications.viewing_responded", true, false, false, false, nil)
	if err != nil {
		t.Fatalf("could not declare notifications.viewing_responded queue: %v", err)
	}
	// Drain any stale messages left over from previous runs so we only see
	// the one this test produces.
	for {
		_, ok, derr := mq.Get(respQueue.Name, true)
		if derr != nil || !ok {
			break
		}
	}

	proposal := seedViewingProposal(t, s, convID, testUserID, 24)

	req := httptest.NewRequest(http.MethodPost, "/conversations/"+convID+"/viewings/"+proposal.ID+"/respond",
		bytes.NewBufferString(`{"action":"accept"}`))
	req.SetPathValue("id", convID)
	req.SetPathValue("message_id", proposal.ID)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", testListerID)
	w := httptest.NewRecorder()
	s.handleRespondViewing(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	deadline := time.After(3 * time.Second)
	for {
		delivery, ok, derr := mq.Get(respQueue.Name, true)
		if derr != nil {
			t.Fatalf("error consuming from queue: %v", derr)
		}
		if ok {
			var payload map[string]string
			if err := json.Unmarshal(delivery.Body, &payload); err != nil {
				t.Fatalf("could not unmarshal notification payload: %v", err)
			}
			if payload["listing_title"] != wantTitle {
				t.Errorf("expected listing_title=%q, got %q (payload=%v)", wantTitle, payload["listing_title"], payload)
			}
			if payload["status"] != "accepted" {
				t.Errorf("expected status=accepted, got %q", payload["status"])
			}
			if payload["conversation_id"] != convID {
				t.Errorf("expected conversation_id=%s, got %q", convID, payload["conversation_id"])
			}
			return
		}
		select {
		case <-deadline:
			t.Fatal("timed out waiting for notifications.viewing_responded message")
		case <-time.After(50 * time.Millisecond):
		}
	}
}
