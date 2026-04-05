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
  SegmentedButton,
  SegmentedButtonItem,
  TextArea,
  Toolbar,
  ToolbarSpacer,
  Input,
} from '@ui5/webcomponents-react'
import { useWorker } from '../hooks/useWorker'

interface PGPRequest  { name: string; email: string; bits: number }
interface PGPResponse { public_key: string; private_key: string }

interface SSHRequest  { type: string; bits: number; comment: string }
interface SSHResponse { public_key: string; private_key: string }

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Key-output row: label + download button + readonly textarea ──────────────
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
        rows={10}
        readonly
        style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.75rem' }}
      />
    </FlexBox>
  )
}

// ── PGP section ──────────────────────────────────────────────────────────────
function PGPSection() {
  const [name,   setName]   = useState('')
  const [email,  setEmail]  = useState('')
  const [bits,   setBits]   = useState<2048 | 4096>(2048)
  const [result, setResult] = useState<PGPResponse | null>(null)
  const { post, loading, error } = useWorker<PGPRequest, PGPResponse>()

  const generate = async () => {
    setResult(null)
    const res = await post('/keygen/pgp', { name, email, bits })
    if (res) setResult(res)
  }

  return (
    <Card header={<CardHeader titleText="PGP Keys" subtitleText="RSA keypair for CPI PGP Encrypt/Decrypt adapters" />}>
      <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>

        {/* Form row */}
        <FlexBox direction={FlexBoxDirection.Row} style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1, minWidth: '12rem' }}>
            <Label>Name <span style={{ color: 'var(--sapNeutralColor)' }}>(optional)</span></Label>
            <Input
              value={name}
              placeholder="John Doe"
              style={{ width: '100%' }}
              onInput={(e) => setName((e.target as unknown as HTMLInputElement).value)}
            />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1, minWidth: '12rem' }}>
            <Label>Email <span style={{ color: 'var(--sapNeutralColor)' }}>(optional)</span></Label>
            <Input
              value={email}
              placeholder="john@example.com"
              style={{ width: '100%' }}
              onInput={(e) => setEmail((e.target as unknown as HTMLInputElement).value)}
            />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Key Size</Label>
            <SegmentedButton
              onSelectionChange={(e) => {
                const item = (e.detail as unknown as { selectedItem: HTMLElement }).selectedItem
                const val  = item?.dataset?.bits
                if (val === '2048' || val === '4096') setBits(Number(val) as 2048 | 4096)
              }}
            >
              <SegmentedButtonItem data-bits="2048" selected={bits === 2048}>2048-bit</SegmentedButtonItem>
              <SegmentedButtonItem data-bits="4096" selected={bits === 4096}>4096-bit</SegmentedButtonItem>
            </SegmentedButton>
          </FlexBox>
        </FlexBox>

        {/* Actions */}
        <Toolbar>
          <Button design="Emphasized" disabled={loading} onClick={generate}>
            {loading ? 'Generating…' : 'Generate PGP Keys'}
          </Button>
          {result && (
            <Button design="Transparent" onClick={() => setResult(null)}>Clear</Button>
          )}
        </Toolbar>

        {/* Error */}
        {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}

        {/* Results */}
        {result && (
          <FlexBox
            direction={FlexBoxDirection.Row}
            justifyContent={FlexBoxJustifyContent.SpaceBetween}
            style={{ gap: '1rem' }}
          >
            <KeyOutput label="Public Key"  value={result.public_key}  filename="public.asc"  />
            <KeyOutput label="Private Key" value={result.private_key} filename="private.asc" />
          </FlexBox>
        )}

      </FlexBox>
    </Card>
  )
}

// ── SSH section ──────────────────────────────────────────────────────────────
function SSHSection() {
  const [keyType, setKeyType] = useState<'rsa' | 'ed25519'>('rsa')
  const [bits,    setBits]    = useState<2048 | 4096>(4096)
  const [comment, setComment] = useState('')
  const [result,  setResult]  = useState<SSHResponse | null>(null)
  const { post, loading, error } = useWorker<SSHRequest, SSHResponse>()

  const generate = async () => {
    setResult(null)
    const res = await post('/keygen/ssh', { type: keyType, bits, comment })
    if (res) setResult(res)
  }

  const privFilename = keyType === 'ed25519' ? 'id_ed25519' : 'id_rsa'
  const pubFilename  = privFilename + '.pub'

  return (
    <Card header={<CardHeader titleText="SSH Keys" subtitleText="RSA or Ed25519 keypair for SSH adapter / SFTP connections" />}>
      <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>

        {/* Form row */}
        <FlexBox direction={FlexBoxDirection.Row} style={{ gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Key Type</Label>
            <SegmentedButton
              onSelectionChange={(e) => {
                const item = (e.detail as unknown as { selectedItem: HTMLElement }).selectedItem
                const val  = item?.dataset?.type
                if (val === 'rsa' || val === 'ed25519') setKeyType(val)
              }}
            >
              <SegmentedButtonItem data-type="rsa"     selected={keyType === 'rsa'}>RSA</SegmentedButtonItem>
              <SegmentedButtonItem data-type="ed25519" selected={keyType === 'ed25519'}>Ed25519</SegmentedButtonItem>
            </SegmentedButton>
          </FlexBox>

          {keyType === 'rsa' && (
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label>Key Size</Label>
              <SegmentedButton
                onSelectionChange={(e) => {
                  const item = (e.detail as unknown as { selectedItem: HTMLElement }).selectedItem
                  const val  = item?.dataset?.bits
                  if (val === '2048' || val === '4096') setBits(Number(val) as 2048 | 4096)
                }}
              >
                <SegmentedButtonItem data-bits="2048" selected={bits === 2048}>2048-bit</SegmentedButtonItem>
                <SegmentedButtonItem data-bits="4096" selected={bits === 4096}>4096-bit</SegmentedButtonItem>
              </SegmentedButton>
            </FlexBox>
          )}

          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1, minWidth: '12rem' }}>
            <Label>Comment <span style={{ color: 'var(--sapNeutralColor)' }}>(optional — e.g. email)</span></Label>
            <Input
              value={comment}
              placeholder="user@host"
              style={{ width: '100%' }}
              onInput={(e) => setComment((e.target as unknown as HTMLInputElement).value)}
            />
          </FlexBox>
        </FlexBox>

        {/* Actions */}
        <Toolbar>
          <Button design="Emphasized" disabled={loading} onClick={generate}>
            {loading ? 'Generating…' : 'Generate SSH Keys'}
          </Button>
          {result && (
            <Button design="Transparent" onClick={() => setResult(null)}>Clear</Button>
          )}
        </Toolbar>

        {/* Error */}
        {error && <MessageStrip design="Negative" hideCloseButton>{error}</MessageStrip>}

        {/* Results */}
        {result && (
          <FlexBox
            direction={FlexBoxDirection.Row}
            justifyContent={FlexBoxJustifyContent.SpaceBetween}
            style={{ gap: '1rem' }}
          >
            <KeyOutput label="Public Key"  value={result.public_key}  filename={pubFilename}  />
            <KeyOutput label="Private Key" value={result.private_key} filename={privFilename} />
          </FlexBox>
        )}

      </FlexBox>
    </Card>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function KeyGen() {
  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '1rem' }}>
      <MessageStrip design="Critical" hideCloseButton>
        Keys generated here are <strong>ephemeral</strong> — not stored server-side.
        For POC and testing only. Do not use in production systems.
      </MessageStrip>
      <PGPSection />
      <SSHSection />
    </FlexBox>
  )
}
