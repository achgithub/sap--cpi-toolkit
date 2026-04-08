package main

import (
	"encoding/json"
	"net/http"

	"github.com/achgithub/sap-cpi-toolkit/internal/testdata"
)

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

func testdataGenerateHandler(w http.ResponseWriter, r *http.Request) {
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
	zipBytes, err := testdata.Generate(req)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="test_data.zip"`)
	w.Write(zipBytes) //nolint:errcheck
}
