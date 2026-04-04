# SAP CPI Toolkit — Claude Project Configuration

## Project Overview

SAP developer toolkit built with Go + React (@ui5/webcomponents-react) + PostgreSQL.
Two deployment targets: local Docker Compose and SAP BTP Kyma.

See `docs/architecture.md` for full architecture. See `docs/features.md` for feature specs.

## Repository

https://github.com/achgithub/sap--cpi-toolkit

## Predecessor Project

`formatter-app` (at `/Users/andrew/Documents/Projects/formatter-app`) contains working Go handlers for XML/JSON formatting and conversion worth migrating. Check there before re-implementing those features.

## Services & Ports

| Service | Local Port | Notes |
|---|---|---|
| portal | 3000 | React UI + IAS auth + API proxy |
| worker | 8081 | Compute features (never internet-exposed) |
| groovy-runner | 8082 | JVM Groovy execution (never internet-exposed) |
| postgres | 5432 | Templates and settings |

## Go Module Path

`github.com/achgithub/sap-cpi-toolkit`

## Key Architectural Decisions

- **Auth bypass**: Only active when `DEPLOYMENT_ENV=local` AND `AUTH_BYPASS_ENABLED=true`. `DEPLOYMENT_ENV=kyma` locks it out permanently.
- **Worker pod never exposed**: Portal proxies all `/api/worker/*` calls internally. Worker has no auth of its own.
- **Ephemeral keys/certs**: PGP, SSH, and certificate generation is never stored. Download only. Validity dates are capped via env vars.
- **No Redis**: PostgreSQL handles all state. No pub/sub or distributed session requirements.
- **Groovy runner is separate**: JVM pod scales to zero independently from the Go worker.

## Build Order (Planned)

1. Repo scaffold — Go modules, React app init
2. Portal: static server + IAS OIDC middleware (with bypass)
3. Worker: XML/JSON formatter + converter (migrate from formatter-app)
4. Worker: PGP, SSH, cert generation
5. Worker: Test data generator
6. React UI: UI5 shell, navigation, tool pages
7. Docker Compose (local end-to-end)
8. Kyma manifests (KEDA, API Rules, Secrets)
9. Groovy runner (stub pod → full execution engine)

## Development Workflow

This project follows the global Mac/Pi workflow from `~/.claude/CLAUDE.md`:
- Write code on Mac (here)
- Commit to Git on Mac
- Push manually
- Build/test on Pi

## Testing Commands (run on Pi after pull)

```bash
# Go tests (worker)
cd /path/to/sap-cpi-toolkit
go test ./...

# React build
cd web && npm install && npm run build

# Docker Compose (full local stack)
docker compose -f deployments/local/docker-compose.yml up --build
```
