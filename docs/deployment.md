# Deployment

Two deployment targets share a single codebase. Configuration differences are isolated to environment variables and deployment manifests.

---

## Local — Docker Desktop

### Prerequisites
- Docker Desktop
- `docker compose` v2

### Start

```bash
cp deployments/local/.env.example deployments/local/.env
# Edit .env if needed (defaults work out of the box)

docker compose -f deployments/local/docker-compose.yml up
```

Open http://localhost:3000

### Services (local)

| Service | Port | Notes |
|---|---|---|
| portal | 3000 | React UI + auth proxy |
| worker | 8081 | Compute API (internal, proxied via portal) |
| groovy-runner | 8082 | Groovy execution (internal, proxied via portal) |
| postgres | 5432 | PostgreSQL |

### Auth in Local Mode

Auth is bypassed when `AUTH_BYPASS_ENABLED=true` AND `DEPLOYMENT_ENV=local` (both are set in `.env.example`). All requests are passed through without token validation.

To test IAS auth locally, set `AUTH_BYPASS_ENABLED=false` and provide real IAS credentials in `.env`.

### Resource Limits (local)

`docker-compose.yml` sets memory limits to approximate Kyma pod constraints:

| Service | Memory limit |
|---|---|
| portal | 128MB |
| worker | 256MB |
| groovy-runner | 512MB |
| postgres | 256MB |

---

## SAP BTP Kyma

### Prerequisites
- Kyma cluster with KEDA installed (Kyma includes KEDA by default)
- KEDA HTTP Add-on installed
- `kubectl` configured for your Kyma cluster
- SAP IAS tenant with application registration for this toolkit
- PostgreSQL service (containerised PVC for now; BTP PostgreSQL service in future)

### Namespace

```bash
kubectl create namespace sap-cpi-toolkit
```

### Secrets

```bash
kubectl create secret generic toolkit-secrets \
  --namespace sap-cpi-toolkit \
  --from-literal=IAS_CLIENT_ID=<your-client-id> \
  --from-literal=IAS_CLIENT_SECRET=<your-client-secret> \
  --from-literal=IAS_TENANT_URL=https://<tenant>.accounts.ondemand.com \
  --from-literal=DB_URL=postgres://toolkit:password@postgres:5432/toolkit
```

### Deploy

```bash
kubectl apply -f deployments/kyma/ --namespace sap-cpi-toolkit
```

### Kyma Manifests

| File | Purpose |
|---|---|
| `portal-deployment.yaml` | Portal pod (min 1 replica, always on) |
| `worker-scaledobject.yaml` | KEDA ScaledObject — scales worker 0↔N on HTTP |
| `groovy-scaledobject.yaml` | KEDA ScaledObject — scales groovy-runner 0↔N on HTTP |
| `postgres-statefulset.yaml` | PostgreSQL with PVC |
| `api-rule.yaml` | Kyma API Rule — exposes portal via Istio ingress |
| `configmap.yaml` | Non-secret configuration |

### Scale-to-Zero Behaviour

```
User hits portal → portal checks worker health
                 → if worker at 0 replicas:
                   → KEDA intercepts first API call
                   → scales worker to 1 replica (~5-15s)
                   → portal shows "warming up..." overlay
                   → request completes once pod is ready
                 → if worker already running: immediate response

Worker idles for 10 minutes → KEDA scales back to 0
```

Groovy runner follows the same pattern independently.

### Environment Variables (Kyma)

| Variable | Value in Kyma | Purpose |
|---|---|---|
| `DEPLOYMENT_ENV` | `kyma` | **Locks out auth bypass** |
| `AUTH_BYPASS_ENABLED` | `false` | Redundant safety — bypass locked by DEPLOYMENT_ENV |
| `IAS_CLIENT_ID` | from secret | SAP IAS app client ID |
| `IAS_CLIENT_SECRET` | from secret | SAP IAS app client secret |
| `IAS_TENANT_URL` | from secret | SAP IAS tenant URL |
| `DB_URL` | from secret | PostgreSQL connection string |
| `WORKER_INTERNAL_URL` | `http://worker:8081` | Internal service URL |
| `GROOVY_INTERNAL_URL` | `http://groovy-runner:8082` | Internal service URL |

---

## Configuration Reference

Full environment variable reference across both deployment targets:

| Variable | Local default | Kyma | Description |
|---|---|---|---|
| `DEPLOYMENT_ENV` | `local` | `kyma` | Controls auth bypass eligibility |
| `AUTH_BYPASS_ENABLED` | `true` | `false` | Enable dev auth bypass (only works when DEPLOYMENT_ENV=local) |
| `PORT` | `3000` | `3000` | Portal HTTP port |
| `IAS_CLIENT_ID` | (empty) | required | SAP IAS client ID |
| `IAS_CLIENT_SECRET` | (empty) | required | SAP IAS client secret |
| `IAS_TENANT_URL` | (empty) | required | SAP IAS tenant base URL |
| `DB_URL` | `postgres://...@postgres:5432/toolkit` | from secret | PostgreSQL DSN |
| `WORKER_INTERNAL_URL` | `http://worker:8081` | `http://worker:8081` | Worker service address |
| `GROOVY_INTERNAL_URL` | `http://groovy-runner:8082` | `http://groovy-runner:8082` | Groovy runner address |
| `KEY_VALIDITY_MAX_DAYS` | `365` | `365` | Cap on PGP/cert validity (days) |
| `CERT_VALIDITY_MAX_DAYS` | `90` | `90` | Cap on self-signed cert validity (days) |
