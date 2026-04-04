import { Card, CardHeader, Text, MessageStrip } from '@ui5/webcomponents-react'

export default function CertGen() {
  return (
    <Card header={<CardHeader titleText="Certificate Generation" subtitleText="Self-signed X.509" />}>
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <MessageStrip design="Critical" hideCloseButton>
          Certificates generated here are self-signed, ephemeral, and capped at 90 days validity.
          For POC and testing only. Not stored server-side.
        </MessageStrip>
        <Text>Certificate generation — coming in step 4.</Text>
      </div>
    </Card>
  )
}
