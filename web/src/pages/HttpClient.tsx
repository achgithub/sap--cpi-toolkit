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
  TextArea,
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
  return <TestTool />
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

        {/* Headers + Body */}
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
