import { useState } from 'react'
import {
  Button,
  Card,
  CardHeader,
  CheckBox,
  FlexBox,
  FlexBoxDirection,
  FlexBoxAlignItems,
  Input,
  Label,
  MessageStrip,
  SegmentedButton,
  SegmentedButtonItem,
  TextArea,
  Toolbar,
  ToolbarSpacer,
} from '@ui5/webcomponents-react'
import { useWorker } from '../hooks/useWorker'

// ── Types ────────────────────────────────────────────────────────────────────

interface Field {
  path: string
  sample_value: string
  detected_type: string
}

interface AnalyseResponse {
  fields: Field[]
}

interface FieldConfig {
  path: string
  type: string
  mode: 'random' | 'fixed'
  value: string
  min: number
  max: number
  decimal_places: number
  date_start: string
  date_end: string
  prefix: string
  length: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultConfig(field: Field): FieldConfig {
  const now = new Date()
  const yearAgo = new Date(now); yearAgo.setFullYear(now.getFullYear() - 1)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return {
    path:          field.path,
    type:          field.detected_type,
    mode:          'random',
    value:         field.sample_value,
    min:           1,
    max:           9999,
    decimal_places: 2,
    date_start:    fmt(yearAgo),
    date_end:      fmt(now),
    prefix:        '',
    length:        8,
  }
}

const TYPE_COLOUR: Record<string, string> = {
  string:   '#0070f2',
  integer:  '#107e3e',
  decimal:  '#0f828f',
  date:     '#e76500',
  datetime: '#c0399f',
  boolean:  '#bb0000',
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span style={{
      fontSize: '0.7rem',
      fontWeight: 600,
      padding: '0.15rem 0.45rem',
      borderRadius: '0.75rem',
      background: TYPE_COLOUR[type] ?? '#888',
      color: '#fff',
      whiteSpace: 'nowrap',
    }}>
      {type}
    </span>
  )
}

function segItem(e: Event) {
  const detail = (e as CustomEvent).detail as { selectedItems?: HTMLElement[]; selectedItem?: HTMLElement }
  return detail.selectedItems?.[0] ?? detail.selectedItem ?? null
}

// ── Inline config for a selected field ──────────────────────────────────────

function FieldConfigPanel({ config, onChange }: {
  config: FieldConfig
  onChange: (updates: Partial<FieldConfig>) => void
}) {
  const num = (s: string) => parseFloat(s) || 0
  const int = (s: string) => parseInt(s, 10) || 0

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.5rem', paddingTop: '0.5rem' }}>
      {/* Mode toggle */}
      <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
        <Label>Mode</Label>
        <SegmentedButton
          onSelectionChange={(e) => {
            const item = segItem(e as unknown as Event)
            const m = item?.getAttribute('data-mode')
            if (m === 'random' || m === 'fixed') onChange({ mode: m })
          }}
        >
          <SegmentedButtonItem data-mode="random" selected={config.mode === 'random'}>Random</SegmentedButtonItem>
          <SegmentedButtonItem data-mode="fixed"  selected={config.mode === 'fixed'}>Fixed</SegmentedButtonItem>
        </SegmentedButton>
      </FlexBox>

      {/* Fixed mode */}
      {config.mode === 'fixed' && (
        <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
          <Label style={{ minWidth: '4rem' }}>Value</Label>
          <Input
            value={config.value}
            style={{ flex: 1 }}
            onInput={(e) => onChange({ value: (e.target as unknown as HTMLInputElement).value })}
          />
        </FlexBox>
      )}

      {/* Random mode — type-specific config */}
      {config.mode === 'random' && config.type === 'string' && (
        <FlexBox direction={FlexBoxDirection.Row} style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label style={{ minWidth: '4rem' }}>Prefix</Label>
            <Input value={config.prefix} placeholder="e.g. ORD-" style={{ width: '8rem' }}
              onInput={(e) => onChange({ prefix: (e.target as unknown as HTMLInputElement).value })} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label>Length</Label>
            <Input value={String(config.length)} placeholder="8" style={{ width: '5rem' }}
              onInput={(e) => onChange({ length: int((e.target as unknown as HTMLInputElement).value) })} />
          </FlexBox>
        </FlexBox>
      )}

      {config.mode === 'random' && config.type === 'integer' && (
        <FlexBox direction={FlexBoxDirection.Row} style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label>Min</Label>
            <Input value={String(config.min)} placeholder="1" style={{ width: '7rem' }}
              onInput={(e) => onChange({ min: num((e.target as unknown as HTMLInputElement).value) })} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label>Max</Label>
            <Input value={String(config.max)} placeholder="9999" style={{ width: '7rem' }}
              onInput={(e) => onChange({ max: num((e.target as unknown as HTMLInputElement).value) })} />
          </FlexBox>
        </FlexBox>
      )}

      {config.mode === 'random' && config.type === 'decimal' && (
        <FlexBox direction={FlexBoxDirection.Row} style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label>Min</Label>
            <Input value={String(config.min)} placeholder="0.00" style={{ width: '7rem' }}
              onInput={(e) => onChange({ min: num((e.target as unknown as HTMLInputElement).value) })} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label>Max</Label>
            <Input value={String(config.max)} placeholder="100.00" style={{ width: '7rem' }}
              onInput={(e) => onChange({ max: num((e.target as unknown as HTMLInputElement).value) })} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label>Decimal places</Label>
            <Input value={String(config.decimal_places)} placeholder="2" style={{ width: '5rem' }}
              onInput={(e) => onChange({ decimal_places: int((e.target as unknown as HTMLInputElement).value) })} />
          </FlexBox>
        </FlexBox>
      )}

      {config.mode === 'random' && (config.type === 'date' || config.type === 'datetime') && (
        <FlexBox direction={FlexBoxDirection.Row} style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label>From</Label>
            <Input value={config.date_start} placeholder="YYYY-MM-DD" style={{ width: '9rem' }}
              onInput={(e) => onChange({ date_start: (e.target as unknown as HTMLInputElement).value })} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label>To</Label>
            <Input value={config.date_end} placeholder="YYYY-MM-DD" style={{ width: '9rem' }}
              onInput={(e) => onChange({ date_end: (e.target as unknown as HTMLInputElement).value })} />
          </FlexBox>
        </FlexBox>
      )}

      {config.mode === 'random' && config.type === 'boolean' && (
        <Label style={{ color: 'var(--sapNeutralColor)' }}>Generates random true / false values.</Label>
      )}
    </FlexBox>
  )
}

// ── Field row ────────────────────────────────────────────────────────────────

function FieldRow({ field, isSelected, config, onToggle, onConfigChange }: {
  field: Field
  isSelected: boolean
  config: FieldConfig
  onToggle: () => void
  onConfigChange: (updates: Partial<FieldConfig>) => void
}) {
  return (
    <div style={{
      borderBottom: '1px solid var(--sapList_BorderColor)',
      padding: '0.6rem 0.75rem',
      background: isSelected ? 'var(--sapList_SelectionBackgroundColor)' : undefined,
    }}>
      {/* Main row */}
      <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
        <CheckBox
          checked={isSelected}
          onChange={onToggle}
        />
        <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', flex: 1, wordBreak: 'break-all' }}>
          {field.path}
        </span>
        <span style={{
          fontSize: '0.8rem',
          color: 'var(--sapNeutralColor)',
          maxWidth: '10rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {field.sample_value || '(empty)'}
        </span>
        <TypeBadge type={field.detected_type} />
      </FlexBox>

      {/* Config panel — only when selected */}
      {isSelected && (
        <div style={{ paddingLeft: '2rem' }}>
          <FieldConfigPanel config={config} onChange={onConfigChange} />
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TestDataGen() {
  const [xml,       setXml]       = useState('')
  const [fields,    setFields]    = useState<Field[]>([])
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [configs,   setConfigs]   = useState<Record<string, FieldConfig>>({})
  const [count,     setCount]     = useState('10')
  const [generating, setGenerating] = useState(false)
  const [genError,  setGenError]  = useState<string | null>(null)

  const { post, loading: analysing, error: analyseError } = useWorker<{ content: string }, AnalyseResponse>()

  // ── Analyse ──

  const analyse = async () => {
    setFields([])
    setSelected(new Set())
    setConfigs({})
    setGenError(null)
    const res = await post('/testdata/analyse', { content: xml })
    if (res) {
      setFields(res.fields)
      const initial: Record<string, FieldConfig> = {}
      for (const f of res.fields) initial[f.path] = defaultConfig(f)
      setConfigs(initial)
    }
  }

  // ── Field selection / config ──

  const toggleField = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path); else next.add(path)
      return next
    })
  }

  const updateConfig = (path: string, updates: Partial<FieldConfig>) => {
    setConfigs(prev => ({ ...prev, [path]: { ...prev[path], ...updates } }))
  }

  // ── Generate ──

  const generate = async () => {
    setGenerating(true)
    setGenError(null)
    const fieldConfigs = fields
      .filter(f => selected.has(f.path))
      .map(f => configs[f.path])
      .filter(Boolean)

    try {
      const resp = await fetch('/api/worker/testdata/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: xml,
          count: Math.min(1000, Math.max(1, parseInt(count, 10) || 10)),
          fields: fieldConfigs,
        }),
      })
      if (!resp.ok) {
        const json = await resp.json()
        setGenError(json.error ?? `HTTP ${resp.status}`)
        return
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href = url; a.download = 'test_data.zip'; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setGenerating(false)
    }
  }

  const selectedCount = selected.size
  const countNum      = Math.min(1000, Math.max(1, parseInt(count, 10) || 10))

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>

      {/* ── Card 1: XML Input ── */}
      <Card header={<CardHeader titleText="1. Sample XML" subtitleText="Paste a representative XML message to analyse its structure" />}>
        <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>
          <TextArea
            value={xml}
            rows={12}
            placeholder={'<Order>\n  <Header>\n    <OrderId>12345</OrderId>\n    <Date>2024-01-15</Date>\n  </Header>\n  <Items>\n    <Item>\n      <SKU>ABC-001</SKU>\n      <Qty>5</Qty>\n    </Item>\n  </Items>\n</Order>'}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
            onInput={(e) => { setXml((e.target as unknown as HTMLTextAreaElement).value); setFields([]) }}
          />
          {analyseError && <MessageStrip design="Negative" hideCloseButton>{analyseError}</MessageStrip>}
          <Toolbar>
            <Button design="Emphasized" disabled={!xml.trim() || analysing} onClick={analyse}>
              {analysing ? 'Analysing…' : 'Analyse XML'}
            </Button>
            {fields.length > 0 && (
              <Button design="Transparent" onClick={() => { setXml(''); setFields([]); setSelected(new Set()); setConfigs({}) }}>
                Clear
              </Button>
            )}
          </Toolbar>
        </FlexBox>
      </Card>

      {/* ── Card 2: Field Configuration ── */}
      {fields.length > 0 && (
        <Card header={
          <CardHeader
            titleText="2. Configure Fields"
            subtitleText={`${fields.length} fields found — check the fields to vary across documents`}
          />
        }>
          <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '0.5rem 0' }}>
            <MessageStrip design="Information" hideCloseButton style={{ margin: '0 0.75rem 0.5rem' }}>
              Repeated elements (e.g. multiple &lt;Item&gt; rows) share one path entry.
              All instances in a document receive the same generated value.
            </MessageStrip>
            {/* Column headers */}
            <div style={{
              display: 'flex',
              padding: '0.4rem 0.75rem',
              borderBottom: '2px solid var(--sapList_BorderColor)',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--sapContent_LabelColor)',
              gap: '0.75rem',
            }}>
              <span style={{ width: '1.5rem' }} />
              <span style={{ flex: 1 }}>Field Path</span>
              <span style={{ width: '10rem' }}>Sample Value</span>
              <span style={{ width: '5rem' }}>Type</span>
            </div>
            {fields.map(field => (
              <FieldRow
                key={field.path}
                field={field}
                isSelected={selected.has(field.path)}
                config={configs[field.path]}
                onToggle={() => toggleField(field.path)}
                onConfigChange={(upd) => updateConfig(field.path, upd)}
              />
            ))}
          </FlexBox>
        </Card>
      )}

      {/* ── Card 3: Generate ── */}
      {fields.length > 0 && (
        <Card header={<CardHeader titleText="3. Generate" subtitleText="Download a ZIP of XML test files" />}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>
            <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '1rem', flexWrap: 'wrap' }}>
              <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
                <Label>Number of documents (max 1000)</Label>
                <Input
                  value={count}
                  placeholder="10"
                  style={{ width: '6rem' }}
                  onInput={(e) => setCount((e.target as unknown as HTMLInputElement).value)}
                />
              </FlexBox>
              {selectedCount === 0 && (
                <MessageStrip design="Information" hideCloseButton>
                  No fields selected — all documents will be identical copies of the template.
                </MessageStrip>
              )}
            </FlexBox>

            {genError && <MessageStrip design="Negative" hideCloseButton>{genError}</MessageStrip>}

            <Toolbar>
              <Button
                design="Emphasized"
                disabled={generating || !xml.trim()}
                onClick={generate}
              >
                {generating
                  ? 'Generating…'
                  : `Generate ${countNum} document${countNum !== 1 ? 's' : ''} (ZIP)`}
              </Button>
              <ToolbarSpacer />
              {selectedCount > 0 && (
                <Label style={{ color: 'var(--sapNeutralColor)' }}>
                  {selectedCount} field{selectedCount !== 1 ? 's' : ''} will vary
                </Label>
              )}
            </Toolbar>
          </FlexBox>
        </Card>
      )}

    </FlexBox>
  )
}
