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
	port  := envOr("PORT", "8081")
	dbURL := envOr("DB_URL", "postgres://toolkit:toolkit@postgres:5432/toolkit?sslmode=disable")

	ctx := context.Background()

	// Connect to Postgres with retries.
	var db interface{ Close() }
	for attempt := 1; attempt <= 10; attempt++ {
		pool, err := initWorkerDB(ctx, dbURL)
		if err != nil {
			log.Printf("[worker] db connect attempt %d/10 failed: %v", attempt, err)
			time.Sleep(time.Duration(attempt) * time.Second)
			continue
		}
		db = pool

		mux := http.NewServeMux()

		// Health
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

		// EDI tools
		mux.HandleFunc("/edi/parse", ediParseHandler)
		mux.HandleFunc("/edi/to-xml", ediToXMLHandler)
		mux.HandleFunc("/edi/to-semantic-xml", ediToSemanticXMLHandler)
		mux.HandleFunc("/edi/from-xml", ediFromXMLHandler)
		mux.HandleFunc("/edi/generate", ediGenerateHandler)

		// Test data generator
		mux.HandleFunc("/testdata/analyse", testdataAnalyseHandler)
		mux.HandleFunc("/testdata/generate", testdataGenerateHandler)
		mux.HandleFunc("/testdata/csv-template", testdataCSVTemplateHandler)

		// HTTP client collections (persisted in Postgres)
		registerCollectionRoutes(mux, pool)

		addr := ":" + port
		log.Printf("[worker] listening on %s", addr)
		if err := http.ListenAndServe(addr, mux); err != nil {
			log.Fatalf("[worker] fatal: %v", err)
		}
		return
	}

	_ = db
	log.Fatal("[worker] could not connect to database after 10 attempts")
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
