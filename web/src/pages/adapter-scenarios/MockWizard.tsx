import { useState, useEffect } from 'react'
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
  TextArea,
  Toolbar,
  ToolbarSpacer,
} from '@ui5/webcomponents-react'
import type { Adapter, AdapterConfig, Scenario, WizardAsset } from './types'
import {
  RECEIVER_TYPES,
  SENDER_TYPES_LIST,
  templateConfig,
  kvToString,
  parseKV,
  wizardPreviewURL,
} from './templates'
import { apiFetch } from './api'

type WizardStep = 'direction' | 'configure'

// ── AssetField ────────────────────────────────────────────────────────────────
// Dropdown of saved assets that pre-fills a textarea; user can still overtype.

function AssetField({
  label, value, onChange, assets, contentTypes, rows, placeholder, note,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  assets: WizardAsset[]
  contentTypes?: string[]
  rows?: number
  placeholder?: string
  note?: string
}) {
  const filtered = contentTypes
    ? assets.filter(a => contentTypes.includes(a.content_type))
    : assets
  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
      <FlexBox style={{ alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Label>{label}</Label>
        {note && (
          <span style={{ fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)' }}>{note}</span>
        )}
        {filtered.length > 0 && (
          <Select style={{ minWidth: '12rem' }}
            onChange={(e: any) => {
              const id = e.detail.selectedOption.value
              if (id) {
                const a = filtered.find(x => x.id === id)
                if (a) onChange(a.content)
              }
            }}>
            <Option value="">— from asset —</Option>
            {filtered.map(a => <Option key={a.id} value={a.id}>{a.name}</Option>)}
          </Select>
        )}
      </FlexBox>
      <TextArea
        value={value}
        rows={rows ?? 6}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
        placeholder={placeholder}
        onInput={(e: any) => onChange(e.target.value)}
      />
    </FlexBox>
  )
}

// ── WizardConfigForm ──────────────────────────────────────────────────────────
// Protocol-specific config form with per-field asset dropdowns.
// Used only inside MockWizard. For inline-add/edit use AdapterConfigForm instead.

function WizardConfigForm({ type, config, onChange, assets }: {
  type: string
  config: AdapterConfig
  onChange: (c: AdapterConfig) => void
  assets: WizardAsset[]
}) {
  const set = (patch: Partial<AdapterConfig>) => onChange({ ...config, ...patch })
  const isSender = type.endsWith('-SENDER')
  const bodyTypes = ['xml', 'json', 'text', 'edi', 'csv']

  if (isSender) {
    return (
      <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem' }}>
        <FlexBox style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 2, minWidth: '14rem' }}>
            <Label required>Target URL</Label>
            <Input value={config.target_url ?? ''} onInput={(e: any) => set({ target_url: e.target.value })}
              placeholder="https://my-cpi-tenant.hana.ondemand.com/http/..." style={{ width: '100%' }} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', minWidth: '8rem' }}>
            <Label>Method</Label>
            <Select style={{ width: '100%' }}
              onChange={(e: any) => set({ method: e.detail.selectedOption.value })}>
              {['POST', 'PUT', 'GET', 'PATCH'].map(m =>
                <Option key={m} value={m} selected={(config.method ?? 'POST') === m}>{m}</Option>)}
            </Select>
          </FlexBox>
        </FlexBox>
        <AssetField
          label="Request Headers"
          value={kvToString(config.request_headers ?? {})}
          onChange={v => set({ request_headers: parseKV(v) })}
          assets={assets}
          contentTypes={['headers']}
          rows={3}
          placeholder="Content-Type: application/xml"
        />
        <AssetField
          label="Request Body"
          value={config.request_body ?? ''}
          onChange={v => set({ request_body: v })}
          assets={assets}
          contentTypes={bodyTypes}
          rows={8}
          placeholder="Payload to send to CPI…"
        />
      </FlexBox>
    )
  }

  const autoNote = (t: string) => {
    if (t === 'XI')      return '(leave empty — async 202 is standard)'
    if (t === 'SOAP')    return '(leave empty to auto-generate success/fault response)'
    if (t === 'AS2')     return '(leave empty — MDN auto-generated)'
    if (t === 'AS4')     return '(leave empty — Receipt signal auto-generated)'
    if (t === 'EDIFACT') return '(leave empty — ACK auto-generated)'
    return undefined
  }

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem' }}>
      <FlexBox style={{ gap: '1rem', flexWrap: 'wrap' }}>
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', minWidth: '8rem' }}>
          <Label>Status Code</Label>
          <Input type="Number" value={String(config.status_code)}
            onInput={(e: any) => set({ status_code: Number(e.target.value) })} style={{ width: '100%' }} />
        </FlexBox>
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', minWidth: '8rem' }}>
          <Label>Delay (ms)</Label>
          <Input type="Number" value={String(config.response_delay_ms)}
            onInput={(e: any) => set({ response_delay_ms: Number(e.target.value) })} style={{ width: '100%' }} />
        </FlexBox>
        {(type === 'SOAP' || type === 'XI') && (
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', minWidth: '8rem' }}>
            <Label>SOAP Version</Label>
            <Select style={{ width: '100%' }}
              onChange={(e: any) => set({ soap_version: e.detail.selectedOption.value })}>
              <Option value="1.1" selected={(config.soap_version ?? '1.1') !== '1.2'}>1.1</Option>
              <Option value="1.2" selected={config.soap_version === '1.2'}>1.2</Option>
            </Select>
          </FlexBox>
        )}
      </FlexBox>

      {type === 'AS2' && (
        <FlexBox style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
            <Label>AS2 From</Label>
            <Input value={config.as2_from ?? ''} onInput={(e: any) => set({ as2_from: e.target.value })}
              placeholder="Sender AS2 ID" style={{ width: '100%' }} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
            <Label>AS2 To</Label>
            <Input value={config.as2_to ?? 'KYMA_STUB'} onInput={(e: any) => set({ as2_to: e.target.value })}
              style={{ width: '100%' }} />
          </FlexBox>
        </FlexBox>
      )}

      {type === 'AS4' && (
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
          <Label>AS4 Party ID</Label>
          <Input value={config.as4_party_id ?? 'KYMA_STUB'} onInput={(e: any) => set({ as4_party_id: e.target.value })}
            style={{ width: '100%' }} />
        </FlexBox>
      )}

      {type === 'EDIFACT' && (
        <FlexBox style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', minWidth: '10rem' }}>
            <Label>EDI Standard</Label>
            <Select style={{ width: '100%' }}
              onChange={(e: any) => set({ edi_standard: e.detail.selectedOption.value })}>
              <Option value="" selected={!config.edi_standard}>Auto-detect</Option>
              <Option value="EDIFACT" selected={config.edi_standard === 'EDIFACT'}>EDIFACT</Option>
              <Option value="X12" selected={config.edi_standard === 'X12'}>X12</Option>
            </Select>
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
            <Label>Sender ID</Label>
            <Input value={config.edi_sender_id ?? 'STUBSND'} onInput={(e: any) => set({ edi_sender_id: e.target.value })}
              style={{ width: '100%' }} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
            <Label>Receiver ID</Label>
            <Input value={config.edi_receiver_id ?? 'STUBRCV'} onInput={(e: any) => set({ edi_receiver_id: e.target.value })}
              style={{ width: '100%' }} />
          </FlexBox>
        </FlexBox>
      )}

      <AssetField
        label="Response Headers"
        value={kvToString(config.response_headers ?? {})}
        onChange={v => set({ response_headers: parseKV(v) })}
        assets={assets}
        contentTypes={['headers']}
        rows={3}
        placeholder="Content-Type: application/json"
        note={['SOAP', 'XI', 'AS2', 'AS4', 'EDIFACT'].includes(type) ? '(leave empty — auto-set by protocol)' : undefined}
      />

      <AssetField
        label="Response Body"
        value={config.response_body}
        onChange={v => set({ response_body: v })}
        assets={assets}
        contentTypes={bodyTypes}
        rows={10}
        placeholder={autoNote(type) ?? 'Response body…'}
        note={autoNote(type)}
      />
    </FlexBox>
  )
}

// ── MockWizard ────────────────────────────────────────────────────────────────

export function MockWizard({ onDone, setError }: {
  onDone: () => void
  setError: (e: string) => void
}) {
  const [step, setStep] = useState<WizardStep>('direction')

  // Step 1
  const [direction,    setDirection]    = useState<'receiver' | 'sender'>('receiver')
  const [adapterType,  setAdapterType]  = useState('REST')
  const [slug,         setSlug]         = useState('')

  // Step 2
  const [displayName,  setDisplayName]  = useState('')
  const [behaviorMode, setBehaviorMode] = useState('success')
  const [config,       setConfig]       = useState<AdapterConfig>(templateConfig('REST'))
  const [scenarioId,   setScenarioId]   = useState('unassigned')
  const [credUser,     setCredUser]     = useState('')
  const [credPass,     setCredPass]     = useState('')

  // Shared data
  const [assets,          setAssets]          = useState<WizardAsset[]>([])
  const [scenarios,       setScenarios]       = useState<Scenario[]>([])
  const [createdAdapter,  setCreatedAdapter]  = useState<Adapter | null>(null)
  const [creating,        setCreating]        = useState(false)
  const [copied,          setCopied]          = useState(false)

  useEffect(() => {
    apiFetch('/assets').then((d: WizardAsset[]) => setAssets(d ?? [])).catch(() => {})
    apiFetch('/scenarios').then((d: Scenario[]) => {
      setScenarios(d ?? [])
      if ((d ?? []).some((s: Scenario) => s.id === 'unassigned')) setScenarioId('unassigned')
      else if ((d ?? []).length > 0) setScenarioId(d[0].id)
    }).catch(() => {})
  }, [])

  const typeList = direction === 'receiver' ? RECEIVER_TYPES : SENDER_TYPES_LIST

  const changeDirection = (dir: 'receiver' | 'sender') => {
    setDirection(dir)
    const firstType = dir === 'receiver' ? RECEIVER_TYPES[0] : SENDER_TYPES_LIST[0]
    setAdapterType(firstType)
    setConfig(templateConfig(firstType))
  }

  const changeType = (t: string) => {
    setAdapterType(t)
    setConfig(templateConfig(t))
  }

  const goToConfigure = () => {
    if (!slug.trim()) return
    if (!displayName) setDisplayName(slug.trim())
    setStep('configure')
  }

  const createMock = async () => {
    if (!displayName.trim() || !slug.trim()) return
    setCreating(true)
    try {
      const body: any = {
        name: displayName.trim(),
        slug: slug.trim(),
        type: adapterType,
        behavior_mode: behaviorMode,
        config,
      }
      if (credUser) body.credentials = { username: credUser, password: credPass }
      const adapter: Adapter = await apiFetch('/scenarios/' + scenarioId + '/adapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setCreatedAdapter(adapter)
    } catch (e: any) { setError(e.message) }
    finally { setCreating(false) }
  }

  const copyURL = () => {
    if (!createdAdapter?.ingress_url) return
    navigator.clipboard.writeText(createdAdapter.ingress_url).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  const reset = () => {
    setStep('direction'); setDirection('receiver'); setAdapterType('REST')
    setSlug(''); setDisplayName(''); setBehaviorMode('success')
    setConfig(templateConfig('REST')); setScenarioId('unassigned')
    setCredUser(''); setCredPass(''); setCreatedAdapter(null); setCopied(false)
  }

  const isSender = adapterType.endsWith('-SENDER')

  // ── Result view ──
  if (createdAdapter) {
    return (
      <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
        <Toolbar>
          <Button design="Transparent" icon="nav-back" onClick={onDone} />
          <Label style={{ fontSize: '1.25rem', fontWeight: 600, marginLeft: '0.5rem' }}>Mock Created</Label>
        </Toolbar>
        <Card header={<CardHeader titleText={createdAdapter.name} subtitleText={createdAdapter.type} />}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1.5rem', gap: '1rem', alignItems: 'flex-start' }}>
            <MessageStrip design="Positive" hideCloseButton>
              {isSender
                ? 'Sender adapter created. Configure your CPI iFlow sender channel to call this URL.'
                : 'Receiver mock is live. Point your CPI iFlow receiver channel at this URL.'}
            </MessageStrip>
            {createdAdapter.ingress_url && (
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.5rem', width: '100%' }}>
                <Label style={{ fontWeight: 600 }}>Endpoint URL</Label>
                <FlexBox style={{ gap: '0.5rem', alignItems: 'center' }}>
                  <code style={{
                    flex: 1, background: 'var(--sapField_Background)',
                    border: '1px solid var(--sapField_BorderColor)',
                    borderRadius: '4px', padding: '0.5rem 0.75rem',
                    fontSize: '0.9rem', wordBreak: 'break-all',
                  }}>{createdAdapter.ingress_url}</code>
                  <Button icon="copy" onClick={copyURL}>{copied ? 'Copied!' : 'Copy'}</Button>
                </FlexBox>
              </FlexBox>
            )}
            <FlexBox style={{ gap: '0.5rem', marginTop: '0.5rem' }}>
              <Button design="Default" onClick={reset}>Create Another</Button>
              <Button design="Emphasized" onClick={onDone}>Done</Button>
            </FlexBox>
          </FlexBox>
        </Card>
      </FlexBox>
    )
  }

  // ── Step renders ──
  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
      <Toolbar>
        <Button design="Transparent" icon="nav-back" onClick={onDone} />
        <Label style={{ fontSize: '1.25rem', fontWeight: 600, marginLeft: '0.5rem' }}>
          New Mock — Step {step === 'direction' ? '1' : '2'} of 2
        </Label>
        <ToolbarSpacer />
        <span style={{ fontSize: '0.85rem', color: 'var(--sapContent_LabelColor)' }}>
          {step === 'direction' ? 'Direction & Type' : 'Configure & Save'}
        </span>
      </Toolbar>

      {/* ── Step 1: Direction & Type ── */}
      {step === 'direction' && (
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
          <Card header={<CardHeader titleText="Direction" subtitleText="Is this adapter receiving calls from CPI, or sending calls to CPI?" />}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>
              <FlexBox style={{ gap: '0.75rem' }}>
                {(['receiver', 'sender'] as const).map(dir => (
                  <div key={dir} onClick={() => changeDirection(dir)} style={{
                    flex: 1, padding: '1rem',
                    border: `2px solid ${direction === dir ? 'var(--sapButton_Emphasized_Background)' : 'var(--sapField_BorderColor)'}`,
                    borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                    background: direction === dir ? 'var(--sapList_SelectionBackgroundColor)' : 'var(--sapField_Background)',
                  }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>{dir === 'receiver' ? '↓' : '↑'}</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' }}>
                      {dir === 'receiver' ? 'Receiver' : 'Sender'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)' }}>
                      {dir === 'receiver'
                        ? 'CPI calls this system — mock the target backend'
                        : 'This system calls CPI — mock the inbound caller'}
                    </div>
                  </div>
                ))}
              </FlexBox>

              <FlexBox style={{ gap: '1rem', flexWrap: 'wrap' }}>
                <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1, minWidth: '10rem' }}>
                  <Label required>Adapter Type</Label>
                  <Select style={{ width: '100%' }}
                    onChange={(e: any) => changeType(e.detail.selectedOption.value)}>
                    {typeList.map(t => (
                      <Option key={t} value={t} selected={t === adapterType}>{t}</Option>
                    ))}
                  </Select>
                </FlexBox>
                <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 2, minWidth: '14rem' }}>
                  <Label required>
                    URL Slug{' '}
                    <span style={{ fontWeight: 400, color: 'var(--sapContent_LabelColor)' }}>
                      (unique name, used in the endpoint URL)
                    </span>
                  </Label>
                  <Input
                    value={slug}
                    onInput={(e: any) => setSlug((e.target.value as string).toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    placeholder="e.g. fi-ok  or  bp-err"
                    style={{ width: '100%' }}
                  />
                  {slug.trim() && (
                    <code style={{ fontSize: '0.78rem', color: 'var(--sapContent_LabelColor)' }}>
                      {wizardPreviewURL(adapterType, slug)}
                    </code>
                  )}
                </FlexBox>
              </FlexBox>
            </FlexBox>
          </Card>

          <FlexBox style={{ gap: '0.5rem' }}>
            <Button onClick={onDone}>Cancel</Button>
            <Button design="Emphasized" disabled={!slug.trim()} onClick={goToConfigure}>
              Next: Configure →
            </Button>
          </FlexBox>
        </FlexBox>
      )}

      {/* ── Step 2: Configure & Save ── */}
      {step === 'configure' && (
        <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
          <Card header={
            <CardHeader
              titleText={`${adapterType} ${isSender ? '— Sender' : '— Receiver'}`}
              subtitleText={wizardPreviewURL(adapterType, slug)}
            />
          }>
            <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>
              <FlexBox style={{ gap: '1rem', flexWrap: 'wrap' }}>
                <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 2, minWidth: '12rem' }}>
                  <Label required>Display Name</Label>
                  <Input value={displayName} onInput={(e: any) => setDisplayName(e.target.value)}
                    placeholder="e.g. FI Document Posting — OK" style={{ width: '100%' }} />
                </FlexBox>
                <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1, minWidth: '9rem' }}>
                  <Label>Behaviour</Label>
                  <Select style={{ width: '100%' }}
                    onChange={(e: any) => setBehaviorMode(e.detail.selectedOption.value)}>
                    <Option value="success" selected={behaviorMode === 'success'}>Success</Option>
                    <Option value="failure" selected={behaviorMode === 'failure'}>Failure</Option>
                  </Select>
                </FlexBox>
              </FlexBox>

              <WizardConfigForm type={adapterType} config={config} onChange={setConfig} assets={assets} />

              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
                <Label>Credentials <span style={{ fontWeight: 400, color: 'var(--sapContent_LabelColor)' }}>(optional — basic auth for inbound calls)</span></Label>
                <FlexBox style={{ gap: '0.5rem' }}>
                  <Input value={credUser} onInput={(e: any) => setCredUser(e.target.value)}
                    placeholder="Username" style={{ flex: 1 }} />
                  <Input type="Password" value={credPass} onInput={(e: any) => setCredPass(e.target.value)}
                    placeholder="Password" style={{ flex: 1 }} />
                </FlexBox>
              </FlexBox>
            </FlexBox>
          </Card>

          <Card header={<CardHeader titleText="Scenario" subtitleText="Group this adapter into a test scenario" />}>
            <FlexBox style={{ padding: '1rem' }}>
              <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', width: '100%' }}>
                <Label>Scenario</Label>
                <Select style={{ width: '100%' }}
                  onChange={(e: any) => setScenarioId(e.detail.selectedOption.value)}>
                  {scenarios.map(s => (
                    <Option key={s.id} value={s.id} selected={s.id === scenarioId}>{s.name}</Option>
                  ))}
                </Select>
              </FlexBox>
            </FlexBox>
          </Card>

          <FlexBox style={{ gap: '0.5rem' }}>
            <Button onClick={() => setStep('direction')}>← Back</Button>
            <Button onClick={onDone}>Cancel</Button>
            <Button design="Emphasized"
              disabled={creating || !displayName.trim()}
              onClick={createMock}>
              {creating ? 'Creating…' : 'Create Mock'}
            </Button>
          </FlexBox>
        </FlexBox>
      )}
    </FlexBox>
  )
}
