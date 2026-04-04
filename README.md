# SAP CPI Toolkit

A developer toolkit for SAP Cloud Platform Integration (CPI) built with Go, React (@ui5/webcomponents-react), and PostgreSQL. Designed to run locally via Docker Compose or on SAP BTP Kyma with scale-to-zero cost management.

## Features

| # | Tool | Description |
|---|---|---|
| 1 | XML Formatter | Format and validate XML with syntax highlighting |
| 2 | JSON Formatter | Format and validate JSON |
| 3 | XML ↔ JSON Converter | Roundtrip-safe conversion preserving namespaces |
| 4 | PGP Key Generation | Ephemeral keypair generation (POC use only) |
| 5 | SSH Key Generation | Ephemeral keypair generation |
| 6 | Certificate Generation | Ephemeral self-signed cert generation (capped validity) |
| 7 | Test Data Generator | Upload XML, select fields, generate bulk test data with variations |
| 8 | Groovy IDE | Monaco editor with SAP CPI API stubs, syntax highlighting, and sandboxed execution |
| 9 | EDI Tools | EDIFACT & ANSI X12 parser, validator, EDI ↔ XML converter, EDI generator |

## Architecture

Three-pod design optimised for scale-to-zero on Kyma:

```
Internet / SAP IAS
        │
        ▼
  ┌─────────────┐   always on, ~64MB
  │   portal    │   React UI + Go server
  │             │   IAS OIDC auth, API proxy
  └──────┬──────┘
         │ internal only
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌──────────────┐
│ worker │ │ groovy-runner│   both scale to zero via KEDA HTTP Add-on
│  (Go)  │ │  (JVM/Alpine)│   cold start ~5-15s, auto-sleep after idle
└────┬───┘ └──────────────┘
     │
     ▼
┌──────────┐
│PostgreSQL│   templates, settings
└──────────┘
```

See [`docs/architecture.md`](docs/architecture.md) for full details.

## Deployment

| Target | Method |
|---|---|
| Local / Docker Desktop | `docker compose up` (see [`docs/deployment.md`](docs/deployment.md)) |
| SAP BTP Kyma | Kubernetes manifests + KEDA (see [`deployments/kyma/`](deployments/kyma/)) |

## Quick Start (Local)

```bash
# Copy environment config
cp deployments/local/.env.example deployments/local/.env

# Start all services
docker compose -f deployments/local/docker-compose.yml up
```

Open http://localhost:3000

Auth is bypassed in local mode. See [`docs/deployment.md`](docs/deployment.md) for configuration.

## Project Structure

```
sap-cpi-toolkit/
├── cmd/
│   ├── portal/           # Go: IAS OIDC auth, static file server, API proxy
│   └── worker/           # Go: all compute features (formatter, keygen, testdata)
├── internal/
│   ├── auth/             # OIDC middleware + dev bypass guard
│   ├── formatter/        # XML + JSON formatting and validation
│   ├── converter/        # XML ↔ JSON conversion
│   ├── keygen/           # PGP, SSH, certificate generation
│   └── testdata/         # Test data generator engine
├── web/                  # React + @ui5/webcomponents-react
│   └── src/
│       ├── components/
│       └── pages/        # one per tool
├── groovy-runner/        # Isolated JVM service for Groovy execution
├── deployments/
│   ├── local/            # docker-compose.yml + .env.example
│   └── kyma/             # k8s manifests, KEDA ScaledObjects, API Rules
├── docs/                 # Architecture, features, deployment docs
├── Dockerfile.portal
└── Dockerfile.worker
```

## Status

> Early development. See [`docs/`](docs/) for planning documents.
