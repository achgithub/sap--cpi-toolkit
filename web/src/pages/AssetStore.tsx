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
  Toolbar,
  ToolbarSpacer,
} from '@ui5/webcomponents-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Asset {
  id: string
  name: string
  content: string
  content_type: string
  created_at: string
}

// ── API ───────────────────────────────────────────────────────────────────────

const API = '/api/adapter/assets'

export async function saveAsset(name: string, content: string, contentType: string): Promise<Asset> {
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

// ── Content type colours ──────────────────────────────────────────────────────

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  xml:  { bg: '#0070f3', color: '#fff' },
  json: { bg: '#f59e0b', color: '#000' },
  edi:  { bg: '#8b5cf6', color: '#fff' },
  csv:  { bg: '#10b981', color: '#fff' },
  text: { bg: '#6b7280', color: '#fff' },
}

function TypeBadge({ type }: { type: string }) {
  const style = TYPE_STYLE[type] ?? TYPE_STYLE.text
  return (
    <span style={{
      background: style.bg, color: style.color,
      borderRadius: '0.75rem', padding: '0.1rem 0.6rem',
      fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
    }}>
      {type}
    </span>
  )
}

// ── Save to Assets button (used by tool pages) ────────────────────────────────

interface SaveButtonProps {
  content: string
  contentType: string
  suggestedName?: string
}

export function SaveToAssetsButton({ content, contentType, suggestedName = '' }: SaveButtonProps) {
  const [saving,  setSaving]  = useState(false)
  const [name,    setName]    = useState(suggestedName)
  const [showInput, setShowInput] = useState(false)
  const [feedback, setFeedback]  = useState('')

  const doSave = async () => {
    if (!name.trim() || !content) return
    setSaving(true)
    setFeedback('')
    try {
      await saveAsset(name.trim(), content, contentType)
      setFeedback('Saved!')
      setShowInput(false)
      setName(suggestedName)
      setTimeout(() => setFeedback(''), 2000)
    } catch (e: any) {
      setFeedback('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!content) return null

  return (
    <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
      {feedback && <Label style={{ color: feedback.startsWith('Error') ? 'var(--sapErrorColor)' : 'var(--sapSuccessColor)' }}>{feedback}</Label>}
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
      {showInput && <Button design="Transparent" onClick={() => setShowInput(false)}>✕</Button>}
    </FlexBox>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AssetStore() {
  const [assets,  setAssets]  = useState<Asset[]>([])
  const [error,   setError]   = useState('')
  const [preview, setPreview] = useState<Asset | null>(null)

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
      if (preview?.id === id) setPreview(null)
      await load()
    } catch (e: any) { setError(e.message) }
  }

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content).catch(() => {})
  }

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
      {error && <MessageStrip design="Negative" onClose={() => setError('')}>{error}</MessageStrip>}

      <Toolbar>
        <Label style={{ fontSize: '1.25rem', fontWeight: 600 }}>Asset Store</Label>
        <ToolbarSpacer />
        <Button design="Transparent" icon="refresh" onClick={load} />
      </Toolbar>

      {assets.length === 0 && (
        <MessageStrip design="Information" hideCloseButton>
          No assets yet. Use "Save to Assets" on the XML Formatter, JSON Formatter, or Converter output to store payloads here.
        </MessageStrip>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
        {assets.map(a => (
          <Card key={a.id} header={
            <CardHeader
              titleText={a.name}
              subtitleText={new Date(a.created_at).toLocaleString()}
              action={
                <FlexBox style={{ gap: '0.25rem' }}>
                  <Button design="Transparent" icon="copy" onClick={() => copyToClipboard(a.content)} tooltip="Copy content" />
                  <Button design="Transparent" icon="detail-view" onClick={() => setPreview(p => p?.id === a.id ? null : a)} tooltip="Preview" />
                  <Button design="Transparent" icon="delete" onClick={() => deleteAsset(a.id)} tooltip="Delete" />
                </FlexBox>
              }
            />
          }>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.5rem', padding: '0.5rem 1rem 1rem' }}>
              <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
                <TypeBadge type={a.content_type} />
                <Label style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.8rem' }}>
                  {a.content.length.toLocaleString()} chars
                </Label>
              </FlexBox>
              {preview?.id === a.id && (
                <pre style={{
                  margin: 0, padding: '0.5rem',
                  background: 'var(--sapField_Background)',
                  border: '1px solid var(--sapField_BorderColor)',
                  borderRadius: '4px', fontSize: '0.75rem',
                  maxHeight: '200px', overflow: 'auto',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {a.content.slice(0, 2000)}{a.content.length > 2000 ? '\n…' : ''}
                </pre>
              )}
            </FlexBox>
          </Card>
        ))}
      </div>
    </FlexBox>
  )
}
