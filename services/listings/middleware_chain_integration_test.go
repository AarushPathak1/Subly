package main

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/subly/listings/logger"
)

// TestListingsHandlerChain_PanicReturns500 exercises the full middleware
// stack as wired in main() — requestID -> recover -> accessLog -> s.routes()
// — and forces a panic (via a nil DB pool dereferenced by a handler that
// passes its auth/validation guards) to confirm the chain still returns a
// structured 500 response with a panic log entry, rather than crashing the
// test process.
func TestListingsHandlerChain_PanicReturns500(t *testing.T) {
	var buf bytes.Buffer
	testLog := logger.New(logger.Config{Service: "listings", Level: slog.LevelInfo, Format: "json", Writer: &buf})

	// server with a nil db — handleCreate passes the X-User-ID and JSON
	// validation guards, then panics when it calls s.db.QueryRow on a nil pool.
	s := &server{}

	chain := requestIDMiddleware(recoverMiddleware(testLog, accessLogMiddleware(testLog, s.routes())))

	body := `{"title":"Test Listing Title","address":"123 Main Street, Some City","rent_cents":120000,"available_from":"2026-01-01"}`
	req := httptest.NewRequest(http.MethodPost, "/listings", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", "user-1")
	w := httptest.NewRecorder()

	chain.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d (body: %s)", w.Code, w.Body.String())
	}

	var respBody map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &respBody); err != nil {
		t.Fatalf("expected JSON response body, got error: %v (body: %s)", err, w.Body.String())
	}
	if respBody["error"] != "internal_error" {
		t.Errorf("expected error=internal_error in response body, got %q", respBody["error"])
	}

	out := buf.String()
	if !bytes.Contains([]byte(out), []byte("panic recovered")) {
		t.Errorf("expected panic log entry, got: %s", out)
	}
	if !bytes.Contains([]byte(out), []byte(`"level":"ERROR"`)) {
		t.Errorf("expected panic to be logged at ERROR level, got: %s", out)
	}

	// Note: because the chain is requestID -> recover -> accessLog -> routes,
	// recoverMiddleware sits *outside* accessLogMiddleware. When the handler
	// panics, accessLogMiddleware's post-next.ServeHTTP code (which would log
	// the http.request line) never runs — the panic unwinds straight to
	// recoverMiddleware's deferred recover(). So only the panic log line is
	// expected here, not a separate http.request access log line for this
	// request. This is a structural property of the middleware ordering and
	// is asserted explicitly so a future reordering doesn't silently change it.
	if bytes.Contains([]byte(out), []byte(`"msg":"http.request"`)) {
		t.Errorf("did not expect an http.request access log line when the handler panics before accessLogMiddleware can log, got: %s", out)
	}
}

// TestListingsHandlerChain_NoSecretHeadersLogged verifies that even when a
// request carries Authorization/Cookie headers, no log line emitted by the
// full middleware chain contains their values.
func TestListingsHandlerChain_NoSecretHeadersLogged(t *testing.T) {
	var buf bytes.Buffer
	testLog := logger.New(logger.Config{Service: "listings", Level: slog.LevelInfo, Format: "json", Writer: &buf})

	const secretToken = "Bearer super-secret-token-value"
	const secretCookie = "session=top-secret-cookie-value"

	s := &server{}
	chain := requestIDMiddleware(recoverMiddleware(testLog, accessLogMiddleware(testLog, s.routes())))

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Authorization", secretToken)
	req.Header.Set("Cookie", secretCookie)
	w := httptest.NewRecorder()

	chain.ServeHTTP(w, req)

	out := buf.String()
	if bytes.Contains([]byte(out), []byte("super-secret-token-value")) {
		t.Errorf("log leaked Authorization header value: %s", out)
	}
	if bytes.Contains([]byte(out), []byte("top-secret-cookie-value")) {
		t.Errorf("log leaked Cookie header value: %s", out)
	}
}

// TestListingsHandlerChain_WriteErrUsesPackageLevelLogger is a regression
// test for the fix where `log` was moved from a main()-local variable to an
// eagerly-initialized package-level var. It directly calls writeErr via a
// handler reached without main() ever running, proving the logger is
// non-nil and writeErr's *http.Request parameter is threaded correctly.
func TestListingsHandlerChain_WriteErrUsesPackageLevelLogger(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodPost, "/listings", bytes.NewBufferString("not-json"))
	req.Header.Set("X-User-ID", "user-1")
	w := httptest.NewRecorder()

	// Calling the handler directly (no main(), no test harness setup) is
	// exactly the scenario that used to nil-pointer panic before `log` was
	// made an eagerly-initialized package-level var.
	s.handleCreate(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for malformed JSON, got %d", w.Code)
	}
}
