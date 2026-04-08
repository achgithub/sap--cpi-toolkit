package adaptercontrol

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

const systemLogMaxEntries = 1000

// Store holds all in-memory state for the adapter-control service.
type Store struct {
	mu         sync.RWMutex
	scenarios  map[string]*Scenario
	adapters   map[string]*Adapter // flat index: adapterID → Adapter (for fast config polling)
	sftp       SFTPConfig
	systemLog  []string
}

func NewStore() *Store {
	s := &Store{
		scenarios: make(map[string]*Scenario),
		adapters:  make(map[string]*Adapter),
		systemLog: []string{},
		sftp: SFTPConfig{
			Credentials: Credentials{Username: "sftpuser", Password: "sftppass"},
			Files:       []SFTPFile{},
			AuthMode:    "password",
		},
	}
	// Generate an SSH host key for the SFTP server on first start.
	keyPEM, fp, err := generateSSHHostKey()
	if err == nil {
		s.sftp.SSHHostKey = keyPEM
		s.sftp.SSHHostKeyFingerprint = fp
	}
	return s
}

// ── System log ────────────────────────────────────────────────────────────────

func (s *Store) AddLog(msg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry := time.Now().Format("2006-01-02 15:04:05") + "  " + msg
	s.systemLog = append(s.systemLog, entry)
	if len(s.systemLog) > systemLogMaxEntries {
		s.systemLog = s.systemLog[len(s.systemLog)-systemLogMaxEntries:]
	}
}

func (s *Store) GetLog(n int) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	src := s.systemLog
	if n > 0 && n < len(src) {
		src = src[len(src)-n:]
	}
	result := make([]string, len(src))
	copy(result, src)
	return result
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

func (s *Store) ListScenarios() []Scenario {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Scenario, 0, len(s.scenarios))
	for _, sc := range s.scenarios {
		out = append(out, *sc)
	}
	return out
}

func (s *Store) GetScenario(id string) (*Scenario, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sc, ok := s.scenarios[id]
	if !ok {
		return nil, fmt.Errorf("scenario not found: %s", id)
	}
	cp := *sc
	return &cp, nil
}

func (s *Store) CreateScenario(req CreateScenarioRequest) (*Scenario, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	id := slugify(req.Name) + "-" + fmt.Sprintf("%d", time.Now().UnixMilli())
	sc := &Scenario{
		ID:          id,
		Name:        req.Name,
		Description: req.Description,
		Adapters:    []Adapter{},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	s.scenarios[id] = sc
	return sc, nil
}

func (s *Store) UpdateScenario(id string, req UpdateScenarioRequest) (*Scenario, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sc, ok := s.scenarios[id]
	if !ok {
		return nil, fmt.Errorf("scenario not found: %s", id)
	}
	if req.Name != "" {
		sc.Name = req.Name
	}
	if req.Description != "" {
		sc.Description = req.Description
	}
	sc.UpdatedAt = time.Now()
	cp := *sc
	return &cp, nil
}

func (s *Store) DeleteScenario(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	sc, ok := s.scenarios[id]
	if !ok {
		return fmt.Errorf("scenario not found: %s", id)
	}
	for _, a := range sc.Adapters {
		delete(s.adapters, a.ID)
	}
	delete(s.scenarios, id)
	return nil
}

// ── Adapters ──────────────────────────────────────────────────────────────────

func (s *Store) ListAdapters(scenarioID string) ([]Adapter, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sc, ok := s.scenarios[scenarioID]
	if !ok {
		return nil, fmt.Errorf("scenario not found: %s", scenarioID)
	}
	out := make([]Adapter, len(sc.Adapters))
	copy(out, sc.Adapters)
	return out, nil
}

func (s *Store) GetAdapter(scenarioID, adapterID string) (*Adapter, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sc, ok := s.scenarios[scenarioID]
	if !ok {
		return nil, fmt.Errorf("scenario not found: %s", scenarioID)
	}
	for i := range sc.Adapters {
		if sc.Adapters[i].ID == adapterID {
			cp := sc.Adapters[i]
			return &cp, nil
		}
	}
	return nil, fmt.Errorf("adapter not found: %s", adapterID)
}

func (s *Store) CreateAdapter(scenarioID string, req CreateAdapterRequest) (*Adapter, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if req.Type == "" {
		return nil, fmt.Errorf("type is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	sc, ok := s.scenarios[scenarioID]
	if !ok {
		return nil, fmt.Errorf("scenario not found: %s", scenarioID)
	}
	adapterID := scenarioID + "-" + slugify(req.Type) + "-" + fmt.Sprintf("%d", time.Now().UnixMilli())
	bm := req.BehaviorMode
	if bm == "" {
		bm = "success"
	}
	cfg := req.Config
	if cfg.StatusCode == 0 {
		cfg.StatusCode = 200
	}
	a := Adapter{
		ID:           adapterID,
		ScenarioID:   scenarioID,
		Name:         req.Name,
		Type:         req.Type,
		BehaviorMode: bm,
		Config:       cfg,
		Credentials:  req.Credentials,
		IngressURL:   IngressURL(req.Type, adapterID),
		CreatedAt:    time.Now(),
	}
	sc.Adapters = append(sc.Adapters, a)
	sc.UpdatedAt = time.Now()
	s.adapters[adapterID] = &sc.Adapters[len(sc.Adapters)-1]
	return &a, nil
}

func (s *Store) UpdateAdapter(scenarioID, adapterID string, req UpdateAdapterRequest) (*Adapter, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sc, ok := s.scenarios[scenarioID]
	if !ok {
		return nil, fmt.Errorf("scenario not found: %s", scenarioID)
	}
	for i := range sc.Adapters {
		if sc.Adapters[i].ID == adapterID {
			a := &sc.Adapters[i]
			if req.Name != "" {
				a.Name = req.Name
			}
			if req.BehaviorMode != "" {
				a.BehaviorMode = req.BehaviorMode
			}
			a.Config = req.Config
			if req.Credentials != nil {
				a.Credentials = req.Credentials
			}
			sc.UpdatedAt = time.Now()
			s.adapters[adapterID] = a
			cp := *a
			return &cp, nil
		}
	}
	return nil, fmt.Errorf("adapter not found: %s", adapterID)
}

func (s *Store) DeleteAdapter(scenarioID, adapterID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	sc, ok := s.scenarios[scenarioID]
	if !ok {
		return fmt.Errorf("scenario not found: %s", scenarioID)
	}
	for i := range sc.Adapters {
		if sc.Adapters[i].ID == adapterID {
			sc.Adapters = append(sc.Adapters[:i], sc.Adapters[i+1:]...)
			sc.UpdatedAt = time.Now()
			delete(s.adapters, adapterID)
			return nil
		}
	}
	return fmt.Errorf("adapter not found: %s", adapterID)
}

// GetAdapterByID looks up any adapter across all scenarios (used by adapter polling).
func (s *Store) GetAdapterByID(adapterID string) (*Adapter, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	a, ok := s.adapters[adapterID]
	if !ok {
		return nil, false
	}
	cp := *a
	return &cp, true
}

// RecordActivity updates LastActivity for an adapter.
func (s *Store) RecordActivity(adapterID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if a, ok := s.adapters[adapterID]; ok {
		now := time.Now()
		a.LastActivity = &now
	}
}

// ── SFTP ──────────────────────────────────────────────────────────────────────

func (s *Store) GetSFTP() SFTPConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.sftp
}

func (s *Store) UpdateSFTP(cfg SFTPConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Preserve host key if caller didn't supply one (UI never sends the PEM back)
	if cfg.SSHHostKey == "" {
		cfg.SSHHostKey = s.sftp.SSHHostKey
		cfg.SSHHostKeyFingerprint = s.sftp.SSHHostKeyFingerprint
	}
	s.sftp = cfg
}

func (s *Store) RegenerateHostKey() (string, error) {
	keyPEM, fp, err := generateSSHHostKey()
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sftp.SSHHostKey = keyPEM
	s.sftp.SSHHostKeyFingerprint = fp
	return fp, nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func slugify(s string) string {
	s = strings.ToLower(s)
	s = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			return r
		}
		return '-'
	}, s)
	return strings.Trim(s, "-")
}

func generateSSHHostKey() (string, string, error) {
	pk, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return "", "", fmt.Errorf("generate key: %w", err)
	}
	block := &pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(pk)}
	keyPEM := string(pem.EncodeToMemory(block))
	pub, err := ssh.NewPublicKey(&pk.PublicKey)
	if err != nil {
		return "", "", fmt.Errorf("derive public key: %w", err)
	}
	hash := sha256.Sum256(pub.Marshal())
	fp := "SHA256:" + base64.StdEncoding.EncodeToString(hash[:])
	return keyPEM, fp, nil
}
