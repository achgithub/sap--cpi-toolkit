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
  edi_standard?: string
  target_url?: string
  method?: string
  request_body?: string
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

// ── Constants ─────────────────────────────────────────────────────────────────

const ADAPTER_TYPES = [
  'REST', 'OData', 'SOAP', 'XI', 'AS2', 'AS4', 'EDIFACT',
  'REST-SENDER', 'SOAP-SENDER', 'XI-SENDER',
]

const DEFAULT_CONFIG: AdapterConfig = {
  status_code: 200,
  response_body: '',
  response_headers: {},
  response_delay_ms: 0,
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdapterScenarios() {
  const [scenarios,  setScenarios]  = useState<Scenario[]>([])
  const [selected,   setSelected]   = useState<Scenario | null>(null)
  const [error,      setError]      = useState('')

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
      if (selected) {
        const refreshed = (data ?? []).find(s => s.id === selected.id)
        setSelected(refreshed ?? null)
      }
    } catch (e: any) { setError(e.message) }
  }, [selected])

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
      if (selected?.id === id) setSelected(null)
      await load()
    } catch (e: any) { setError(e.message) }
  }

  if (selected) {
    return <ScenarioDetail scenario={selected} onBack={() => setSelected(null)}
      onDelete={deleteScenario} onRefresh={load} error={error} setError={setError} />
  }

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
      {error && <MessageStrip design="Negative" onClose={() => setError('')}>{error}</MessageStrip>}

      <Toolbar>
        <Label style={{ fontSize: '1.25rem', fontWeight: 600 }}>Adapter Scenarios</Label>
        <ToolbarSpacer />
        <Button design="Transparent" icon="refresh" onClick={load} />
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {scenarios.map(sc => (
          <Card key={sc.id} header={
            <CardHeader
              titleText={sc.name}
              subtitleText={sc.description || `${sc.adapters.length} adapter${sc.adapters.length !== 1 ? 's' : ''}`}
              action={
                <Button design="Transparent" icon="delete"
                  onClick={(e) => { e.stopPropagation(); deleteScenario(sc.id) }} />
              }
              onClick={() => setSelected(sc)}
              interactive
            />
          }>
            <div style={{ padding: '0.5rem 1rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
              {sc.adapters.map(a => (
                <span key={a.id} style={{
                  background: a.behavior_mode === 'failure' ? 'var(--sapErrorColor)' : 'var(--sapSuccessColor)',
                  color: '#fff', borderRadius: '0.75rem', padding: '0.1rem 0.5rem', fontSize: '0.75rem'
                }}>{a.type}</span>
              ))}
              {sc.adapters.length === 0 && <Label style={{ color: 'var(--sapContent_LabelColor)' }}>No adapters</Label>}
            </div>
          </Card>
        ))}
      </div>
    </FlexBox>
  )
}

// ── Scenario detail ───────────────────────────────────────────────────────────

function ScenarioDetail({ scenario, onBack, onDelete, onRefresh, error, setError }: {
  scenario: Scenario
  onBack: () => void
  onDelete: (id: string) => void
  onRefresh: () => void
  error: string
  setError: (e: string) => void
}) {
  const [showAdd,      setShowAdd]      = useState(false)
  const [adapterName,  setAdapterName]  = useState('')
  const [adapterType,  setAdapterType]  = useState('REST')
  const [adapterMode,  setAdapterMode]  = useState('success')
  const [adapterConfig, setAdapterConfig] = useState<AdapterConfig>(DEFAULT_CONFIG)
  const [adapterUser,  setAdapterUser]  = useState('')
  const [adapterPass,  setAdapterPass]  = useState('')
  const [adding,       setAdding]       = useState(false)

  const addAdapter = async () => {
    if (!adapterName.trim()) return
    setAdding(true)
    setError('')
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
      setAdapterConfig(DEFAULT_CONFIG)
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

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
      {error && <MessageStrip design="Negative" onClose={() => setError('')}>{error}</MessageStrip>}

      <Toolbar>
        <Button design="Transparent" icon="nav-back" onClick={onBack} />
        <Label style={{ fontSize: '1.25rem', fontWeight: 600, marginLeft: '0.5rem' }}>{scenario.name}</Label>
        <ToolbarSpacer />
        <Button design="Transparent" icon="refresh" onClick={onRefresh} />
        <Button design="Attention" icon="delete" onClick={() => onDelete(scenario.id)}>Delete</Button>
        <Button design="Emphasized" icon="add" onClick={() => setShowAdd(v => !v)}>Add Adapter</Button>
      </Toolbar>

      {scenario.description && (
        <Label style={{ color: 'var(--sapTextColor)' }}>{scenario.description}</Label>
      )}

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
                <Select style={{ width: '100%' }} onChange={(e: any) => setAdapterType(e.detail.selectedOption.value)}>
                  {ADAPTER_TYPES.map(t => <Option key={t} value={t} selected={t === adapterType}>{t}</Option>)}
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
          No adapters yet. Add one to configure a mock endpoint.
        </MessageStrip>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
        {scenario.adapters.map(a => (
          <AdapterCard key={a.id} adapter={a}
            onDelete={() => deleteAdapter(a.id)}
            onToggleBehavior={() => toggleBehavior(a)} />
        ))}
      </div>
    </FlexBox>
  )
}

// ── Adapter card ──────────────────────────────────────────────────────────────

function AdapterCard({ adapter, onDelete, onToggleBehavior }: {
  adapter: Adapter; onDelete: () => void; onToggleBehavior: () => void
}) {
  const isFailure = adapter.behavior_mode === 'failure'
  return (
    <Card header={
      <CardHeader
        titleText={adapter.name}
        subtitleText={adapter.type}
        action={
          <FlexBox style={{ gap: '0.25rem' }}>
            <Button design={isFailure ? 'Attention' : 'Default'} onClick={onToggleBehavior}>
              {isFailure ? 'Failure' : 'Success'}
            </Button>
            <Button design="Transparent" icon="delete" onClick={onDelete} />
          </FlexBox>
        }
      />
    }>
      <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.5rem', padding: '0.75rem 1rem 1rem' }}>
        <Label style={{ fontWeight: 600 }}>Endpoint URL</Label>
        <code style={{
          background: 'var(--sapField_Background)', border: '1px solid var(--sapField_BorderColor)',
          borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.8rem', wordBreak: 'break-all',
        }}>
          {adapter.ingress_url || '—'}
        </code>
        <FlexBox style={{ gap: '1rem', fontSize: '0.875rem' }}>
          {adapter.config.status_code > 0 && <span>Status: <b>{adapter.config.status_code}</b></span>}
          {adapter.config.response_delay_ms > 0 && <span>Delay: {adapter.config.response_delay_ms}ms</span>}
        </FlexBox>
        {adapter.last_activity && (
          <Label>Last activity: {new Date(adapter.last_activity).toLocaleTimeString()}</Label>
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
              rows={3} style={{ width: '100%' }} />
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
            <Label>Response Body</Label>
            <TextArea value={config.response_body} onInput={(e: any) => set({ response_body: e.target.value })}
              rows={4} style={{ width: '100%' }} />
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
          {type === 'EDIFACT' && (
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label>EDI Standard</Label>
              <Select style={{ width: '100%' }} onChange={(e: any) => set({ edi_standard: e.detail.selectedOption.value })}>
                <Option value="EDIFACT" selected={config.edi_standard !== 'X12'}>EDIFACT</Option>
                <Option value="X12" selected={config.edi_standard === 'X12'}>X12</Option>
              </Select>
            </FlexBox>
          )}
        </>
      )}
    </FlexBox>
  )
}
