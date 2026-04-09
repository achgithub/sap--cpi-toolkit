# SAP CPI Toolkit

A developer toolkit for SAP Cloud Platform Integration (CPI) built with Go, React (@ui5/webcomponents-react), and PostgreSQL. Designed to run locally via Docker Compose or on SAP BTP Kyma with scale-to-zero cost management.

## Features

| # | Tool | Description |
|---|---|---|
| 1 | XML Formatter | Format and validate XML with syntax highlighting |
| 2 | JSON Formatter | Format and validate JSON |
| 3 | XML ↔ JSON Converter | Roundtrip-safe conversion preserving namespaces |
| 4 | XSD Generator | Infer XSD schema from a sample XML document |
| 5 | EDI Tools | EDIFACT & ANSI X12 — parse, validate, EDI ↔ XML convert, generate |
| 6 | Groovy IDE | Monaco editor with SAP CPI API stubs, script library, and sandboxed execution |
| 7 | Test Data Generator | Upload XML, select fields, generate bulk test data with variations (ZIP download) |
| 8 | PGP Key Generation | Ephemeral keypair generation (POC use only) |
| 9 | SSH Key Generation | Ephemeral RSA / Ed25519 keypair generation |
| 10 | Certificate Generation | Ephemeral self-signed X.509 cert generation (capped validity) |
| 11 | Mock Adapters | Configurable mock endpoints for REST, SOAP, OData, XI, AS2, AS4, EDIFACT, Sender, SFTP |
| 12 | Asset Store | Reusable test payloads — XML, JSON, EDI, CSV, headers, properties, CSRF tokens |

## Architecture

```
Internet / SAP IAS
        │
        ▼
  ┌─────────────┐   always-on, ~128MB
  │   portal    │   React UI + Go server
  │             │   IAS OIDC auth, API proxy
  └──────┬──────┘
         │ internal only
    ┌────┴──────────────┐
    │                   │
    ▼                   ▼
┌────────┐   ┌──────────────┐   scale to zero via KEDA (Kyma)
│ worker │   │groovy-runner │   cold start ~5–15s, auto-sleep after idle
│  (Go)  │   │  (JVM/Groovy)│
└────┬───┘   └──────────────┘
     │
     ▼
┌──────────────────┐
│  adapter-control │   scenario + adapter configuration API
└────────┬─────────┘
         │ polls config on startup
    ┌────┴───────────────────────────────────────────┐
    │         Mock Adapter Services (9 types)        │
    │  rest · soap · odata · xi · as2 · as4          │
    │  edifact · sender · sftp                       │
    └────────────────────────────────────────────────┘
         │
         ▼
    ┌──────────┐
    │PostgreSQL│   adapter scenarios, scripts, templates, assets
    └──────────┘
```

See [`docs/architecture.md`](docs/architecture.md) for full details.

## Services & Ports

| Service | Port | Notes |
|---|---|---|
| portal | 3000 | React UI + OIDC gateway, internet-facing |
| worker | 8081 | Compute features, internal only |
| groovy-runner | 8082 | JVM Groovy execution, internal only |
| adapter-control | 8083 | Mock adapter config API, internal only |
| rest-adapter | 9081 | Mock REST endpoint |
| odata-adapter | 9082 | Mock OData v2/v4 endpoint |
| soap-adapter | 9083 | Mock SOAP/WSDL endpoint |
| xi-adapter | 9084 | Mock SAP XI endpoint |
| as2-adapter | 9085 | Mock AS2 messaging endpoint |
| as4-adapter | 9086 | Mock AS4 messaging endpoint |
| edifact-adapter | 9087 | Mock EDIFACT trading partner endpoint |
| sender-adapter | 9088 | Mock sender channel stub |
| sftp-adapter | 2222 | Embedded SFTP server (SSH protocol) |
| postgres | 5432 | PostgreSQL 16 |

## Deployment

| Target | Method |
|---|---|
| Local / Docker Desktop | `docker compose up` (see [`docs/deployment.md`](docs/deployment.md)) |
| SAP BTP Kyma | Kustomize manifests in [`deployments/k8s/kyma/`](deployments/k8s/kyma/) |

## Quick Start (Local)

```bash
# Copy environment config
cp deployments/local/.env.example deployments/local/.env

# Build and start all services
docker compose -f deployments/local/docker-compose.yml up --build
```

Open http://localhost:3000

Auth is bypassed in local mode (`DEPLOYMENT_ENV=local` + `AUTH_BYPASS_ENABLED=true`). See [`docs/deployment.md`](docs/deployment.md) for configuration.

## Mock Adapters

The toolkit includes nine containerised mock adapters that simulate real SAP CPI sender/receiver channels. Each adapter:

- Fetches its configuration from `adapter-control` on startup
- Supports PATH_PREFIX_MODE — the first URL segment selects the scenario (e.g. `/my-scenario/...`)
- Validates inbound Basic Auth credentials
- Returns configurable responses (status code, body, headers, delay)

Use the **Mock Adapters** page in the UI to create scenarios, configure adapter behaviour, and manage the SFTP server. Assets from the **Asset Store** can be referenced as response payloads.

## Project Structure

```
sap-cpi-toolkit/
├── cmd/
│   ├── portal/           # Go: OIDC auth, static file server, API proxy
│   ├── worker/           # Go: all compute features
│   └── adapter-control/  # Go: adapter scenario + config management API
├── internal/
│   ├── adaptercontrol/   # Scenario CRUD, adapter config, PostgreSQL store
│   ├── auth/             # OIDC middleware + dev bypass guard
│   ├── converter/        # XML ↔ JSON conversion
│   ├── edi/              # EDIFACT & ANSI X12 parsing and generation
│   ├── formatter/        # XML + JSON formatting and validation
│   ├── keygen/           # PGP, SSH, certificate generation
│   ├── testdata/         # Test data generator engine
│   └── xsd/              # XSD inference from sample XML
├── adapters/             # Mock adapter implementations (one dir per type)
│   ├── rest/ · soap/ · odata/ · xi/ · as2/ · as4/
│   ├── edifact/ · sender/ · sftp/
├── web/                  # React + @ui5/webcomponents-react
│   └── src/
│       ├── components/   # Shared UI components
│       ├── hooks/        # useWorker API client hook
│       └── pages/        # One page per tool
├── groovy-runner/        # JVM service — Groovy script execution sandbox
├── deployments/
│   ├── local/            # docker-compose.yml + .env.example
│   └── k8s/              # Kustomize base + local/kyma overlays
├── docs/                 # Architecture, features, deployment docs
├── Dockerfile.portal
├── Dockerfile.worker
└── Dockerfile.adapter-control
```
