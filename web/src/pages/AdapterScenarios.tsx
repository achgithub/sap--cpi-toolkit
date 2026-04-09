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
  TextArea,
  Toolbar,
  ToolbarSpacer,
} from '@ui5/webcomponents-react'
import type { Scenario } from './adapter-scenarios/types'
import { apiFetch } from './adapter-scenarios/api'
import { CPIConnections } from './adapter-scenarios/CPIConnections'
import { ScenarioRow } from './adapter-scenarios/ScenarioRow'
import { MockWizard } from './adapter-scenarios/MockWizard'

export default function AdapterScenarios() {
  const [scenarios,  setScenarios]  = useState<Scenario[]>([])
  const [error,      setError]      = useState('')
  const [showWizard, setShowWizard] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName,    setNewName]    = useState('')
  const [newDesc,    setNewDesc]    = useState('')
  const [creating,   setCreating]   = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const data: Scenario[] = await apiFetch('/scenarios')
      setScenarios(data ?? [])
    } catch (e: any) { setError(e.message) }
  }, [])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const createScenario = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await apiFetch('/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      })
      setShowCreate(false); setNewName(''); setNewDesc('')
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setCreating(false) }
  }

  const deleteScenario = async (id: string) => {
    if (!window.confirm('Delete this scenario and all its adapters?')) return
    try {
      await apiFetch('/scenarios/' + id, { method: 'DELETE' })
      await load()
    } catch (e: any) { setError(e.message) }
  }

  if (showWizard) {
    return <MockWizard
      onDone={() => { setShowWizard(false); load() }}
      setError={setError}
    />
  }

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
      {error && <MessageStrip design="Negative" onClose={() => setError('')}>{error}</MessageStrip>}

      <Toolbar>
        <Label style={{ fontSize: '1.25rem', fontWeight: 600 }}>Adapter Scenarios</Label>
        <ToolbarSpacer />
        <Button design="Transparent" icon="refresh" onClick={load} />
        <Button design="Default" icon="overlay" onClick={() => setShowWizard(true)}>New Mock</Button>
        <Button design="Emphasized" icon="add" onClick={() => setShowCreate(v => !v)}>New Scenario</Button>
      </Toolbar>

      {showCreate && (
        <Card header={<CardHeader titleText="New Scenario" />}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem', padding: '1rem' }}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label required>Name</Label>
              <Input value={newName} onInput={(e: any) => setNewName(e.target.value)}
                placeholder="e.g. Payment Processing" style={{ width: '100%' }} />
            </FlexBox>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label>Description</Label>
              <TextArea value={newDesc} onInput={(e: any) => setNewDesc(e.target.value)}
                rows={2} style={{ width: '100%' }} />
            </FlexBox>
            <FlexBox style={{ gap: '0.5rem' }}>
              <Button onClick={() => { setShowCreate(false); setNewName(''); setNewDesc('') }}>Cancel</Button>
              <Button design="Emphasized" onClick={createScenario} disabled={creating || !newName.trim()}>
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </FlexBox>
          </FlexBox>
        </Card>
      )}

      {scenarios.length === 0 && !showCreate && (
        <MessageStrip design="Information" hideCloseButton>
          No scenarios yet. Create one or use New Mock to get started.
        </MessageStrip>
      )}

      <CPIConnections setError={setError} />

      {scenarios.map(sc => (
        <ScenarioRow
          key={sc.id}
          scenario={sc}
          onDelete={() => deleteScenario(sc.id)}
          onRefresh={load}
          setError={setError}
        />
      ))}
    </FlexBox>
  )
}
