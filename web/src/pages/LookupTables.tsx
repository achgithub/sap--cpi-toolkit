import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Card,
  CardHeader,
  FlexBox,
  FlexBoxAlignItems,
  FlexBoxDirection,
  FlexBoxJustifyContent,
  Input,
  Label,
  MessageStrip,
  TextArea,
  Title,
  Toolbar,
  ToolbarSpacer,
} from '@ui5/webcomponents-react'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LookupTable {
  id: string
  name: string
  values: string[]
  created_at: string
}

// ── API ────────────────────────────────────────────────────────────────────────

const API = '/api/worker/testdata/lookup-tables'

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(API + path, opts)
  if (res.status === 204) return null
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function LookupTables() {
  const [tables,     setTables]     = useState<LookupTable[]>([])
  const [loading,    setLoading]    = useState(true)
  const [loadErr,    setLoadErr]    = useState('')
  const [editingID,  setEditingID]  = useState<string | null>(null)   // null = new
  const [showForm,   setShowForm]   = useState(false)
  const [formName,   setFormName]   = useState('')
  const [formValues, setFormValues] = useState('')   // newline-separated
  const [saving,     setSaving]     = useState(false)
  const [saveErr,    setSaveErr]    = useState('')

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('')
    try {
      const data: LookupTable[] = await apiFetch('')
      setTables(data)
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setEditingID(null)
    setFormName('')
    setFormValues('')
    setSaveErr('')
    setShowForm(true)
  }

  const openEdit = (t: LookupTable) => {
    setEditingID(t.id)
    setFormName(t.name)
    setFormValues(t.values.join('\n'))
    setSaveErr('')
    setShowForm(true)
  }

  const cancel = () => { setShowForm(false); setSaveErr('') }

  const save = async () => {
    if (!formName.trim()) { setSaveErr('Name is required'); return }
    const values = formValues
      .split('\n')
      .map(v => v.trim())
      .filter(Boolean)
    if (values.length === 0) { setSaveErr('At least one value is required'); return }

    setSaving(true); setSaveErr('')
    try {
      const body = JSON.stringify({ name: formName.trim(), values })
      if (editingID) {
        await apiFetch(`/${editingID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
      } else {
        await apiFetch('', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
      }
      setShowForm(false)
      load()
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const deleteTable = async (id: string) => {
    try {
      await apiFetch(`/${id}`, { method: 'DELETE' })
      load()
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>

      {/* ── Header toolbar ── */}
      <Toolbar>
        <Title level="H5">Lookup Tables</Title>
        <ToolbarSpacer />
        <Button design="Emphasized" onClick={openNew} disabled={showForm}>
          New Table
        </Button>
        <Button onClick={load}>Refresh</Button>
      </Toolbar>

      <MessageStrip design="Information" hideCloseButton>
        Lookup tables provide real-world reference values (customers, suppliers, materials, etc.)
        that can be assigned to fields during test data generation.
        Values are cycled — if you generate more documents than values, the list repeats from the beginning.
      </MessageStrip>

      {loadErr && <MessageStrip design="Negative">{loadErr}</MessageStrip>}

      {/* ── Create / Edit form ── */}
      {showForm && (
        <Card header={
          <CardHeader titleText={editingID ? 'Edit Table' : 'New Table'} />
        }>
          <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>

            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
              <Label required style={{ minWidth: '4rem' }}>Name</Label>
              <Input
                value={formName}
                placeholder="e.g. Customers"
                style={{ flex: 1 }}
                onInput={(e) => setFormName((e.target as any).value)}
              />
            </FlexBox>

            <div>
              <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween}
                style={{ marginBottom: '0.25rem' }}>
                <Label required>Values (one per line)</Label>
                <span style={{ fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)' }}>
                  {formValues.split('\n').filter(v => v.trim()).length} value(s)
                </span>
              </FlexBox>
              <TextArea
                value={formValues}
                rows={10}
                placeholder={'C001\nC002\nC003'}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}
                onInput={(e) => setFormValues((e.target as any).value)}
              />
            </div>

            {saveErr && <MessageStrip design="Negative">{saveErr}</MessageStrip>}

            <FlexBox style={{ gap: '0.5rem' }}>
              <Button design="Emphasized" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : editingID ? 'Update' : 'Create'}
              </Button>
              <Button onClick={cancel}>Cancel</Button>
            </FlexBox>
          </FlexBox>
        </Card>
      )}

      {/* ── Table list ── */}
      {loading && !tables.length && (
        <p style={{ color: 'var(--sapContent_LabelColor)', padding: '0.5rem' }}>Loading…</p>
      )}

      {!loading && tables.length === 0 && !showForm && (
        <MessageStrip design="Information" hideCloseButton>
          No lookup tables yet. Click <strong>New Table</strong> to create one.
        </MessageStrip>
      )}

      {tables.map(t => (
        <Card key={t.id} header={
          <CardHeader
            titleText={t.name}
            subtitleText={`${t.values.length} value${t.values.length !== 1 ? 's' : ''}`}
            action={
              <FlexBox style={{ gap: '0.4rem' }}>
                <Button onClick={() => openEdit(t)}>Edit</Button>
                <Button design="Negative" onClick={() => deleteTable(t.id)}>Delete</Button>
              </FlexBox>
            }
          />
        }>
          <div style={{ padding: '0.5rem 0.75rem' }}>
            <ValueGrid values={t.values} />
          </div>
        </Card>
      ))}
    </FlexBox>
  )
}

// ── Value grid — compact chip display ─────────────────────────────────────────

const PREVIEW_LIMIT = 40

function ValueGrid({ values }: { values: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? values : values.slice(0, PREVIEW_LIMIT)
  const hidden  = values.length - PREVIEW_LIMIT

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
        {visible.map((v, i) => (
          <span key={i} style={{
            fontSize: '0.78rem',
            padding: '0.15rem 0.5rem',
            borderRadius: '0.75rem',
            background: 'var(--sapList_Background)',
            border: '1px solid var(--sapList_BorderColor)',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
          }}>
            {v}
          </span>
        ))}
      </div>
      {hidden > 0 && !expanded && (
        <Button design="Transparent" style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}
          onClick={() => setExpanded(true)}>
          +{hidden} more
        </Button>
      )}
      {expanded && hidden > 0 && (
        <Button design="Transparent" style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}
          onClick={() => setExpanded(false)}>
          Show less
        </Button>
      )}
    </div>
  )
}
