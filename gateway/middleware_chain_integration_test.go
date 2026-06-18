package main

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/subly/gateway/logger"
)

// TestGatewayHandlerChain_AccessLogContainsRequestID exercises the full
// middleware stack as wired in main() — requestID -> recover -> accessLog ->
// cors -> handler — and asserts that the request_id recorded in the access
// log line matches the X-Request-ID echoed back on the response.
func TestGatewayHandlerChain_AccessLogContainsRequestID(t *testing.T) {
	var buf bytes.Buffer
	log := logger.New(logger.Config{Service: "gateway", Level: slog.LevelInfo, Format: "json", Writer: &buf})

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","service":"gateway"}`))
	})

	chain := requestIDMiddleware(recoverMiddleware(log, accessLogMiddleware(log, corsMiddleware(mux))))

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	chain.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	respRequestID := w.Header().Get("X-Request-ID")
	if respRequestID == "" {
		t.Fatal("expected X-Request-ID header on response")
	}

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("expected valid JSON access log line, got error: %v (line: %s)", err, buf.String())
	}
	if entry["msg"] != "http.request" {
		t.Errorf("expected msg=http.request, got %v", entry["msg"])
	}
	if entry["request_id"] != respRequestID {
		t.Errorf("expected access log request_id %q to match response header, got %q", respRequestID, entry["request_id"])
	}
	if entry["status"] != float64(http.StatusOK) {
		t.Errorf("expected status 200 in access log, got %v", entry["status"])
	}
}

// TestGatewayHandlerChain_AccessLogContainsRequestID_PreservesInbound confirms
// the same end-to-end invariant holds when the caller supplies its own valid
// X-Request-ID — the chain should echo it rather than generating a new one.
func TestGatewayHandlerChain_AccessLogContainsRequestID_PreservesInbound(t *testing.T) {
	var buf bytes.Buffer
	log := logger.New(logger.Config{Service: "gateway", Level: slog.LevelInfo, Format: "json", Writer: &buf})

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	chain := requestIDMiddleware(recoverMiddleware(log, accessLogMiddleware(log, corsMiddleware(mux))))

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("X-Request-ID", "inbound-id-42")
	w := httptest.NewRecorder()
	chain.ServeHTTP(w, req)

	if w.Header().Get("X-Request-ID") != "inbound-id-42" {
		t.Errorf("expected inbound ID to be preserved, got %q", w.Header().Get("X-Request-ID"))
	}

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("expected valid JSON access log line: %v (line: %s)", err, buf.String())
	}
	if entry["request_id"] != "inbound-id-42" {
		t.Errorf("expected access log request_id=inbound-id-42, got %v", entry["request_id"])
	}
}

// TestGatewayHandlerChain_NoSecretHeadersLogged verifies that even when a
// request carries Authorization/Cookie headers, the resulting access log
// line never contains their values.
func TestGatewayHandlerChain_NoSecretHeadersLogged(t *testing.T) {
	var buf bytes.Buffer
	log := logger.New(logger.Config{Service: "gateway", Level: slog.LevelInfo, Format: "json", Writer: &buf})

	const secretToken = "Bearer super-secret-token-value"
	const secretCookie = "session=top-secret-cookie-value"

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	chain := requestIDMiddleware(recoverMiddleware(log, accessLogMiddleware(log, corsMiddleware(mux))))

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Authorization", secretToken)
	req.Header.Set("Cookie", secretCookie)
	req.Header.Set("X-Internal-Secret", "internal-secret-value")
	w := httptest.NewRecorder()
	chain.ServeHTTP(w, req)

	out := buf.String()
	if bytes.Contains([]byte(out), []byte("super-secret-token-value")) {
		t.Errorf("access log leaked Authorization header value: %s", out)
	}
	if bytes.Contains([]byte(out), []byte("top-secret-cookie-value")) {
		t.Errorf("access log leaked Cookie header value: %s", out)
	}
	if bytes.Contains([]byte(out), []byte("internal-secret-value")) {
		t.Errorf("access log leaked X-Internal-Secret header value: %s", out)
	}
}
