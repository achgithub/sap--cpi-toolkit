import type { AdapterConfig } from './types'

// ── Adapter type lists ─────────────────────────────────────────────────────────

// Full list for inline-add / edit forms (shows all types in one dropdown)
export const ADAPTER_TYPES = [
  'REST', 'OData', 'SOAP', 'XI', 'AS2', 'AS4', 'EDIFACT',
  'REST-SENDER', 'SOAP-SENDER', 'XI-SENDER',
]

// Adapter types that call CPI (inbound senders)
export const SENDER_TYPES = new Set(['REST-SENDER', 'SOAP-SENDER', 'XI-SENDER'])

// Wizard-specific splits
export const RECEIVER_TYPES = ['REST', 'OData', 'SOAP', 'XI', 'AS2', 'AS4', 'EDIFACT']
export const SENDER_TYPES_LIST = ['REST-SENDER', 'SOAP-SENDER', 'XI-SENDER']

// localhost port each adapter container exposes
export const ADAPTER_PORT: Record<string, number> = {
  REST: 9081, OData: 9082, SOAP: 9083, XI: 9084,
  AS2: 9085, AS4: 9086, EDIFACT: 9087,
  'REST-SENDER': 9088, 'SOAP-SENDER': 9088, 'XI-SENDER': 9088,
}

// ── Default config ─────────────────────────────────────────────────────────────

export const DEFAULT_CONFIG: AdapterConfig = {
  status_code: 200,
  response_body: '',
  response_headers: {},
  response_delay_ms: 0,
}

// ── Protocol response templates ────────────────────────────────────────────────
// Pre-fill the add-adapter and wizard forms so the mock is valid out of the box.

export const ADAPTER_TEMPLATES: Record<string, { body: string; headers: Record<string, string> }> = {
  SOAP: {
    body: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header/>
  <soap:Body>
    <Response>
      <Status>OK</Status>
    </Response>
  </soap:Body>
</soap:Envelope>`,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  },
  XI: {
    body: `<?xml version="1.0" encoding="UTF-8"?>
<SOAP:Envelope xmlns:SOAP="http://schemas.xmlsoap.org/soap/envelope/" xmlns:SAP-RM="http://sap.com/xi/XI/System/">
  <SOAP:Header>
    <SAP-RM:MessageHeader SOAP:mustUnderstand="0">
      <SAP-RM:Id>stub-response-001</SAP-RM:Id>
    </SAP-RM:MessageHeader>
  </SOAP:Header>
  <SOAP:Body>
    <Response>
      <Status>OK</Status>
    </Response>
  </SOAP:Body>
</SOAP:Envelope>`,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  },
  OData: {
    body: `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices"
      xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
  <title type="text">Entities</title>
  <entry>
    <content type="application/xml">
      <m:properties>
        <d:ID>1</d:ID>
        <d:Name>Sample Entity</d:Name>
      </m:properties>
    </content>
  </entry>
</feed>`,
    headers: { 'Content-Type': 'application/xml', 'OData-Version': '2.0' },
  },
  REST: {
    body: `{"status": "ok"}`,
    headers: { 'Content-Type': 'application/json' },
  },
  AS2: {
    body: ``,
    headers: { 'Content-Type': 'message/disposition-notification', 'AS2-Version': '1.2' },
  },
  AS4: {
    body: `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://www.w3.org/2003/05/soap-envelope">
  <S:Body>
    <eb:SignalMessage xmlns:eb="http://docs.oasis-open.org/ebxml-msg/ebms/v3.0/ns/core/200704/">
      <eb:MessageInfo>
        <eb:Timestamp>2026-01-01T00:00:00Z</eb:Timestamp>
        <eb:MessageId>stub-receipt@example.com</eb:MessageId>
      </eb:MessageInfo>
      <eb:Receipt/>
    </eb:SignalMessage>
  </S:Body>
</S:Envelope>`,
    headers: { 'Content-Type': 'application/soap+xml' },
  },
  EDIFACT: {
    body: `UNB+UNOA:1+RECEIVER:1+SENDER:1+260101:1200+00001'\nUNH+1+APERAK:D:96A:UN'\nBGM+313+ACK001'\nUNT+3+1'\nUNZ+1+00001'`,
    headers: { 'Content-Type': 'application/edifact' },
  },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function templateConfig(type: string): AdapterConfig {
  const t = ADAPTER_TEMPLATES[type]
  const base: AdapterConfig = {
    ...DEFAULT_CONFIG,
    response_body:    t?.body    ?? '',
    response_headers: t?.headers ?? {},
  }
  if (type === 'SOAP' || type === 'XI') base.soap_version = '1.1'
  if (type === 'XI') base.status_code = 202
  if (type === 'AS2') { base.as2_to = 'KYMA_STUB' }
  if (type === 'AS4') { base.as4_party_id = 'KYMA_STUB' }
  if (type === 'EDIFACT') { base.edi_sender_id = 'STUBSND'; base.edi_receiver_id = 'STUBRCV' }
  if (type === 'REST-SENDER' || type === 'SOAP-SENDER' || type === 'XI-SENDER') base.method = 'POST'
  return base
}

export function kvToString(obj: Record<string, string>): string {
  return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join('\n')
}

export function parseKV(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) result[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return result
}

export function wizardPreviewURL(type: string, slug: string): string {
  const port = ADAPTER_PORT[type]
  if (!port || !slug.trim()) return ''
  return `http://localhost:${port}/${slug.trim()}`
}
