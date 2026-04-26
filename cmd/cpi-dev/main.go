package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

func main() {
	port  := envOr("PORT", "8084")
	dbURL := envOr("DB_URL", "postgres://toolkit:toolkit@postgres:5432/toolkit?sslmode=disable")

	ctx := context.Background()

	for attempt := 1; attempt <= 10; attempt++ {
		pool, err := initCPIDevDB(ctx, dbURL)
		if err != nil {
			log.Printf("[cpi-dev] db connect attempt %d/10 failed: %v", attempt, err)
			time.Sleep(time.Duration(attempt) * time.Second)
			continue
		}

		if err := seedScaffoldTemplates(ctx, pool); err != nil {
			log.Printf("[cpi-dev] template seed warning: %v", err)
		}

		mux := http.NewServeMux()

		mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
			fmt.Fprintln(w, "ok")
		})

		// CPI OData proxy (OAuth handled server-side)
		mux.HandleFunc("/cpi-api", makeCPIAPIHandler(pool))

		// Monitoring tiles
		registerMonitoringTileRoutes(mux, pool)

		// iFlow scaffold — generate ZIP download
		mux.HandleFunc("/scaffold/generate", makeScaffoldHandler(pool))

		// iFlow scaffold — preflight check (package/iflow existence)
		mux.HandleFunc("/scaffold/upload-preflight", makeScaffoldPreflightHandler(pool))

		// iFlow scaffold — upload directly to CPI tenant
		mux.HandleFunc("/scaffold/upload", makeScaffoldUploadHandler(pool))

		// XML fragment template management
		registerScaffoldTemplateRoutes(mux, pool)

		addr := ":" + port
		log.Printf("[cpi-dev] listening on %s", addr)
		if err := http.ListenAndServe(addr, mux); err != nil {
			log.Fatalf("[cpi-dev] fatal: %v", err)
		}
		return
	}

	log.Fatal("[cpi-dev] could not connect to database after 10 attempts")
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
