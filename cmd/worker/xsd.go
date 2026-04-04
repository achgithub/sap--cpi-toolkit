package main

import (
	"encoding/json"
	"net/http"

	"github.com/achgithub/sap-cpi-toolkit/internal/xsd"
)

type xsdRequest struct {
	Content string `json:"content"`
}

type xsdResponse struct {
	XSD      string   `json:"xsd"`
	Warnings []string `json:"warnings,omitempty"`
}

func xsdGenerateHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req xsdRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	res, err := xsd.FromXML(req.Content)
	if err != nil {
		jsonError(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	writeJSON(w, xsdResponse{XSD: res.XSD, Warnings: res.Warnings})
}
