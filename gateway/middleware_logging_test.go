package main

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/subly/gateway/logger"
)

func TestRequestIDMiddleware_GeneratesWhenMissing(t *testing.T) {
	var gotID string
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotID = logger.RequestIDFrom(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	requestIDMiddleware(upstream).ServeHTTP(w, req)

	if gotID == "" {
		t.Error("expected a request ID to be generated")
	}
	if w.Header().Get("X-Request-ID") != gotID {
		t.Errorf("expected response header to echo generated ID %q, got %q", gotID, w.Header().Get("X-Request-ID"))
	}
}

func TestRequestIDMiddleware_PreservesValidInbound(t *testing.T) {
	var gotID string
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotID = logger.RequestIDFrom(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("X-Request-ID", "valid-id_123")
	w := httptest.NewRecorder()
	requestIDMiddleware(upstream).ServeHTTP(w, req)

	if gotID != "valid-id_123" {
		t.Errorf("expected preserved ID valid-id_123, got %q", gotID)
	}
	if w.Header().Get("X-Request-ID") != "valid-id_123" {
		t.Errorf("expected response header valid-id_123, got %q", w.Header().Get("X-Request-ID"))
	}
}

func TestRequestIDMiddleware_RejectsMalformedInbound(t *testing.T) {
	var gotID string
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotID = logger.RequestIDFrom(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("X-Request-ID", "invalid id with spaces!")
	w := httptest.NewRecorder()
	requestIDMiddleware(upstream).ServeHTTP(w, req)

	if gotID == "invalid id with spaces!" {
		t.Error("expected malformed ID to be discarded")
	}
	if gotID == "" {
		t.Error("expected a fresh ID to be generated")
	}
}

func TestRequestIDMiddleware_PropagatesToUpstreamHeader(t *testing.T) {
	var gotHeader string
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHeader = r.Header.Get("X-Request-ID")
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	requestIDMiddleware(upstream).ServeHTTP(w, req)

	if gotHeader == "" {
		t.Error("expected X-Request-ID to be set on upstream request header")
	}
}

func TestAccessLogMiddleware_LogsRequestFields(t *testing.T) {
	var buf bytes.Buffer
	log := logger.New(logger.Config{Service: "gateway", Level: slog.LevelInfo, Format: "json", Writer: &buf})

	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	accessLogMiddleware(log, upstream).ServeHTTP(w, req)

	out := buf.String()
	if !bytes.Contains([]byte(out), []byte(`"msg":"http.request"`)) {
		t.Errorf("expected http.request log line, got: %s", out)
	}
	if !bytes.Contains([]byte(out), []byte(`"status":200`)) {
		t.Errorf("expected status 200 in log, got: %s", out)
	}
}

func TestAccessLogMiddleware_5xxLogsAtError(t *testing.T) {
	var buf bytes.Buffer
	log := logger.New(logger.Config{Service: "gateway", Level: slog.LevelInfo, Format: "json", Writer: &buf})

	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})

	req := httptest.NewRequest(http.MethodGet, "/boom", nil)
	w := httptest.NewRecorder()
	accessLogMiddleware(log, upstream).ServeHTTP(w, req)

	if !bytes.Contains(buf.Bytes(), []byte(`"level":"ERROR"`)) {
		t.Errorf("expected ERROR level log for 5xx response, got: %s", buf.String())
	}
}

func TestRecoverMiddleware_CatchesPanic(t *testing.T) {
	var buf bytes.Buffer
	log := logger.New(logger.Config{Service: "gateway", Level: slog.LevelInfo, Format: "json", Writer: &buf})

	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("boom")
	})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()

	recoverMiddleware(log, upstream).ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", w.Code)
	}
	if !bytes.Contains(buf.Bytes(), []byte("panic recovered")) {
		t.Errorf("expected panic log entry, got: %s", buf.String())
	}
	if !bytes.Contains(buf.Bytes(), []byte(`"panic":"boom"`)) {
		t.Errorf("expected panic value in log entry, got: %s", buf.String())
	}
	if !bytes.Contains(w.Body.Bytes(), []byte("internal_error")) {
		t.Errorf("expected internal_error in response body, got: %s", w.Body.String())
	}
}

func TestRecoverMiddleware_PassesThroughNormally(t *testing.T) {
	var buf bytes.Buffer
	log := logger.New(logger.Config{Service: "gateway", Level: slog.LevelInfo, Format: "json", Writer: &buf})

	called := false
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	recoverMiddleware(log, upstream).ServeHTTP(w, req)

	if !called {
		t.Error("expected upstream handler to be called")
	}
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}
