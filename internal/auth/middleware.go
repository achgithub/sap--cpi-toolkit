package auth

import (
	"log"
	"net/http"
	"strings"
	"time"
)

// Config holds all authentication configuration.
// Bypass requires BOTH BypassEnabled=true AND Environment="local".
// Setting Environment to "kyma" or "production" locks bypass out permanently.
type Config struct {
	BypassEnabled bool
	Environment   string // "local" | "kyma" | "production"
	BaseURL       string // e.g. "http://localhost:3000" or "https://toolkit.example.com"

	// IAS OIDC — required when bypass is inactive
	ClientID     string
	ClientSecret string
	TenantURL    string // e.g. https://mytenant.accounts.ondemand.com
}

// Middleware enforces authentication on HTTP handlers.
type Middleware struct {
	cfg      Config
	bypass   bool
	provider *OIDCProvider
	sessions *SessionStore
}

// New creates an auth middleware from cfg.
// If IAS credentials are provided and bypass is inactive, connects to IAS on startup.
func New(cfg Config) *Middleware {
	env := strings.ToLower(strings.TrimSpace(cfg.Environment))
	bypass := false

	switch env {
	case "production", "kyma":
		if cfg.BypassEnabled {
			log.Printf("[AUTH] SECURITY: AUTH_BYPASS_ENABLED=true ignored — DEPLOYMENT_ENV=%s locks out bypass", cfg.Environment)
		}
		log.Printf("[AUTH] Enforcement active (DEPLOYMENT_ENV=%s)", cfg.Environment)
	case "local":
		if cfg.BypassEnabled {
			log.Printf("[AUTH] WARNING: auth bypass active — DEPLOYMENT_ENV=local, development only")
			bypass = true
		} else {
			log.Printf("[AUTH] Enforcement active (DEPLOYMENT_ENV=local, bypass disabled)")
		}
	default:
		log.Printf("[AUTH] WARNING: unrecognised DEPLOYMENT_ENV=%q — treating as production, bypass disabled", cfg.Environment)
	}

	m := &Middleware{
		cfg:      cfg,
		bypass:   bypass,
		sessions: newSessionStore(),
	}

	if !bypass {
		if cfg.TenantURL == "" || cfg.ClientID == "" {
			log.Printf("[AUTH] WARNING: IAS_TENANT_URL or IAS_CLIENT_ID not set — all requests will be rejected")
		} else {
			redirectURL := strings.TrimRight(cfg.BaseURL, "/") + "/auth/callback"
			provider, err := newOIDCProvider(cfg.TenantURL, cfg.ClientID, cfg.ClientSecret, redirectURL)
			if err != nil {
				log.Printf("[AUTH] WARNING: IAS OIDC init failed: %v — requests will be rejected", err)
			} else {
				m.provider = provider
				log.Printf("[AUTH] IAS OIDC ready (issuer=%s)", provider.issuer)
			}
		}
	}

	return m
}

// Handler wraps an HTTP handler with session-based authentication.
// - Bypass mode: injects dev identity headers, no session required.
// - API requests without a valid session get HTTP 401.
// - Page requests without a valid session are redirected to /auth/login.
func (m *Middleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if m.bypass {
			r.Header.Set("X-User-ID", "dev-user")
			r.Header.Set("X-User-Email", "dev@local")
			next.ServeHTTP(w, r)
			return
		}

		sess, ok := m.sessionFromRequest(r)
		if !ok {
			if strings.HasPrefix(r.URL.Path, "/api/") {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			http.Redirect(w, r, "/auth/login", http.StatusFound)
			return
		}

		r.Header.Set("X-User-ID", sess.UserID)
		r.Header.Set("X-User-Email", sess.UserEmail)
		next.ServeHTTP(w, r)
	})
}

// LoginHandler redirects the user to SAP IAS for authentication.
func (m *Middleware) LoginHandler(w http.ResponseWriter, r *http.Request) {
	if m.bypass {
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}
	if m.provider == nil {
		http.Error(w, "Authentication not configured", http.StatusServiceUnavailable)
		return
	}

	state := randomHex(16)
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_state",
		Value:    state,
		Path:     "/auth",
		HttpOnly: true,
		Secure:   m.cfg.Environment != "local",
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(10 * time.Minute),
	})
	http.Redirect(w, r, m.provider.authCodeURL(state), http.StatusFound)
}

// CallbackHandler handles the redirect from IAS after successful login.
func (m *Middleware) CallbackHandler(w http.ResponseWriter, r *http.Request) {
	if m.provider == nil {
		http.Error(w, "Authentication not configured", http.StatusServiceUnavailable)
		return
	}

	// CSRF: verify state matches what we sent
	stateCookie, err := r.Cookie("auth_state")
	if err != nil || stateCookie.Value != r.URL.Query().Get("state") {
		http.Error(w, "Invalid state parameter", http.StatusBadRequest)
		return
	}
	// Clear the one-time state cookie
	http.SetCookie(w, &http.Cookie{Name: "auth_state", MaxAge: -1, Path: "/auth"})

	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "Missing authorisation code", http.StatusBadRequest)
		return
	}

	idToken, err := m.provider.exchange(code)
	if err != nil {
		log.Printf("[AUTH] Token exchange failed: %v", err)
		http.Error(w, "Authentication failed", http.StatusUnauthorized)
		return
	}

	claims, err := m.provider.verifyIDToken(idToken)
	if err != nil {
		log.Printf("[AUTH] Token verification failed: %v", err)
		http.Error(w, "Token invalid", http.StatusUnauthorized)
		return
	}

	sess := m.sessions.Create(claims.Sub, claims.Email, claims.Name)
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sess.ID,
		Path:     "/",
		HttpOnly: true,
		Secure:   m.cfg.Environment != "local",
		SameSite: http.SameSiteLaxMode,
		Expires:  sess.ExpiresAt,
	})

	log.Printf("[AUTH] Login: %s (%s)", claims.Email, claims.Sub)
	http.Redirect(w, r, "/", http.StatusFound)
}

// LogoutHandler clears the session and redirects to IAS end-session endpoint.
func (m *Middleware) LogoutHandler(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		m.sessions.Delete(cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookieName, MaxAge: -1, Path: "/"})

	if m.provider != nil {
		baseURL := strings.TrimRight(m.cfg.BaseURL, "/")
		http.Redirect(w, r, m.provider.logoutRedirectURL(baseURL+"/"), http.StatusFound)
		return
	}
	http.Redirect(w, r, "/", http.StatusFound)
}

// IsActive returns true if the dev bypass is active.
func (m *Middleware) IsActive() bool { return m.bypass }

func (m *Middleware) sessionFromRequest(r *http.Request) (*Session, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return nil, false
	}
	return m.sessions.Get(cookie.Value)
}
