package logger

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

func TestParseLevel_Known(t *testing.T) {
	cases := map[string]slog.Level{
		"debug":   slog.LevelDebug,
		"info":    slog.LevelInfo,
		"warn":    slog.LevelWarn,
		"warning": slog.LevelWarn,
		"error":   slog.LevelError,
	}
	for input, want := range cases {
		if got := parseLevel(input); got != want {
			t.Errorf("parseLevel(%q) = %v, want %v", input, got, want)
		}
	}
}

func TestParseLevel_Unknown(t *testing.T) {
	if got := parseLevel("not-a-level"); got != slog.LevelInfo {
		t.Errorf("parseLevel(unknown) = %v, want %v", got, slog.LevelInfo)
	}
	if got := parseLevel(""); got != slog.LevelInfo {
		t.Errorf("parseLevel(\"\") = %v, want %v", got, slog.LevelInfo)
	}
}

func TestConfigFromEnv_Defaults(t *testing.T) {
	t.Setenv("LOG_LEVEL", "")
	t.Setenv("LOG_FORMAT", "")
	cfg := ConfigFromEnv("gateway")
	if cfg.Service != "gateway" {
		t.Errorf("expected service=gateway, got %q", cfg.Service)
	}
	if cfg.Level != slog.LevelInfo {
		t.Errorf("expected default level info, got %v", cfg.Level)
	}
	if cfg.Format != "json" {
		t.Errorf("expected default format json, got %q", cfg.Format)
	}
}

func TestConfigFromEnv_Overrides(t *testing.T) {
	t.Setenv("LOG_LEVEL", "debug")
	t.Setenv("LOG_FORMAT", "text")
	cfg := ConfigFromEnv("listings")
	if cfg.Level != slog.LevelDebug {
		t.Errorf("expected level debug, got %v", cfg.Level)
	}
	if cfg.Format != "text" {
		t.Errorf("expected format text, got %q", cfg.Format)
	}
}

func TestConfigFromEnv_UnknownFormatDefaultsToJSON(t *testing.T) {
	t.Setenv("LOG_FORMAT", "yaml")
	cfg := ConfigFromEnv("gateway")
	if cfg.Format != "json" {
		t.Errorf("expected fallback format json, got %q", cfg.Format)
	}
}

func TestLogger_Info_EmitsJSONWithServiceField(t *testing.T) {
	var buf bytes.Buffer
	l := New(Config{Service: "gateway", Level: slog.LevelInfo, Format: "json", Writer: &buf})

	l.Info("hello", "key", "value")

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("expected valid JSON log line, got error: %v (line: %s)", err, buf.String())
	}
	if entry["service"] != "gateway" {
		t.Errorf("expected service=gateway, got %v", entry["service"])
	}
	if entry["msg"] != "hello" {
		t.Errorf("expected msg=hello, got %v", entry["msg"])
	}
	if entry["key"] != "value" {
		t.Errorf("expected key=value, got %v", entry["key"])
	}
}

func TestLogger_With_AttachesAttrs(t *testing.T) {
	var buf bytes.Buffer
	l := New(Config{Service: "gateway", Level: slog.LevelInfo, Format: "json", Writer: &buf})

	scoped := l.With("request_id", "abc123")
	scoped.Info("scoped message")

	if !strings.Contains(buf.String(), `"request_id":"abc123"`) {
		t.Errorf("expected request_id attr in output, got: %s", buf.String())
	}
}

func TestWithRequestID_RoundTrip(t *testing.T) {
	ctx := WithRequestID(context.Background(), "req-1")
	if got := RequestIDFrom(ctx); got != "req-1" {
		t.Errorf("expected req-1, got %q", got)
	}
}

func TestRequestIDFrom_EmptyContext(t *testing.T) {
	if got := RequestIDFrom(context.Background()); got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestNewRequestID_Uniqueness(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 1000; i++ {
		id := NewRequestID()
		if seen[id] {
			t.Fatalf("duplicate request ID generated: %s", id)
		}
		seen[id] = true
		if len(id) != 32 {
			t.Errorf("expected 32-char hex ID, got %d chars: %s", len(id), id)
		}
	}
}
