import { useState } from 'react'
import EditorPanel from '../components/EditorPanel'
import { useWorker } from '../hooks/useWorker'

interface FormatResponse {
  formatted: string
  valid: boolean
  errors?: { line: number; column: number; message: string }[]
}

// Intentionally compact — formatting it is the point
const SAMPLE_INVOICE = `{"invoice":{"number":"INV-2026-0042","date":"2026-02-01","dueDate":"2026-03-03","currency":"EUR","paymentTerms":"Net 30 days","supplier":{"name":"Global Supplies GmbH","vatNumber":"DE123456789","iban":"DE89370400440532013000","address":{"street":"Industriestrasse 7","city":"Hamburg","postCode":"20095","country":"DE"}},"buyer":{"name":"ACME Corporation","purchaseOrder":"PO-2026-001","costCentre":"CC-1050"},"lines":[{"lineNumber":1,"materialNumber":"MAT-001","description":"Industrial Widget Type A","quantity":50,"unit":"EA","unitPrice":12.50,"totalPrice":625.00,"taxRate":19},{"lineNumber":2,"materialNumber":"MAT-002","description":"Steel Bracket 200mm","quantity":100,"unit":"EA","unitPrice":4.75,"totalPrice":475.00,"taxRate":19}],"totals":{"netAmount":1100.00,"taxAmount":209.00,"grossAmount":1309.00}}}`

export default function JSONFormatter() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const { post, loading, error } = useWorker<{ content: string }, FormatResponse>()

  const format = async () => {
    const res = await post('/format/json', { content: input })
    if (res) setOutput(res.formatted)
  }

  const clear = () => { setInput(''); setOutput('') }

  return (
    <EditorPanel
      title="JSON Formatter"
      subtitle="Pretty-print and validate JSON"
      inputLabel="JSON Input"
      outputLabel="Formatted JSON"
      inputPlaceholder="Paste any JSON here — API responses, invoices, configuration payloads…"
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
        { label: 'Invoice', content: SAMPLE_INVOICE },
      ]}
      outputFilename={output ? 'formatted.json' : undefined}
      outputContentType={output ? 'json' : undefined}
    />
  )
}
