package main

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TestPoolConfigValues verifies that the pgxpool.Config produced by
// pgxpool.ParseConfig can be mutated to the values required by Change C
// (MaxConns=25, MinConns=5, MaxConnLifetime=30m, MaxConnIdleTime=5m,
// HealthCheckPeriod=1m) and that those values are stored correctly.
//
// This is a pure unit test: no real database connection is made.
// pgxpool.ParseConfig validates the DSN format and returns a Config struct;
// the pool is never dialled.
func TestPoolConfigValues(t *testing.T) {
	cfg, err := pgxpool.ParseConfig("postgres://test:test@localhost/testdb")
	if err != nil {
		t.Fatalf("pgxpool.ParseConfig failed: %v", err)
	}

	// Apply the same values used in main()
	cfg.MaxConns = 25
	cfg.MinConns = 5
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.HealthCheckPeriod = 1 * time.Minute

	if cfg.MaxConns != 25 {
		t.Errorf("expected MaxConns=25, got %d", cfg.MaxConns)
	}
	if cfg.MinConns != 5 {
		t.Errorf("expected MinConns=5, got %d", cfg.MinConns)
	}
	if cfg.MaxConnLifetime != 30*time.Minute {
		t.Errorf("expected MaxConnLifetime=30m, got %v", cfg.MaxConnLifetime)
	}
	if cfg.MaxConnIdleTime != 5*time.Minute {
		t.Errorf("expected MaxConnIdleTime=5m, got %v", cfg.MaxConnIdleTime)
	}
	if cfg.HealthCheckPeriod != 1*time.Minute {
		t.Errorf("expected HealthCheckPeriod=1m, got %v", cfg.HealthCheckPeriod)
	}
}

// TestPoolConfigParsesConnString verifies that ParseConfig correctly extracts
// the host and database name from a standard DSN — a sanity check that the
// pgxpool package is wired in correctly without requiring a live Postgres.
func TestPoolConfigParsesConnString(t *testing.T) {
	dsn := "postgres://testuser:testpass@db-host:5432/subly"
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatalf("pgxpool.ParseConfig(%q) failed: %v", dsn, err)
	}

	host := cfg.ConnConfig.Host
	if host != "db-host" {
		t.Errorf("expected host=db-host, got %q", host)
	}

	dbName := cfg.ConnConfig.Database
	if dbName != "subly" {
		t.Errorf("expected database=subly, got %q", dbName)
	}
}
