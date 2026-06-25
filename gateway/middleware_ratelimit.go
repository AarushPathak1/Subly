package main

import (
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// rateLimitBucket pairs a token-bucket limiter with the last time it was
// used, so the eviction goroutine can reclaim memory from buckets that have
// gone idle (e.g. a one-off IP or a user who never comes back).
type rateLimitBucket struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// rateLimiterPool is a per-key token-bucket pool guarded by a mutex, with
// periodic eviction of stale entries so memory doesn't grow unbounded.
type rateLimiterPool struct {
	mu      sync.Mutex
	buckets map[string]*rateLimitBucket
	rps     rate.Limit
	burst   int
	idleTTL time.Duration
}

func newRateLimiterPool(perMinute int, burst int, idleTTL time.Duration) *rateLimiterPool {
	p := &rateLimiterPool{
		buckets: make(map[string]*rateLimitBucket),
		rps:     rate.Limit(float64(perMinute) / 60.0),
		burst:   burst,
		idleTTL: idleTTL,
	}
	go p.evictLoop()
	return p
}

func (p *rateLimiterPool) evictLoop() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		p.evictStale()
	}
}

func (p *rateLimiterPool) evictStale() {
	cutoff := time.Now().Add(-p.idleTTL)
	p.mu.Lock()
	defer p.mu.Unlock()
	for key, b := range p.buckets {
		if b.lastSeen.Before(cutoff) {
			delete(p.buckets, key)
		}
	}
}

// allow reports whether a request keyed by key is permitted right now, and
// the limiter's current burst size (used to compute Retry-After).
func (p *rateLimiterPool) allow(key string) bool {
	p.mu.Lock()
	b, ok := p.buckets[key]
	if !ok {
		b = &rateLimitBucket{limiter: rate.NewLimiter(p.rps, p.burst)}
		p.buckets[key] = b
	}
	b.lastSeen = time.Now()
	limiter := b.limiter
	p.mu.Unlock()

	return limiter.Allow()
}

// envIntOr returns the int value of the given env var, or fallback if unset
// or unparseable.
func envIntOr(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

const idleBucketTTL = 30 * time.Minute

var (
	authLimiterOnce   sync.Once
	authLimiterPool   *rateLimiterPool
	publicLimiterOnce sync.Once
	publicLimiterPool *rateLimiterPool
)

// getAuthLimiterPool returns the shared per-user limiter pool for
// authenticated routes, defaulting to 120 req/min with a burst of 60.
// Overridable via RATE_LIMIT_AUTH_PER_MINUTE / RATE_LIMIT_AUTH_BURST.
func getAuthLimiterPool() *rateLimiterPool {
	authLimiterOnce.Do(func() {
		authLimiterPool = newRateLimiterPool(
			envIntOr("RATE_LIMIT_AUTH_PER_MINUTE", 120),
			envIntOr("RATE_LIMIT_AUTH_BURST", 60),
			idleBucketTTL,
		)
	})
	return authLimiterPool
}

// getPublicLimiterPool returns the shared per-IP limiter pool for public
// routes, defaulting to 30 req/min with a burst of 15. Overridable via
// RATE_LIMIT_PUBLIC_PER_MINUTE / RATE_LIMIT_PUBLIC_BURST.
func getPublicLimiterPool() *rateLimiterPool {
	publicLimiterOnce.Do(func() {
		publicLimiterPool = newRateLimiterPool(
			envIntOr("RATE_LIMIT_PUBLIC_PER_MINUTE", 30),
			envIntOr("RATE_LIMIT_PUBLIC_BURST", 15),
			idleBucketTTL,
		)
	})
	return publicLimiterPool
}

// clientIP extracts the caller's IP, preferring the first hop of
// X-Forwarded-For (set by upstream proxies/load balancers) and falling back
// to RemoteAddr.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if first := strings.TrimSpace(parts[0]); first != "" {
			return first
		}
	}
	return r.RemoteAddr
}

// writeRateLimited writes a 429 response with a Retry-After header and a
// JSON body describing the rate limit error.
func writeRateLimited(w http.ResponseWriter, retryAfterSeconds int) {
	w.Header().Set("Retry-After", strconv.Itoa(retryAfterSeconds))
	writeJSON(w, http.StatusTooManyRequests, map[string]any{
		"error":               "rate_limited",
		"retry_after_seconds": retryAfterSeconds,
	})
}

// authRateLimitMiddleware keys on the X-User-ID header injected by
// authMiddleware, so it must be installed AFTER authMiddleware in the chain.
// Internal calls (X-Internal-Call: true, set by authMiddleware after
// validating X-Internal-Secret) bypass the limit entirely.
func authRateLimitMiddleware(next http.Handler) http.Handler {
	pool := getAuthLimiterPool()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Internal-Call") == "true" {
			next.ServeHTTP(w, r)
			return
		}

		key := r.Header.Get("X-User-ID")
		if key == "" {
			key = clientIP(r)
		}

		if !pool.allow(key) {
			writeRateLimited(w, 60)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// publicRateLimitMiddleware keys on the caller's client IP. Internal calls
// bypass the limit entirely — either already marked via X-Internal-Call:
// true (set by authMiddleware after validating X-Internal-Secret, for
// routes that also pass through authMiddleware), or, since public-prefix
// routes are never wrapped by authMiddleware, by presenting a valid
// X-Internal-Secret directly to this middleware.
func publicRateLimitMiddleware(internalSecret string, next http.Handler) http.Handler {
	pool := getPublicLimiterPool()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Internal-Call") == "true" {
			next.ServeHTTP(w, r)
			return
		}
		if internalSecret != "" && r.Header.Get("X-Internal-Secret") == internalSecret {
			next.ServeHTTP(w, r)
			return
		}

		if !pool.allow(clientIP(r)) {
			writeRateLimited(w, 60)
			return
		}
		next.ServeHTTP(w, r)
	})
}
