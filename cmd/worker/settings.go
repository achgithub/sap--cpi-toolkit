package main

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

func getSetting(ctx context.Context, pool *pgxpool.Pool, key string) string {
	var val string
	pool.QueryRow(ctx, `SELECT value FROM w_settings WHERE key = $1`, key).Scan(&val)
	return val
}

func registerSettingsRoutes(mux *http.ServeMux, pool *pgxpool.Pool) {
	mux.HandleFunc("/settings", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			rows, err := pool.Query(r.Context(), `SELECT key, value FROM w_settings`)
			if err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			result := map[string]string{}
			for rows.Next() {
				var k, v string
				rows.Scan(&k, &v)
				result[k] = v
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(result)

		case http.MethodPut:
			var body map[string]string
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
				return
			}
			for k, v := range body {
				_, err := pool.Exec(r.Context(),
					`INSERT INTO w_settings (key, value) VALUES ($1, $2)
					 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
					k, v)
				if err != nil {
					http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
					return
				}
			}
			w.WriteHeader(http.StatusNoContent)

		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
}
