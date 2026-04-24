package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ── Token cache ────────────────────────────────────────────────────────────────

type tokenCache struct {
	mu     sync.Mutex
	tokens map[string]*cachedToken
}

type cachedToken struct {
	token   string
	expires time.Time
}

var globalTokenCache = &tokenCache{tokens: make(map[string]*cachedToken)}

func (tc *tokenCache) get(key string) (string, bool) {
	tc.mu.Lock()
	defer tc.mu.Unlock()
	t, ok := tc.tokens[key]
	if !ok || time.Now().After(t.expires) {
		return "", false
	}
	return t.token, true
}

func (tc *tokenCache) set(key, token string, expiresIn int) {
	tc.mu.Lock()
	defer tc.mu.Unlock()
	if expiresIn <= 60 {
		expiresIn = 3600
	}
	tc.tokens[key] = &cachedToken{
		token:   token,
		expires: time.Now().Add(time.Duration(expiresIn-60) * time.Second),
	}
}

// ── Handler ────────────────────────────────────────────────────────────────────

type cpiAPIRequest struct {
	InstanceID string `json:"instance_id"`
	Path       string `json:"path"`
	Params     string `json:"params"`
}

func makeCPIAPIHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req cpiAPIRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, "invalid body", http.StatusBadRequest)
			return
		}
		if req.InstanceID == "" || req.Path == "" {
			jsonError(w, "instance_id and path are required", http.StatusBadRequest)
			return
		}

		// Load api_key from DB
		var apiKeyRaw []byte
		err := pool.QueryRow(r.Context(),
			`SELECT api_key FROM w_cpi_instances WHERE id = $1`, req.InstanceID,
		).Scan(&apiKeyRaw)
		if err != nil || len(apiKeyRaw) == 0 {
			jsonError(w, "instance not found or has no api_key", http.StatusNotFound)
			return
		}

		var apiKey struct {
			OAuth struct {
				ClientID     string `json:"clientid"`
				ClientSecret string `json:"clientsecret"`
				TokenURL     string `json:"tokenurl"`
				URL          string `json:"url"`
			} `json:"oauth"`
		}
		if err := json.Unmarshal(apiKeyRaw, &apiKey); err != nil || apiKey.OAuth.URL == "" {
			jsonError(w, "invalid api_key — ensure it has oauth.url, oauth.clientid, oauth.clientsecret, oauth.tokenurl", http.StatusBadRequest)
			return
		}

		token, err := getOAuthToken(r.Context(), req.InstanceID, apiKey.OAuth.TokenURL, apiKey.OAuth.ClientID, apiKey.OAuth.ClientSecret)
		if err != nil {
			jsonError(w, "OAuth token error: "+err.Error(), http.StatusBadGateway)
			return
		}

		apiBase := strings.TrimRight(apiKey.OAuth.URL, "/")
		targetURL := apiBase + "/api/v1" + req.Path
		if req.Params != "" {
			targetURL += "?" + req.Params
		}

		apiReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, targetURL, nil)
		if err != nil {
			jsonError(w, "invalid url: "+err.Error(), http.StatusBadRequest)
			return
		}
		apiReq.Header.Set("Authorization", "Bearer "+token)
		apiReq.Header.Set("Accept", "application/json")

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(apiReq)
		if err != nil {
			jsonError(w, "CPI API error: "+err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		w.Write(body) //nolint:errcheck
	}
}

// ── OAuth helper ───────────────────────────────────────────────────────────────

func getOAuthToken(ctx context.Context, cacheKey, tokenURL, clientID, clientSecret string) (string, error) {
	if tok, ok := globalTokenCache.get(cacheKey); ok {
		return tok, nil
	}

	form := url.Values{}
	form.Set("grant_type", "client_credentials")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(clientID, clientSecret)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return "", fmt.Errorf("unexpected token response: %s", string(body))
	}

	globalTokenCache.set(cacheKey, tokenResp.AccessToken, tokenResp.ExpiresIn)
	return tokenResp.AccessToken, nil
}
