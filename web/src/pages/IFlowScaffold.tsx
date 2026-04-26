import { useState } from 'react'
import {
  Button,
  CheckBox,
  FlexBox,
  FlexBoxAlignItems,
  FlexBoxJustifyContent,
  Input,
  Label,
  MessageStrip,
  Option,
  Select,
  TextArea,
} from '@ui5/webcomponents-react'
import { useCPIInstance } from '../context/CPIInstanceContext'

// ── Constants ──────────────────────────────────────────────────────────────────

const RESTRICTED_TYPES  = ['QAS', 'PPD', 'PRD']
const SENDER_ADAPTERS   = ['HTTPS', 'SFTP']
const RECEIVER_ADAPTERS = ['HTTP', 'SFTP']

const ZZ_PLACEHOLDERS: Record<string, string[]> = {
  HTTPS: ['ZZURLPATH — HTTP endpoint path exposed on CPI (e.g. /http/my-endpoint)'],
  SFTP:  ['ZZHOST — SFTP server hostname', 'ZZCREDENTIALNAME — credential alias in Security Material', 'ZZDIRECTORY — SFTP directory path'],
  HTTP:  ['ZZURL — target HTTP endpoint URL', 'ZZCREDENTIALNAME — credential alias in Security Material'],
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function toScreamingSnakeCase(s: string): string {
  return s.toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^[^A-Z]+/, '')   // strip leading non-alpha so ID always starts with a letter
    .replace(/_$/g, '')
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function IFlowScaffold() {
  const { selectedInstance } = useCPIInstance()

  // Reactive — recalculated on every render, driven by context
  const isRestricted = selectedInstance ? RESTRICTED_TYPES.includes(selectedInstance.system_type) : false
  const noInstance   = !selectedInstance

  return (
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden' }}>

      {/* ── Hard guardrail overlay ──────────────────────────────────────────
          Immediately covers the page when a restricted instance is selected.
          pointer-events:none on the content below prevents all interaction. */}
      {isRestricted && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          background: 'rgba(30, 30, 30, 0.72)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--sapList_Background)',
            border: '2px solid var(--sapNegativeColor)',
            borderRadius: '8px',
            padding: '2rem 2.5rem',
            maxWidth: '480px',
            textAlign: 'center',
            fontFamily: 'var(--sapFontFamily)',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🚫</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--sapNegativeColor)', marginBottom: '0.75rem' }}>
              Not Available for this Environment
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--sapTextColor)', lineHeight: 1.6, marginBottom: '1rem' }}>
              iFlow Scaffold is restricted to <strong>development environments (TRL, SBX, DEV)</strong>.
            </div>
            <div style={{
              display: 'inline-block',
              padding: '0.35rem 1rem',
              borderRadius: '4px',
              background: 'var(--sapNegativeBackground)',
              color: 'var(--sapNegativeColor)',
              fontWeight: 700,
              fontSize: '0.9rem',
              letterSpacing: '0.06em',
              marginBottom: '1rem',
            }}>
              {selectedInstance?.system_type} — NOT PERMITTED
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
              This tool must not be used with QAS, PPD, or PRD systems.<br/>
              Switch the "Working with" instance to a development system to continue.
            </div>
          </div>
        </div>
      )}

      {/* ── Page content — blurred underneath when restricted ── */}
      <div style={{ height: '100%', overflowY: 'auto', padding: '1.5rem', boxSizing: 'border-box',
        pointerEvents: isRestricted ? 'none' : 'auto' }}>

        {noInstance && (
          <MessageStrip design="Information" hideCloseButton style={{ marginBottom: '1rem' }}>
            No CPI instance selected — choose one from the "Working with" bar.
          </MessageStrip>
        )}

        <ScaffoldForm instanceId={selectedInstance?.id ?? ''} disabled={noInstance} />
      </div>
    </div>
  )
}

// ── Form ───────────────────────────────────────────────────────────────────────

interface FormState {
  name:            string
  iflowId:         string
  packageName:     string
  packageId:       string
  description:     string
  senderAdapter:   string
  receiverAdapter: string
  includeGroovy:   boolean
  groovyName:      string
  includeXSLT:     boolean
  xsltName:        string
}

function ScaffoldForm({ instanceId, disabled }: { instanceId: string; disabled: boolean }) {
  const [step,       setStep]       = useState(1)
  const [generating,  setGenerating]  = useState(false)
  const [uploading,   setUploading]   = useState(false)
  const [checking,    setChecking]    = useState(false)
  const [error,       setError]       = useState('')
  const [uploadMsg,   setUploadMsg]   = useState('')
  const [preflight,   setPreflight]   = useState<{ package_id: string; package_exists: boolean; iflow_id: string; iflow_exists: boolean } | null>(null)

  const [form, setForm] = useState<FormState>({
    name: '', iflowId: '', packageName: '', packageId: '',
    description: '', senderAdapter: 'HTTPS', receiverAdapter: 'HTTP',
    includeGroovy: false, groovyName: 'script',
    includeXSLT: false, xsltName: 'mapping',
  })

  const patch = (p: Partial<FormState>) => setForm(prev => ({ ...prev, ...p }))

  const handleNameChange = (val: string) =>
    patch({ name: val, iflowId: toScreamingSnakeCase(val) })

  const handlePkgNameChange = (val: string) =>
    patch({ packageName: val, packageId: toScreamingSnakeCase(val) })

  const canAdvance = () => {
    if (step === 1) return form.name.trim() !== '' && form.iflowId.trim() !== ''
    return true
  }

  const buildPayload = () => ({
    instance_id:      instanceId,
    name:             form.name,
    iflow_id:         form.iflowId,
    package_name:     form.packageName,
    package_id:       form.packageId,
    description:      form.description,
    sender_adapter:   form.senderAdapter,
    receiver_adapter: form.receiverAdapter,
    include_groovy:   form.includeGroovy,
    groovy_name:      form.groovyName || 'script',
    include_xslt:     form.includeXSLT,
    xslt_name:        form.xsltName || 'mapping',
  })

  const checkBeforeUpload = async () => {
    setChecking(true); setError(''); setPreflight(null); setUploadMsg('')
    try {
      const res = await fetch('/api/cpidev/scaffold/upload-preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      const data = await res.json().catch(() => ({ error: res.statusText }))
      if (!res.ok) throw new Error(data.error || res.statusText)
      setPreflight(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  const confirmUpload = async () => {
    setUploading(true); setError(''); setUploadMsg('')
    try {
      const res = await fetch('/api/cpidev/scaffold/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      const data = await res.json().catch(() => ({ error: res.statusText }))
      if (!res.ok) throw new Error(data.error || res.statusText)
      setUploadMsg(data.message || 'Uploaded successfully')
      setPreflight(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  const download = async () => {
    setGenerating(true); setError('')
    try {
      const res = await fetch('/api/cpidev/scaffold/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(data.error || res.statusText)
      }

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = form.iflowId + '.zip'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  const placeholders = [
    ...(ZZ_PLACEHOLDERS[form.senderAdapter]   ?? []),
    ...(ZZ_PLACEHOLDERS[form.receiverAdapter] ?? []),
  ]

  return (
    <div style={{ maxWidth: '720px' }}>

      <StepIndicator current={step} />

      {/* ── Step 1: Identity ── */}
      {step === 1 && (
        <FormSection title="1 — Identity">
          <FormRow label="iFlow Display Name" required>
            <Input value={form.name} placeholder="e.g. SFTP to HTTP - Orders"
              style={{ width: '100%' }} disabled={disabled}
              onInput={(e) => handleNameChange((e.target as any).value)} />
          </FormRow>
          <FormRow label="iFlow ID" required hint="Must start with a letter or underscore — auto-generated, editable">
            <Input value={form.iflowId} placeholder="SFTP_TO_HTTP_ORDERS"
              style={{ width: '100%', fontFamily: 'monospace' }} disabled={disabled}
              onInput={(e) => patch({ iflowId: (e.target as any).value })} />
          </FormRow>
          <FormRow label="Package Name">
            <Input value={form.packageName} placeholder="e.g. Orders Integration"
              style={{ width: '100%' }} disabled={disabled}
              onInput={(e) => handlePkgNameChange((e.target as any).value)} />
          </FormRow>
          <FormRow label="Package ID" hint="Auto-generated, editable">
            <Input value={form.packageId} placeholder="ORDERS_INTEGRATION"
              style={{ width: '100%', fontFamily: 'monospace' }} disabled={disabled}
              onInput={(e) => patch({ packageId: (e.target as any).value })} />
          </FormRow>
          <FormRow label="Description">
            <TextArea value={form.description} rows={2} style={{ width: '100%' }}
              placeholder="One sentence — what does this interface do?"
              onInput={(e) => patch({ description: (e.target as any).value })} />
          </FormRow>
        </FormSection>
      )}

      {/* ── Step 2: Pattern ── */}
      {step === 2 && (
        <FormSection title="2 — Pattern">
          <FormRow label="Sender Adapter">
            <Select style={{ minWidth: '160px' }}
              onChange={(e) => patch({ senderAdapter: (e.detail.selectedOption as HTMLElement).dataset.value ?? 'HTTPS' })}>
              {SENDER_ADAPTERS.map(a => <Option key={a} data-value={a} selected={form.senderAdapter === a}>{a}</Option>)}
            </Select>
          </FormRow>
          <FormRow label="Receiver Adapter">
            <Select style={{ minWidth: '160px' }}
              onChange={(e) => patch({ receiverAdapter: (e.detail.selectedOption as HTMLElement).dataset.value ?? 'HTTP' })}>
              {RECEIVER_ADAPTERS.map(a => <Option key={a} data-value={a} selected={form.receiverAdapter === a}>{a}</Option>)}
            </Select>
          </FormRow>
          <div style={{ marginTop: '0.5rem', padding: '0.75rem',
            background: 'var(--sapNeutralBackground)', borderRadius: '4px',
            fontSize: '0.82rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)' }}>
            <strong style={{ color: 'var(--sapTextColor)' }}>Pattern:</strong> {form.senderAdapter} → Integration Process → {form.receiverAdapter}
            &nbsp;&nbsp;<strong style={{ color: 'var(--sapTextColor)' }}>Type:</strong> Async
          </div>
          {(form.senderAdapter === 'SFTP' || form.receiverAdapter === 'SFTP') && (
            <MessageStrip design="Information" hideCloseButton style={{ marginTop: '0.5rem' }}>
              SFTP: After import, verify <strong>Proxy Type</strong> (Internet vs On-Premise) in the adapter before deploying.
            </MessageStrip>
          )}
        </FormSection>
      )}

      {/* ── Step 3: Steps ── */}
      {step === 3 && (
        <FormSection title="3 — Flow Steps">
          <LockedStep label="Exception Subprocess"
            description="Always included — catches unhandled errors and sets exception message as body." />
          <LockedStep label="Content Modifier — Set Standard Headers"
            description="Always included — sets SAP_ApplicationID with timestamp and exchange ID." />

          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <CheckBox text="Include Groovy Script stub" checked={form.includeGroovy}
                onChange={(e) => patch({ includeGroovy: (e.target as any).checked })} />
              {form.includeGroovy && (
                <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem', paddingLeft: '1.75rem' }}>
                  <Label>Filename:</Label>
                  <Input value={form.groovyName} placeholder="script"
                    style={{ width: '180px', fontFamily: 'monospace' }}
                    onInput={(e) => patch({ groovyName: (e.target as any).value })} />
                  <span style={{ fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'monospace' }}>.groovy</span>
                </FlexBox>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <CheckBox text="Include XSLT Mapping stub" checked={form.includeXSLT}
                onChange={(e) => patch({ includeXSLT: (e.target as any).checked })} />
              {form.includeXSLT && (
                <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem', paddingLeft: '1.75rem' }}>
                  <Label>Filename:</Label>
                  <Input value={form.xsltName} placeholder="mapping"
                    style={{ width: '180px', fontFamily: 'monospace' }}
                    onInput={(e) => patch({ xsltName: (e.target as any).value })} />
                  <span style={{ fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'monospace' }}>.xsl</span>
                </FlexBox>
              )}
            </div>
          </div>
        </FormSection>
      )}

      {/* ── Step 4: Review & Download ── */}
      {step === 4 && (
        <FormSection title="4 — Review & Download">
          <SummaryTable rows={[
            ['iFlow Name',       form.name],
            ['iFlow ID',         form.iflowId],
            ['Package',          form.packageName ? `${form.packageName} (${form.packageId})` : '—'],
            ['Description',      form.description || '—'],
            ['Sender',           form.senderAdapter],
            ['Receiver',         form.receiverAdapter],
            ['Groovy stub',      form.includeGroovy ? (form.groovyName || 'script') + '.groovy' : 'No'],
            ['XSLT stub',        form.includeXSLT   ? (form.xsltName || 'mapping') + '.xsl'    : 'No'],
          ]} />

          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem',
              fontFamily: 'var(--sapFontFamily)', color: 'var(--sapTextColor)' }}>
              Post-import — fill these ZZ placeholders in CPI
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {placeholders.map((p, i) => (
                <div key={i} style={{ fontSize: '0.82rem', fontFamily: 'var(--sapFontFamily)',
                  display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--sapWarningColor)', fontWeight: 700, flexShrink: 0, fontFamily: 'monospace' }}>ZZ</span>
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <MessageStrip design="Negative" style={{ marginTop: '1rem' }} hideCloseButton={false} onClose={() => setError('')}>
              {error}
            </MessageStrip>
          )}

          {uploadMsg && (
            <MessageStrip design="Positive" style={{ marginTop: '1rem' }} hideCloseButton={false} onClose={() => setUploadMsg('')}>
              {uploadMsg}
            </MessageStrip>
          )}

          {preflight && (
            <div style={{
              marginTop: '1rem', padding: '0.875rem 1rem',
              border: '1px solid var(--sapList_BorderColor)', borderRadius: '6px',
              background: 'var(--sapNeutralBackground)', fontFamily: 'var(--sapFontFamily)',
            }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--sapTextColor)' }}>
                Confirm upload to tenant
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem' }}>
                <PreflightLine
                  label="Package"
                  id={preflight.package_id}
                  exists={preflight.package_exists}
                  createMsg="will be created"
                  existsMsg="already exists"
                />
                <PreflightLine
                  label="iFlow"
                  id={preflight.iflow_id}
                  exists={preflight.iflow_exists}
                  createMsg="will be created"
                  existsMsg="will be updated (overwrite)"
                />
              </div>
              <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
                <Button design="Emphasized" onClick={confirmUpload} disabled={uploading}>
                  {uploading ? 'Uploading…' : 'Confirm Upload'}
                </Button>
                <Button design="Transparent" onClick={() => setPreflight(null)} disabled={uploading}>
                  Cancel
                </Button>
              </FlexBox>
            </div>
          )}

          <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem', marginTop: '1.5rem' }}>
            <Button design="Emphasized" onClick={download}
              disabled={generating || uploading || disabled || !form.iflowId}>
              {generating ? 'Generating…' : `⬇ Download ${form.iflowId}.zip`}
            </Button>
            {!preflight && (
              <Button design="Default" onClick={checkBeforeUpload}
                disabled={checking || uploading || generating || disabled || !form.iflowId || !form.packageId}>
                {checking ? 'Checking…' : '↑ Upload to Tenant'}
              </Button>
            )}
          </FlexBox>
        </FormSection>
      )}

      {/* Step navigation */}
      <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween}
        style={{ marginTop: '1.25rem' }}>
        <Button design="Transparent" disabled={step === 1} onClick={() => setStep(s => s - 1)}>
          ← Back
        </Button>
        {step < 4 && (
          <Button design="Emphasized" disabled={!canAdvance() || disabled} onClick={() => setStep(s => s + 1)}>
            Next →
          </Button>
        )}
      </FlexBox>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  const labels = ['Identity', 'Pattern', 'Steps', 'Review']
  return (
    <div style={{ display: 'flex', marginBottom: '1.5rem',
      borderBottom: '2px solid var(--sapList_BorderColor)', paddingBottom: '0.75rem' }}>
      {labels.map((label, i) => {
        const n      = i + 1
        const active = n === current
        const done   = n < current
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '1.5rem' }}>
            <div style={{
              width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--sapFontFamily)',
              background: done ? 'var(--sapSuccessColor)' : active ? 'var(--sapHighlightColor)' : 'var(--sapNeutralBackground)',
              color: (done || active) ? '#fff' : 'var(--sapContent_LabelColor)',
            }}>
              {done ? '✓' : n}
            </div>
            <span style={{
              fontSize: '0.82rem', fontFamily: 'var(--sapFontFamily)',
              fontWeight: active ? 600 : 400,
              color: active ? 'var(--sapTextColor)' : 'var(--sapContent_LabelColor)',
            }}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--sapList_Background)',
      border: '1px solid var(--sapList_BorderColor)', borderRadius: '6px', padding: '1.25rem' }}>
      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--sapTextColor)',
        fontFamily: 'var(--sapFontFamily)', marginBottom: '1rem' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {children}
      </div>
    </div>
  )
}

function FormRow({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '0.5rem', alignItems: 'start' }}>
      <div>
        <Label style={{ fontFamily: 'var(--sapFontFamily)' }}>
          {label}{required && <span style={{ color: 'var(--sapNegativeColor)' }}> *</span>}
        </Label>
        {hint && (
          <div style={{ fontSize: '0.72rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', marginTop: '0.1rem' }}>
            {hint}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

function LockedStep({ label, description }: { label: string; description: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
      padding: '0.5rem 0.75rem', background: 'var(--sapSuccessBackground)',
      borderRadius: '4px', border: '1px solid var(--sapSuccessBorderColor)' }}>
      <span style={{ color: 'var(--sapSuccessColor)', flexShrink: 0 }}>✓</span>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--sapTextColor)', fontFamily: 'var(--sapFontFamily)' }}>{label}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)' }}>{description}</div>
      </div>
    </div>
  )
}

function PreflightLine({ label, id, exists, createMsg, existsMsg }: {
  label: string; id: string; exists: boolean; createMsg: string; existsMsg: string
}) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.82rem', alignItems: 'center' }}>
      <span style={{ color: 'var(--sapContent_LabelColor)', minWidth: '52px' }}>{label}</span>
      <span style={{ fontFamily: 'monospace', color: 'var(--sapTextColor)' }}>{id}</span>
      <span style={{
        padding: '0.1rem 0.5rem', borderRadius: '3px', fontSize: '0.75rem',
        background: exists ? 'var(--sapWarningBackground)' : 'var(--sapSuccessBackground)',
        color: exists ? 'var(--sapWarningColor)' : 'var(--sapSuccessColor)',
        border: `1px solid ${exists ? 'var(--sapWarningBorderColor)' : 'var(--sapSuccessBorderColor)'}`,
      }}>
        {exists ? existsMsg : createMsg}
      </span>
    </div>
  )
}

function SummaryTable({ rows }: { rows: [string, string][] }) {
  return (
    <div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: '160px 1fr',
          padding: '0.4rem 0', borderBottom: '1px solid var(--sapList_BorderColor)',
          fontSize: '0.82rem', fontFamily: 'var(--sapFontFamily)' }}>
          <span style={{ color: 'var(--sapContent_LabelColor)', fontWeight: 600 }}>{k}</span>
          <span style={{ color: 'var(--sapTextColor)' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}
