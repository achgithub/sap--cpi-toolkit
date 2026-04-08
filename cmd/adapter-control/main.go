package main

import (
	"log"
	"net/http"
	"os"

	"github.com/achgithub/sap-cpi-toolkit/internal/adaptercontrol"
)

func main() {
	port := envOr("PORT", "8083")

	store := adaptercontrol.NewStore()
	handler := adaptercontrol.NewHandler(store)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	// Wrap with CORS so the React dev server can call directly if needed.
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

