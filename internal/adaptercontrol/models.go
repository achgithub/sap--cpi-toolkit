package adaptercontrol

import (
	"fmt"
	"time"
)

// Adapter type constants
const (
	TypeREST       = "REST"
	TypeOData      = "OData"
	TypeSOAP       = "SOAP"
	TypeXI         = "XI"
	TypeAS2        = "AS2"
	TypeAS4        = "AS4"
	TypeEDIFACT    = "EDIFACT"
	TypeRESTSender = "REST-SENDER"
	TypeSOAPSender = "SOAP-SENDER"
	TypeXISender   = "XI-SENDER"
)

// AllAdapterTypes is the ordered list shown in the UI add-adapter dialog.
var AllAdapterTypes = []string{
	TypeREST, TypeOData, TypeSOAP, TypeXI,
	TypeAS2, TypeAS4, TypeEDIFACT,
	TypeRESTSender, TypeSOAPSender, TypeXISender,
}

// adapterTypePort maps each adapter type to the Docker-exposed port on localhost.
// One container per type uses PATH_PREFIX_MODE, so many scenario adapters share one port.
var adapterTypePort = map[string]int{
	TypeREST:       9081,
	TypeOData:      9082,
	TypeSOAP:       9083,
	TypeXI:         9084,
	TypeAS2:        9085,
	TypeAS4:        9086,
	TypeEDIFACT:    9087,
	TypeRESTSender: 9088,
	TypeSOAPSender: 9088,
	TypeXISender:   9088,
}

// IngressURL returns the localhost URL a client would call for this adapter.
// Adapters run in PATH_PREFIX_MODE so the adapter ID is the first URL segment.
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
	// Shared HTTP response fields
	StatusCode      int               `json:"status_code"`
	ResponseBody    string            `json:"response_body"`
	ResponseHeaders map[string]string `json:"response_headers"`
	ResponseDelayMs int               `json:"response_delay_ms"`

	// SOAP / XI
	SoapVersion string `json:"soap_version,omitempty"`

	// AS2
	AS2From string `json:"as2_from,omitempty"`
	AS2To   string `json:"as2_to,omitempty"`

	// AS4
	AS4PartyID string `json:"as4_party_id,omitempty"`

	// EDIFACT / X12
	EDIStandard   string `json:"edi_standard,omitempty"`
	EDISenderID   string `json:"edi_sender_id,omitempty"`
	EDIReceiverID string `json:"edi_receiver_id,omitempty"`

	// Sender adapters
	TargetURL       string            `json:"target_url,omitempty"`
	Method          string            `json:"method,omitempty"`
	RequestBody     string            `json:"request_body,omitempty"`
	RequestHeaders  map[string]string `json:"request_headers,omitempty"`
	CSRFEnabled     bool              `json:"csrf_enabled,omitempty"`
	CSRFFetchURL    string            `json:"csrf_fetch_url,omitempty"`
	CSRFFetchMethod string            `json:"csrf_fetch_method,omitempty"`
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

// ── Asset store ───────────────────────────────────────────────────────────────

// Asset is a named payload saved from a tool output for reuse in the mock wizard.
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

// AdapterPollResponse is returned to HTTP adapter containers that call
// GET /adapter-config/{id}. Field names match kymaadapterstub adapter expectations.
type AdapterPollResponse struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	Type            string            `json:"type"`
	BehaviorMode    string            `json:"behavior_mode"`
	StatusCode      int               `json:"status_code"`
	ResponseBody    string            `json:"response_body"`
	ResponseHeaders map[string]string `json:"response_headers"`
	ResponseDelayMs int               `json:"response_delay_ms"`
	Credentials     *Credentials      `json:"credentials"`

	SoapVersion string `json:"soap_version,omitempty"`

	AS2From string `json:"as2_from,omitempty"`
	AS2To   string `json:"as2_to,omitempty"`

	AS4PartyID string `json:"as4_party_id,omitempty"`

	EDIStandard   string `json:"edi_standard,omitempty"`
	EDISenderID   string `json:"edi_sender_id,omitempty"`
	EDIReceiverID string `json:"edi_receiver_id,omitempty"`

	TargetURL       string            `json:"target_url,omitempty"`
	Method          string            `json:"method,omitempty"`
	RequestBody     string            `json:"request_body,omitempty"`
	RequestHeaders  map[string]string `json:"request_headers,omitempty"`
	CSRFEnabled     bool              `json:"csrf_enabled,omitempty"`
	CSRFFetchURL    string            `json:"csrf_fetch_url,omitempty"`
	CSRFFetchMethod string            `json:"csrf_fetch_method,omitempty"`
}

// SFTPPollResponse is returned when the SFTP adapter polls its config.
// Field names match the kymaadapterstub SFTP adapter's AdapterConfig struct.
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
