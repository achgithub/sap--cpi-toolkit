# SAP CPI Toolkit — Claude Project Configuration

## Project Overview

SAP developer toolkit built with Go + React (@ui5/webcomponents-react) + PostgreSQL.
Three deployment targets:
- **Dev** — Docker Compose (local Mac, each developer)
- **QA** — Cloud Kubernetes (shared team environment, platform TBD — EKS, AKS, or BTP Kyma)
- **Prod** — Same platform as QA (promote same images, same manifests)

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
10. EDI Tools (EDIFACT & ANSI X12 — parser, EDI↔XML converter, generator)

## Development Workflow

**This project does NOT use the Pi workflow.** It builds and runs entirely on Mac via Docker Desktop.

- Write code on Mac (Claude does this)
- Commit to Git on Mac (Claude does this)
- Build and test via Docker Compose on Mac (user does this)
- Deploy to QA/Prod Kubernetes via `scripts/push-images.sh` + `kubectl apply` (user does this)

Go and npm are NOT needed directly — all compilation happens inside Docker multi-stage builds.
Kubernetes does NOT need to be enabled in Docker Desktop for local dev.

## Dev — Docker Compose (local)

```bash
# Full stack — builds all images and starts services
docker compose -f deployments/local/docker-compose.yml up --build

# Rebuild a single service after changes
docker compose -f deployments/local/docker-compose.yml up --build portal
docker compose -f deployments/local/docker-compose.yml up --build worker

# View logs
docker compose -f deployments/local/docker-compose.yml logs -f

# Tear down
docker compose -f deployments/local/docker-compose.yml down
```

Open http://localhost:3000 after stack is up.

## QA / Prod — Kubernetes

Images are tagged for `ghcr.io/achgithub/cpi-toolkit-*:latest`.

```bash
# Build images locally (no push — for testing manifests)
scripts/build-images.sh

# Build and push to ghcr.io (required before deploying to cloud)
scripts/build-images.sh
scripts/push-images.sh

# Deploy to QA or Prod (platform TBD)
kubectl apply -k deployments/k8s/local     # local k8s (if needed)
kubectl apply -k deployments/k8s/kyma      # BTP Kyma
```

### Storage classes (set per environment in kustomize overlay)
- **Local kind** (if used): `local-path`
- **Azure AKS**: `managed-csi`
- **AWS EKS**: `gp2`
- **BTP Kyma**: depends on underlying cloud
