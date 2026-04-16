package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// LookupTable is a named list of values used as a field source during generation.
type LookupTable struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Values    []string  `json:"values"`
	CreatedAt time.Time `json:"created_at"`
}

type lookupHandler struct {
	db *pgxpool.Pool
}

func registerLookupRoutes(mux *http.ServeMux, db *pgxpool.Pool) {
	h := &lookupHandler{db: db}
	mux.HandleFunc("/testdata/lookup-tables", h.handleList)
	mux.HandleFunc("/testdata/lookup-tables/", h.handleDetail)
}

// GET  /testdata/lookup-tables  → list all tables
// POST /testdata/lookup-tables  → create
func (h *lookupHandler) handleList(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		tables, err := h.list()
		if err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, tables)

	case http.MethodPost:
		var body struct {
			Name   string   `json:"name"`
			Values []string `json:"values"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Name) == "" {
			jsonError(w, "name is required", http.StatusBadRequest)
			return
		}
		if body.Values == nil {
			body.Values = []string{}
		}
		tbl, err := h.create(body.Name, body.Values)
		if err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(tbl) //nolint:errcheck

	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// PUT    /testdata/lookup-tables/{id}  → update name + values
// DELETE /testdata/lookup-tables/{id}  → delete
func (h *lookupHandler) handleDetail(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/testdata/lookup-tables/"), "/")
	if id == "" {
		jsonError(w, "id required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodPut:
		var body struct {
			Name   string   `json:"name"`
			Values []string `json:"values"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonError(w, "invalid body", http.StatusBadRequest)
			return
		}
		if body.Values == nil {
			body.Values = []string{}
		}
		tbl, err := h.update(id, body.Name, body.Values)
		if err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, tbl)

	case http.MethodDelete:
		if err := h.delete(id); err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// getValues fetches values for a single table by ID. Called by the generate handler.
func (h *lookupHandler) getValues(id string) ([]string, error) {
	ctx := context.Background()
	var valuesJSON []byte
	err := h.db.QueryRow(ctx, `SELECT values FROM w_lookup_tables WHERE id = $1`, id).Scan(&valuesJSON)
	if err != nil {
		return nil, fmt.Errorf("lookup table %q not found", id)
	}
	var values []string
	if err := json.Unmarshal(valuesJSON, &values); err != nil {
		return nil, fmt.Errorf("decode lookup table values: %w", err)
	}
	return values, nil
}

// ── DB operations ─────────────────────────────────────────────────────────────

func (h *lookupHandler) list() ([]LookupTable, error) {
	ctx := context.Background()
	rows, err := h.db.Query(ctx,
		`SELECT id, name, values, created_at FROM w_lookup_tables ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []LookupTable
	for rows.Next() {
		var t LookupTable
		var valJSON []byte
		if err := rows.Scan(&t.ID, &t.Name, &valJSON, &t.CreatedAt); err != nil {
			continue
		}
		json.Unmarshal(valJSON, &t.Values) //nolint:errcheck
		if t.Values == nil {
			t.Values = []string{}
		}
		tables = append(tables, t)
	}
	if tables == nil {
		return []LookupTable{}, nil
	}
	return tables, nil
}

func (h *lookupHandler) create(name string, values []string) (*LookupTable, error) {
	ctx := context.Background()
	id := slugifyWorker(name) + "-" + fmt.Sprintf("%d", time.Now().UnixMilli())
	valJSON, _ := json.Marshal(values)
	now := time.Now()
	_, err := h.db.Exec(ctx,
		`INSERT INTO w_lookup_tables (id, name, values, created_at) VALUES ($1, $2, $3, $4)`,
		id, name, valJSON, now)
	if err != nil {
		return nil, fmt.Errorf("create lookup table: %w", err)
	}
	return &LookupTable{ID: id, Name: name, Values: values, CreatedAt: now}, nil
}

func (h *lookupHandler) update(id, name string, values []string) (*LookupTable, error) {
	ctx := context.Background()
	valJSON, _ := json.Marshal(values)
	tag, err := h.db.Exec(ctx,
		`UPDATE w_lookup_tables SET name = $2, values = $3 WHERE id = $1`,
		id, name, valJSON)
	if err != nil || tag.RowsAffected() == 0 {
		return nil, fmt.Errorf("lookup table %q not found", id)
	}
	return &LookupTable{ID: id, Name: name, Values: values}, nil
}

func (h *lookupHandler) delete(id string) error {
	ctx := context.Background()
	tag, err := h.db.Exec(ctx, `DELETE FROM w_lookup_tables WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete lookup table: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("lookup table %q not found", id)
	}
	return nil
}
