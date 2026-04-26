import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  FlexBox,
  FlexBoxAlignItems,
  FlexBoxJustifyContent,
  Input,
  Label,
  MessageStrip,
  Option,
  Select,
} from '@ui5/webcomponents-react'
import { useCPIInstance } from '../context/CPIInstanceContext'

// ── Types ──────────────────────────────────────────────────────────────────────

interface MonitoringTile {
  id: string
  name: string
  time_range: string
  status: string
  package_id: string
  iflow_id: string
  sort_order: number
}

interface MPLog {
  MessageGuid: string
  CorrelationId: string
  ApplicationMessageId: string | null
  Status: string
  LogStart: string
  LogEnd: string
  Sender: string | null
  Receiver: string | null
  IntegrationArtifact: {
    Id: string
    Name: string
    Type: string
    PackageId: string
    PackageName: string
  } | null
}

type View = 'dashboard' | 'detail'

// ── Constants ──────────────────────────────────────────────────────────────────

const TIME_RANGES = ['Past Hour', 'Past 4 Hours', 'Past Day', 'Past Week']
const STATUSES    = ['', 'COMPLETED', 'FAILED', 'RETRY', 'PROCESSING', 'ESCALATED']

const STATUS_LABELS: Record<string, string> = {
  '': 'All', COMPLETED: 'Completed', FAILED: 'Failed',
  RETRY: 'Retry', PROCESSING: 'Processing', ESCALATED: 'Escalated',
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED:  '#107e3e',
  FAILED:     '#bb0000',
  RETRY:      '#e9730c',
  PROCESSING: '#0064d9',
  ESCALATED:  '#6a2194',
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function cpiApiFetch(instanceId: string, path: string, params: string) {
  const res = await fetch('/api/cpidev/cpi-api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instance_id: instanceId, path, params }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

async function tilesFetch(path = '', opts?: RequestInit) {
  const res = await fetch('/api/cpidev/monitoring/tiles' + path, opts)
  if (res.status === 204) return null
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

// ── OData helpers ──────────────────────────────────────────────────────────────

// UTC ISO without ms — CPI OData v2 datetime literal format.
function odataDate(d: Date): string {
  return `datetime'${d.toISOString().slice(0, 19)}'`
}

function fromDate(timeRange: string): Date {
  const ms = Date.now()
  switch (timeRange) {
    case 'Past Hour':    return new Date(ms - 60 * 60 * 1000)
    case 'Past 4 Hours': return new Date(ms - 4 * 60 * 60 * 1000)
    case 'Past Day':     return new Date(ms - 24 * 60 * 60 * 1000)
    case 'Past Week':    return new Date(ms - 7 * 24 * 60 * 60 * 1000)
    default:             return new Date(ms - 60 * 60 * 1000)
  }
}

// Use encodeURI (not encodeURIComponent) so ':' and "'" in datetime literals are preserved.
function encodeOData(s: string): string {
  return encodeURI(s).replace(/'/g, '%27')
}

function buildFilter(
  timeRange: string, status: string, idSearch: string,
  packageId: string, iFlowId: string,
): string {
  const parts = [`LogEnd ge ${odataDate(fromDate(timeRange))}`]
  if (status)    parts.push(`Status eq '${status}'`)
  // iFlow is more specific — if both are set, iFlow wins.
  if (iFlowId)        parts.push(`IntegrationArtifact/Id eq '${iFlowId}'`)
  else if (packageId) parts.push(`IntegrationArtifact/PackageId eq '${packageId}'`)
  if (idSearch) parts.push(`(MessageGuid eq '${idSearch}' or CorrelationId eq '${idSearch}' or ApplicationMessageId eq '${idSearch}')`)
  return parts.join(' and ')
}

function parseCPIDate(raw: string): string {
  const m = raw.match(/\/Date\((\d+)\)\//)
  if (!m) return raw
  return new Date(parseInt(m[1])).toLocaleString()
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Monitoring() {
  const { selectedInstance } = useCPIInstance()
  const [view,          setView]          = useState<View>('dashboard')
  const [detailFilter,  setDetailFilter]  = useState({ timeRange: 'Past Hour', status: '', idSearch: '', packageId: '', iFlowId: '' })

  const goToDetail = (filter: typeof detailFilter) => {
    setDetailFilter(filter)
    setView('detail')
  }

  if (!selectedInstance) {
    return (
      <div style={{ padding: '2rem' }}>
        <MessageStrip design="Critical" hideCloseButton>
          No CPI instance selected. Choose one from the "Working with" bar at the top.
        </MessageStrip>
      </div>
    )
  }

  if (!selectedInstance.api_key) {
    return (
      <div style={{ padding: '2rem' }}>
        <MessageStrip design="Critical" hideCloseButton>
          The selected CPI instance has no <strong>API Service Key</strong> configured. Add it in Settings to enable monitoring.
        </MessageStrip>
      </div>
    )
  }

  return view === 'dashboard'
    ? <Dashboard instance={selectedInstance} onOpenDetail={goToDetail} />
    : <DetailView instance={selectedInstance} filter={detailFilter} onFilterChange={setDetailFilter} onBack={() => setView('dashboard')} />
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

function Dashboard({ instance, onOpenDetail }: {
  instance: ReturnType<typeof useCPIInstance>['selectedInstance'] & {}
  onOpenDetail: (f: { timeRange: string; status: string; idSearch: string; packageId: string; iFlowId: string }) => void
}) {
  const [tiles,      setTiles]      = useState<MonitoringTile[]>([])
  const [counts,     setCounts]     = useState<Record<string, number | null>>({})
  const [showAdd,    setShowAdd]    = useState(false)
  const [newName,      setNewName]      = useState('')
  const [newTime,      setNewTime]      = useState('Past Hour')
  const [newStatus,    setNewStatus]    = useState('')
  const [newPackageId, setNewPackageId] = useState('')
  const [newIFlowId,   setNewIFlowId]   = useState('')
  const [adding,     setAdding]     = useState(false)
  const [error,      setError]      = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const loadTiles = useCallback(async (instId: string) => {
    try {
      const data: MonitoringTile[] = await tilesFetch(`?instance_id=${encodeURIComponent(instId)}`)
      setTiles(data ?? [])
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => { loadTiles(instance.id) }, [loadTiles, instance.id])

  // Re-fetch all tile counts whenever instance or refreshKey changes (no stale-closure guard).
  useEffect(() => {
    if (tiles.length === 0) return
    setCounts({})
    tiles.forEach(async (tile) => {
      try {
        const filter = buildFilter(tile.time_range, tile.status, '', tile.package_id, tile.iflow_id)
        const params = `$top=1&$inlinecount=allpages&$filter=${encodeOData(filter)}`
        const data = await cpiApiFetch(instance.id, '/MessageProcessingLogs', params)
        const count = parseInt(data?.d?.__count ?? '0', 10)
        setCounts(prev => ({ ...prev, [tile.id]: count }))
      } catch {
        setCounts(prev => ({ ...prev, [tile.id]: null }))
      }
    })
  }, [tiles, instance.id, refreshKey]) // eslint-disable-line

  const refreshCounts = () => setRefreshKey(k => k + 1)

  const addTile = async () => {
    if (!newName.trim()) return
    setAdding(true); setError('')
    try {
      const tile: MonitoringTile = await tilesFetch('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_id: instance.id, name: newName.trim(), time_range: newTime, status: newStatus, package_id: newPackageId, iflow_id: newIFlowId }),
      })
      setTiles(prev => [...prev, tile])
      setShowAdd(false); setNewName(''); setNewTime('Past Hour'); setNewStatus(''); setNewPackageId(''); setNewIFlowId('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAdding(false)
    }
  }

  const deleteTile = async (id: string) => {
    await tilesFetch('/' + id, { method: 'DELETE' }).catch(() => {})
    setTiles(prev => prev.filter(t => t.id !== id))
    setCounts(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  return (
    <div style={{ padding: '1.5rem', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      {/* Header */}
      <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween}
        style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--sapTextColor)', fontFamily: 'var(--sapFontFamily)' }}>
          Monitor Message Processing
        </div>
        <Button icon="refresh" design="Transparent" onClick={refreshCounts}>Refresh</Button>
      </FlexBox>

      {/* Tile grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start' }}>
        {tiles.map(tile => (
          <TileCard
            key={tile.id}
            tile={tile}
            count={counts[tile.id]}
            onClick={() => onOpenDetail({ timeRange: tile.time_range, status: tile.status, idSearch: '', packageId: tile.package_id, iFlowId: tile.iflow_id })}
            onDelete={() => deleteTile(tile.id)}
          />
        ))}

        {/* Add tile */}
        {!showAdd ? (
          <div
            onClick={() => setShowAdd(true)}
            style={{
              width: '180px', height: '160px', borderRadius: '12px', cursor: 'pointer',
              border: '2px dashed var(--sapList_BorderColor)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: 'var(--sapContent_LabelColor)', fontSize: '2rem',
              background: 'var(--sapBackgroundColor)',
              transition: 'border-color 0.15s',
            }}
          >
            +
          </div>
        ) : (
          <div style={{
            width: '320px', padding: '1rem', borderRadius: '12px',
            border: '1px solid var(--sapList_BorderColor)',
            background: 'var(--sapList_Background)',
            display: 'flex', flexDirection: 'column', gap: '0.5rem',
          }}>
            <Label>Tile Name</Label>
            <Input value={newName} placeholder="e.g. Failed Messages" style={{ width: '100%' }}
              onInput={(e) => setNewName((e.target as any).value)} />
            <Label>Time Range</Label>
            <Select style={{ width: '100%' }}
              onChange={(e) => setNewTime((e.detail.selectedOption as HTMLElement).dataset.value ?? 'Past Hour')}>
              {TIME_RANGES.map(t => <Option key={t} data-value={t} selected={newTime === t}>{t}</Option>)}
            </Select>
            <Label>Status</Label>
            <Select style={{ width: '100%' }}
              onChange={(e) => setNewStatus((e.detail.selectedOption as HTMLElement).dataset.value ?? '')}>
              {STATUSES.map(s => <Option key={s} data-value={s} selected={newStatus === s}>{STATUS_LABELS[s]}</Option>)}
            </Select>
            <Label>Package ID <span style={{ fontWeight: 400, color: 'var(--sapContent_LabelColor)' }}>(optional)</span></Label>
            <Input value={newPackageId} placeholder="e.g. MyIntegrationPackage"
              disabled={!!newIFlowId} style={{ width: '100%', opacity: newIFlowId ? 0.4 : 1 }}
              onInput={(e) => { setNewPackageId((e.target as any).value); setNewIFlowId('') }} />
            <Label>iFlow ID <span style={{ fontWeight: 400, color: 'var(--sapContent_LabelColor)' }}>(optional, overrides Package)</span></Label>
            <Input value={newIFlowId} placeholder="e.g. Daniel-demo"
              disabled={!!newPackageId} style={{ width: '100%', opacity: newPackageId ? 0.4 : 1 }}
              onInput={(e) => { setNewIFlowId((e.target as any).value); setNewPackageId('') }} />
            {error && <MessageStrip design="Negative">{error}</MessageStrip>}
            <FlexBox style={{ gap: '0.5rem', marginTop: '0.25rem' }}>
              <Button design="Emphasized" onClick={addTile} disabled={adding}>
                {adding ? 'Saving…' : 'Add'}
              </Button>
              <Button design="Transparent" onClick={() => { setShowAdd(false); setError('') }}>Cancel</Button>
            </FlexBox>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tile card ──────────────────────────────────────────────────────────────────

function TileCard({ tile, count, onClick, onDelete }: {
  tile: MonitoringTile
  count: number | null | undefined
  onClick: () => void
  onDelete: () => void
}) {
  const statusColor = tile.status ? STATUS_COLORS[tile.status] : 'var(--sapContent_LabelColor)'
  const isLoading   = count === undefined

  return (
    <div
      onClick={onClick}
      style={{
        width: '180px', height: '160px', borderRadius: '12px', cursor: 'pointer',
        border: '1px solid var(--sapList_BorderColor)',
        background: 'var(--sapList_Background)',
        padding: '1rem', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        position: 'relative',
        transition: 'box-shadow 0.15s',
      }}
    >
      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        style={{
          position: 'absolute', top: '0.4rem', right: '0.4rem',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--sapContent_LabelColor)', fontSize: '0.75rem', lineHeight: 1,
          opacity: 0.5, padding: '0.2rem',
        }}
      >✕</button>

      {/* Title */}
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--sapTextColor)', fontFamily: 'var(--sapFontFamily)', lineHeight: 1.3 }}>
          {tile.name}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', marginTop: '0.15rem' }}>
          {tile.time_range}
        </div>
      </div>

      {/* Count */}
      <div style={{ textAlign: 'center', fontSize: '2.8rem', fontWeight: 300, color: statusColor, lineHeight: 1 }}>
        {isLoading ? '…' : count === null ? '!' : count.toLocaleString()}
      </div>

      {/* Status label */}
      <div style={{ fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)' }}>
        {tile.status ? STATUS_LABELS[tile.status] + ' Messages' : 'Messages'}
      </div>
    </div>
  )
}

// ── Detail view ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

function DetailView({ instance, filter, onFilterChange, onBack }: {
  instance: ReturnType<typeof useCPIInstance>['selectedInstance'] & {}
  filter: { timeRange: string; status: string; idSearch: string; packageId: string; iFlowId: string }
  onFilterChange: (f: typeof filter) => void
  onBack: () => void
}) {
  const [messages, setMessages] = useState<MPLog[]>([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(async (p: number, f: typeof filter) => {
    setLoading(true); setError('')
    try {
      const filterStr = buildFilter(f.timeRange, f.status, f.idSearch, f.packageId, f.iFlowId)
      const skip      = (p - 1) * PAGE_SIZE
      const params = [
        `$top=${PAGE_SIZE}`,
        `$skip=${skip}`,
        `$inlinecount=allpages`,
        `$orderby=LogEnd%20desc`,
        `$filter=${encodeOData(filterStr)}`,
      ].join('&')

      const data = await cpiApiFetch(instance.id, '/MessageProcessingLogs', params)
      setMessages(data?.d?.results ?? [])
      setTotal(parseInt(data?.d?.__count ?? '0', 10))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [instance.id])

  useEffect(() => {
    setPage(1)
    load(1, filter)
  }, [filter, load]) // eslint-disable-line

  const setFilter = (patch: Partial<typeof filter>) => {
    onFilterChange({ ...filter, ...patch })
  }

  const rangeFrom = fromDate(filter.timeRange)
  const rangeLabel = `${rangeFrom.toLocaleString()} – ${new Date().toLocaleString()}`

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Breadcrumb */}
      <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapList_Background)' }}>
        <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.25rem', fontSize: '0.85rem', fontFamily: 'var(--sapFontFamily)' }}>
          <span style={{ color: 'var(--sapLinkColor)', cursor: 'pointer' }} onClick={onBack}>Overview</span>
          <span style={{ color: 'var(--sapContent_LabelColor)' }}>/</span>
          <span style={{ color: 'var(--sapTextColor)' }}>Monitor Message Processing</span>
        </FlexBox>
      </div>

      {/* Filter bar */}
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapList_Background)' }}>
        <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', marginBottom: '0.25rem' }}>Time:</div>
            <Select style={{ minWidth: '140px' }}
              onChange={(e) => setFilter({ timeRange: (e.detail.selectedOption as HTMLElement).dataset.value ?? 'Past Hour' })}>
              {TIME_RANGES.map(t => <Option key={t} data-value={t} selected={filter.timeRange === t}>{t}</Option>)}
            </Select>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', marginBottom: '0.25rem' }}>Status:</div>
            <Select style={{ minWidth: '130px' }}
              onChange={(e) => setFilter({ status: (e.detail.selectedOption as HTMLElement).dataset.value ?? '' })}>
              {STATUSES.map(s => <Option key={s} data-value={s} selected={filter.status === s}>{STATUS_LABELS[s]}</Option>)}
            </Select>
          </div>
          <div style={{ minWidth: '160px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', marginBottom: '0.25rem' }}>Package ID:</div>
            <Input value={filter.packageId} placeholder="All packages"
              style={{ width: '100%', opacity: filter.iFlowId ? 0.4 : 1 }}
              disabled={!!filter.iFlowId}
              onInput={(e) => setFilter({ packageId: (e.target as any).value, iFlowId: '' })} />
          </div>
          <div style={{ minWidth: '160px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', marginBottom: '0.25rem' }}>iFlow ID:</div>
            <Input value={filter.iFlowId} placeholder="All iFlows"
              style={{ width: '100%', opacity: filter.packageId ? 0.4 : 1 }}
              disabled={!!filter.packageId}
              onInput={(e) => setFilter({ iFlowId: (e.target as any).value, packageId: '' })} />
          </div>
          <div style={{ minWidth: '180px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)', marginBottom: '0.25rem' }}>Message / Correlation ID:</div>
            <Input value={filter.idSearch} placeholder="Search by ID…" style={{ width: '100%' }}
              onInput={(e) => setFilter({ idSearch: (e.target as any).value })} />
          </div>
          <Button icon="refresh" design="Transparent" onClick={() => load(page, filter)} style={{ marginTop: '1.2rem' }} />
        </FlexBox>
        <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)' }}>
          {rangeLabel}
        </div>
      </div>

      {/* Table header */}
      <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--sapList_BorderColor)', background: 'var(--sapGroup_TitleBackground)' }}>
        <FlexBox alignItems={FlexBoxAlignItems.Center} justifyContent={FlexBoxJustifyContent.SpaceBetween}>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', fontFamily: 'var(--sapFontFamily)' }}>
            Messages ({loading ? '…' : total.toLocaleString()})
          </span>
          <FlexBox alignItems={FlexBoxAlignItems.Center} style={{ gap: '0.25rem' }}>
            <Button icon="close" design="Transparent" disabled={page <= 1} onClick={() => { setPage(1); load(1, filter) }} />
            <Button icon="navigation-left-arrow" design="Transparent" disabled={page <= 1} onClick={() => { const p = page-1; setPage(p); load(p, filter) }} />
            <span style={{ fontSize: '0.82rem', fontFamily: 'var(--sapFontFamily)', padding: '0 0.4rem' }}>{page} / {totalPages}</span>
            <Button icon="navigation-right-arrow" design="Transparent" disabled={page >= totalPages} onClick={() => { const p = page+1; setPage(p); load(p, filter) }} />
            <Button icon="open" design="Transparent" disabled={page >= totalPages} onClick={() => { setPage(totalPages); load(totalPages, filter) }} />
          </FlexBox>
        </FlexBox>
      </div>

      {error && (
        <MessageStrip design="Negative" style={{ margin: '0.5rem 1rem' }} onClose={() => setError('')}>{error}</MessageStrip>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Column headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 100px 150px 150px 100px 100px',
          padding: '0.4rem 1rem',
          borderBottom: '1px solid var(--sapList_BorderColor)',
          background: 'var(--sapList_HeaderBackground)',
          fontSize: '0.78rem', fontWeight: 600, color: 'var(--sapContent_LabelColor)',
          fontFamily: 'var(--sapFontFamily)',
        }}>
          <span>Artifact / Package</span>
          <span>Status</span>
          <span>Start</span>
          <span>End</span>
          <span>Sender</span>
          <span>Receiver</span>
        </div>

        {loading && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)' }}>
            Loading…
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--sapContent_LabelColor)', fontFamily: 'var(--sapFontFamily)' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>No Messages found</div>
            <div style={{ fontSize: '0.85rem' }}>Adjust filters to get Messages</div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.MessageGuid} style={{
            display: 'grid',
            gridTemplateColumns: '2fr 100px 150px 150px 100px 100px',
            padding: '0.5rem 1rem',
            borderBottom: '1px solid var(--sapList_BorderColor)',
            fontSize: '0.8rem', fontFamily: 'var(--sapFontFamily)',
            background: 'var(--sapList_Background)',
            alignItems: 'start',
          }}>
            <div style={{ paddingRight: '0.5rem', minWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={msg.IntegrationArtifact?.Name ?? msg.MessageGuid}>
                {msg.IntegrationArtifact?.Name ?? msg.MessageGuid}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                {msg.IntegrationArtifact?.Id && (
                  <CopyChip label="iFlow" value={msg.IntegrationArtifact.Id} />
                )}
                {msg.IntegrationArtifact?.PackageId && (
                  <CopyChip label="Pkg" value={msg.IntegrationArtifact.PackageId} />
                )}
              </div>
            </div>
            <span><StatusBadge status={msg.Status} /></span>
            <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.75rem' }}>
              {parseCPIDate(msg.LogStart)}
            </span>
            <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.75rem' }}>
              {parseCPIDate(msg.LogEnd)}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--sapContent_LabelColor)' }}>
              {msg.Sender ?? '—'}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--sapContent_LabelColor)' }}>
              {msg.Receiver ?? '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Copy chip ──────────────────────────────────────────────────────────────────

function CopyChip({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <span
      onClick={copy}
      title={`Click to copy: ${value}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
        fontSize: '0.68rem', fontFamily: 'monospace',
        padding: '0.1rem 0.35rem', borderRadius: '3px', cursor: 'pointer',
        background: copied ? 'var(--sapSuccessBackground)' : 'var(--sapNeutralBackground)',
        color: copied ? 'var(--sapSuccessColor)' : 'var(--sapContent_LabelColor)',
        border: `1px solid ${copied ? 'var(--sapSuccessBorderColor)' : 'var(--sapNeutralBorderColor)'}`,
        userSelect: 'none',
        maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontFamily: 'var(--sapFontFamily)', fontWeight: 600 }}>{label}:</span> {copied ? '✓' : value}
    </span>
  )
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const bg: Record<string, string> = {
    COMPLETED:  '#eaf5ea', FAILED:     '#ffeaea',
    RETRY:      '#fff3e0', PROCESSING: '#e8f4fd', ESCALATED: '#f3e8ff',
  }
  const color = STATUS_COLORS[status] ?? 'var(--sapTextColor)'
  return (
    <span style={{
      display: 'inline-block', fontSize: '0.7rem', fontWeight: 600,
      padding: '0.1rem 0.4rem', borderRadius: '3px',
      background: bg[status] ?? 'var(--sapNeutralBackground)',
      color, border: `1px solid ${color}`,
      fontFamily: 'var(--sapFontFamily)',
    }}>
      {status}
    </span>
  )
}
