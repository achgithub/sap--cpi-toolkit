import {
  FlexBox,
  FlexBoxDirection,
  Input,
  Label,
  Select,
  Option,
  TextArea,
} from '@ui5/webcomponents-react'
import type { AdapterConfig } from './types'
import { kvToString, parseKV } from './templates'

// Shared config form used in both the inline-add form (ScenarioRow) and the
// edit mode (AdapterCard). For the wizard, WizardConfigForm is used instead
// (it adds per-field asset dropdowns).

export function AdapterConfigForm({ type, config, onChange }: {
  type: string
  config: AdapterConfig
  onChange: (c: AdapterConfig) => void
}) {
  const set = (patch: Partial<AdapterConfig>) => onChange({ ...config, ...patch })
  const isSender = type.endsWith('-SENDER')
  const headersRaw = kvToString(config.response_headers ?? {})

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem' }}>
      {isSender ? (
        <>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Target URL</Label>
            <Input value={config.target_url ?? ''} onInput={(e: any) => set({ target_url: e.target.value })}
              placeholder="https://..." style={{ width: '100%' }} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>HTTP Method</Label>
            <Select style={{ width: '100%' }} onChange={(e: any) => set({ method: e.detail.selectedOption.value })}>
              {['POST', 'PUT', 'GET', 'PATCH'].map(m =>
                <Option key={m} value={m} selected={config.method === m}>{m}</Option>)}
            </Select>
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Request Body</Label>
            <TextArea value={config.request_body ?? ''} onInput={(e: any) => set({ request_body: e.target.value })}
              rows={3} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }} />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Request Headers <span style={{ color: 'var(--sapContent_LabelColor)', fontWeight: 400 }}>(Key: Value, one per line)</span></Label>
            <TextArea
              value={kvToString(config.request_headers ?? {})}
              rows={3}
              placeholder="Content-Type: application/xml"
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
              onInput={(e: any) => set({ request_headers: parseKV(e.target.value) })}
            />
          </FlexBox>
        </>
      ) : (
        <>
          <FlexBox style={{ gap: '0.5rem' }}>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
              <Label>Response Status</Label>
              <Input type="Number" value={String(config.status_code)}
                onInput={(e: any) => set({ status_code: Number(e.target.value) })} style={{ width: '100%' }} />
            </FlexBox>
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem', flex: 1 }}>
              <Label>Delay (ms)</Label>
              <Input type="Number" value={String(config.response_delay_ms)}
                onInput={(e: any) => set({ response_delay_ms: Number(e.target.value) })} style={{ width: '100%' }} />
            </FlexBox>
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Response Headers <span style={{ color: 'var(--sapContent_LabelColor)', fontWeight: 400 }}>(Key: Value, one per line)</span></Label>
            <TextArea
              value={headersRaw}
              rows={3}
              placeholder="Content-Type: application/json"
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
              onInput={(e: any) => set({ response_headers: parseKV(e.target.value) })}
            />
          </FlexBox>
          <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
            <Label>Response Body</Label>
            <TextArea value={config.response_body} onInput={(e: any) => set({ response_body: e.target.value })}
              rows={8} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }} />
          </FlexBox>
          {(type === 'SOAP' || type === 'XI') && (
            <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.25rem' }}>
              <Label>SOAP Version</Label>
              <Select style={{ width: '100%' }} onChange={(e: any) => set({ soap_version: e.detail.selectedOption.value })}>
                <Option value="1.1" selected={config.soap_version !== '1.2'}>1.1</Option>
                <Option value="1.2" selected={config.soap_version === '1.2'}>1.2</Option>
              </Select>
            </FlexBox>
          )}
          {type === 'AS2' && (
            <FlexBox style={{ gap: '1rem' }}>
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
                <Select style={{ width: '100%' }} onChange={(e: any) => set({ edi_standard: e.detail.selectedOption.value })}>
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
        </>
      )}
    </FlexBox>
  )
}
