// ── Domain types shared across adapter-scenarios components ───────────────────

export interface Credentials {
  username: string
  password: string
}

export interface AdapterConfig {
  // Shared HTTP response fields
  status_code: number
  response_body: string
  response_headers: Record<string, string>
  response_delay_ms: number
  // SOAP / XI
  soap_version?: string
  // AS2
  as2_from?: string
  as2_to?: string
  // AS4
  as4_party_id?: string
  // EDIFACT / X12
  edi_standard?: string
  edi_sender_id?: string
  edi_receiver_id?: string
  // Sender adapters
  target_url?: string
  method?: string
  request_body?: string
  request_headers?: Record<string, string>
}

export interface Adapter {
  id: string
  scenario_id: string
  name: string
  type: string
  behavior_mode: string
  config: AdapterConfig
  credentials?: Credentials
  ingress_url: string
  last_activity?: string
  created_at: string
}

export interface Scenario {
  id: string
  name: string
  description: string
  adapters: Adapter[]
  created_at: string
  updated_at: string
}

export interface CPIConnection {
  id: string
  name: string
  url: string
  username?: string
  password?: string
  created_at: string
}

// Used in MockWizard for saved asset selection
export interface WizardAsset {
  id: string
  name: string
  content: string
  content_type: string
}
