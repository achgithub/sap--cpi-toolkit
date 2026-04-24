import { useState, useEffect } from 'react'
import {
  Button,
  Dialog,
  Bar,
  Input,
  Label,
  MessageStrip,
  Select,
  Option,
  FlexBox,
  FlexBoxDirection,
  FlexBoxJustifyContent,
  FlexBoxAlignItems,
} from '@ui5/webcomponents-react'

import { type CPIInstance, type ServiceKey, type SystemType } from '../context/CPIInstanceContext'

const SYSTEM_TYPES: SystemType[] = ['TRL', 'SBX', 'DEV', 'QAS', 'PPD', 'PRD']

const API = '/api/worker/cpi-instances'

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(API + path, opts)
  if (res.status === 204) return null
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

function parseKey(text: string): ServiceKey | null {
  const t = text.trim()
  if (!t) return null
  return JSON.parse(t) as ServiceKey
}

function keyUrl(key: ServiceKey | null): string {
  return key?.oauth?.url ?? ''
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function SettingsDialog({ open, onClose }: Props) {
  const [instances, setInstances] = useState<CPIInstance[]>([])
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editing, setEditing] = useState<CPIInstance | null>(null)
  const [name, setName] = useState('')
  const [systemType, setSystemType] = useState<SystemType>('TRL')
  const [apiKeyText, setApiKeyText] = useState('')
  const [piKeyText, setPiKeyText] = useState('')
  const [apiKeyError, setApiKeyError] = useState('')
  const [piKeyError, setPiKeyError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      load()
      setView('list')
      setError('')
    }
  }, [open])

  async function load() {
    try {
      const data = await apiFetch('')
      setInstances(data ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function openAdd() {
    setEditing(null)
    setName('')
    setSystemType('TRL')
    setApiKeyText('')
    setPiKeyText('')
    setApiKeyError('')
    setPiKeyError('')
    setError('')
    setView('form')
  }

  function openEdit(inst: CPIInstance) {
    setEditing(inst)
    setName(inst.name)
    setSystemType(inst.system_type)
    setApiKeyText(inst.api_key ? JSON.stringify(inst.api_key, null, 2) : '')
    setPiKeyText(inst.pi_key ? JSON.stringify(inst.pi_key, null, 2) : '')
    setApiKeyError('')
    setPiKeyError('')
    setError('')
    setView('form')
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/${id}`, { method: 'DELETE' })
      setInstances(prev => prev.filter(i => i.id !== id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function validateKeyField(text: string, setErr: (s: string) => void): ServiceKey | null | false {
    if (!text.trim()) {
      setErr('')
      return null
    }
    try {
      const parsed = parseKey(text)
      setErr('')
      return parsed
    } catch {
      setErr('Invalid JSON')
      return false
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    const apiKey = validateKeyField(apiKeyText, setApiKeyError)
    const piKey  = validateKeyField(piKeyText,  setPiKeyError)
    if (apiKey === false || piKey === false) return

    setSaving(true)
    setError('')
    try {
      if (editing) {
        const updated: CPIInstance = await apiFetch(`/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), system_type: systemType, api_key: apiKey, pi_key: piKey }),
        })
        setInstances(prev => prev.map(i => i.id === editing.id ? updated : i))
      } else {
        const created: CPIInstance = await apiFetch('', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), system_type: systemType, api_key: apiKey, pi_key: piKey }),
        })
        setInstances(prev => [...prev, created])
      }
      setView('list')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    setView('list')
    setError('')
    onClose()
  }

  return (
    <Dialog
      open={open}
      headerText={view === 'form' ? (editing ? 'Edit CPI Instance' : 'Add CPI Instance') : 'CPI Instances'}
      onClose={handleClose}
      style={{ width: '700px', maxWidth: '95vw' }}
    >
      <div style={{ padding: '1rem', minHeight: '200px' }}>
        {error && (
          <MessageStrip
            design="Negative"
            hideCloseButton
            style={{ marginBottom: '1rem' }}
          >
            {error}
          </MessageStrip>
        )}

        {view === 'list' && (
          <div>
            {instances.length === 0 ? (
              <p style={{ color: 'var(--sapContent_LabelColor)', textAlign: 'center', marginTop: '2rem', fontFamily: 'var(--sapFontFamily)' }}>
                No CPI instances configured. Click <strong>Add Instance</strong> to get started.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {instances.map(inst => (
                  <div
                    key={inst.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.625rem 0.75rem',
                      border: '1px solid var(--sapList_BorderColor)',
                      borderRadius: '0.375rem',
                      background: 'var(--sapList_Background)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--sapTextColor)', fontFamily: 'var(--sapFontFamily)' }}>
                          {inst.name}
                        </div>
                        <SystemTypeBadge type={inst.system_type} />
                      </FlexBox>
                      {keyUrl(inst.api_key) && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', marginTop: '0.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--sapFontFamily)' }}>
                          {keyUrl(inst.api_key)}
                        </div>
                      )}
                    </div>
                    <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.375rem', flexShrink: 0 }}>
                      <KeyBadge label="API" active={!!inst.api_key} />
                      <KeyBadge label="PI" active={!!inst.pi_key} />
                    </FlexBox>
                    <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.375rem', flexShrink: 0 }}>
                      <Button design="Transparent" onClick={() => openEdit(inst)}>Edit</Button>
                      <Button design="Transparent" onClick={() => handleDelete(inst.id)}>Delete</Button>
                    </FlexBox>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'form' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FlexBox alignItems={FlexBoxAlignItems.End} style={{ gap: '0.5rem' }}>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
                <Label required>Instance Name</Label>
                <Input
                  value={name}
                  onInput={(e) => setName((e.target as any).value)}
                  placeholder="e.g. Andrews Trial XYZ"
                  style={{ width: '100%' }}
                />
              </FlexBox>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', width: '6rem' }}>
                <Label required>System</Label>
                <Select
                  style={{ width: '100%' }}
                  onChange={(e) => setSystemType((e.detail as any).selectedOption.value as SystemType)}
                >
                  {SYSTEM_TYPES.map(t => (
                    <Option key={t} value={t} selected={systemType === t}>{t}</Option>
                  ))}
                </Select>
              </FlexBox>
            </FlexBox>

            <KeyTextArea
              label="API Service Key"
              hint="Used for accessing the system, creating iFlows, and monitoring. Paste the JSON service key from SAP BTP."
              value={apiKeyText}
              error={apiKeyError}
              onChange={text => { setApiKeyText(text); setApiKeyError('') }}
            />

            <KeyTextArea
              label="Process Integration Service Key"
              hint="Used for sending messages and payloads to the HTTP adapter. Paste the JSON service key from SAP BTP."
              value={piKeyText}
              error={piKeyError}
              onChange={text => { setPiKeyText(text); setPiKeyError('') }}
            />
          </div>
        )}
      </div>

      <Bar slot="footer">
        {view === 'list' ? (
          <FlexBox
            justifyContent={FlexBoxJustifyContent.SpaceBetween}
            alignItems={FlexBoxAlignItems.Center}
            style={{ width: '100%', padding: '0 0.5rem' }}
          >
            <Button onClick={handleClose}>Close</Button>
            <Button design="Emphasized" onClick={openAdd}>Add Instance</Button>
          </FlexBox>
        ) : (
          <FlexBox
            justifyContent={FlexBoxJustifyContent.SpaceBetween}
            alignItems={FlexBoxAlignItems.Center}
            style={{ width: '100%', padding: '0 0.5rem' }}
          >
            <Button onClick={() => { setView('list'); setError('') }}>Cancel</Button>
            <Button design="Emphasized" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </FlexBox>
        )}
      </Bar>
    </Dialog>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KeyBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span style={{
      fontSize: '0.7rem',
      fontWeight: 600,
      fontFamily: 'var(--sapFontFamily)',
      padding: '0.125rem 0.375rem',
      borderRadius: '0.25rem',
      background: active ? 'var(--sapSuccessBackground)' : 'var(--sapNeutralBackground)',
      color: active ? 'var(--sapSuccessColor)' : 'var(--sapContent_LabelColor)',
      border: `1px solid ${active ? 'var(--sapSuccessBorderColor)' : 'var(--sapNeutralBorderColor)'}`,
    }}>
      {label}
    </span>
  )
}

function SystemTypeBadge({ type }: { type: SystemType }) {
  const colours: Record<SystemType, { bg: string; text: string; border: string }> = {
    TRL: { bg: '#eaf5ea', text: '#256f3a', border: '#a8d5a2' },
    SBX: { bg: '#eaf5ea', text: '#256f3a', border: '#a8d5a2' },
    DEV: { bg: '#eaf5ea', text: '#256f3a', border: '#a8d5a2' },
    QAS: { bg: '#fef7e0', text: '#8f6000', border: '#f5c942' },
    PPD: { bg: '#fef7e0', text: '#8f6000', border: '#f5c942' },
    PRD: { bg: '#ffeaea', text: '#bb0000', border: '#f5a5a5' },
  }
  const c = colours[type] ?? colours.TRL
  return (
    <span style={{
      fontSize: '0.7rem',
      fontWeight: 700,
      fontFamily: 'var(--sapFontFamily)',
      padding: '0.1rem 0.35rem',
      borderRadius: '0.25rem',
      background: c.bg,
      color: c.text,
      border: `1px solid ${c.border}`,
      letterSpacing: '0.04em',
      flexShrink: 0,
    }}>
      {type}
    </span>
  )
}

interface KeyTextAreaProps {
  label: string
  hint: string
  value: string
  error: string
  onChange: (text: string) => void
}

function KeyTextArea({ label, hint, value, error, onChange }: KeyTextAreaProps) {
  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
      <Label>{label}</Label>
      <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', marginBottom: '0.125rem', fontFamily: 'var(--sapFontFamily)' }}>
        {hint}
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={8}
        placeholder={'{\n  "oauth": {\n    "clientid": "...",\n    "clientsecret": "...",\n    "tokenurl": "https://...",\n    "url": "https://..."\n  }\n}'}
        spellCheck={false}
        style={{
          width: '100%',
          fontFamily: 'monospace',
          fontSize: '0.78rem',
          resize: 'vertical',
          padding: '0.5rem',
          border: `1px solid ${error ? 'var(--sapErrorBorderColor)' : 'var(--sapField_BorderColor)'}`,
          borderRadius: '0.25rem',
          background: 'var(--sapField_Background)',
          color: 'var(--sapTextColor)',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />
      {error && (
        <span style={{ fontSize: '0.75rem', color: 'var(--sapErrorColor)', fontFamily: 'var(--sapFontFamily)' }}>{error}</span>
      )}
    </FlexBox>
  )
}
