package adaptercontrol

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/ssh"
)

const systemLogMaxEntries = 1000

// Store wraps a pgxpool and provides all data operations for adapter-control.
// The system log is kept in memory only (ephemeral, for diagnostics).
type Store struct {
	db        *pgxpool.Pool
	mu        sync.Mutex
	systemLog []string
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{
		db:        db,
		systemLog: []string{},
	}
}

// InitUnassigned ensures the "Unassigned" catch-all scenario exists. Call once on startup.
func (s *Store) InitUnassigned(ctx context.Context) error {
	var count int
	if err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM ac_scenarios WHERE id = 'unassigned'`).Scan(&count); err != nil {
		return fmt.Errorf("check unassigned row: %w", err)
	}
	if count > 0 {
		return nil
	}
	now := time.Now()
	_, err := s.db.Exec(ctx,
		`INSERT INTO ac_scenarios (id, name, description, created_at, updated_at)
		 VALUES ('unassigned', 'Unassigned', 'Catch-all scenario for adapters not yet assigned to a flow', $1, $1)`,
		now)
	return err
}

// InitSFTP ensures the SFTP singleton row exists. Call once on startup.
func (s *Store) InitSFTP(ctx context.Context) error {
	var count int
	if err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM ac_sftp WHERE id = 'default'`).Scan(&count); err != nil {
		return fmt.Errorf("check sftp row: %w", err)
	}
	if count > 0 {
		return nil
	}
	keyPEM, fp, err := generateSSHHostKey()
	if err != nil {
		return fmt.Errorf("generate SSH key: %w", err)
	}
	cfg := SFTPConfig{
		Credentials:           Credentials{Username: "sftpuser", Password: "sftppass"},
		Files:                 []SFTPFile{},
		AuthMode:              "password",
		SSHHostKey:            keyPEM,
		SSHHostKeyFingerprint: fp,
	}
	cfgJSON, _ := json.Marshal(cfg)
	_, err = s.db.Exec(ctx,
		`INSERT INTO ac_sftp (id, config) VALUES ('default', $1) ON CONFLICT DO NOTHING`,
		cfgJSON)
	return err
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
	s.mu.Lock()
	defer s.mu.Unlock()
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
	ctx := context.Background()
	rows, err := s.db.Query(ctx,
		`SELECT id, name, description, created_at, updated_at FROM ac_scenarios ORDER BY created_at`)
	if err != nil {
		return []Scenario{}
	}
	defer rows.Close()

	var scenarios []Scenario
	for rows.Next() {
		var sc Scenario
		if err := rows.Scan(&sc.ID, &sc.Name, &sc.Description, &sc.CreatedAt, &sc.UpdatedAt); err != nil {
			continue
		}
		sc.Adapters = []Adapter{}
		scenarios = append(scenarios, sc)
	}
	if scenarios == nil {
		return []Scenario{}
	}

	// Load adapters and stitch into scenarios
	adapterMap := s.loadAdapterMap(ctx)
	for i := range scenarios {
		if adapters, ok := adapterMap[scenarios[i].ID]; ok {
			scenarios[i].Adapters = adapters
		}
	}
	return scenarios
}

func (s *Store) GetScenario(id string) (*Scenario, error) {
	ctx := context.Background()
	var sc Scenario
	err := s.db.QueryRow(ctx,
		`SELECT id, name, description, created_at, updated_at FROM ac_scenarios WHERE id = $1`, id).
		Scan(&sc.ID, &sc.Name, &sc.Description, &sc.CreatedAt, &sc.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("scenario not found: %s", id)
	}
	sc.Adapters = s.loadAdaptersForScenario(ctx, id)
	return &sc, nil
}

func (s *Store) CreateScenario(req CreateScenarioRequest) (*Scenario, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	ctx := context.Background()
	id := slugify(req.Name) + "-" + fmt.Sprintf("%d", time.Now().UnixMilli())
	now := time.Now()
	_, err := s.db.Exec(ctx,
		`INSERT INTO ac_scenarios (id, name, description, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)`,
		id, req.Name, req.Description, now)
	if err != nil {
		return nil, fmt.Errorf("create scenario: %w", err)
	}
	return &Scenario{
		ID: id, Name: req.Name, Description: req.Description,
		Adapters: []Adapter{}, CreatedAt: now, UpdatedAt: now,
	}, nil
}

func (s *Store) UpdateScenario(id string, req UpdateScenarioRequest) (*Scenario, error) {
	ctx := context.Background()
	now := time.Now()
	tag, err := s.db.Exec(ctx,
		`UPDATE ac_scenarios SET name = COALESCE(NULLIF($2,''), name),
		 description = COALESCE(NULLIF($3,''), description), updated_at = $4
		 WHERE id = $1`,
		id, req.Name, req.Description, now)
	if err != nil || tag.RowsAffected() == 0 {
		return nil, fmt.Errorf("scenario not found: %s", id)
	}
	return s.GetScenario(id)
}

func (s *Store) DeleteScenario(id string) error {
	ctx := context.Background()
	tag, err := s.db.Exec(ctx, `DELETE FROM ac_scenarios WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete scenario: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("scenario not found: %s", id)
	}
	return nil
}

// ── Adapters ──────────────────────────────────────────────────────────────────

func (s *Store) ListAdapters(scenarioID string) ([]Adapter, error) {
	ctx := context.Background()
	var count int
	if err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM ac_scenarios WHERE id = $1`, scenarioID).Scan(&count); err != nil || count == 0 {
		return nil, fmt.Errorf("scenario not found: %s", scenarioID)
	}
	return s.loadAdaptersForScenario(ctx, scenarioID), nil
}

func (s *Store) GetAdapter(scenarioID, adapterID string) (*Adapter, error) {
	ctx := context.Background()
	a, err := s.scanAdapter(ctx, adapterID)
	if err != nil || a.ScenarioID != scenarioID {
		return nil, fmt.Errorf("adapter not found: %s", adapterID)
	}
	return a, nil
}

func (s *Store) CreateAdapter(scenarioID string, req CreateAdapterRequest) (*Adapter, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if req.Type == "" {
		return nil, fmt.Errorf("type is required")
	}
	ctx := context.Background()
	var count int
	if err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM ac_scenarios WHERE id = $1`, scenarioID).Scan(&count); err != nil || count == 0 {
		return nil, fmt.Errorf("scenario not found: %s", scenarioID)
	}

	var id string
	if req.Slug != "" {
		id = slugify(req.Slug)
	} else {
		id = slugify(req.Name) + "-" + fmt.Sprintf("%d", time.Now().UnixMilli())
	}
	bm := req.BehaviorMode
	if bm == "" {
		bm = "success"
	}
	cfg := req.Config
	if cfg.StatusCode == 0 {
		cfg.StatusCode = 200
	}
	if cfg.ResponseHeaders == nil {
		cfg.ResponseHeaders = map[string]string{}
	}

	cfgJSON, _ := json.Marshal(cfg)
	var credJSON []byte
	if req.Credentials != nil {
		credJSON, _ = json.Marshal(req.Credentials)
	}

	ingressURL := IngressURL(req.Type, id)
	now := time.Now()
	_, err := s.db.Exec(ctx,
		`INSERT INTO ac_adapters (id, scenario_id, name, type, behavior_mode, config, credentials, ingress_url, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		id, scenarioID, req.Name, req.Type, bm, cfgJSON, credJSON, ingressURL, now)
	if err != nil {
		return nil, fmt.Errorf("create adapter: %w", err)
	}
	_, _ = s.db.Exec(ctx, `UPDATE ac_scenarios SET updated_at = $2 WHERE id = $1`, scenarioID, now)

	return &Adapter{
		ID: id, ScenarioID: scenarioID, Name: req.Name, Type: req.Type,
		BehaviorMode: bm, Config: cfg, Credentials: req.Credentials,
		IngressURL: ingressURL, CreatedAt: now,
	}, nil
}

func (s *Store) UpdateAdapter(scenarioID, adapterID string, req UpdateAdapterRequest) (*Adapter, error) {
	ctx := context.Background()
	existing, err := s.GetAdapter(scenarioID, adapterID)
	if err != nil {
		return nil, err
	}

	name := req.Name
	if name == "" {
		name = existing.Name
	}
	bm := req.BehaviorMode
	if bm == "" {
		bm = existing.BehaviorMode
	}
	if req.Config.ResponseHeaders == nil {
		req.Config.ResponseHeaders = map[string]string{}
	}

	cfgJSON, _ := json.Marshal(req.Config)
	var credJSON []byte
	if req.Credentials != nil {
		credJSON, _ = json.Marshal(req.Credentials)
	}

	now := time.Now()
	_, err = s.db.Exec(ctx,
		`UPDATE ac_adapters SET name = $2, behavior_mode = $3, config = $4, credentials = $5 WHERE id = $1`,
		adapterID, name, bm, cfgJSON, credJSON)
	if err != nil {
		return nil, fmt.Errorf("update adapter: %w", err)
	}
	_, _ = s.db.Exec(ctx, `UPDATE ac_scenarios SET updated_at = $2 WHERE id = $1`, scenarioID, now)

	return s.scanAdapter(ctx, adapterID)
}

func (s *Store) DeleteAdapter(scenarioID, adapterID string) error {
	ctx := context.Background()
	tag, err := s.db.Exec(ctx,
		`DELETE FROM ac_adapters WHERE id = $1 AND scenario_id = $2`, adapterID, scenarioID)
	if err != nil {
		return fmt.Errorf("delete adapter: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("adapter not found: %s", adapterID)
	}
	now := time.Now()
	_, _ = s.db.Exec(ctx, `UPDATE ac_scenarios SET updated_at = $2 WHERE id = $1`, scenarioID, now)
	return nil
}

// GetAdapterByID looks up any adapter by ID (used by adapter container polling).
func (s *Store) GetAdapterByID(adapterID string) (*Adapter, bool) {
	ctx := context.Background()
	a, err := s.scanAdapter(ctx, adapterID)
	if err != nil {
		return nil, false
	}
	return a, true
}

// RecordActivity updates last_activity for an adapter (fire-and-forget).
func (s *Store) RecordActivity(adapterID string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		s.db.Exec(ctx, `UPDATE ac_adapters SET last_activity = NOW() WHERE id = $1`, adapterID) //nolint:errcheck
	}()
}

// ── SFTP ──────────────────────────────────────────────────────────────────────

func (s *Store) GetSFTP() SFTPConfig {
	ctx := context.Background()
	var cfgJSON []byte
	if err := s.db.QueryRow(ctx, `SELECT config FROM ac_sftp WHERE id = 'default'`).Scan(&cfgJSON); err != nil {
		return SFTPConfig{}
	}
	var cfg SFTPConfig
	json.Unmarshal(cfgJSON, &cfg) //nolint:errcheck
	return cfg
}

func (s *Store) UpdateSFTP(cfg SFTPConfig) {
	ctx := context.Background()
	// Preserve the host key if the caller didn't supply one (UI never sends PEM back)
	if cfg.SSHHostKey == "" {
		existing := s.GetSFTP()
		cfg.SSHHostKey = existing.SSHHostKey
		cfg.SSHHostKeyFingerprint = existing.SSHHostKeyFingerprint
	}
	cfgJSON, _ := json.Marshal(cfg)
	s.db.Exec(ctx, //nolint:errcheck
		`INSERT INTO ac_sftp (id, config) VALUES ('default', $1)
		 ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config`,
		cfgJSON)
}

func (s *Store) RegenerateHostKey() (string, error) {
	keyPEM, fp, err := generateSSHHostKey()
	if err != nil {
		return "", err
	}
	cfg := s.GetSFTP()
	cfg.SSHHostKey = keyPEM
	cfg.SSHHostKeyFingerprint = fp
	s.UpdateSFTP(cfg)
	return fp, nil
}

// ── Assets ────────────────────────────────────────────────────────────────────

func (s *Store) ListAssets() []Asset {
	ctx := context.Background()
	rows, err := s.db.Query(ctx,
		`SELECT id, name, content, content_type, created_at FROM ac_assets ORDER BY created_at DESC`)
	if err != nil {
		return []Asset{}
	}
	defer rows.Close()
	var assets []Asset
	for rows.Next() {
		var a Asset
		if err := rows.Scan(&a.ID, &a.Name, &a.Content, &a.ContentType, &a.CreatedAt); err == nil {
			assets = append(assets, a)
		}
	}
	if assets == nil {
		return []Asset{}
	}
	return assets
}

func (s *Store) CreateAsset(req CreateAssetRequest) (*Asset, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if req.Content == "" {
		return nil, fmt.Errorf("content is required")
	}
	ct := req.ContentType
	if ct == "" {
		ct = "text"
	}
	ctx := context.Background()
	id := slugify(req.Name) + "-" + fmt.Sprintf("%d", time.Now().UnixMilli())
	now := time.Now()
	_, err := s.db.Exec(ctx,
		`INSERT INTO ac_assets (id, name, content, content_type, created_at) VALUES ($1, $2, $3, $4, $5)`,
		id, req.Name, req.Content, ct, now)
	if err != nil {
		return nil, fmt.Errorf("create asset: %w", err)
	}
	return &Asset{ID: id, Name: req.Name, Content: req.Content, ContentType: ct, CreatedAt: now}, nil
}

func (s *Store) GetAsset(id string) (*Asset, error) {
	ctx := context.Background()
	var a Asset
	err := s.db.QueryRow(ctx,
		`SELECT id, name, content, content_type, created_at FROM ac_assets WHERE id = $1`, id).
		Scan(&a.ID, &a.Name, &a.Content, &a.ContentType, &a.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("asset not found: %s", id)
	}
	return &a, nil
}

func (s *Store) DeleteAsset(id string) error {
	ctx := context.Background()
	tag, err := s.db.Exec(ctx, `DELETE FROM ac_assets WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete asset: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("asset not found: %s", id)
	}
	return nil
}

// ── CPI Connections ───────────────────────────────────────────────────────────

func (s *Store) ListConnections() []CPIConnection {
	ctx := context.Background()
	rows, err := s.db.Query(ctx,
		`SELECT id, name, url, username, password, created_at FROM ac_connections ORDER BY created_at`)
	if err != nil {
		return []CPIConnection{}
	}
	defer rows.Close()
	var conns []CPIConnection
	for rows.Next() {
		var c CPIConnection
		if err := rows.Scan(&c.ID, &c.Name, &c.URL, &c.Username, &c.Password, &c.CreatedAt); err == nil {
			conns = append(conns, c)
		}
	}
	if conns == nil {
		return []CPIConnection{}
	}
	return conns
}

func (s *Store) CreateConnection(req CreateCPIConnectionRequest) (*CPIConnection, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if req.URL == "" {
		return nil, fmt.Errorf("url is required")
	}
	ctx := context.Background()
	id := slugify(req.Name) + "-" + fmt.Sprintf("%d", time.Now().UnixMilli())
	now := time.Now()
	_, err := s.db.Exec(ctx,
		`INSERT INTO ac_connections (id, name, url, username, password, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
		id, req.Name, req.URL, req.Username, req.Password, now)
	if err != nil {
		return nil, fmt.Errorf("create connection: %w", err)
	}
	return &CPIConnection{ID: id, Name: req.Name, URL: req.URL,
		Username: req.Username, Password: req.Password, CreatedAt: now}, nil
}

func (s *Store) UpdateConnection(id string, req UpdateCPIConnectionRequest) (*CPIConnection, error) {
	ctx := context.Background()
	tag, err := s.db.Exec(ctx,
		`UPDATE ac_connections SET name = $2, url = $3, username = $4, password = $5 WHERE id = $1`,
		id, req.Name, req.URL, req.Username, req.Password)
	if err != nil || tag.RowsAffected() == 0 {
		return nil, fmt.Errorf("connection not found: %s", id)
	}
	var c CPIConnection
	s.db.QueryRow(ctx, //nolint:errcheck
		`SELECT id, name, url, username, password, created_at FROM ac_connections WHERE id = $1`, id).
		Scan(&c.ID, &c.Name, &c.URL, &c.Username, &c.Password, &c.CreatedAt)
	return &c, nil
}

func (s *Store) DeleteConnection(id string) error {
	ctx := context.Background()
	tag, err := s.db.Exec(ctx, `DELETE FROM ac_connections WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete connection: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("connection not found: %s", id)
	}
	return nil
}

// ── Internal helpers ──────────────────────────────────────────────────────────

// scanAdapter loads a single adapter row by ID including JSON columns.
func (s *Store) scanAdapter(ctx context.Context, id string) (*Adapter, error) {
	var a Adapter
	var cfgJSON []byte
	var credJSON []byte
	err := s.db.QueryRow(ctx,
		`SELECT id, scenario_id, name, type, behavior_mode, config, credentials, ingress_url, last_activity, created_at
		 FROM ac_adapters WHERE id = $1`, id).
		Scan(&a.ID, &a.ScenarioID, &a.Name, &a.Type, &a.BehaviorMode,
			&cfgJSON, &credJSON, &a.IngressURL, &a.LastActivity, &a.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("adapter not found: %s", id)
	}
	json.Unmarshal(cfgJSON, &a.Config)   //nolint:errcheck
	if credJSON != nil {
		var cred Credentials
		if err := json.Unmarshal(credJSON, &cred); err == nil {
			a.Credentials = &cred
		}
	}
	return &a, nil
}

// loadAdaptersForScenario returns all adapters for one scenario.
func (s *Store) loadAdaptersForScenario(ctx context.Context, scenarioID string) []Adapter {
	rows, err := s.db.Query(ctx,
		`SELECT id, scenario_id, name, type, behavior_mode, config, credentials, ingress_url, last_activity, created_at
		 FROM ac_adapters WHERE scenario_id = $1 ORDER BY created_at`, scenarioID)
	if err != nil {
		return []Adapter{}
	}
	defer rows.Close()
	return scanAdapterRows(rows)
}

// loadAdapterMap returns all adapters grouped by scenario ID.
func (s *Store) loadAdapterMap(ctx context.Context) map[string][]Adapter {
	rows, err := s.db.Query(ctx,
		`SELECT id, scenario_id, name, type, behavior_mode, config, credentials, ingress_url, last_activity, created_at
		 FROM ac_adapters ORDER BY created_at`)
	if err != nil {
		return map[string][]Adapter{}
	}
	defer rows.Close()
	adapters := scanAdapterRows(rows)
	result := map[string][]Adapter{}
	for _, a := range adapters {
		result[a.ScenarioID] = append(result[a.ScenarioID], a)
	}
	return result
}

func scanAdapterRows(rows interface{ Next() bool; Scan(...any) error; Close() }) []Adapter {
	var adapters []Adapter
	for rows.Next() {
		var a Adapter
		var cfgJSON, credJSON []byte
		if err := rows.Scan(&a.ID, &a.ScenarioID, &a.Name, &a.Type, &a.BehaviorMode,
			&cfgJSON, &credJSON, &a.IngressURL, &a.LastActivity, &a.CreatedAt); err != nil {
			continue
		}
		json.Unmarshal(cfgJSON, &a.Config) //nolint:errcheck
		if credJSON != nil {
			var cred Credentials
			if err := json.Unmarshal(credJSON, &cred); err == nil {
				a.Credentials = &cred
			}
		}
		adapters = append(adapters, a)
	}
	if adapters == nil {
		return []Adapter{}
	}
	return adapters
}

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
