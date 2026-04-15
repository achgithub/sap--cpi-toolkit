package adaptercontrol

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

// Handler holds the store and serves the adapter-control HTTP API.
type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

// RegisterRoutes attaches all routes to mux.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/health", h.handleHealth)
	mux.HandleFunc("/scenarios", h.handleScenarios)
	mux.HandleFunc("/scenarios/", h.handleScenarioDetail)
	mux.HandleFunc("/adapter-config/", h.handleAdapterConfig)
	mux.HandleFunc("/adapter-activity/", h.handleAdapterActivity)
	mux.HandleFunc("/sftp", h.handleSFTP)
	mux.HandleFunc("/sftp/regenerate-key", h.handleSFTPRegenerateKey)
	mux.HandleFunc("/system/log", h.handleSystemLog)
	mux.HandleFunc("/assets", h.handleAssets)
	mux.HandleFunc("/assets/", h.handleAssetDetail)
	mux.HandleFunc("/connections", h.handleConnections)
	mux.HandleFunc("/connections/", h.handleConnectionDetail)
}

// ── Health ────────────────────────────────────────────────────────────────────

func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"status": "ok"})
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

func (h *Handler) handleScenarios(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, h.store.ListScenarios())
	case http.MethodPost:
		var req CreateScenarioRequest
		if !decodeBody(w, r, &req) {
			return
		}
		sc, err := h.store.CreateScenario(req)
		if err != nil {
			jsonError(w, err.Error(), http.StatusBadRequest)
			return
		}
		h.store.AddLog("Created scenario: " + sc.Name)
		writeCreated(w, sc)
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleScenarioDetail(w http.ResponseWriter, r *http.Request) {
	// Path: /scenarios/{id}[/adapters[/{adapterId}]]
	path := strings.TrimPrefix(r.URL.Path, "/scenarios/")
	parts := strings.SplitN(path, "/", 3)
	scenarioID := parts[0]
	if scenarioID == "" {
		jsonError(w, "scenario ID required", http.StatusBadRequest)
		return
	}

	if len(parts) > 1 && parts[1] == "adapters" {
		adapterID := ""
		if len(parts) > 2 {
			adapterID = parts[2]
		}
		h.handleAdapters(w, r, scenarioID, adapterID)
		return
	}

	// Scenario CRUD
	switch r.Method {
	case http.MethodGet:
		sc, err := h.store.GetScenario(scenarioID)
		if err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, sc)
	case http.MethodPut:
		var req UpdateScenarioRequest
		if !decodeBody(w, r, &req) {
			return
		}
		sc, err := h.store.UpdateScenario(scenarioID, req)
		if err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, sc)
	case http.MethodDelete:
		if err := h.store.DeleteScenario(scenarioID); err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		h.store.AddLog("Deleted scenario: " + scenarioID)
		w.WriteHeader(http.StatusNoContent)
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ── Adapters ──────────────────────────────────────────────────────────────────

func (h *Handler) handleAdapters(w http.ResponseWriter, r *http.Request, scenarioID, adapterID string) {
	if adapterID == "" {
		// Collection: GET list or POST create
		switch r.Method {
		case http.MethodGet:
			adapters, err := h.store.ListAdapters(scenarioID)
			if err != nil {
				jsonError(w, err.Error(), http.StatusNotFound)
				return
			}
			writeJSON(w, adapters)
		case http.MethodPost:
			var req CreateAdapterRequest
			if !decodeBody(w, r, &req) {
				return
			}
			a, err := h.store.CreateAdapter(scenarioID, req)
			if err != nil {
				jsonError(w, err.Error(), http.StatusBadRequest)
				return
			}
			h.store.AddLog("Created adapter: " + a.Name + " (" + a.Type + ") in scenario " + scenarioID)
			writeCreated(w, a)
		default:
			jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		}
		return
	}

	// Individual adapter
	switch r.Method {
	case http.MethodGet:
		a, err := h.store.GetAdapter(scenarioID, adapterID)
		if err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, a)
	case http.MethodPut:
		var req UpdateAdapterRequest
		if !decodeBody(w, r, &req) {
			return
		}
		a, err := h.store.UpdateAdapter(scenarioID, adapterID, req)
		if err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		h.store.AddLog("Updated adapter: " + adapterID)
		writeJSON(w, a)
	case http.MethodDelete:
		if err := h.store.DeleteAdapter(scenarioID, adapterID); err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		h.store.AddLog("Deleted adapter: " + adapterID)
		w.WriteHeader(http.StatusNoContent)
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ── Adapter config polling (called by adapter containers) ─────────────────────

// handleAdapterConfig serves GET /adapter-config/{adapterId}.
// HTTP adapters poll this on startup; SFTP polls with id "sftp".
func (h *Handler) handleAdapterConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	adapterID := strings.TrimPrefix(r.URL.Path, "/adapter-config/")
	adapterID = strings.Trim(adapterID, "/")
	if adapterID == "" {
		jsonError(w, "adapter ID required", http.StatusBadRequest)
		return
	}

	// SFTP is standalone — its "ID" is always "sftp"
	if adapterID == "sftp" {
		cfg := h.store.GetSFTP()
		resp := SFTPPollResponse{
			ID:                    "sftp",
			Name:                  "SFTP Server",
			Type:                  "SFTP",
			BehaviorMode:          "success",
			Files:                 cfg.Files,
			AuthMode:              cfg.AuthMode,
			SSHHostKey:            cfg.SSHHostKey,
			SSHHostKeyFingerprint: cfg.SSHHostKeyFingerprint,
			SSHPublicKey:          cfg.SSHPublicKey,
			Credentials:           &cfg.Credentials,
		}
		writeJSON(w, resp)
		return
	}

	a, ok := h.store.GetAdapterByID(adapterID)
	if !ok {
		jsonError(w, "adapter not found: "+adapterID, http.StatusNotFound)
		return
	}

	resp := AdapterPollResponse{
		ID:              a.ID,
		Name:            a.Name,
		Type:            a.Type,
		BehaviorMode:    a.BehaviorMode,
		StatusCode:      a.Config.StatusCode,
		ResponseBody:    a.Config.ResponseBody,
		ResponseHeaders: a.Config.ResponseHeaders,
		ResponseDelayMs: a.Config.ResponseDelayMs,
		SoapVersion:     a.Config.SoapVersion,
		Credentials:     a.Credentials,
	}
	writeJSON(w, resp)
}

// handleAdapterActivity serves POST /adapter-activity/{adapterId}.
// Adapter containers call this to report that they received a request.
func (h *Handler) handleAdapterActivity(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	adapterID := strings.TrimPrefix(r.URL.Path, "/adapter-activity/")
	adapterID = strings.Trim(adapterID, "/")
	if adapterID != "" {
		h.store.RecordActivity(adapterID)
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── SFTP ──────────────────────────────────────────────────────────────────────

func (h *Handler) handleSFTP(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		cfg := h.store.GetSFTP()
		// Strip the private key from the response — UI only shows the fingerprint
		cfg.SSHHostKey = ""
		writeJSON(w, cfg)
	case http.MethodPut:
		var cfg SFTPConfig
		if !decodeBody(w, r, &cfg) {
			return
		}
		h.store.UpdateSFTP(cfg)
		h.store.AddLog("SFTP configuration updated")
		result := h.store.GetSFTP()
		result.SSHHostKey = ""
		writeJSON(w, result)
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleSFTPRegenerateKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	fp, err := h.store.RegenerateHostKey()
	if err != nil {
		jsonError(w, "failed to regenerate key: "+err.Error(), http.StatusInternalServerError)
		return
	}
	h.store.AddLog("SFTP host key regenerated")
	writeJSON(w, map[string]string{"fingerprint": fp})
}

// ── Assets ────────────────────────────────────────────────────────────────────

func (h *Handler) handleAssets(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, h.store.ListAssets())
	case http.MethodPost:
		var req CreateAssetRequest
		if !decodeBody(w, r, &req) {
			return
		}
		a, err := h.store.CreateAsset(req)
		if err != nil {
			jsonError(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeCreated(w, a)
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleAssetDetail(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/assets/")
	id = strings.Trim(id, "/")
	if id == "" {
		jsonError(w, "asset ID required", http.StatusBadRequest)
		return
	}
	switch r.Method {
	case http.MethodGet:
		a, err := h.store.GetAsset(id)
		if err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, a)
	case http.MethodDelete:
		if err := h.store.DeleteAsset(id); err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ── CPI Connections ───────────────────────────────────────────────────────────

func (h *Handler) handleConnections(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, h.store.ListConnections())
	case http.MethodPost:
		var req CreateCPIConnectionRequest
		if !decodeBody(w, r, &req) {
			return
		}
		c, err := h.store.CreateConnection(req)
		if err != nil {
			jsonError(w, err.Error(), http.StatusBadRequest)
			return
		}
		h.store.AddLog("Created CPI connection: " + c.Name)
		writeCreated(w, c)
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleConnectionDetail(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/connections/")
	id = strings.Trim(id, "/")
	if id == "" {
		jsonError(w, "connection ID required", http.StatusBadRequest)
		return
	}
	switch r.Method {
	case http.MethodPut:
		var req UpdateCPIConnectionRequest
		if !decodeBody(w, r, &req) {
			return
		}
		c, err := h.store.UpdateConnection(id, req)
		if err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		h.store.AddLog("Updated CPI connection: " + c.Name)
		writeJSON(w, c)
	case http.MethodDelete:
		if err := h.store.DeleteConnection(id); err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		h.store.AddLog("Deleted CPI connection: " + id)
		w.WriteHeader(http.StatusNoContent)
	default:
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ── System log ────────────────────────────────────────────────────────────────

func (h *Handler) handleSystemLog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, h.store.GetLog(200))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("[adapter-control] encode error: %v", err)
	}
}

func writeCreated(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("[adapter-control] encode error: %v", err)
	}
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg}) //nolint:errcheck
}

func decodeBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return false
	}
	return true
}
