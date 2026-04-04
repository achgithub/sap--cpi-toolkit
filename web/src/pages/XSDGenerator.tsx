import { useState } from 'react'
import EditorPanel from '../components/EditorPanel'
import { useWorker } from '../hooks/useWorker'

interface XSDResponse {
  xsd: string
  warnings?: string[]
}

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
      inputValue={input}
      outputValue={output}
      onInputChange={setInput}
      loading={loading}
      errors={error ? [error] : []}
      warnings={warnings}
      actions={[
        { label: 'Generate XSD', onClick: generate, disabled: !input.trim(), design: 'Emphasized' },
        { label: 'Clear', onClick: clear, design: 'Transparent' },
      ]}
      outputFilename={output ? 'schema.xsd' : undefined}
    />
  )
}
