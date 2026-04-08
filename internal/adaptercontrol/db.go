package adaptercontrol

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// schema creates all adapter-control tables if they don't already exist.
const schema = `
CREATE TABLE IF NOT EXISTS ac_scenarios (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ac_adapters (
    id            TEXT PRIMARY KEY,
    scenario_id   TEXT NOT NULL REFERENCES ac_scenarios(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    type          TEXT NOT NULL,
    behavior_mode TEXT NOT NULL DEFAULT 'success',
    config        JSONB NOT NULL DEFAULT '{}',
    credentials   JSONB,
    ingress_url   TEXT NOT NULL DEFAULT '',
    last_activity TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ac_assets (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    content      TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ac_connections (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    url        TEXT NOT NULL,
    username   TEXT NOT NULL DEFAULT '',
    password   TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Single-row table for SFTP config; initialised by InitSFTP.
CREATE TABLE IF NOT EXISTS ac_sftp (
    id     TEXT PRIMARY KEY DEFAULT 'default',
    config JSONB NOT NULL DEFAULT '{}'
);
`

// InitDB opens a connection pool, pings, and runs the schema migration.
func InitDB(ctx context.Context, dbURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		return nil, fmt.Errorf("open pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	if _, err := pool.Exec(ctx, schema); err != nil {
		pool.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return pool, nil
}
