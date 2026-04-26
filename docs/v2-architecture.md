# CPI Toolkit V2 — Architecture

> Outcome of architecture discussion, April 2026.
> V1 remains active for POC work. V2 is a clean rebuild on the foundations defined here.

---

## Vision

V1 is tool-centric — tabs map to tools. V2 is **journey-centric** — the organizing principle is the developer workflow. Every artifact created in one phase is automatically available in the next. No retyping, no copy-paste, one click.

**Developer journey example:**
Define XSDs → build map and/or script → scaffold iFlow referencing those artifacts → generate test data → fire via HTTP client → iterate → ramp up to volume testing → schedule automated runs.

---

## Project Model

```
Project  (e.g. "S4 Implementation")
├── Instances: N named CPI tenants, each tagged DEV | QA | PRD | SBX | TRL
└── Sub-projects  (e.g. "Orders", "Shared Scripts")
    ├── 1:1 with a CPI package
    ├── Type: interface | library
    │     interface — full journey: XSD → map → script → iFlow → test
    │     library   — reusable artifacts only, no iFlow, no CPI package deployment
    └── Artifacts owned here, referenceable across all sub-projects in the same project
```

**Artifact types:**
- XSD definitions (source + target)
- XSLT maps
- Groovy scripts
- iFlow scaffold definitions
- Test data profiles
- Test run history
- Documentation / tech spec

**Cross-referencing:** Artifacts are owned by a sub-project but visible and selectable from any other sub-project within the same project. One click — no retyping.

**CPI instance scoping:** Instances are attached to a project, not global. The scaffold, HTTP client, and test runner all inherit the project's instance set. No mid-workflow instance selection required.

---

## Roles & Security

Roles are **per-project**, integrated with IAS.

| Role | Access |
|---|---|
| Admin | Project setup, instance management, user assignment |
| Developer | Full Design / Develop / Test within assigned projects |
| Tester | Test phase only |
| Viewer | Read-only across all phases |

SAP UI5 / Fiori design guidelines enforced throughout. No custom component frameworks.

---

## Navigation Structure

### Phase tabs (top level)

```
Design  |  Develop  |  Test
```

| Phase | Contents |
|---|---|
| **Design** | Project + sub-project setup, XSD definitions, interface diagram, tech spec generation |
| **Develop** | XSLT map editor (XSD-aware), Groovy IDE, iFlow scaffold (references project artifacts), keys & certs |
| **Test** | Test data generator (XSD-aware), HTTP client, volume runner, HTTP mock server, monitoring |

### Toolbox (side panel — always accessible)

Click to open as overlay/slide-in. Close returns you exactly where you were.

| Tool | Image |
|---|---|
| Groovy IDE + runner | `groovy-runner` |
| Formatter (XML / JSON) | `api` |
| SFTP server | `sftp-adapter` |
| HTTP client | `http-tools` |
| HTTP mock server | `http-tools` |
| EDI tools | `api` |
| Key / cert generator | `api` |
| Auth header generator | `api` |

**Module pattern:** Tools are built once and surfaced in multiple contexts.

```
HTTP Client
├── Toolbox     → scratchpad, no project context
├── Test phase  → project-aware, saved configs, linked to instances
└── Volume runner → automated, scheduled, N requests at a time

HTTP Mock Server
├── Toolbox     → spin up, intercept, inspect
├── Test phase  → receive iFlow outbound calls, assert responses
└── Volume runner → absorb load, report pass/fail counts
```

---

## Service / Image Map

| Image | Responsibility |
|---|---|
| `portal` | React UI shell, IAS auth, API proxy |
| `api` | Core Go backend — project/artifact management, formatter, key gen, scheduler, EDI |
| `groovy-runner` | JVM — Groovy execution, scales to zero |
| `sftp-adapter` | SFTP server simulator |
| `http-tools` | HTTP client + mock server (two modes, one image) |
| `postgres` | All persistent state |

**Principles:**
- One codebase, multiple deployment targets (Docker Compose for dev, Kubernetes for QA/Prod)
- Worker pod never internet-exposed — portal proxies all internal API calls
- Auth bypass only when `DEPLOYMENT_ENV=local` AND `AUTH_BYPASS_ENABLED=true`
- `DEPLOYMENT_ENV=kyma` locks out bypass permanently

---

## Build Order

### 0. POC: Interface Diagramming
Before committing to the Design phase build, validate tooling choice within SAP UI5 constraints. Simple block diagram (sender → integration process → receiver), exportable, feeds into tech spec generation.

### 1. Foundation
- Portal: shell, IAS auth with bypass, nav structure (Design / Develop / Test + Toolbox)
- Roles & security framework (per-project, IAS-integrated)
- Data model: project, sub-project, instance, artifact (all types)
- API: CRUD for all above

### 2. Migrate V1
Bring all existing V1 tools across, wired to project context:
- Formatter
- Key / cert generator
- Auth header generator
- Groovy IDE
- iFlow scaffold (enhanced — references project XSDs, maps, scripts)
- HTTP client
- Monitoring (build on existing)
- SFTP adapter

### 3. New Core
- XSD management (upload, validate, associate to sub-project)
- XSLT map editor (XSD-aware, references project XSDs)
- Test data generator (XSD-aware, references project XSDs)

### 4. Volume Testing
- Volume runner (SFTP file drop mode + HTTP burst mode)
- Scheduler (N files every X seconds/minutes, or burst N at a time)

### 5. POC: Tech Spec Generation
Template design needs user feedback before full build. POC in V1 or isolated spike.

### 6. HTTP Mock Server
Build after volume runner has real iFlow traffic to absorb. Mock server closes the loop — control both ends of a volume test without a real backend.

### 7. Interface Diagram (full build)
Based on POC findings. Simple block picture through to exportable tech spec.

---

## Roadmap (design for, don't build in V2 core)

| Item | Notes |
|---|---|
| **Tenant comparison** | Read-only diff of artifact state across project instances. Instance model already supports it — N instances per project, tagged by type. |
| **Copy iFlow / packages between tenants** | Restricted to non-QAS/PRD systems. MCP + CLI + GitHub integration already exists from V1 work — integrate rather than rebuild. |
| **GitHub source control** | Optional sync. Postgres is source of truth. GitHub is an export/backup option, not mandatory. |
| **EDI tools** | EDIFACT + ANSI X12 — parser, EDI↔XML converter, generator. Additive utility tool, no separate image needed. |

---

## V1 POC Candidates

Features to validate in V1 before full V2 build:

| Feature | Why |
|---|---|
| Interface diagramming | Tooling choice — must be SAP UI5 compatible. React Flow or similar needs evaluation. |
| Tech spec generation | Template design needs real user feedback before investing in full build. |
| Volume runner / scheduler | Scheduling behaviour under load needs validation before designing the V2 scheduler image. |

**Not POC needed:**
- Copy iFlow between tenants — done (MCP + CLI)
- HTTP mock server — defer until volume runner produces real traffic

---

## Key Constraints (carried from V1)

- Scaffold and copy operations restricted to TRL / SBX / DEV system types only
- Ephemeral key/cert generation — never stored, download only
- No Redis — PostgreSQL handles all state
- Go module path: `github.com/achgithub/sap-cpi-toolkit`
- All compilation inside Docker multi-stage builds — Go and npm not required on host
