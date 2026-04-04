package auth

import (
	"log"
	"net/http"
	"strings"
)

// Config holds authentication configuration.
// Bypass requires BOTH BypassEnabled=true AND Environment="local".
// Setting Environment to "kyma" or "production" locks out bypass entirely.
type Config struct {
	BypassEnabled bool
	Environment   string // "local" | "kyma" | "production"

	// IAS OIDC — required when bypass is inactive
	ClientID     string
	ClientSecret string
	TenantURL    string // e.g. https://mytenant.accounts.ondemand.com
}

// Middleware enforces authentication on HTTP handlers.
type Middleware struct {
	cfg    Config
	bypass bool // true only when environment=local AND bypass is explicitly enabled
}

// New creates an auth middleware from cfg.
// Logs a clear warning if bypass is requested but blocked by environment.
func New(cfg Config) *Middleware {
	env := strings.ToLower(strings.TrimSpace(cfg.Environment))
	bypass := false

	switch env {
	case "production", "kyma":
		if cfg.BypassEnabled {
			log.Printf("[AUTH] SECURITY: AUTH_BYPASS_ENABLED=true is ignored — DEPLOYMENT_ENV=%s locks out bypass", cfg.Environment)
		}
		log.Printf("[AUTH] Enforcement active (DEPLOYMENT_ENV=%s)", cfg.Environment)
	case "local":
		if cfg.BypassEnabled {
			log.Printf("[AUTH] WARNING: auth bypass active — DEPLOYMENT_ENV=local, for development only")
			bypass = true
		} else {
			log.Printf("[AUTH] Enforcement active (DEPLOYMENT_ENV=local, bypass disabled)")
		}
	default:
		log.Printf("[AUTH] WARNING: unrecognised DEPLOYMENT_ENV=%q — treating as production, bypass disabled", cfg.Environment)
	}

	return &Middleware{cfg: cfg, bypass: bypass}
}

// Handler returns an HTTP middleware that enforces authentication.
// In bypass mode it injects dev identity headers and passes through.
// In enforcement mode it validates the IAS OIDC token (TODO).
func (m *Middleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if m.bypass {
			r.Header.Set("X-User-ID", "dev-user")
			r.Header.Set("X-User-Email", "dev@local")
			next.ServeHTTP(w, r)
			return
		}

		// TODO: Implement SAP IAS OIDC token validation.
		// Steps:
		// 1. Extract Bearer token from Authorization header
		// 2. Fetch JWKS from m.cfg.TenantURL + "/.well-known/jwks.json"
		// 3. Validate signature, expiry, audience (m.cfg.ClientID)
		// 4. Extract user identity claims and set X-User-* headers
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	})
}

// IsActive returns true if the bypass is active (dev mode only).
func (m *Middleware) IsActive() bool {
	return m.bypass
}
