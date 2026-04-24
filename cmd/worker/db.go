package main

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

const workerSchema = `
CREATE TABLE IF NOT EXISTS w_http_collections (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS w_http_requests (
    id            TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES w_http_collections(id) ON DELETE CASCADE,
    name          TEXT NOT NULL DEFAULT '',
    method        TEXT NOT NULL DEFAULT 'GET',
    url           TEXT NOT NULL DEFAULT '',
    headers       JSONB NOT NULL DEFAULT '{}',
    body          TEXT NOT NULL DEFAULT '',
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS w_lookup_tables (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    values     JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS w_cpi_instances (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    system_type TEXT NOT NULL DEFAULT 'TRL',
    api_key     JSONB,
    pi_key      JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE w_cpi_instances ADD COLUMN IF NOT EXISTS system_type TEXT NOT NULL DEFAULT 'TRL';
`

func initWorkerDB(ctx context.Context, dbURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		return nil, fmt.Errorf("open pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	if _, err := pool.Exec(ctx, workerSchema); err != nil {
		pool.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return pool, nil
}
