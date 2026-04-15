import {
  Button,
  Card,
  CardHeader,
  FlexBox,
  FlexBoxDirection,
  FlexBoxJustifyContent,
  Label,
  MessageStrip,
  TextArea,
  Toolbar,
  ToolbarSeparator,
  ToolbarSpacer,
} from '@ui5/webcomponents-react'
import { SaveToAssetsButton, LoadFromAssetButton, type AssetContentType } from '../pages/AssetStore'

export interface EditorAction {
  label: string
  onClick: () => void
  disabled?: boolean
  design?: 'Default' | 'Emphasized' | 'Transparent' | 'Positive' | 'Negative' | 'Attention'
}

export interface EditorSample {
  label: string   // shown on the button, e.g. "Purchase Order"
  content: string // loaded into the input when clicked
}

interface Props {
  title: string
  subtitle?: string
  inputLabel?: string
  outputLabel?: string
  inputValue: string
  outputValue: string
  inputPlaceholder?: string
  onInputChange: (value: string) => void
  actions: EditorAction[]
  samples?: EditorSample[]
  errors?: string[]
  warnings?: string[]
  loading?: boolean
  outputFilename?: string
  outputContentType?: AssetContentType
  inputContentType?: AssetContentType
  children?: React.ReactNode // optional controls above the editors (e.g. direction toggle)
}

export default function EditorPanel({
  title,
  subtitle,
  inputLabel = 'Input',
  outputLabel = 'Output',
  inputValue,
  outputValue,
  inputPlaceholder,
  onInputChange,
  actions,
  samples = [],
  errors = [],
  warnings = [],
  loading = false,
  outputFilename,
  outputContentType,
  inputContentType,
  children,
}: Props) {
  const handleDownload = () => {
    if (!outputValue || !outputFilename) return
    const blob = new Blob([outputValue], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = outputFilename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card header={<CardHeader titleText={title} subtitleText={subtitle} />}>
      <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '1rem', gap: '0.75rem' }}>

        {/* Optional controls slot (e.g. direction toggle) */}
        {children}

        {/* Error and warning strips */}
        {errors.map((msg, i) => (
          <MessageStrip key={`err-${i}`} design="Negative" hideCloseButton>
            {msg}
          </MessageStrip>
        ))}
        {warnings.map((msg, i) => (
          <MessageStrip key={`warn-${i}`} design="Critical" hideCloseButton>
            {msg}
          </MessageStrip>
        ))}

        {/* Action toolbar */}
        <Toolbar>
          {actions.map((a) => (
            <Button
              key={a.label}
              design={a.design ?? 'Default'}
              disabled={a.disabled || (loading && a.design === 'Emphasized')}
              onClick={a.onClick}
            >
              {loading && a.design === 'Emphasized' ? 'Working…' : a.label}
            </Button>
          ))}

          {/* Sample buttons */}
          {samples.length > 0 && (
            <>
              <ToolbarSeparator />
              {samples.map((s) => (
                <Button
                  key={s.label}
                  design="Transparent"
                  icon="example"
                  onClick={() => onInputChange(s.content)}
                >
                  {s.label}
                </Button>
              ))}
            </>
          )}

          {inputContentType && (
            <>
              <ToolbarSeparator />
              <LoadFromAssetButton contentType={inputContentType} onLoad={onInputChange} />
            </>
          )}

          <ToolbarSpacer />
          {outputContentType && outputValue && (
            <SaveToAssetsButton
              content={outputValue}
              contentType={outputContentType}
              suggestedName={outputFilename?.replace(/\.[^.]+$/, '') ?? ''}
            />
          )}
          {outputFilename && outputValue && (
            <Button design="Transparent" icon="download" onClick={handleDownload}>
              {outputFilename}
            </Button>
          )}
        </Toolbar>

        {/* Side-by-side editors */}
        <FlexBox
          direction={FlexBoxDirection.Row}
          justifyContent={FlexBoxJustifyContent.SpaceBetween}
          style={{ gap: '1rem' }}
        >
          <FlexBox direction={FlexBoxDirection.Column} style={{ flex: 1, gap: '0.25rem' }}>
            <Label>{inputLabel}</Label>
            <TextArea
              value={inputValue}
              placeholder={inputPlaceholder}
              rows={22}
              style={{ width: '100%', fontFamily: 'monospace' }}
              onInput={(e) => onInputChange((e.target as unknown as HTMLTextAreaElement).value)}
            />
          </FlexBox>

          <FlexBox direction={FlexBoxDirection.Column} style={{ flex: 1, gap: '0.25rem' }}>
            <Label>{outputLabel}</Label>
            <TextArea
              value={outputValue}
              rows={22}
              readonly
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
          </FlexBox>
        </FlexBox>

      </FlexBox>
    </Card>
  )
}
