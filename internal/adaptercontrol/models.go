package adaptercontrol

import (
	"fmt"
	"time"
)

// Adapter type constants — one mock-http container handles both.
const (
	TypeHTTP = "HTTP"
	TypeSOAP = "SOAP"
)

// AllAdapterTypes is the ordered list shown in the UI add-adapter dialog.
var AllAdapterTypes = []string{TypeHTTP, TypeSOAP}

// adapterTypePort maps each adapter type to the Docker-exposed port on localhost.
var adapterTypePort = map[string]int{
	TypeHTTP: 9080,
	TypeSOAP: 9080,
}

// IngressURL returns the localhost URL a client would call for this adapter.
// The adapter ID is the first URL path segment (PATH_PREFIX_MODE).
func IngressURL(adapterType, adapterID string) string {
	port, ok := adapterTypePort[adapterType]
	if !ok {
		return ""
	}
	return fmt.Sprintf("http://localhost:%d/%s", port, adapterID)
}

// ── Domain types ──────────────────────────────────────────────────────────────

type Scenario struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Adapters    []Adapter `json:"adapters"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Adapter struct {
	ID           string        `json:"id"`
	ScenarioID   string        `json:"scenario_id"`
	Name         string        `json:"name"`
	Type         string        `json:"type"`
	BehaviorMode string        `json:"behavior_mode"` // "success" | "failure"
	Config       AdapterConfig `json:"config"`
	Credentials  *Credentials  `json:"credentials,omitempty"`
	IngressURL   string        `json:"ingress_url"`
	LastActivity *time.Time    `json:"last_activity,omitempty"`
	CreatedAt    time.Time     `json:"created_at"`
}

type Credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type AdapterConfig struct {
	StatusCode      int               `json:"status_code"`
	ResponseBody    string            `json:"response_body"`
	ResponseHeaders map[string]string `json:"response_headers"`
	ResponseDelayMs int               `json:"response_delay_ms"`
	SoapVersion     string            `json:"soap_version,omitempty"` // "1.1" | "1.2"; empty = plain HTTP
}

// SFTPConfig is the standalone SFTP server configuration.
// There is exactly one SFTP instance; it is stored separately from scenarios.
type SFTPConfig struct {
	Credentials           Credentials `json:"credentials"`
	Files                 []SFTPFile  `json:"files"`
	AuthMode              string      `json:"auth_mode"`               // "password" | "key" | "any"
	SSHHostKey            string      `json:"ssh_host_key"`            // PEM RSA private key
	SSHHostKeyFingerprint string      `json:"ssh_host_key_fingerprint"`
	SSHPublicKey          string      `json:"ssh_public_key"`          // authorized_keys format
}

type SFTPFile struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

// SFTPEntry is one item returned by the file-browser API.
type SFTPEntry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`    // absolute within SFTP root, e.g. "/inbound/orders.xml"
	Type    string `json:"type"`    // "file" | "dir"
	Size    int64  `json:"size"`
	ModTime string `json:"mod_time"` // RFC3339
}

// ── CPI Connections ───────────────────────────────────────────────────────────

type CPIConnection struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	URL       string    `json:"url"`
	Username  string    `json:"username,omitempty"`
	Password  string    `json:"password,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateCPIConnectionRequest struct {
	Name     string `json:"name"`
	URL      string `json:"url"`
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
}

type UpdateCPIConnectionRequest struct {
	Name     string `json:"name"`
	URL      string `json:"url"`
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
}

// ── Asset store ───────────────────────────────────────────────────────────────

type Asset struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Content     string    `json:"content"`
	ContentType string    `json:"content_type"` // "xml" | "json" | "edi" | "csv" | "text"
	CreatedAt   time.Time `json:"created_at"`
}

type CreateAssetRequest struct {
	Name        string `json:"name"`
	Content     string `json:"content"`
	ContentType string `json:"content_type"`
}

// ── Request / response types ──────────────────────────────────────────────────

type CreateScenarioRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type UpdateScenarioRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type CreateAdapterRequest struct {
	Name         string        `json:"name"`
	Slug         string        `json:"slug"`          // user-defined URL path segment; used as adapter ID
	Type         string        `json:"type"`
	BehaviorMode string        `json:"behavior_mode"`
	Config       AdapterConfig `json:"config"`
	Credentials  *Credentials  `json:"credentials"`
}

type UpdateAdapterRequest struct {
	Name         string        `json:"name"`
	BehaviorMode string        `json:"behavior_mode"`
	Config       AdapterConfig `json:"config"`
	Credentials  *Credentials  `json:"credentials"`
}

// AdapterPollResponse is returned to the mock-http container when it polls
// GET /adapter-config/{id}.
type AdapterPollResponse struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	Type            string            `json:"type"`
	BehaviorMode    string            `json:"behavior_mode"`
	StatusCode      int               `json:"status_code"`
	ResponseBody    string            `json:"response_body"`
	ResponseHeaders map[string]string `json:"response_headers"`
	ResponseDelayMs int               `json:"response_delay_ms"`
	SoapVersion     string            `json:"soap_version,omitempty"`
	Credentials     *Credentials      `json:"credentials"`
}

// SFTPPollResponse is returned when the SFTP adapter polls its config.
type SFTPPollResponse struct {
	ID                    string       `json:"id"`
	Name                  string       `json:"name"`
	Type                  string       `json:"type"`
	BehaviorMode          string       `json:"behavior_mode"`
	Files                 []SFTPFile   `json:"files"`
	AuthMode              string       `json:"auth_mode"`
	SSHHostKey            string       `json:"ssh_host_key"`
	SSHHostKeyFingerprint string       `json:"ssh_host_key_fingerprint"`
	SSHPublicKey          string       `json:"ssh_public_key"`
	Credentials           *Credentials `json:"credentials"`
}
