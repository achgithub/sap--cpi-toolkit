import { Card, CardHeader, FlexBox, FlexBoxDirection, Text } from '@ui5/webcomponents-react'

export default function GroovyIDE() {
  return (
    <Card header={<CardHeader titleText="Groovy IDE" subtitleText="SAP CPI script editor with sandboxed execution" />}>
      <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem' }}>
        <Text>Groovy IDE — coming in step 9.</Text>
      </FlexBox>
    </Card>
  )
}
