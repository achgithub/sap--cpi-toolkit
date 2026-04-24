package main

import (
	"crypto/tls"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type proxyRequest struct {
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

type proxyResponse struct {
	Status     int               `json:"status"`
	StatusText string            `json:"statusText"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	DurationMs int64             `json:"durationMs"`
}

func makeProxyHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req proxyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}
		if req.URL == "" {
			http.Error(w, `{"error":"url is required"}`, http.StatusBadRequest)
			return
		}

		logging := getSetting(r.Context(), pool, "logging") == "true"

		var bodyReader io.Reader
		if req.Body != "" {
			bodyReader = strings.NewReader(req.Body)
		}

		outReq, err := http.NewRequestWithContext(r.Context(), req.Method, req.URL, bodyReader)
		if err != nil {
			http.Error(w, `{"error":"invalid url"}`, http.StatusBadRequest)
			return
		}
		if req.Body != "" {
			outReq.ContentLength = int64(len(req.Body))
		}
		for k, v := range req.Headers {
			outReq.Header.Set(k, v)
		}

		if logging {
			log.Printf("[proxy] %s %s headers=%v bodyLen=%d", req.Method, req.URL, req.Headers, len(req.Body))
			if dump, err := httputil.DumpRequestOut(outReq, true); err == nil {
				log.Printf("[proxy] raw request:\n%s", string(dump))
			}
		}

		client := &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig:   &tls.Config{},
				ForceAttemptHTTP2: false,
			},
			CheckRedirect: func(redirectReq *http.Request, via []*http.Request) error {
				if len(via) > 0 {
					if logging {
						log.Printf("[proxy] redirect %s -> %s", via[len(via)-1].URL, redirectReq.URL)
					}
					if auth := via[0].Header.Get("Authorization"); auth != "" {
						redirectReq.Header.Set("Authorization", auth)
					}
				}
				return nil
			},
		}
		start := time.Now()
		resp, err := client.Do(outReq)
		durationMs := time.Since(start).Milliseconds()
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadGateway)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		defer resp.Body.Close()

		respBody, _ := io.ReadAll(resp.Body)

		if logging {
			log.Printf("[proxy] response %d in %dms body=%q", resp.StatusCode, durationMs, string(respBody))
		}

		respHeaders := make(map[string]string)
		for k := range resp.Header {
			respHeaders[k] = resp.Header.Get(k)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(proxyResponse{
			Status:     resp.StatusCode,
			StatusText: resp.Status,
			Headers:    respHeaders,
			Body:       string(respBody),
			DurationMs: durationMs,
		})
	}
}
