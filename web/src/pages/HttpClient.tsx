import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Card,
  CardHeader,
  FlexBox,
  FlexBoxDirection,
  FlexBoxAlignItems,
  FlexBoxJustifyContent,
  Input,
  Label,
  MessageStrip,
  Option,
  Select,
  Tab,
  TabContainer,
  TextArea,
  Title,
  Toolbar,
  ToolbarSpacer,
} from '@ui5/webcomponents-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface HeaderRow { key: string; value: string }

interface SavedRequest {
  id: string
  collection_id: string
  name: string
  method: string
  url: string
  headers: Record<string, string>
  body: string
  created_at: string
}

interface Collection {
  id: string
  name: string
  requests: SavedRequest[]
  created_at: string
}

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

interface HttpResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  durationMs: number
}

interface Asset {
  id: string
  name: string
  content: string
  content_type: string
  created_at: string
}

// ── API helpers ────────────────────────────────────────────────────────────────

const WORKER_API  = '/api/worker'
const ADAPTER_API = '/api/adapter'

async function workerFetch(path: string, opts?: RequestInit) {
  const res = await fetch(WORKER_API + path, opts)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || res.statusText)
  }
  if (res.status === 204) return null
  return res.json()
}

async function adapterFetch(path: string, opts?: RequestInit) {
  const res = await fetch(ADAPTER_API + path, opts)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || res.statusText)
  }
  if (res.status === 204) return null
  return res.json()
}

// ── Templates ──────────────────────────────────────────────────────────────────

const TEMPLATES: Record<string, { method: string; headers: HeaderRow[]; body: string }> = {
  'REST GET': {
    method: 'GET',
    headers: [{ key: 'Accept', value: 'application/json' }],
    body: '',
  },
  'REST POST': {
    method: 'POST',
    headers: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Accept', value: 'application/json' },
    ],
    body: '{\n  \n}',
  },
  'SOAP 1.1': {
    method: 'POST',
    headers: [
      { key: 'Content-Type', value: 'text/xml; charset=utf-8' },
      { key: 'SOAPAction', value: '""' },
    ],
    body: `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    <!-- request payload here -->
  </soapenv:Body>
</soapenv:Envelope>`,
  },
  'SOAP 1.2': {
    method: 'POST',
    headers: [
      { key: 'Content-Type', value: 'application/soap+xml; charset=utf-8' },
    ],
    body: `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://www.w3.org/2003/05/soap-envelope">
  <soapenv:Header/>
  <soapenv:Body>
    <!-- request payload here -->
  </soapenv:Body>
</soapenv:Envelope>`,
  },
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function HttpClient() {
  const [activeTab, setActiveTab] = useState<'test-tool' | 'mock-receiver'>('test-tool')

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ height: '100%', gap: '0.5rem' }}>
      <TabContainer
        onTabSelect={(e) => {
          const id = (e.detail.tab as HTMLElement).dataset.id as 'test-tool' | 'mock-receiver'
          if (id) setActiveTab(id)
        }}
      >
        <Tab data-id="test-tool"      text="HTTP Test Tool"  selected={activeTab === 'test-tool'} />
        <Tab data-id="mock-receiver"  text="Mock Receiver"   selected={activeTab === 'mock-receiver'} />
      </TabContainer>

      {activeTab === 'test-tool'     && <TestTool />}
      {activeTab === 'mock-receiver' && <MockReceiver />}
    </FlexBox>
  )
}

// ── Test Tool ──────────────────────────────────────────────────────────────────

function TestTool() {
  const [method,      setMethod]      = useState('GET')
  const [url,         setUrl]         = useState('')
  const [headers,     setHeaders]     = useState<HeaderRow[]>([{ key: '', value: '' }])
  const [body,        setBody]        = useState('')
  const [sending,     setSending]     = useState(false)
  const [response,    setResponse]    = useState<HttpResponse | null>(null)
  const [reqError,    setReqError]    = useState('')

  const [collections,    setCollections]    = useState<Collection[]>([])
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveName,       setSaveName]       = useState('')
  const [saveColID,      setSaveColID]      = useState('')
  const [newColName,     setNewColName]     = useState('')
  const [saving,         setSaving]         = useState(false)
  const [collErr,        setCollErr]        = useState('')

  const [showBodyAssetPicker, setShowBodyAssetPicker] = useState(false)
  const [showBodyAssetSave,   setShowBodyAssetSave]   = useState(false)
  const [showRespAssetSave,   setShowRespAssetSave]   = useState(false)

  const loadCollections = useCallback(async () => {
    try {
      const data: Collection[] = await workerFetch('/http-client/collections')
      setCollections(data)
      if (data.length > 0 && !saveColID) setSaveColID(data[0].id)
    } catch {
      // non-fatal
    }
  }, [saveColID])

  useEffect(() => { loadCollections() }, [loadCollections])

  const applyTemplate = (name: string) => {
    const t = TEMPLATES[name]
    if (!t) return
    setMethod(t.method)
    setHeaders([...t.headers, { key: '', value: '' }])
    setBody(t.body)
  }

  const loadSavedRequest = (req: SavedRequest) => {
    setMethod(req.method)
    setUrl(req.url)
    const rows: HeaderRow[] = Object.entries(req.headers).map(([k, v]) => ({ key: k, value: v }))
    setHeaders([...rows, { key: '', value: '' }])
    setBody(req.body)
    setResponse(null)
    setReqError('')
  }

  const sendRequest = async () => {
    if (!url.trim()) { setReqError('URL is required'); return }
    setSending(true)
    setResponse(null)
    setReqError('')
    const start = Date.now()
    try {
      const hdrs: Record<string, string> = {}
      headers.forEach(({ key, value }) => { if (key.trim()) hdrs[key.trim()] = value })

      const res = await fetch(url, {
        method,
        headers: hdrs,
        body: ['GET', 'HEAD', 'OPTIONS'].includes(method) ? undefined : body || undefined,
      })

      const resHeaders: Record<string, string> = {}
      res.headers.forEach((v, k) => { resHeaders[k] = v })
      const resBody = await res.text()

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        body: resBody,
        durationMs: Date.now() - start,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setReqError(`Request failed: ${msg}`)
    } finally {
      setSending(false)
    }
  }

  const saveRequest = async () => {
    if (!saveName.trim()) { setCollErr('Name is required'); return }
    setSaving(true)
    setCollErr('')
    try {
      let colID = saveColID

      // Create new collection if requested.
      if (colID === '__new__') {
        if (!newColName.trim()) { setCollErr('Collection name is required'); setSaving(false); return }
        const col: Collection = await workerFetch('/http-client/collections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newColName.trim() }),
        })
        colID = col.id
      }

      const hdrs: Record<string, string> = {}
      headers.forEach(({ key, value }) => { if (key.trim()) hdrs[key.trim()] = value })

      await workerFetch(`/http-client/collections/${colID}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveName, method, url, headers: hdrs, body }),
      })

      await loadCollections()
      setSaveDialogOpen(false)
      setSaveName('')
      setNewColName('')
    } catch (e: unknown) {
      setCollErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const deleteRequest = async (colID: string, reqID: string) => {
    await workerFetch(`/http-client/collections/${colID}/requests/${reqID}`, { method: 'DELETE' })
    loadCollections()
  }

  const deleteCollection = async (colID: string) => {
    await workerFetch(`/http-client/collections/${colID}`, { method: 'DELETE' })
    loadCollections()
  }

  return (
    <FlexBox style={{ flex: 1, gap: '1rem', overflow: 'hidden' }}>

      {/* ── Collections sidebar ── */}
      <div style={{ width: '220px', flexShrink: 0, overflowY: 'auto' }}>
        <Card header={<CardHeader titleText="Collections" />}>
          {collections.length === 0 && (
            <p style={{ padding: '0.5rem', color: 'var(--sapContent_LabelColor)', fontSize: '0.8rem' }}>
              No collections yet. Send a request and save it.
            </p>
          )}
          {collections.map(col => (
            <div key={col.id} style={{ borderBottom: '1px solid var(--sapList_BorderColor)' }}>
              <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween}
                style={{ padding: '0.4rem 0.5rem', background: 'var(--sapList_HeaderBackground)' }}>
                <span style={{ fontWeight: 600, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {col.name}
                </span>
                <Button icon="delete" design="Transparent" style={{ minWidth: 'auto' }}
                  onClick={() => deleteCollection(col.id)} />
              </FlexBox>
              {col.requests.map(req => (
                <FlexBox key={req.id} alignItems={FlexBoxAlignItems.Center}
                  justifyContent={FlexBoxJustifyContent.SpaceBetween}
                  style={{ padding: '0.25rem 0.75rem', cursor: 'pointer' }}
                  onClick={() => loadSavedRequest(req)}>
                  <span style={{ fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: methodColor(req.method), fontWeight: 600, marginRight: '0.4rem', fontSize: '0.72rem' }}>
                      {req.method}
                    </span>
                    {req.name}
                  </span>
                  <Button icon="delete" design="Transparent" style={{ minWidth: 'auto' }}
                    onClick={(e) => { e.stopPropagation(); deleteRequest(col.id, req.id) }} />
                </FlexBox>
              ))}
            </div>
          ))}
        </Card>
      </div>

      {/* ── Request builder + response ── */}
      <FlexBox direction={FlexBoxDirection.Column} style={{ flex: 1, gap: '0.75rem', overflow: 'hidden' }}>

        {/* Method + URL + actions */}
        <Card>
          <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
              <Select style={{ width: '110px' }}
                onChange={(e) => setMethod((e.detail.selectedOption as HTMLElement).dataset.value ?? 'GET')}>
                {['GET','POST','PUT','DELETE','PATCH','OPTIONS','HEAD'].map(m => (
                  <Option key={m} data-value={m} selected={method === m}>{m}</Option>
                ))}
              </Select>
              <Input value={url} placeholder="https://..." style={{ flex: 1 }}
                onInput={(e) => setUrl((e.target as any).value)} />
              <Button design="Emphasized" onClick={sendRequest} disabled={sending}>
                {sending ? 'Sending…' : 'Send'}
              </Button>
              <Button onClick={() => { setSaveDialogOpen(v => !v); setCollErr('') }}>Save</Button>
            </FlexBox>

            {/* Templates */}
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
              <Label>Templates:</Label>
              {Object.keys(TEMPLATES).map(t => (
                <Button key={t} design="Transparent" onClick={() => applyTemplate(t)}>{t}</Button>
              ))}
            </FlexBox>

            {reqError && <MessageStrip design="Negative" onClose={() => setReqError('')}>{reqError}</MessageStrip>}

            {/* Save panel */}
            {saveDialogOpen && (
              <div style={{ padding: '0.75rem', background: 'var(--sapList_Background)',
                border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Input value={saveName} placeholder="Request name" style={{ width: '180px' }}
                    onInput={(e) => setSaveName((e.target as any).value)} />
                  <Select style={{ width: '180px' }}
                    onChange={(e) => setSaveColID((e.detail.selectedOption as HTMLElement).dataset.value ?? '')}>
                    {collections.map(c => (
                      <Option key={c.id} data-value={c.id} selected={saveColID === c.id}>{c.name}</Option>
                    ))}
                    <Option data-value="__new__" selected={saveColID === '__new__'}>+ New collection</Option>
                  </Select>
                  {saveColID === '__new__' && (
                    <Input value={newColName} placeholder="Collection name" style={{ width: '160px' }}
                      onInput={(e) => setNewColName((e.target as any).value)} />
                  )}
                  <Button design="Emphasized" onClick={saveRequest} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                  <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
                </FlexBox>
                {collErr && <MessageStrip design="Negative">{collErr}</MessageStrip>}
              </div>
            )}
          </div>
        </Card>

        {/* Headers + Body tabs */}
        <Card style={{ flex: '0 0 auto' }}>
          <div style={{ padding: '0.75rem' }}>
            <HeadersEditor headers={headers} onChange={setHeaders} />
            <div style={{ marginTop: '0.5rem' }}>
              <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween}>
                <Label>Body</Label>
                <FlexBox style={{ gap: '0.25rem' }}>
                  <Button design="Transparent" onClick={() => { setShowBodyAssetPicker(v => !v); setShowBodyAssetSave(false) }}>
                    Load from Asset
                  </Button>
                  <Button design="Transparent" onClick={() => { setShowBodyAssetSave(v => !v); setShowBodyAssetPicker(false) }}>
                    Save as Asset
                  </Button>
                </FlexBox>
              </FlexBox>
              {showBodyAssetPicker && (
                <AssetPickerPanel
                  onSelect={(a) => { setBody(a.content); setShowBodyAssetPicker(false) }}
                  onClose={() => setShowBodyAssetPicker(false)}
                />
              )}
              {showBodyAssetSave && (
                <SaveAssetPanel
                  content={body}
                  onSaved={() => setShowBodyAssetSave(false)}
                  onClose={() => setShowBodyAssetSave(false)}
                />
              )}
              <TextArea value={body} rows={6} style={{ width: '100%', fontFamily: 'monospace' }}
                onInput={(e) => setBody((e.target as any).value)} />
            </div>
          </div>
        </Card>

        {/* Response */}
        {response && (
          <Card header={
            <CardHeader
              titleText={`Response — ${response.status} ${response.statusText}`}
              subtitleText={`${response.durationMs} ms`}
              style={{ color: response.status < 400 ? 'var(--sapPositiveColor)' : 'var(--sapNegativeColor)' }}
            />
          } style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <Label>Headers</Label>
                <div style={{ fontFamily: 'monospace', fontSize: '0.78rem',
                  background: 'var(--sapList_Background)', padding: '0.5rem', borderRadius: '4px' }}>
                  {Object.entries(response.headers).map(([k, v]) => (
                    <div key={k}><strong>{k}:</strong> {v}</div>
                  ))}
                </div>
              </div>
              <div>
                <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween}>
                  <Label>Body</Label>
                  <Button design="Transparent" onClick={() => setShowRespAssetSave(v => !v)}>
                    Save as Asset
                  </Button>
                </FlexBox>
                {showRespAssetSave && (
                  <SaveAssetPanel
                    content={response.body}
                    onSaved={() => setShowRespAssetSave(false)}
                    onClose={() => setShowRespAssetSave(false)}
                  />
                )}
                <pre style={{ fontFamily: 'monospace', fontSize: '0.82rem', whiteSpace: 'pre-wrap',
                  background: 'var(--sapList_Background)', padding: '0.75rem', borderRadius: '4px',
                  margin: 0, overflow: 'auto', maxHeight: '300px' }}>
                  {tryPrettyPrint(response.body)}
                </pre>
              </div>
            </div>
          </Card>
        )}
      </FlexBox>
    </FlexBox>
  )
}

// ── Headers editor ─────────────────────────────────────────────────────────────

function HeadersEditor({ headers, onChange }: { headers: HeaderRow[]; onChange: (h: HeaderRow[]) => void }) {
  const update = (idx: number, field: 'key' | 'value', val: string) => {
    const updated = headers.map((h, i) => i === idx ? { ...h, [field]: val } : h)
    // Auto-append a blank row when the last row gets filled.
    const last = updated[updated.length - 1]
    if (last.key || last.value) updated.push({ key: '', value: '' })
    onChange(updated)
  }

  const remove = (idx: number) => {
    const updated = headers.filter((_, i) => i !== idx)
    if (updated.length === 0) updated.push({ key: '', value: '' })
    onChange(updated)
  }

  return (
    <div>
      <Label>Headers</Label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
        {headers.map((h, i) => (
          <FlexBox key={i} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.4rem' }}>
            <Input value={h.key}   placeholder="Header name"  style={{ flex: 1 }}
              onInput={(e) => update(i, 'key',   (e.target as any).value)} />
            <Input value={h.value} placeholder="Value"        style={{ flex: 1 }}
              onInput={(e) => update(i, 'value', (e.target as any).value)} />
            {headers.length > 1 && (
              <Button icon="decline" design="Transparent" style={{ minWidth: 'auto' }} onClick={() => remove(i)} />
            )}
          </FlexBox>
        ))}
      </div>
    </div>
  )
}

// ── Mock Receiver ──────────────────────────────────────────────────────────────

function MockReceiver() {
  const [scenarios,     setScenarios]     = useState<Scenario[]>([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')
  const [showAddScene,        setShowAddScene]        = useState(false)
  const [showAddMock,         setShowAddMock]         = useState<string | null>(null) // scenarioID
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

// ── Save asset panel ───────────────────────────────────────────────────────────

function SaveAssetPanel({ content, onSaved, onClose }: {
  content: string
  onSaved: () => void
  onClose: () => void
}) {
  const [name,        setName]        = useState('')
  const [contentType, setContentType] = useState(detectContentType(content))
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      await adapterFetch('/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), content, content_type: contentType }),
      })
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--sapList_BorderColor)', borderRadius: '4px',
      background: 'var(--sapList_Background)', padding: '0.5rem', marginBottom: '0.4rem',
      display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
        <Input placeholder="Asset name" value={name} style={{ flex: 1, minWidth: '160px' }}
          onInput={(e) => setName((e.target as any).value)} />
        <Select style={{ width: '100px' }}
          onChange={(e) => setContentType((e.detail.selectedOption as HTMLElement).dataset.value ?? 'text')}>
          {['xml', 'json', 'text', 'edi', 'csv'].map(t => (
            <Option key={t} data-value={t} selected={contentType === t}>{t}</Option>
          ))}
        </Select>
        <Button design="Emphasized" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        <Button design="Transparent" onClick={onClose}>Cancel</Button>
      </FlexBox>
      {error && <MessageStrip design="Negative">{error}</MessageStrip>}
    </div>
  )
}

function detectContentType(content: string): string {
  const trimmed = content.trimStart()
  if (trimmed.startsWith('<'))  return 'xml'
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'
  return 'text'
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function methodColor(method: string): string {
  const colors: Record<string, string> = {
    GET: '#61affe', POST: '#49cc90', PUT: '#fca130',
    DELETE: '#f93e3e', PATCH: '#50e3c2', HEAD: '#9012fe', OPTIONS: '#0d5aa7',
  }
  return colors[method] ?? 'inherit'
}

function tryPrettyPrint(body: string): string {
  try { return JSON.stringify(JSON.parse(body), null, 2) } catch { /* not JSON */ }
  return body
}
