package main

import (
	"encoding/json"
	"net/http"

	"github.com/achgithub/sap-cpi-toolkit/internal/converter"
)

type convertRequest struct {
	Content string `json:"content"`
}

type convertResponse struct {
	Result   string   `json:"result"`
	Warnings []string `json:"warnings,omitempty"`
}

func xmlToJSONHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req convertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	res, err := converter.XMLToJSON(req.Content)
	if err != nil {
		jsonError(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	writeJSON(w, convertResponse{Result: res.Output, Warnings: res.Warnings})
}

func jsonToXMLHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req convertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	res, err := converter.JSONToXML(req.Content)
	if err != nil {
		jsonError(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	writeJSON(w, convertResponse{Result: res.Output, Warnings: res.Warnings})
}
