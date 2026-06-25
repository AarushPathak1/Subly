package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"testing"
)

func freshAuthLimiterPool(t *testing.T, perMinute, burst int) {
	t.Helper()
	t.Setenv("RATE_LIMIT_AUTH_PER_MINUTE", strconv.Itoa(perMinute))
	t.Setenv("RATE_LIMIT_AUTH_BURST", strconv.Itoa(burst))
	authLimiterOnce = sync.Once{}
	authLimiterPool = nil
}

func freshPublicLimiterPool(t *testing.T, perMinute, burst int) {
	t.Helper()
	t.Setenv("RATE_LIMIT_PUBLIC_PER_MINUTE", strconv.Itoa(perMinute))
	t.Setenv("RATE_LIMIT_PUBLIC_BURST", strconv.Itoa(burst))
	publicLimiterOnce = sync.Once{}
	publicLimiterPool = nil
}

func TestAuthRateLimitMiddleware_AllowsUpToBurstThen429(t *testing.T) {
	freshAuthLimiterPool(t, 120, 3)

	called := 0
	mw := authRateLimitMiddleware(upstreamCounter(&called))

	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/listings", nil)
		req.Header.Set("X-User-ID", "user-1")
		w := httptest.NewRecorder()
		mw.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("request %d: expected 200, got %d", i, w.Code)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/listings", nil)
	req.Header.Set("X-User-ID", "user-1")
	w := httptest.NewRecorder()
	mw.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after exceeding burst, got %d", w.Code)
	}
	if called != 3 {
		t.Errorf("expected upstream called exactly 3 times, got %d", called)
	}
}

func TestAuthRateLimitMiddleware_DifferentUsersGetIndependentBuckets(t *testing.T) {
	freshAuthLimiterPool(t, 120, 1)

	called := 0
	mw := authRateLimitMiddleware(upstreamCounter(&called))

	req1 := httptest.NewRequest(http.MethodGet, "/api/listings", nil)
	req1.Header.Set("X-User-ID", "user-a")
	w1 := httptest.NewRecorder()
	mw.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected user-a's first request to succeed, got %d", w1.Code)
	}

	req2 := httptest.NewRequest(http.MethodGet, "/api/listings", nil)
	req2.Header.Set("X-User-ID", "user-b")
	w2 := httptest.NewRecorder()
	mw.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected user-b's first request to succeed independently of user-a, got %d", w2.Code)
	}

	// user-a is now out of burst, user-b still has its own independent bucket exhausted too (burst=1)
	req3 := httptest.NewRequest(http.MethodGet, "/api/listings", nil)
	req3.Header.Set("X-User-ID", "user-a")
	w3 := httptest.NewRecorder()
	mw.ServeHTTP(w3, req3)
	if w3.Code != http.StatusTooManyRequests {
		t.Fatalf("expected user-a's second request to be rate limited, got %d", w3.Code)
	}
}

func TestAuthRateLimitMiddleware_InternalCallBypassesLimit(t *testing.T) {
	freshAuthLimiterPool(t, 120, 1)

	called := 0
	mw := authRateLimitMiddleware(upstreamCounter(&called))

	for i := 0; i < 10; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/listings", nil)
		req.Header.Set("X-User-ID", "user-1")
		req.Header.Set("X-Internal-Call", "true")
		w := httptest.NewRecorder()
		mw.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("internal call %d: expected 200 (bypass), got %d", i, w.Code)
		}
	}
	if called != 10 {
		t.Errorf("expected all 10 internal calls to reach upstream, got %d", called)
	}
}

func TestPublicRateLimitMiddleware_AllowsUpToBurstThen429(t *testing.T) {
	freshPublicLimiterPool(t, 30, 2)

	called := 0
	mw := publicRateLimitMiddleware("", upstreamCounter(&called))

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/public/stats", nil)
		req.RemoteAddr = "1.2.3.4:5555"
		w := httptest.NewRecorder()
		mw.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("request %d: expected 200, got %d", i, w.Code)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/public/stats", nil)
	req.RemoteAddr = "1.2.3.4:5555"
	w := httptest.NewRecorder()
	mw.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after exceeding burst, got %d", w.Code)
	}
}

func TestPublicRateLimitMiddleware_KeyedByIP_HonorsXForwardedFor(t *testing.T) {
	freshPublicLimiterPool(t, 30, 1)

	called := 0
	mw := publicRateLimitMiddleware("", upstreamCounter(&called))

	req1 := httptest.NewRequest(http.MethodGet, "/api/public/stats", nil)
	req1.RemoteAddr = "10.0.0.1:1111"
	req1.Header.Set("X-Forwarded-For", "9.9.9.9, 10.0.0.1")
	w1 := httptest.NewRecorder()
	mw.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected first request from 9.9.9.9 to succeed, got %d", w1.Code)
	}

	// Same XFF first hop, different RemoteAddr -> should still be the same bucket and now 429.
	req2 := httptest.NewRequest(http.MethodGet, "/api/public/stats", nil)
	req2.RemoteAddr = "10.0.0.2:2222"
	req2.Header.Set("X-Forwarded-For", "9.9.9.9, 10.0.0.2")
	w2 := httptest.NewRecorder()
	mw.ServeHTTP(w2, req2)
	if w2.Code != http.StatusTooManyRequests {
		t.Fatalf("expected second request keyed by same XFF IP to be rate limited, got %d", w2.Code)
	}

	// A genuinely different XFF IP gets its own bucket.
	req3 := httptest.NewRequest(http.MethodGet, "/api/public/stats", nil)
	req3.RemoteAddr = "10.0.0.3:3333"
	req3.Header.Set("X-Forwarded-For", "8.8.8.8, 10.0.0.3")
	w3 := httptest.NewRecorder()
	mw.ServeHTTP(w3, req3)
	if w3.Code != http.StatusOK {
		t.Fatalf("expected request from a different XFF IP to succeed, got %d", w3.Code)
	}
}

func TestPublicRateLimitMiddleware_InternalSecretBypassesLimit(t *testing.T) {
	freshPublicLimiterPool(t, 30, 1)

	called := 0
	mw := publicRateLimitMiddleware("my-secret", upstreamCounter(&called))

	for i := 0; i < 10; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/auth/validate", nil)
		req.RemoteAddr = "1.2.3.4:5555"
		req.Header.Set("X-Internal-Secret", "my-secret")
		w := httptest.NewRecorder()
		mw.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("internal call %d: expected 200 (bypass), got %d", i, w.Code)
		}
	}
	if called != 10 {
		t.Errorf("expected all 10 internal calls to reach upstream, got %d", called)
	}
}

func TestPublicRateLimitMiddleware_InternalCallHeaderBypassesLimit(t *testing.T) {
	freshPublicLimiterPool(t, 30, 1)

	called := 0
	mw := publicRateLimitMiddleware("", upstreamCounter(&called))

	for i := 0; i < 10; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/public/stats", nil)
		req.RemoteAddr = "1.2.3.4:5555"
		req.Header.Set("X-Internal-Call", "true")
		w := httptest.NewRecorder()
		mw.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("internal call %d: expected 200 (bypass), got %d", i, w.Code)
		}
	}
}

func TestRateLimited429Response_BodyShapeAndRetryAfterHeader(t *testing.T) {
	freshPublicLimiterPool(t, 30, 1)

	mw := publicRateLimitMiddleware("", upstreamCounter(new(int)))

	req1 := httptest.NewRequest(http.MethodGet, "/api/public/stats", nil)
	req1.RemoteAddr = "5.5.5.5:1"
	mw.ServeHTTP(httptest.NewRecorder(), req1)

	req2 := httptest.NewRequest(http.MethodGet, "/api/public/stats", nil)
	req2.RemoteAddr = "5.5.5.5:1"
	w := httptest.NewRecorder()
	mw.ServeHTTP(w, req2)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", w.Code)
	}
	if w.Header().Get("Retry-After") == "" {
		t.Error("expected Retry-After header to be set")
	}
	if w.Header().Get("Content-Type") != "application/json" {
		t.Errorf("expected application/json content type, got %q", w.Header().Get("Content-Type"))
	}

	var body map[string]any
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}
	if body["error"] != "rate_limited" {
		t.Errorf("expected error=rate_limited, got %v", body["error"])
	}
	if _, ok := body["retry_after_seconds"]; !ok {
		t.Error("expected retry_after_seconds field in response body")
	}
}

func TestClientIP_PrefersFirstHopOfXForwardedFor(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	req.Header.Set("X-Forwarded-For", "203.0.113.5, 10.0.0.1")

	if got := clientIP(req); got != "203.0.113.5" {
		t.Errorf("expected 203.0.113.5, got %q", got)
	}
}

func TestClientIP_FallsBackToRemoteAddr(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:1234"

	if got := clientIP(req); got != "10.0.0.1:1234" {
		t.Errorf("expected 10.0.0.1:1234, got %q", got)
	}
}

func upstreamCounter(called *int) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*called++
		w.WriteHeader(http.StatusOK)
	})
}
