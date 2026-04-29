'use client'

import ExcelJS from 'exceljs'
import { toPng } from 'html-to-image'
import { motion } from 'framer-motion'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, BarChart3, CalendarRange, CheckCircle2, Download, Filter, Loader2,
  MoonStar, PieChart, Printer, RefreshCw, Search, TrendingDown, TrendingUp, Users
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/utils/supabase/client'
import {
  dateKeysBetween,
  getLimaDateKey,
  loadAttendanceRangeDataset,
  sortRecordsForRange,
  type AsistenciaRecord,
} from '@/utils/attendance'

type SeriesKey = 'puntual' | 'tardanza' | 'inasistencia'

type TrendMetric = {
  fecha: string
  puntuales: number
  tardanzas: number
  inasistencias: number
  conSalida: number
  nocturnos: number
  total: number
}

type AreaMetric = {
  area: string
  puntuales: number
  tardanzas: number
  inasistencias: number
  total: number
}

type WorkerMetric = {
  dni: string
  nombre: string
  area: string
  puntuales: number
  tardanzas: number
  inasistencias: number
  conSalida: number
  reingresos: number
  nocturnos: number
  total: number
}

type SummaryMetric = {
  total: number
  trabajadores: number
  puntuales: number
  tardanzas: number
  inasistencias: number
  conSalida: number
  reingresos: number
  nocturnos: number
}

type StatusConfig = {
  key: SeriesKey
  label: string
  value: number
  color: string
  accent: string
}

const SERIES_CONFIG: Record<SeriesKey, { label: string; color: string; accent: string }> = {
  puntual: {
    label: 'Puntuales',
    color: '#10B981',
    accent: 'linear-gradient(90deg,#10B981,#34D399)',
  },
  tardanza: {
    label: 'Tardanzas',
    color: '#F43F5E',
    accent: 'linear-gradient(90deg,#F43F5E,#FB7185)',
  },
  inasistencia: {
    label: 'Inasistencias',
    color: '#F97316',
    accent: 'linear-gradient(90deg,#F97316,#FDBA74)',
  },
}

function isNocturno(record: AsistenciaRecord) {
  return String(record.notas ?? '').startsWith('Turno Nocturno')
}

function formatChartDate(dateKey: string) {
  return format(new Date(`${dateKey}T12:00:00.000Z`), 'dd MMM', { locale: es })
}

function formatFullDate(dateKey: string) {
  return format(new Date(`${dateKey}T12:00:00.000Z`), 'dd MMM yyyy', { locale: es })
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function buildLinePath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return ''
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function workerOrder(a: WorkerMetric, b: WorkerMetric, orderBy: string) {
  const map: Record<string, number> = {
    puntuales: b.puntuales - a.puntuales,
    tardanzas: b.tardanzas - a.tardanzas,
    inasistencias: b.inasistencias - a.inasistencias,
    conSalida: b.conSalida - a.conSalida,
    reingresos: b.reingresos - a.reingresos,
    total: b.total - a.total,
  }
  const primary = map[orderBy] ?? map.total
  if (primary !== 0) return primary
  return a.nombre.localeCompare(b.nombre)
}

function KpiCard({
  title,
  value,
  subtitle,
  accent,
  icon,
}: {
  title: string
  value: number | string
  subtitle: string
  accent: string
  icon: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="h-1.5 flex-1 rounded-full" style={{ background: accent }} />
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-md">
          {icon}
        </div>
      </div>
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{title}</p>
      <p className="mt-2 text-4xl font-black tracking-tight text-slate-900 tabular-nums">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
    </motion.div>
  )
}

function ChartCard({
  title,
  subtitle,
  icon,
  children,
  chartRef,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  children: React.ReactNode
  chartRef?: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[28px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{subtitle}</p>
          <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">{title}</h3>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg">
          {icon}
        </div>
      </div>
      <div ref={chartRef}>{children}</div>
    </motion.section>
  )
}

function EmptyChartState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 text-center text-sm font-bold text-slate-400">
      {text}
    </div>
  )
}

function StatusLegend({
  statuses,
  visibleSeries,
  onToggle,
}: {
  statuses: StatusConfig[]
  visibleSeries: Record<SeriesKey, boolean>
  onToggle: (key: SeriesKey) => void
}) {
  return (
    <div className="analytics-no-print mb-6 grid gap-3 sm:grid-cols-3">
      {statuses.map((status) => {
        const active = visibleSeries[status.key]
        return (
          <button
            key={status.key}
            onClick={() => onToggle(status.key)}
            className={classNames(
              'group flex items-center justify-between rounded-[24px] border px-4 py-4 text-left shadow-sm transition-all',
              active ? 'border-slate-200 bg-white/90 hover:-translate-y-0.5' : 'border-dashed border-slate-300 bg-slate-50 opacity-70',
            )}
          >
            <div className="flex items-center gap-3">
              <span className="h-4 w-4 rounded-full shadow-sm" style={{ backgroundColor: status.color }} />
              <div>
                <div className={classNames('text-sm font-black text-slate-800', !active && 'line-through text-slate-400')}>
                  {status.label}
                </div>
                <div className="text-xs font-bold text-slate-400">
                  {active ? 'Visible en tiempo real' : 'Serie oculta'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={classNames('text-2xl font-black tabular-nums', active ? 'text-slate-900' : 'text-slate-400')}>
                {status.value}
              </div>
              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                {active ? 'Activo' : 'Filtrado'}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function LineTrendChart({
  data,
  visibleSeries,
}: {
  data: TrendMetric[]
  visibleSeries: Record<SeriesKey, boolean>
}) {
  const width = 940
  const height = 300
  const paddingX = 42
  const paddingY = 24
  const max = Math.max(
    ...data.map((item) => Math.max(
      visibleSeries.puntual ? item.puntuales : 0,
      visibleSeries.tardanza ? item.tardanzas : 0,
      visibleSeries.inasistencia ? item.inasistencias : 0,
      1,
    )),
    1,
  )
  const innerWidth = width - paddingX * 2
  const innerHeight = height - paddingY * 2

  const toPoints = (key: 'puntuales' | 'tardanzas' | 'inasistencias') => data.map((item, index) => ({
    x: paddingX + (innerWidth * index) / Math.max(data.length - 1, 1),
    y: paddingY + innerHeight - ((item[key] || 0) / max) * innerHeight,
  }))

  const puntualPoints = toPoints('puntuales')
  const tardanzaPoints = toPoints('tardanzas')
  const inasistenciaPoints = toPoints('inasistencias')

  if (!data.length) return <EmptyChartState text="Sin datos en el rango seleccionado." />
  if (!visibleSeries.puntual && !visibleSeries.tardanza && !visibleSeries.inasistencia) {
    return <EmptyChartState text="Activa al menos una serie para ver la línea de tendencia." />
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[780px]">
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const y = paddingY + innerHeight - innerHeight * step
          const label = Math.round(max * step)
          return (
            <g key={step}>
              <line x1={paddingX} x2={width - paddingX} y1={y} y2={y} stroke="#E2E8F0" strokeDasharray="5 7" />
              <text x={10} y={y + 4} fontSize="11" fill="#94A3B8">{label}</text>
            </g>
          )
        })}

        {visibleSeries.puntual && <path d={buildLinePath(puntualPoints)} fill="none" stroke={SERIES_CONFIG.puntual.color} strokeWidth="4" strokeLinecap="round" />}
        {visibleSeries.tardanza && <path d={buildLinePath(tardanzaPoints)} fill="none" stroke={SERIES_CONFIG.tardanza.color} strokeWidth="4" strokeLinecap="round" />}
        {visibleSeries.inasistencia && <path d={buildLinePath(inasistenciaPoints)} fill="none" stroke={SERIES_CONFIG.inasistencia.color} strokeWidth="4" strokeLinecap="round" />}

        {data.map((item, index) => (
          <g key={item.fecha}>
            {visibleSeries.puntual && <circle cx={puntualPoints[index].x} cy={puntualPoints[index].y} r="4.5" fill={SERIES_CONFIG.puntual.color} />}
            {visibleSeries.tardanza && <circle cx={tardanzaPoints[index].x} cy={tardanzaPoints[index].y} r="4.5" fill={SERIES_CONFIG.tardanza.color} />}
            {visibleSeries.inasistencia && <circle cx={inasistenciaPoints[index].x} cy={inasistenciaPoints[index].y} r="4.5" fill={SERIES_CONFIG.inasistencia.color} />}
            <text x={puntualPoints[index].x} y={height - 4} textAnchor="middle" fontSize="11" fill="#64748B">{formatChartDate(item.fecha)}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function DailyStackedBars({
  data,
  visibleSeries,
}: {
  data: TrendMetric[]
  visibleSeries: Record<SeriesKey, boolean>
}) {
  const width = 940
  const height = 300
  const padding = 32
  const max = Math.max(
    ...data.map((item) =>
      (visibleSeries.puntual ? item.puntuales : 0) +
      (visibleSeries.tardanza ? item.tardanzas : 0) +
      (visibleSeries.inasistencia ? item.inasistencias : 0),
    ),
    1,
  )
  const innerHeight = height - padding * 2
  const barZone = (width - padding * 2) / Math.max(data.length, 1)
  const barWidth = Math.max(12, Math.min(30, barZone * 0.62))

  if (!data.length) return <EmptyChartState text="Sin datos diarios para graficar." />
  if (!visibleSeries.puntual && !visibleSeries.tardanza && !visibleSeries.inasistencia) {
    return <EmptyChartState text="Activa al menos una serie para ver las barras." />
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[780px]">
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const y = padding + innerHeight - innerHeight * step
          return <line key={step} x1={padding} x2={width - padding} y1={y} y2={y} stroke="#E2E8F0" strokeDasharray="4 8" />
        })}

        {data.map((item, index) => {
          const x = padding + index * barZone + (barZone - barWidth) / 2
          const scale = innerHeight / max
          let cursorY = height - padding
          const segments = [
            visibleSeries.inasistencia ? { value: item.inasistencias, color: SERIES_CONFIG.inasistencia.color } : null,
            visibleSeries.tardanza ? { value: item.tardanzas, color: SERIES_CONFIG.tardanza.color } : null,
            visibleSeries.puntual ? { value: item.puntuales, color: SERIES_CONFIG.puntual.color } : null,
          ].filter(Boolean) as Array<{ value: number; color: string }>
          const total = segments.reduce((sum, segment) => sum + segment.value, 0)

          return (
            <g key={item.fecha}>
              {segments.map((segment, segmentIndex) => {
                const segmentHeight = segment.value * scale
                cursorY -= segmentHeight
                return (
                  <rect
                    key={`${item.fecha}-${segmentIndex}`}
                    x={x}
                    y={cursorY}
                    width={barWidth}
                    height={segmentHeight}
                    rx="8"
                    fill={segment.color}
                  />
                )
              })}
              <text x={x + barWidth / 2} y={cursorY - 8} textAnchor="middle" fontSize="10" fill="#475569">{total}</text>
              <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" fontSize="10" fill="#64748B">{formatChartDate(item.fecha)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function DonutChart({
  statuses,
  visibleSeries,
  onToggle,
}: {
  statuses: StatusConfig[]
  visibleSeries: Record<SeriesKey, boolean>
  onToggle: (key: SeriesKey) => void
}) {
  const radius = 74
  const circumference = 2 * Math.PI * radius
  const visibleSlices = statuses.filter((status) => visibleSeries[status.key] && status.value > 0)
  const total = visibleSlices.reduce((sum, slice) => sum + slice.value, 0)
  let offset = 0

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
      <div className="relative mx-auto h-56 w-56">
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
          <circle cx="100" cy="100" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="22" />
          {visibleSlices.map((slice) => {
            const length = total > 0 ? (slice.value / total) * circumference : 0
            const node = (
              <circle
                key={slice.key}
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth="22"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
              />
            )
            offset += length
            return node
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Registros</span>
          <span className="text-5xl font-black tracking-tight text-slate-900 tabular-nums">{total}</span>
        </div>
      </div>
      <div className="grid flex-1 gap-3">
        {statuses.map((slice) => {
          const active = visibleSeries[slice.key]
          const percentage = total > 0 && active ? (slice.value / total) * 100 : 0
          return (
            <button
              key={slice.key}
              onClick={() => onToggle(slice.key)}
              className={classNames(
                'rounded-2xl border p-4 text-left transition-all',
                active ? 'border-slate-200 bg-slate-50 hover:-translate-y-0.5' : 'border-dashed border-slate-300 bg-slate-50/70 opacity-70',
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-black text-slate-700">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: slice.color }} />
                  <span className={classNames(!active && 'line-through text-slate-400')}>{slice.label}</span>
                </div>
                <span className={classNames('text-sm font-black tabular-nums text-slate-900', !active && 'text-slate-400')}>
                  {slice.value}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full" style={{ width: `${percentage}%`, background: slice.accent }} />
              </div>
              <div className="mt-2 text-xs font-bold text-slate-500">{active ? `${percentage.toFixed(1)}%` : 'Oculto'}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AreaBars({
  data,
  total,
  visibleSeries,
}: {
  data: AreaMetric[]
  total: number
  visibleSeries: Record<SeriesKey, boolean>
}) {
  if (!data.length) return <EmptyChartState text="Sin áreas para mostrar." />
  if (!visibleSeries.puntual && !visibleSeries.tardanza && !visibleSeries.inasistencia) {
    return <EmptyChartState text="Activa al menos una serie para ver el peso por área." />
  }

  return (
    <div className="space-y-4">
      {data.map((item) => {
        const visibleTotal =
          (visibleSeries.puntual ? item.puntuales : 0) +
          (visibleSeries.tardanza ? item.tardanzas : 0) +
          (visibleSeries.inasistencia ? item.inasistencias : 0)
        const ratio = total > 0 ? (visibleTotal / total) * 100 : 0
        return (
          <div key={item.area}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm font-bold text-slate-700">
              <span className="truncate">{item.area}</span>
              <span className="tabular-nums text-slate-500">{visibleTotal}</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
              {visibleSeries.puntual && <div className="bg-emerald-500" style={{ width: `${visibleTotal > 0 ? (item.puntuales / visibleTotal) * ratio : 0}%` }} />}
              {visibleSeries.tardanza && <div className="bg-rose-500" style={{ width: `${visibleTotal > 0 ? (item.tardanzas / visibleTotal) * ratio : 0}%` }} />}
              {visibleSeries.inasistencia && <div className="bg-orange-500" style={{ width: `${visibleTotal > 0 ? (item.inasistencias / visibleTotal) * ratio : 0}%` }} />}
            </div>
            <div className="mt-1.5 flex gap-3 text-[11px] font-black">
              {visibleSeries.puntual && <span className="text-emerald-600">P {item.puntuales}</span>}
              {visibleSeries.tardanza && <span className="text-rose-600">T {item.tardanzas}</span>}
              {visibleSeries.inasistencia && <span className="text-orange-600">I {item.inasistencias}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MetricasPageContent() {
  const searchParams = useSearchParams()
  const todayKey = getLimaDateKey()
  const [fromKey, setFromKey] = useState(searchParams.get('from') ?? format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [toKey, setToKey] = useState(searchParams.get('to') ?? todayKey)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [records, setRecords] = useState<AsistenciaRecord[]>([])
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [areaFilter, setAreaFilter] = useState('TODAS')
  const [workerQuery, setWorkerQuery] = useState('')
  const [orderBy, setOrderBy] = useState<'puntuales' | 'tardanzas' | 'inasistencias' | 'conSalida' | 'reingresos' | 'total'>('puntuales')
  const [visibleSeries, setVisibleSeries] = useState<Record<SeriesKey, boolean>>({
    puntual: true,
    tardanza: true,
    inasistencia: true,
  })

  const lineChartRef = useRef<HTMLDivElement>(null)
  const donutChartRef = useRef<HTMLDivElement>(null)
  const stackedChartRef = useRef<HTMLDivElement>(null)
  const areasChartRef = useRef<HTMLDivElement>(null)
  const liveReloadTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const toggleSeries = (key: SeriesKey) => {
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const loadData = async () => {
    if (!fromKey || !toKey) return
    if (fromKey > toKey) {
      toast.error('La fecha inicial no puede ser mayor que la final')
      return
    }

    setLoading(true)
    try {
      const data = sortRecordsForRange(await loadAttendanceRangeDataset(fromKey, toKey))
      setRecords(data)
      setGeneratedAt(new Date())
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo cargar la analítica')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const queueReload = () => {
      if (liveReloadTimeoutRef.current) clearTimeout(liveReloadTimeoutRef.current)
      liveReloadTimeoutRef.current = setTimeout(() => {
        loadData()
      }, 650)
    }

    const channel = supabase
      .channel(`metricas-live-${fromKey}-${toKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registro_asistencias' }, queueReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vacaciones_solicitudes' }, queueReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fotocheck_perfiles' }, queueReload)
      .subscribe()

    return () => {
      if (liveReloadTimeoutRef.current) clearTimeout(liveReloadTimeoutRef.current)
      supabase.removeChannel(channel)
    }
  }, [fromKey, toKey])

  const areaOptions = useMemo(
    () => ['TODAS', ...Array.from(new Set(records.map((item) => item.area || 'SIN AREA'))).sort()],
    [records],
  )

  const scopedRecords = useMemo(
    () => areaFilter === 'TODAS' ? records : records.filter((item) => (item.area || 'SIN AREA') === areaFilter),
    [records, areaFilter],
  )

  const visibleRecords = useMemo(() => scopedRecords.filter((item) => {
    if (item.estado_ingreso === 'PUNTUAL') return visibleSeries.puntual
    if (item.estado_ingreso === 'TARDANZA') return visibleSeries.tardanza
    if (item.estado_ingreso === 'INASISTENCIA') return visibleSeries.inasistencia
    return true
  }), [scopedRecords, visibleSeries])

  const summary = useMemo<SummaryMetric>(() => {
    const daySeen = new Map<string, number>()
    let puntuales = 0
    let tardanzas = 0
    let inasistencias = 0
    let conSalida = 0
    let nocturnos = 0

    visibleRecords.forEach((item) => {
      if (item.estado_ingreso === 'PUNTUAL') puntuales += 1
      else if (item.estado_ingreso === 'TARDANZA') tardanzas += 1
      else if (item.estado_ingreso === 'INASISTENCIA') inasistencias += 1
      if (item.hora_salida) conSalida += 1
      if (isNocturno(item)) nocturnos += 1
      const key = `${item.fecha}::${item.dni}`
      daySeen.set(key, (daySeen.get(key) ?? 0) + 1)
    })

    const reingresos = Array.from(daySeen.values()).reduce((sum, count) => sum + Math.max(count - 1, 0), 0)
    const trabajadores = new Set(visibleRecords.map((item) => item.dni)).size
    return { total: visibleRecords.length, trabajadores, puntuales, tardanzas, inasistencias, conSalida, reingresos, nocturnos }
  }, [visibleRecords])

  const trend = useMemo<TrendMetric[]>(() => {
    const base = new Map<string, TrendMetric>()
    dateKeysBetween(fromKey, toKey).forEach((dateKey) => {
      base.set(dateKey, {
        fecha: dateKey,
        puntuales: 0,
        tardanzas: 0,
        inasistencias: 0,
        conSalida: 0,
        nocturnos: 0,
        total: 0,
      })
    })

    visibleRecords.forEach((item) => {
      const row = base.get(item.fecha)
      if (!row) return
      if (item.estado_ingreso === 'PUNTUAL') row.puntuales += 1
      else if (item.estado_ingreso === 'TARDANZA') row.tardanzas += 1
      else if (item.estado_ingreso === 'INASISTENCIA') row.inasistencias += 1
      if (item.hora_salida) row.conSalida += 1
      if (isNocturno(item)) row.nocturnos += 1
      row.total += 1
    })

    return Array.from(base.values())
  }, [visibleRecords, fromKey, toKey])

  const areaMetrics = useMemo<AreaMetric[]>(() => {
    const map = new Map<string, AreaMetric>()
    visibleRecords.forEach((item) => {
      const key = item.area || 'SIN AREA'
      const row = map.get(key) ?? { area: key, puntuales: 0, tardanzas: 0, inasistencias: 0, total: 0 }
      if (item.estado_ingreso === 'PUNTUAL') row.puntuales += 1
      else if (item.estado_ingreso === 'TARDANZA') row.tardanzas += 1
      else if (item.estado_ingreso === 'INASISTENCIA') row.inasistencias += 1
      row.total += 1
      map.set(key, row)
    })
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [visibleRecords])

  const workerMetrics = useMemo<WorkerMetric[]>(() => {
    const map = new Map<string, WorkerMetric>()
    const daySeen = new Map<string, number>()

    visibleRecords.forEach((item) => {
      const row = map.get(item.dni) ?? {
        dni: item.dni,
        nombre: item.nombres_completos,
        area: item.area || 'SIN AREA',
        puntuales: 0,
        tardanzas: 0,
        inasistencias: 0,
        conSalida: 0,
        reingresos: 0,
        nocturnos: 0,
        total: 0,
      }
      if (item.estado_ingreso === 'PUNTUAL') row.puntuales += 1
      else if (item.estado_ingreso === 'TARDANZA') row.tardanzas += 1
      else if (item.estado_ingreso === 'INASISTENCIA') row.inasistencias += 1
      if (item.hora_salida) row.conSalida += 1
      if (isNocturno(item)) row.nocturnos += 1
      row.total += 1
      map.set(item.dni, row)
      const key = `${item.dni}::${item.fecha}`
      daySeen.set(key, (daySeen.get(key) ?? 0) + 1)
    })

    daySeen.forEach((count, key) => {
      const [dni] = key.split('::')
      const row = map.get(dni)
      if (row) row.reingresos += Math.max(count - 1, 0)
    })

    return Array.from(map.values())
  }, [visibleRecords])

  const filteredWorkers = useMemo(() => {
    const query = workerQuery.trim().toLowerCase()
    return [...workerMetrics]
      .filter((item) => !query || item.nombre.toLowerCase().includes(query) || item.dni.includes(query))
      .sort((a, b) => workerOrder(a, b, orderBy))
  }, [workerMetrics, workerQuery, orderBy])

  const statuses = useMemo<StatusConfig[]>(() => [
    {
      key: 'puntual',
      label: SERIES_CONFIG.puntual.label,
      value: summary.puntuales,
      color: SERIES_CONFIG.puntual.color,
      accent: SERIES_CONFIG.puntual.accent,
    },
    {
      key: 'tardanza',
      label: SERIES_CONFIG.tardanza.label,
      value: summary.tardanzas,
      color: SERIES_CONFIG.tardanza.color,
      accent: SERIES_CONFIG.tardanza.accent,
    },
    {
      key: 'inasistencia',
      label: SERIES_CONFIG.inasistencia.label,
      value: summary.inasistencias,
      color: SERIES_CONFIG.inasistencia.color,
      accent: SERIES_CONFIG.inasistencia.accent,
    },
  ], [summary])

  const bestDay = useMemo(
    () => trend.reduce<TrendMetric | null>((best, item) => item.puntuales > (best?.puntuales ?? -1) ? item : best, null),
    [trend],
  )

  const criticalDay = useMemo(
    () => trend.reduce<TrendMetric | null>((worst, item) => item.inasistencias > (worst?.inasistencias ?? -1) ? item : worst, null),
    [trend],
  )

  const exportChartsToExcel = async () => {
    const targets = [
      { ref: lineChartRef, title: 'Tendencia' },
      { ref: donutChartRef, title: 'Distribucion' },
      { ref: stackedChartRef, title: 'Barras' },
      { ref: areasChartRef, title: 'Areas' },
    ]

    setExporting(true)
    try {
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Graficas')
      sheet.views = [{ showGridLines: false }]
      sheet.columns = Array.from({ length: 12 }, () => ({ width: 16 }))
      sheet.getCell('A1').value = 'Analítica RUAG'
      sheet.getCell('A1').font = { bold: true, size: 18 }
      sheet.getCell('A2').value = `Rango: ${fromKey} al ${toKey}`
      sheet.getCell('A3').value = `Área: ${areaFilter}`
      sheet.getCell('A4').value = `Actualizado: ${generatedAt ? generatedAt.toLocaleString('es-PE') : '—'}`
      sheet.getCell('A5').value = `Series activas: ${statuses.filter((status) => visibleSeries[status.key]).map((status) => status.label).join(', ') || 'Ninguna'}`

      const images = await Promise.all(targets.map(async ({ ref, title }) => {
        if (!ref.current) throw new Error(`No se pudo capturar ${title}`)
        return {
          title,
          dataUrl: await toPng(ref.current, {
            cacheBust: true,
            pixelRatio: 2,
            backgroundColor: '#ffffff',
          }),
        }
      }))

      let currentRow = 7
      images.forEach((image, index) => {
        sheet.getCell(`A${currentRow}`).value = image.title
        sheet.getCell(`A${currentRow}`).font = { bold: true, size: 13 }
        const imageId = workbook.addImage({
          base64: image.dataUrl,
          extension: 'png',
        })
        sheet.addImage(imageId, {
          tl: { col: 0, row: currentRow },
          ext: { width: index % 2 === 0 ? 920 : 820, height: 420 },
        })
        currentRow += 24
      })

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `RUAG_GRAFICAS_${fromKey}_AL_${toKey}.xlsx`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success('Excel con gráficas generado')
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo exportar las gráficas')
    } finally {
      setExporting(false)
    }
  }

  const printPage = () => window.print()

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.15),_transparent_24%),linear-gradient(180deg,_#f8fbff_0%,_#eef4ff_42%,_#f8fafc_100%)]">
      <style jsx global>{`
        @media print {
          .analytics-no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 overflow-hidden rounded-[30px] border border-slate-200/70 bg-white/90 shadow-[0_22px_80px_rgba(15,23,42,0.08)] backdrop-blur"
        >
          <div className="h-1.5 bg-gradient-to-r from-indigo-600 via-sky-500 to-emerald-500" />
          <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 py-1.5 pl-1.5 pr-3 text-[11px] font-black uppercase tracking-[0.16em] text-white">
                <span className="h-6 w-6 overflow-hidden rounded-full bg-white">
                  <img src="/ruag-logo.png" alt="RUAG" className="h-full w-full object-cover" />
                </span>
                Centro Analítico
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900 sm:text-5xl">Analítica de Asistencia</h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-500 sm:text-base">
                Dashboard por rango con filtros interactivos, tiempo real, soporte nocturno y exporte de gráficas.
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold text-slate-500">
                <span>Rango: <span className="text-slate-900">{fromKey} al {toKey}</span></span>
                <span>Última carga: <span className="text-slate-900">{generatedAt ? generatedAt.toLocaleString('es-PE') : '—'}</span></span>
                <span className="inline-flex items-center gap-1.5 text-emerald-600"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" /> Tiempo real</span>
              </div>
            </div>

            <div className="analytics-no-print flex flex-wrap gap-3">
              <Link href="/" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <ArrowLeft size={15} /> Volver al Dashboard
              </Link>
              <button onClick={printPage} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <Printer size={15} /> Imprimir
              </button>
              <button onClick={exportChartsToExcel} disabled={exporting} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 disabled:opacity-50">
                {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Exportar gráficas
              </button>
            </div>
          </div>
        </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="analytics-no-print mb-6 rounded-[28px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur"
        >
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1.2fr_0.9fr_1fr_auto]">
            <label className="grid gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Desde</span>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <CalendarRange size={16} className="text-slate-400" />
                <input type="date" value={fromKey} onChange={(e) => setFromKey(e.target.value)} className="w-full bg-transparent font-bold text-slate-700 outline-none" />
              </div>
            </label>

            <label className="grid gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Hasta</span>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <CalendarRange size={16} className="text-slate-400" />
                <input type="date" value={toKey} onChange={(e) => setToKey(e.target.value)} className="w-full bg-transparent font-bold text-slate-700 outline-none" />
              </div>
            </label>

            <label className="grid gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Área</span>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Filter size={16} className="text-slate-400" />
                <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} className="w-full bg-transparent font-bold text-slate-700 outline-none">
                  {areaOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
            </label>

            <label className="grid gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Buscar trabajador</span>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Search size={16} className="text-slate-400" />
                <input value={workerQuery} onChange={(e) => setWorkerQuery(e.target.value)} placeholder="Nombre o DNI" className="w-full bg-transparent font-bold text-slate-700 outline-none placeholder:text-slate-400" />
              </div>
            </label>

            <div className="flex items-end gap-3">
              <button onClick={loadData} className="inline-flex h-[52px] items-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5">
                {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Actualizar
              </button>
            </div>
          </div>
        </motion.section>

        <StatusLegend statuses={statuses} visibleSeries={visibleSeries} onToggle={toggleSeries} />

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-[28px] border border-slate-200/70 bg-white/80">
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <Loader2 className="animate-spin" size={28} />
              <span className="text-sm font-bold">Cargando analítica...</span>
            </div>
          </div>
        ) : (
          <>
            <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
              <KpiCard title="Registros" value={summary.total} subtitle={`${summary.trabajadores} trabajadores visibles`} accent="linear-gradient(90deg,#0f172a,#334155)" icon={<BarChart3 size={18} />} />
              <KpiCard title="Puntuales" value={summary.puntuales} subtitle="Incluye turnos nocturnos" accent={SERIES_CONFIG.puntual.accent} icon={<CheckCircle2 size={18} />} />
              <KpiCard title="Tardanzas" value={summary.tardanzas} subtitle="Serie activa filtrable" accent={SERIES_CONFIG.tardanza.accent} icon={<TrendingDown size={18} />} />
              <KpiCard title="Inasistencias" value={summary.inasistencias} subtitle="Ausencias automáticas" accent={SERIES_CONFIG.inasistencia.accent} icon={<TrendingUp size={18} />} />
              <KpiCard title="Con salida" value={summary.conSalida} subtitle="Marcaciones completas" accent="linear-gradient(90deg,#3B82F6,#60A5FA)" icon={<RefreshCw size={18} />} />
              <KpiCard title="Reingresos" value={summary.reingresos} subtitle="Más de una marca por día" accent="linear-gradient(90deg,#8B5CF6,#C084FC)" icon={<Users size={18} />} />
              <KpiCard title="Nocturnos" value={summary.nocturnos} subtitle="7 PM a 11 PM" accent="linear-gradient(90deg,#0F172A,#1E293B)" icon={<MoonStar size={18} />} />
            </section>

            <section className="mb-6 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
              <ChartCard title="Subida y bajada diaria" subtitle="Línea de tendencia" icon={<TrendingUp size={18} />} chartRef={lineChartRef}>
                <div className="mb-5 flex flex-wrap items-center gap-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
                  <span>Mejor día: <span className="text-emerald-600">{bestDay ? `${formatFullDate(bestDay.fecha)} · ${bestDay.puntuales} puntuales` : '—'}</span></span>
                  <span>Día crítico: <span className="text-orange-600">{criticalDay ? `${formatFullDate(criticalDay.fecha)} · ${criticalDay.inasistencias} inasistencias` : '—'}</span></span>
                  <span>Nocturnos: <span className="text-slate-900">{summary.nocturnos}</span></span>
                </div>
                <LineTrendChart data={trend} visibleSeries={visibleSeries} />
              </ChartCard>

              <ChartCard title="Distribución general" subtitle="Gráfico pastel" icon={<PieChart size={18} />} chartRef={donutChartRef}>
                <DonutChart statuses={statuses} visibleSeries={visibleSeries} onToggle={toggleSeries} />
              </ChartCard>
            </section>

            <section className="mb-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <ChartCard title="Volumen diario por estado" subtitle="Barras apiladas" icon={<BarChart3 size={18} />} chartRef={stackedChartRef}>
                <DailyStackedBars data={trend} visibleSeries={visibleSeries} />
              </ChartCard>

              <ChartCard title="Peso por área" subtitle="Top áreas" icon={<Users size={18} />} chartRef={areasChartRef}>
                <AreaBars data={areaMetrics.slice(0, 8)} total={summary.total} visibleSeries={visibleSeries} />
              </ChartCard>
            </section>

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur"
            >
              <div className="analytics-no-print border-b border-slate-200/70 px-5 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Vista por trabajador</p>
                    <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Puntuales, tardanzas, inasistencias, salida y reingresos</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-bold text-slate-500">Ordenar por</label>
                    <select value={orderBy} onChange={(e) => setOrderBy(e.target.value as any)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-black text-slate-700 outline-none">
                      <option value="puntuales">Puntuales</option>
                      <option value="tardanzas">Tardanzas</option>
                      <option value="inasistencias">Inasistencias</option>
                      <option value="conSalida">Con salida</option>
                      <option value="reingresos">Reingresos</option>
                      <option value="total">Total</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-950 text-white">
                    <tr className="text-left text-[11px] font-black uppercase tracking-[0.14em]">
                      <th className="px-4 py-3">Trabajador</th>
                      <th className="px-4 py-3">Área</th>
                      <th className="px-4 py-3 text-center">P</th>
                      <th className="px-4 py-3 text-center">T</th>
                      <th className="px-4 py-3 text-center">I</th>
                      <th className="px-4 py-3 text-center">Salida</th>
                      <th className="px-4 py-3 text-center">Reingresos</th>
                      <th className="px-4 py-3 text-center">Noct.</th>
                      <th className="px-4 py-3 text-center">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWorkers.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-sm font-bold text-slate-400">No hay trabajadores para el filtro actual.</td>
                      </tr>
                    ) : filteredWorkers.map((worker, index) => (
                      <tr key={worker.dni} className={classNames('border-b border-slate-100', index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60')}>
                        <td className="px-4 py-3">
                          <div className="font-black text-slate-900">{worker.nombre}</div>
                          <div className="text-xs font-bold text-slate-400">{worker.dni}</div>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-600">{worker.area}</td>
                        <td className="px-4 py-3 text-center font-black text-emerald-600 tabular-nums">{worker.puntuales}</td>
                        <td className="px-4 py-3 text-center font-black text-rose-600 tabular-nums">{worker.tardanzas}</td>
                        <td className="px-4 py-3 text-center font-black text-orange-600 tabular-nums">{worker.inasistencias}</td>
                        <td className="px-4 py-3 text-center font-black text-sky-600 tabular-nums">{worker.conSalida}</td>
                        <td className="px-4 py-3 text-center font-black text-violet-600 tabular-nums">{worker.reingresos}</td>
                        <td className="px-4 py-3 text-center font-black text-slate-700 tabular-nums">{worker.nocturnos}</td>
                        <td className="px-4 py-3 text-center font-black text-slate-900 tabular-nums">{worker.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.section>
          </>
        )}
      </div>
    </div>
  )
}

export default function MetricasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,_#f8fbff_0%,_#eef4ff_42%,_#f8fafc_100%)]">
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="animate-spin" size={28} />
            <span className="text-sm font-bold">Cargando analítica...</span>
          </div>
        </div>
      }
    >
      <MetricasPageContent />
    </Suspense>
  )
}
