package main

import (
	"net/http"
	"regexp"
	"runtime/debug"
	"time"

	"github.com/subly/listings/logger"
)

var requestIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

// requestIDMiddleware preserves a valid inbound X-Request-ID, generates a new
// one otherwise, and propagates it via context, response header, and upstream
// request header.
func requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if id == "" || !requestIDPattern.MatchString(id) {
			id = logger.NewRequestID()
		}

		r.Header.Set("X-Request-ID", id)
		w.Header().Set("X-Request-ID", id)

		ctx := logger.WithRequestID(r.Context(), id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	n, err := s.ResponseWriter.Write(b)
	s.bytes += n
	return n, err
}

// accessLogMiddleware emits one structured JSON log line per request.
func accessLogMiddleware(log *logger.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}

		next.ServeHTTP(rec, r)

		status := rec.status
		if status == 0 {
			status = http.StatusOK
		}

		fields := []any{
			"method", r.Method,
			"path", r.URL.Path,
			"status", status,
			"bytes", rec.bytes,
			"duration_ms", time.Since(start).Milliseconds(),
			"request_id", logger.RequestIDFrom(r.Context()),
			"remote_addr", r.RemoteAddr,
			"user_agent", r.UserAgent(),
		}

		if status >= 500 {
			log.Error("http.request", fields...)
		} else {
			log.Info("http.request", fields...)
		}
	})
}

// recoverMiddleware catches panics in downstream handlers, logs them with a
// stack trace, and returns a 500 instead of crashing the process.
func recoverMiddleware(log *logger.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Error("panic recovered",
					"panic", rec,
					"stack", string(debug.Stack()),
					"request_id", logger.RequestIDFrom(r.Context()),
				)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal_error"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}
