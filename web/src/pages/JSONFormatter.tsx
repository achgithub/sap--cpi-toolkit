import { useState } from 'react'
import EditorPanel from '../components/EditorPanel'
import { useWorker } from '../hooks/useWorker'

interface FormatResponse {
  formatted: string
  valid: boolean
  errors?: { line: number; column: number; message: string }[]
}

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
      inputValue={input}
      outputValue={output}
      onInputChange={setInput}
      loading={loading}
      errors={error ? [error] : []}
      actions={[
        { label: 'Format', onClick: format, disabled: !input.trim(), design: 'Emphasized' },
        { label: 'Clear', onClick: clear, design: 'Transparent' },
      ]}
      outputFilename={output ? 'formatted.json' : undefined}
    />
  )
}
