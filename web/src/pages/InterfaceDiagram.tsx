import React, { useState, useCallback } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  NodeResizer,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  Handle,
  Position,
  getNodesBounds,
  getViewportForBounds,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toPng } from 'html-to-image'
import { Button, Input, Label, FlexBox, FlexBoxDirection, FlexBoxAlignItems } from '@ui5/webcomponents-react'

// ---- Handle config type ----
interface HandleCfg { left: number; right: number; top: number; bottom: number }
const DEFAULT_SYSTEM_HANDLES: HandleCfg = { left: 2, right: 2, top: 0, bottom: 0 }
const DEFAULT_STEP_HANDLES:   HandleCfg = { left: 1, right: 1, top: 0, bottom: 0 }

// ---- Subtle handle style ----
const HS: React.CSSProperties = {
  width: 7, height: 7,
  background: 'rgba(255,255,255,0.25)',
  border: '1px solid rgba(0,0,0,0.15)',
}

// ---- Evenly-spaced handle positions for N handles on one side ----
function handlePcts(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${((i + 1) / (n + 1)) * 100}%`)
}

// ---- Dynamic handles — rendered from data.handles ----
function DynamicHandles({ cfg }: { cfg: HandleCfg }) {
  const sides: [Position, string, 'top' | 'left'][] = [
    [Position.Left,   'l', 'top'],
    [Position.Right,  'r', 'top'],
    [Position.Top,    't', 'left'],
    [Position.Bottom, 'b', 'left'],
  ]
  const counts: Record<string, number> = { l: cfg.left, r: cfg.right, t: cfg.top, b: cfg.bottom }
  return (
    <>
      {sides.map(([pos, prefix, axis]) =>
        handlePcts(counts[prefix] ?? 0).map((pct, i) => (
          <Handle
            key={`${prefix}${i}`}
            type="source"
            position={pos}
            id={`${prefix}${i}`}
            style={{ ...HS, [axis]: pct }}
          />
        ))
      )}
    </>
  )
}

// ---- System node ----
function SystemNode({ data, selected }: { data: any; selected: boolean }) {
  const filled      = data.filled !== false
  const borderStyle = data.borderStyle ?? 'solid'
  const color       = data.color ?? '#4a90d9'
  const bg          = filled ? color : (data.bgColor ?? '#fff')
  const textColor   = filled ? '#fff' : color
  const selBorder   = filled ? '3px solid rgba(255,255,255,0.85)' : '3px solid #0070f2'
  const normBorder  = filled ? '3px solid transparent' : `3px ${borderStyle} ${color}`

  return (
    <>
      <NodeResizer
        isVisible={selected} minWidth={160} minHeight={140}
        lineStyle={{ borderColor: 'rgba(0,112,242,0.4)' }}
        handleStyle={{ background: '#0070f2', width: 7, height: 7 }}
      />
      <DynamicHandles cfg={data.handles ?? DEFAULT_SYSTEM_HANDLES} />
      <div style={{
        width: '100%', height: '100%', boxSizing: 'border-box',
        background: bg, borderRadius: 14,
        border: selected ? selBorder : normBorder,
        display: 'flex', justifyContent: 'center', padding: '0.7rem 0.5rem',
      }}>
        <span style={{ color: textColor, fontWeight: 700, fontSize: '0.9rem', fontFamily: 'var(--sapFontFamily,Arial)', textAlign: 'center' }}>
          {data.label}
        </span>
      </div>
    </>
  )
}

// ---- Step / label card ----
function StepNode({ data, selected }: { data: any; selected: boolean }) {
  return (
    <>
      <DynamicHandles cfg={data.handles ?? DEFAULT_STEP_HANDLES} />
      <div style={{
        background: data.color ?? '#1565c0',
        borderRadius: 6,
        border: selected ? '2px solid rgba(255,255,255,0.9)' : '2px solid transparent',
        padding: '0.45rem 0.7rem',
        color: '#fff', fontWeight: 600, fontSize: '0.8rem',
        fontFamily: 'var(--sapFontFamily,Arial)',
        minWidth: 120, maxWidth: 220, cursor: 'grab',
      }}>
        {data.label}
      </div>
    </>
  )
}

// ---- Line node — solid / dotted / dashed separator ----
function LineNode({ data, selected }: { data: any; selected: boolean }) {
  const ls    = data.lineStyle   ?? 'dashed'
  const color = data.color       ?? '#555'
  const horiz = data.orientation === 'horizontal'

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={horiz ? 40 : 8} minHeight={horiz ? 8 : 40}
        lineStyle={{ borderColor: 'rgba(0,112,242,0.4)' }}
        handleStyle={{ background: '#0070f2', width: 7, height: 7 }}
      />
      <Handle type="source" position={horiz ? Position.Left   : Position.Top}    id="a"
        style={{ ...HS, ...(horiz ? { top: '50%' } : { left: '50%' }) }} />
      <Handle type="source" position={horiz ? Position.Right  : Position.Bottom} id="b"
        style={{ ...HS, ...(horiz ? { top: '50%' } : { left: '50%' }) }} />
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', cursor: 'grab' }}>
        <div style={horiz
          ? { width: '100%', height: 0, borderTop: `2px ${ls} ${color}` }
          : { width: 0, height: '100%', borderLeft: `2px ${ls} ${color}` }
        } />
        {data.label && (
          <div style={{
            position: 'absolute',
            ...(horiz
              ? { right: '-0.5rem', top: '50%', transform: 'translateY(-50%)' }
              : { bottom: '-1.6rem', left: '50%', transform: 'translateX(-50%)' }),
            fontSize: '0.78rem', color, whiteSpace: 'nowrap',
            fontFamily: 'var(--sapFontFamily,Arial)', fontWeight: 500,
          }}>
            {data.label}
          </div>
        )}
        {selected && <div style={{ position: 'absolute', inset: 0, outline: '1px dashed #0070f2', outlineOffset: 2, borderRadius: 2, pointerEvents: 'none' }} />}
      </div>
    </>
  )
}

// ---- Text annotation ----
function TextNode({ data, selected }: { data: any; selected: boolean }) {
  return (
    <div style={{
      background: 'transparent',
      border: selected ? '1px dashed #0070f2' : '1px dashed transparent',
      borderRadius: 4, padding: '0.3rem 0.5rem',
      color: data.color ?? '#333', fontSize: '0.85rem',
      fontFamily: 'var(--sapFontFamily,Arial)', fontWeight: 500,
      cursor: 'grab', minWidth: 80,
    }}>
      {data.label}
    </div>
  )
}

const nodeTypes: NodeTypes = {
  system: SystemNode as any,
  step:   StepNode   as any,
  line:   LineNode   as any,
  text:   TextNode   as any,
}

// ---- Initial diagram ----
const SH = 360, SW = 250

const initialNodes: Node[] = [
  { id: 'sys-s4',    type: 'system', position: { x: 0,   y: 0 }, style: { width: SW, height: SH },
    data: { label: 'SAP S/4HANA',      color: '#4a90d9', filled: true,  handles: { left: 2, right: 2, top: 0, bottom: 0 } } },
  { id: 'sys-sf',    type: 'system', position: { x: 630, y: 0 }, style: { width: SW, height: SH },
    data: { label: 'Salesforce',        color: '#4a90d9', filled: true,  handles: { left: 2, right: 2, top: 0, bottom: 0 } } },
  { id: 'sys-cpi',   type: 'system', position: { x: 310, y: 60 }, style: { width: 200, height: 240 },
    data: { label: 'Integration Suite', color: '#f5a623', filled: false, borderStyle: 'dashed', handles: { left: 2, right: 2, top: 0, bottom: 0 } } },
  { id: 'line-1',    type: 'line',   position: { x: 278, y: 0  }, style: { width: 18, height: SH },
    data: { label: 'FW', lineStyle: 'dashed', color: '#666' } },
  { id: 'line-2',    type: 'line',   position: { x: 534, y: 0  }, style: { width: 18, height: SH },
    data: { label: 'FW', lineStyle: 'dashed', color: '#666' } },
  { id: 'step-s4-1', type: 'step',   position: { x: 24,  y: 70  }, data: { label: '1  Load orders',         color: '#1565c0', handles: { left: 1, right: 1, top: 0, bottom: 0 } } },
  { id: 'step-s4-2', type: 'step',   position: { x: 24,  y: 150 }, data: { label: '2  Create Delivery',     color: '#1565c0', handles: { left: 1, right: 1, top: 0, bottom: 0 } } },
  { id: 'step-sf-1', type: 'step',   position: { x: 645, y: 70  }, data: { label: '1  Get Orders last 24h', color: '#1565c0', handles: { left: 1, right: 1, top: 0, bottom: 0 } } },
]

const E_LABEL_STYLE = { fontFamily: 'var(--sapFontFamily,Arial)', fontSize: '0.8rem', fill: '#333' }
const E_LABEL_BG    = { fill: '#fff', fillOpacity: 0.85 }

// ---- Edge style helpers ----
interface EdgeData { lineStyle?: 'solid'|'dotted'|'dashed'; arrowStart?: boolean; arrowEnd?: boolean; color?: string; label?: string }

function edgeStrokeDash(ls: string) {
  if (ls === 'dashed') return '8 4'
  if (ls === 'dotted') return '2 4'
  return undefined
}

function applyEdgeStyle(base: any, data: EdgeData): Partial<Edge> {
  const ls    = data.lineStyle  ?? 'solid'
  const color = data.color      ?? '#333'
  const as_   = data.arrowStart ?? false
  const ae    = data.arrowEnd   ?? true
  return {
    ...base,
    data,
    label: data.label ?? base.label,
    style: { stroke: color, strokeDasharray: edgeStrokeDash(ls) },
    markerStart: as_ ? { type: MarkerType.ArrowClosed, color } : undefined,
    markerEnd:   ae  ? { type: MarkerType.ArrowClosed, color } : undefined,
    labelStyle: E_LABEL_STYLE,
    labelBgStyle: E_LABEL_BG,
  }
}

// With handles: { left: 2, right: 2 } → l0=33%, l1=67%, r0=33%, r1=67%
const initialEdges: Edge[] = [
  applyEdgeStyle(
    { id: 'e-cpi-sf', source: 'sys-cpi', sourceHandle: 'r0', target: 'sys-sf', targetHandle: 'l0' },
    { label: 'Poll', lineStyle: 'solid', arrowEnd: true, arrowStart: false, color: '#333' },
  ) as Edge,
  applyEdgeStyle(
    { id: 'e-sf-cpi', source: 'sys-sf', sourceHandle: 'l1', target: 'sys-cpi', targetHandle: 'r1' },
    { lineStyle: 'solid', arrowEnd: true, arrowStart: false, color: '#333' },
  ) as Edge,
  applyEdgeStyle(
    { id: 'e-cpi-s4', source: 'sys-cpi', sourceHandle: 'l0', target: 'sys-s4', targetHandle: 'r0' },
    { lineStyle: 'solid', arrowEnd: true, arrowStart: false, color: '#333' },
  ) as Edge,
]

let nextId = 100
const IMAGE_W = 1600, IMAGE_H = 900

// ---- Colour presets ----
const COLORS = ['#4a90d9','#1565c0','#0a7ea4','#1a7f5c','#6d4c97','#c75b39','#f5a623','#888','#333','#c62828']

// ---- Small style-toggle button ----
function StyleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 8px', fontSize: '0.72rem', cursor: 'pointer', borderRadius: 3,
      fontFamily: 'var(--sapFontFamily,Arial)',
      background: active ? '#0070f2' : 'transparent',
      color: active ? '#fff' : 'var(--sapTextColor,#333)',
      border: `1px solid ${active ? '#0070f2' : 'var(--sapList_BorderColor,#ccc)'}`,
    }}>
      {children}
    </button>
  )
}

// ---- Handle count control ----
function HandleControl({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
      <span style={{ fontSize: '0.72rem', width: 44, fontFamily: 'var(--sapFontFamily,Arial)', color: 'var(--sapTextColor,#333)' }}>{label}</span>
      <button onClick={() => onChange(Math.max(0, value - 1))} style={{ width: 20, height: 20, cursor: 'pointer', borderRadius: 3, border: '1px solid var(--sapList_BorderColor,#ccc)', background: 'transparent', fontSize: '0.85rem', lineHeight: 1 }}>−</button>
      <span style={{ fontSize: '0.78rem', minWidth: 14, textAlign: 'center', fontFamily: 'var(--sapFontFamily,Arial)' }}>{value}</span>
      <button onClick={() => onChange(Math.min(20, value + 1))} style={{ width: 20, height: 20, cursor: 'pointer', borderRadius: 3, border: '1px solid var(--sapList_BorderColor,#ccc)', background: 'transparent', fontSize: '0.85rem', lineHeight: 1 }}>+</button>
    </div>
  )
}

// ---- Colour picker sub-section ----
function ColourPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.28rem' }}>
        {COLORS.map(c => (
          <div key={c} onClick={() => onChange(c)} style={{
            width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
            outline: value === c ? '3px solid #0070f2' : '2px solid transparent', outlineOffset: 1,
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Label style={{ fontSize: '0.72rem' }}>Custom</Label>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: 32, height: 26, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
      </div>
    </div>
  )
}

// ---- Properties panel ----
function PropsPanel({ node, edge, onUpdateNode, onUpdateEdge, onDelete }: {
  node: Node | null; edge: Edge | null
  onUpdateNode: (id: string, data: any) => void
  onUpdateEdge: (id: string, patch: Partial<EdgeData>) => void
  onDelete: () => void
}) {
  if (!node && !edge) return null

  const handles: HandleCfg = (node?.data.handles as HandleCfg) ?? DEFAULT_SYSTEM_HANDLES
  const setHandles = (h: HandleCfg) => node && onUpdateNode(node.id, { handles: h })

  return (
    <div style={{
      width: 220, flexShrink: 0,
      border: '1px solid var(--sapList_BorderColor)', borderRadius: 6, padding: '0.9rem',
      background: 'var(--sapGroup_TitleBackground)',
      display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto',
    }}>
      <span style={{ fontWeight: 600, fontSize: '0.85rem', fontFamily: 'var(--sapFontFamily,Arial)' }}>
        {node ? 'Properties' : 'Edge'}
      </span>

      {/* Label */}
      {node && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <Label style={{ fontSize: '0.75rem' }}>Label</Label>
          <Input value={String(node.data.label ?? '')}
            onInput={(e: any) => onUpdateNode(node.id, { label: e.target.value })}
            style={{ width: '100%' }} />
        </div>
      )}
      {edge && (() => {
        const ed: EdgeData = (edge.data as EdgeData) ?? {}
        const ls  = ed.lineStyle  ?? 'solid'
        const as_ = ed.arrowStart ?? false
        const ae  = ed.arrowEnd   ?? true
        const col = ed.color      ?? '#333'
        return (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <Label style={{ fontSize: '0.75rem' }}>Label</Label>
              <Input value={String(ed.label ?? edge.label ?? '')}
                onInput={(e: any) => onUpdateEdge(edge.id, { label: e.target.value })}
                style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <Label style={{ fontSize: '0.75rem' }}>Line style</Label>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                {(['solid','dotted','dashed'] as const).map(s => (
                  <StyleBtn key={s} active={ls === s} onClick={() => onUpdateEdge(edge.id, { lineStyle: s })}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </StyleBtn>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <Label style={{ fontSize: '0.75rem' }}>Arrows</Label>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <StyleBtn active={as_} onClick={() => onUpdateEdge(edge.id, { arrowStart: !as_ })}>← Start</StyleBtn>
                <StyleBtn active={ae}  onClick={() => onUpdateEdge(edge.id, { arrowEnd:   !ae  })}>End →</StyleBtn>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <Label style={{ fontSize: '0.75rem' }}>Colour</Label>
              <ColourPicker value={col} onChange={c => onUpdateEdge(edge.id, { color: c })} />
            </div>
          </>
        )
      })()}

      {/* Colour */}
      {node && node.type !== 'line' && (
        <>
          <Label style={{ fontSize: '0.75rem' }}>Colour</Label>
          <ColourPicker value={String(node.data.color ?? '#4a90d9')} onChange={c => onUpdateNode(node.id, { color: c })} />
        </>
      )}

      {/* System: fill + border */}
      {node?.type === 'system' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <Label style={{ fontSize: '0.75rem' }}>Fill</Label>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              <StyleBtn active={node.data.filled !== false} onClick={() => onUpdateNode(node.id, { filled: true })}>Filled</StyleBtn>
              <StyleBtn active={node.data.filled === false}  onClick={() => onUpdateNode(node.id, { filled: false })}>Outlined</StyleBtn>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <Label style={{ fontSize: '0.75rem' }}>Border</Label>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              {(['solid','dotted','dashed'] as const).map(s => (
                <StyleBtn key={s} active={(node.data.borderStyle ?? 'solid') === s} onClick={() => onUpdateNode(node.id, { borderStyle: s })}>
                  {s[0].toUpperCase() + s.slice(1)}
                </StyleBtn>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Line: style + orientation + colour */}
      {node?.type === 'line' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <Label style={{ fontSize: '0.75rem' }}>Style</Label>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              {(['solid','dotted','dashed'] as const).map(s => (
                <StyleBtn key={s} active={(node.data.lineStyle ?? 'dashed') === s} onClick={() => onUpdateNode(node.id, { lineStyle: s })}>
                  {s[0].toUpperCase() + s.slice(1)}
                </StyleBtn>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <Label style={{ fontSize: '0.75rem' }}>Orientation</Label>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              <StyleBtn active={node.data.orientation !== 'horizontal'} onClick={() => onUpdateNode(node.id, { orientation: 'vertical' })}>Vertical</StyleBtn>
              <StyleBtn active={node.data.orientation === 'horizontal'}  onClick={() => onUpdateNode(node.id, { orientation: 'horizontal' })}>Horizontal</StyleBtn>
            </div>
          </div>
          <Label style={{ fontSize: '0.75rem' }}>Colour</Label>
          <ColourPicker value={String(node.data.color ?? '#555')} onChange={c => onUpdateNode(node.id, { color: c })} />
        </>
      )}

      {/* Connection points — system and step nodes */}
      {node && (node.type === 'system' || node.type === 'step') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <Label style={{ fontSize: '0.75rem' }}>Connection points</Label>
          <HandleControl label="Left"   value={handles.left}   onChange={n => setHandles({ ...handles, left:   n })} />
          <HandleControl label="Right"  value={handles.right}  onChange={n => setHandles({ ...handles, right:  n })} />
          <HandleControl label="Top"    value={handles.top}    onChange={n => setHandles({ ...handles, top:    n })} />
          <HandleControl label="Bottom" value={handles.bottom} onChange={n => setHandles({ ...handles, bottom: n })} />
          <span style={{ fontSize: '0.68rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily,Arial)' }}>
            Dots space out evenly. Drag from any dot to draw an arrow.
          </span>
        </div>
      )}

      {node && (
        <div style={{ fontSize: '0.7rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily,Arial)' }}>
          Type: <strong>{node.type}</strong>
          {node.type === 'system' && <div style={{ opacity: 0.8, marginTop: 2 }}>Drag corners to resize</div>}
        </div>
      )}

      <Button icon="delete" design="Negative" onClick={onDelete} style={{ marginTop: 'auto' }}>Delete</Button>
    </div>
  )
}

// ---- Inner component ----
function DiagramInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null)
  const { getNodes, fitView } = useReactFlow()

  const onConnect = useCallback(
    (params: Connection) => {
      const defaultData: EdgeData = { lineStyle: 'solid', arrowEnd: true, arrowStart: false, color: '#333' }
      setEdges(eds => addEdge(applyEdgeStyle(params, defaultData) as Edge, eds))
    },
    [setEdges],
  )

  const onNodeClick  = useCallback((_: React.MouseEvent, node: Node) => { setSelectedNode(node); setSelectedEdge(null) }, [])
  const onEdgeClick  = useCallback((_: React.MouseEvent, edge: Edge) => { setSelectedEdge(edge); setSelectedNode(null) }, [])
  const onPaneClick  = useCallback(() => { setSelectedNode(null); setSelectedEdge(null) }, [])

  const updateNode = useCallback((id: string, patch: any) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
    setSelectedNode(prev => prev?.id === id ? { ...prev, data: { ...prev.data, ...patch } } : prev)
  }, [setNodes])

  const updateEdge = useCallback((id: string, patch: Partial<EdgeData>) => {
    setEdges(eds => eds.map(e => {
      if (e.id !== id) return e
      const newData: EdgeData = { ...(e.data as EdgeData ?? {}), ...patch }
      return applyEdgeStyle(e, newData) as Edge
    }))
    setSelectedEdge(prev => {
      if (prev?.id !== id) return prev
      const newData: EdgeData = { ...(prev.data as EdgeData ?? {}), ...patch }
      return applyEdgeStyle(prev, newData) as Edge
    })
  }, [setEdges])

  const addNode = useCallback((type: string) => {
    const id = `n${nextId++}`
    const x  = 200 + Math.random() * 250
    const y  = 80  + Math.random() * 140
    const templates: Record<string, Partial<Node>> = {
      system:      { style: { width: 220, height: 300 }, data: { label: 'System',           color: '#4a90d9', filled: true,  handles: { left: 2, right: 2, top: 0, bottom: 0 } } },
      integration: { style: { width: 200, height: 260 }, data: { label: 'Integration Suite', color: '#f5a623', filled: false, borderStyle: 'dashed', handles: { left: 2, right: 2, top: 0, bottom: 0 } } },
      step:        {                                      data: { label: 'Step',              color: '#1565c0', handles: { left: 1, right: 1, top: 0, bottom: 0 } } },
      line:        { style: { width: 18, height: 320 },  data: { label: 'FW',               lineStyle: 'dashed', color: '#666' } },
      text:        {                                      data: { label: 'Note',             color: '#555' } },
    }
    const n: Node = { id, type, position: { x, y }, ...templates[type] } as Node
    setNodes(nds => [...nds, n])
    setSelectedNode(n)
    setSelectedEdge(null)
  }, [setNodes])

  const deleteSelected = useCallback(() => {
    if (selectedNode) {
      setNodes(nds => nds.filter(n => n.id !== selectedNode.id))
      setEdges(eds => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id))
      setSelectedNode(null)
    } else if (selectedEdge) {
      setEdges(eds => eds.filter(e => e.id !== selectedEdge.id))
      setSelectedEdge(null)
    }
  }, [selectedNode, selectedEdge, setNodes, setEdges])

  const exportPNG = useCallback(async () => {
    const vp = document.querySelector('.react-flow__viewport') as HTMLElement
    if (!vp) return
    const bounds = getNodesBounds(getNodes())
    const xvp    = getViewportForBounds(bounds, IMAGE_W, IMAGE_H, 0.5, 2, 80)
    const url = await toPng(vp, {
      backgroundColor: '#ffffff', width: IMAGE_W, height: IMAGE_H,
      style: { width: `${IMAGE_W}px`, height: `${IMAGE_H}px`, transform: `translate(${xvp.x}px,${xvp.y}px) scale(${xvp.zoom})` },
    })
    const a = document.createElement('a'); a.href = url; a.download = 'interface-diagram.png'; a.click()
  }, [getNodes])

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify({ nodes, edges }, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = 'interface-diagram.json'; a.click()
    URL.revokeObjectURL(url)
  }, [nodes, edges])

  return (
    <FlexBox direction={FlexBoxDirection.Column} style={{ height: '100%', gap: '0.5rem' }}>
      <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--sapFontFamily,Arial)', fontWeight: 600, fontSize: '0.9rem', marginRight: '0.3rem' }}>Interface Diagram</span>
        <Button icon="add" design="Transparent" onClick={() => addNode('system')}>System</Button>
        <Button icon="add" design="Transparent" onClick={() => addNode('integration')}>Integration</Button>
        <Button icon="add" design="Transparent" onClick={() => addNode('step')}>Step</Button>
        <Button icon="add" design="Transparent" onClick={() => addNode('line')}>Line</Button>
        <Button icon="add" design="Transparent" onClick={() => addNode('text')}>Text</Button>
        <Button icon="zoom-in" design="Transparent" onClick={() => fitView({ padding: 0.15, duration: 300 })}>Fit</Button>
        <div style={{ flex: 1 }} />
        <Button icon="download" design="Transparent" onClick={exportJSON}>JSON</Button>
        <Button icon="download" design="Emphasized"  onClick={exportPNG}>Export PNG</Button>
      </FlexBox>

      <FlexBox style={{ flex: 1, minHeight: 0, gap: '0.5rem' }}>
        <div style={{ flex: 1, border: '1px solid var(--sapList_BorderColor)', borderRadius: 6, overflow: 'hidden' }}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick} onEdgeClick={onEdgeClick} onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            connectionMode={'loose' as any}
            fitView fitViewOptions={{ padding: 0.2 }}
            deleteKeyCode="Delete"
            selectionOnDrag panOnDrag={[1, 2]}
            minZoom={0.05} maxZoom={3}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#d0d0d0" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <PropsPanel
          node={selectedNode} edge={selectedEdge}
          onUpdateNode={updateNode} onUpdateEdge={updateEdge}
          onDelete={deleteSelected}
        />
      </FlexBox>

      <div style={{ fontSize: '0.7rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily,Arial)' }}>
        Scroll to zoom · Drag canvas to pan · Shift-drag to select multiple · Drag node corners to resize
      </div>
    </FlexBox>
  )
}

export default function InterfaceDiagram() {
  return (
    <ReactFlowProvider>
      <DiagramInner />
    </ReactFlowProvider>
  )
}
