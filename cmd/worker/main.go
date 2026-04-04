package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

func main() {
	port := envOr("PORT", "8081")

	mux := http.NewServeMux()

	// Health — unauthenticated (KEDA and Kyma probes)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "ok")
	})

	// --- Formatter ---
	mux.HandleFunc("/format/xml", notImplemented("XML formatter"))
	mux.HandleFunc("/format/json", notImplemented("JSON formatter"))

	// --- Converter ---
	mux.HandleFunc("/convert/xml-to-json", notImplemented("XML→JSON converter"))
	mux.HandleFunc("/convert/json-to-xml", notImplemented("JSON→XML converter"))

	// --- Key / Certificate generation ---
	mux.HandleFunc("/keygen/pgp", notImplemented("PGP key generation"))
	mux.HandleFunc("/keygen/ssh", notImplemented("SSH key generation"))
	mux.HandleFunc("/keygen/cert", notImplemented("Certificate generation"))

	// --- Test data generator ---
	mux.HandleFunc("/testdata/analyse", notImplemented("XML analysis"))
	mux.HandleFunc("/testdata/generate", notImplemented("Test data generation"))
	mux.HandleFunc("/testdata/templates", notImplemented("Template management"))

	addr := ":" + port
	log.Printf("[worker] listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("[worker] fatal: %v", err)
	}
}

// notImplemented returns a handler that responds 501 with a JSON message.
// Replaced handler-by-handler as features are implemented.
func notImplemented(feature string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotImplemented)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "not_implemented",
			"feature": feature,
		})
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
