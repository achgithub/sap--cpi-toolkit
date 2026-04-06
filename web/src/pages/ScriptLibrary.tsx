import { useState, useMemo } from 'react'
import {
  Button,
  Card,
  FlexBox,
  FlexBoxDirection,
  FlexBoxAlignItems,
  Input,
  Label,
  MessageStrip,
  Toolbar,
  ToolbarSpacer,
} from '@ui5/webcomponents-react'
import { SCRIPTS, ALL_TAGS, type LibraryScript, type Complexity } from '../data/scriptLibrary'

// ── Helpers ───────────────────────────────────────────────────────────────────

const COMPLEXITY_ORDER: Complexity[] = ['Beginner', 'Intermediate', 'Advanced']

const COMPLEXITY_COLOR: Record<Complexity, string> = {
  Beginner:     '#107e3e',
  Intermediate: '#0070f2',
  Advanced:     '#e76500',
}

function ComplexityBadge({ level }: { level: Complexity }) {
  return (
    <span style={{
      display:         'inline-block',
      padding:         '0.1rem 0.5rem',
      borderRadius:    '0.75rem',
      fontSize:        '0.72rem',
      fontWeight:      600,
      letterSpacing:   '0.02em',
      color:           '#fff',
      background:      COMPLEXITY_COLOR[level],
    }}>
      {level}
    </span>
  )
}

function TagChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <span
      onClick={onClick}
      style={{
        display:      'inline-block',
        padding:      '0.1rem 0.55rem',
        borderRadius: '0.75rem',
        fontSize:     '0.72rem',
        cursor:       'pointer',
        userSelect:   'none',
        fontWeight:   active ? 600 : 400,
        background:   active ? 'var(--sapHighlightColor)' : 'var(--sapButton_Lite_Background)',
        color:        active ? '#fff' : 'var(--sapTextColor)',
        border:       '1px solid ' + (active ? 'var(--sapHighlightColor)' : 'var(--sapList_BorderColor)'),
        transition:   'all 0.12s ease',
      }}
    >
      {label}
    </span>
  )
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const el = document.createElement('textarea')
    el.value = text; document.body.appendChild(el); el.select()
    document.execCommand('copy'); document.body.removeChild(el)
  }
}

// ── Script card ───────────────────────────────────────────────────────────────

function ScriptCard({
  script,
  onLoadInIDE,
}: {
  script:      LibraryScript
  onLoadInIDE: (body: string) => void
}) {
  const [copied,   setCopied]   = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleCopy = async () => {
    await copyToClipboard(script.body)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <Card style={{ marginBottom: '0.75rem' }}>
      {/* ── Header ── */}
      <FlexBox
        direction={FlexBoxDirection.Row}
        alignItems={FlexBoxAlignItems.Center}
        style={{ padding: '0.75rem 1rem 0.4rem', gap: '0.6rem', flexWrap: 'wrap' }}
      >
        <span style={{ fontWeight: 700, fontSize: '0.95rem', flex: 1, minWidth: '12rem' }}>
          {script.title}
        </span>
        <ComplexityBadge level={script.complexity} />
        {script.tenantOnly && (
          <span style={{
            fontSize: '0.72rem', fontWeight: 600,
            background: '#fef3e2', color: '#e76500',
            border: '1px solid #e76500',
            borderRadius: '0.75rem', padding: '0.1rem 0.5rem',
          }}>
            ⚠ Tenant Only
          </span>
        )}
      </FlexBox>

      {/* ── Tags ── */}
      <FlexBox
        direction={FlexBoxDirection.Row}
        style={{ padding: '0 1rem 0.5rem', gap: '0.35rem', flexWrap: 'wrap' }}
      >
        {script.tags.map(tag => (
          <TagChip key={tag} label={tag} active={false} onClick={() => {}} />
        ))}
      </FlexBox>

      {/* ── Description ── */}
      <div style={{ padding: '0 1rem 0.5rem', fontSize: '0.86rem', color: 'var(--sapTextColor)', lineHeight: 1.5 }}>
        {script.description}
      </div>

      {/* ── Tenant-only warning ── */}
      {script.tenantOnly && (
        <div style={{ padding: '0 1rem 0.5rem' }}>
          <MessageStrip design="Critical" hideCloseButton>
            The ITApiFactory calls in this script are commented out — the script loads fine
            in the IDE but only works when deployed on a CPI tenant. See comments in the code.
          </MessageStrip>
        </div>
      )}

      {/* ── Code block (expand / collapse) ── */}
      <div style={{ padding: '0 1rem 0.5rem' }}>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--sapLinkColor)', fontSize: '0.82rem', padding: '0.2rem 0',
            textDecoration: 'underline',
          }}
        >
          {expanded ? '▲ Hide code' : '▶ Show code'}
        </button>
        {expanded && (
          <pre style={{
            background:   'var(--sapShell_Background)',
            border:       '1px solid var(--sapList_BorderColor)',
            borderRadius: '0.25rem',
            padding:      '0.75rem',
            fontFamily:   'monospace',
            fontSize:     '0.78rem',
            lineHeight:   1.55,
            overflowX:    'auto',
            overflowY:    'auto',
            maxHeight:    '22rem',
            margin:       '0.4rem 0 0',
            whiteSpace:   'pre',
          }}>
            {script.body}
          </pre>
        )}
      </div>

      {/* ── Actions ── */}
      <Toolbar style={{ padding: '0.25rem 0.75rem 0.75rem', borderTop: 'none' }}>
        <Button design="Emphasized" icon="source-code" onClick={() => onLoadInIDE(script.body)}>
          Load in IDE
        </Button>
        <Button design="Transparent" icon="copy" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </Button>
        <ToolbarSpacer />
        <Label style={{ color: 'var(--sapNeutralColor)', fontSize: '0.78rem' }}>
          {script.body.split('\n').length} lines
        </Label>
      </Toolbar>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScriptLibrary({ onLoadInIDE }: { onLoadInIDE: (body: string) => void }) {
  const [search,     setSearch]     = useState('')
  const [complexity, setComplexity] = useState<Complexity | 'All'>('All')
  const [activeTag,  setActiveTag]  = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return SCRIPTS.filter(s => {
      if (complexity !== 'All' && s.complexity !== complexity) return false
      if (activeTag && !s.tags.includes(activeTag)) return false
      if (q && !s.title.toLowerCase().includes(q) &&
               !s.description.toLowerCase().includes(q) &&
               !s.tags.some(t => t.toLowerCase().includes(q))) return false
      return true
    })
  }, [search, complexity, activeTag])

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ gap: '0.75rem' }}>

      {/* ── Filter bar ── */}
      <Card>
        <FlexBox direction={FlexBoxDirection.Column} style={{ padding: '0.75rem 1rem', gap: '0.6rem' }}>

          {/* Search */}
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.75rem' }}>
            <Label style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Search</Label>
            <Input
              value={search}
              placeholder="Filter by title, description or tag…"
              style={{ flex: 1 }}
              onInput={(e) => setSearch((e.target as unknown as HTMLInputElement).value)}
            />
            {(search || complexity !== 'All' || activeTag) && (
              <Button design="Transparent" onClick={() => { setSearch(''); setComplexity('All'); setActiveTag('') }}>
                Clear
              </Button>
            )}
          </FlexBox>

          {/* Complexity filter */}
          <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
            <Label style={{ fontWeight: 600, whiteSpace: 'nowrap', marginRight: '0.25rem' }}>Level</Label>
            {(['All', ...COMPLEXITY_ORDER] as const).map(c => (
              <TagChip
                key={c}
                label={c}
                active={complexity === c}
                onClick={() => setComplexity(c)}
              />
            ))}
          </FlexBox>

          {/* Tag filter */}
          <FlexBox
            direction={FlexBoxDirection.Row}
            alignItems={FlexBoxAlignItems.Center}
            style={{ gap: '0.35rem', flexWrap: 'wrap' }}
          >
            <Label style={{ fontWeight: 600, whiteSpace: 'nowrap', marginRight: '0.25rem' }}>Tag</Label>
            {ALL_TAGS.map(tag => (
              <TagChip
                key={tag}
                label={tag}
                active={activeTag === tag}
                onClick={() => setActiveTag(activeTag === tag ? '' : tag)}
              />
            ))}
          </FlexBox>

        </FlexBox>
      </Card>

      {/* ── Result count ── */}
      <FlexBox direction={FlexBoxDirection.Row} alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.5rem' }}>
        <Label style={{ color: 'var(--sapNeutralColor)', fontSize: '0.86rem' }}>
          {filtered.length} of {SCRIPTS.length} scripts
        </Label>
        {filtered.length === 0 && (
          <Label style={{ color: 'var(--sapNeutralColor)' }}>— try a different filter</Label>
        )}
      </FlexBox>

      {/* ── Script list ── */}
      {filtered.map(script => (
        <ScriptCard key={script.id} script={script} onLoadInIDE={onLoadInIDE} />
      ))}

    </FlexBox>
  )
}
