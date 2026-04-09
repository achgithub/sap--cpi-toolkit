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
} from '@ui5/webcomponents-react'
import type { CPIConnection } from './types'
import { apiFetch } from './api'

export function CPIConnections({ setError }: { setError: (e: string) => void }) {
  const [connections, setConnections] = useState<CPIConnection[]>([])
  const [expanded,    setExpanded]    = useState(false)
  const [showAdd,     setShowAdd]     = useState(false)
  const [name,        setName]        = useState('')
  const [url,         setUrl]         = useState('')
  const [username,    setUsername]    = useState('')
  const [password,    setPassword]    = useState('')
  const [saving,      setSaving]      = useState(false)

  const load = useCallback(async () => {
    try {
      const data: CPIConnection[] = await apiFetch('/connections')
      setConnections((data ?? []).sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ))
    } catch (e: any) { setError(e.message) }
  }, [setError])

  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!name.trim() || !url.trim()) return
    setSaving(true)
    try {
      await apiFetch('/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), url: url.trim(), username: username.trim(), password }),
      })
      setShowAdd(false); setName(''); setUrl(''); setUsername(''); setPassword('')
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Remove this connection?')) return
    try {
      await apiFetch('/connections/' + id, { method: 'DELETE' })
      await load()
    } catch (e: any) { setError(e.message) }
  }

  return (
    <Card>
      <FlexBox style={{ padding: '0.75rem 1rem', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}>
        <span style={{ fontSize: '0.9rem', color: 'var(--sapContent_IconColor)' }}>
          {expanded ? '▾' : '▸'}
        </span>
        <FlexBox direction={FlexBoxDirection.Column} style={{ flex: 1, gap: '0.1rem' }}>
          <span style={{ fontWeight: 600, fontSize: '1rem' }}>CPI Connections</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
            {connections.length === 0
              ? 'No connections — add your CPI tenant URLs'
              : connections.map(c => c.name).join(', ')}
          </span>
        </FlexBox>
        <FlexBox style={{ gap: '0.25rem' }} onClick={(e) => e.stopPropagation()}>
          <Button design="Transparent" icon="add"
            onClick={() => { setExpanded(true); setShowAdd(v => !v) }} />
        </FlexBox>
      </FlexBox>

      {expanded && (
        <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '0 1rem 1rem', gap: '0.75rem' }}>
          {connections.map(c => (
            <FlexBox key={c.id} style={{
              alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem',
              background: 'var(--sapField_Background)', border: '1px solid var(--sapField_BorderColor)',
              borderRadius: '4px',
            }}>
              <FlexBox direction={FlexBoxDirection.Column} style={{ flex: 1, gap: '0.1rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.name}</span>
                <code style={{ fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)', wordBreak: 'break-all' }}>
                  {c.url}
                </code>
                {c.username && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)' }}>
                    User: {c.username}
                  </span>
                )}
              </FlexBox>
              <Button design="Transparent" icon="copy"
                onClick={() => navigator.clipboard.writeText(c.url).catch(() => {})} />
              <Button design="Transparent" icon="delete" onClick={() => remove(c.id)} />
            </FlexBox>
          ))}

          {connections.length === 0 && !showAdd && (
            <MessageStrip design="Information" hideCloseButton>
              Add your CPI tenant URLs here to use them in the mock wizard.
            </MessageStrip>
          )}

          {showAdd && (
            <Card header={<CardHeader titleText="Add CPI Connection" />}>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem', padding: '1rem' }}>
                <FlexBox style={{ gap: '1rem' }}>
                  <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
                    <Label required>Name</Label>
                    <Input value={name} onInput={(e: any) => setName(e.target.value)}
                      placeholder="e.g. CPI Dev" style={{ width: '100%' }} />
                  </FlexBox>
                  <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 2 }}>
                    <Label required>URL</Label>
                    <Input value={url} onInput={(e: any) => setUrl(e.target.value)}
                      placeholder="https://my-tenant.hana.ondemand.com" style={{ width: '100%' }} />
                  </FlexBox>
                </FlexBox>
                <FlexBox style={{ gap: '1rem' }}>
                  <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
                    <Label>Username</Label>
                    <Input value={username} onInput={(e: any) => setUsername(e.target.value)}
                      placeholder="Optional" style={{ width: '100%' }} />
                  </FlexBox>
                  <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
                    <Label>Password</Label>
                    <Input type="Password" value={password} onInput={(e: any) => setPassword(e.target.value)}
                      placeholder="Optional" style={{ width: '100%' }} />
                  </FlexBox>
                </FlexBox>
                <FlexBox style={{ gap: '0.5rem' }}>
                  <Button onClick={() => { setShowAdd(false); setName(''); setUrl('') }}>Cancel</Button>
                  <Button design="Emphasized" onClick={add}
                    disabled={saving || !name.trim() || !url.trim()}>
                    {saving ? 'Saving…' : 'Add'}
                  </Button>
                </FlexBox>
              </FlexBox>
            </Card>
          )}
        </FlexBox>
      )}
    </Card>
  )
}
