import { useState } from 'react'
import EditorPanel from '../components/EditorPanel'
import { useWorker } from '../hooks/useWorker'

interface XSDResponse {
  xsd: string
  warnings?: string[]
}

const SAMPLE_DESADV = `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice>
  <Header>
    <AdviceNumber>DA-2026-0089</AdviceNumber>
    <DispatchDate>2026-01-20</DispatchDate>
    <EstimatedDelivery>2026-01-22</EstimatedDelivery>
    <PurchaseOrderRef>PO-2026-001</PurchaseOrderRef>
  </Header>
  <Supplier>
    <Name>Global Supplies GmbH</Name>
    <SupplierID>SUP-4711</SupplierID>
  </Supplier>
  <ShipTo>
    <Name>ACME Corporation — Goods Receiving</Name>
    <Address>
      <Street>456 Warehouse Road</Street>
      <City>Munich</City>
      <PostCode>80333</PostCode>
      <Country>DE</Country>
    </Address>
  </ShipTo>
  <Shipment>
    <TrackingNumber>DHL-9876543210</TrackingNumber>
    <Carrier>DHL</Carrier>
    <GrossWeight unit="KG">125.5</GrossWeight>
    <Packages>3</Packages>
  </Shipment>
  <Items>
    <Item lineNumber="1">
      <MaterialNumber>MAT-001</MaterialNumber>
      <Description>Industrial Widget Type A</Description>
      <DispatchedQuantity unit="EA">50</DispatchedQuantity>
      <BatchNumber>BATCH-A-2026-01</BatchNumber>
      <BestBefore>2028-01-01</BestBefore>
    </Item>
    <Item lineNumber="2">
      <MaterialNumber>MAT-002</MaterialNumber>
      <Description>Steel Bracket 200mm</Description>
      <DispatchedQuantity unit="EA">100</DispatchedQuantity>
      <BatchNumber>BATCH-B-2026-01</BatchNumber>
    </Item>
  </Items>
</DespatchAdvice>`

export default function XSDGenerator() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const { post, loading, error } = useWorker<{ content: string }, XSDResponse>()

  const generate = async () => {
    setWarnings([])
    const res = await post('/xsd/generate', { content: input })
    if (res) {
      setOutput(res.xsd)
      setWarnings(res.warnings ?? [])
    }
  }

  const clear = () => { setInput(''); setOutput(''); setWarnings([]) }

  return (
    <EditorPanel
      title="XSD Generator"
      subtitle="Infer an XSD schema from a sample XML document"
      inputLabel="Sample XML"
      outputLabel="Generated XSD"
      inputPlaceholder="Paste a representative XML document — the more complete and varied the data, the richer the generated schema"
      inputValue={input}
      outputValue={output}
      onInputChange={(v) => { setInput(v); setOutput(''); setWarnings([]) }}
      loading={loading}
      errors={error ? [error] : []}
      warnings={warnings}
      actions={[
        { label: 'Generate XSD', onClick: generate, disabled: !input.trim(), design: 'Emphasized' },
        { label: 'Clear', onClick: clear, design: 'Transparent' },
      ]}
      samples={[
        { label: 'Despatch Advice', content: SAMPLE_DESADV },
      ]}
      outputFilename={output ? 'schema.xsd' : undefined}
      outputContentType={output ? 'xml' : undefined}
      inputContentType="xml"
    />
  )
}
