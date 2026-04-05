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

	// Key / certificate generation
	mux.HandleFunc("/keygen/pgp", pgpHandler)
	mux.HandleFunc("/keygen/ssh", sshHandler)
	mux.HandleFunc("/keygen/cert", certHandler)

	// Test data generator
	mux.HandleFunc("/testdata/analyse", testdataAnalyseHandler)
	mux.HandleFunc("/testdata/generate", testdataGenerateHandler)
	mux.HandleFunc("/testdata/csv-template", testdataCSVTemplateHandler)

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
