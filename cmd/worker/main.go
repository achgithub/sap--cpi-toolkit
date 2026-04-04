package main

import (
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

	// Formatter
	mux.HandleFunc("/format/xml", formatXMLHandler)
	mux.HandleFunc("/format/json", formatJSONHandler)

	// Converter
	mux.HandleFunc("/convert/xml-to-json", xmlToJSONHandler)
	mux.HandleFunc("/convert/json-to-xml", jsonToXMLHandler)

	// XSD generator
	mux.HandleFunc("/xsd/generate", xsdGenerateHandler)

	// Key / certificate generation — step 4
	mux.HandleFunc("/keygen/pgp", notImplemented("PGP key generation"))
	mux.HandleFunc("/keygen/ssh", notImplemented("SSH key generation"))
	mux.HandleFunc("/keygen/cert", notImplemented("certificate generation"))

	// Test data generator — step 5
	mux.HandleFunc("/testdata/analyse", notImplemented("XML analysis"))
	mux.HandleFunc("/testdata/generate", notImplemented("test data generation"))
	mux.HandleFunc("/testdata/templates", notImplemented("template management"))

	addr := ":" + port
	log.Printf("[worker] listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("[worker] fatal: %v", err)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
