package main

import (
	"encoding/json"
	"net/http"

	"github.com/achgithub/sap-cpi-toolkit/internal/formatter"
)

type formatRequest struct {
	Content string `json:"content"`
}

type formatResponse struct {
	Formatted string                  `json:"formatted"`
	Valid     bool                    `json:"valid"`
	Errors    []formatter.ParseError  `json:"errors,omitempty"`
}

func formatXMLHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req formatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	res := formatter.XML(req.Content)
	writeJSON(w, formatResponse{
		Formatted: res.Formatted,
		Valid:     res.Valid,
		Errors:    res.Errors,
	})
}

func formatJSONHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req formatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	res := formatter.JSON(req.Content)
	writeJSON(w, formatResponse{
		Formatted: res.Formatted,
		Valid:     res.Valid,
		Errors:    res.Errors,
	})
}
