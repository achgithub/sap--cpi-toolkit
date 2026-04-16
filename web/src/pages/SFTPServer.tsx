import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Button,
  Card,
  CardHeader,
  FlexBox,
  FlexBoxDirection,
  Icon,
  Input,
  Label,
  MessageStrip,
  Option,
  Select,
  TextArea,
  Toolbar,
  ToolbarSpacer,
} from '@ui5/webcomponents-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SFTPConfig {
  credentials: { username: string; password: string }
  auth_mode: string
  ssh_host_key_fingerprint: string
  ssh_public_key: string
}

interface SFTPEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size: number
  mod_time: string
  permissions: number  // Unix mode bits, e.g. 0o644 = 420
}


// ── Helpers ───────────────────────────────────────────────────────────────────

const API = '/api/adapter'

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(API + path, opts)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || res.statusText)
  }
  if (res.status === 204 || res.status === 201) return null
  return res.json()
}

// ── FolderPicker ──────────────────────────────────────────────────────────────
// Inline folder browser used inside the "Move to…" modal.

interface FolderPickerProps {
  /** The path of the item being moved — excluded from the selectable list */
  excludePath: string
  onSelect: (path: string) => void
  onCancel: () => void
}

function FolderPicker({ excludePath, onSelect, onCancel }: FolderPickerProps) {
  const [browsePath, setBrowsePath] = useState('/')
  const [folders,    setFolders]    = useState<SFTPEntry[]>([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  const load = useCallback(async (p: string) => {
    setLoading(true); setError('')
    try {
      const data: SFTPEntry[] = await apiFetch(`/sftp/files?path=${encodeURIComponent(p)}`)
      setFolders((data ?? []).filter(e => e.type === 'dir').sort((a, b) => a.name.localeCompare(b.name)))
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(browsePath) }, [browsePath, load])

  // breadcrumb segments for the picker
  const segments = useMemo(() => {
    if (browsePath === '/') return [{ label: 'Home', path: '/' }]
    const parts = browsePath.slice(1).split('/')
    return [
      { label: 'Home', path: '/' },
      ...parts.map((part, i) => ({ label: part, path: '/' + parts.slice(0, i + 1).join('/') })),
    ]
  }, [browsePath])

  const isExcluded = (entry: SFTPEntry) =>
    entry.path === excludePath || entry.path.startsWith(excludePath + '/')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Mini breadcrumb */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap',
        padding: '0.4rem 0.75rem',
        background: 'var(--sapShell_Background)',
        border: '1px solid var(--sapList_BorderColor)',
        borderRadius: '6px', fontSize: '0.8rem',
      }}>
        {segments.map((seg, i) => (
          <span key={seg.path} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {i > 0 && <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.6rem' }}>›</span>}
            {i < segments.length - 1 ? (
              <button onClick={() => setBrowsePath(seg.path)} style={{
                background: 'none', border: 'none', padding: '0.1rem 0.3rem',
                color: 'var(--sapLinkColor)', cursor: 'pointer', fontSize: '0.8rem',
                borderRadius: '3px', fontFamily: 'inherit',
              }}>
                {seg.label}
              </button>
            ) : (
              <span style={{ fontWeight: 600, padding: '0 0.2rem' }}>{seg.label}</span>
            )}
          </span>
        ))}
        {loading && <span style={{ color: 'var(--sapContent_LabelColor)', marginLeft: '0.5rem' }}>…</span>}
      </div>

      {error && <span style={{ fontSize: '0.8rem', color: 'var(--sapNegativeColor)' }}>{error}</span>}

      {/* Folder list */}
      <div style={{
        border: '1px solid var(--sapList_BorderColor)',
        borderRadius: '6px', overflow: 'hidden',
        maxHeight: '16rem', overflowY: 'auto',
      }}>
        {/* "Select this folder" row — always at top */}
        <div
          onClick={() => onSelect(browsePath)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.5rem 0.75rem',
            background: 'color-mix(in srgb, var(--sapHighlightColor) 8%, transparent)',
            borderBottom: '1px solid var(--sapList_BorderColor)',
            cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500,
            color: 'var(--sapHighlightColor)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'color-mix(in srgb, var(--sapHighlightColor) 16%, transparent)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'color-mix(in srgb, var(--sapHighlightColor) 8%, transparent)' }}
        >
          <Icon name="accept" style={{ fontSize: '1rem', color: 'var(--sapHighlightColor)' }} />
          Move here — <code style={{ fontFamily: 'monospace', fontWeight: 400, fontSize: '0.8rem' }}>{browsePath}</code>
        </div>

        {/* Sub-folders */}
        {folders.length === 0 && !loading && (
          <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', textAlign: 'center' }}>
            No sub-folders
          </div>
        )}
        {folders.filter(f => !isExcluded(f)).map(f => (
          <div
            key={f.path}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.4rem 0.75rem',
              borderBottom: '1px solid var(--sapList_BorderColor)',
              cursor: 'pointer', fontSize: '0.875rem',
              background: 'var(--sapList_Background)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Hover_Background)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Background)' }}
            onClick={() => setBrowsePath(f.path)}
          >
            <Icon name="folder" style={{ fontSize: '1rem', color: 'var(--sapHighlightColor)', flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{f.name}</span>
            <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.75rem' }}>›</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

// ── AssetPicker ───────────────────────────────────────────────────────────────

interface Asset {
  id: string
  name: string
  content: string
  content_type: string
  created_at: string
}

interface AssetPickerProps {
  onSelect: (asset: Asset) => void
  onCancel: () => void
}

function AssetPicker({ onSelect, onCancel }: AssetPickerProps) {
  const [assets,  setAssets]  = useState<Asset[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [filter,  setFilter]  = useState('')

  useEffect(() => {
    setLoading(true)
    apiFetch('/assets')
      .then(data => setAssets(data ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = assets.filter(a =>
    a.name.toLowerCase().includes(filter.toLowerCase()) ||
    a.content_type.toLowerCase().includes(filter.toLowerCase())
  )

  const typeIcon: Record<string, string> = {
    xml: 'document-text', json: 'document-text', csv: 'table-view',
    edi: 'document', text: 'document',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <Input
        placeholder="Filter assets…"
        value={filter}
        onInput={(e: any) => setFilter(e.target.value)}
        style={{ width: '100%' }}
      />
      {error && <span style={{ fontSize: '0.8rem', color: 'var(--sapNegativeColor)' }}>{error}</span>}
      <div style={{
        border: '1px solid var(--sapList_BorderColor)',
        borderRadius: '6px', overflow: 'hidden',
        maxHeight: '18rem', overflowY: 'auto',
      }}>
        {loading && (
          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--sapContent_LabelColor)', fontSize: '0.875rem' }}>
            Loading…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--sapContent_LabelColor)', fontSize: '0.875rem' }}>
            {assets.length === 0 ? 'No assets saved yet' : 'No matching assets'}
          </div>
        )}
        {filtered.map(a => (
          <div
            key={a.id}
            onClick={() => onSelect(a)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.5rem 0.75rem',
              borderBottom: '1px solid var(--sapList_BorderColor)',
              cursor: 'pointer', background: 'var(--sapList_Background)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Hover_Background)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Background)' }}
          >
            <Icon name={typeIcon[a.content_type] ?? 'document'} style={{ fontSize: '1rem', color: 'var(--sapHighlightColor)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: '0.875rem' }}>{a.name}</span>
            <span style={{
              fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
              color: 'var(--sapContent_LabelColor)',
              background: 'var(--sapShell_Background)',
              border: '1px solid var(--sapList_BorderColor)',
              borderRadius: '3px', padding: '0.1rem 0.35rem',
            }}>{a.content_type}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const day   = String(d.getDate()).padStart(2, '0')
  const month = d.toLocaleString('en-GB', { month: 'short' })
  const time  = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${day} ${month}  ${time}`
}

function joinPath(dir: string, name: string): string {
  return dir === '/' ? `/${name}` : `${dir}/${name}`
}

// ── Shared styles ─────────────────────────────────────────────────────────────

// Icon is embedded inside the name cell — avoids web-component grid sizing quirks.
const COLS = 'minmax(0, 1fr) 90px 160px 5rem'

const ROW_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: COLS,
  alignItems: 'center',
  columnGap: '1.25rem',
  padding: '0 1rem',
  height: '2.75rem',
  borderBottom: '1px solid var(--sapList_BorderColor)',
  background: 'var(--sapList_Background)',
  cursor: 'default',
}

const HEADER_ROW_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: COLS,
  alignItems: 'center',
  columnGap: '1.25rem',
  padding: '0 1rem',
  height: '2rem',
  borderBottom: '2px solid var(--sapList_BorderColor)',
  background: 'var(--sapList_HeaderBackground, var(--sapShell_Background))',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'var(--sapContent_LabelColor)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SFTPServer() {

  // ── Config state ─────────────────────────────────────────────────────────────
  const [config,   setConfig]   = useState<SFTPConfig | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState('password')
  const [pubKey,   setPubKey]   = useState('')

  // ── File browser state ───────────────────────────────────────────────────────
  const [currentPath,    setCurrentPath]    = useState('/')
  const [items,          setItems]          = useState<SFTPEntry[]>([])
  const [loading,        setLoading]        = useState(false)
  // dropTarget: null = no drag, 'bg' = hovering background, path = hovering a folder/breadcrumb target
  const [dropTarget,     setDropTarget]     = useState<string | null>(null)
  // isDragging: true while an internal drag is in progress (drives breadcrumb highlight)
  const [isDragging,     setIsDragging]     = useState(false)
  // moveDialog: non-null when the "Move to…" modal is open
  const [moveDialog,     setMoveDialog]     = useState<{ entry: SFTPEntry } | null>(null)
  const [showAssetPicker, setShowAssetPicker] = useState(false)
  const [showNewFile,    setShowNewFile]    = useState(false)
  const [showNewFolder,  setShowNewFolder]  = useState(false)
  const [newFileName,    setNewFileName]    = useState('')
  const [newFileContent, setNewFileContent] = useState('')
  const [newFolderName,  setNewFolderName]  = useState('')

  const fileInputRef  = useRef<HTMLInputElement>(null)
  // tracks the item being internally dragged (null when dragging from desktop)
  const dragItemRef   = useRef<SFTPEntry | null>(null)

  // ── Derived ──────────────────────────────────────────────────────────────────

  const pathSegments = useMemo(() => {
    if (currentPath === '/') return [{ label: 'Home', path: '/' }]
    const parts = currentPath.slice(1).split('/')
    return [
      { label: 'Home', path: '/' },
      ...parts.map((part, i) => ({
        label: part,
        path: '/' + parts.slice(0, i + 1).join('/'),
      })),
    ]
  }, [currentPath])

  const dirs  = useMemo(() => items.filter(e => e.type === 'dir').sort((a, b) => a.name.localeCompare(b.name)),  [items])
  const files = useMemo(() => items.filter(e => e.type === 'file').sort((a, b) => a.name.localeCompare(b.name)), [items])

  // ── Config load / save ───────────────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    try {
      const data: SFTPConfig = await apiFetch('/sftp')
      setConfig(data)
      setUsername(data.credentials?.username ?? '')
      setPassword(data.credentials?.password ?? '')
      setAuthMode(data.auth_mode ?? 'password')
      setPubKey(data.ssh_public_key ?? '')
    } catch (e: any) { setError(e.message) }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  const save = async () => {
    setSaving(true); setError(''); setSuccess('')
    try {
      await apiFetch('/sftp', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: { username, password }, auth_mode: authMode, ssh_public_key: pubKey }),
      })
      setSuccess('Configuration saved.')
      await loadConfig()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const regenerateKey = async () => {
    if (!window.confirm('Regenerate the SSH host key? Clients will see a changed-key warning.')) return
    try {
      const res = await apiFetch('/sftp/regenerate-key', { method: 'POST' })
      setSuccess('Host key regenerated. New fingerprint: ' + res.fingerprint)
      await loadConfig()
    } catch (e: any) { setError(e.message) }
  }

  // ── File browser ─────────────────────────────────────────────────────────────

  const loadPath = useCallback(async (path: string) => {
    setLoading(true)
    try {
      const data: SFTPEntry[] = await apiFetch(`/sftp/files?path=${encodeURIComponent(path)}`)
      setItems(data ?? [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPath(currentPath) }, [currentPath, loadPath])

  const navigate = (path: string) => {
    setCurrentPath(path)
    setShowNewFile(false)
    setShowNewFolder(false)
    setNewFileName(''); setNewFileContent(''); setNewFolderName('')
  }

  const uploadFilesTo = async (fileList: File[], targetPath: string) => {
    const fd = new FormData()
    fileList.forEach(f => fd.append('files', f))
    try {
      const res = await fetch(`${API}/sftp/upload?path=${encodeURIComponent(targetPath)}`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Upload failed')
      setSuccess(`Uploaded ${fileList.length} file(s) to ${targetPath}`)
      await loadPath(currentPath)
    } catch (e: any) { setError(e.message) }
  }

  const moveEntry = async (fromPath: string, toFolderPath: string) => {
    const name = fromPath.split('/').pop()!
    const toPath = toFolderPath === '/' ? `/${name}` : `${toFolderPath}/${name}`
    try {
      await apiFetch('/sftp/move', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromPath, to: toPath }),
      })
      await loadPath(currentPath)
    } catch (e: any) { setError(e.message) }
  }

  // Drop handler for the outer background zone — only fires for desktop file drops
  const handleBgDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDropTarget(null); setIsDragging(false)
    // Ignore if it was an internal drag (internal drops are handled by folder rows or ignored)
    if (dragItemRef.current) { dragItemRef.current = null; return }
    const fileList = Array.from(e.dataTransfer.files)
    if (fileList.length) await uploadFilesTo(fileList, currentPath)
  }

  // Drop handler for a specific folder row
  const handleFolderDrop = async (e: React.DragEvent, dir: SFTPEntry) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null); setIsDragging(false)
    const internalPath = e.dataTransfer.getData('text/sftp-path')
    if (internalPath) {
      if (internalPath !== dir.path) await moveEntry(internalPath, dir.path)
      dragItemRef.current = null
      return
    }
    // desktop upload into the folder row
    const fileList = Array.from(e.dataTransfer.files)
    if (fileList.length) await uploadFilesTo(fileList, dir.path)
  }

  // Drop handler for breadcrumb ancestor segments — moves item up the tree
  const handleBreadcrumbDrop = async (e: React.DragEvent, destPath: string) => {
    e.preventDefault()
    setDropTarget(null); setIsDragging(false)
    const internalPath = e.dataTransfer.getData('text/sftp-path')
    if (internalPath && internalPath !== destPath) {
      await moveEntry(internalPath, destPath)
    }
    dragItemRef.current = null
  }


  const createFile = async () => {
    if (!newFileName.trim()) return
    try {
      await apiFetch('/sftp/files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: joinPath(currentPath, newFileName.trim()), content: newFileContent }),
      })
      setShowNewFile(false); setNewFileName(''); setNewFileContent('')
      await loadPath(currentPath)
    } catch (e: any) { setError(e.message) }
  }

  const createFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await apiFetch('/sftp/mkdir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: joinPath(currentPath, newFolderName.trim()) }),
      })
      setShowNewFolder(false); setNewFolderName('')
      await loadPath(currentPath)
    } catch (e: any) { setError(e.message) }
  }

  const deleteEntry = async (entry: SFTPEntry) => {
    const label = entry.type === 'dir' ? `folder "${entry.name}" and all its contents` : `"${entry.name}"`
    if (!window.confirm(`Delete ${label}?`)) return
    try {
      await apiFetch(`/sftp/files?path=${encodeURIComponent(entry.path)}`, { method: 'DELETE' })
      await loadPath(currentPath)
    } catch (e: any) { setError(e.message) }
  }

  const loadAsset = async (asset: Asset) => {
    setShowAssetPicker(false)
    try {
      await apiFetch('/sftp/files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: joinPath(currentPath, asset.name), content: asset.content }),
      })
      setSuccess(`Asset "${asset.name}" loaded into ${currentPath}`)
      await loadPath(currentPath)
    } catch (e: any) { setError(e.message) }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
      <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
        onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) uploadFilesTo(f, currentPath); e.target.value = '' }} />

      {error   && <MessageStrip design="Negative" onClose={() => setError('')}>{error}</MessageStrip>}
      {success && <MessageStrip design="Positive" onClose={() => setSuccess('')}>{success}</MessageStrip>}

      <Toolbar>
        <Label style={{ fontSize: '1.25rem', fontWeight: 600 }}>SFTP Server</Label>
        <ToolbarSpacer />
        <Button design="Transparent" icon="refresh" onClick={loadConfig} />
        <Button design="Emphasized" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </Toolbar>

      {/* ── Auth + Host Key ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

        <Card header={<CardHeader titleText="Authentication" />}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem', padding: '0.75rem 1rem 1rem' }}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label>Auth Mode</Label>
              <Select style={{ width: '100%' }} onChange={(e: any) => setAuthMode(e.detail.selectedOption.value)}>
                <Option value="password" selected={authMode === 'password'}>Password only</Option>
                <Option value="key"      selected={authMode === 'key'}>Public key only</Option>
                <Option value="any"      selected={authMode === 'any'}>Password or key</Option>
              </Select>
            </FlexBox>
            {(authMode === 'password' || authMode === 'any') && (<>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                <Label>Username</Label>
                <Input value={username} onInput={(e: any) => setUsername(e.target.value)} style={{ width: '100%' }} />
              </FlexBox>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                <Label>Password</Label>
                <Input type="Password" value={password} onInput={(e: any) => setPassword(e.target.value)} style={{ width: '100%' }} />
              </FlexBox>
            </>)}
            {(authMode === 'key' || authMode === 'any') && (
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                <Label>Authorized Public Key (authorized_keys format — blank = accept any)</Label>
                <TextArea value={pubKey} onInput={(e: any) => setPubKey(e.target.value)}
                  rows={4} style={{ width: '100%', fontFamily: 'monospace' }} />
              </FlexBox>
            )}
          </FlexBox>
        </Card>

        <Card header={<CardHeader titleText="SSH Host Key" />}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem', padding: '0.75rem 1rem 1rem' }}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label>Fingerprint</Label>
              <code style={{
                background: 'var(--sapField_Background)', border: '1px solid var(--sapField_BorderColor)',
                borderRadius: '4px', padding: '0.5rem', fontSize: '0.85rem', wordBreak: 'break-all', display: 'block',
              }}>
                {config?.ssh_host_key_fingerprint || '—'}
              </code>
            </FlexBox>
            <Label style={{ color: 'var(--sapCriticalTextColor)', fontSize: '0.85rem' }}>
              sftp -P 2222 {username || 'user'}@localhost
            </Label>
            <Button design="Attention" onClick={regenerateKey} style={{ alignSelf: 'flex-start' }}>
              Regenerate Host Key
            </Button>
          </FlexBox>
        </Card>
      </div>

      {/* ── File System ─────────────────────────────────────────────────────── */}
      <Card>
        {/* ── Navigation bar ─────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.25rem',
          padding: '0 1rem', height: '3rem',
          borderBottom: '1px solid var(--sapList_BorderColor)',
          background: 'var(--sapShell_Background)',
        }}>
          {/* Breadcrumb — ancestors become drop targets when an internal drag is active */}
          {pathSegments.map((seg, i) => {
            const isAncestor = i < pathSegments.length - 1
            const isBreadcrumbTarget = isDragging && isAncestor && dropTarget === seg.path
            return (
              <span key={seg.path} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {i > 0 && <Icon name="slim-arrow-right" style={{ fontSize: '0.625rem', color: 'var(--sapContent_LabelColor)' }} />}
                {isAncestor ? (
                  <button
                    onClick={() => navigate(seg.path)}
                    onDragOver={isDragging ? e => { e.preventDefault(); setDropTarget(seg.path) } : undefined}
                    onDragLeave={isDragging ? () => setDropTarget(null) : undefined}
                    onDrop={isDragging ? e => handleBreadcrumbDrop(e, seg.path) : undefined}
                    style={{
                      background: isBreadcrumbTarget ? 'var(--sapList_SelectionBackgroundColor)' : 'none',
                      border: isBreadcrumbTarget ? '1px solid var(--sapHighlightColor)' : '1px solid transparent',
                      padding: '0.2rem 0.4rem',
                      color: 'var(--sapLinkColor)', cursor: isDragging ? 'copy' : 'pointer',
                      fontSize: '0.875rem', borderRadius: '4px',
                      fontFamily: 'inherit',
                      transition: 'background 0.1s, border-color 0.1s',
                    }}
                  >
                    {seg.label}
                  </button>
                ) : (
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, padding: '0 0.25rem' }}>
                    {seg.label}
                  </span>
                )}
              </span>
            )
          })}
          {loading && (
            <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)' }}>
              loading…
            </span>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Actions */}
          <Button icon="add"           onClick={() => { setShowNewFile(v => !v); setShowNewFolder(false) }}>New File</Button>
          <Button icon="folder"        onClick={() => { setShowNewFolder(v => !v); setShowNewFile(false) }} style={{ marginLeft: '0.5rem' }}>New Folder</Button>
          <Button icon="upload"        onClick={() => fileInputRef.current?.click()} style={{ marginLeft: '0.5rem' }}>Upload</Button>
          <Button icon="open-folder"   onClick={() => setShowAssetPicker(true)} style={{ marginLeft: '0.5rem' }}>Load Asset</Button>
          <Button design="Transparent" icon="refresh" onClick={() => loadPath(currentPath)} style={{ marginLeft: '0.25rem' }} />
        </div>

        {/* ── New Folder form ─────────────────────────────────────────────── */}
        {showNewFolder && (
          <div style={{
            padding: '0.75rem 1rem',
            borderBottom: '1px solid var(--sapList_BorderColor)',
            background: 'var(--sapField_Background)',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
          }}>
            <Icon name="folder" style={{ color: 'var(--sapHighlightColor)' }} />
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onInput={(e: any) => setNewFolderName(e.target.value)}
              onKeyDown={(e: any) => {
                if (e.key === 'Enter') createFolder()
                if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') }
              }}
              style={{ flex: 1 }}
            />
            <Button design="Emphasized" onClick={createFolder} disabled={!newFolderName.trim()}>Create</Button>
            <Button onClick={() => { setShowNewFolder(false); setNewFolderName('') }}>Cancel</Button>
          </div>
        )}

        {/* ── New File form ───────────────────────────────────────────────── */}
        {showNewFile && (
          <div style={{
            padding: '0.75rem 1rem',
            borderBottom: '1px solid var(--sapList_BorderColor)',
            background: 'var(--sapField_Background)',
            display: 'flex', flexDirection: 'column', gap: '0.5rem',
          }}>
            <FlexBox style={{ gap: '0.75rem', alignItems: 'center' }}>
              <Icon name="document" />
              <Input
                placeholder="filename.xml"
                value={newFileName}
                onInput={(e: any) => setNewFileName(e.target.value)}
                style={{ flex: 1 }}
              />
            </FlexBox>
            <TextArea
              placeholder="File content (optional)"
              value={newFileContent}
              onInput={(e: any) => setNewFileContent(e.target.value)}
              rows={4}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
            <FlexBox style={{ gap: '0.5rem' }}>
              <Button design="Emphasized" onClick={createFile} disabled={!newFileName.trim()}>Create File</Button>
              <Button onClick={() => { setShowNewFile(false); setNewFileName(''); setNewFileContent('') }}>Cancel</Button>
            </FlexBox>
          </div>
        )}

        {/* ── File list ───────────────────────────────────────────────────── */}
        <div
          onDragOver={e => { e.preventDefault(); if (dropTarget !== 'bg') setDropTarget('bg') }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null) }}
          onDrop={handleBgDrop}
          style={{ position: 'relative', minHeight: '12rem' }}
        >
          {/* Drag overlay — only show for background drops, not when hovering a folder row */}
          {dropTarget === 'bg' && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              background: 'color-mix(in srgb, var(--sapHighlightColor) 10%, transparent)',
              border: '2px dashed var(--sapHighlightColor)',
              borderRadius: '0 0 8px 8px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              pointerEvents: 'none',
            }}>
              <Icon name="upload" style={{ fontSize: '2rem', color: 'var(--sapHighlightColor)' }} />
              <span style={{ fontWeight: 600, color: 'var(--sapHighlightColor)' }}>
                Drop to upload into {currentPath}
              </span>
            </div>
          )}

          {/* Column headers — only show when there are items */}
          {(dirs.length > 0 || files.length > 0) && (
            <div style={HEADER_ROW_STYLE}>
              <span>Name</span>
              <span style={{ textAlign: 'right' }}>Size</span>
              <span style={{ textAlign: 'right' }}>Modified</span>
              <span />
            </div>
          )}

          {/* Folder rows */}
          {dirs.map(dir => {
            const isDroppingHere = dropTarget === dir.path
            return (
              <div
                key={dir.path}
                draggable
                onDragStart={e => {
                  dragItemRef.current = dir
                  e.dataTransfer.setData('text/sftp-path', dir.path)
                  e.dataTransfer.effectAllowed = 'move'
                  setIsDragging(true)
                }}
                onDragEnd={() => { dragItemRef.current = null; setDropTarget(null); setIsDragging(false) }}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget(dir.path) }}
                onDragLeave={e => { e.stopPropagation(); setDropTarget(t => t === dir.path ? 'bg' : t) }}
                onDrop={e => handleFolderDrop(e, dir)}
                onClick={() => navigate(dir.path)}
                style={{
                  ...ROW_STYLE, cursor: 'pointer',
                  background: isDroppingHere
                    ? 'var(--sapList_SelectionBackgroundColor)'
                    : 'var(--sapList_Background)',
                  outline: isDroppingHere ? '2px solid var(--sapHighlightColor)' : 'none',
                  outlineOffset: '-2px',
                }}
                onMouseEnter={e => { if (!isDroppingHere) (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Hover_Background)' }}
                onMouseLeave={e => { if (!isDroppingHere) (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Background)' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <Icon name="folder" style={{ color: 'var(--sapHighlightColor)', fontSize: '1rem', flexShrink: 0 }} />
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dir.name}</span>
                </span>
                <span />
                <span />
                <span style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.25rem' }}>
                  <button
                    onClick={e => { e.stopPropagation(); setMoveDialog({ entry: dir }) }}
                    title="Move to…"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem',
                      color: 'var(--sapHighlightColor)', fontSize: '0.875rem', lineHeight: 1,
                      borderRadius: '4px', opacity: 0.5, fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.5' }}
                  >
                    →
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteEntry(dir) }}
                    title="Delete folder"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem',
                      color: 'var(--sapNegativeColor)', fontSize: '0.875rem', lineHeight: 1,
                      borderRadius: '4px', opacity: 0.6,
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.6' }}
                  >
                    ✕
                  </button>
                </span>
              </div>
            )
          })}

          {/* File rows */}
          {files.map(file => (
            <div
              key={file.path}
              draggable
              onDragStart={e => {
                dragItemRef.current = file
                e.dataTransfer.setData('text/sftp-path', file.path)
                e.dataTransfer.effectAllowed = 'move'
                setIsDragging(true)
              }}
              onDragEnd={() => { dragItemRef.current = null; setDropTarget(null); setIsDragging(false) }}
              style={{ ...ROW_STYLE, cursor: 'grab' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Hover_Background)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--sapList_Background)' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                <Icon name="document" style={{ fontSize: '1rem', color: 'var(--sapContent_LabelColor)', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
              </span>
              <span style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
                {formatSize(file.size)}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)', textAlign: 'right' }}>
                {formatDate(file.mod_time)}
              </span>
              <span style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.25rem' }}>
                <button
                  onClick={() => setMoveDialog({ entry: file })}
                  title="Move to…"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem',
                    color: 'var(--sapHighlightColor)', fontSize: '0.875rem', lineHeight: 1,
                    borderRadius: '4px', opacity: 0.5, fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.5' }}
                >
                  →
                </button>
                <button
                  onClick={() => deleteEntry(file)}
                  title="Delete file"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem',
                    color: 'var(--sapNegativeColor)', fontSize: '0.875rem', lineHeight: 1,
                    borderRadius: '4px', opacity: 0.6,
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.6' }}
                >
                  ✕
                </button>
              </span>
            </div>
          ))}

          {/* Empty state */}
          {!loading && dirs.length === 0 && files.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '3rem 2rem', gap: '0.75rem',
              color: 'var(--sapContent_LabelColor)',
            }}>
              <Icon name="folder" style={{ fontSize: '3rem', opacity: 0.3 }} />
              <span style={{ fontSize: '1rem', fontWeight: 500 }}>This folder is empty</span>
              <span style={{ fontSize: '0.875rem', textAlign: 'center' }}>
                Drag and drop files here, or use <strong>Upload</strong>, <strong>New File</strong>, or <strong>New Folder</strong> above
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* ── Load Asset modal ────────────────────────────────────────────────── */}
      {showAssetPicker && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
          onClick={e => { if (e.target === e.currentTarget) setShowAssetPicker(false) }}
        >
          <div style={{
            background: 'var(--sapBackgroundColor)',
            border: '1px solid var(--sapList_BorderColor)',
            borderRadius: '8px', padding: '1.5rem', width: '32rem',
            display: 'flex', flexDirection: 'column', gap: '1rem',
            boxShadow: 'var(--sapContent_Shadow3)',
          }}>
            <div style={{ fontWeight: 600, fontSize: '1rem' }}>Load Asset into {currentPath}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
              Select an asset — it will be created as a file in the current folder.
            </div>
            <AssetPicker onSelect={loadAsset} onCancel={() => setShowAssetPicker(false)} />
          </div>
        </div>
      )}

      {/* ── Move to… modal ──────────────────────────────────────────────────── */}
      {moveDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
          onClick={e => { if (e.target === e.currentTarget) setMoveDialog(null) }}
        >
          <div style={{
            background: 'var(--sapBackgroundColor)',
            border: '1px solid var(--sapList_BorderColor)',
            borderRadius: '8px', padding: '1.5rem', width: '32rem',
            display: 'flex', flexDirection: 'column', gap: '1rem',
            boxShadow: 'var(--sapContent_Shadow3)',
          }}>
            <div style={{ fontWeight: 600, fontSize: '1rem' }}>Move "{moveDialog.entry.name}"</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
              From: <code style={{ fontFamily: 'monospace' }}>{moveDialog.entry.path}</code>
            </div>
            <FolderPicker
              excludePath={moveDialog.entry.path}
              onSelect={async dest => {
                await moveEntry(moveDialog.entry.path, dest)
                setMoveDialog(null)
              }}
              onCancel={() => setMoveDialog(null)}
            />
          </div>
        </div>
      )}
    </FlexBox>
  )
}
