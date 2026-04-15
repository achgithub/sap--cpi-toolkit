import { useState, useRef } from 'react'
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
import { SaveToAssetsButton, LoadFromAssetButton } from './AssetStore'

// ── Types ────────────────────────────────────────────────────────────────────

interface Field {
  path: string
  sample_value: string
  detected_type: string
}

interface AnalyseResponse {
  fields: Field[]
  repeat_points: string[]
  synthesized_template?: string
}

interface CSVTemplateResponse {
  csv: string
  repeat_points: string[]
}

interface FieldConfig {
  path:          string
  type:          string
  mode:          'random' | 'fixed' | 'expression'
  value:         string
  expression:    string
  min:           number
  max:           number
  decimal_places: number
  date_start:    string
  date_end:      string
  prefix:        string
  length:        number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultConfig(field: Field): FieldConfig {
  const now = new Date()
  const yearAgo = new Date(now); yearAgo.setFullYear(now.getFullYear() - 1)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return {
    path:           field.path,
    type:           field.detected_type,
    mode:           'random',
    value:          field.sample_value,
    expression:     '',
    min:            1,
    max:            9999,
    decimal_places: 2,
    date_start:     fmt(yearAgo),
    date_end:       fmt(now),
    prefix:         '',
    length:         8,
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

const ALL_TYPES = ['string', 'integer', 'decimal', 'date', 'datetime', 'boolean']

function TypeBadge({ type }: { type: string }) {
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 600,
      padding: '0.15rem 0.45rem', borderRadius: '0.75rem',
      background: TYPE_COLOUR[type] ?? '#888', color: '#fff', whiteSpace: 'nowrap',
    }}>
      {type}
    </span>
  )
}

function CsvBadge() {
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 600,
      padding: '0.15rem 0.45rem', borderRadius: '0.75rem',
      background: '#6c00a4', color: '#fff', whiteSpace: 'nowrap',
    }}>
      CSV
    </span>
  )
}

function RepeatBadge() {
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 600,
      padding: '0.15rem 0.45rem', borderRadius: '0.75rem',
      background: '#e76500', color: '#fff', whiteSpace: 'nowrap',
    }}>
      repeat
    </span>
  )
}

function segItem(e: Event) {
  const d = (e as CustomEvent).detail as { selectedItems?: HTMLElement[]; selectedItem?: HTMLElement }
  return d.selectedItems?.[0] ?? d.selectedItem ?? null
}

function inpVal(e: Event) {
  return (e.target as unknown as HTMLInputElement).value
}

function downloadText(content: string, filename: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Type selector (used in FieldConfigPanel) ─────────────────────────────────

function TypeSelector({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  return (
    <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
      <Label style={{ minWidth: '4rem' }}>Type</Label>
      {ALL_TYPES.map(t => (
        <span
          key={t}
          onClick={() => onChange(t)}
          style={{
            cursor: 'pointer',
            fontSize: '0.7rem', fontWeight: 600,
            padding: '0.15rem 0.45rem', borderRadius: '0.75rem',
            background: value === t ? (TYPE_COLOUR[t] ?? '#888') : 'transparent',
            color: value === t ? '#fff' : (TYPE_COLOUR[t] ?? '#888'),
            border: `1px solid ${TYPE_COLOUR[t] ?? '#888'}`,
            whiteSpace: 'nowrap',
          }}
        >
          {t}
        </span>
      ))}
    </FlexBox>
  )
}

// ── Field config panel ───────────────────────────────────────────────────────

function FieldConfigPanel({ config, allFields, onChange }: {
  config: FieldConfig
  allFields: Field[]
  onChange: (u: Partial<FieldConfig>) => void
}) {
  const num = (s: string) => parseFloat(s) || 0
  const int = (s: string) => parseInt(s, 10) || 0

  const insertToken = (token: string) =>
    onChange({ expression: config.expression + token })

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.5rem', paddingTop: '0.5rem' }}>

      {/* Type selector */}
      <TypeSelector value={config.type} onChange={(t) => onChange({ type: t })} />

      {/* Mode toggle */}
      <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
        <Label>Mode</Label>
        <SegmentedButton
          onSelectionChange={(e) => {
            const m = segItem(e as unknown as Event)?.getAttribute('data-mode')
            if (m === 'random' || m === 'fixed' || m === 'expression') onChange({ mode: m })
          }}
        >
          <SegmentedButtonItem data-mode="random"     selected={config.mode === 'random'}>Random</SegmentedButtonItem>
          <SegmentedButtonItem data-mode="fixed"      selected={config.mode === 'fixed'}>Fixed</SegmentedButtonItem>
          <SegmentedButtonItem data-mode="expression" selected={config.mode === 'expression'}>Expression</SegmentedButtonItem>
        </SegmentedButton>
      </FlexBox>

      {/* ── Fixed ── */}
      {config.mode === 'fixed' && (
        <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
          <Label style={{ minWidth: '4rem' }}>Value</Label>
          <Input value={config.value} style={{ flex: 1 }}
            onInput={(e) => onChange({ value: inpVal(e as unknown as Event) })} />
        </FlexBox>
      )}

      {/* ── Expression ── */}
      {config.mode === 'expression' && (
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.5rem' }}>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label style={{ minWidth: '4rem' }}>Template</Label>
            <Input
              value={config.expression}
              placeholder='e.g. ORD-{Order.Header.Date}-{random}'
              style={{ flex: 1, fontFamily: 'monospace' }}
              onInput={(e) => onChange({ expression: inpVal(e as unknown as Event) })}
            />
          </FlexBox>
          <MessageStrip design="Information" hideCloseButton>
            <strong>{'{field.path}'}</strong> inserts another field's value.&nbsp;
            <strong>{'{random}'}</strong> inserts a random value using this field's type settings below.
          </MessageStrip>
          {/* Quick-insert: other field paths */}
          <FlexBox direction={FlexBoxDirection.Row} style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
            <Label style={{ fontSize: '0.75rem', color: 'var(--sapNeutralColor)', alignSelf: 'center' }}>Insert:</Label>
            <Button design="Transparent" style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}
              onClick={() => insertToken('{random}')}>
              {'{random}'}
            </Button>
            {allFields
              .filter(f => f.path !== config.path)
              .map(f => (
                <Button key={f.path} design="Transparent" style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}
                  onClick={() => insertToken('{' + f.path + '}')}>
                  {'{' + f.path + '}'}
                </Button>
              ))}
          </FlexBox>
          <Label style={{ fontSize: '0.75rem', color: 'var(--sapNeutralColor)' }}>
            Random settings for <code>{'{random}'}</code> token:
          </Label>
        </FlexBox>
      )}

      {/* ── Random / {random} type config ── */}
      {(config.mode === 'random' || config.mode === 'expression') && config.type === 'string' && (
        <FlexBox direction={FlexBoxDirection.Row} style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label style={{ minWidth: '4rem' }}>Prefix</Label>
            <Input value={config.prefix} placeholder="e.g. ORD-" style={{ width: '8rem' }}
              onInput={(e) => onChange({ prefix: inpVal(e as unknown as Event) })} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label>Length</Label>
            <Input value={String(config.length)} placeholder="8" style={{ width: '5rem' }}
              onInput={(e) => onChange({ length: int(inpVal(e as unknown as Event)) })} />
          </FlexBox>
        </FlexBox>
      )}

      {(config.mode === 'random' || config.mode === 'expression') && config.type === 'integer' && (
        <FlexBox direction={FlexBoxDirection.Row} style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label>Min</Label>
            <Input value={String(config.min)} placeholder="1" style={{ width: '7rem' }}
              onInput={(e) => onChange({ min: num(inpVal(e as unknown as Event)) })} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label>Max</Label>
            <Input value={String(config.max)} placeholder="9999" style={{ width: '7rem' }}
              onInput={(e) => onChange({ max: num(inpVal(e as unknown as Event)) })} />
          </FlexBox>
        </FlexBox>
      )}

      {(config.mode === 'random' || config.mode === 'expression') && config.type === 'decimal' && (
        <FlexBox direction={FlexBoxDirection.Row} style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label>Min</Label>
            <Input value={String(config.min)} placeholder="0.00" style={{ width: '7rem' }}
              onInput={(e) => onChange({ min: num(inpVal(e as unknown as Event)) })} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label>Max</Label>
            <Input value={String(config.max)} placeholder="100.00" style={{ width: '7rem' }}
              onInput={(e) => onChange({ max: num(inpVal(e as unknown as Event)) })} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label>Decimal places</Label>
            <Input value={String(config.decimal_places)} placeholder="2" style={{ width: '5rem' }}
              onInput={(e) => onChange({ decimal_places: int(inpVal(e as unknown as Event)) })} />
          </FlexBox>
        </FlexBox>
      )}

      {(config.mode === 'random' || config.mode === 'expression') &&
       (config.type === 'date' || config.type === 'datetime') && (
        <FlexBox direction={FlexBoxDirection.Row} style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label>From</Label>
            <Input value={config.date_start} placeholder="YYYY-MM-DD" style={{ width: '9rem' }}
              onInput={(e) => onChange({ date_start: inpVal(e as unknown as Event) })} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <Label>To</Label>
            <Input value={config.date_end} placeholder="YYYY-MM-DD" style={{ width: '9rem' }}
              onInput={(e) => onChange({ date_end: inpVal(e as unknown as Event) })} />
          </FlexBox>
        </FlexBox>
      )}

      {(config.mode === 'random' || config.mode === 'expression') && config.type === 'boolean' && (
        <Label style={{ color: 'var(--sapNeutralColor)' }}>Generates random true / false values.</Label>
      )}

    </FlexBox>
  )
}

// ── Field row ────────────────────────────────────────────────────────────────

function FieldRow({ field, isSelected, isCsvCovered, isRepeat, config, allFields, onToggle, onConfigChange }: {
  field: Field
  isSelected: boolean
  isCsvCovered: boolean
  isRepeat: boolean
  config: FieldConfig
  allFields: Field[]
  onToggle: () => void
  onConfigChange: (u: Partial<FieldConfig>) => void
}) {
  return (
    <div style={{
      borderBottom: '1px solid var(--sapList_BorderColor)',
      padding: '0.6rem 0.75rem',
      background: isSelected ? 'var(--sapList_SelectionBackgroundColor)' : undefined,
    }}>
      <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
        <CheckBox checked={isSelected} onChange={onToggle} />
        <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', flex: 1, wordBreak: 'break-all' }}>
          {field.path}
        </span>
        <span style={{
          fontSize: '0.8rem', color: 'var(--sapNeutralColor)',
          maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {field.sample_value || '(empty)'}
        </span>
        <TypeBadge type={field.detected_type} />
        {isRepeat && <RepeatBadge />}
        {isCsvCovered && <CsvBadge />}
      </FlexBox>

      {isSelected && !isCsvCovered && (
        <div style={{ paddingLeft: '2rem' }}>
          <FieldConfigPanel config={config} allFields={allFields} onChange={onConfigChange} />
        </div>
      )}
      {isSelected && isCsvCovered && (
        <div style={{ paddingLeft: '2rem', paddingTop: '0.4rem' }}>
          <Label style={{ color: 'var(--sapNeutralColor)', fontSize: '0.8rem' }}>
            Value supplied by CSV — random/fixed config is ignored.
            Switch to Expression mode on another field to reference this value via {'{' + field.path + '}'}.
          </Label>
        </div>
      )}
    </div>
  )
}

// ── CSV preview (client-side, for feedback only) ─────────────────────────────

function parseCsvPreview(raw: string): { columns: string[]; rowCount: number; docCount: number; isNested: boolean; error: string | null } {
  const lines = raw.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return { columns: [], rowCount: 0, docCount: 0, isNested: false, error: 'Need at least a header row and one data row.' }
  const columns = lines[0].split(',').map(s => s.trim().replace(/^"|"$/g, ''))
  const isNested = columns[0] === '__doc__'
  const rowCount = lines.length - 1

  let docCount = rowCount
  if (isNested) {
    const docCol = 0
    const docs = new Set(lines.slice(1).map(l => l.split(',')[docCol]?.trim()))
    docCount = docs.size
  }

  return { columns, rowCount, docCount, isNested, error: null }
}

// ── Placeholders ──────────────────────────────────────────────────────────────

const XML_PLACEHOLDER = '<Order>\n  <Header>\n    <OrderId>10001</OrderId>\n    <Date>2024-01-15</Date>\n  </Header>\n  <Items>\n    <Item><SKU>ABC-001</SKU><Qty>5</Qty></Item>\n    <Item><SKU>DEF-002</SKU><Qty>2</Qty></Item>\n  </Items>\n</Order>'

const XSD_PLACEHOLDER = '<?xml version="1.0" encoding="UTF-8"?>\n<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">\n  <xs:element name="Order">\n    <xs:complexType>\n      <xs:sequence>\n        <xs:element name="Header">\n          <xs:complexType>\n            <xs:sequence>\n              <xs:element name="OrderId" type="xs:string"/>\n              <xs:element name="Date" type="xs:date"/>\n            </xs:sequence>\n          </xs:complexType>\n        </xs:element>\n        <xs:element name="Items">\n          <xs:complexType>\n            <xs:sequence>\n              <xs:element name="Item" minOccurs="1" maxOccurs="unbounded">\n                <xs:complexType>\n                  <xs:sequence>\n                    <xs:element name="SKU" type="xs:string"/>\n                    <xs:element name="Qty" type="xs:integer"/>\n                  </xs:sequence>\n                </xs:complexType>\n              </xs:element>\n            </xs:sequence>\n          </xs:complexType>\n        </xs:element>\n      </xs:sequence>\n    </xs:complexType>\n  </xs:element>\n</xs:schema>'

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TestDataGen() {
  const [inputMode,      setInputMode]      = useState<'xml' | 'xsd'>('xml')
  const [content,        setContent]        = useState('')
  const [synthTemplate,  setSynthTemplate]  = useState('')
  const [fields,         setFields]         = useState<Field[]>([])
  const [repeatPoints,   setRepeatPoints]   = useState<string[]>([])
  const [selected,       setSelected]       = useState<Set<string>>(new Set())
  const [configs,        setConfigs]        = useState<Record<string, FieldConfig>>({})
  const [count,          setCount]          = useState('10')
  const [csvRaw,         setCsvRaw]         = useState('')
  const [csvPreview,     setCsvPreview]     = useState<ReturnType<typeof parseCsvPreview> | null>(null)
  const [generating,     setGenerating]     = useState(false)
  const [genError,       setGenError]       = useState<string | null>(null)
  const [csvTplLoading,  setCsvTplLoading]  = useState(false)
  const [csvTplError,    setCsvTplError]    = useState<string | null>(null)

  const csvUploadRef = useRef<HTMLInputElement>(null)

  const { post, loading: analysing, error: analyseError } = useWorker<{ content: string; input_type: string }, AnalyseResponse>()

  // ── Mode switch — clear state ──

  const switchMode = (mode: 'xml' | 'xsd') => {
    setInputMode(mode)
    setContent(''); setFields([]); setRepeatPoints([]); setSelected(new Set())
    setConfigs({}); setSynthTemplate(''); setGenError(null)
    setCsvRaw(''); setCsvPreview(null)
  }

  // ── Analyse ──

  const analyse = async () => {
    setFields([]); setRepeatPoints([]); setSelected(new Set()); setConfigs({})
    setGenError(null); setSynthTemplate('')
    const res = await post('/testdata/analyse', { content, input_type: inputMode })
    if (res) {
      setFields(res.fields)
      setRepeatPoints(res.repeat_points ?? [])
      if (res.synthesized_template) setSynthTemplate(res.synthesized_template)
      const init: Record<string, FieldConfig> = {}
      for (const f of res.fields) init[f.path] = defaultConfig(f)
      setConfigs(init)
    }
  }

  // The XML used for CSV template download and generation.
  // In XSD mode use the synthesized template; in XML mode use the pasted XML.
  const templateXML = inputMode === 'xsd' ? synthTemplate : content

  // ── CSV Template download ──

  const downloadCsvTemplate = async () => {
    setCsvTplLoading(true); setCsvTplError(null)
    try {
      const resp = await fetch('/api/worker/testdata/csv-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: templateXML }),
      })
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}))
        setCsvTplError(json.error ?? `HTTP ${resp.status}`)
        return
      }
      const data: CSVTemplateResponse = await resp.json()
      downloadText(data.csv, 'test_data_template.csv', 'text/csv')
    } catch (e) {
      setCsvTplError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setCsvTplLoading(false)
    }
  }

  // ── CSV ──

  const onCsvChange = (raw: string) => {
    setCsvRaw(raw)
    setCsvPreview(raw.trim() ? parseCsvPreview(raw) : null)
  }

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => onCsvChange((ev.target?.result as string) ?? '')
    reader.readAsText(file)
    e.target.value = '' // reset so same file can be re-selected
  }

  const csvColumns   = csvPreview?.columns ?? []
  const csvActive    = csvPreview != null && csvPreview.error == null && csvPreview.rowCount > 0
  const csvIsNested  = csvPreview?.isNested ?? false

  // ── Field selection / config ──

  const toggleField = (path: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(path)) next.delete(path); else next.add(path)
    return next
  })

  const updateConfig = (path: string, updates: Partial<FieldConfig>) =>
    setConfigs(prev => ({ ...prev, [path]: { ...prev[path], ...updates } }))

  // ── Generate ──

  const generate = async () => {
    setGenerating(true); setGenError(null)
    const fieldConfigs = fields
      .filter(f => selected.has(f.path))
      .map(f => configs[f.path])
      .filter(Boolean)

    const docCount = csvActive
      ? (csvIsNested ? (csvPreview!.docCount) : csvPreview!.rowCount)
      : Math.min(1000, Math.max(1, parseInt(count, 10) || 10))

    try {
      const resp = await fetch('/api/worker/testdata/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template:  templateXML,
          count:     docCount,
          fields:    fieldConfigs,
          csv_data:  csvRaw.trim() || undefined,
        }),
      })
      if (!resp.ok) {
        const json = await resp.json()
        setGenError(json.error ?? `HTTP ${resp.status}`)
        return
      }
      const blob = await resp.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = 'test_data.zip'; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setGenerating(false)
    }
  }

  const selectedCount = selected.size
  const countNum      = csvActive
    ? (csvIsNested ? csvPreview!.docCount : csvPreview!.rowCount)
    : Math.min(1000, Math.max(1, parseInt(count, 10) || 10))

  const unmatchedCsvCols = !csvIsNested
    ? csvColumns.filter(c => fields.length > 0 && !fields.some(f => f.path === c))
    : []

  const flatCsvMatchedCols = !csvIsNested ? csvColumns : []

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>

      {/* ── Card 1: Schema Input ── */}
      <Card header={
        <CardHeader
          titleText="1. Schema Input"
          subtitleText={inputMode === 'xml'
            ? 'Paste a representative XML message to analyse its structure'
            : 'Paste an XSD schema — field types and repeat counts are read from the schema definition'}
        />
      }>
        <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>

          {/* Mode toggle */}
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
            <Label>Input type</Label>
            <SegmentedButton
              onSelectionChange={(e) => {
                const m = segItem(e as unknown as Event)?.getAttribute('data-mode') as 'xml' | 'xsd' | null
                if (m) switchMode(m)
              }}
            >
              <SegmentedButtonItem data-mode="xml" selected={inputMode === 'xml'}>Sample XML</SegmentedButtonItem>
              <SegmentedButtonItem data-mode="xsd" selected={inputMode === 'xsd'}>XSD Schema</SegmentedButtonItem>
            </SegmentedButton>
          </FlexBox>

          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
            <LoadFromAssetButton contentType="xml" onLoad={(c) => { setContent(c); setFields([]) }} />
          </FlexBox>
          <TextArea
            value={content}
            rows={12}
            placeholder={inputMode === 'xml' ? XML_PLACEHOLDER : XSD_PLACEHOLDER}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
            onInput={(e) => { setContent((e.target as unknown as HTMLTextAreaElement).value); setFields([]) }}
          />

          {analyseError && <MessageStrip design="Negative" hideCloseButton>{analyseError}</MessageStrip>}
          {csvTplError  && <MessageStrip design="Negative" hideCloseButton>{csvTplError}</MessageStrip>}

          <Toolbar>
            <Button design="Emphasized" disabled={!content.trim() || analysing} onClick={analyse}>
              {analysing ? 'Analysing…' : inputMode === 'xsd' ? 'Analyse XSD' : 'Analyse XML'}
            </Button>
            {fields.length > 0 && (
              <Button design="Default" icon="download" disabled={csvTplLoading} onClick={downloadCsvTemplate}>
                {csvTplLoading ? 'Generating…' : 'Download CSV Template'}
              </Button>
            )}
            {fields.length > 0 && (
              <Button design="Transparent" onClick={() => {
                setContent(''); setFields([]); setRepeatPoints([]); setSelected(new Set())
                setConfigs({}); setSynthTemplate('')
                setCsvRaw(''); setCsvPreview(null)
              }}>
                Clear All
              </Button>
            )}
          </Toolbar>

          {inputMode === 'xsd' && synthTemplate && (
            <MessageStrip design="Positive" hideCloseButton>
              Schema analysed — synthesized XML template generated internally
              ({synthTemplate.split('\n').length} lines). Generation and CSV template use this automatically.
            </MessageStrip>
          )}

          {fields.length > 0 && repeatPoints.length > 0 && (
            <MessageStrip design="Information" hideCloseButton>
              <strong>{repeatPoints.length} repeat point{repeatPoints.length !== 1 ? 's' : ''} detected</strong>
              {inputMode === 'xsd'
                ? ' — elements with maxOccurs > 1 or unbounded. The synthesized template includes multiple instances.'
                : ' — elements that appear more than once per document.'
              }
              {' '}Use <strong>Download CSV Template</strong> for a pre-built nested template.
              Paths: <code>{repeatPoints.join(', ')}</code>
            </MessageStrip>
          )}
        </FlexBox>
      </Card>

      {/* ── Card 2: CSV Data (optional) ── */}
      {fields.length > 0 && (
        <Card header={
          <CardHeader
            titleText="2. CSV Data (optional)"
            subtitleText="Supply a CSV to drive document generation — flat or nested"
          />
        }>
          <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>
            <MessageStrip design="Information" hideCloseButton>
              <strong>Flat CSV</strong> — column headers = field paths (e.g. <code>Order.Header.OrderId</code>).
              One row = one document. Leave blank to use count-based generation.<br />
              <strong>Nested CSV</strong> — use <em>Download CSV Template</em> above to generate a template with
              a <code>__doc__</code> column. Rows sharing the same <code>__doc__</code> value build one document;
              repeating elements are expanded automatically.
            </MessageStrip>

            {/* Upload hidden input */}
            <input
              ref={csvUploadRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={handleCsvFileUpload}
            />

            <TextArea
              value={csvRaw}
              rows={8}
              placeholder={repeatPoints.length > 0
                ? '__doc__,Order.Header.OrderId,Order.Header.Date,Order.Items.Item.SKU,Order.Items.Item.Qty\n1,10001,2024-01-15,ABC-001,5\n1,10001,2024-01-15,DEF-002,2\n2,10002,2024-01-16,GHI-003,10'
                : 'Order.Header.OrderId,Order.Header.Date\n10001,2024-01-15\n10002,2024-01-16\n10003,2024-01-17'}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
              onInput={(e) => onCsvChange((e.target as unknown as HTMLTextAreaElement).value)}
            />

            {csvPreview?.error && (
              <MessageStrip design="Negative" hideCloseButton>{csvPreview.error}</MessageStrip>
            )}
            {csvActive && csvIsNested && (
              <MessageStrip design="Positive" hideCloseButton>
                Nested CSV — <strong>{csvPreview!.docCount} document{csvPreview!.docCount !== 1 ? 's' : ''}</strong> across {csvPreview!.rowCount} row{csvPreview!.rowCount !== 1 ? 's' : ''}.
              </MessageStrip>
            )}
            {csvActive && !csvIsNested && (
              <MessageStrip design="Positive" hideCloseButton>
                {csvPreview!.rowCount} row{csvPreview!.rowCount !== 1 ? 's' : ''} detected (flat CSV).
                Columns: <strong>{csvColumns.join(', ')}</strong>
                {unmatchedCsvCols.length > 0 && (
                  <> — <span style={{ color: '#e76500' }}>No match for: {unmatchedCsvCols.join(', ')}</span></>
                )}
              </MessageStrip>
            )}

            <Toolbar>
              <Button icon="upload" onClick={() => csvUploadRef.current?.click()}>Upload CSV</Button>
              {csvRaw.trim() && (
                <Button design="Transparent" onClick={() => { setCsvRaw(''); setCsvPreview(null) }}>
                  Clear CSV
                </Button>
              )}
            </Toolbar>
          </FlexBox>
        </Card>
      )}

      {/* ── Card 3: Field Configuration ── */}
      {fields.length > 0 && (
        <Card header={
          <CardHeader
            titleText="3. Configure Fields"
            subtitleText={`${fields.length} field${fields.length !== 1 ? 's' : ''} found — check the fields to vary`}
          />
        }>
          <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '0.5rem 0' }}>
            {csvIsNested ? (
              <MessageStrip design="Information" hideCloseButton style={{ margin: '0 0.75rem 0.5rem' }}>
                Nested CSV mode is active — all values come from the CSV. Field configs are ignored.
              </MessageStrip>
            ) : (
              <MessageStrip design="Information" hideCloseButton style={{ margin: '0 0.75rem 0.5rem' }}>
                Tick a field to configure it. Use the <strong>Type</strong> selector to correct any incorrectly detected
                or unknown types before choosing a generation mode.
              </MessageStrip>
            )}
            {/* Column headers */}
            <div style={{
              display: 'flex', padding: '0.4rem 0.75rem',
              borderBottom: '2px solid var(--sapList_BorderColor)',
              fontSize: '0.78rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', gap: '0.75rem',
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
                isCsvCovered={csvActive && !csvIsNested && flatCsvMatchedCols.includes(field.path)}
                isRepeat={repeatPoints.some(rp => field.path.startsWith(rp + '.') || field.path === rp)}
                config={configs[field.path]}
                allFields={fields}
                onToggle={() => toggleField(field.path)}
                onConfigChange={(upd) => updateConfig(field.path, upd)}
              />
            ))}
          </FlexBox>
        </Card>
      )}

      {/* ── Card 4: Generate ── */}
      {fields.length > 0 && (
        <Card header={<CardHeader titleText="4. Generate" subtitleText="Download a ZIP of XML test files" />}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>

            {!csvActive && (
              <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
                <Label>Number of documents (max 1000)</Label>
                <Input
                  value={count}
                  placeholder="10"
                  style={{ width: '6rem' }}
                  onInput={(e) => setCount(inpVal(e as unknown as Event))}
                />
              </FlexBox>
            )}

            {csvActive && (
              <MessageStrip design="Information" hideCloseButton>
                {csvIsNested
                  ? <>Count from nested CSV: <strong>{csvPreview!.docCount} document{csvPreview!.docCount !== 1 ? 's' : ''}</strong> ({csvPreview!.rowCount} rows).</>
                  : <>Count from flat CSV: <strong>{csvPreview!.rowCount} document{csvPreview!.rowCount !== 1 ? 's' : ''}</strong>.</>
                }
              </MessageStrip>
            )}

            {genError && <MessageStrip design="Negative" hideCloseButton>{genError}</MessageStrip>}

            {selectedCount === 0 && !csvActive && (
              <MessageStrip design="Critical" hideCloseButton>
                No fields selected — all documents will be identical copies of the template.
              </MessageStrip>
            )}

            <Toolbar>
              <Button design="Emphasized" disabled={generating || !templateXML.trim()} onClick={generate}>
                {generating
                  ? 'Generating…'
                  : `Generate ${countNum} document${countNum !== 1 ? 's' : ''} (ZIP)`}
              </Button>
              <SaveToAssetsButton content={templateXML} contentType="xml" suggestedName="test_template" />
              <ToolbarSpacer />
              <Label style={{ color: 'var(--sapNeutralColor)' }}>
                {csvIsNested
                  ? `Nested CSV — repeat points expanded`
                  : csvActive
                    ? `${flatCsvMatchedCols.filter(c => fields.some(f => f.path === c)).length} field${flatCsvMatchedCols.length !== 1 ? 's' : ''} from CSV`
                    : selectedCount > 0
                      ? `${selectedCount} field${selectedCount !== 1 ? 's' : ''} will vary`
                      : ''}
              </Label>
            </Toolbar>
          </FlexBox>
        </Card>
      )}

    </FlexBox>
  )
}
