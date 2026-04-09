import { useState } from 'react'
import {
  Button,
  Card,
  CardHeader,
  FlexBox,
  FlexBoxDirection,
  Input,
  Label,
  MessageStrip,
  Select,
  Option,
} from '@ui5/webcomponents-react'
import type { Scenario, Adapter, AdapterConfig } from './types'
import { ADAPTER_TYPES, SENDER_TYPES, templateConfig } from './templates'
import { apiFetch } from './api'
import { AdapterCard } from './AdapterCard'
import { AdapterConfigForm } from './AdapterConfigForm'

export function ScenarioRow({ scenario, onDelete, onRefresh, setError }: {
  scenario: Scenario
  onDelete: () => void
  onRefresh: () => void
  setError: (e: string) => void
}) {
  const [expanded,      setExpanded]      = useState(false)
  const [showAdd,       setShowAdd]       = useState(false)
  const [adapterName,   setAdapterName]   = useState('')
  const [adapterType,   setAdapterType]   = useState('REST')
  const [adapterMode,   setAdapterMode]   = useState('success')
  const [adapterConfig, setAdapterConfig] = useState<AdapterConfig>(templateConfig('REST'))
  const [adapterUser,   setAdapterUser]   = useState('')
  const [adapterPass,   setAdapterPass]   = useState('')
  const [adding,        setAdding]        = useState(false)

  const changeAdapterType = (t: string) => {
    setAdapterType(t)
    setAdapterConfig(templateConfig(t))
  }

  const addAdapter = async () => {
    if (!adapterName.trim()) return
    setAdding(true)
    try {
      const body: any = {
        name: adapterName.trim(), type: adapterType,
        behavior_mode: adapterMode, config: adapterConfig,
      }
      if (adapterUser) body.credentials = { username: adapterUser, password: adapterPass }
      await apiFetch('/scenarios/' + scenario.id + '/adapters', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      setShowAdd(false); setAdapterName(''); setAdapterUser(''); setAdapterPass('')
      setAdapterConfig(templateConfig('REST')); setAdapterType('REST')
      await onRefresh()
    } catch (e: any) { setError(e.message) }
    finally { setAdding(false) }
  }

  const deleteAdapter = async (adapterId: string) => {
    if (!window.confirm('Remove this adapter?')) return
    try {
      await apiFetch('/scenarios/' + scenario.id + '/adapters/' + adapterId, { method: 'DELETE' })
      await onRefresh()
    } catch (e: any) { setError(e.message) }
  }

  const toggleBehavior = async (a: Adapter) => {
    const newMode = a.behavior_mode === 'success' ? 'failure' : 'success'
    try {
      await apiFetch('/scenarios/' + scenario.id + '/adapters/' + a.id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: a.name, behavior_mode: newMode, config: a.config, credentials: a.credentials }),
      })
      await onRefresh()
    } catch (e: any) { setError(e.message) }
  }

  return (
    <Card>
      {/* ── Header row ── */}
      <FlexBox style={{ padding: '0.75rem 1rem', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}>
        <span style={{ fontSize: '0.9rem', color: 'var(--sapContent_IconColor)' }}>
          {expanded ? '▾' : '▸'}
        </span>
        <FlexBox direction={FlexBoxDirection.Column} style={{ flex: 1, gap: '0.1rem' }}>
          <span style={{ fontWeight: 600, fontSize: '1rem' }}>{scenario.name}</span>
          {scenario.description && (
            <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>{scenario.description}</span>
          )}
        </FlexBox>
        {/* Adapter type badges */}
        <FlexBox style={{ gap: '0.25rem', flexWrap: 'wrap' }}>
          {scenario.adapters.map(a => (
            <span key={a.id} style={{
              background: a.behavior_mode === 'failure' ? 'var(--sapErrorColor)' : 'var(--sapSuccessColor)',
              color: '#fff', borderRadius: '0.75rem', padding: '0.1rem 0.5rem', fontSize: '0.72rem', fontWeight: 600,
            }}>{a.type}</span>
          ))}
          {scenario.adapters.length === 0 && (
            <span style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>No adapters</span>
          )}
        </FlexBox>
        {/* Actions — stop propagation so clicks don't toggle expand */}
        <FlexBox style={{ gap: '0.25rem' }} onClick={(e) => e.stopPropagation()}>
          <Button design="Transparent" icon="add" onClick={() => { setExpanded(true); setShowAdd(v => !v) }} />
          <Button design="Transparent" icon="delete" onClick={onDelete} />
        </FlexBox>
      </FlexBox>

      {/* ── Expanded content ── */}
      {expanded && (
        <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '0 1rem 1rem', gap: '0.75rem' }}>

          {/* Add adapter form */}
          {showAdd && (
            <Card header={<CardHeader titleText="Add Adapter" />}>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem', padding: '1rem' }}>
                <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                  <Label required>Name</Label>
                  <Input value={adapterName} onInput={(e: any) => setAdapterName(e.target.value)}
                    placeholder="e.g. Payment API" style={{ width: '100%' }} />
                </FlexBox>
                <FlexBox style={{ gap: '1rem' }}>
                  <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
                    <Label>Type</Label>
                    <Select style={{ width: '100%' }}
                      onChange={(e: any) => changeAdapterType(e.detail.selectedOption.value)}>
                      {ADAPTER_TYPES.map(t => (
                        <Option key={t} value={t} selected={t === adapterType}>
                          {t}{SENDER_TYPES.has(t) ? ' ↑' : ' ↓'}
                        </Option>
                      ))}
                    </Select>
                  </FlexBox>
                  <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
                    <Label>Behaviour</Label>
                    <Select style={{ width: '100%' }}
                      onChange={(e: any) => setAdapterMode(e.detail.selectedOption.value)}>
                      <Option value="success" selected={adapterMode === 'success'}>Success</Option>
                      <Option value="failure" selected={adapterMode === 'failure'}>Failure</Option>
                    </Select>
                  </FlexBox>
                </FlexBox>

                <AdapterConfigForm type={adapterType} config={adapterConfig} onChange={setAdapterConfig} />

                <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                  <Label>Inbound Auth (optional)</Label>
                  <FlexBox style={{ gap: '0.5rem' }}>
                    <Input value={adapterUser} onInput={(e: any) => setAdapterUser(e.target.value)}
                      placeholder="Username" style={{ flex: 1 }} />
                    <Input type="Password" value={adapterPass} onInput={(e: any) => setAdapterPass(e.target.value)}
                      placeholder="Password" style={{ flex: 1 }} />
                  </FlexBox>
                </FlexBox>

                <FlexBox style={{ gap: '0.5rem' }}>
                  <Button onClick={() => { setShowAdd(false); setAdapterName('') }}>Cancel</Button>
                  <Button design="Emphasized" onClick={addAdapter} disabled={adding || !adapterName.trim()}>
                    {adding ? 'Adding…' : 'Add'}
                  </Button>
                </FlexBox>
              </FlexBox>
            </Card>
          )}

          {scenario.adapters.length === 0 && !showAdd && (
            <MessageStrip design="Information" hideCloseButton>
              No adapters yet. Click + to add one, or use the New Mock wizard.
            </MessageStrip>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '0.75rem' }}>
            {scenario.adapters.map(a => (
              <AdapterCard
                key={a.id}
                adapter={a}
                scenarioId={scenario.id}
                onDelete={() => deleteAdapter(a.id)}
                onToggleBehavior={() => toggleBehavior(a)}
                onRefresh={onRefresh}
                setError={setError}
              />
            ))}
          </div>
        </FlexBox>
      )}
    </Card>
  )
}
