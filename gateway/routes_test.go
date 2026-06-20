package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

// buildTestMux wires up the *real* production route table (buildRoutes) and
// the *real* auth-wrapping predicate (requiresAuth) against fake upstream
// handlers, so these tests exercise main()'s actual routing decisions rather
// than a hand-copied mirror that could silently drift from it. This guards
// the specific regression class described in the reviews-feature spec:
// "/api/public/* must be reachable without a bearer token while
// /api/listings and /api/messages must still require one."
func buildTestMux(t *testing.T, authURL string, internalSecret string) (mux *http.ServeMux, called map[string]*bool) {
	t.Helper()

	authU := mustParseURLForTest(t, "http://auth.invalid")
	listingsU := mustParseURLForTest(t, "http://listings.invalid")
	matchingU := mustParseURLForTest(t, "http://matching.invalid")

	routes := buildRoutes(authU, listingsU, matchingU)
	called = make(map[string]*bool)

	mux = http.NewServeMux()
	for _, rt := range routes {
		prefix := rt.prefix
		wasCalled := false
		called[prefix] = &wasCalled
		// Stand-in "upstream" that just records it was reached, instead of a
		// real reverse proxy (we don't have a live listings/matching service
		// in this unit test — we only care whether authMiddleware let the
		// request through to *some* downstream handler).
		upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			wasCalled = true
			w.WriteHeader(http.StatusOK)
		})
		var h http.Handler = http.StripPrefix(prefix, upstream)
		if requiresAuth(prefix) {
			h = authMiddleware(authURL, internalSecret, h)
		}
		mux.Handle(prefix+"/", h)
	}
	return mux, called
}

func mustParseURLForTest(t *testing.T, raw string) *url.URL {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("invalid test URL %q: %v", raw, err)
	}
	return u
}

// ── buildRoutes / requiresAuth (pure unit tests) ──────────────────────────────

func TestBuildRoutes_ContainsPublicPrefix(t *testing.T) {
	listingsU := mustParseURLForTest(t, "http://listings.invalid")
	routes := buildRoutes(mustParseURLForTest(t, "http://auth.invalid"), listingsU, mustParseURLForTest(t, "http://matching.invalid"))

	found := false
	for _, rt := range routes {
		if rt.prefix == "/api/public" {
			found = true
			if rt.upstream.String() != listingsU.String() {
				t.Errorf("expected /api/public to route to the listings upstream, got %s", rt.upstream)
			}
		}
	}
	if !found {
		t.Fatal("expected /api/public in the route table")
	}
}

func TestRequiresAuth_TableDriven(t *testing.T) {
	cases := []struct {
		prefix string
		want   bool
	}{
		{"/api/auth", false},
		{"/api/public", false},
		{"/api/listings", true},
		{"/api/messages", true},
		{"/api/matching", false},
	}
	for _, c := range cases {
		if got := requiresAuth(c.prefix); got != c.want {
			t.Errorf("requiresAuth(%q) = %v, want %v", c.prefix, got, c.want)
		}
	}
}

// ── End-to-end route-table behavior ───────────────────────────────────────────

// TestRouteTable_PublicPrefixBypassesAuth confirms that /api/public/* reaches
// the upstream with zero Authorization header and is NOT wrapped by
// authMiddleware.
func TestRouteTable_PublicPrefixBypassesAuth(t *testing.T) {
	auth := newErrorAuthServer() // would 401 any Clerk token if it were even consulted
	defer auth.Close()

	mux, called := buildTestMux(t, auth.URL, "")

	req := httptest.NewRequest(http.MethodGet, "/api/public/reviews", nil)
	// Deliberately no Authorization header.
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected /api/public/* to reach upstream without auth, got %d", w.Code)
	}
	if !*called["/api/public"] {
		t.Error("expected /api/public upstream to have been called")
	}
}

// TestRouteTable_PublicStatsBypassesAuth is a second concrete public
// endpoint (distinct path) to guard against a prefix-matching mistake that
// only happens to work for /api/public/reviews specifically.
func TestRouteTable_PublicStatsBypassesAuth(t *testing.T) {
	auth := newErrorAuthServer()
	defer auth.Close()

	mux, _ := buildTestMux(t, auth.URL, "")

	req := httptest.NewRequest(http.MethodGet, "/api/public/stats", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected /api/public/stats to reach upstream without auth, got %d", w.Code)
	}
}

// TestRouteTable_ListingsPrefixStillRequiresAuth confirms /api/listings/* —
// which now also fronts the new POST /reviews and GET /reviews/eligibility
// endpoints — is still wrapped by authMiddleware and rejects requests with no
// Authorization header before ever reaching the upstream.
func TestRouteTable_ListingsPrefixStillRequiresAuth(t *testing.T) {
	auth := newOKAuthServer("user-1", true) // would succeed if consulted
	defer auth.Close()

	mux, called := buildTestMux(t, auth.URL, "")

	req := httptest.NewRequest(http.MethodPost, "/api/listings/reviews", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for /api/listings/* with no Authorization header, got %d", w.Code)
	}
	if *called["/api/listings"] {
		t.Error("upstream should not have been called without auth")
	}
}

// TestRouteTable_ListingsReviewsEligibilityStillRequiresAuth specifically
// targets the new GET /reviews/eligibility endpoint to make sure it inherits
// the /api/listings auth wrapping rather than accidentally being treated as
// public.
func TestRouteTable_ListingsReviewsEligibilityStillRequiresAuth(t *testing.T) {
	auth := newOKAuthServer("user-1", true)
	defer auth.Close()

	mux, _ := buildTestMux(t, auth.URL, "")

	req := httptest.NewRequest(http.MethodGet, "/api/listings/reviews/eligibility?conversation_id=c1", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for /api/listings/reviews/eligibility with no auth, got %d", w.Code)
	}
}

// TestRouteTable_ListingsPrefixWithValidAuth_ReachesUpstream is the
// complementary happy-path check: a valid bearer token DOES reach the
// upstream for /api/listings/*.
func TestRouteTable_ListingsPrefixWithValidAuth_ReachesUpstream(t *testing.T) {
	auth := newOKAuthServer("user-1", true)
	defer auth.Close()

	mux, called := buildTestMux(t, auth.URL, "")

	req := httptest.NewRequest(http.MethodPost, "/api/listings/reviews", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 with valid auth, got %d", w.Code)
	}
	if !*called["/api/listings"] {
		t.Error("expected /api/listings upstream to have been called with valid auth")
	}
}

// TestRouteTable_PublicPrefix_IgnoresGarbageAuthorizationHeader makes sure a
// garbage Authorization header on a public route doesn't get validated or
// cause a non-200 — /api/public/* must not consult the auth service at all.
func TestRouteTable_PublicPrefix_IgnoresGarbageAuthorizationHeader(t *testing.T) {
	auth := newErrorAuthServer()
	defer auth.Close()

	mux, _ := buildTestMux(t, auth.URL, "")

	req := httptest.NewRequest(http.MethodGet, "/api/public/reviews", nil)
	req.Header.Set("Authorization", "garbage-not-a-bearer-token")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected /api/public/* to ignore garbage auth and still reach upstream, got %d", w.Code)
	}
}

// TestRouteTable_InternalSecretStillBypassesListingsAuth confirms the
// internal-service bypass (used by the Stripe webhook -> confirm flow) still
// works on /api/listings/* after the buildRoutes/requiresAuth refactor.
func TestRouteTable_InternalSecretStillBypassesListingsAuth(t *testing.T) {
	auth := newErrorAuthServer() // would reject any Clerk token
	defer auth.Close()

	mux, called := buildTestMux(t, auth.URL, "my-secret")

	req := httptest.NewRequest(http.MethodPost, "/api/listings/conversations/c1/confirm", nil)
	req.Header.Set("X-Internal-Secret", "my-secret")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected internal-secret bypass to reach upstream, got %d", w.Code)
	}
	if !*called["/api/listings"] {
		t.Error("expected /api/listings upstream to have been called via internal-secret bypass")
	}
}
