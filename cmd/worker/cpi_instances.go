package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/jackc/pgx/v5/pgxpool"
)

type cpiInstancesHandler struct {
	db *pgxpool.Pool
}

type CPIInstance struct {
	ID         string          `json:"id"`
	Name       string          `json:"name"`
	SystemType string          `json:"system_type"`
	APIKey     json.RawMessage `json:"api_key"`
	PIKey      json.RawMessage `json:"pi_key"`
	CreatedAt  time.Time       `json:"created_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

var validSystemTypes = map[string]bool{
	"TRL": true, "SBX": true, "DEV": true,
	"QAS": true, "PPD": true, "PRD": true,
}

func registerCPIInstanceRoutes(mux *http.ServeMux, db *pgxpool.Pool) {
	h := &cpiInstancesHandler{db: db}
	mux.HandleFunc("/cpi-instances", h.handleList)
	mux.HandleFunc("/cpi-instances/", h.handleDetail)
}

func (h *cpiInstancesHandler) handleList(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		instances, err := h.list()
		if err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, instances)
	case http.MethodPost:
		var body struct {
			Name       string          `json:"name"`
			SystemType string          `json:"system_type"`
			APIKey     json.RawMessage `json:"api_key"`
			PIKey      json.RawMessage `json:"pi_key"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonError(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(body.Name) == "" {
			jsonError(w, "name is required", http.StatusBadRequest)
			return
		}
		if !validSystemTypes[body.SystemType] {
			jsonError(w, "system_type is required (TRL, SBX, DEV, QAS, PPD, PRD)", http.StatusBadRequest)
			return
		}
		inst, err := h.create(body.Name, body.SystemType, body.APIKey, body.PIKey)
		if err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(inst) //nolint:errcheck
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *cpiInstancesHandler) handleDetail(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/cpi-instances/")
	id = strings.Trim(id, "/")
	if id == "" {
		jsonError(w, "instance ID required", http.StatusBadRequest)
		return
	}
	switch r.Method {
	case http.MethodPut:
		var body struct {
			Name       string          `json:"name"`
			SystemType string          `json:"system_type"`
			APIKey     json.RawMessage `json:"api_key"`
			PIKey      json.RawMessage `json:"pi_key"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonError(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(body.Name) == "" {
			jsonError(w, "name is required", http.StatusBadRequest)
			return
		}
		if !validSystemTypes[body.SystemType] {
			jsonError(w, "system_type is required (TRL, SBX, DEV, QAS, PPD, PRD)", http.StatusBadRequest)
			return
		}
		inst, err := h.update(id, body.Name, body.SystemType, body.APIKey, body.PIKey)
		if err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, inst)
	case http.MethodDelete:
		if err := h.deleteInstance(id); err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *cpiInstancesHandler) list() ([]CPIInstance, error) {
	ctx := context.Background()
	rows, err := h.db.Query(ctx,
		`SELECT id, name, system_type, api_key, pi_key, created_at, updated_at FROM w_cpi_instances ORDER BY created_at`)
	if err != nil {
		return []CPIInstance{}, err
	}
	defer rows.Close()
	var result []CPIInstance
	for rows.Next() {
		var inst CPIInstance
		var ak, pk []byte
		if err := rows.Scan(&inst.ID, &inst.Name, &inst.SystemType, &ak, &pk, &inst.CreatedAt, &inst.UpdatedAt); err != nil {
			continue
		}
		inst.APIKey = json.RawMessage(ak)
		inst.PIKey = json.RawMessage(pk)
		result = append(result, inst)
	}
	if result == nil {
		return []CPIInstance{}, nil
	}
	return result, nil
}

func (h *cpiInstancesHandler) create(name, systemType string, apiKey, piKey json.RawMessage) (*CPIInstance, error) {
	ctx := context.Background()
	id := cpiSlugify(name) + "-" + fmt.Sprintf("%d", time.Now().UnixMilli())
	now := time.Now()
	_, err := h.db.Exec(ctx,
		`INSERT INTO w_cpi_instances (id, name, system_type, api_key, pi_key, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $6)`,
		id, name, systemType, nullableJSON(apiKey), nullableJSON(piKey), now)
	if err != nil {
		return nil, fmt.Errorf("create instance: %w", err)
	}
	return &CPIInstance{ID: id, Name: name, SystemType: systemType, APIKey: apiKey, PIKey: piKey, CreatedAt: now, UpdatedAt: now}, nil
}

func (h *cpiInstancesHandler) update(id, name, systemType string, apiKey, piKey json.RawMessage) (*CPIInstance, error) {
	ctx := context.Background()
	now := time.Now()
	tag, err := h.db.Exec(ctx,
		`UPDATE w_cpi_instances SET name = $2, system_type = $3, api_key = $4, pi_key = $5, updated_at = $6 WHERE id = $1`,
		id, name, systemType, nullableJSON(apiKey), nullableJSON(piKey), now)
	if err != nil || tag.RowsAffected() == 0 {
		return nil, fmt.Errorf("instance not found: %s", id)
	}
	var inst CPIInstance
	var ak, pk []byte
	_ = h.db.QueryRow(ctx,
		`SELECT id, name, system_type, api_key, pi_key, created_at, updated_at FROM w_cpi_instances WHERE id = $1`, id).
		Scan(&inst.ID, &inst.Name, &inst.SystemType, &ak, &pk, &inst.CreatedAt, &inst.UpdatedAt)
	inst.APIKey = json.RawMessage(ak)
	inst.PIKey = json.RawMessage(pk)
	return &inst, nil
}

func (h *cpiInstancesHandler) deleteInstance(id string) error {
	ctx := context.Background()
	tag, err := h.db.Exec(ctx, `DELETE FROM w_cpi_instances WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete instance: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("instance not found: %s", id)
	}
	return nil
}

// nullableJSON returns nil if the raw message is empty or the JSON null literal,
// otherwise returns the bytes. Used to store NULL in JSONB columns cleanly.
func nullableJSON(raw json.RawMessage) interface{} {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	return []byte(raw)
}

func cpiSlugify(s string) string {
	s = strings.ToLower(s)
	slug := strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' {
			return r
		}
		return '-'
	}, s)
	return strings.Trim(slug, "-")
}
