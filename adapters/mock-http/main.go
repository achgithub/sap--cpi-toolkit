package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// config mirrors the fields returned by adapter-control's /adapter-config/{id} endpoint.
type config struct {
	BehaviorMode    string            `json:"behavior_mode"`
	StatusCode      int               `json:"status_code"`
	ResponseBody    string            `json:"response_body"`
	ResponseHeaders map[string]string `json:"response_headers"`
	ResponseDelayMs int               `json:"response_delay_ms"`
	SoapVersion     string            `json:"soap_version"`
	Credentials     *credentials      `json:"credentials"`
}

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func main() {
	port            := envOr("PORT", "8080")
	controlPlaneURL := envOr("CONTROL_PLANE_URL", "http://adapter-control:8083")

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "ok")
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		handle(w, r, controlPlaneURL)
	})

	addr := ":" + port
	log.Printf("[mock-http] listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("[mock-http] fatal: %v", err)
	}
}

func handle(w http.ResponseWriter, r *http.Request, controlPlaneURL string) {
	// CORS — this is a dev tool; callers include the browser-based test tool.
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, SOAPAction, Accept")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Extract adapter ID from the first path segment.
	// e.g. /my-mock/some/path → adapterID = "my-mock"
	path := strings.TrimPrefix(r.URL.Path, "/")
	adapterID := strings.SplitN(path, "/", 2)[0]
	if adapterID == "" || adapterID == "health" {
		http.NotFound(w, r)
		return
	}

	cfg, err := fetchConfig(adapterID, controlPlaneURL)
	if err != nil {
		log.Printf("[mock-http] config fetch failed for %s: %v", adapterID, err)
		http.Error(w, "adapter not found", http.StatusNotFound)
		return
	}

	// Report activity asynchronously.
	go reportActivity(adapterID, controlPlaneURL)

	// Basic auth check if credentials are configured.
	if cfg.Credentials != nil && cfg.Credentials.Username != "" {
		user, pass, ok := r.BasicAuth()
		if !ok || user != cfg.Credentials.Username || pass != cfg.Credentials.Password {
			w.Header().Set("WWW-Authenticate", `Basic realm="mock-http"`)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
	}

	// Apply delay.
	if cfg.ResponseDelayMs > 0 {
		time.Sleep(time.Duration(cfg.ResponseDelayMs) * time.Millisecond)
	}

	// Failure mode.
	if cfg.BehaviorMode == "failure" {
		http.Error(w, "service unavailable (failure mode)", http.StatusServiceUnavailable)
		return
	}

	// Apply configured response headers.
	for k, v := range cfg.ResponseHeaders {
		w.Header().Set(k, v)
	}

	body := cfg.ResponseBody

	// Wrap in SOAP envelope if soap_version is set.
	if cfg.SoapVersion != "" {
		body = wrapSOAP(body, cfg.SoapVersion)
		if w.Header().Get("Content-Type") == "" {
			w.Header().Set("Content-Type", "text/xml; charset=utf-8")
		}
	} else if w.Header().Get("Content-Type") == "" {
		w.Header().Set("Content-Type", "application/json")
	}

	statusCode := cfg.StatusCode
	if statusCode == 0 {
		statusCode = http.StatusOK
	}

	w.WriteHeader(statusCode)
	fmt.Fprint(w, body)

	log.Printf("[mock-http] %s %s → %d (adapter: %s)", r.Method, r.URL.Path, statusCode, adapterID)
}

func wrapSOAP(body, version string) string {
	ns := "http://schemas.xmlsoap.org/soap/envelope/"
	if version == "1.2" {
		ns = "http://www.w3.org/2003/05/soap-envelope"
	}
	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="%s">
  <soapenv:Header/>
  <soapenv:Body>
%s
  </soapenv:Body>
</soapenv:Envelope>`, ns, body)
}

func fetchConfig(adapterID, controlPlaneURL string) (*config, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(fmt.Sprintf("%s/adapter-config/%s", controlPlaneURL, adapterID))
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("status %d: %s", resp.StatusCode, b)
	}
	var cfg config
	if err := json.NewDecoder(resp.Body).Decode(&cfg); err != nil {
		return nil, fmt.Errorf("decode failed: %w", err)
	}
	return &cfg, nil
}

func reportActivity(adapterID, controlPlaneURL string) {
	c := &http.Client{Timeout: 2 * time.Second}
	c.Post(fmt.Sprintf("%s/adapter-activity/%s", controlPlaneURL, adapterID), "application/json", nil) //nolint:errcheck
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
