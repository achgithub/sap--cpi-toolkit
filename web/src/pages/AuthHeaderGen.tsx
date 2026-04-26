import { useState, useMemo } from 'react'
import {
  Button,
  Card,
  CheckBox,
  FlexBox,
  FlexBoxAlignItems,
  Input,
  Label,
  MessageStrip,
} from '@ui5/webcomponents-react'
import { useCPIInstance } from '../context/CPIInstanceContext'
import { saveAsset } from './AssetStore'

export default function AuthHeaderGen() {
  const { selectedInstance } = useCPIInstance()

  const [useManual,  setUseManual]  = useState(false)
  const [manualUser, setManualUser] = useState('')
  const [manualPass, setManualPass] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [saveName,   setSaveName]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [saveMsg,    setSaveMsg]    = useState('')
  const [copied,     setCopied]     = useState(false)

  const instanceId     = selectedInstance?.api_key?.oauth?.clientid     ?? ''
  const instanceSecret = selectedInstance?.api_key?.oauth?.clientsecret ?? ''

  const user = useManual ? manualUser : instanceId
  const pass = useManual ? manualPass : instanceSecret

  const encoded     = useMemo(() => (user && pass ? btoa(`${user}:${pass}`) : ''), [user, pass])
  const headerValue = encoded ? `Basic ${encoded}` : ''

  const copy = () => {
    if (!headerValue) return
    navigator.clipboard.writeText(headerValue).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const save = async () => {
    const name = saveName.trim() || (selectedInstance ? `${selectedInstance.name} Auth Header` : 'Auth Header')
    setSaving(true); setSaveMsg('')
    try {
      const reqJson = JSON.stringify({
        method: 'POST', url: '', body: '',
        headers: { Authorization: headerValue },
      }, null, 2)
      await saveAsset(name, reqJson, 'req')
      setSaveMsg(`Saved as "${name}"`)
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (e: any) {
      setSaveMsg('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const noInstance  = !selectedInstance
  const noApiKey    = selectedInstance && !selectedInstance.api_key
  const canGenerate = !!encoded

  return (
    <div style={{ maxWidth: '680px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {noInstance && (
        <MessageStrip design="Information" hideCloseButton>
          No CPI instance selected — choose one from the "Working with" bar.
        </MessageStrip>
      )}
      {noApiKey && (
        <MessageStrip design="Critical" hideCloseButton>
          The selected instance has no API Service Key configured. Add it in Settings.
        </MessageStrip>
      )}

      {/* Credentials source */}
      <Card>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--sapTextColor)',
            fontFamily: 'var(--sapFontFamily)' }}>
            Credentials
          </div>

          <CheckBox
            text="Enter credentials manually"
            checked={useManual}
            onChange={(e) => setUseManual((e.target as any).checked)}
          />

          {useManual ? (
            <>
              <Row label="Username">
                <Input value={manualUser} placeholder="username or client ID"
                  style={{ width: '100%' }}
                  onInput={(e) => setManualUser((e.target as any).value)} />
              </Row>
              <Row label="Password">
                <Input value={manualPass} placeholder="password or client secret"
                  type={showSecret ? 'Text' : 'Password'} style={{ width: '100%' }}
                  onInput={(e) => setManualPass((e.target as any).value)} />
              </Row>
            </>
          ) : (
            <>
              <Row label="Instance">
                <span style={{ fontSize: '0.85rem', fontFamily: 'var(--sapFontFamily)',
                  color: 'var(--sapTextColor)' }}>
                  {selectedInstance ? `${selectedInstance.name} (${selectedInstance.system_type})` : '—'}
                </span>
              </Row>
              <Row label="Client ID">
                <span style={{ fontSize: '0.82rem', fontFamily: 'monospace',
                  color: 'var(--sapTextColor)', wordBreak: 'break-all' }}>
                  {instanceId || '—'}
                </span>
              </Row>
              <Row label="Client Secret">
                <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.82rem', fontFamily: 'monospace',
                    color: 'var(--sapTextColor)', wordBreak: 'break-all', flex: 1 }}>
                    {instanceSecret
                      ? (showSecret ? instanceSecret : '•'.repeat(Math.min(instanceSecret.length, 32)))
                      : '—'}
                  </span>
                  {instanceSecret && (
                    <Button design="Transparent" onClick={() => setShowSecret(v => !v)}>
                      {showSecret ? 'Hide' : 'Show'}
                    </Button>
                  )}
                </FlexBox>
              </Row>
            </>
          )}
        </div>
      </Card>

      {/* Generated header — same style as HttpClient response headers */}
      <Card>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--sapContent_LabelColor)',
            fontFamily: 'var(--sapFontFamily)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Generated Header
          </div>

          <div style={{
            fontFamily: 'monospace', fontSize: '0.78rem',
            background: 'var(--sapNeutralBackground)', padding: '0.5rem 0.75rem',
            borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '0.2rem',
          }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--sapContent_LabelColor)', flexShrink: 0 }}>Authorization:</span>
              <span style={{ color: canGenerate ? 'var(--sapTextColor)' : 'var(--sapContent_LabelColor)',
                wordBreak: 'break-all', fontStyle: canGenerate ? 'normal' : 'italic' }}>
                {canGenerate ? headerValue : 'select an instance with an API key'}
              </span>
            </div>
          </div>

          {canGenerate && (
            <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              <Button design="Default" onClick={copy}>
                {copied ? '✓ Copied' : 'Copy Value'}
              </Button>

              <div style={{ width: '1px', height: '1.5rem', background: 'var(--sapList_BorderColor)' }} />

              <Input
                value={saveName}
                placeholder={selectedInstance ? `${selectedInstance.name} Auth Header` : 'Asset name…'}
                style={{ width: '220px' }}
                onInput={(e) => setSaveName((e.target as any).value)}
              />
              <Button design="Emphasized" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save to Assets'}
              </Button>

              {saveMsg && (
                <span style={{ fontSize: '0.82rem', fontFamily: 'var(--sapFontFamily)',
                  color: saveMsg.startsWith('Error') ? 'var(--sapNegativeColor)' : 'var(--sapPositiveColor)' }}>
                  {saveMsg}
                </span>
              )}
            </FlexBox>
          )}
        </div>
      </Card>

      <MessageStrip design="Information" hideCloseButton style={{ fontSize: '0.8rem' }}>
        Saved as a <strong>.req</strong> asset — load it in HTTP Client via <strong>Load request</strong> to auto-populate the Authorization header.
      </MessageStrip>

    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.5rem', alignItems: 'center' }}>
      <Label style={{ fontFamily: 'var(--sapFontFamily)', color: 'var(--sapContent_LabelColor)' }}>
        {label}
      </Label>
      <div>{children}</div>
    </div>
  )
}
