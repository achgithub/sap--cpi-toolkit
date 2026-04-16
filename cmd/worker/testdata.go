package main

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/achgithub/sap-cpi-toolkit/internal/testdata"
)

type testdataHandler struct {
	lookup *lookupHandler
}

func registerTestdataRoutes(mux *http.ServeMux, db *pgxpool.Pool) {
	h := &testdataHandler{lookup: &lookupHandler{db: db}}
	mux.HandleFunc("/testdata/analyse", testdataAnalyseHandler)
	mux.HandleFunc("/testdata/csv-template", testdataCSVTemplateHandler)
	mux.HandleFunc("/testdata/generate", h.generateHandler)
	mux.HandleFunc("/testdata/generate-one", h.generateOneHandler)
	mux.HandleFunc("/testdata/generate-batch", h.generateBatchHandler)
}

func testdataAnalyseHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Content   string `json:"content"`
		InputType string `json:"input_type"` // "xml" (default) or "xsd"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	var result testdata.AnalyseResult
	var err error
	if req.InputType == "xsd" {
		result, err = testdata.AnalyseXSD(req.Content)
	} else {
		result, err = testdata.Analyse(req.Content)
	}
	if err != nil {
		jsonError(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	writeJSON(w, result)
}

func testdataCSVTemplateHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	result, err := testdata.GenerateCSVTemplate(req.Content)
	if err != nil {
		jsonError(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	writeJSON(w, result)
}

func (h *testdataHandler) generateHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req testdata.GenerateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Template == "" {
		jsonError(w, "template is required", http.StatusBadRequest)
		return
	}

	// Resolve lookup_table_id → LookupValues for any field in lookup mode.
	for i, fc := range req.Fields {
		if fc.Mode == testdata.ModeLookup && fc.LookupTableID != "" {
			vals, err := h.lookup.getValues(fc.LookupTableID)
			if err != nil {
				jsonError(w, fmt.Sprintf("field %q: %v", fc.Path, err), http.StatusBadRequest)
				return
			}
			if len(vals) == 0 {
				jsonError(w, fmt.Sprintf("field %q: lookup table is empty", fc.Path), http.StatusBadRequest)
				return
			}
			req.Fields[i].LookupValues = vals
		}
	}

	zipBytes, err := testdata.Generate(req)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="test_data.zip"`)
	w.Write(zipBytes) //nolint:errcheck
}

func (h *testdataHandler) generateOneHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req testdata.GenerateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Template == "" {
		jsonError(w, "template is required", http.StatusBadRequest)
		return
	}

	// Resolve lookup table IDs → values.
	for i, fc := range req.Fields {
		if fc.Mode == testdata.ModeLookup && fc.LookupTableID != "" {
			vals, err := h.lookup.getValues(fc.LookupTableID)
			if err != nil {
				jsonError(w, fmt.Sprintf("field %q: %v", fc.Path, err), http.StatusBadRequest)
				return
			}
			req.Fields[i].LookupValues = vals
		}
	}

	xml, err := testdata.GenerateSingle(req)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/xml")
	w.Write([]byte(xml)) //nolint:errcheck
}

func (h *testdataHandler) generateBatchHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req testdata.GenerateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Template == "" {
		jsonError(w, "template is required", http.StatusBadRequest)
		return
	}

	for i, fc := range req.Fields {
		if fc.Mode == testdata.ModeLookup && fc.LookupTableID != "" {
			vals, err := h.lookup.getValues(fc.LookupTableID)
			if err != nil {
				jsonError(w, fmt.Sprintf("field %q: %v", fc.Path, err), http.StatusBadRequest)
				return
			}
			req.Fields[i].LookupValues = vals
		}
	}

	docs, err := testdata.GenerateBatch(req)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]interface{}{"documents": docs})
}
