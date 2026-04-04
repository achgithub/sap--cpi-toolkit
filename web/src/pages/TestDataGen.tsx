import { Card, CardHeader, FlexBox, FlexBoxDirection, Text } from '@ui5/webcomponents-react'

export default function TestDataGen() {
  return (
    <Card header={<CardHeader titleText="Test Data Generator" subtitleText="Upload XML · Select fields · Generate variations" />}>
      <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem' }}>
        <Text>Test data generator — coming in step 5.</Text>
      </FlexBox>
    </Card>
  )
}
