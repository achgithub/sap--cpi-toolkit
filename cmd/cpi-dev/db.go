package main

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

const cpiDevSchema = `
-- Shared tables: idempotent so cpi-dev can start before worker
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

-- Monitoring tiles
CREATE TABLE IF NOT EXISTS w_monitoring_tiles (
    id          TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL DEFAULT '',
    name        TEXT NOT NULL,
    time_range  TEXT NOT NULL DEFAULT 'Past Hour',
    status      TEXT NOT NULL DEFAULT '',
    package_id  TEXT NOT NULL DEFAULT '',
    iflow_id    TEXT NOT NULL DEFAULT '',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE w_monitoring_tiles ADD COLUMN IF NOT EXISTS package_id  TEXT NOT NULL DEFAULT '';
ALTER TABLE w_monitoring_tiles ADD COLUMN IF NOT EXISTS iflow_id    TEXT NOT NULL DEFAULT '';
ALTER TABLE w_monitoring_tiles ADD COLUMN IF NOT EXISTS instance_id TEXT NOT NULL DEFAULT '';

-- iFlow scaffold XML templates
CREATE TABLE IF NOT EXISTS w_scaffold_templates (
    key        TEXT PRIMARY KEY,
    label      TEXT NOT NULL DEFAULT '',
    body       TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

func initCPIDevDB(ctx context.Context, dbURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		return nil, fmt.Errorf("open pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	if _, err := pool.Exec(ctx, cpiDevSchema); err != nil {
		pool.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return pool, nil
}
