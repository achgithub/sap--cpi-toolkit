package auth

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// OIDCProvider handles SAP IAS OIDC authentication.
// Endpoints are discovered at startup; JWKS keys are cached for 5 minutes.
type OIDCProvider struct {
	clientID     string
	clientSecret string
	redirectURL  string

	// Discovered endpoints
	authURL   string
	tokenURL  string
	logoutURL string
	jwksURI   string
	issuer    string

	// JWKS key cache
	mu          sync.RWMutex
	keys        map[string]*rsa.PublicKey
	keysFetched time.Time
}

type discoveryDoc struct {
	Issuer                string `json:"issuer"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	EndSessionEndpoint    string `json:"end_session_endpoint"`
	JwksURI               string `json:"jwks_uri"`
}

// newOIDCProvider creates a provider by fetching the IAS OIDC discovery document.
func newOIDCProvider(tenantURL, clientID, clientSecret, redirectURL string) (*OIDCProvider, error) {
	discURL := strings.TrimRight(tenantURL, "/") + "/.well-known/openid-configuration"
	resp, err := http.Get(discURL)
	if err != nil {
		return nil, fmt.Errorf("OIDC discovery request to %s: %w", discURL, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OIDC discovery returned HTTP %d", resp.StatusCode)
	}

	var doc discoveryDoc
	if err := json.NewDecoder(resp.Body).Decode(&doc); err != nil {
		return nil, fmt.Errorf("OIDC discovery parse: %w", err)
	}

	return &OIDCProvider{
		clientID:     clientID,
		clientSecret: clientSecret,
		redirectURL:  redirectURL,
		authURL:      doc.AuthorizationEndpoint,
		tokenURL:     doc.TokenEndpoint,
		logoutURL:    doc.EndSessionEndpoint,
		jwksURI:      doc.JwksURI,
		issuer:       doc.Issuer,
		keys:         make(map[string]*rsa.PublicKey),
	}, nil
}

// authCodeURL returns the IAS login URL for the authorisation code flow.
func (p *OIDCProvider) authCodeURL(state string) string {
	v := url.Values{
		"response_type": {"code"},
		"client_id":     {p.clientID},
		"redirect_uri":  {p.redirectURL},
		"scope":         {"openid email profile"},
		"state":         {state},
	}
	return p.authURL + "?" + v.Encode()
}

// logoutRedirectURL returns the IAS end-session URL.
func (p *OIDCProvider) logoutRedirectURL(postLogout string) string {
	if p.logoutURL == "" {
		return postLogout
	}
	v := url.Values{"post_logout_redirect_uri": {postLogout}}
	return p.logoutURL + "?" + v.Encode()
}

// exchange trades an authorisation code for an ID token.
func (p *OIDCProvider) exchange(code string) (idToken string, err error) {
	resp, err := http.PostForm(p.tokenURL, url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {p.redirectURL},
		"client_id":     {p.clientID},
		"client_secret": {p.clientSecret},
	})
	if err != nil {
		return "", fmt.Errorf("token exchange HTTP: %w", err)
	}
	defer resp.Body.Close()

	var tok struct {
		IDToken          string `json:"id_token"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", fmt.Errorf("token response parse: %w", err)
	}
	if tok.Error != "" {
		return "", fmt.Errorf("IAS token error %s: %s", tok.Error, tok.ErrorDescription)
	}
	return tok.IDToken, nil
}

// verifyIDToken validates the JWT signature and standard claims, returning user info.
func (p *OIDCProvider) verifyIDToken(raw string) (*UserClaims, error) {
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("malformed JWT: expected 3 parts, got %d", len(parts))
	}

	// Decode header
	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("JWT header decode: %w", err)
	}
	var header struct {
		Kid string `json:"kid"`
		Alg string `json:"alg"`
	}
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, fmt.Errorf("JWT header parse: %w", err)
	}
	if header.Alg != "RS256" {
		return nil, fmt.Errorf("unsupported JWT algorithm %q (expected RS256)", header.Alg)
	}

	// Decode claims
	claimsBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("JWT claims decode: %w", err)
	}
	var claims UserClaims
	if err := json.Unmarshal(claimsBytes, &claims); err != nil {
		return nil, fmt.Errorf("JWT claims parse: %w", err)
	}

	// Validate standard claims
	if time.Now().Unix() > claims.Exp {
		return nil, fmt.Errorf("token expired")
	}
	if claims.Iss != p.issuer {
		return nil, fmt.Errorf("issuer mismatch: got %q, want %q", claims.Iss, p.issuer)
	}
	if !claims.hasAudience(p.clientID) {
		return nil, fmt.Errorf("audience does not include client_id %q", p.clientID)
	}

	// Verify RSA signature
	key, err := p.getPublicKey(header.Kid)
	if err != nil {
		return nil, fmt.Errorf("signing key: %w", err)
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, fmt.Errorf("JWT signature decode: %w", err)
	}
	h := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, h[:], sig); err != nil {
		return nil, fmt.Errorf("signature verification failed: %w", err)
	}

	return &claims, nil
}

// getPublicKey returns the cached RSA public key for kid, refreshing from JWKS if stale.
func (p *OIDCProvider) getPublicKey(kid string) (*rsa.PublicKey, error) {
	p.mu.RLock()
	key, ok := p.keys[kid]
	stale := time.Since(p.keysFetched) > 5*time.Minute
	p.mu.RUnlock()

	if ok && !stale {
		return key, nil
	}

	// Refresh JWKS
	p.mu.Lock()
	defer p.mu.Unlock()

	resp, err := http.Get(p.jwksURI)
	if err != nil {
		return nil, fmt.Errorf("JWKS fetch: %w", err)
	}
	defer resp.Body.Close()

	var jwks struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return nil, fmt.Errorf("JWKS parse: %w", err)
	}

	p.keys = make(map[string]*rsa.PublicKey, len(jwks.Keys))
	for _, k := range jwks.Keys {
		if k.Kty != "RSA" {
			continue
		}
		nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			continue
		}
		eBytes, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			continue
		}
		p.keys[k.Kid] = &rsa.PublicKey{
			N: new(big.Int).SetBytes(nBytes),
			E: int(new(big.Int).SetBytes(eBytes).Int64()),
		}
	}
	p.keysFetched = time.Now()

	key, ok = p.keys[kid]
	if !ok {
		return nil, fmt.Errorf("kid %q not found in JWKS (%d keys loaded)", kid, len(p.keys))
	}
	return key, nil
}

// UserClaims holds the OIDC ID token claims returned by IAS.
type UserClaims struct {
	Sub   string          `json:"sub"`
	Email string          `json:"email"`
	Name  string          `json:"name"`
	Iss   string          `json:"iss"`
	Exp   int64           `json:"exp"`
	Iat   int64           `json:"iat"`
	Aud   json.RawMessage `json:"aud"` // IAS may return string or []string
}

// hasAudience returns true if clientID appears in the aud claim.
func (c *UserClaims) hasAudience(clientID string) bool {
	var single string
	if json.Unmarshal(c.Aud, &single) == nil {
		return single == clientID
	}
	var multi []string
	if json.Unmarshal(c.Aud, &multi) == nil {
		for _, a := range multi {
			if a == clientID {
				return true
			}
		}
	}
	return false
}
