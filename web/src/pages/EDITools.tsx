import { useState } from 'react'
import {
  Button,
  Card,
  CardHeader,
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
  Select,
  Option,
} from '@ui5/webcomponents-react'
import { useWorker } from '../hooks/useWorker'
import { SaveToAssetsButton, LoadFromAssetButton } from './AssetStore'

// ── Types ────────────────────────────────────────────────────────────────────

type Mode = 'parse' | 'to-xml' | 'from-xml' | 'generate'

interface ParsedSegment {
  tag: string
  elements: string[][]
}

interface Summary {
  sender_id:    string
  receiver_id:  string
  message_type: string
  reference_no: string
  date:         string
}

interface ParseResult {
  standard: string
  segments: ParsedSegment[]
  summary:  Summary
  errors:   string[]
}

interface LineItem {
  item_number: string
  quantity:    number
  unit_price:  number
}

interface GenerateRequest {
  standard:     string
  message_type: string
  sender_id:    string
  receiver_id:  string
  reference_no: string
  line_items:   LineItem[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function segItem(e: Event) {
  const d = (e as CustomEvent).detail as { selectedItems?: HTMLElement[]; selectedItem?: HTMLElement }
  return d.selectedItems?.[0] ?? d.selectedItem ?? null
}

function inpVal(e: Event) {
  return (e.target as unknown as HTMLInputElement).value
}

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function parseLineItems(raw: string): LineItem[] {
  return raw.trim().split('\n')
    .map(l => l.trim()).filter(Boolean)
    .map(l => {
      const [item, qty, price] = l.split(',').map(s => s.trim())
      return {
        item_number: item  || 'ITEM-001',
        quantity:    parseFloat(qty)   || 1,
        unit_price:  parseFloat(price) || 0,
      }
    })
}

const EDIFACT_TYPES = ['ORDERS', 'INVOIC', 'DESADV']
const X12_TYPES     = ['850', '810', '856']

const SAMPLE_EDIFACT = `UNB+UNOA:1+SENDER:1+RECEIVER:1+260101:1200+00001'
UNH+1+ORDERS:D:96A:UN'
BGM+220+PO12345+9'
DTM+137:20260101:102'
NAD+BY+++BUYER COMPANY'
NAD+SU+++SUPPLIER COMPANY'
LIN+1++ITEM-001:SV'
QTY+21:10'
PRI+AAA:25.99:EA'
LIN+2++ITEM-002:SV'
QTY+21:5'
PRI+AAA:99.00:EA'
UNS+S'
CNT+2:2'
UNT+14+1'
UNZ+1+00001'`

const SAMPLE_X12 = `ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *260101*1200*^*00501*000000001*0*P*:~
GS*PO*SENDER*RECEIVER*20260101*1200*1*X*005010~
ST*850*0001~
BEG*00*NE*PO12345**20260101~
PO1*1*10*EA*25.99**IN*ITEM-001~
PO1*2*5*EA*99.00**IN*ITEM-002~
CTT*2~
SE*7*0001~
GE*1*1~
IEA*1*000000001~`

// ── Segment viewer ───────────────────────────────────────────────────────────

function SegmentTable({ segments }: { segments: ParsedSegment[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        fontFamily: 'monospace', fontSize: '0.8rem',
      }}>
        <thead>
          <tr style={{ background: 'var(--sapList_HeaderBackground)' }}>
            <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', borderBottom: '2px solid var(--sapList_BorderColor)', width: '4rem' }}>Tag</th>
            <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', borderBottom: '2px solid var(--sapList_BorderColor)' }}>Elements</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((seg, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--sapList_BorderColor)', background: i % 2 === 0 ? undefined : 'var(--sapList_AlternatingBackground)' }}>
              <td style={{ padding: '0.3rem 0.6rem', fontWeight: 700, color: 'var(--sapHighlightColor)' }}>{seg.tag}</td>
              <td style={{ padding: '0.3rem 0.6rem', color: 'var(--sapTextColor)' }}>
                {seg.elements.map((el, j) => (
                  <span key={j} style={{ marginRight: '0.75rem' }}>
                    <span style={{ color: 'var(--sapNeutralColor)', fontSize: '0.7rem' }}>{j+1}:</span>
                    {' '}{el.join(':')}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EDITools() {
  const [mode, setMode] = useState<Mode>('parse')

  // Parse mode
  const [parseInput,  setParseInput]  = useState(SAMPLE_EDIFACT)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const { post: parsePost, loading: parseLoading, error: parseErr } =
    useWorker<{ content: string }, ParseResult>()

  // EDI → XML mode
  const [toXmlInput,   setToXmlInput]   = useState(SAMPLE_EDIFACT)
  const [toXmlResult,  setToXmlResult]  = useState('')
  const [toXmlFormat,  setToXmlFormat]  = useState<'semantic' | 'technical'>('semantic')
  const { post: toXmlPost, loading: toXmlLoading, error: toXmlErr } =
    useWorker<{ content: string }, { xml: string }>()

  // XML → EDI mode
  const [fromXmlInput,  setFromXmlInput]  = useState('')
  const [fromXmlResult, setFromXmlResult] = useState('')
  const { post: fromXmlPost, loading: fromXmlLoading, error: fromXmlErr } =
    useWorker<{ content: string }, { edi: string }>()

  // Generate mode
  const [genStandard,   setGenStandard]   = useState('EDIFACT')
  const [genMsgType,    setGenMsgType]    = useState('ORDERS')
  const [genSender,     setGenSender]     = useState('SENDER')
  const [genReceiver,   setGenReceiver]   = useState('RECEIVER')
  const [genRef,        setGenRef]        = useState('PO12345')
  const [genItemsRaw,   setGenItemsRaw]   = useState('ITEM-001,10,25.99\nITEM-002,5,99.00')
  const [genResult,     setGenResult]     = useState('')
  const { post: genPost, loading: genLoading, error: genErr } =
    useWorker<GenerateRequest, { edi: string }>()

  // ── Handlers ──

  const doParse = async () => {
    setParseResult(null)
    const res = await parsePost('/edi/parse', { content: parseInput })
    if (res) setParseResult(res)
  }

  const doToXml = async () => {
    setToXmlResult('')
    const endpoint = toXmlFormat === 'semantic' ? '/edi/to-semantic-xml' : '/edi/to-xml'
    const res = await toXmlPost(endpoint, { content: toXmlInput })
    if (res) setToXmlResult(res.xml)
  }

  const doFromXml = async () => {
    setFromXmlResult('')
    const res = await fromXmlPost('/edi/from-xml', { content: fromXmlInput })
    if (res) setFromXmlResult(res.edi)
  }

  const doGenerate = async () => {
    setGenResult('')
    const res = await genPost('/edi/generate', {
      standard:     genStandard,
      message_type: genMsgType,
      sender_id:    genSender,
      receiver_id:  genReceiver,
      reference_no: genRef,
      line_items:   parseLineItems(genItemsRaw),
    })
    if (res) setGenResult(res.edi)
  }

  const msgTypes = genStandard === 'EDIFACT' ? EDIFACT_TYPES : X12_TYPES

  // ── Render ──

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>

      {/* Mode selector */}
      <Card>
        <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ padding: '0.75rem 1rem', gap: '1rem' }}>
          <Label style={{ fontWeight: 600 }}>Mode</Label>
          <SegmentedButton
            onSelectionChange={(e) => {
              const m = segItem(e as unknown as Event)?.getAttribute('data-mode') as Mode
              if (m) setMode(m)
            }}
          >
            <SegmentedButtonItem data-mode="parse"    selected={mode === 'parse'}>Parse &amp; View</SegmentedButtonItem>
            <SegmentedButtonItem data-mode="to-xml"   selected={mode === 'to-xml'}>EDI → XML</SegmentedButtonItem>
            <SegmentedButtonItem data-mode="from-xml" selected={mode === 'from-xml'}>XML → EDI</SegmentedButtonItem>
            <SegmentedButtonItem data-mode="generate" selected={mode === 'generate'}>Generate</SegmentedButtonItem>
          </SegmentedButton>
        </FlexBox>
      </Card>

      {/* ── Parse & View ── */}
      {mode === 'parse' && (
        <>
          <Card header={<CardHeader titleText="EDI Input" subtitleText="Paste EDIFACT or X12 — standard is auto-detected" />}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>
              <TextArea
                value={parseInput}
                rows={10}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
                onInput={(e) => { setParseInput((e.target as unknown as HTMLTextAreaElement).value); setParseResult(null) }}
              />
              {parseErr && <MessageStrip design="Negative" hideCloseButton>{parseErr}</MessageStrip>}
              <Toolbar>
                <Button design="Emphasized" disabled={!parseInput.trim() || parseLoading} onClick={doParse}>
                  {parseLoading ? 'Parsing…' : 'Parse'}
                </Button>
                <Button design="Transparent" onClick={() => { setParseInput(SAMPLE_EDIFACT); setParseResult(null) }}>EDIFACT sample</Button>
                <Button design="Transparent" onClick={() => { setParseInput(SAMPLE_X12); setParseResult(null) }}>X12 sample</Button>
                <LoadFromAssetButton contentType="edi" onLoad={(c) => { setParseInput(c); setParseResult(null) }} />
              </Toolbar>
            </FlexBox>
          </Card>

          {parseResult && (
            <>
              {/* Summary */}
              <Card header={<CardHeader titleText={`${parseResult.standard} Message`} subtitleText={parseResult.summary.message_type} />}>
                <FlexBox direction={FlexBoxDirection.Row} style={{ padding: '1rem', gap: '2rem', flexWrap: 'wrap' }}>
                  {[
                    ['Sender',      parseResult.summary.sender_id],
                    ['Receiver',    parseResult.summary.receiver_id],
                    ['Message Type',parseResult.summary.message_type],
                    ['Reference',   parseResult.summary.reference_no],
                    ['Date',        parseResult.summary.date],
                  ].map(([label, value]) => value ? (
                    <FlexBox key={label} direction={FlexBoxDirection.Column} style={{ gap: '0.2rem' }}>
                      <Label style={{ color: 'var(--sapNeutralColor)', fontSize: '0.78rem' }}>{label}</Label>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{value}</span>
                    </FlexBox>
                  ) : null)}
                </FlexBox>
              </Card>

              {/* Errors */}
              {parseResult.errors?.length > 0 && (
                <Card header={<CardHeader titleText="Validation Errors" />}>
                  <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '0.75rem 1rem', gap: '0.5rem' }}>
                    {parseResult.errors.map((e, i) => (
                      <MessageStrip key={i} design="Negative" hideCloseButton>{e}</MessageStrip>
                    ))}
                  </FlexBox>
                </Card>
              )}

              {/* Segments */}
              <Card header={<CardHeader titleText="Segments" subtitleText={`${parseResult.segments.length} segments`} />}>
                <div style={{ padding: '0.5rem' }}>
                  <SegmentTable segments={parseResult.segments} />
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {/* ── EDI → XML ── */}
      {mode === 'to-xml' && (
        <Card header={<CardHeader
          titleText="EDI → XML"
          subtitleText={toXmlFormat === 'semantic'
            ? 'Semantic — business-named elements grouped for SAP CPI mapping'
            : 'Technical — preserves raw segment/element structure for round-trip'}
        />}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>

            {/* Format toggle */}
            <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
              <Label style={{ fontWeight: 600 }}>XML Format</Label>
              <SegmentedButton
                onSelectionChange={(e) => {
                  const v = segItem(e as unknown as Event)?.getAttribute('data-fmt') as 'semantic' | 'technical'
                  if (v) { setToXmlFormat(v); setToXmlResult('') }
                }}
              >
                <SegmentedButtonItem data-fmt="semantic"  selected={toXmlFormat === 'semantic'}>Semantic</SegmentedButtonItem>
                <SegmentedButtonItem data-fmt="technical" selected={toXmlFormat === 'technical'}>Technical</SegmentedButtonItem>
              </SegmentedButton>
            </FlexBox>

            {toXmlFormat === 'technical' && (
              <MessageStrip design="Information" hideCloseButton>
                Technical XML preserves the raw segment/element/component structure and can be converted back to EDI using the <strong>XML → EDI</strong> mode.
              </MessageStrip>
            )}

            <Label style={{ fontWeight: 600 }}>EDI Input</Label>
            <TextArea
              value={toXmlInput}
              rows={10}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
              onInput={(e) => { setToXmlInput((e.target as unknown as HTMLTextAreaElement).value); setToXmlResult('') }}
            />
            {toXmlErr && <MessageStrip design="Negative" hideCloseButton>{toXmlErr}</MessageStrip>}
            <Toolbar>
              <Button design="Emphasized" disabled={!toXmlInput.trim() || toXmlLoading} onClick={doToXml}>
                {toXmlLoading ? 'Converting…' : 'Convert to XML'}
              </Button>
              <LoadFromAssetButton contentType="edi" onLoad={(c) => { setToXmlInput(c); setToXmlResult('') }} />
              {toXmlResult && (
                <>
                  <Button design="Transparent" icon="download" onClick={() => downloadText(toXmlResult, 'edi_message.xml')}>
                    Download XML
                  </Button>
                  <SaveToAssetsButton content={toXmlResult} contentType="xml" suggestedName="edi_message" />
                </>
              )}
            </Toolbar>
            {toXmlResult && (
              <>
                <Label style={{ fontWeight: 600 }}>XML Output</Label>
                <TextArea
                  value={toXmlResult}
                  rows={16}
                  readonly
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
                />
              </>
            )}
          </FlexBox>
        </Card>
      )}

      {/* ── XML → EDI ── */}
      {mode === 'from-xml' && (
        <Card header={<CardHeader titleText="XML → EDI" subtitleText="Convert toolkit EDI XML back to raw EDIFACT or X12" />}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>
            <MessageStrip design="Information" hideCloseButton>
              Paste the <strong>Technical</strong> XML produced by the <strong>EDI → XML</strong> tool (not Semantic).
              The <code>standard</code> attribute on the root element determines the output format.
            </MessageStrip>
            <Label style={{ fontWeight: 600 }}>XML Input</Label>
            <TextArea
              value={fromXmlInput}
              rows={14}
              placeholder={'<EDIMessage standard="EDIFACT">\n  <Segment tag="UNB">...</Segment>\n</EDIMessage>'}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
              onInput={(e) => { setFromXmlInput((e.target as unknown as HTMLTextAreaElement).value); setFromXmlResult('') }}
            />
            {fromXmlErr && <MessageStrip design="Negative" hideCloseButton>{fromXmlErr}</MessageStrip>}
            <Toolbar>
              <Button design="Emphasized" disabled={!fromXmlInput.trim() || fromXmlLoading} onClick={doFromXml}>
                {fromXmlLoading ? 'Converting…' : 'Convert to EDI'}
              </Button>
              <LoadFromAssetButton contentType="xml" onLoad={(c) => { setFromXmlInput(c); setFromXmlResult('') }} />
              {fromXmlResult && (
                <>
                  <Button design="Transparent" icon="download" onClick={() => downloadText(fromXmlResult, 'message.edi')}>
                    Download EDI
                  </Button>
                  <SaveToAssetsButton content={fromXmlResult} contentType="edi" suggestedName="message" />
                </>
              )}
            </Toolbar>
            {fromXmlResult && (
              <>
                <Label style={{ fontWeight: 600 }}>EDI Output</Label>
                <TextArea
                  value={fromXmlResult}
                  rows={12}
                  readonly
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
                />
              </>
            )}
          </FlexBox>
        </Card>
      )}

      {/* ── Generate ── */}
      {mode === 'generate' && (
        <Card header={<CardHeader titleText="Generate EDI" subtitleText="Produce a syntactically valid EDIFACT or X12 test file" />}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>

            {/* Standard + Message Type */}
            <FlexBox direction={FlexBoxDirection.Row} style={{ gap: '1rem', flexWrap: 'wrap' }}>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                <Label>Standard</Label>
                <SegmentedButton
                  onSelectionChange={(e) => {
                    const v = segItem(e as unknown as Event)?.getAttribute('data-std')
                    if (v) { setGenStandard(v); setGenMsgType(v === 'EDIFACT' ? 'ORDERS' : '850') }
                  }}
                >
                  <SegmentedButtonItem data-std="EDIFACT" selected={genStandard === 'EDIFACT'}>EDIFACT</SegmentedButtonItem>
                  <SegmentedButtonItem data-std="X12"     selected={genStandard === 'X12'}>ANSI X12</SegmentedButtonItem>
                </SegmentedButton>
              </FlexBox>

              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                <Label>Message Type</Label>
                <Select
                  onChange={(e) => {
                    const v = (e.detail as unknown as { selectedOption: { value: string } }).selectedOption?.value
                    if (v) setGenMsgType(v)
                  }}
                >
                  {msgTypes.map(t => (
                    <Option key={t} value={t} selected={genMsgType === t}>{t}</Option>
                  ))}
                </Select>
              </FlexBox>
            </FlexBox>

            {/* Sender / Receiver / Ref */}
            <FlexBox direction={FlexBoxDirection.Row} style={{ gap: '1rem', flexWrap: 'wrap' }}>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1, minWidth: '10rem' }}>
                <Label>Sender ID</Label>
                <Input value={genSender} style={{ width: '100%' }}
                  onInput={(e) => setGenSender(inpVal(e as unknown as Event))} />
              </FlexBox>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1, minWidth: '10rem' }}>
                <Label>Receiver ID</Label>
                <Input value={genReceiver} style={{ width: '100%' }}
                  onInput={(e) => setGenReceiver(inpVal(e as unknown as Event))} />
              </FlexBox>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1, minWidth: '10rem' }}>
                <Label>Reference Number</Label>
                <Input value={genRef} style={{ width: '100%' }}
                  onInput={(e) => setGenRef(inpVal(e as unknown as Event))} />
              </FlexBox>
            </FlexBox>

            {/* Line items */}
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label>
                Line Items <span style={{ color: 'var(--sapNeutralColor)', fontWeight: 400 }}>(ItemNumber, Quantity, UnitPrice — one per line)</span>
              </Label>
              <TextArea
                value={genItemsRaw}
                rows={5}
                placeholder={'ITEM-001,10,25.99\nITEM-002,5,99.00'}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
                onInput={(e) => setGenItemsRaw((e.target as unknown as HTMLTextAreaElement).value)}
              />
            </FlexBox>

            {genErr && <MessageStrip design="Negative" hideCloseButton>{genErr}</MessageStrip>}

            <Toolbar>
              <Button design="Emphasized" disabled={genLoading} onClick={doGenerate}>
                {genLoading ? 'Generating…' : `Generate ${genStandard} ${genMsgType}`}
              </Button>
              {genResult && (
                <>
                  <Button design="Transparent" icon="download"
                    onClick={() => downloadText(genResult, `${genMsgType.toLowerCase()}.edi`)}>
                    Download EDI
                  </Button>
                  <SaveToAssetsButton content={genResult} contentType="edi" suggestedName={genMsgType.toLowerCase()} />
                  <ToolbarSpacer />
                  <Button design="Transparent" onClick={() => { setToXmlInput(genResult); setMode('to-xml') }}>
                    Open in EDI → XML
                  </Button>
                </>
              )}
            </Toolbar>

            {genResult && (
              <TextArea
                value={genResult}
                rows={14}
                readonly
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
              />
            )}

          </FlexBox>
        </Card>
      )}

    </FlexBox>
  )
}
