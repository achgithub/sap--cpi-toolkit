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

type Collection struct {
	ID        string           `json:"id"`
	Name      string           `json:"name"`
	Requests  []SavedRequest   `json:"requests"`
	CreatedAt time.Time        `json:"created_at"`
}

type SavedRequest struct {
	ID           string            `json:"id"`
	CollectionID string            `json:"collection_id"`
	Name         string            `json:"name"`
	Method       string            `json:"method"`
	URL          string            `json:"url"`
	Headers      map[string]string `json:"headers"`
	Body         string            `json:"body"`
	SortOrder    int               `json:"sort_order"`
	CreatedAt    time.Time         `json:"created_at"`
}

type collectionsHandler struct {
	db *pgxpool.Pool
}

func registerCollectionRoutes(mux *http.ServeMux, db *pgxpool.Pool) {
	h := &collectionsHandler{db: db}
	mux.HandleFunc("/http-client/collections", h.handleCollections)
	mux.HandleFunc("/http-client/collections/", h.handleCollectionDetail)
}

// GET /http-client/collections         → list all collections with their requests
// POST /http-client/collections        → create collection
func (h *collectionsHandler) handleCollections(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		cols, err := h.listCollections()
		if err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, cols)
	case http.MethodPost:
		var body struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
			jsonError(w, "name is required", http.StatusBadRequest)
			return
		}
		col, err := h.createCollection(body.Name)
		if err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(col) //nolint:errcheck
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// Routes under /http-client/collections/{id}[/requests[/{reqId}]]
func (h *collectionsHandler) handleCollectionDetail(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/http-client/collections/")
	parts := strings.SplitN(path, "/", 3)
	colID := parts[0]
	if colID == "" {
		jsonError(w, "collection ID required", http.StatusBadRequest)
		return
	}

	// /http-client/collections/{id}/requests[/{reqId}]
	if len(parts) > 1 && parts[1] == "requests" {
		reqID := ""
		if len(parts) > 2 {
			reqID = parts[2]
		}
		h.handleRequests(w, r, colID, reqID)
		return
	}

	// /http-client/collections/{id}
	switch r.Method {
	case http.MethodDelete:
		if err := h.deleteCollection(colID); err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *collectionsHandler) handleRequests(w http.ResponseWriter, r *http.Request, colID, reqID string) {
	if reqID == "" {
		// POST /http-client/collections/{id}/requests
		if r.Method != http.MethodPost {
			jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req SavedRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, "invalid request body", http.StatusBadRequest)
			return
		}
		req.CollectionID = colID
		saved, err := h.createRequest(req)
		if err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(saved) //nolint:errcheck
		return
	}

	switch r.Method {
	case http.MethodPut:
		var req SavedRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, "invalid request body", http.StatusBadRequest)
			return
		}
		saved, err := h.updateRequest(reqID, req)
		if err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, saved)
	case http.MethodDelete:
		if err := h.deleteRequest(reqID); err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ── DB operations ─────────────────────────────────────────────────────────────

func (h *collectionsHandler) listCollections() ([]Collection, error) {
	ctx := context.Background()
	rows, err := h.db.Query(ctx,
		`SELECT id, name, created_at FROM w_http_collections ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []Collection
	for rows.Next() {
		var c Collection
		if err := rows.Scan(&c.ID, &c.Name, &c.CreatedAt); err != nil {
			continue
		}
		c.Requests = []SavedRequest{}
		cols = append(cols, c)
	}
	if cols == nil {
		return []Collection{}, nil
	}

	// Load all requests and stitch into collections.
	reqRows, err := h.db.Query(ctx,
		`SELECT id, collection_id, name, method, url, headers, body, sort_order, created_at
		 FROM w_http_requests ORDER BY sort_order, created_at`)
	if err != nil {
		return cols, nil
	}
	defer reqRows.Close()

	reqMap := map[string][]SavedRequest{}
	for reqRows.Next() {
		var req SavedRequest
		var headersJSON []byte
		if err := reqRows.Scan(&req.ID, &req.CollectionID, &req.Name, &req.Method, &req.URL,
			&headersJSON, &req.Body, &req.SortOrder, &req.CreatedAt); err != nil {
			continue
		}
		json.Unmarshal(headersJSON, &req.Headers) //nolint:errcheck
		reqMap[req.CollectionID] = append(reqMap[req.CollectionID], req)
	}
	for i := range cols {
		if reqs, ok := reqMap[cols[i].ID]; ok {
			cols[i].Requests = reqs
		}
	}
	return cols, nil
}

func (h *collectionsHandler) createCollection(name string) (*Collection, error) {
	ctx := context.Background()
	id := slugifyWorker(name) + "-" + fmt.Sprintf("%d", time.Now().UnixMilli())
	now := time.Now()
	_, err := h.db.Exec(ctx,
		`INSERT INTO w_http_collections (id, name, created_at) VALUES ($1, $2, $3)`,
		id, name, now)
	if err != nil {
		return nil, fmt.Errorf("create collection: %w", err)
	}
	return &Collection{ID: id, Name: name, Requests: []SavedRequest{}, CreatedAt: now}, nil
}

func (h *collectionsHandler) deleteCollection(id string) error {
	ctx := context.Background()
	tag, err := h.db.Exec(ctx, `DELETE FROM w_http_collections WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete collection: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("collection not found: %s", id)
	}
	return nil
}

func (h *collectionsHandler) createRequest(req SavedRequest) (*SavedRequest, error) {
	ctx := context.Background()
	id := fmt.Sprintf("req-%d", time.Now().UnixNano())
	if req.Headers == nil {
		req.Headers = map[string]string{}
	}
	if req.Method == "" {
		req.Method = "GET"
	}
	headersJSON, _ := json.Marshal(req.Headers)
	now := time.Now()
	_, err := h.db.Exec(ctx,
		`INSERT INTO w_http_requests (id, collection_id, name, method, url, headers, body, sort_order, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		id, req.CollectionID, req.Name, req.Method, req.URL, headersJSON, req.Body, req.SortOrder, now)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.ID = id
	req.CreatedAt = now
	return &req, nil
}

func (h *collectionsHandler) updateRequest(id string, req SavedRequest) (*SavedRequest, error) {
	ctx := context.Background()
	if req.Headers == nil {
		req.Headers = map[string]string{}
	}
	headersJSON, _ := json.Marshal(req.Headers)
	tag, err := h.db.Exec(ctx,
		`UPDATE w_http_requests SET name = $2, method = $3, url = $4, headers = $5, body = $6 WHERE id = $1`,
		id, req.Name, req.Method, req.URL, headersJSON, req.Body)
	if err != nil || tag.RowsAffected() == 0 {
		return nil, fmt.Errorf("request not found: %s", id)
	}
	req.ID = id
	return &req, nil
}

func (h *collectionsHandler) deleteRequest(id string) error {
	ctx := context.Background()
	tag, err := h.db.Exec(ctx, `DELETE FROM w_http_requests WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete request: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("request not found: %s", id)
	}
	return nil
}

func slugifyWorker(s string) string {
	s = strings.ToLower(s)
	s = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			return r
		}
		return '-'
	}, s)
	return strings.Trim(s, "-")
}
