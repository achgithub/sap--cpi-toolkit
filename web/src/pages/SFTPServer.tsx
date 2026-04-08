import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Card,
  CardHeader,
  CardContent,
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
  Dialog,
  Bar,
  List,
  ListItemStandard,
} from '@ui5/webcomponents-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SFTPFile {
  name: string
  content: string
}

interface SFTPConfig {
  credentials: { username: string; password: string }
  files: SFTPFile[]
  auth_mode: string
  ssh_host_key_fingerprint: string
  ssh_public_key: string
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

export default function SFTPServer() {
  const [config,   setConfig]   = useState<SFTPConfig | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  // Editable state
  const [username,   setUsername]   = useState('')
  const [password,   setPassword]   = useState('')
  const [authMode,   setAuthMode]   = useState('password')
  const [pubKey,     setPubKey]     = useState('')
  const [files,      setFiles]      = useState<SFTPFile[]>([])

  // Add file dialog
  const [showAddFile, setShowAddFile] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [newFileContent, setNewFileContent] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data: SFTPConfig = await apiFetch('/sftp')
      setConfig(data)
      setUsername(data.credentials?.username ?? '')
      setPassword(data.credentials?.password ?? '')
      setAuthMode(data.auth_mode ?? 'password')
      setPubKey(data.ssh_public_key ?? '')
      setFiles(data.files ?? [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await apiFetch('/sftp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentials: { username, password },
          auth_mode: authMode,
          ssh_public_key: pubKey,
          files,
        }),
      })
      setSuccess('SFTP configuration saved.')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const regenerateKey = async () => {
    if (!window.confirm('Regenerate the SSH host key? Existing clients will see a host-key-changed warning.')) return
    setError('')
    try {
      const res = await apiFetch('/sftp/regenerate-key', { method: 'POST' })
      setSuccess('Host key regenerated. New fingerprint: ' + res.fingerprint)
      await load()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const addFile = () => {
    if (!newFileName.trim()) return
    setFiles(prev => [...prev.filter(f => f.name !== newFileName.trim()), { name: newFileName.trim(), content: newFileContent }])
    setNewFileName('')
    setNewFileContent('')
    setShowAddFile(false)
  }

  const removeFile = (name: string) => {
    setFiles(prev => prev.filter(f => f.name !== name))
  }

  if (loading) return <BusyIndicator active />

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
      {error && (
        <MessageStrip design={MessageStripDesign.Negative} onClose={() => setError('')}>
          {error}
        </MessageStrip>
      )}
      {success && (
        <MessageStrip design={MessageStripDesign.Positive} onClose={() => setSuccess('')}>
          {success}
        </MessageStrip>
      )}

      <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} alignItems={FlexBoxAlignItems.Center}>
        <Title>SFTP Server</Title>
        <Button design="Emphasized" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </FlexBox>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

        {/* Auth */}
        <Card>
          <CardHeader titleText="Authentication" />
          <CardContent>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem' }}>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                <Label>Auth Mode</Label>
                <Select style={{ width: '100%' }} onChange={(e: any) => setAuthMode(e.detail.selectedOption.value)}>
                  <Option value="password" selected={authMode === 'password'}>Password only</Option>
                  <Option value="key"      selected={authMode === 'key'}>Public key only</Option>
                  <Option value="any"      selected={authMode === 'any'}>Password or key</Option>
                </Select>
              </FlexBox>

              {(authMode === 'password' || authMode === 'any') && (
                <>
                  <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                    <Label>Username</Label>
                    <Input value={username} onInput={(e: any) => setUsername(e.target.value)} style={{ width: '100%' }} />
                  </FlexBox>
                  <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                    <Label>Password</Label>
                    <Input type="Password" value={password} onInput={(e: any) => setPassword(e.target.value)} style={{ width: '100%' }} />
                  </FlexBox>
                </>
              )}

              {(authMode === 'key' || authMode === 'any') && (
                <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                  <Label>Authorized Public Key (authorized_keys format, optional — leave blank to accept any key)</Label>
                  <TextArea value={pubKey} onInput={(e: any) => setPubKey(e.target.value)} rows={4} style={{ width: '100%', fontFamily: 'monospace' }} />
                </FlexBox>
              )}
            </FlexBox>
          </CardContent>
        </Card>

        {/* Host key */}
        <Card>
          <CardHeader titleText="SSH Host Key" />
          <CardContent>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem' }}>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                <Label>Fingerprint</Label>
                <code style={{
                  background: 'var(--sapField_Background)',
                  border: '1px solid var(--sapField_BorderColor)',
                  borderRadius: '4px',
                  padding: '0.5rem',
                  fontSize: '0.85rem',
                  wordBreak: 'break-all',
                }}>
                  {config?.ssh_host_key_fingerprint || '—'}
                </code>
              </FlexBox>
              <Label style={{ color: 'var(--sapCriticalTextColor)', fontSize: '0.85rem' }}>
                Connection string: sftp://localhost:2222
              </Label>
              <Button design="Attention" onClick={regenerateKey} style={{ alignSelf: 'flex-start' }}>
                Regenerate Host Key
              </Button>
            </FlexBox>
          </CardContent>
        </Card>
      </div>

      {/* Files */}
      <Card>
        <CardHeader
          titleText="Virtual File System"
          subtitleText="Files that CPI will see when it connects. Uploads from CPI are stored in memory and lost on restart."
          action={
            <Button design="Emphasized" icon="add" onClick={() => setShowAddFile(true)}>Add File</Button>
          }
        />
        <CardContent>
          {files.length === 0 ? (
            <MessageStrip design={MessageStripDesign.Information} hideCloseButton>
              No pre-defined files. CPI can still upload files at runtime.
            </MessageStrip>
          ) : (
            <List>
              {files.map(f => (
                <ListItemStandard
                  key={f.name}
                  description={f.content.length > 80 ? f.content.slice(0, 80) + '…' : f.content || '(empty)'}
                  additionalText={`${f.content.length} chars`}
                >
                  <FlexBox justifyContent={FlexBoxJustifyContent.SpaceBetween} alignItems={FlexBoxAlignItems.Center} style={{ width: '100%' }}>
                    <code>{f.name}</code>
                    <Button design="Transparent" icon="delete" onClick={() => removeFile(f.name)} />
                  </FlexBox>
                </ListItemStandard>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* Add file dialog */}
      <Dialog
        open={showAddFile}
        onClose={() => setShowAddFile(false)}
        header={<Bar><Title>Add Virtual File</Title></Bar>}
        footer={
          <Bar endContent={
            <FlexBox style={{ gap: '0.5rem' }}>
              <Button onClick={() => setShowAddFile(false)}>Cancel</Button>
              <Button design="Emphasized" onClick={addFile} disabled={!newFileName.trim()}>Add</Button>
            </FlexBox>
          } />
        }
      >
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem', padding: '1rem', minWidth: '400px' }}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label required>File Name</Label>
            <Input
              value={newFileName}
              onInput={(e: any) => setNewFileName(e.target.value)}
              placeholder="e.g. orders.xml"
              style={{ width: '100%' }}
            />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Content</Label>
            <TextArea
              value={newFileContent}
              onInput={(e: any) => setNewFileContent(e.target.value)}
              rows={8}
              style={{ width: '100%', fontFamily: 'monospace' }}
              placeholder="Paste file content here…"
            />
          </FlexBox>
        </FlexBox>
      </Dialog>
    </FlexBox>
  )
}
