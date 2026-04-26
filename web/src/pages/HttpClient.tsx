import { useState, useEffect } from 'react'
import {
  Bar,
  Button,
  Card,
  Dialog,
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function HttpClient() {
  return <TestTool />
}

// ── Test Tool ──────────────────────────────────────────────────────────────────

function TestTool() {
  const [method,   setMethod]   = useState('GET')
  const [url,      setUrl]      = useState('')
  const [headers,  setHeaders]  = useState<HeaderRow[]>([{ key: '', value: '' }])
  const [body,     setBody]     = useState('')
  const [sending,  setSending]  = useState(false)
  const [response, setResponse] = useState<HttpResponse | null>(null)
  const [reqError, setReqError] = useState('')

  const [showBodyAssetPicker,   setShowBodyAssetPicker]   = useState(false)
  const [showBodyAssetSave,     setShowBodyAssetSave]     = useState(false)
  const [showRespAssetSave,     setShowRespAssetSave]     = useState(false)
  const [showReqAssetPicker,    setShowReqAssetPicker]    = useState(false)
  const [showReqAssetSave,      setShowReqAssetSave]      = useState(false)
  const [showHdrAssetPicker,    setShowHdrAssetPicker]    = useState(false)

  const requestAsJson = () => {
    const hdrs: Record<string, string> = {}
    headers.forEach(({ key, value }) => { if (key.trim()) hdrs[key.trim()] = value })
    return JSON.stringify({ method, url, headers: hdrs, body }, null, 2)
  }

  const loadRequestFromAsset = (a: Asset) => {
    try {
      const parsed = JSON.parse(a.content)
      if (parsed.method) setMethod(parsed.method)
      if (parsed.url)    setUrl(parsed.url)
      if (parsed.headers) {
        const rows: HeaderRow[] = Object.entries(parsed.headers as Record<string, string>).map(([k, v]) => ({ key: k, value: v }))
        setHeaders([...rows, { key: '', value: '' }])
      }
      if (parsed.body !== undefined) setBody(parsed.body)
    } catch { /* not a valid request asset */ }
    setShowReqAssetPicker(false)
  }

  const urlWarnings: string[] = []
  if (url !== url.trim())           urlWarnings.push('URL has leading or trailing whitespace — will be trimmed on send')
  if (/\s/.test(url.trim()))        urlWarnings.push('URL contains internal whitespace')
  if (/([^:])\/\//.test(url.trim())) urlWarnings.push('URL contains double slashes in the path')

  const sendRequest = async () => {
    const cleanUrl = url.trim()
    if (!cleanUrl) { setReqError('URL is required'); return }
    setSending(true)
    setResponse(null)
    setReqError('')
    try {
      const hdrs: Record<string, string> = {}
      headers.forEach(({ key, value }) => { if (key.trim()) hdrs[key.trim()] = value })

      const result = await workerFetch('/http-client/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method,
          url: cleanUrl,
          headers: hdrs,
          body: ['GET', 'HEAD', 'OPTIONS'].includes(method) ? '' : body,
        }),
      })

      setResponse(result)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setReqError(`Request failed: ${msg}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem' }}>

      {/* Method + URL */}
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
          </FlexBox>
          <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.4rem' }}>
            <Button design="Transparent" onClick={() => { setShowReqAssetPicker(v => !v); setShowReqAssetSave(false) }}>
              Load request
            </Button>
            <Button design="Transparent" onClick={() => { setShowReqAssetSave(v => !v); setShowReqAssetPicker(false) }}>
              Save request
            </Button>
          </FlexBox>
          {showReqAssetPicker && (
            <AssetPickerPanel
              onSelect={loadRequestFromAsset}
              onClose={() => setShowReqAssetPicker(false)}
            />
          )}
          {showReqAssetSave && (
            <SaveAssetPanel
              content={requestAsJson()}
              onSaved={() => setShowReqAssetSave(false)}
              onClose={() => setShowReqAssetSave(false)}
              lockedContentType="req"
            />
          )}
          {urlWarnings.map((w, i) => (
            <MessageStrip key={i} design="Information" hideCloseButton style={{ fontSize: '0.8rem' }}>{w}</MessageStrip>
          ))}
          {reqError && <MessageStrip design="Negative" onClose={() => setReqError('')}>{reqError}</MessageStrip>}
        </div>
      </Card>

      {/* Headers + Body */}
      <Card style={{ flexShrink: 0 }}>
        <div style={{ padding: '0.75rem' }}>
          <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween}
            style={{ marginBottom: '0.25rem' }}>
            <Label>Headers</Label>
            <Button design="Transparent" onClick={() => setShowHdrAssetPicker(true)}>
              Load headers
            </Button>
          </FlexBox>
          {showHdrAssetPicker && (
            <AssetPickerPanel
              defaultExtFilter="headers"
              onSelect={(a) => {
                const newRows = a.content.split('\n')
                  .filter(l => l.includes(':'))
                  .map(l => { const i = l.indexOf(':'); return { key: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } })
                if (newRows.length) {
                  setHeaders(prev => {
                    const existing = prev.filter(h => h.key.trim() !== '' || h.value.trim() !== '')
                    return [...existing, ...newRows, { key: '', value: '' }]
                  })
                }
                setShowHdrAssetPicker(false)
              }}
              onClose={() => setShowHdrAssetPicker(false)}
            />
          )}
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
                lockedContentType="req"
              />
            )}
            <TextArea value={body} rows={14} style={{ width: '100%', fontFamily: 'monospace' }}
              onInput={(e) => setBody((e.target as any).value)} />
          </div>
        </div>
      </Card>

      {/* Response */}
      {response && (
        <Card>
          <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            {/* Status line */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{
                fontSize: '1.4rem', fontWeight: 700, fontFamily: 'monospace',
                color: response.status < 400 ? 'var(--sapPositiveColor)' : 'var(--sapNegativeColor)',
              }}>
                {response.status}
              </span>
              <span style={{ fontSize: '0.9rem', color: 'var(--sapTextColor)', fontFamily: 'var(--sapFontFamily)' }}>
                {response.statusText}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', marginLeft: 'auto' }}>
                {response.durationMs} ms
              </span>
            </div>

            {/* Response headers */}
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)',
                fontFamily: 'var(--sapFontFamily)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Headers
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.78rem',
                background: 'var(--sapNeutralBackground)', padding: '0.5rem 0.75rem', borderRadius: '4px',
                display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                {Object.entries(response.headers).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>{k}:</span>
                    <span style={{ color: 'var(--sapTextColor)', wordBreak: 'break-all' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Response body */}
            <div>
              <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween}
                style={{ marginBottom: '0.35rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)',
                  fontFamily: 'var(--sapFontFamily)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Body
                </div>
                <Button design="Transparent" onClick={() => setShowRespAssetSave(v => !v)}>
                  Save as Asset
                </Button>
              </FlexBox>
              {showRespAssetSave && (
                <SaveAssetPanel
                  content={response.body}
                  onSaved={() => setShowRespAssetSave(false)}
                  onClose={() => setShowRespAssetSave(false)}
                  lockedContentType="req"
                />
              )}
              <pre style={{
                fontFamily: 'monospace', fontSize: '0.82rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                background: 'var(--sapNeutralBackground)', padding: '0.75rem', borderRadius: '4px', margin: 0,
              }}>
                {response.body ? tryPrettyPrint(response.body) : <span style={{ color: 'var(--sapContent_LabelColor)' }}>(empty body)</span>}
              </pre>
            </div>

          </div>
        </Card>
      )}
    </FlexBox>
  )
}

// ── Headers editor ─────────────────────────────────────────────────────────────

function HeadersEditor({ headers, onChange }: { headers: HeaderRow[]; onChange: (h: HeaderRow[]) => void }) {
  const update = (idx: number, field: 'key' | 'value', val: string) => {
    const updated = headers.map((h, i) => i === idx ? { ...h, [field]: val } : h)
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

// ── Asset picker modal ─────────────────────────────────────────────────────────

const ASSET_EXT_OPTIONS = ['req', 'xml', 'json', 'text', 'edi', 'csv']

function AssetPickerPanel({ onSelect, onClose, defaultExtFilter = 'req' }: {
  onSelect: (a: Asset) => void
  onClose: () => void
  defaultExtFilter?: string
}) {
  const [assets,     setAssets]     = useState<Asset[]>([])
  const [loading,    setLoading]    = useState(true)
  const [nameFilter, setNameFilter] = useState('')
  const [extFilter,  setExtFilter]  = useState(defaultExtFilter)

  useEffect(() => {
    adapterFetch('/assets')
      .then((data: Asset[]) => setAssets(data))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false))
  }, [])

  const visible = assets.filter(a => {
    const matchesName = !nameFilter || a.name.toLowerCase().includes(nameFilter.toLowerCase())
    const matchesExt  = extFilter === '' || a.content_type === extFilter
    return matchesName && matchesExt
  })

  return (
    <Dialog
      open
      headerText="Load Asset"
      style={{ width: '480px' }}
      footer={
        <Bar endContent={
          <Button design="Transparent" onClick={onClose}>Close</Button>
        } />
      }
      onClose={onClose}
    >
      <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.4rem' }}>
          <Input placeholder="Filter by name…" value={nameFilter} style={{ flex: 1 }}
            onInput={(e) => setNameFilter((e.target as any).value)} />
          <Select style={{ width: '95px' }}
            onChange={(e) => setExtFilter((e.detail.selectedOption as HTMLElement).dataset.value ?? '')}>
            <Option data-value="" selected={extFilter === ''}>All</Option>
            {ASSET_EXT_OPTIONS.map(ext => (
              <Option key={ext} data-value={ext} selected={extFilter === ext}>.{ext}</Option>
            ))}
          </Select>
        </FlexBox>

        {loading && (
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--sapContent_LabelColor)',
            fontFamily: 'var(--sapFontFamily)' }}>Loading…</p>
        )}
        {!loading && visible.length === 0 && (
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--sapContent_LabelColor)',
            fontFamily: 'var(--sapFontFamily)' }}>
            No assets found. Save content as an asset from another tool first.
          </p>
        )}

        <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          {visible.map(a => (
            <FlexBox key={a.id} alignItems={FlexBoxAlignItems.Center}
              justifyContent={FlexBoxJustifyContent.SpaceBetween}
              style={{
                padding: '0.4rem 0.6rem', cursor: 'pointer', borderRadius: '4px',
                border: '1px solid var(--sapList_BorderColor)',
                background: 'var(--sapList_Background)',
              }}
              onClick={() => { onSelect(a); onClose() }}>
              <span style={{ fontSize: '0.82rem', fontFamily: 'var(--sapFontFamily)' }}>{a.name}</span>
              <span style={{
                fontSize: '0.72rem', fontFamily: 'monospace',
                color: 'var(--sapContent_LabelColor)',
                background: 'var(--sapNeutralBackground)',
                padding: '0.1rem 0.4rem', borderRadius: '3px',
                border: '1px solid var(--sapNeutralBorderColor)',
              }}>
                .{a.content_type}
              </span>
            </FlexBox>
          ))}
        </div>
      </div>
    </Dialog>
  )
}

// ── Save asset panel ───────────────────────────────────────────────────────────

function SaveAssetPanel({ content, onSaved, onClose, lockedContentType }: {
  content: string
  onSaved: () => void
  onClose: () => void
  lockedContentType?: string
}) {
  const [name,        setName]        = useState('')
  const [contentType, setContentType] = useState(lockedContentType ?? detectContentType(content))
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
        {lockedContentType ? (
          <span style={{
            padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem',
            fontFamily: 'monospace', background: 'var(--sapNeutralBackground)',
            border: '1px solid var(--sapNeutralBorderColor)', color: 'var(--sapContent_LabelColor)',
          }}>.{lockedContentType}</span>
        ) : (
          <Select style={{ width: '100px' }}
            onChange={(e) => setContentType((e.detail.selectedOption as HTMLElement).dataset.value ?? 'text')}>
            {['xml', 'json', 'text', 'edi', 'csv'].map(t => (
              <Option key={t} data-value={t} selected={contentType === t}>{t}</Option>
            ))}
          </Select>
        )}
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

function tryPrettyPrint(body: string): string {
  try { return JSON.stringify(JSON.parse(body), null, 2) } catch { /* not JSON */ }
  return body
}
