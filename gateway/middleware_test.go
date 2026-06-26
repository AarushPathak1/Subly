package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// newOKAuthServer returns a mock auth service that always responds with an edu-verified user.
func newOKAuthServer(id string, eduVerified bool) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{
			"id":           id,
			"edu_verified": eduVerified,
		})
	}))
}

// newErrorAuthServer returns a mock auth service that always returns 401.
func newErrorAuthServer() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
	}))
}

// upstreamRecorder records whether the upstream handler was actually called.
func upstreamRecorder(called *bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*called = true
		w.WriteHeader(http.StatusOK)
	})
}

// ── Unit tests ────────────────────────────────────────────────────────────────

func TestAuthMiddleware_NoAuthorizationHeader(t *testing.T) {
	auth := newOKAuthServer("user-1", true)
	defer auth.Close()

	called := false
	mw := authMiddleware(auth.URL, "", upstreamRecorder(&called))

	req := httptest.NewRequest(http.MethodGet, "/api/listings", nil)
	w := httptest.NewRecorder()
	mw.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
	if called {
		t.Error("upstream should not have been called without a token")
	}
}

func TestAuthMiddleware_AuthServiceReturnsError(t *testing.T) {
	auth := newErrorAuthServer()
	defer auth.Close()

	called := false
	mw := authMiddleware(auth.URL, "", upstreamRecorder(&called))

	req := httptest.NewRequest(http.MethodGet, "/api/listings", nil)
	req.Header.Set("Authorization", "Bearer fake-token")
	w := httptest.NewRecorder()
	mw.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
	if called {
		t.Error("upstream should not be called when auth service rejects the token")
	}
}

func TestAuthMiddleware_UserNotEduVerified(t *testing.T) {
	auth := newOKAuthServer("user-2", false) // edu_verified = false
	defer auth.Close()

	called := false
	mw := authMiddleware(auth.URL, "", upstreamRecorder(&called))

	req := httptest.NewRequest(http.MethodGet, "/api/listings", nil)
	req.Header.Set("Authorization", "Bearer valid-token")
	w := httptest.NewRecorder()
	mw.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", w.Code)
	}
	if called {
		t.Error("upstream should not be called for unverified users")
	}
}

func TestAuthMiddleware_ValidVerifiedUser_InjectsUserID(t *testing.T) {
	userID := "abc-123"
	auth := newOKAuthServer(userID, true)
	defer auth.Close()

	var injectedID string
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		injectedID = r.Header.Get("X-User-ID")
		w.WriteHeader(http.StatusOK)
	})

	mw := authMiddleware(auth.URL, "", upstream)

	req := httptest.NewRequest(http.MethodGet, "/api/listings", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	w := httptest.NewRecorder()
	mw.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if injectedID != userID {
		t.Errorf("expected X-User-ID=%q, got %q", userID, injectedID)
	}
}

func TestAuthMiddleware_InternalSecret_BypassesClerkAuth(t *testing.T) {
	auth := newErrorAuthServer() // would reject any Clerk token
	defer auth.Close()

	var gotInternalCall string
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotInternalCall = r.Header.Get("X-Internal-Call")
		w.WriteHeader(http.StatusOK)
	})

	mw := authMiddleware(auth.URL, "my-secret", upstream)

	req := httptest.NewRequest(http.MethodPost, "/api/messages/conversations/c1/confirm", nil)
	req.Header.Set("X-Internal-Secret", "my-secret")
	w := httptest.NewRecorder()
	mw.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if gotInternalCall != "true" {
		t.Errorf("expected X-Internal-Call=true, got %q", gotInternalCall)
	}
}

func TestAuthMiddleware_InternalSecret_WrongSecret_Rejected(t *testing.T) {
	auth := newErrorAuthServer()
	defer auth.Close()

	called := false
	mw := authMiddleware(auth.URL, "correct-secret", upstreamRecorder(&called))

	req := httptest.NewRequest(http.MethodPost, "/api/messages/conversations/c1/confirm", nil)
	req.Header.Set("X-Internal-Secret", "wrong-secret")
	w := httptest.NewRecorder()
	mw.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
	if called {
		t.Error("upstream should not be called with wrong internal secret")
	}
}

// TestAuthMiddleware_ClientSuppliedInternalCallHeaderIsStripped is the C1
// regression test: a normally-authenticated request (valid bearer token,
// no X-Internal-Secret) that also sets X-Internal-Call: true directly must
// never have that header reach the upstream — only authMiddleware itself,
// after validating X-Internal-Secret, is allowed to set it.
func TestAuthMiddleware_ClientSuppliedInternalCallHeaderIsStripped(t *testing.T) {
	userID := "abc-123"
	auth := newOKAuthServer(userID, true)
	defer auth.Close()

	var gotInternalCall string
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotInternalCall = r.Header.Get("X-Internal-Call")
		w.WriteHeader(http.StatusOK)
	})

	mw := authMiddleware(auth.URL, "my-secret", upstream)

	req := httptest.NewRequest(http.MethodGet, "/api/listings", nil)
	req.Header.Set("Authorization", "Bearer valid-token")
	req.Header.Set("X-Internal-Call", "true")
	w := httptest.NewRecorder()
	mw.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if gotInternalCall != "" {
		t.Errorf("expected client-supplied X-Internal-Call to be stripped, but upstream saw %q", gotInternalCall)
	}
}

func TestAuthMiddleware_InternalSecret_NotForwardedToUpstream(t *testing.T) {
	auth := newErrorAuthServer()
	defer auth.Close()

	var forwardedSecret string
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		forwardedSecret = r.Header.Get("X-Internal-Secret")
		w.WriteHeader(http.StatusOK)
	})

	mw := authMiddleware(auth.URL, "my-secret", upstream)

	req := httptest.NewRequest(http.MethodPost, "/api/messages/conversations/c1/confirm", nil)
	req.Header.Set("X-Internal-Secret", "my-secret")
	w := httptest.NewRecorder()
	mw.ServeHTTP(w, req)

	if forwardedSecret != "" {
		t.Errorf("X-Internal-Secret should be stripped before forwarding, got %q", forwardedSecret)
	}
}

// ── Helper tests ──────────────────────────────────────────────────────────────

func TestEnvOr_ReturnsFallbackWhenUnset(t *testing.T) {
	result := envOr("SUBLY_TEST_NONEXISTENT_VAR_XYZ", "fallback")
	if result != "fallback" {
		t.Errorf("expected fallback, got %q", result)
	}
}

func TestEnvOr_ReturnsEnvWhenSet(t *testing.T) {
	t.Setenv("SUBLY_TEST_VAR", "hello")
	result := envOr("SUBLY_TEST_VAR", "fallback")
	if result != "hello" {
		t.Errorf("expected hello, got %q", result)
	}
}

func TestWriteJSON_SetsContentTypeAndStatus(t *testing.T) {
	w := httptest.NewRecorder()
	writeJSON(w, http.StatusCreated, map[string]string{"id": "x"})

	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d", w.Code)
	}
	ct := w.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("expected application/json, got %q", ct)
	}
}
