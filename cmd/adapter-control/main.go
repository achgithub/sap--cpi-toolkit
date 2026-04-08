package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/achgithub/sap-cpi-toolkit/internal/adaptercontrol"
)

func main() {
	port  := envOr("PORT", "8083")
	dbURL := envOr("DB_URL", "postgres://toolkit:toolkit@postgres:5432/toolkit?sslmode=disable")

	ctx := context.Background()

	// Connect to Postgres with retries (postgres may still be starting).
	var pool interface{ Close() }
	var store *adaptercontrol.Store
	for attempt := 1; attempt <= 10; attempt++ {
		db, err := adaptercontrol.InitDB(ctx, dbURL)
		if err != nil {
			log.Printf("[adapter-control] db connect attempt %d/10 failed: %v", attempt, err)
			time.Sleep(time.Duration(attempt) * time.Second)
			continue
		}
		store = adaptercontrol.NewStore(db)
		pool = db
		break
	}
	if store == nil {
		log.Fatal("[adapter-control] could not connect to database after 10 attempts")
	}
	defer pool.Close()

	if err := store.InitSFTP(ctx); err != nil {
		log.Printf("[adapter-control] warning: InitSFTP: %v", err)
	}

	handler := adaptercontrol.NewHandler(store)
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	addr := ":" + port
	log.Printf("[adapter-control] listening on %s", addr)
	if err := http.ListenAndServe(addr, corsMiddleware(mux)); err != nil {
		log.Fatalf("[adapter-control] fatal: %v", err)
	}
}

// corsMiddleware allows requests from localhost dev origins and adapter containers.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
