import { useState } from 'react'
import { SegmentedButton, SegmentedButtonItem } from '@ui5/webcomponents-react'
import EditorPanel from '../components/EditorPanel'
import { useWorker } from '../hooks/useWorker'

type Direction = 'xml-to-json' | 'json-to-xml'

interface ConvertResponse {
  result: string
  warnings?: string[]
}

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
      inputValue={input}
      outputValue={output}
      onInputChange={setInput}
      loading={loading}
      errors={error ? [error] : []}
      warnings={warnings}
      actions={[
        { label: 'Convert', onClick: convert, disabled: !input.trim(), design: 'Emphasized' },
        { label: 'Clear', onClick: clear, design: 'Transparent' },
      ]}
      outputFilename={output ? `converted.${isXMLtoJSON ? 'json' : 'xml'}` : undefined}
    >
      <SegmentedButton
        onSelectionChange={(e) => {
          const item = (e.detail as unknown as { selectedItem: HTMLElement }).selectedItem
          const dir = item?.dataset?.dir as Direction | undefined
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
