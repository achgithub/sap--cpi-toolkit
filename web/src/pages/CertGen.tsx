import { useState } from 'react'
import {
  Button,
  Card,
  CardHeader,
  FlexBox,
  FlexBoxDirection,
  FlexBoxJustifyContent,
  Label,
  MessageStrip,
  TextArea,
  Toolbar,
  ToolbarSpacer,
  Input,
} from '@ui5/webcomponents-react'
import { useWorker } from '../hooks/useWorker'

interface CertRequest {
  common_name:   string
  org:           string
  san:           string[]
  validity_days: number
}

interface CertResponse {
  certificate: string
  private_key: string
}

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function KeyOutput({ label, value, filename }: { label: string; value: string; filename: string }) {
  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ flex: 1, gap: '0.25rem' }}>
      <Toolbar style={{ padding: 0 }}>
        <Label style={{ fontWeight: 600 }}>{label}</Label>
        <ToolbarSpacer />
        <Button design="Transparent" icon="download" onClick={() => downloadText(value, filename)}>
          {filename}
        </Button>
      </Toolbar>
      <TextArea
        value={value}
        rows={14}
        readonly
        style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.75rem' }}
      />
    </FlexBox>
  )
}

export default function CertGen() {
  const [cn,       setCN]       = useState('')
  const [org,      setOrg]      = useState('')
  const [sanRaw,   setSanRaw]   = useState('')   // comma-separated in the input
  const [validity, setValidity] = useState('90')
  const [result,   setResult]   = useState<CertResponse | null>(null)
  const { post, loading, error } = useWorker<CertRequest, CertResponse>()

  const validityNum = Math.min(90, Math.max(1, parseInt(validity, 10) || 90))

  const generate = async () => {
    setResult(null)
    const san = sanRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const res = await post('/keygen/cert', {
      common_name:   cn.trim(),
      org:           org.trim(),
      san,
      validity_days: validityNum,
    })
    if (res) setResult(res)
  }

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
      <MessageStrip design="Critical" hideCloseButton>
        Certificates are <strong>self-signed</strong>, <strong>ephemeral</strong>, and capped at 90 days validity.
        Not stored server-side. For POC and testing only.
      </MessageStrip>

      <Card header={<CardHeader titleText="Certificate Generation" subtitleText="Self-signed X.509 certificate (RSA 2048, SHA-256)" />}>
        <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>

          {/* Form row 1: CN + Org */}
          <FlexBox direction={FlexBoxDirection.Row} style={{ gap: '1rem', flexWrap: 'wrap' }}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1, minWidth: '14rem' }}>
              <Label required>Common Name (CN)</Label>
              <Input
                value={cn}
                placeholder="test.example.com"
                required
                style={{ width: '100%' }}
                onInput={(e) => setCN((e.target as unknown as HTMLInputElement).value)}
              />
            </FlexBox>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1, minWidth: '14rem' }}>
              <Label>Organization <span style={{ color: 'var(--sapNeutralColor)' }}>(optional)</span></Label>
              <Input
                value={org}
                placeholder="My Company Ltd"
                style={{ width: '100%' }}
                onInput={(e) => setOrg((e.target as unknown as HTMLInputElement).value)}
              />
            </FlexBox>
          </FlexBox>

          {/* Form row 2: SANs + validity */}
          <FlexBox direction={FlexBoxDirection.Row} style={{ gap: '1rem', flexWrap: 'wrap' }}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 2, minWidth: '14rem' }}>
              <Label>Subject Alternative Names <span style={{ color: 'var(--sapNeutralColor)' }}>(comma-separated, optional)</span></Label>
              <Input
                value={sanRaw}
                placeholder="test.example.com, localhost, 127.0.0.1"
                style={{ width: '100%' }}
                onInput={(e) => setSanRaw((e.target as unknown as HTMLInputElement).value)}
              />
            </FlexBox>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', minWidth: '8rem' }}>
              <Label>Validity (days, max 90)</Label>
              <Input
                value={validity}
                placeholder="90"
                style={{ width: '8rem' }}
                onInput={(e) => setValidity((e.target as unknown as HTMLInputElement).value)}
              />
            </FlexBox>
          </FlexBox>

          {/* Actions */}
          <Toolbar>
            <Button
              design="Emphasized"
              disabled={loading || !cn.trim()}
              onClick={generate}
            >
              {loading ? 'Generating…' : 'Generate Certificate'}
            </Button>
            {result && (
              <Button design="Transparent" onClick={() => setResult(null)}>Clear</Button>
            )}
          </Toolbar>

          {/* Error */}
          {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}

          {/* Info strip when validity was clamped */}
          {validity && parseInt(validity, 10) > 90 && (
            <MessageStrip design="Information" hideCloseButton>
              Validity capped at 90 days.
            </MessageStrip>
          )}

          {/* Results */}
          {result && (
            <FlexBox
              direction={FlexBoxDirection.Row}
              justifyContent={FlexBoxJustifyContent.SpaceBetween}
              style={{ gap: '1rem' }}
            >
              <KeyOutput label="Certificate" value={result.certificate} filename="certificate.crt" />
              <KeyOutput label="Private Key" value={result.private_key} filename="private.key"     />
            </FlexBox>
          )}

        </FlexBox>
      </Card>
    </FlexBox>
  )
}
