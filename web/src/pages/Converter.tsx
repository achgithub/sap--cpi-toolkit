import { useState } from 'react'
import { SegmentedButton, SegmentedButtonItem } from '@ui5/webcomponents-react'
import EditorPanel from '../components/EditorPanel'
import { useWorker } from '../hooks/useWorker'

type Direction = 'xml-to-json' | 'json-to-xml'

interface ConvertResponse {
  result: string
  warnings?: string[]
}

const SAMPLE_INVOICE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <Header>
    <InvoiceNumber>INV-2026-0042</InvoiceNumber>
    <InvoiceDate>2026-02-01</InvoiceDate>
    <DueDate>2026-03-03</DueDate>
    <Currency>EUR</Currency>
    <PurchaseOrderRef>PO-2026-001</PurchaseOrderRef>
  </Header>
  <Supplier>
    <Name>Global Supplies GmbH</Name>
    <VATNumber>DE123456789</VATNumber>
    <IBAN>DE89370400440532013000</IBAN>
  </Supplier>
  <Buyer>
    <Name>ACME Corporation</Name>
    <CostCentre>CC-1050</CostCentre>
  </Buyer>
  <Lines>
    <Line number="1">
      <MaterialNumber>MAT-001</MaterialNumber>
      <Description>Industrial Widget Type A</Description>
      <Quantity unit="EA">50</Quantity>
      <UnitPrice>12.50</UnitPrice>
      <TaxRate>19</TaxRate>
      <LineTotal>625.00</LineTotal>
    </Line>
    <Line number="2">
      <MaterialNumber>MAT-002</MaterialNumber>
      <Description>Steel Bracket 200mm</Description>
      <Quantity unit="EA">100</Quantity>
      <UnitPrice>4.75</UnitPrice>
      <TaxRate>19</TaxRate>
      <LineTotal>475.00</LineTotal>
    </Line>
  </Lines>
  <Totals>
    <NetAmount>1100.00</NetAmount>
    <TaxAmount>209.00</TaxAmount>
    <GrossAmount>1309.00</GrossAmount>
  </Totals>
</Invoice>`

const SAMPLE_DESADV_JSON = `{
  "DespatchAdvice": {
    "Header": {
      "AdviceNumber": "DA-2026-0089",
      "DispatchDate": "2026-01-20",
      "EstimatedDelivery": "2026-01-22",
      "PurchaseOrderRef": "PO-2026-001"
    },
    "Supplier": {
      "Name": "Global Supplies GmbH",
      "SupplierID": "SUP-4711"
    },
    "ShipTo": {
      "Name": "ACME Corporation — Goods Receiving",
      "Address": {
        "Street": "456 Warehouse Road",
        "City": "Munich",
        "PostCode": "80333",
        "Country": "DE"
      }
    },
    "Shipment": {
      "TrackingNumber": "DHL-9876543210",
      "Carrier": "DHL",
      "GrossWeight": "125.5",
      "Packages": "3"
    },
    "Items": {
      "Item": [
        {
          "-number": "1",
          "MaterialNumber": "MAT-001",
          "Description": "Industrial Widget Type A",
          "DispatchedQuantity": "50",
          "BatchNumber": "BATCH-A-2026-01"
        },
        {
          "-number": "2",
          "MaterialNumber": "MAT-002",
          "Description": "Steel Bracket 200mm",
          "DispatchedQuantity": "100",
          "BatchNumber": "BATCH-B-2026-01"
        }
      ]
    }
  }
}`

export default function Converter() {
  const [direction, setDirection] = useState<Direction>('xml-to-json')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const { post, loading, error } = useWorker<{ content: string }, ConvertResponse>()

  const convert = async () => {
    setWarnings([])
    const res = await post(`/convert/${direction}`, { content: input })
    if (res) {
      setOutput(res.result)
      setWarnings(res.warnings ?? [])
    }
  }

  const clear = () => { setInput(''); setOutput(''); setWarnings([]) }

  const isXMLtoJSON = direction === 'xml-to-json'

  return (
    <EditorPanel
      title="XML ↔ JSON Converter"
      subtitle="Roundtrip-safe conversion preserving namespaces and attributes"
      inputLabel={isXMLtoJSON ? 'XML Input' : 'JSON Input'}
      outputLabel={isXMLtoJSON ? 'JSON Output' : 'XML Output'}
      inputPlaceholder={isXMLtoJSON
        ? 'Paste XML to convert to JSON…'
        : 'Paste JSON to convert to XML — use the format produced by XML → JSON'}
      inputValue={input}
      outputValue={output}
      onInputChange={(v) => { setInput(v); setOutput(''); setWarnings([]) }}
      loading={loading}
      errors={error ? [error] : []}
      warnings={warnings}
      actions={[
        { label: 'Convert', onClick: convert, disabled: !input.trim(), design: 'Emphasized' },
        { label: 'Clear', onClick: clear, design: 'Transparent' },
      ]}
      samples={isXMLtoJSON
        ? [{ label: 'Invoice XML', content: SAMPLE_INVOICE_XML }]
        : [{ label: 'Despatch Advice JSON', content: SAMPLE_DESADV_JSON }]
      }
      outputFilename={output ? `converted.${isXMLtoJSON ? 'json' : 'xml'}` : undefined}
      outputContentType={output ? (isXMLtoJSON ? 'json' : 'xml') : undefined}
    >
      <SegmentedButton
        onSelectionChange={(e) => {
          const detail = e.detail as unknown as { selectedItems?: HTMLElement[]; selectedItem?: HTMLElement }
          const item = detail.selectedItems?.[0] ?? detail.selectedItem
          const dir = item?.getAttribute('data-dir') as Direction | undefined
          if (dir) { setDirection(dir); setInput(''); setOutput(''); setWarnings([]) }
        }}
      >
        <SegmentedButtonItem data-dir="xml-to-json" selected={isXMLtoJSON}>
          XML → JSON
        </SegmentedButtonItem>
        <SegmentedButtonItem data-dir="json-to-xml" selected={!isXMLtoJSON}>
          JSON → XML
        </SegmentedButtonItem>
      </SegmentedButton>
    </EditorPanel>
  )
}
