package main

import (
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"github.com/achgithub/sap-cpi-toolkit/internal/auth"
)

func main() {
	port := envOr("PORT", "3000")
	deploymentEnv := envOr("DEPLOYMENT_ENV", "local")
	workerURL := envOr("WORKER_INTERNAL_URL", "http://localhost:8081")
	groovyURL := envOr("GROOVY_INTERNAL_URL", "http://localhost:8082")

	authMiddleware := auth.New(auth.Config{
		BypassEnabled: envOr("AUTH_BYPASS_ENABLED", "false") == "true",
		Environment:   deploymentEnv,
		ClientID:      os.Getenv("IAS_CLIENT_ID"),
		ClientSecret:  os.Getenv("IAS_CLIENT_SECRET"),
		TenantURL:     os.Getenv("IAS_TENANT_URL"),
	})

	workerProxy := mustProxy(workerURL, "/api/worker")
	groovyProxy := mustProxy(groovyURL, "/api/groovy")

	mux := http.NewServeMux()

	// Health — unauthenticated (required for Kyma liveness probes)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "ok")
	})

	// API routes — authenticated, proxied to downstream pods
	mux.Handle("/api/worker/", authMiddleware.Handler(workerProxy))
	mux.Handle("/api/groovy/", authMiddleware.Handler(groovyProxy))

	// React SPA — served from ./static (dev) or embedded (production build)
	// The Dockerfile copies web/dist/ to cmd/portal/static/ before compiling.
	// In local dev, run the Vite dev server separately on :5173.
	mux.Handle("/", spaHandler(http.FileServer(http.Dir("./static"))))

	addr := ":" + port
	log.Printf("[portal] listening on %s (env=%s, auth-bypass=%v)", addr, deploymentEnv, authMiddleware.IsActive())
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("[portal] fatal: %v", err)
	}
}

// mustProxy creates a reverse proxy that strips the given prefix before forwarding.
func mustProxy(target, stripPrefix string) http.Handler {
	u, err := url.Parse(target)
	if err != nil {
		log.Fatalf("[portal] invalid proxy target %q: %v", target, err)
	}
	proxy := httputil.NewSingleHostReverseProxy(u)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.URL.Path = strings.TrimPrefix(r.URL.Path, stripPrefix)
		if r.URL.Path == "" {
			r.URL.Path = "/"
		}
		proxy.ServeHTTP(w, r)
	})
}

// spaHandler falls back to index.html for unknown paths (client-side routing).
func spaHandler(fs http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try to serve the file; if it doesn't exist serve index.html
		if r.URL.Path != "/" && !strings.Contains(r.URL.Path, ".") {
			http.ServeFile(w, r, "./static/index.html")
			return
		}
		fs.ServeHTTP(w, r)
	})
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
