import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  Dialog,
  Bar,
  Title,
  Label,
  Input,
  TextArea,
  Select,
  Option,
  FlexBox,
  FlexBoxDirection,
  FlexBoxJustifyContent,
  FlexBoxAlignItems,
  MessageStrip,
  MessageStripDesign,
  BusyIndicator,
  Badge,
  List,
  ListItemStandard,
} from '@ui5/webcomponents-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Credentials {
  username: string
  password: string
}

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
  csrf_enabled?: boolean
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

// ── API helpers ───────────────────────────────────────────────────────────────

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
  const [scenarios,    setScenarios]    = useState<Scenario[]>([])
  const [selected,     setSelected]     = useState<Scenario | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  // Create-scenario dialog
  const [showCreate,   setShowCreate]   = useState(false)
  const [newName,      setNewName]      = useState('')
  const [newDesc,      setNewDesc]      = useState('')
  const [creating,     setCreating]     = useState(false)

  // Add-adapter dialog
  const [showAddAdapter, setShowAddAdapter] = useState(false)
  const [adapterName,    setAdapterName]    = useState('')
  const [adapterType,    setAdapterType]    = useState('REST')
  const [adapterMode,    setAdapterMode]    = useState('success')
  const [adapterConfig,  setAdapterConfig]  = useState<AdapterConfig>(DEFAULT_CONFIG)
  const [adapterCreds,   setAdapterCreds]   = useState<Credentials>({ username: '', password: '' })
  const [addingAdapter,  setAddingAdapter]  = useState(false)

  const loadScenarios = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data: Scenario[] = await apiFetch('/scenarios')
      setScenarios(data ?? [])
      // Refresh selected scenario if open
      if (selected) {
        const refreshed = data?.find(s => s.id === selected.id)
        setSelected(refreshed ?? null)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [selected])

  useEffect(() => { loadScenarios() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scenario CRUD ──────────────────────────────────────────────────────────

  const createScenario = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await apiFetch('/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      })
      setShowCreate(false)
      setNewName('')
      setNewDesc('')
      await loadScenarios()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  const deleteScenario = async (id: string) => {
    if (!window.confirm('Delete this scenario and all its adapters?')) return
    try {
      await apiFetch('/scenarios/' + id, { method: 'DELETE' })
      if (selected?.id === id) setSelected(null)
      await loadScenarios()
    } catch (e: any) {
      setError(e.message)
    }
  }

  // ── Adapter CRUD ───────────────────────────────────────────────────────────

  const addAdapter = async () => {
    if (!selected || !adapterName.trim()) return
    setAddingAdapter(true)
    try {
      const body: any = {
        name: adapterName.trim(),
        type: adapterType,
        behavior_mode: adapterMode,
        config: adapterConfig,
      }
      if (adapterCreds.username) body.credentials = adapterCreds
      await apiFetch('/scenarios/' + selected.id + '/adapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setShowAddAdapter(false)
      resetAdapterForm()
      await loadScenarios()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAddingAdapter(false)
    }
  }

  const deleteAdapter = async (scenarioId: string, adapterId: string) => {
    if (!window.confirm('Remove this adapter?')) return
    try {
      await apiFetch('/scenarios/' + scenarioId + '/adapters/' + adapterId, { method: 'DELETE' })
      await loadScenarios()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const toggleBehavior = async (a: Adapter) => {
    const newMode = a.behavior_mode === 'success' ? 'failure' : 'success'
    try {
      await apiFetch('/scenarios/' + a.scenario_id + '/adapters/' + a.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: a.name, behavior_mode: newMode, config: a.config, credentials: a.credentials }),
      })
      await loadScenarios()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const resetAdapterForm = () => {
    setAdapterName('')
    setAdapterType('REST')
    setAdapterMode('success')
    setAdapterConfig(DEFAULT_CONFIG)
    setAdapterCreds({ username: '', password: '' })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (selected) {
    return <ScenarioDetail
      scenario={selected}
      onBack={() => setSelected(null)}
      onDelete={deleteScenario}
      onAddAdapter={() => setShowAddAdapter(true)}
      onDeleteAdapter={deleteAdapter}
      onToggleBehavior={toggleBehavior}
      onRefresh={loadScenarios}
      error={error}
      showAddDialog={showAddAdapter}
      onCloseAddDialog={() => { setShowAddAdapter(false); resetAdapterForm() }}
      adapterName={adapterName}       setAdapterName={setAdapterName}
      adapterType={adapterType}       setAdapterType={setAdapterType}
      adapterMode={adapterMode}       setAdapterMode={setAdapterMode}
      adapterConfig={adapterConfig}   setAdapterConfig={setAdapterConfig}
      adapterCreds={adapterCreds}     setAdapterCreds={setAdapterCreds}
      adding={addingAdapter}
      onAdd={addAdapter}
    />
  }

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
      {error && (
        <MessageStrip design={MessageStripDesign.Negative} onClose={() => setError('')}>
          {error}
        </MessageStrip>
      )}

      <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} alignItems={FlexBoxAlignItems.Center}>
        <Title>Adapter Scenarios</Title>
        <FlexBox style={{ gap: '0.5rem' }}>
          <Button onClick={loadScenarios} design="Transparent" icon="refresh" tooltip="Refresh" />
          <Button onClick={() => setShowCreate(true)} design="Emphasized" icon="add">New Scenario</Button>
        </FlexBox>
      </FlexBox>

      {loading && <BusyIndicator active />}

      {!loading && scenarios.length === 0 && (
        <MessageStrip design={MessageStripDesign.Information} hideCloseButton>
          No scenarios yet. Create one to start configuring mock adapters.
        </MessageStrip>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {scenarios.map(sc => (
          <Card key={sc.id} onClick={() => setSelected(sc)} style={{ cursor: 'pointer' }}>
            <CardHeader
              titleText={sc.name}
              subtitleText={sc.description || 'No description'}
              action={
                <Button
                  design="Transparent"
                  icon="delete"
                  onClick={(e) => { e.stopPropagation(); deleteScenario(sc.id) }}
                  tooltip="Delete scenario"
                />
              }
            />
            <CardContent>
              <Label>{sc.adapters.length} adapter{sc.adapters.length !== 1 ? 's' : ''}</Label>
              <FlexBox style={{ flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
                {sc.adapters.slice(0, 5).map(a => (
                  <Badge key={a.id} colorScheme={a.behavior_mode === 'failure' ? '2' : '8'}>
                    {a.type}
                  </Badge>
                ))}
                {sc.adapters.length > 5 && <Badge>+{sc.adapters.length - 5}</Badge>}
              </FlexBox>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create scenario dialog */}
      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        header={<Bar><Title>New Scenario</Title></Bar>}
        footer={
          <Bar endContent={
            <FlexBox style={{ gap: '0.5rem' }}>
              <Button onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button design="Emphasized" onClick={createScenario} disabled={creating || !newName.trim()}>
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </FlexBox>
          } />
        }
      >
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem', padding: '1rem', minWidth: '360px' }}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label required>Name</Label>
            <Input value={newName} onInput={(e: any) => setNewName(e.target.value)} placeholder="e.g. Payment Processing" style={{ width: '100%' }} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Description</Label>
            <TextArea value={newDesc} onInput={(e: any) => setNewDesc(e.target.value)} rows={3} style={{ width: '100%' }} />
          </FlexBox>
        </FlexBox>
      </Dialog>
    </FlexBox>
  )
}

// ── Scenario detail view ───────────────────────────────────────────────────────

interface ScenarioDetailProps {
  scenario: Scenario
  onBack: () => void
  onDelete: (id: string) => void
  onAddAdapter: () => void
  onDeleteAdapter: (scenarioId: string, adapterId: string) => void
  onToggleBehavior: (a: Adapter) => void
  onRefresh: () => void
  error: string
  showAddDialog: boolean
  onCloseAddDialog: () => void
  adapterName: string;      setAdapterName: (v: string) => void
  adapterType: string;      setAdapterType: (v: string) => void
  adapterMode: string;      setAdapterMode: (v: string) => void
  adapterConfig: AdapterConfig; setAdapterConfig: (c: AdapterConfig) => void
  adapterCreds: Credentials;    setAdapterCreds: (c: Credentials) => void
  adding: boolean
  onAdd: () => void
}

function ScenarioDetail({
  scenario, onBack, onDelete, onAddAdapter, onDeleteAdapter, onToggleBehavior,
  onRefresh, error,
  showAddDialog, onCloseAddDialog,
  adapterName, setAdapterName,
  adapterType, setAdapterType,
  adapterMode, setAdapterMode,
  adapterConfig, setAdapterConfig,
  adapterCreds, setAdapterCreds,
  adding, onAdd,
}: ScenarioDetailProps) {
  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
      {error && (
        <MessageStrip design={MessageStripDesign.Negative}>
          {error}
        </MessageStrip>
      )}

      <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} alignItems={FlexBoxAlignItems.Center}>
        <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
          <Button design="Transparent" icon="nav-back" onClick={onBack} />
          <Title>{scenario.name}</Title>
        </FlexBox>
        <FlexBox style={{ gap: '0.5rem' }}>
          <Button design="Transparent" icon="refresh" onClick={onRefresh} tooltip="Refresh" />
          <Button design="Attention" icon="delete" onClick={() => onDelete(scenario.id)}>Delete Scenario</Button>
          <Button design="Emphasized" icon="add" onClick={onAddAdapter}>Add Adapter</Button>
        </FlexBox>
      </FlexBox>

      {scenario.description && (
        <Label style={{ color: 'var(--sapTextColor)' }}>{scenario.description}</Label>
      )}

      {scenario.adapters.length === 0 ? (
        <MessageStrip design={MessageStripDesign.Information} hideCloseButton>
          No adapters yet. Add one to configure a mock endpoint.
        </MessageStrip>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
          {scenario.adapters.map(a => (
            <AdapterCard
              key={a.id}
              adapter={a}
              onDelete={() => onDeleteAdapter(scenario.id, a.id)}
              onToggleBehavior={() => onToggleBehavior(a)}
            />
          ))}
        </div>
      )}

      {/* Add adapter dialog */}
      <Dialog
        open={showAddDialog}
        onClose={onCloseAddDialog}
        header={<Bar><Title>Add Adapter</Title></Bar>}
        footer={
          <Bar endContent={
            <FlexBox style={{ gap: '0.5rem' }}>
              <Button onClick={onCloseAddDialog}>Cancel</Button>
              <Button design="Emphasized" onClick={onAdd} disabled={adding || !adapterName.trim()}>
                {adding ? 'Adding…' : 'Add'}
              </Button>
            </FlexBox>
          } />
        }
      >
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem', padding: '1rem', minWidth: '420px', maxHeight: '70vh', overflowY: 'auto' }}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label required>Name</Label>
            <Input value={adapterName} onInput={(e: any) => setAdapterName(e.target.value)} placeholder="e.g. Payment API" style={{ width: '100%' }} />
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
              <Input value={adapterCreds.username} onInput={(e: any) => setAdapterCreds({ ...adapterCreds, username: e.target.value })} placeholder="Username" style={{ flex: 1 }} />
              <Input type="Password" value={adapterCreds.password} onInput={(e: any) => setAdapterCreds({ ...adapterCreds, password: e.target.value })} placeholder="Password" style={{ flex: 1 }} />
            </FlexBox>
          </FlexBox>
        </FlexBox>
      </Dialog>
    </FlexBox>
  )
}

// ── Adapter card ──────────────────────────────────────────────────────────────

function AdapterCard({ adapter, onDelete, onToggleBehavior }: {
  adapter: Adapter
  onDelete: () => void
  onToggleBehavior: () => void
}) {
  const isFailure = adapter.behavior_mode === 'failure'
  return (
    <Card>
      <CardHeader
        titleText={adapter.name}
        subtitleText={adapter.type}
        action={
          <FlexBox style={{ gap: '0.25rem' }}>
            <Button
              design={isFailure ? 'Attention' : 'Default'}
              onClick={onToggleBehavior}
              tooltip="Toggle success/failure mode"
            >
              {isFailure ? 'Failure' : 'Success'}
            </Button>
            <Button design="Transparent" icon="delete" onClick={onDelete} tooltip="Remove adapter" />
          </FlexBox>
        }
      />
      <CardContent>
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.5rem', fontSize: '0.875rem' }}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.125rem' }}>
            <Label style={{ fontWeight: 'bold' }}>Endpoint URL</Label>
            <code style={{
              background: 'var(--sapField_Background)',
              border: '1px solid var(--sapField_BorderColor)',
              borderRadius: '4px',
              padding: '0.25rem 0.5rem',
              fontSize: '0.8rem',
              wordBreak: 'break-all',
            }}>
              {adapter.ingress_url || '—'}
            </code>
          </FlexBox>
          {adapter.config.status_code > 0 && (
            <FlexBox style={{ gap: '1rem' }}>
              <span>Status: <Badge colorScheme={adapter.config.status_code >= 400 ? '2' : '8'}>{adapter.config.status_code}</Badge></span>
              {adapter.config.response_delay_ms > 0 && <span>Delay: {adapter.config.response_delay_ms}ms</span>}
            </FlexBox>
          )}
          {adapter.last_activity && (
            <Label>Last activity: {new Date(adapter.last_activity).toLocaleTimeString()}</Label>
          )}
        </FlexBox>
      </CardContent>
    </Card>
  )
}

// ── Adapter config form ───────────────────────────────────────────────────────

function AdapterConfigForm({ type, config, onChange }: {
  type: string
  config: AdapterConfig
  onChange: (c: AdapterConfig) => void
}) {
  const set = (patch: Partial<AdapterConfig>) => onChange({ ...config, ...patch })
  const isSender = type.endsWith('-SENDER')

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem' }}>
      {isSender ? (
        <>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Target URL</Label>
            <Input value={config.target_url ?? ''} onInput={(e: any) => set({ target_url: e.target.value })} placeholder="https://..." style={{ width: '100%' }} />
          </FlexBox>
          <FlexBox style={{ gap: '0.5rem' }}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
              <Label>HTTP Method</Label>
              <Select style={{ width: '100%' }} onChange={(e: any) => set({ method: e.detail.selectedOption.value })}>
                {['POST', 'PUT', 'GET', 'PATCH'].map(m => <Option key={m} value={m} selected={config.method === m}>{m}</Option>)}
              </Select>
            </FlexBox>
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Request Body</Label>
            <TextArea value={config.request_body ?? ''} onInput={(e: any) => set({ request_body: e.target.value })} rows={3} style={{ width: '100%' }} />
          </FlexBox>
        </>
      ) : (
        <>
          <FlexBox style={{ gap: '0.5rem' }}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
              <Label>Response Status</Label>
              <Input type="Number" value={String(config.status_code)} onInput={(e: any) => set({ status_code: Number(e.target.value) })} style={{ width: '100%' }} />
            </FlexBox>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
              <Label>Delay (ms)</Label>
              <Input type="Number" value={String(config.response_delay_ms)} onInput={(e: any) => set({ response_delay_ms: Number(e.target.value) })} style={{ width: '100%' }} />
            </FlexBox>
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Response Body</Label>
            <TextArea value={config.response_body} onInput={(e: any) => set({ response_body: e.target.value })} rows={4} style={{ width: '100%' }} />
          </FlexBox>
          {type === 'SOAP' || type === 'XI' ? (
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label>SOAP Version</Label>
              <Select style={{ width: '100%' }} onChange={(e: any) => set({ soap_version: e.detail.selectedOption.value })}>
                <Option value="1.1" selected={config.soap_version !== '1.2'}>1.1</Option>
                <Option value="1.2" selected={config.soap_version === '1.2'}>1.2</Option>
              </Select>
            </FlexBox>
          ) : null}
          {type === 'EDIFACT' ? (
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label>EDI Standard</Label>
              <Select style={{ width: '100%' }} onChange={(e: any) => set({ edi_standard: e.detail.selectedOption.value })}>
                <Option value="EDIFACT" selected={config.edi_standard !== 'X12'}>EDIFACT</Option>
                <Option value="X12" selected={config.edi_standard === 'X12'}>X12</Option>
              </Select>
            </FlexBox>
          ) : null}
        </>
      )}
    </FlexBox>
  )
}
