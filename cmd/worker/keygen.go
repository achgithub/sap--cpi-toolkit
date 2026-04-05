package main

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/achgithub/sap-cpi-toolkit/internal/keygen"
)

// --- PGP ---

type pgpRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Bits  int    `json:"bits"`
}

type pgpResponse struct {
	PublicKey  string `json:"public_key"`
	PrivateKey string `json:"private_key"`
}

func pgpHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req pgpRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	result, err := keygen.GeneratePGP(req.Name, req.Email, req.Bits)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, pgpResponse{PublicKey: result.PublicKey, PrivateKey: result.PrivateKey})
}

// --- SSH ---

type sshRequest struct {
	Type    string `json:"type"`
	Bits    int    `json:"bits"`
	Comment string `json:"comment"`
}

type sshResponse struct {
	PublicKey  string `json:"public_key"`
	PrivateKey string `json:"private_key"`
}

func sshHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req sshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Type == "" {
		req.Type = "rsa"
	}
	result, err := keygen.GenerateSSH(req.Type, req.Comment, req.Bits)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, sshResponse{PublicKey: result.PublicKey, PrivateKey: result.PrivateKey})
}

// --- Certificate ---

type certRequest struct {
	CommonName   string   `json:"common_name"`
	Org          string   `json:"org"`
	SAN          []string `json:"san"`
	ValidityDays int      `json:"validity_days"`
}

type certResponse struct {
	Certificate string `json:"certificate"`
	PrivateKey  string `json:"private_key"`
}

func certHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req certRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.CommonName) == "" {
		jsonError(w, "common_name is required", http.StatusBadRequest)
		return
	}
	result, err := keygen.GenerateCert(req.CommonName, req.Org, req.SAN, req.ValidityDays)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, certResponse{Certificate: result.Certificate, PrivateKey: result.PrivateKey})
}
