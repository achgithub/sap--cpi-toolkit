import { useState } from 'react'
import EditorPanel from '../components/EditorPanel'
import { useWorker } from '../hooks/useWorker'

interface FormatResponse {
  formatted: string
  valid: boolean
  errors?: { line: number; column: number; message: string }[]
}

// Intentionally compact — formatting it is the point
const SAMPLE_PO = `<?xml version="1.0" encoding="UTF-8"?><PurchaseOrder><Header><OrderNumber>PO-2026-001</OrderNumber><OrderDate>2026-01-15</OrderDate><Currency>EUR</Currency><Incoterms>DAP Frankfurt</Incoterms></Header><Buyer><Name>ACME Corporation</Name><Address><Street>123 Main Street</Street><City>Frankfurt</City><PostCode>60313</PostCode><Country>DE</Country></Address></Buyer><Supplier><Name>Global Supplies GmbH</Name><SupplierID>SUP-4711</SupplierID><ContactEmail>orders@globalsupplies.de</ContactEmail></Supplier><Items><Item lineNumber="1"><MaterialNumber>MAT-001</MaterialNumber><Description>Industrial Widget Type A</Description><Quantity unit="EA">50</Quantity><UnitPrice currency="EUR">12.50</UnitPrice><DeliveryDate>2026-02-01</DeliveryDate></Item><Item lineNumber="2"><MaterialNumber>MAT-002</MaterialNumber><Description>Steel Bracket 200mm</Description><Quantity unit="EA">100</Quantity><UnitPrice currency="EUR">4.75</UnitPrice><DeliveryDate>2026-02-01</DeliveryDate></Item></Items><Totals><NetAmount>1100.00</NetAmount><TaxRate>19</TaxRate><TaxAmount>209.00</TaxAmount><GrossAmount>1309.00</GrossAmount></Totals></PurchaseOrder>`

export default function XMLFormatter() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const { post, loading, error } = useWorker<{ content: string }, FormatResponse>()

  const format = async () => {
    const res = await post('/format/xml', { content: input })
    if (res) setOutput(res.formatted)
  }

  const clear = () => { setInput(''); setOutput('') }

  return (
    <EditorPanel
      title="XML Formatter"
      subtitle="Pretty-print and validate XML"
      inputLabel="XML Input"
      outputLabel="Formatted XML"
      inputPlaceholder="Paste any XML here — purchase orders, invoices, IDoc payloads, CPI message bodies…"
      inputValue={input}
      outputValue={output}
      onInputChange={(v) => { setInput(v); setOutput('') }}
      loading={loading}
      errors={error ? [error] : []}
      actions={[
        { label: 'Format', onClick: format, disabled: !input.trim(), design: 'Emphasized' },
        { label: 'Clear', onClick: clear, design: 'Transparent' },
      ]}
      samples={[
        { label: 'Purchase Order', content: SAMPLE_PO },
      ]}
      outputFilename={output ? 'formatted.xml' : undefined}
      outputContentType={output ? 'xml' : undefined}
      inputContentType="xml"
    />
  )
}
