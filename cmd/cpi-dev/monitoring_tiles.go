package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type MonitoringTile struct {
	ID         string    `json:"id"`
	InstanceID string    `json:"instance_id"`
	Name       string    `json:"name"`
	TimeRange  string    `json:"time_range"`
	Status     string    `json:"status"`
	PackageID  string    `json:"package_id"`
	IFlowID    string    `json:"iflow_id"`
	SortOrder  int       `json:"sort_order"`
	CreatedAt  time.Time `json:"created_at"`
}

func registerMonitoringTileRoutes(mux *http.ServeMux, pool *pgxpool.Pool) {
	mux.HandleFunc("/monitoring/tiles", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			instanceID := r.URL.Query().Get("instance_id")
			rows, err := pool.Query(r.Context(),
				`SELECT id, instance_id, name, time_range, status, package_id, iflow_id, sort_order, created_at
				 FROM w_monitoring_tiles WHERE instance_id = $1 ORDER BY sort_order, created_at`,
				instanceID)
			if err != nil {
				jsonError(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			tiles := []MonitoringTile{}
			for rows.Next() {
				var t MonitoringTile
				rows.Scan(&t.ID, &t.InstanceID, &t.Name, &t.TimeRange, &t.Status, &t.PackageID, &t.IFlowID, &t.SortOrder, &t.CreatedAt)
				tiles = append(tiles, t)
			}
			writeJSON(w, tiles)

		case http.MethodPost:
			var body struct {
				InstanceID string `json:"instance_id"`
				Name       string `json:"name"`
				TimeRange  string `json:"time_range"`
				Status     string `json:"status"`
				PackageID  string `json:"package_id"`
				IFlowID    string `json:"iflow_id"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
				jsonError(w, "name is required", http.StatusBadRequest)
				return
			}
			if body.TimeRange == "" {
				body.TimeRange = "Past Hour"
			}
			id := fmt.Sprintf("tile-%d", time.Now().UnixMilli())
			var tile MonitoringTile
			err := pool.QueryRow(r.Context(),
				`INSERT INTO w_monitoring_tiles (id, instance_id, name, time_range, status, package_id, iflow_id, sort_order)
				 VALUES ($1, $2, $3, $4, $5, $6, $7,
				   (SELECT COALESCE(MAX(sort_order),0)+1 FROM w_monitoring_tiles WHERE instance_id = $2))
				 RETURNING id, instance_id, name, time_range, status, package_id, iflow_id, sort_order, created_at`,
				id, body.InstanceID, body.Name, body.TimeRange, body.Status, body.PackageID, body.IFlowID,
			).Scan(&tile.ID, &tile.InstanceID, &tile.Name, &tile.TimeRange, &tile.Status, &tile.PackageID, &tile.IFlowID, &tile.SortOrder, &tile.CreatedAt)
			if err != nil {
				jsonError(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(tile) //nolint:errcheck

		default:
			jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/monitoring/tiles/", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/monitoring/tiles/")
		if id == "" {
			jsonError(w, "tile id required", http.StatusBadRequest)
			return
		}
		if r.Method != http.MethodDelete {
			jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		_, err := pool.Exec(r.Context(), `DELETE FROM w_monitoring_tiles WHERE id = $1`, id)
		if err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}
