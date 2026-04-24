import { Card, CardHeader, MessageStrip } from '@ui5/webcomponents-react'

export default function Monitoring() {
  return (
    <Card>
      <CardHeader titleText="Monitoring" />
      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <MessageStrip design="Information" hideCloseButton>
          Coming soon — view message processing logs and integration flow status from the selected CPI instance.
        </MessageStrip>
      </div>
    </Card>
  )
}
