# Features

## 1. XML Formatter

Format and pretty-print XML with configurable indentation. Validate against schema (optional). Syntax highlighting in the editor.

**Input:** Raw or minified XML
**Output:** Formatted XML
**Validation:** Well-formedness check; XSD validation if schema provided

---

## 2. JSON Formatter

Format and pretty-print JSON with configurable indentation. Validate structure.

**Input:** Raw or minified JSON
**Output:** Formatted JSON
**Validation:** Syntax validation with line/column error reporting

---

## 3. XML ↔ JSON Converter

Roundtrip-safe conversion between XML and JSON preserving:
- Element names and text content
- Namespace URI and prefix declarations (`xmlns:*`)
- All attributes (with namespace)
- Child element ordering

**Lossy cases** (surfaced as warnings in UI):
- XML comments (dropped)
- Mixed content (text + child elements interleaved)
- Processing instructions

---

## 4. PGP Key Generation

Generate PGP keypairs for CPI PGP encrypt/decrypt adapters.

**Output:** Public key + private key (armored)
**Download:** Both keys as separate `.asc` files
**Validity:** Capped at a short maximum (TBD — e.g. 1 year)
**Warning:** Prominent POC warning — keys are ephemeral, not stored, for testing only
**Storage:** None — keys exist only in the browser response

---

## 5. SSH Key Generation

Generate SSH keypairs (RSA / Ed25519).

**Output:** Public key + private key
**Download:** `id_rsa` / `id_rsa.pub` (or ed25519 equivalent)
**Warning:** Ephemeral, POC use only
**Storage:** None

---

## 6. Certificate Generation

Generate self-signed X.509 certificates for CPI SSL/TLS configuration testing.

**Output:** Certificate (PEM) + private key (PEM)
**Download:** `.crt` and `.key` files
**Validity:** Capped at a short maximum (e.g. 90 days) — no long-lived certs
**Warning:** Self-signed, ephemeral, POC use only
**Storage:** None

---

## 7. Test Data Generator

The most complex tool. Lets CPI developers take a real message XML structure and generate multiple copies with controlled data variation for load/functional testing.

### Workflow

1. **Upload XML** — paste or upload a sample XML message
2. **Analyse** — the tool parses the XML and presents a tree of all fields
3. **Select fields** — tick which fields to vary (others remain static)
4. **Configure each selected field:**
   - Field type (auto-detected): string, number, date, datetime, boolean, enum
   - Generation mode:
     - **Random** — generate random values within type constraints
     - **CSV upload** — upload a CSV column of values to cycle through
     - **Manual** — enter a fixed value or pattern
   - For date/datetime: choose format (ISO 8601, SAP timestamp, custom pattern), optional offset from "now"
5. **Set output quantity** — how many XML documents to generate
6. **Generate** — download as a ZIP of individual XML files or a single file with multiple root elements wrapped

### Storage
- Uploaded XML templates saved to PostgreSQL for reuse (named, versioned)
- Generated output is ephemeral — downloaded, not stored

---

## 8. Groovy IDE

A browser-based IDE for writing and testing SAP CPI Groovy scripts, without needing a CPI tenant.

### Editor
- Monaco Editor (VSCode engine) with Groovy syntax highlighting
- SAP CPI-specific autocomplete:
  - `message` object API (`getBody()`, `setBody()`, `getHeaders()`, etc.)
  - `MsgLogHelper`
  - Common CPI script patterns as snippets
- Standard CPI script templates (splitter, error handling, mapping helper, etc.)

### Execution (Groovy Runner Pod)
- Scripts run in a sandboxed JVM environment
- CPI API mock objects injected (configurable test input message)
- Output: console log, modified message body/headers, execution errors
- Sandbox restrictions: no file system access, no network calls, time-limited execution

### Storage
- Script drafts saved to PostgreSQL (named, with description)
- Scripts are user-scoped (tied to IAS user identity)

### Future
- Connect to a real CPI tenant to deploy/test scripts directly (requires CPI API integration)

---

## Portal / Shell

The surrounding application shell is a lightweight SAP Fiori-style portal:

- Top navigation bar with tool tabs
- Settings page (user preferences, saved templates)
- "Warming up..." overlay when worker/groovy pods are cold-starting
- Clear section for ephemeral tool warnings (keys, certs)
- Responsive layout (desktop-first — developer tool, not mobile)
