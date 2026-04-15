import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Card,
  CardHeader,
  FlexBox,
  FlexBoxDirection,
  FlexBoxAlignItems,
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

export type AssetContentType = 'xml' | 'json' | 'edi' | 'csv' | 'text' | 'headers' | 'properties' | 'csrf-fetch'

export interface Asset {
  id: string
  name: string
  content: string
  content_type: AssetContentType
  created_at: string
}

// ── API ───────────────────────────────────────────────────────────────────────

const API = '/api/adapter/assets'

export async function saveAsset(name: string, content: string, contentType: AssetContentType): Promise<Asset> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content, content_type: contentType }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || res.statusText)
  }
  return res.json()
}

// ── Type metadata ─────────────────────────────────────────────────────────────

const TYPE_META: Record<AssetContentType, { label: string; bg: string; color: string; isKV: boolean }> = {
  xml:          { label: 'XML',        bg: '#0070f3', color: '#fff', isKV: false },
  json:         { label: 'JSON',       bg: '#f59e0b', color: '#000', isKV: false },
  edi:          { label: 'EDI',        bg: '#8b5cf6', color: '#fff', isKV: false },
  csv:          { label: 'CSV',        bg: '#10b981', color: '#fff', isKV: false },
  text:         { label: 'Text',       bg: '#6b7280', color: '#fff', isKV: false },
  headers:      { label: 'Headers',    bg: '#0f766e', color: '#fff', isKV: true  },
  properties:   { label: 'Properties', bg: '#9333ea', color: '#fff', isKV: true  },
  'csrf-fetch': { label: 'CSRF Fetch', bg: '#b45309', color: '#fff', isKV: true  },
}

const TYPE_ORDER: AssetContentType[] = ['xml', 'json', 'edi', 'csv', 'text', 'headers', 'properties', 'csrf-fetch']

function TypeBadge({ type }: { type: AssetContentType }) {
  const m = TYPE_META[type] ?? TYPE_META.text
  return (
    <span style={{
      background: m.bg, color: m.color, borderRadius: '0.75rem',
      padding: '0.1rem 0.6rem', fontSize: '0.75rem', fontWeight: 600,
    }}>
      {m.label}
    </span>
  )
}

// ── KV renderer ───────────────────────────────────────────────────────────────

function KVTable({ content }: { content: string }) {
  const rows = content.split('\n').filter(l => l.includes(':')).map(l => {
    const i = l.indexOf(':')
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string]
  })
  if (rows.length === 0) return <Label style={{ color: 'var(--sapContent_LabelColor)' }}>(empty)</Label>
  return (
    <div style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: '0.5rem', padding: '0.1rem 0' }}>
          <span style={{ color: 'var(--sapContent_LabelColor)', minWidth: '160px', flexShrink: 0 }}>{k}</span>
          <span style={{ color: 'var(--sapTextColor)', wordBreak: 'break-all' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

// ── SaveToAssetsButton ────────────────────────────────────────────────────────

interface SaveButtonProps {
  content: string
  contentType: AssetContentType
  suggestedName?: string
}

export function SaveToAssetsButton({ content, contentType, suggestedName = '' }: SaveButtonProps) {
  const [saving,    setSaving]    = useState(false)
  const [name,      setName]      = useState(suggestedName)
  const [showInput, setShowInput] = useState(false)
  const [feedback,  setFeedback]  = useState('')

  const doSave = async () => {
    if (!name.trim() || !content) return
    setSaving(true); setFeedback('')
    try {
      await saveAsset(name.trim(), content, contentType)
      setFeedback('Saved!')
      setShowInput(false)
      setName(suggestedName)
      setTimeout(() => setFeedback(''), 2500)
    } catch (e: any) {
      setFeedback('Error: ' + e.message)
    } finally { setSaving(false) }
  }

  if (!content) return null

  return (
    <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
      {feedback && (
        <Label style={{ color: feedback.startsWith('Error') ? 'var(--sapErrorColor)' : 'var(--sapSuccessColor)' }}>
          {feedback}
        </Label>
      )}
      {showInput && (
        <Input
          value={name}
          onInput={(e: any) => setName(e.target.value)}
          placeholder="Asset name…"
          style={{ width: '180px' }}
          onKeyDown={(e: any) => { if (e.key === 'Enter') doSave() }}
        />
      )}
      <Button
        design="Transparent"
        icon="save"
        onClick={() => showInput ? doSave() : setShowInput(true)}
        disabled={saving || (showInput && !name.trim())}
      >
        {showInput ? (saving ? 'Saving…' : 'Save') : 'Save to Assets'}
      </Button>
      {showInput && (
        <Button design="Transparent" onClick={() => setShowInput(false)}>✕</Button>
      )}
    </FlexBox>
  )
}

// ── LoadFromAssetButton ───────────────────────────────────────────────────────

interface LoadButtonProps {
  contentType: AssetContentType
  onLoad: (content: string) => void
}

export function LoadFromAssetButton({ contentType, onLoad }: LoadButtonProps) {
  const [open,    setOpen]    = useState(false)
  const [assets,  setAssets]  = useState<Asset[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const openPicker = async () => {
    if (open) { setOpen(false); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(API)
      if (!res.ok) throw new Error(res.statusText)
      const data: Asset[] = await res.json()
      setAssets((data ?? [])
        .filter(a => a.content_type === contentType)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
    setOpen(true)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <Button design="Transparent" icon="open-folder" onClick={openPicker} disabled={loading}>
        {loading ? 'Loading…' : 'Load from Asset'}
      </Button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 200,
          background: 'var(--sapList_Background)',
          border: '1px solid var(--sapList_BorderColor)',
          borderRadius: '0.25rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          minWidth: '220px', maxHeight: '240px', overflowY: 'auto',
        }}>
          {error && (
            <div style={{ padding: '0.5rem 0.75rem', color: 'var(--sapErrorColor)', fontSize: '0.82rem' }}>{error}</div>
          )}
          {!error && assets.length === 0 && (
            <div style={{ padding: '0.5rem 0.75rem', color: 'var(--sapContent_LabelColor)', fontSize: '0.82rem' }}>
              No {TYPE_META[contentType]?.label ?? contentType} assets saved yet
            </div>
          )}
          {assets.map(a => (
            <div
              key={a.id}
              style={{
                padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem',
                borderBottom: '1px solid var(--sapList_BorderColor)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--sapList_Hover_Background)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
              onClick={() => { onLoad(a.content); setOpen(false) }}
            >
              {a.name}
            </div>
          ))}
          <div
            style={{
              padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.78rem',
              color: 'var(--sapContent_LabelColor)', borderTop: '1px solid var(--sapList_BorderColor)',
            }}
            onClick={() => setOpen(false)}
          >
            ✕ Close
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AssetStore() {
  const [assets,  setAssets]  = useState<Asset[]>([])
  const [error,   setError]   = useState('')
  const [preview, setPreview] = useState<string | null>(null)

  // Manual add form
  const [showAdd,     setShowAdd]     = useState(false)
  const [addName,     setAddName]     = useState('')
  const [addType,     setAddType]     = useState<AssetContentType>('headers')
  const [addContent,  setAddContent]  = useState('')
  const [addSaving,   setAddSaving]   = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await fetch(API)
      if (!res.ok) throw new Error(res.statusText)
      const data: Asset[] = await res.json()
      setAssets((data ?? []).sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ))
    } catch (e: any) { setError(e.message) }
  }, [])

  useEffect(() => { load() }, [load])

  const deleteAsset = async (id: string) => {
    if (!window.confirm('Delete this asset?')) return
    try {
      const res = await fetch(API + '/' + id, { method: 'DELETE' })
      if (!res.ok) throw new Error(res.statusText)
      if (preview === id) setPreview(null)
      await load()
    } catch (e: any) { setError(e.message) }
  }

  const addManual = async () => {
    if (!addName.trim() || !addContent.trim()) return
    setAddSaving(true)
    try {
      await saveAsset(addName.trim(), addContent.trim(), addType)
      setShowAdd(false); setAddName(''); setAddContent(''); setAddType('headers')
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setAddSaving(false) }
  }

  const copyToClipboard = (content: string) => navigator.clipboard.writeText(content).catch(() => {})

  // Group assets by type in display order
  const grouped = TYPE_ORDER.map(type => ({
    type,
    items: assets.filter(a => a.content_type === type),
  })).filter(g => g.items.length > 0)

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
      {error && <MessageStrip design="Negative" onClose={() => setError('')}>{error}</MessageStrip>}

      <Toolbar>
        <Label style={{ fontSize: '1.25rem', fontWeight: 600 }}>Asset Store</Label>
        <ToolbarSpacer />
        <Button design="Transparent" icon="refresh" onClick={load} />
        <Button design="Emphasized" icon="add" onClick={() => setShowAdd(v => !v)}>Add Asset</Button>
      </Toolbar>

      {showAdd && (
        <Card header={<CardHeader titleText="Add Asset" />}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem', padding: '1rem' }}>
            <FlexBox style={{ gap: '1rem' }}>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 2 }}>
                <Label required>Name</Label>
                <Input value={addName} onInput={(e: any) => setAddName(e.target.value)}
                  placeholder="e.g. CPI Dev Headers" style={{ width: '100%' }} />
              </FlexBox>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
                <Label>Type</Label>
                <Select style={{ width: '100%' }} onChange={(e: any) => setAddType(e.detail.selectedOption.value)}>
                  {TYPE_ORDER.map(t => (
                    <Option key={t} value={t} selected={t === addType}>{TYPE_META[t].label}</Option>
                  ))}
                </Select>
              </FlexBox>
            </FlexBox>

            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label required>
                Content
                {TYPE_META[addType].isKV && (
                  <span style={{ color: 'var(--sapContent_LabelColor)', fontWeight: 400 }}>
                    {' '}(Key: Value, one per line)
                  </span>
                )}
              </Label>
              <TextArea
                value={addContent}
                onInput={(e: any) => setAddContent(e.target.value)}
                rows={addType === 'xml' || addType === 'json' || addType === 'edi' ? 10 : 5}
                style={{ width: '100%', fontFamily: 'monospace' }}
                placeholder={
                  addType === 'headers'    ? 'Content-Type: application/xml\nX-Correlation-ID: abc-123' :
                  addType === 'properties' ? 'SAP_Sender: SystemA\nSAP_MplCorrelationId: 123' :
                  addType === 'csrf-fetch' ? 'url: https://tenant.hana.ondemand.com/api/csrf\nmethod: HEAD' :
                  'Paste content here…'
                }
              />
            </FlexBox>

            <FlexBox style={{ gap: '0.5rem' }}>
              <Button onClick={() => { setShowAdd(false); setAddName(''); setAddContent('') }}>Cancel</Button>
              <Button design="Emphasized" onClick={addManual}
                disabled={addSaving || !addName.trim() || !addContent.trim()}>
                {addSaving ? 'Saving…' : 'Save'}
              </Button>
            </FlexBox>
          </FlexBox>
        </Card>
      )}

      {assets.length === 0 && !showAdd && (
        <MessageStrip design="Information" hideCloseButton>
          No assets yet. Use "Save to Assets" on any tool output, or click Add Asset to paste content directly.
        </MessageStrip>
      )}

      {grouped.map(({ type, items }) => (
        <FlexBox key={type} direction={FlexBoxDirection.Column} style={{ gap: '0.5rem' }}>
          <Label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--sapContent_LabelColor)' }}>
            <TypeBadge type={type} /> {TYPE_META[type].label}s
          </Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '0.75rem' }}>
            {items.map(a => (
              <Card key={a.id} header={
                <CardHeader
                  titleText={a.name}
                  subtitleText={new Date(a.created_at).toLocaleString()}
                  action={
                    <FlexBox style={{ gap: '0.25rem' }}>
                      <Button design="Transparent" icon="copy" onClick={() => copyToClipboard(a.content)} />
                      <Button design="Transparent" icon="detail-view"
                        onClick={() => setPreview(p => p === a.id ? null : a.id)} />
                      <Button design="Transparent" icon="delete" onClick={() => deleteAsset(a.id)} />
                    </FlexBox>
                  }
                />
              }>
                <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.5rem', padding: '0.5rem 1rem 1rem' }}>
                  <Label style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.8rem' }}>
                    {a.content.length.toLocaleString()} chars
                  </Label>
                  {preview === a.id && (
                    TYPE_META[a.content_type]?.isKV
                      ? <KVTable content={a.content} />
                      : (
                        <pre style={{
                          margin: 0, padding: '0.5rem',
                          background: 'var(--sapField_Background)',
                          border: '1px solid var(--sapField_BorderColor)',
                          borderRadius: '4px', fontSize: '0.75rem',
                          maxHeight: '180px', overflow: 'auto',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                        }}>
                          {a.content.slice(0, 2000)}{a.content.length > 2000 ? '\n…' : ''}
                        </pre>
                      )
                  )}
                </FlexBox>
              </Card>
            ))}
          </div>
        </FlexBox>
      ))}
    </FlexBox>
  )
}
