package main

import (
	"encoding/json"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/subly/gateway/logger"
)

// route maps a path prefix to an upstream service URL.
type route struct {
	prefix   string
	upstream *url.URL
}

// buildRoutes returns the gateway's path-prefix -> upstream routing table.
// Extracted from main() so tests can exercise the exact production route
// list (rather than a hand-copied mirror that could silently drift).
func buildRoutes(authURL, listingsURL, matchingURL *url.URL) []route {
	return []route{
		{prefix: "/api/auth", upstream: authURL},
		{prefix: "/api/public", upstream: listingsURL},
		{prefix: "/api/listings", upstream: listingsURL},
		{prefix: "/api/messages", upstream: listingsURL},
		{prefix: "/api/matching", upstream: matchingURL},
	}
}

// requiresAuth reports whether requests under the given route prefix must
// pass through authMiddleware before reaching the upstream. /api/public is
// deliberately excluded — it backs unauthenticated landing-page data
// (GET /public/reviews, GET /public/stats).
func requiresAuth(prefix string) bool {
	return prefix == "/api/listings" || prefix == "/api/messages" || prefix == "/api/matching"
}

func mustParseURL(log *logger.Logger, raw string) *url.URL {
	u, err := url.Parse(raw)
	if err != nil {
		log.Fatal("invalid upstream URL", "url", raw, "error", err)
	}
	return u
}

func newReverseProxy(log *logger.Logger, target *url.URL) http.Handler {
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Error("upstream error", "path", r.URL.Path, "request_id", logger.RequestIDFrom(r.Context()), "error", err)
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
	}
	return proxy
}

// authMiddleware validates the Clerk session via the auth service and injects X-User-ID.
// Requests without a valid .edu-verified account are rejected before reaching the upstream.
// Internal service calls authenticated via X-Internal-Secret bypass Clerk validation.
func authMiddleware(authServiceURL string, internalSecret string, next http.Handler) http.Handler {
	client := &http.Client{Timeout: 5 * time.Second}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Internal service bypass — webhook and server-to-server calls
		if internalSecret != "" && r.Header.Get("X-Internal-Secret") == internalSecret {
			r.Header.Del("X-Internal-Secret")
			r.Header.Set("X-Internal-Call", "true")
			next.ServeHTTP(w, r)
			return
		}

		token := r.Header.Get("Authorization")
		if token == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}

		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, authServiceURL+"/validate", nil)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
			return
		}
		req.Header.Set("Authorization", token)

		resp, err := client.Do(req)
		if err != nil || resp.StatusCode != http.StatusOK {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			if resp != nil {
				resp.Body.Close()
			}
			return
		}
		defer resp.Body.Close()

		var user struct {
			ID          string `json:"id"`
			EduVerified bool   `json:"edu_verified"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
			return
		}

		if !user.EduVerified {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "edu_verification_required"})
			return
		}

		r.Header.Set("X-User-ID", user.ID)
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func main() {
	log := logger.New(logger.ConfigFromEnv("gateway"))

	authURL := mustParseURL(log, envOr("AUTH_SERVICE_URL", "http://auth:3001"))
	listingsURL := mustParseURL(log, envOr("LISTINGS_SERVICE_URL", "http://listings:3002"))
	matchingURL := mustParseURL(log, envOr("MATCHING_SERVICE_URL", "http://matching:3003"))
	internalSecret := os.Getenv("INTERNAL_SECRET")

	if internalSecret == "" {
		log.Fatal("INTERNAL_SECRET must be set")
	}
	if internalSecret == "dev-internal-secret-change-in-prod" {
		log.Warn("INTERNAL_SECRET is the default dev value — change it before going to production")
	}
	if os.Getenv("ALLOWED_ORIGINS") == "" {
		log.Warn("ALLOWED_ORIGINS not set — CORS will allow all origins")
	}

	routes := buildRoutes(authURL, listingsURL, matchingURL)

	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","service":"gateway"}`))
	})

	for _, rt := range routes {
		prefix := rt.prefix
		proxy := newReverseProxy(log, rt.upstream)
		var h http.Handler = http.StripPrefix(prefix, proxy)
		if requiresAuth(prefix) {
			h = authRateLimitMiddleware(h)
			h = authMiddleware(authURL.String(), internalSecret, h)
		} else {
			h = publicRateLimitMiddleware(internalSecret, h)
		}
		mux.Handle(prefix+"/", h)
	}

	port := envOr("PORT", "8080")
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      requestIDMiddleware(recoverMiddleware(log, accessLogMiddleware(log, corsMiddleware(mux)))),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Info("listening", "port", port)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal("fatal", "error", err)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// corsMiddleware enforces an origin allowlist driven by ALLOWED_ORIGINS (comma-separated).
// Falls back to permissive "*" only when the env var is unset (local dev).
func corsMiddleware(next http.Handler) http.Handler {
	raw := os.Getenv("ALLOWED_ORIGINS")
	var allowed map[string]bool
	if raw != "" {
		allowed = make(map[string]bool)
		for _, o := range strings.Split(raw, ",") {
			if o = strings.TrimSpace(o); o != "" {
				allowed[o] = true
			}
		}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		var allowOrigin string
		if allowed == nil {
			// dev: allow all
			allowOrigin = "*"
		} else if origin != "" && allowed[origin] {
			allowOrigin = origin
		}

		if allowOrigin != "" {
			w.Header().Set("Access-Control-Allow-Origin", allowOrigin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", strings.Join([]string{
			"Content-Type", "Authorization", "X-Request-ID",
		}, ", "))
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
