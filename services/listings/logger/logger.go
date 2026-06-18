package logger

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"io"
	"log/slog"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Service string
	Level   slog.Level
	Format  string // "json" or "text"
	Writer  io.Writer
}

type Logger struct {
	slog *slog.Logger
}

// ConfigFromEnv builds a Config from LOG_LEVEL / LOG_FORMAT env vars, defaulting
// to info/json. Unrecognized values fall back to their defaults; the caller
// (New) is responsible for warning about bad LOG_LEVEL values.
func ConfigFromEnv(service string) Config {
	format := os.Getenv("LOG_FORMAT")
	if format != "json" && format != "text" {
		format = "json"
	}
	return Config{
		Service: service,
		Level:   parseLevel(os.Getenv("LOG_LEVEL")),
		Format:  format,
		Writer:  os.Stdout,
	}
}

func New(cfg Config) *Logger {
	writer := cfg.Writer
	if writer == nil {
		writer = os.Stdout
	}

	opts := &slog.HandlerOptions{Level: cfg.Level}

	var handler slog.Handler
	if cfg.Format == "text" {
		handler = slog.NewTextHandler(writer, opts)
	} else {
		handler = slog.NewJSONHandler(writer, opts)
	}

	base := slog.New(handler).With("service", cfg.Service)
	l := &Logger{slog: base}

	if rawLevel := os.Getenv("LOG_LEVEL"); rawLevel != "" {
		if _, ok := levelStrings[rawLevel]; !ok {
			l.Warn("unrecognized LOG_LEVEL, defaulting to info", "log_level", rawLevel)
		}
	}

	return l
}

func (l *Logger) Debug(msg string, args ...any) {
	l.slog.Debug(msg, args...)
}

func (l *Logger) Info(msg string, args ...any) {
	l.slog.Info(msg, args...)
}

func (l *Logger) Warn(msg string, args ...any) {
	l.slog.Warn(msg, args...)
}

func (l *Logger) Error(msg string, args ...any) {
	l.slog.Error(msg, args...)
}

// Fatal logs at Error level then exits the process with status 1.
func (l *Logger) Fatal(msg string, args ...any) {
	l.slog.Error(msg, args...)
	os.Exit(1)
}

func (l *Logger) With(args ...any) *Logger {
	return &Logger{slog: l.slog.With(args...)}
}

func (l *Logger) Slog() *slog.Logger {
	return l.slog
}

type ctxKey int

const requestIDKey ctxKey = 0

func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey, id)
}

func RequestIDFrom(ctx context.Context) string {
	if v, ok := ctx.Value(requestIDKey).(string); ok {
		return v
	}
	return ""
}

// NewRequestID returns a 32-char hex string backed by crypto/rand, falling
// back to a timestamp-based ID if randomness is unavailable.
func NewRequestID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "req-" + strconv.FormatInt(time.Now().UnixNano(), 10)
	}
	return hex.EncodeToString(buf)
}

var levelStrings = map[string]slog.Level{
	"debug":   slog.LevelDebug,
	"info":    slog.LevelInfo,
	"warn":    slog.LevelWarn,
	"warning": slog.LevelWarn,
	"error":   slog.LevelError,
}

func parseLevel(s string) slog.Level {
	if lvl, ok := levelStrings[s]; ok {
		return lvl
	}
	return slog.LevelInfo
}
