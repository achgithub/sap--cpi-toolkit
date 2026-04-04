import { Card, CardHeader, Text, MessageStrip } from '@ui5/webcomponents-react'

export default function KeyGen() {
  return (
    <Card header={<CardHeader titleText="Key Generation" subtitleText="PGP & SSH" />}>
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <MessageStrip design="Warning" hideCloseButton>
          Keys generated here are for POC and testing purposes only. They are not stored.
          Do not use for production systems.
        </MessageStrip>
        <Text>PGP and SSH key generation — coming in step 4.</Text>
      </div>
    </Card>
  )
}
