import { useState } from 'react'
import {
  Button,
  Card,
  CardHeader,
  FlexBox,
  FlexBoxDirection,
  Input,
  Label,
  Select,
  Option,
} from '@ui5/webcomponents-react'
import type { Adapter, AdapterConfig } from './types'
import { SENDER_TYPES } from './templates'
import { apiFetch } from './api'
import { AdapterConfigForm } from './AdapterConfigForm'

export function AdapterCard({ adapter, scenarioId, onDelete, onToggleBehavior, onRefresh, setError }: {
  adapter: Adapter
  scenarioId: string
  onDelete: () => void
  onToggleBehavior: () => void
  onRefresh: () => void
  setError: (e: string) => void
}) {
  const [editing,    setEditing]    = useState(false)
  const [editName,   setEditName]   = useState(adapter.name)
  const [editMode,   setEditMode]   = useState(adapter.behavior_mode)
  const [editConfig, setEditConfig] = useState<AdapterConfig>(adapter.config)
  const [editUser,   setEditUser]   = useState(adapter.credentials?.username ?? '')
  const [editPass,   setEditPass]   = useState(adapter.credentials?.password ?? '')
  const [saving,     setSaving]     = useState(false)

  const openEdit = () => {
    setEditName(adapter.name)
    setEditMode(adapter.behavior_mode)
    setEditConfig(adapter.config)
    setEditUser(adapter.credentials?.username ?? '')
    setEditPass(adapter.credentials?.password ?? '')
    setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const body: any = { name: editName.trim(), behavior_mode: editMode, config: editConfig }
      if (editUser) body.credentials = { username: editUser, password: editPass }
      else body.credentials = null
      await apiFetch('/scenarios/' + scenarioId + '/adapters/' + adapter.id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      setEditing(false)
      await onRefresh()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const isFailure = adapter.behavior_mode === 'failure'
  const isSender  = SENDER_TYPES.has(adapter.type)

  if (editing) {
    return (
      <Card header={<CardHeader titleText={`Edit — ${adapter.name}`} subtitleText={adapter.type} />}>
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem', padding: '1rem' }}>
          <FlexBox style={{ gap: '1rem' }}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 2 }}>
              <Label>Name</Label>
              <Input value={editName} onInput={(e: any) => setEditName(e.target.value)} style={{ width: '100%' }} />
            </FlexBox>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
              <Label>Behaviour</Label>
              <Select style={{ width: '100%' }} onChange={(e: any) => setEditMode(e.detail.selectedOption.value)}>
                <Option value="success" selected={editMode === 'success'}>Success</Option>
                <Option value="failure" selected={editMode === 'failure'}>Failure</Option>
              </Select>
            </FlexBox>
          </FlexBox>
          <AdapterConfigForm type={adapter.type} config={editConfig} onChange={setEditConfig} />
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Inbound Auth (optional)</Label>
            <FlexBox style={{ gap: '0.5rem' }}>
              <Input value={editUser} onInput={(e: any) => setEditUser(e.target.value)}
                placeholder="Username" style={{ flex: 1 }} />
              <Input type="Password" value={editPass} onInput={(e: any) => setEditPass(e.target.value)}
                placeholder="Password" style={{ flex: 1 }} />
            </FlexBox>
          </FlexBox>
          <FlexBox style={{ gap: '0.5rem' }}>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            <Button design="Emphasized" onClick={save} disabled={saving || !editName.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </FlexBox>
        </FlexBox>
      </Card>
    )
  }

  return (
    <Card header={
      <CardHeader
        titleText={adapter.name}
        subtitleText={`${adapter.type} ${isSender ? '↑ Outbound' : '↓ Inbound'}`}
        action={
          <FlexBox style={{ gap: '0.25rem' }}>
            <Button design={isFailure ? 'Attention' : 'Default'} onClick={onToggleBehavior}>
              {isFailure ? 'Failure' : 'Success'}
            </Button>
            <Button design="Transparent" icon="edit" onClick={openEdit} />
            <Button design="Transparent" icon="delete" onClick={onDelete} />
          </FlexBox>
        }
      />
    }>
      <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.5rem', padding: '0.75rem 1rem 1rem' }}>
        <Label style={{ fontWeight: 600 }}>Endpoint URL</Label>
        <FlexBox style={{ gap: '0.5rem', alignItems: 'center' }}>
          <code style={{
            flex: 1, background: 'var(--sapField_Background)', border: '1px solid var(--sapField_BorderColor)',
            borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.8rem', wordBreak: 'break-all',
          }}>
            {adapter.ingress_url || '—'}
          </code>
          {adapter.ingress_url && (
            <Button design="Transparent" icon="copy"
              onClick={() => navigator.clipboard.writeText(adapter.ingress_url).catch(() => {})} />
          )}
        </FlexBox>
        <FlexBox style={{ gap: '1rem', fontSize: '0.875rem' }}>
          {adapter.config.status_code > 0 && <span>Status: <b>{adapter.config.status_code}</b></span>}
          {adapter.config.response_delay_ms > 0 && <span>Delay: {adapter.config.response_delay_ms}ms</span>}
          {Object.keys(adapter.config.response_headers ?? {}).length > 0 && (
            <span>
              {Object.keys(adapter.config.response_headers).length} header
              {Object.keys(adapter.config.response_headers).length !== 1 ? 's' : ''}
            </span>
          )}
        </FlexBox>
        {adapter.config.response_body && (
          <div style={{
            fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)',
            maxHeight: '3rem', overflow: 'hidden', whiteSpace: 'pre',
          }}>
            {adapter.config.response_body.slice(0, 200)}
          </div>
        )}
        {adapter.last_activity && (
          <Label style={{ fontSize: '0.78rem' }}>
            Last hit: {new Date(adapter.last_activity).toLocaleTimeString()}
          </Label>
        )}
      </FlexBox>
    </Card>
  )
}
