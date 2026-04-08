import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Card,
  CardHeader,
  FlexBox,
  FlexBoxDirection,
  Input,
  Label,
  MessageStrip,
  Select,
  Option,
  TextArea,
  Toolbar,
  ToolbarSpacer,
} from '@ui5/webcomponents-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Credentials { username: string; password: string }

interface AdapterConfig {
  status_code: number
  response_body: string
  response_headers: Record<string, string>
  response_delay_ms: number
  soap_version?: string
  as2_from?: string
  as2_to?: string
  as4_party_id?: string
  edi_standard?: string
  edi_sender_id?: string
  edi_receiver_id?: string
  target_url?: string
  method?: string
  request_body?: string
  request_headers?: Record<string, string>
}

interface Adapter {
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

interface Scenario {
  id: string
  name: string
  description: string
  adapters: Adapter[]
  created_at: string
  updated_at: string
}

// ── CPI Connection types ──────────────────────────────────────────────────────

interface CPIConnection {
  id: string
  name: string
  url: string
  username?: string
  password?: string
  created_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ADAPTER_TYPES = [
  'REST', 'OData', 'SOAP', 'XI', 'AS2', 'AS4', 'EDIFACT',
  'REST-SENDER', 'SOAP-SENDER', 'XI-SENDER',
]

// Adapter types that act as senders (they call CPI, not the other way around)
const SENDER_TYPES = new Set(['REST-SENDER', 'SOAP-SENDER', 'XI-SENDER'])

const DEFAULT_CONFIG: AdapterConfig = {
  status_code: 200,
  response_body: '',
  response_headers: {},
  response_delay_ms: 0,
}

// Protocol-specific default response bodies and headers.
// Used to pre-fill the add-adapter and wizard forms so the mock is valid out of the box.
const ADAPTER_TEMPLATES: Record<string, { body: string; headers: Record<string, string> }> = {
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

function templateConfig(type: string): AdapterConfig {
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

function kvToString(obj: Record<string, string>): string {
  return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join('\n')
}

function parseKV(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) result[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return result
}

// ── API ───────────────────────────────────────────────────────────────────────

const API = '/api/adapter'

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(API + path, opts)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || res.statusText)
  }
  if (res.status === 204) return null
  return res.json()
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdapterScenarios() {
  const [scenarios,   setScenarios]   = useState<Scenario[]>([])
  const [error,       setError]       = useState('')
  const [showWizard,  setShowWizard]  = useState(false)

  // New scenario form
  const [showCreate, setShowCreate] = useState(false)
  const [newName,    setNewName]    = useState('')
  const [newDesc,    setNewDesc]    = useState('')
  const [creating,   setCreating]   = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const data: Scenario[] = await apiFetch('/scenarios')
      setScenarios(data ?? [])
    } catch (e: any) { setError(e.message) }
  }, [])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const createScenario = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await apiFetch('/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      })
      setShowCreate(false); setNewName(''); setNewDesc('')
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setCreating(false) }
  }

  const deleteScenario = async (id: string) => {
    if (!window.confirm('Delete this scenario and all its adapters?')) return
    try {
      await apiFetch('/scenarios/' + id, { method: 'DELETE' })
      await load()
    } catch (e: any) { setError(e.message) }
  }

  if (showWizard) {
    return <MockWizard
      onDone={() => { setShowWizard(false); load() }}
      setError={setError}
    />
  }

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
      {error && <MessageStrip design="Negative" onClose={() => setError('')}>{error}</MessageStrip>}

      <Toolbar>
        <Label style={{ fontSize: '1.25rem', fontWeight: 600 }}>Adapter Scenarios</Label>
        <ToolbarSpacer />
        <Button design="Transparent" icon="refresh" onClick={load} />
        <Button design="Default" icon="overlay" onClick={() => setShowWizard(true)}>New Mock</Button>
        <Button design="Emphasized" icon="add" onClick={() => setShowCreate(v => !v)}>New Scenario</Button>
      </Toolbar>

      {showCreate && (
        <Card header={<CardHeader titleText="New Scenario" />}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem', padding: '1rem' }}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label required>Name</Label>
              <Input value={newName} onInput={(e: any) => setNewName(e.target.value)}
                placeholder="e.g. Payment Processing" style={{ width: '100%' }} />
            </FlexBox>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label>Description</Label>
              <TextArea value={newDesc} onInput={(e: any) => setNewDesc(e.target.value)}
                rows={2} style={{ width: '100%' }} />
            </FlexBox>
            <FlexBox style={{ gap: '0.5rem' }}>
              <Button onClick={() => { setShowCreate(false); setNewName(''); setNewDesc('') }}>Cancel</Button>
              <Button design="Emphasized" onClick={createScenario} disabled={creating || !newName.trim()}>
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </FlexBox>
          </FlexBox>
        </Card>
      )}

      {scenarios.length === 0 && !showCreate && (
        <MessageStrip design="Information" hideCloseButton>
          No scenarios yet. Create one to start configuring mock adapters.
        </MessageStrip>
      )}

      <CPIConnections setError={setError} />

      {scenarios.map(sc => (
        <ScenarioRow
          key={sc.id}
          scenario={sc}
          onDelete={() => deleteScenario(sc.id)}
          onRefresh={load}
          setError={setError}
        />
      ))}
    </FlexBox>
  )
}

// ── CPI Connections ───────────────────────────────────────────────────────────

function CPIConnections({ setError }: { setError: (e: string) => void }) {
  const [connections, setConnections] = useState<CPIConnection[]>([])
  const [expanded,    setExpanded]    = useState(false)
  const [showAdd,     setShowAdd]     = useState(false)
  const [name,        setName]        = useState('')
  const [url,         setUrl]         = useState('')
  const [username,    setUsername]    = useState('')
  const [password,    setPassword]    = useState('')
  const [saving,      setSaving]      = useState(false)

  const load = useCallback(async () => {
    try {
      const data: CPIConnection[] = await apiFetch('/connections')
      setConnections((data ?? []).sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ))
    } catch (e: any) { setError(e.message) }
  }, [setError])

  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!name.trim() || !url.trim()) return
    setSaving(true)
    try {
      await apiFetch('/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), url: url.trim(), username: username.trim(), password }),
      })
      setShowAdd(false); setName(''); setUrl(''); setUsername(''); setPassword('')
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Remove this connection?')) return
    try {
      await apiFetch('/connections/' + id, { method: 'DELETE' })
      await load()
    } catch (e: any) { setError(e.message) }
  }

  return (
    <Card>
      <FlexBox style={{ padding: '0.75rem 1rem', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}>
        <span style={{ fontSize: '0.9rem', color: 'var(--sapContent_IconColor)' }}>
          {expanded ? '▾' : '▸'}
        </span>
        <FlexBox direction={FlexBoxDirection.Column} style={{ flex: 1, gap: '0.1rem' }}>
          <span style={{ fontWeight: 600, fontSize: '1rem' }}>CPI Connections</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
            {connections.length === 0
              ? 'No connections — add your CPI tenant URLs'
              : connections.map(c => c.name).join(', ')}
          </span>
        </FlexBox>
        <FlexBox style={{ gap: '0.25rem' }} onClick={(e) => e.stopPropagation()}>
          <Button design="Transparent" icon="add" onClick={() => { setExpanded(true); setShowAdd(v => !v) }} />
        </FlexBox>
      </FlexBox>

      {expanded && (
        <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '0 1rem 1rem', gap: '0.75rem' }}>

          {/* Existing connections */}
          {connections.map(c => (
            <FlexBox key={c.id} style={{
              alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem',
              background: 'var(--sapField_Background)', border: '1px solid var(--sapField_BorderColor)',
              borderRadius: '4px',
            }}>
              <FlexBox direction={FlexBoxDirection.Column} style={{ flex: 1, gap: '0.1rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.name}</span>
                <code style={{ fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)', wordBreak: 'break-all' }}>
                  {c.url}
                </code>
                {c.username && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)' }}>
                    User: {c.username}
                  </span>
                )}
              </FlexBox>
              <Button design="Transparent" icon="copy"
                onClick={() => navigator.clipboard.writeText(c.url).catch(() => {})} />
              <Button design="Transparent" icon="delete" onClick={() => remove(c.id)} />
            </FlexBox>
          ))}

          {connections.length === 0 && !showAdd && (
            <MessageStrip design="Information" hideCloseButton>
              Add your CPI tenant URLs here to use them in the mock wizard.
            </MessageStrip>
          )}

          {/* Add form */}
          {showAdd && (
            <Card header={<CardHeader titleText="Add CPI Connection" />}>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem', padding: '1rem' }}>
                <FlexBox style={{ gap: '1rem' }}>
                  <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
                    <Label required>Name</Label>
                    <Input value={name} onInput={(e: any) => setName(e.target.value)}
                      placeholder="e.g. CPI Dev" style={{ width: '100%' }} />
                  </FlexBox>
                  <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 2 }}>
                    <Label required>URL</Label>
                    <Input value={url} onInput={(e: any) => setUrl(e.target.value)}
                      placeholder="https://my-tenant.hana.ondemand.com" style={{ width: '100%' }} />
                  </FlexBox>
                </FlexBox>
                <FlexBox style={{ gap: '1rem' }}>
                  <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
                    <Label>Username</Label>
                    <Input value={username} onInput={(e: any) => setUsername(e.target.value)}
                      placeholder="Optional" style={{ width: '100%' }} />
                  </FlexBox>
                  <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
                    <Label>Password</Label>
                    <Input type="Password" value={password} onInput={(e: any) => setPassword(e.target.value)}
                      placeholder="Optional" style={{ width: '100%' }} />
                  </FlexBox>
                </FlexBox>
                <FlexBox style={{ gap: '0.5rem' }}>
                  <Button onClick={() => { setShowAdd(false); setName(''); setUrl('') }}>Cancel</Button>
                  <Button design="Emphasized" onClick={add}
                    disabled={saving || !name.trim() || !url.trim()}>
                    {saving ? 'Saving…' : 'Add'}
                  </Button>
                </FlexBox>
              </FlexBox>
            </Card>
          )}
        </FlexBox>
      )}
    </Card>
  )
}

// ── Scenario row (inline expand) ──────────────────────────────────────────────

function ScenarioRow({ scenario, onDelete, onRefresh, setError }: {
  scenario: Scenario
  onDelete: () => void
  onRefresh: () => void
  setError: (e: string) => void
}) {
  const [expanded,     setExpanded]     = useState(false)
  const [showAdd,      setShowAdd]      = useState(false)
  const [adapterName,  setAdapterName]  = useState('')
  const [adapterType,  setAdapterType]  = useState('REST')
  const [adapterMode,  setAdapterMode]  = useState('success')
  const [adapterConfig, setAdapterConfig] = useState<AdapterConfig>(templateConfig('REST'))
  const [adapterUser,  setAdapterUser]  = useState('')
  const [adapterPass,  setAdapterPass]  = useState('')
  const [adding,       setAdding]       = useState(false)

  const changeAdapterType = (t: string) => {
    setAdapterType(t)
    setAdapterConfig(templateConfig(t))
  }

  const addAdapter = async () => {
    if (!adapterName.trim()) return
    setAdding(true)
    try {
      const body: any = {
        name: adapterName.trim(), type: adapterType,
        behavior_mode: adapterMode, config: adapterConfig,
      }
      if (adapterUser) body.credentials = { username: adapterUser, password: adapterPass }
      await apiFetch('/scenarios/' + scenario.id + '/adapters', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      setShowAdd(false); setAdapterName(''); setAdapterUser(''); setAdapterPass('')
      setAdapterConfig(templateConfig('REST')); setAdapterType('REST')
      await onRefresh()
    } catch (e: any) { setError(e.message) }
    finally { setAdding(false) }
  }

  const deleteAdapter = async (adapterId: string) => {
    if (!window.confirm('Remove this adapter?')) return
    try {
      await apiFetch('/scenarios/' + scenario.id + '/adapters/' + adapterId, { method: 'DELETE' })
      await onRefresh()
    } catch (e: any) { setError(e.message) }
  }

  const toggleBehavior = async (a: Adapter) => {
    const newMode = a.behavior_mode === 'success' ? 'failure' : 'success'
    try {
      await apiFetch('/scenarios/' + scenario.id + '/adapters/' + a.id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: a.name, behavior_mode: newMode, config: a.config, credentials: a.credentials }),
      })
      await onRefresh()
    } catch (e: any) { setError(e.message) }
  }

  const adapterCount = scenario.adapters.length

  return (
    <Card>
      {/* ── Header row ── */}
      <FlexBox style={{ padding: '0.75rem 1rem', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}>
        <span style={{ fontSize: '0.9rem', color: 'var(--sapContent_IconColor)' }}>
          {expanded ? '▾' : '▸'}
        </span>
        <FlexBox direction={FlexBoxDirection.Column} style={{ flex: 1, gap: '0.1rem' }}>
          <span style={{ fontWeight: 600, fontSize: '1rem' }}>{scenario.name}</span>
          {scenario.description && (
            <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>{scenario.description}</span>
          )}
        </FlexBox>
        {/* Adapter type badges */}
        <FlexBox style={{ gap: '0.25rem', flexWrap: 'wrap' }}>
          {scenario.adapters.map(a => (
            <span key={a.id} style={{
              background: a.behavior_mode === 'failure' ? 'var(--sapErrorColor)' : 'var(--sapSuccessColor)',
              color: '#fff', borderRadius: '0.75rem', padding: '0.1rem 0.5rem', fontSize: '0.72rem', fontWeight: 600,
            }}>{a.type}</span>
          ))}
          {adapterCount === 0 && (
            <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>No adapters</span>
          )}
        </FlexBox>
        {/* Actions — stop propagation so clicks don't toggle expand */}
        <FlexBox style={{ gap: '0.25rem' }} onClick={(e) => e.stopPropagation()}>
          <Button design="Transparent" icon="add" onClick={() => { setExpanded(true); setShowAdd(v => !v) }} />
          <Button design="Transparent" icon="delete" onClick={onDelete} />
        </FlexBox>
      </FlexBox>

      {/* ── Expanded content ── */}
      {expanded && (
        <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '0 1rem 1rem', gap: '0.75rem' }}>

          {/* Add adapter form */}
          {showAdd && (
            <Card header={<CardHeader titleText="Add Adapter" />}>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem', padding: '1rem' }}>
                <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                  <Label required>Name</Label>
                  <Input value={adapterName} onInput={(e: any) => setAdapterName(e.target.value)}
                    placeholder="e.g. Payment API" style={{ width: '100%' }} />
                </FlexBox>
                <FlexBox style={{ gap: '1rem' }}>
                  <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
                    <Label>Type</Label>
                    <Select style={{ width: '100%' }} onChange={(e: any) => changeAdapterType(e.detail.selectedOption.value)}>
                      {ADAPTER_TYPES.map(t => <Option key={t} value={t} selected={t === adapterType}>{t}{SENDER_TYPES.has(t) ? ' ↑' : ' ↓'}</Option>)}
                    </Select>
                  </FlexBox>
                  <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
                    <Label>Behaviour</Label>
                    <Select style={{ width: '100%' }} onChange={(e: any) => setAdapterMode(e.detail.selectedOption.value)}>
                      <Option value="success" selected={adapterMode === 'success'}>Success</Option>
                      <Option value="failure" selected={adapterMode === 'failure'}>Failure</Option>
                    </Select>
                  </FlexBox>
                </FlexBox>

                <AdapterConfigForm type={adapterType} config={adapterConfig} onChange={setAdapterConfig} />

                <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                  <Label>Inbound Auth (optional)</Label>
                  <FlexBox style={{ gap: '0.5rem' }}>
                    <Input value={adapterUser} onInput={(e: any) => setAdapterUser(e.target.value)}
                      placeholder="Username" style={{ flex: 1 }} />
                    <Input type="Password" value={adapterPass} onInput={(e: any) => setAdapterPass(e.target.value)}
                      placeholder="Password" style={{ flex: 1 }} />
                  </FlexBox>
                </FlexBox>

                <FlexBox style={{ gap: '0.5rem' }}>
                  <Button onClick={() => { setShowAdd(false); setAdapterName('') }}>Cancel</Button>
                  <Button design="Emphasized" onClick={addAdapter} disabled={adding || !adapterName.trim()}>
                    {adding ? 'Adding…' : 'Add'}
                  </Button>
                </FlexBox>
              </FlexBox>
            </Card>
          )}

          {scenario.adapters.length === 0 && !showAdd && (
            <MessageStrip design="Information" hideCloseButton>
              No adapters yet. Click + to add one.
            </MessageStrip>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '0.75rem' }}>
            {scenario.adapters.map(a => (
              <AdapterCard key={a.id} adapter={a} scenarioId={scenario.id}
                onDelete={() => deleteAdapter(a.id)}
                onToggleBehavior={() => toggleBehavior(a)}
                onRefresh={onRefresh}
                setError={setError} />
            ))}
          </div>
        </FlexBox>
      )}
    </Card>
  )
}

// ── Adapter card ──────────────────────────────────────────────────────────────

function AdapterCard({ adapter, scenarioId, onDelete, onToggleBehavior, onRefresh, setError }: {
  adapter: Adapter
  scenarioId: string
  onDelete: () => void
  onToggleBehavior: () => void
  onRefresh: () => void
  setError: (e: string) => void
}) {
  const [editing,     setEditing]     = useState(false)
  const [editName,    setEditName]    = useState(adapter.name)
  const [editMode,    setEditMode]    = useState(adapter.behavior_mode)
  const [editConfig,  setEditConfig]  = useState<AdapterConfig>(adapter.config)
  const [editUser,    setEditUser]    = useState(adapter.credentials?.username ?? '')
  const [editPass,    setEditPass]    = useState(adapter.credentials?.password ?? '')
  const [saving,      setSaving]      = useState(false)

  const openEdit = () => {
    setEditName(adapter.name)
    setEditMode(adapter.behavior_mode)
    setEditConfig(adapter.config)
    setEditUser(adapter.credentials?.username ?? '')
    setEditPass(adapter.credentials?.password ?? '')
    setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const body: any = { name: editName.trim(), behavior_mode: editMode, config: editConfig }
      if (editUser) body.credentials = { username: editUser, password: editPass }
      else body.credentials = null
      await apiFetch('/scenarios/' + scenarioId + '/adapters/' + adapter.id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      setEditing(false)
      await onRefresh()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const isFailure = adapter.behavior_mode === 'failure'
  const isSender  = SENDER_TYPES.has(adapter.type)

  if (editing) {
    return (
      <Card header={<CardHeader titleText={`Edit — ${adapter.name}`} subtitleText={adapter.type} />}>
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem', padding: '1rem' }}>
          <FlexBox style={{ gap: '1rem' }}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 2 }}>
              <Label>Name</Label>
              <Input value={editName} onInput={(e: any) => setEditName(e.target.value)} style={{ width: '100%' }} />
            </FlexBox>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
              <Label>Behaviour</Label>
              <Select style={{ width: '100%' }} onChange={(e: any) => setEditMode(e.detail.selectedOption.value)}>
                <Option value="success" selected={editMode === 'success'}>Success</Option>
                <Option value="failure" selected={editMode === 'failure'}>Failure</Option>
              </Select>
            </FlexBox>
          </FlexBox>
          <AdapterConfigForm type={adapter.type} config={editConfig} onChange={setEditConfig} />
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Inbound Auth (optional)</Label>
            <FlexBox style={{ gap: '0.5rem' }}>
              <Input value={editUser} onInput={(e: any) => setEditUser(e.target.value)}
                placeholder="Username" style={{ flex: 1 }} />
              <Input type="Password" value={editPass} onInput={(e: any) => setEditPass(e.target.value)}
                placeholder="Password" style={{ flex: 1 }} />
            </FlexBox>
          </FlexBox>
          <FlexBox style={{ gap: '0.5rem' }}>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            <Button design="Emphasized" onClick={save} disabled={saving || !editName.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </FlexBox>
        </FlexBox>
      </Card>
    )
  }

  return (
    <Card header={
      <CardHeader
        titleText={adapter.name}
        subtitleText={`${adapter.type} ${isSender ? '↑ Outbound' : '↓ Inbound'}`}
        action={
          <FlexBox style={{ gap: '0.25rem' }}>
            <Button design={isFailure ? 'Attention' : 'Default'} onClick={onToggleBehavior}>
              {isFailure ? 'Failure' : 'Success'}
            </Button>
            <Button design="Transparent" icon="edit" onClick={openEdit} />
            <Button design="Transparent" icon="delete" onClick={onDelete} />
          </FlexBox>
        }
      />
    }>
      <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.5rem', padding: '0.75rem 1rem 1rem' }}>
        <Label style={{ fontWeight: 600 }}>Endpoint URL</Label>
        <FlexBox style={{ gap: '0.5rem', alignItems: 'center' }}>
          <code style={{
            flex: 1, background: 'var(--sapField_Background)', border: '1px solid var(--sapField_BorderColor)',
            borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.8rem', wordBreak: 'break-all',
          }}>
            {adapter.ingress_url || '—'}
          </code>
          {adapter.ingress_url && (
            <Button design="Transparent" icon="copy"
              onClick={() => navigator.clipboard.writeText(adapter.ingress_url).catch(() => {})} />
          )}
        </FlexBox>
        <FlexBox style={{ gap: '1rem', fontSize: '0.875rem' }}>
          {adapter.config.status_code > 0 && <span>Status: <b>{adapter.config.status_code}</b></span>}
          {adapter.config.response_delay_ms > 0 && <span>Delay: {adapter.config.response_delay_ms}ms</span>}
          {Object.keys(adapter.config.response_headers ?? {}).length > 0 && (
            <span>{Object.keys(adapter.config.response_headers).length} header{Object.keys(adapter.config.response_headers).length !== 1 ? 's' : ''}</span>
          )}
        </FlexBox>
        {adapter.config.response_body && (
          <div style={{
            fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)',
            maxHeight: '3rem', overflow: 'hidden', whiteSpace: 'pre',
          }}>
            {adapter.config.response_body.slice(0, 200)}
          </div>
        )}
        {adapter.last_activity && (
          <Label style={{ fontSize: '0.78rem' }}>Last hit: {new Date(adapter.last_activity).toLocaleTimeString()}</Label>
        )}
      </FlexBox>
    </Card>
  )
}

// ── Adapter config form ───────────────────────────────────────────────────────

function AdapterConfigForm({ type, config, onChange }: {
  type: string; config: AdapterConfig; onChange: (c: AdapterConfig) => void
}) {
  const set = (patch: Partial<AdapterConfig>) => onChange({ ...config, ...patch })
  const isSender = type.endsWith('-SENDER')
  const headersRaw = kvToString(config.response_headers ?? {})

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem' }}>
      {isSender ? (
        <>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Target URL</Label>
            <Input value={config.target_url ?? ''} onInput={(e: any) => set({ target_url: e.target.value })}
              placeholder="https://..." style={{ width: '100%' }} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>HTTP Method</Label>
            <Select style={{ width: '100%' }} onChange={(e: any) => set({ method: e.detail.selectedOption.value })}>
              {['POST', 'PUT', 'GET', 'PATCH'].map(m =>
                <Option key={m} value={m} selected={config.method === m}>{m}</Option>)}
            </Select>
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Request Body</Label>
            <TextArea value={config.request_body ?? ''} onInput={(e: any) => set({ request_body: e.target.value })}
              rows={3} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Request Headers <span style={{ color: 'var(--sapContent_LabelColor)', fontWeight: 400 }}>(Key: Value, one per line)</span></Label>
            <TextArea
              value={kvToString(config.request_headers ?? {})}
              rows={3}
              placeholder="Content-Type: application/xml"
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
              onInput={(e: any) => set({ request_headers: parseKV(e.target.value) })}
            />
          </FlexBox>
        </>
      ) : (
        <>
          <FlexBox style={{ gap: '0.5rem' }}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
              <Label>Response Status</Label>
              <Input type="Number" value={String(config.status_code)}
                onInput={(e: any) => set({ status_code: Number(e.target.value) })} style={{ width: '100%' }} />
            </FlexBox>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
              <Label>Delay (ms)</Label>
              <Input type="Number" value={String(config.response_delay_ms)}
                onInput={(e: any) => set({ response_delay_ms: Number(e.target.value) })} style={{ width: '100%' }} />
            </FlexBox>
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Response Headers <span style={{ color: 'var(--sapContent_LabelColor)', fontWeight: 400 }}>(Key: Value, one per line)</span></Label>
            <TextArea
              value={headersRaw}
              rows={3}
              placeholder="Content-Type: application/json"
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
              onInput={(e: any) => set({ response_headers: parseKV(e.target.value) })}
            />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Response Body</Label>
            <TextArea value={config.response_body} onInput={(e: any) => set({ response_body: e.target.value })}
              rows={8} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }} />
          </FlexBox>
          {(type === 'SOAP' || type === 'XI') && (
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label>SOAP Version</Label>
              <Select style={{ width: '100%' }} onChange={(e: any) => set({ soap_version: e.detail.selectedOption.value })}>
                <Option value="1.1" selected={config.soap_version !== '1.2'}>1.1</Option>
                <Option value="1.2" selected={config.soap_version === '1.2'}>1.2</Option>
              </Select>
            </FlexBox>
          )}
          {type === 'AS2' && (
            <FlexBox style={{ gap: '1rem' }}>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
                <Label>AS2 From</Label>
                <Input value={config.as2_from ?? ''} onInput={(e: any) => set({ as2_from: e.target.value })}
                  placeholder="Sender AS2 ID" style={{ width: '100%' }} />
              </FlexBox>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
                <Label>AS2 To</Label>
                <Input value={config.as2_to ?? 'KYMA_STUB'} onInput={(e: any) => set({ as2_to: e.target.value })}
                  style={{ width: '100%' }} />
              </FlexBox>
            </FlexBox>
          )}
          {type === 'AS4' && (
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label>AS4 Party ID</Label>
              <Input value={config.as4_party_id ?? 'KYMA_STUB'} onInput={(e: any) => set({ as4_party_id: e.target.value })}
                style={{ width: '100%' }} />
            </FlexBox>
          )}
          {type === 'EDIFACT' && (
            <FlexBox style={{ gap: '1rem', flexWrap: 'wrap' }}>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', minWidth: '10rem' }}>
                <Label>EDI Standard</Label>
                <Select style={{ width: '100%' }} onChange={(e: any) => set({ edi_standard: e.detail.selectedOption.value })}>
                  <Option value="" selected={!config.edi_standard}>Auto-detect</Option>
                  <Option value="EDIFACT" selected={config.edi_standard === 'EDIFACT'}>EDIFACT</Option>
                  <Option value="X12" selected={config.edi_standard === 'X12'}>X12</Option>
                </Select>
              </FlexBox>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
                <Label>Sender ID</Label>
                <Input value={config.edi_sender_id ?? 'STUBSND'} onInput={(e: any) => set({ edi_sender_id: e.target.value })}
                  style={{ width: '100%' }} />
              </FlexBox>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
                <Label>Receiver ID</Label>
                <Input value={config.edi_receiver_id ?? 'STUBRCV'} onInput={(e: any) => set({ edi_receiver_id: e.target.value })}
                  style={{ width: '100%' }} />
              </FlexBox>
            </FlexBox>
          )}
        </>
      )}
    </FlexBox>
  )
}

// ── Mock Wizard ───────────────────────────────────────────────────────────────

interface WizardAsset {
  id: string
  name: string
  content: string
  content_type: string
}

const RECEIVER_TYPES = ['REST', 'OData', 'SOAP', 'XI', 'AS2', 'AS4', 'EDIFACT']
const SENDER_TYPES_LIST = ['REST-SENDER', 'SOAP-SENDER', 'XI-SENDER']

const ADAPTER_PORT: Record<string, number> = {
  REST: 9081, OData: 9082, SOAP: 9083, XI: 9084,
  AS2: 9085, AS4: 9086, EDIFACT: 9087,
  'REST-SENDER': 9088, 'SOAP-SENDER': 9088, 'XI-SENDER': 9088,
}

function wizardPreviewURL(type: string, slug: string): string {
  const port = ADAPTER_PORT[type]
  if (!port || !slug.trim()) return ''
  return `http://localhost:${port}/${slug.trim()}`
}

type WizardStep = 'direction' | 'configure'

// AssetField: asset dropdown that pre-fills a textarea (user can still overtype)
function AssetField({
  label, value, onChange, assets, contentTypes, rows, placeholder, note,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  assets: WizardAsset[]
  contentTypes?: string[]
  rows?: number
  placeholder?: string
  note?: string
}) {
  const filtered = contentTypes
    ? assets.filter(a => contentTypes.includes(a.content_type))
    : assets
  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
      <FlexBox style={{ alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Label>{label}</Label>
        {note && (
          <span style={{ fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)' }}>{note}</span>
        )}
        {filtered.length > 0 && (
          <Select style={{ minWidth: '12rem' }}
            onChange={(e: any) => {
              const id = e.detail.selectedOption.value
              if (id) {
                const a = filtered.find(x => x.id === id)
                if (a) onChange(a.content)
              }
            }}>
            <Option value="">— from asset —</Option>
            {filtered.map(a => <Option key={a.id} value={a.id}>{a.name}</Option>)}
          </Select>
        )}
      </FlexBox>
      <TextArea
        value={value}
        rows={rows ?? 6}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
        placeholder={placeholder}
        onInput={(e: any) => onChange(e.target.value)}
      />
    </FlexBox>
  )
}

function MockWizard({ onDone, setError }: {
  onDone: () => void
  setError: (e: string) => void
}) {
  const [step, setStep] = useState<WizardStep>('direction')

  // Step 1 state
  const [direction, setDirection] = useState<'receiver' | 'sender'>('receiver')
  const [adapterType, setAdapterType] = useState('REST')
  const [slug, setSlug] = useState('')

  // Step 2 state
  const [displayName, setDisplayName] = useState('')
  const [behaviorMode, setBehaviorMode] = useState('success')
  const [config, setConfig] = useState<AdapterConfig>(templateConfig('REST'))
  const [scenarioId, setScenarioId] = useState('unassigned')
  const [credUser, setCredUser] = useState('')
  const [credPass, setCredPass] = useState('')

  // Shared
  const [assets, setAssets] = useState<WizardAsset[]>([])
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [createdAdapter, setCreatedAdapter] = useState<Adapter | null>(null)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    apiFetch('/assets').then((d: WizardAsset[]) => setAssets(d ?? [])).catch(() => {})
    apiFetch('/scenarios').then((d: Scenario[]) => {
      setScenarios(d ?? [])
      // Default to Unassigned if it exists
      if ((d ?? []).some((s: Scenario) => s.id === 'unassigned')) setScenarioId('unassigned')
      else if ((d ?? []).length > 0) setScenarioId(d[0].id)
    }).catch(() => {})
  }, [])

  const typeList = direction === 'receiver' ? RECEIVER_TYPES : SENDER_TYPES_LIST

  const changeDirection = (dir: 'receiver' | 'sender') => {
    setDirection(dir)
    const firstType = dir === 'receiver' ? RECEIVER_TYPES[0] : SENDER_TYPES_LIST[0]
    setAdapterType(firstType)
    setConfig(templateConfig(firstType))
  }

  const changeType = (t: string) => {
    setAdapterType(t)
    setConfig(templateConfig(t))
  }

  const goToConfigure = () => {
    if (!slug.trim()) return
    if (!displayName) setDisplayName(slug.trim())
    setStep('configure')
  }

  const createMock = async () => {
    if (!displayName.trim() || !slug.trim()) return
    setCreating(true)
    try {
      const body: any = {
        name: displayName.trim(),
        slug: slug.trim(),
        type: adapterType,
        behavior_mode: behaviorMode,
        config,
      }
      if (credUser) body.credentials = { username: credUser, password: credPass }
      const adapter: Adapter = await apiFetch('/scenarios/' + scenarioId + '/adapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setCreatedAdapter(adapter)
    } catch (e: any) { setError(e.message) }
    finally { setCreating(false) }
  }

  const copyURL = () => {
    if (!createdAdapter?.ingress_url) return
    navigator.clipboard.writeText(createdAdapter.ingress_url).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  const reset = () => {
    setStep('direction'); setDirection('receiver'); setAdapterType('REST')
    setSlug(''); setDisplayName(''); setBehaviorMode('success')
    setConfig(templateConfig('REST')); setScenarioId('unassigned')
    setCredUser(''); setCredPass(''); setCreatedAdapter(null); setCopied(false)
  }

  const isSender = adapterType.endsWith('-SENDER')

  // ── Result view ──
  if (createdAdapter) {
    return (
      <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
        <Toolbar>
          <Button design="Transparent" icon="nav-back" onClick={onDone} />
          <Label style={{ fontSize: '1.25rem', fontWeight: 600, marginLeft: '0.5rem' }}>Mock Created</Label>
        </Toolbar>
        <Card header={<CardHeader titleText={createdAdapter.name} subtitleText={createdAdapter.type} />}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1.5rem', gap: '1rem', alignItems: 'flex-start' }}>
            <MessageStrip design="Positive" hideCloseButton>
              {isSender
                ? 'Sender adapter created. Configure your CPI iFlow sender channel to call this URL.'
                : 'Receiver mock is live. Point your CPI iFlow receiver channel at this URL.'}
            </MessageStrip>
            {createdAdapter.ingress_url && (
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.5rem', width: '100%' }}>
                <Label style={{ fontWeight: 600 }}>Endpoint URL</Label>
                <FlexBox style={{ gap: '0.5rem', alignItems: 'center' }}>
                  <code style={{
                    flex: 1, background: 'var(--sapField_Background)',
                    border: '1px solid var(--sapField_BorderColor)',
                    borderRadius: '4px', padding: '0.5rem 0.75rem',
                    fontSize: '0.9rem', wordBreak: 'break-all',
                  }}>{createdAdapter.ingress_url}</code>
                  <Button icon="copy" onClick={copyURL}>{copied ? 'Copied!' : 'Copy'}</Button>
                </FlexBox>
              </FlexBox>
            )}
            <FlexBox style={{ gap: '0.5rem', marginTop: '0.5rem' }}>
              <Button design="Default" onClick={reset}>Create Another</Button>
              <Button design="Emphasized" onClick={onDone}>Done</Button>
            </FlexBox>
          </FlexBox>
        </Card>
      </FlexBox>
    )
  }

  // ── Step renders ──
  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
      <Toolbar>
        <Button design="Transparent" icon="nav-back" onClick={onDone} />
        <Label style={{ fontSize: '1.25rem', fontWeight: 600, marginLeft: '0.5rem' }}>
          New Mock — Step {step === 'direction' ? '1' : '2'} of 2
        </Label>
        <ToolbarSpacer />
        <span style={{ fontSize: '0.85rem', color: 'var(--sapContent_LabelColor)' }}>
          {step === 'direction' ? 'Direction & Type' : 'Configure & Save'}
        </span>
      </Toolbar>

      {/* ── Step 1: Direction & Type ── */}
      {step === 'direction' && (
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
          <Card header={<CardHeader titleText="Direction" subtitleText="Is this adapter receiving calls from CPI, or sending calls to CPI?" />}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>

              {/* Direction toggle */}
              <FlexBox style={{ gap: '0.75rem' }}>
                {(['receiver', 'sender'] as const).map(dir => (
                  <div key={dir} onClick={() => changeDirection(dir)} style={{
                    flex: 1, padding: '1rem',
                    border: `2px solid ${direction === dir ? 'var(--sapButton_Emphasized_Background)' : 'var(--sapField_BorderColor)'}`,
                    borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                    background: direction === dir ? 'var(--sapList_SelectionBackgroundColor)' : 'var(--sapField_Background)',
                  }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>{dir === 'receiver' ? '↓' : '↑'}</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' }}>
                      {dir === 'receiver' ? 'Receiver' : 'Sender'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
                      {dir === 'receiver'
                        ? 'CPI calls this system — mock the target backend'
                        : 'This system calls CPI — mock the inbound caller'}
                    </div>
                  </div>
                ))}
              </FlexBox>

              {/* Type + slug */}
              <FlexBox style={{ gap: '1rem', flexWrap: 'wrap' }}>
                <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1, minWidth: '10rem' }}>
                  <Label required>Adapter Type</Label>
                  <Select style={{ width: '100%' }}
                    onChange={(e: any) => changeType(e.detail.selectedOption.value)}>
                    {typeList.map(t => (
                      <Option key={t} value={t} selected={t === adapterType}>{t}</Option>
                    ))}
                  </Select>
                </FlexBox>
                <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 2, minWidth: '14rem' }}>
                  <Label required>
                    URL Slug{' '}
                    <span style={{ fontWeight: 400, color: 'var(--sapContent_LabelColor)' }}>
                      (unique name, used in the endpoint URL)
                    </span>
                  </Label>
                  <Input
                    value={slug}
                    onInput={(e: any) => setSlug((e.target.value as string).toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    placeholder="e.g. fi-ok  or  bp-err"
                    style={{ width: '100%' }}
                  />
                  {slug.trim() && (
                    <code style={{ fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)' }}>
                      {wizardPreviewURL(adapterType, slug)}
                    </code>
                  )}
                </FlexBox>
              </FlexBox>
            </FlexBox>
          </Card>

          <FlexBox style={{ gap: '0.5rem' }}>
            <Button onClick={onDone}>Cancel</Button>
            <Button design="Emphasized" disabled={!slug.trim()} onClick={goToConfigure}>
              Next: Configure →
            </Button>
          </FlexBox>
        </FlexBox>
      )}

      {/* ── Step 2: Configure & Save ── */}
      {step === 'configure' && (
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
          <Card header={
            <CardHeader
              titleText={`${adapterType} ${isSender ? '— Sender' : '— Receiver'}`}
              subtitleText={wizardPreviewURL(adapterType, slug)}
            />
          }>
            <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>
              <FlexBox style={{ gap: '1rem', flexWrap: 'wrap' }}>
                <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 2, minWidth: '12rem' }}>
                  <Label required>Display Name</Label>
                  <Input value={displayName} onInput={(e: any) => setDisplayName(e.target.value)}
                    placeholder="e.g. FI Document Posting — OK" style={{ width: '100%' }} />
                </FlexBox>
                <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1, minWidth: '9rem' }}>
                  <Label>Behaviour</Label>
                  <Select style={{ width: '100%' }}
                    onChange={(e: any) => setBehaviorMode(e.detail.selectedOption.value)}>
                    <Option value="success" selected={behaviorMode === 'success'}>Success</Option>
                    <Option value="failure" selected={behaviorMode === 'failure'}>Failure</Option>
                  </Select>
                </FlexBox>
              </FlexBox>

              <WizardConfigForm type={adapterType} config={config} onChange={setConfig} assets={assets} />

              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                <Label>Credentials <span style={{ fontWeight: 400, color: 'var(--sapContent_LabelColor)' }}>(optional — basic auth for inbound calls)</span></Label>
                <FlexBox style={{ gap: '0.5rem' }}>
                  <Input value={credUser} onInput={(e: any) => setCredUser(e.target.value)}
                    placeholder="Username" style={{ flex: 1 }} />
                  <Input type="Password" value={credPass} onInput={(e: any) => setCredPass(e.target.value)}
                    placeholder="Password" style={{ flex: 1 }} />
                </FlexBox>
              </FlexBox>
            </FlexBox>
          </Card>

          <Card header={<CardHeader titleText="Scenario" subtitleText="Group this adapter into a test scenario" />}>
            <FlexBox style={{ padding: '1rem' }}>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', width: '100%' }}>
                <Label>Scenario</Label>
                <Select style={{ width: '100%' }}
                  onChange={(e: any) => setScenarioId(e.detail.selectedOption.value)}>
                  {scenarios.map(s => (
                    <Option key={s.id} value={s.id} selected={s.id === scenarioId}>{s.name}</Option>
                  ))}
                </Select>
              </FlexBox>
            </FlexBox>
          </Card>

          <FlexBox style={{ gap: '0.5rem' }}>
            <Button onClick={() => setStep('direction')}>← Back</Button>
            <Button onClick={onDone}>Cancel</Button>
            <Button design="Emphasized"
              disabled={creating || !displayName.trim()}
              onClick={createMock}>
              {creating ? 'Creating…' : 'Create Mock'}
            </Button>
          </FlexBox>
        </FlexBox>
      )}
    </FlexBox>
  )
}

// ── Wizard config form (with asset dropdowns per field) ───────────────────────

function WizardConfigForm({ type, config, onChange, assets }: {
  type: string
  config: AdapterConfig
  onChange: (c: AdapterConfig) => void
  assets: WizardAsset[]
}) {
  const set = (patch: Partial<AdapterConfig>) => onChange({ ...config, ...patch })
  const isSender = type.endsWith('-SENDER')
  const bodyTypes = ['xml', 'json', 'text', 'edi', 'csv']

  if (isSender) {
    return (
      <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem' }}>
        <FlexBox style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 2, minWidth: '14rem' }}>
            <Label required>Target URL</Label>
            <Input value={config.target_url ?? ''} onInput={(e: any) => set({ target_url: e.target.value })}
              placeholder="https://my-cpi-tenant.hana.ondemand.com/http/..." style={{ width: '100%' }} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', minWidth: '8rem' }}>
            <Label>Method</Label>
            <Select style={{ width: '100%' }}
              onChange={(e: any) => set({ method: e.detail.selectedOption.value })}>
              {['POST', 'PUT', 'GET', 'PATCH'].map(m =>
                <Option key={m} value={m} selected={(config.method ?? 'POST') === m}>{m}</Option>)}
            </Select>
          </FlexBox>
        </FlexBox>
        <AssetField
          label="Request Headers"
          value={kvToString(config.request_headers ?? {})}
          onChange={v => set({ request_headers: parseKV(v) })}
          assets={assets}
          contentTypes={['headers']}
          rows={3}
          placeholder="Content-Type: application/xml"
        />
        <AssetField
          label="Request Body"
          value={config.request_body ?? ''}
          onChange={v => set({ request_body: v })}
          assets={assets}
          contentTypes={bodyTypes}
          rows={8}
          placeholder="Payload to send to CPI…"
        />
      </FlexBox>
    )
  }

  const autoNote = (t: string) => {
    if (t === 'XI') return '(leave empty — async 202 is standard)'
    if (t === 'SOAP') return '(leave empty to auto-generate success/fault response)'
    if (t === 'AS2') return '(leave empty — MDN auto-generated)'
    if (t === 'AS4') return '(leave empty — Receipt signal auto-generated)'
    if (t === 'EDIFACT') return '(leave empty — ACK auto-generated)'
    return undefined
  }

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem' }}>
      <FlexBox style={{ gap: '1rem', flexWrap: 'wrap' }}>
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', minWidth: '8rem' }}>
          <Label>Status Code</Label>
          <Input type="Number" value={String(config.status_code)}
            onInput={(e: any) => set({ status_code: Number(e.target.value) })} style={{ width: '100%' }} />
        </FlexBox>
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', minWidth: '8rem' }}>
          <Label>Delay (ms)</Label>
          <Input type="Number" value={String(config.response_delay_ms)}
            onInput={(e: any) => set({ response_delay_ms: Number(e.target.value) })} style={{ width: '100%' }} />
        </FlexBox>
        {(type === 'SOAP' || type === 'XI') && (
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', minWidth: '8rem' }}>
            <Label>SOAP Version</Label>
            <Select style={{ width: '100%' }}
              onChange={(e: any) => set({ soap_version: e.detail.selectedOption.value })}>
              <Option value="1.1" selected={(config.soap_version ?? '1.1') !== '1.2'}>1.1</Option>
              <Option value="1.2" selected={config.soap_version === '1.2'}>1.2</Option>
            </Select>
          </FlexBox>
        )}
      </FlexBox>

      {type === 'AS2' && (
        <FlexBox style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
            <Label>AS2 From</Label>
            <Input value={config.as2_from ?? ''} onInput={(e: any) => set({ as2_from: e.target.value })}
              placeholder="Sender AS2 ID" style={{ width: '100%' }} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
            <Label>AS2 To</Label>
            <Input value={config.as2_to ?? 'KYMA_STUB'} onInput={(e: any) => set({ as2_to: e.target.value })}
              style={{ width: '100%' }} />
          </FlexBox>
        </FlexBox>
      )}

      {type === 'AS4' && (
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
          <Label>AS4 Party ID</Label>
          <Input value={config.as4_party_id ?? 'KYMA_STUB'} onInput={(e: any) => set({ as4_party_id: e.target.value })}
            style={{ width: '100%' }} />
        </FlexBox>
      )}

      {type === 'EDIFACT' && (
        <FlexBox style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', minWidth: '10rem' }}>
            <Label>EDI Standard</Label>
            <Select style={{ width: '100%' }}
              onChange={(e: any) => set({ edi_standard: e.detail.selectedOption.value })}>
              <Option value="" selected={!config.edi_standard}>Auto-detect</Option>
              <Option value="EDIFACT" selected={config.edi_standard === 'EDIFACT'}>EDIFACT</Option>
              <Option value="X12" selected={config.edi_standard === 'X12'}>X12</Option>
            </Select>
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
            <Label>Sender ID</Label>
            <Input value={config.edi_sender_id ?? 'STUBSND'} onInput={(e: any) => set({ edi_sender_id: e.target.value })}
              style={{ width: '100%' }} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
            <Label>Receiver ID</Label>
            <Input value={config.edi_receiver_id ?? 'STUBRCV'} onInput={(e: any) => set({ edi_receiver_id: e.target.value })}
              style={{ width: '100%' }} />
          </FlexBox>
        </FlexBox>
      )}

      <AssetField
        label="Response Headers"
        value={kvToString(config.response_headers ?? {})}
        onChange={v => set({ response_headers: parseKV(v) })}
        assets={assets}
        contentTypes={['headers']}
        rows={3}
        placeholder="Content-Type: application/json"
        note={['SOAP', 'XI', 'AS2', 'AS4', 'EDIFACT'].includes(type) ? '(leave empty — auto-set by protocol)' : undefined}
      />

      <AssetField
        label="Response Body"
        value={config.response_body}
        onChange={v => set({ response_body: v })}
        assets={assets}
        contentTypes={bodyTypes}
        rows={10}
        placeholder={autoNote(type) ?? 'Response body…'}
        note={autoNote(type)}
      />
    </FlexBox>
  )
}
