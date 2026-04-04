import { Card, CardHeader, FlexBox, FlexBoxDirection, MessageStrip, Text } from '@ui5/webcomponents-react'

export default function KeyGen() {
  return (
    <Card header={<CardHeader titleText="Key Generation" subtitleText="PGP & SSH keypair generation" />}>
      <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>
        <MessageStrip design="Critical" hideCloseButton>
          Keys generated here are ephemeral and for POC / testing purposes only.
          They are not stored server-side. Do not use for production systems.
        </MessageStrip>
        <Text>PGP and SSH key generation — coming in step 4.</Text>
      </FlexBox>
    </Card>
  )
}
