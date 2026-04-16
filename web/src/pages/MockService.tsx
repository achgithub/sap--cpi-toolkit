import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Card,
  CardHeader,
  FlexBox,
  FlexBoxAlignItems,
  FlexBoxDirection,
  FlexBoxJustifyContent,
  Input,
  Label,
  MessageStrip,
  Option,
  Select,
  TextArea,
  Title,
  Toolbar,
  ToolbarSpacer,
} from '@ui5/webcomponents-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Adapter {
  id: string
  scenario_id: string
  name: string
  type: string
  behavior_mode: string
  config: {
    status_code: number
    response_body: string
    response_headers: Record<string, string>
    response_delay_ms: number
    soap_version?: string
  }
  ingress_url: string
  last_activity?: string
}

interface Scenario {
  id: string
  name: string
  description: string
  adapters: Adapter[]
}

interface Asset {
  id: string
  name: string
  content: string
  content_type: string
  created_at: string
}

// ── API helpers ────────────────────────────────────────────────────────────────

const ADAPTER_API = '/api/adapter'

async function adapterFetch(path: string, opts?: RequestInit) {
  const res = await fetch(ADAPTER_API + path, opts)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || res.statusText)
  }
  if (res.status === 204) return null
  return res.json()
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MockService() {
  const [scenarios,     setScenarios]     = useState<Scenario[]>([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')
  const [showAddScene,        setShowAddScene]        = useState(false)
  const [showAddMock,         setShowAddMock]         = useState<string | null>(null)
  const [editingAdapterID,    setEditingAdapterID]    = useState<string | null>(null)
  const [showMockAssetPicker, setShowMockAssetPicker] = useState(false)
  const [sceneName,           setSceneName]           = useState('')
  const [mockForm,            setMockForm]            = useState(defaultMockForm())
  const [saving,              setSaving]              = useState(false)
  const [saveErr,             setSaveErr]             = useState('')

  function defaultMockForm() {
    return { name: '', slug: '', type: 'HTTP', behavior_mode: 'success',
      status_code: '200', response_body: '', soap_version: '', delay_ms: '0' }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data: Scenario[] = await adapterFetch('/scenarios')
      setScenarios(data.filter(s => s.id !== 'unassigned' || s.adapters.length > 0))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const createScenario = async () => {
    if (!sceneName.trim()) { setSaveErr('Name is required'); return }
    setSaving(true); setSaveErr('')
    try {
      await adapterFetch('/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: sceneName, description: '' }),
      })
      setSceneName(''); setShowAddScene(false)
      load()
    } catch (e: unknown) { setSaveErr(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const createMock = async (scenarioID: string) => {
    if (!mockForm.name.trim()) { setSaveErr('Name is required'); return }
    setSaving(true); setSaveErr('')
    try {
      const sc = parseInt(mockForm.status_code) || 200
      const dm = parseInt(mockForm.delay_ms) || 0
      const payload: Record<string, unknown> = {
        name: mockForm.name,
        slug: mockForm.slug || undefined,
        type: mockForm.type,
        behavior_mode: mockForm.behavior_mode,
        config: {
          status_code: sc,
          response_body: mockForm.response_body,
          response_headers: {},
          response_delay_ms: dm,
          soap_version: mockForm.soap_version || undefined,
        },
      }
      await adapterFetch(`/scenarios/${scenarioID}/adapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setMockForm(defaultMockForm()); setShowAddMock(null)
      load()
    } catch (e: unknown) { setSaveErr(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const startEdit = (scenarioID: string, adapter: Adapter) => {
    setShowAddMock(scenarioID)
    setEditingAdapterID(adapter.id)
    setShowMockAssetPicker(false)
    setSaveErr('')
    setMockForm({
      name:          adapter.name,
      slug:          adapter.id,
      type:          adapter.type,
      behavior_mode: adapter.behavior_mode,
      status_code:   String(adapter.config.status_code),
      response_body: adapter.config.response_body,
      soap_version:  adapter.config.soap_version ?? '',
      delay_ms:      String(adapter.config.response_delay_ms),
    })
  }

  const updateMock = async (scenarioID: string) => {
    if (!editingAdapterID) return
    if (!mockForm.name.trim()) { setSaveErr('Name is required'); return }
    setSaving(true); setSaveErr('')
    try {
      const sc = parseInt(mockForm.status_code) || 200
      const dm = parseInt(mockForm.delay_ms) || 0
      const payload: Record<string, unknown> = {
        name: mockForm.name,
        type: mockForm.type,
        behavior_mode: mockForm.behavior_mode,
        config: {
          status_code: sc,
          response_body: mockForm.response_body,
          response_headers: {},
          response_delay_ms: dm,
          soap_version: mockForm.soap_version || undefined,
        },
      }
      await adapterFetch(`/scenarios/${scenarioID}/adapters/${editingAdapterID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setMockForm(defaultMockForm()); setShowAddMock(null); setEditingAdapterID(null)
      load()
    } catch (e: unknown) { setSaveErr(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const deleteMock = async (scenarioID: string, adapterID: string) => {
    await adapterFetch(`/scenarios/${scenarioID}/adapters/${adapterID}`, { method: 'DELETE' })
    load()
  }

  const deleteScenario = async (scenarioID: string) => {
    await adapterFetch(`/scenarios/${scenarioID}`, { method: 'DELETE' })
    load()
  }

  if (loading) return <p style={{ padding: '1rem' }}>Loading…</p>
  if (error) return <MessageStrip design="Negative">{error}</MessageStrip>

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem' }}>
      <Toolbar>
        <Title level="H5">Mock HTTP Endpoints</Title>
        <ToolbarSpacer />
        <Button design="Emphasized" onClick={() => { setShowAddScene(v => !v); setSaveErr('') }}>
          New Scenario
        </Button>
        <Button onClick={load}>Refresh</Button>
      </Toolbar>

      {showAddScene && (
        <Card>
          <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label>Scenario name</Label>
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
              <Input value={sceneName} placeholder="e.g. Order API" style={{ flex: 1 }}
                onInput={(e) => setSceneName((e.target as any).value)} />
              <Button design="Emphasized" onClick={createScenario} disabled={saving}>Create</Button>
              <Button onClick={() => setShowAddScene(false)}>Cancel</Button>
            </FlexBox>
            {saveErr && <MessageStrip design="Negative">{saveErr}</MessageStrip>}
          </div>
        </Card>
      )}

      <p style={{ fontSize: '0.82rem', color: 'var(--sapContent_LabelColor)', margin: 0 }}>
        All mocks are served by <strong>mock-http</strong> on port <strong>9080</strong>.
        Call your mock at <code>http://localhost:9080/&#123;adapter-id&#125;</code>.
      </p>

      {scenarios.length === 0 && (
        <MessageStrip design="Information" hideCloseButton>
          No scenarios yet. Create a scenario, then add mock endpoints to it.
        </MessageStrip>
      )}

      {scenarios.map(scenario => (
        <Card key={scenario.id}
          header={
            <CardHeader
              titleText={scenario.name}
              subtitleText={scenario.description}
              action={
                <FlexBox style={{ gap: '0.4rem' }}>
                  <Button onClick={() => { setShowAddMock(scenario.id); setEditingAdapterID(null); setMockForm(defaultMockForm()); setShowMockAssetPicker(false); setSaveErr('') }}>
                    Add Mock
                  </Button>
                  <Button design="Negative" onClick={() => deleteScenario(scenario.id)}>Delete</Button>
                </FlexBox>
              }
            />
          }>

          {/* Add / Edit mock form */}
          {showAddMock === scenario.id && (
            <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--sapList_BorderColor)',
              display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <Label style={{ fontWeight: 600 }}>{editingAdapterID ? 'Edit Mock Endpoint' : 'New Mock Endpoint'}</Label>
              <FlexBox style={{ gap: '0.5rem', flexWrap: 'wrap' }} alignItems={FlexBoxAlignItems.Center}>
                <Input value={mockForm.name} placeholder="Display name" style={{ width: '180px' }}
                  onInput={(e) => setMockForm(f => ({ ...f, name: (e.target as any).value }))} />
                {!editingAdapterID && (
                  <Input value={mockForm.slug} placeholder="URL slug (optional)" style={{ width: '160px' }}
                    onInput={(e) => setMockForm(f => ({ ...f, slug: (e.target as any).value }))} />
                )}
                <Select style={{ width: '120px' }}
                  onChange={(e) => setMockForm(f => ({ ...f, type: (e.detail.selectedOption as HTMLElement).dataset.value ?? 'HTTP' }))}>
                  <Option data-value="HTTP"  selected={mockForm.type === 'HTTP'}>HTTP</Option>
                  <Option data-value="SOAP"  selected={mockForm.type === 'SOAP'}>SOAP</Option>
                </Select>
                <Select style={{ width: '120px' }}
                  onChange={(e) => setMockForm(f => ({ ...f, behavior_mode: (e.detail.selectedOption as HTMLElement).dataset.value ?? 'success' }))}>
                  <Option data-value="success" selected={mockForm.behavior_mode === 'success'}>Success</Option>
                  <Option data-value="failure" selected={mockForm.behavior_mode === 'failure'}>Failure</Option>
                </Select>
                <Input value={mockForm.status_code} placeholder="Status code" style={{ width: '100px' }}
                  onInput={(e) => setMockForm(f => ({ ...f, status_code: (e.target as any).value }))} />
                <Input value={mockForm.delay_ms} placeholder="Delay ms" style={{ width: '90px' }}
                  onInput={(e) => setMockForm(f => ({ ...f, delay_ms: (e.target as any).value }))} />
              </FlexBox>
              {mockForm.type === 'SOAP' && (
                <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
                  <Label>SOAP Version:</Label>
                  <Select style={{ width: '100px' }}
                    onChange={(e) => setMockForm(f => ({ ...f, soap_version: (e.detail.selectedOption as HTMLElement).dataset.value ?? '' }))}>
                    <Option data-value="1.1" selected={mockForm.soap_version === '1.1'}>1.1</Option>
                    <Option data-value="1.2" selected={mockForm.soap_version === '1.2'}>1.2</Option>
                  </Select>
                </FlexBox>
              )}
              <div>
                <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween}>
                  <Label>Response body</Label>
                  <Button design="Transparent" onClick={() => setShowMockAssetPicker(v => !v)}>
                    Load from Asset
                  </Button>
                </FlexBox>
                {showMockAssetPicker && (
                  <AssetPickerPanel
                    onSelect={(a) => { setMockForm(f => ({ ...f, response_body: a.content })); setShowMockAssetPicker(false) }}
                    onClose={() => setShowMockAssetPicker(false)}
                  />
                )}
                <TextArea value={mockForm.response_body} rows={4} style={{ width: '100%', fontFamily: 'monospace' }}
                  onInput={(e) => setMockForm(f => ({ ...f, response_body: (e.target as any).value }))} />
              </div>
              <FlexBox style={{ gap: '0.5rem' }}>
                <Button design="Emphasized"
                  onClick={() => editingAdapterID ? updateMock(scenario.id) : createMock(scenario.id)}
                  disabled={saving}>
                  {saving ? 'Saving…' : editingAdapterID ? 'Update' : 'Create'}
                </Button>
                <Button onClick={() => { setShowAddMock(null); setEditingAdapterID(null) }}>Cancel</Button>
              </FlexBox>
              {saveErr && <MessageStrip design="Negative">{saveErr}</MessageStrip>}
            </div>
          )}

          {/* Adapter list */}
          {scenario.adapters.length === 0 ? (
            <p style={{ padding: '0.75rem', color: 'var(--sapContent_LabelColor)', fontSize: '0.82rem' }}>
              No mock endpoints yet.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'var(--sapList_HeaderBackground)' }}>
                  {['Name', 'Type', 'URL', 'Status', 'Mode', 'Last Hit', ''].map(h => (
                    <th key={h} style={{ padding: '0.4rem 0.6rem', textAlign: 'left',
                      borderBottom: '1px solid var(--sapList_BorderColor)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenario.adapters.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--sapList_BorderColor)' }}>
                    <td style={{ padding: '0.4rem 0.6rem' }}>{a.name}</td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>{a.type}</td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>
                      <code style={{ fontSize: '0.78rem' }}>{a.ingress_url}</code>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>{a.config.status_code}</td>
                    <td style={{ padding: '0.4rem 0.6rem',
                      color: a.behavior_mode === 'success' ? 'var(--sapPositiveColor)' : 'var(--sapNegativeColor)' }}>
                      {a.behavior_mode}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--sapContent_LabelColor)' }}>
                      {a.last_activity ? new Date(a.last_activity).toLocaleTimeString() : '—'}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem' }}>
                      <FlexBox style={{ gap: '0.25rem' }}>
                        <Button icon="edit" design="Transparent"
                          onClick={() => startEdit(scenario.id, a)} />
                        <Button icon="delete" design="Transparent"
                          onClick={() => deleteMock(scenario.id, a.id)} />
                      </FlexBox>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ))}
    </FlexBox>
  )
}

// ── Asset picker panel ─────────────────────────────────────────────────────────

function AssetPickerPanel({ onSelect, onClose }: {
  onSelect: (a: Asset) => void
  onClose: () => void
}) {
  const [assets,  setAssets]  = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('')

  useEffect(() => {
    adapterFetch('/assets')
      .then((data: Asset[]) => setAssets(data))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false))
  }, [])

  const visible = assets.filter(a =>
    a.name.toLowerCase().includes(filter.toLowerCase()) ||
    a.content_type.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div style={{ border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px',
      background: 'var(--sapList_Background)', padding: '0.5rem', marginBottom: '0.4rem' }}>
      <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween}
        style={{ marginBottom: '0.4rem' }}>
        <Input placeholder="Filter assets…" value={filter} style={{ flex: 1, marginRight: '0.4rem' }}
          onInput={(e) => setFilter((e.target as any).value)} />
        <Button design="Transparent" icon="decline" onClick={onClose} />
      </FlexBox>
      {loading && <p style={{ margin: 0, fontSize: '0.8rem' }}>Loading…</p>}
      {!loading && visible.length === 0 && (
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
          No assets found. Save content as an asset from another tool first.
        </p>
      )}
      <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
        {visible.map(a => (
          <FlexBox key={a.id} alignItems={FlexBoxAlignItems.Center}
            justifyContent={FlexBoxJustifyContent.SpaceBetween}
            style={{ padding: '0.3rem 0.4rem', cursor: 'pointer', borderRadius: '3px',
              background: 'var(--sapList_Background)' }}
            onClick={() => onSelect(a)}>
            <span style={{ fontSize: '0.82rem' }}>{a.name}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)',
              background: 'var(--sapHighlightColor)', padding: '0.1rem 0.35rem', borderRadius: '3px' }}>
              {a.content_type}
            </span>
          </FlexBox>
        ))}
      </div>
    </div>
  )
}
