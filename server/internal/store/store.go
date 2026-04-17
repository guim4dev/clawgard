package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Store wraps a pgxpool and exposes typed accessors for the domain entities.
type Store struct {
	pool *pgxpool.Pool
}

// Open opens a Postgres connection pool.
func Open(ctx context.Context, dsn string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse dsn: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("open pool: %w", err)
	}
	return &Store{pool: pool}, nil
}

// Ping verifies the connection is alive.
func (s *Store) Ping(ctx context.Context) error {
	return s.pool.Ping(ctx)
}

// Close shuts down the pool.
func (s *Store) Close() {
	s.pool.Close()
}

// Pool exposes the underlying pool for internal packages that need raw access.
func (s *Store) Pool() *pgxpool.Pool {
	return s.pool
}
