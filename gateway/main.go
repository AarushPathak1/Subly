package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time"
)

// route maps a path prefix to an upstream service URL.
type route struct {
	prefix   string
	upstream *url.URL
}

func mustParseURL(raw string) *url.URL {
	u, err := url.Parse(raw)
	if err != nil {
		log.Fatalf("invalid upstream URL %q: %v", raw, err)
	}
	return u
}

func newReverseProxy(target *url.URL) http.Handler {
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("[gateway] upstream error for %s: %v", r.URL.Path, err)
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
	}
	return proxy
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("[gateway] %s %s — %v", r.Method, r.URL.Path, time.Since(start))
	})
}

func main() {
	authURL := mustParseURL(envOr("AUTH_SERVICE_URL", "http://auth:3001"))
	listingsURL := mustParseURL(envOr("LISTINGS_SERVICE_URL", "http://listings:3002"))
	matchingURL := mustParseURL(envOr("MATCHING_SERVICE_URL", "http://matching:3003"))

	routes := []route{
		{prefix: "/api/auth", upstream: authURL},
		{prefix: "/api/listings", upstream: listingsURL},
		{prefix: "/api/matching", upstream: matchingURL},
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","service":"gateway"}`))
	})

	for _, rt := range routes {
		prefix := rt.prefix
		proxy := newReverseProxy(rt.upstream)
		mux.Handle(prefix+"/", http.StripPrefix(prefix, proxy))
	}

	port := envOr("PORT", "8080")
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      loggingMiddleware(corsMiddleware(mux)),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("[gateway] listening on :%s", port)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("[gateway] fatal: %v", err)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// corsMiddleware adds permissive CORS headers for local development.
// Replace with a proper allow-list before production.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = "*"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
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
