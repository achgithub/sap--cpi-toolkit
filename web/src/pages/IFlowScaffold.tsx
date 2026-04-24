import { Card, CardHeader, MessageStrip } from '@ui5/webcomponents-react'

export default function IFlowScaffold() {
  return (
    <Card>
      <CardHeader titleText="iFlow Scaffold" />
      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <MessageStrip design="Information" hideCloseButton>
          Coming soon — build and deploy integration flows from templates using the selected CPI instance.
        </MessageStrip>
      </div>
    </Card>
  )
}
