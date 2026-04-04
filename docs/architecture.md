# Architecture

## Design Goals

- **Scale-to-zero** — the toolkit may sit unused for weeks. In its resting state it must be as small as possible to minimise cloud cost on BTP Kyma.
- **Two deployment targets** — identical codebase, different manifests: local Docker Desktop and SAP BTP Kyma.
- **Lightweight portal** — always-on entrypoint that stays tiny; heavy compute only wakes on demand.
- **No unnecessary state** — ephemeral key/cert generation with explicit POC warnings; only templates and settings go to the database.

---

## Pod Design

### Three-Pod Architecture

```
Internet / SAP IAS
        │  (OIDC)
        ▼
  ┌─────────────────────────────────┐
  │           portal                │  ~64MB RAM, always on (or min 1 replica)
  │  React UI (ui5/webcomponents)   │
  │  Go: IAS OIDC, static serving   │
  │  Go: API proxy to worker        │
  └───────────────┬─────────────────┘
                  │ cluster-internal only
           ┌──────┴──────┐
           │             │
           ▼             ▼
   ┌──────────────┐  ┌──────────────────┐
   │    worker    │  │  groovy-runner   │
   │  Go binary   │  │  JVM/Alpine      │
   │  ~128-256MB  │  │  ~256MB active   │
   │  scale → 0   │  │  scale → 0       │
   └──────┬───────┘  └──────────────────┘
          │
          ▼
   ┌──────────────┐
   │  PostgreSQL  │
   │  templates   │
   │  settings    │
   └──────────────┘
```

### Portal Pod
- Always running; kept tiny (static assets + minimal Go HTTP server)
- Handles SAP IAS OIDC authentication flow
- Serves the React SPA
- Proxies `/api/worker/*` to the worker pod (worker is never internet-exposed)
- Proxies `/api/groovy/*` to the groovy-runner pod
- Shows "warming up..." UI state while downstream pods cold-start

### Worker Pod
- All compute features: XML/JSON formatting, conversion, key/cert generation, test data generator
- Pure Go — no JVM, no heavy runtime
- Scales to zero via KEDA HTTP Add-on
- First request after idle triggers scale-up (~5–15s cold start)
- Auto-scales back to 0 after configurable idle timeout (default: 10 minutes)

### Groovy Runner Pod
- Isolated JVM container (Eclipse Temurin Alpine or GraalVM CE)
- Hosts Groovy execution runtime with SAP CPI API mock objects
- Scales to zero independently — only wakes when Groovy IDE is used
- Keeping it separate means the Groovy IDE cold start doesn't affect other tools

### PostgreSQL
- Stores: saved XML templates (test data generator), user settings, Groovy script drafts
- Local: containerised with a PVC
- Kyma/BTP future: SAP HANA Cloud or PostgreSQL on BTP

---

## Scaling Strategy

### KEDA HTTP Add-on (Kyma)

Both `worker` and `groovy-runner` use KEDA's HTTP Add-on for scale-to-zero:

```
User request → portal → KEDA HTTP interceptor → (wake if 0 replicas) → pod
```

- While the pod scales up, KEDA holds the request (with timeout)
- Portal surfaces a loading state to the user during cold start
- Each pod has its own `ScaledObject` with independent idle timeouts

### Local (Docker Compose)
- No KEDA — all containers always running
- Resource limits set in `docker-compose.yml` to simulate Kyma constraints
- Auth bypass enabled (see [Auth Dev Bypass](#auth-dev-bypass))

---

## Authentication

### Production: SAP IAS (OIDC)
- Portal handles the OIDC authorisation code flow with SAP IAS
- On successful login, portal issues a short-lived internal session token
- Worker and groovy-runner only accept requests from portal (internal cluster traffic)
- Worker/groovy-runner never exposed to the internet — no auth needed on those pods

### Auth Dev Bypass
The bypass is **off by default** and requires two explicit conditions:

```
AUTH_BYPASS_ENABLED=true   AND   DEPLOYMENT_ENV=local
```

If `DEPLOYMENT_ENV` is `production` or `kyma`, the bypass is locked out regardless of `AUTH_BYPASS_ENABLED`. Kyma manifests hardcode `DEPLOYMENT_ENV=kyma` so it cannot be accidentally opened.

```go
// Logic in internal/auth/middleware.go
if cfg.BypassEnabled && cfg.Environment == "local" {
    // dev bypass active — log warning
} else {
    // full OIDC enforcement
}
```

This means a developer must actively set `DEPLOYMENT_ENV=local` to enable bypass. Forgetting to set the flag in a cloud deployment keeps auth enforced.

---

## Technology Choices

| Layer | Technology | Rationale |
|---|---|---|
| Backend | Go | Lightweight binaries, fast cold starts, single binary deployment |
| Frontend | React + @ui5/webcomponents-react | SAP Fiori look-and-feel; team familiarity with React |
| Auth | SAP IAS (OIDC) | Required for BTP Kyma; standard OIDC means no vendor lock-in at code level |
| Database | PostgreSQL | Templates and settings only; no Redis needed (no pub/sub, no session cache) |
| Scaling | KEDA HTTP Add-on | Scale-to-zero on HTTP traffic; native Kyma support |
| Groovy runtime | JVM Alpine | CPI uses Groovy; JVM required for accurate execution and CPI API mocking |
| Code editor | Monaco Editor | VSCode engine; excellent language support; Groovy highlighting available |

### Why not Redis?
The only state we store is templates and settings — relational, not cache-shaped. No pub/sub, no distributed sessions. PostgreSQL is sufficient and removes an operational dependency.

---

## Predecessor Project

`formatter-app` (same GitHub org) is a simpler Cloud Foundry deployment of the XML/JSON formatter with XSUAA auth. The following code is worth migrating:

- `handlers/format.go` — XML and JSON formatting logic
- `handlers/convert.go` — XML ↔ JSON conversion with namespace preservation
- `middleware/jwt.go` — JWKS-based JWT validation (adapt for IAS)
