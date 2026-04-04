import { Card, CardHeader, FlexBox, FlexBoxDirection, MessageStrip, Text } from '@ui5/webcomponents-react'

export default function CertGen() {
  return (
    <Card header={<CardHeader titleText="Certificate Generation" subtitleText="Self-signed X.509 certificates" />}>
      <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>
        <MessageStrip design="Critical" hideCloseButton>
          Certificates are self-signed, ephemeral, and capped at 90 days validity.
          For POC and testing only. Not stored server-side.
        </MessageStrip>
        <Text>Certificate generation — coming in step 4.</Text>
      </FlexBox>
    </Card>
  )
}
