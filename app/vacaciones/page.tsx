'use client'

import * as XLSX from 'xlsx-js-style'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Search,
  X,
  XCircle,
} from 'lucide-react'
import { Toaster, toast } from 'sonner'

import { supabase } from '@/utils/supabase/client'

type Balance = {
  id: string
  dni: string
  trabajador_nombre: string
  area: string | null
  cargo: string | null
  codigo_excel: string | null
  periodo: number
  saldo_arrastre: number
  gozados_ene: number
  gozados_feb: number
  gozados_mar: number
  gozados_abr: number
  gozados_may: number
  gozados_jun: number
  gozados_jul: number
  gozados_ago: number
  gozados_set: number
  gozados_oct: number
  gozados_nov: number
  gozados_dic: number
  total_gozados: number
  dias_pendientes: number
  fecha_vencimiento: string | null
  vacaciones_por_vencer?: number | null
  vacaciones_pendientes_periodo?: number | null
}

type RequestRow = {
  id: string
  dni: string
  trabajador_nombre: string
  area: string | null
  fecha_inicio: string
  fecha_fin: string
  dias_solicitados: number
  comentario: string | null
  estado: string
  created_at: string
}

type MonthCol = {
  key: keyof Balance
  label: string
  monthIndex: number
}

type MonthDetail = {
  row: Balance
  col: MonthCol
  imported: number
  approved: number
  requests: RequestRow[]
}

const months: MonthCol[] = [
  { key: 'gozados_ene', label: 'ENE', monthIndex: 0 },
  { key: 'gozados_feb', label: 'FEB', monthIndex: 1 },
  { key: 'gozados_mar', label: 'MAR', monthIndex: 2 },
  { key: 'gozados_abr', label: 'ABR', monthIndex: 3 },
  { key: 'gozados_may', label: 'MAY', monthIndex: 4 },
  { key: 'gozados_jun', label: 'JUN', monthIndex: 5 },
  { key: 'gozados_jul', label: 'JUL', monthIndex: 6 },
  { key: 'gozados_ago', label: 'AGO', monthIndex: 7 },
  { key: 'gozados_set', label: 'SET', monthIndex: 8 },
  { key: 'gozados_oct', label: 'OCT', monthIndex: 9 },
  { key: 'gozados_nov', label: 'NOV', monthIndex: 10 },
  { key: 'gozados_dic', label: 'DIC', monthIndex: 11 },
]

const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const asDate = (value: string) => new Date(value.includes('T') ? value : `${value}T12:00:00`)
const shortDate = (value: string | null) => (value ? format(asDate(value), 'dd/MM/yy', { locale: es }) : '--')
const longDate = (value: string) => format(asDate(value), 'dd MMM yyyy', { locale: es })
const dateTime = (value: string) => format(asDate(value), 'dd MMM yyyy - HH:mm', { locale: es })
const overlapsYear = (item: RequestRow, year: number) => asDate(item.fecha_inicio) <= new Date(Date.UTC(year, 11, 31, 12)) && asDate(item.fecha_fin) >= new Date(Date.UTC(year, 0, 1, 12))
const overlapsMonth = (item: RequestRow, year: number, month: number) => asDate(item.fecha_inicio) <= new Date(Date.UTC(year, month + 1, 0, 12)) && asDate(item.fecha_fin) >= new Date(Date.UTC(year, month, 1, 12))
function overlapDaysInMonth(item: RequestRow, year: number, month: number) {
  const start = asDate(item.fecha_inicio)
  const end = asDate(item.fecha_fin)
  const monthStart = new Date(Date.UTC(year, month, 1, 12))
  const monthEnd = new Date(Date.UTC(year, month + 1, 0, 12))
  const overlapStart = start > monthStart ? start : monthStart
  const overlapEnd = end < monthEnd ? end : monthEnd
  if (overlapStart > overlapEnd) return 0
  return Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1
}

const prevStatus = (estado: string) =>
  estado === 'aprobada'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
    : estado === 'cancelada'
      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
      : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'

function MonthModal({ detail, onClose }: { detail: MonthDetail | null; onClose: () => void }) {
  if (!detail) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Detalle {detail.col.label} {detail.row.periodo}</p>
            <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">{detail.row.trabajador_nombre}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{detail.row.area || 'SIN AREA'} - {detail.row.cargo || 'SIN CARGO'}</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 p-2 dark:border-slate-700"><X size={16} /></button>
        </div>
        <div className="grid gap-3 border-b border-slate-200 p-5 sm:grid-cols-3 dark:border-slate-800">
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950"><p className="text-[10px] font-black uppercase text-slate-400">Importado</p><p className="mt-2 text-2xl font-black">{detail.imported}</p></div>
          <div className="rounded-2xl bg-blue-50 p-4 dark:bg-blue-500/10"><p className="text-[10px] font-black uppercase text-blue-500">Aprobado</p><p className="mt-2 text-2xl font-black text-blue-700 dark:text-blue-300">{detail.approved}</p></div>
          <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10"><p className="text-[10px] font-black uppercase text-emerald-500">Visible</p><p className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300">{detail.imported + detail.approved}</p></div>
        </div>
        <div className="max-h-[420px] space-y-3 overflow-y-auto p-5">
          {detail.requests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">No hay solicitudes en este mes.</div>
          ) : detail.requests.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{longDate(item.fecha_inicio)} al {longDate(item.fecha_fin)}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pedido: {item.dias_solicitados} dias - En este mes: {overlapDaysInMonth(item, detail.row.periodo, detail.col.monthIndex)} dias</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${prevStatus(item.estado)}`}>{item.estado}</span>
              </div>
              {item.comentario && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">{item.comentario}</p>}
              <p className="mt-3 text-[11px] text-slate-400">Registrada: {dateTime(item.created_at)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function VacacionesPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [balances, setBalances] = useState<Balance[]>([])
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('TODAS')
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MonthDetail | null>(null)
  const currentYear = new Date().getFullYear()
  const requestedYear = Number(searchParams.get('year') || 0) || null

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [balancesRes, requestsRes] = await Promise.all([
      supabase.from('vacaciones_saldos').select('*').order('periodo', { ascending: false }).order('area').order('trabajador_nombre'),
      supabase.from('vacaciones_solicitudes').select('*').order('created_at', { ascending: false }),
    ])
    if (balancesRes.error) toast.error(balancesRes.error.message)
    if (requestsRes.error) toast.error(requestsRes.error.message)
    setBalances((balancesRes.data ?? []) as Balance[])
    setRequests((requestsRes.data ?? []) as RequestRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    setMounted(true)
    void fetchAll()
    const channel = supabase
      .channel('vacaciones-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vacaciones_saldos' }, () => void fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vacaciones_solicitudes' }, () => void fetchAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchAll])

  const years = useMemo(() => Array.from(new Set(balances.map((row) => num(row.periodo)))).filter(Boolean).sort((a, b) => b - a), [balances])
  const activeYear = requestedYear && years.includes(requestedYear) ? requestedYear : (years[0] ?? currentYear)
  const balancesYear = useMemo(() => balances.filter((row) => num(row.periodo) === activeYear), [balances, activeYear])
  const requestsYear = useMemo(() => requests.filter((row) => overlapsYear(row, activeYear)), [requests, activeYear])
  const areas = useMemo(() => ['TODAS', ...Array.from(new Set(balancesYear.map((row) => row.area).filter(Boolean) as string[])).sort()], [balancesYear])
  const filtered = useMemo(() => balancesYear.filter((row) => {
    const q = query.trim().toLowerCase()
    return (!q || row.trabajador_nombre.toLowerCase().includes(q) || row.dni.includes(q) || (row.cargo || '').toLowerCase().includes(q))
      && (area === 'TODAS' || row.area === area)
  }), [balancesYear, query, area])

  const grouped = useMemo(() => filtered.reduce<Record<string, Balance[]>>((acc, row) => {
    const key = row.area || 'SIN AREA'
    if (!acc[key]) acc[key] = []
    acc[key].push(row)
    return acc
  }, {}), [filtered])

  const getMonthRequests = useCallback((dni: string, year: number, monthIndex: number) => requestsYear.filter((row) => row.dni === dni && overlapsMonth(row, year, monthIndex)), [requestsYear])
  const getMonthView = useCallback((row: Balance, col: MonthCol) => {
    const imported = num(row[col.key])
    const monthRequests = getMonthRequests(row.dni, row.periodo, col.monthIndex)
    const approved = monthRequests.filter((item) => item.estado === 'aprobada').reduce((sum, item) => sum + overlapDaysInMonth(item, row.periodo, col.monthIndex), 0)
    return { imported, approved, total: imported + approved, requests: monthRequests }
  }, [getMonthRequests])

  const derived = useCallback((row: Balance) => {
    const approvedDays = requestsYear.filter((item) => item.dni === row.dni && item.estado === 'aprobada').reduce((sum, item) => sum + num(item.dias_solicitados), 0)
    const pendientesPrev = num(row.dias_pendientes) - approvedDays
    const porVencer = row.vacaciones_por_vencer != null ? num(row.vacaciones_por_vencer) : (row.fecha_vencimiento ? 30 : 0)
    const pendientesPeriodo = (row.vacaciones_pendientes_periodo != null ? num(row.vacaciones_pendientes_periodo) : (num(row.dias_pendientes) + porVencer)) - approvedDays
    return { approvedDays, pendientesPrev, pendientesPeriodo, gozados: num(row.total_gozados) + approvedDays, porVencer }
  }, [requestsYear])

  const exportExcel = useCallback(() => {
    if (!balancesYear.length) return toast.error('No hay datos para exportar')
    setExporting(true)
    try {
      const rows: Array<Array<string | number>> = [['', 'REPORTE DE VACACIONES'], ['', 'EMPLEADOS', '', `SALDOS DE DIAS POR GOZAR ${activeYear - 1}`, 'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SET', 'OCT', 'NOV', 'DIC', 'Total dias gozados', `PENDIENTES POR GOZAR ${activeYear - 1}`, `FECHAS DE VENCIMIENTO ${activeYear}`, `VACACIONES POR VENCER ${activeYear}`, `Vacaciones Pendientes por gozar ${activeYear}`]]
      Object.entries(grouped).forEach(([groupName, rowsByArea]) => {
        rows.push(['', groupName])
        rowsByArea.forEach((row) => {
          const d = derived(row)
          rows.push([row.codigo_excel || '', row.trabajador_nombre, row.cargo || '', num(row.saldo_arrastre), ...months.map((col) => getMonthView(row, col).total), d.gozados, d.pendientesPrev, row.fecha_vencimiento ? shortDate(row.fecha_vencimiento) : '', d.porVencer, d.pendientesPeriodo])
        })
      })
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!merges'] = [{ s: { r: 0, c: 1 }, e: { r: 0, c: 20 } }]
      ws['!cols'] = [{ wpx: 52 }, { wpx: 240 }, { wpx: 170 }, { wpx: 90 }, ...months.map(() => ({ wpx: 54 })), { wpx: 92 }, { wpx: 110 }, { wpx: 120 }, { wpx: 110 }, { wpx: 145 }]
      for (let c = 1; c <= 20; c++) ws[XLSX.utils.encode_cell({ r: 0, c })] && (ws[XLSX.utils.encode_cell({ r: 0, c })].s = { font: { bold: true, sz: 16 }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: 'E5EEF9' } } })
      for (let c = 0; c <= 20; c++) ws[XLSX.utils.encode_cell({ r: 1, c })] && (ws[XLSX.utils.encode_cell({ r: 1, c })].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, fill: { fgColor: { rgb: '0F172A' } } })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, `vacaciones ${activeYear}`)
      XLSX.writeFile(wb, `vacaciones_${activeYear}_ruag.xlsx`)
      toast.success(`Excel ${activeYear} descargado`)
    } finally {
      setExporting(false)
    }
  }, [activeYear, balancesYear, derived, getMonthView, grouped])

  const resolveRequest = useCallback(async (row: RequestRow, estado: 'aprobada' | 'cancelada') => {
    setResolvingId(row.id)
    const { error } = await supabase.from('vacaciones_solicitudes').update({ estado }).eq('id', row.id)
    setResolvingId(null)
    if (error) toast.error(error.message)
    else toast.success(estado === 'aprobada' ? `Vacaciones aprobadas para ${row.trabajador_nombre}` : `Vacaciones rechazadas para ${row.trabajador_nombre}`)
  }, [])

  if (!mounted) return <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950"><Loader2 className="animate-spin text-blue-600" size={28} /></div>

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-white sm:px-6 lg:px-8">
      <Toaster position="top-center" richColors />
      <MonthModal detail={detail} onClose={() => setDetail(null)} />
      <div className="mx-auto max-w-[1800px] space-y-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-4">
              <Link href="/" className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"><ArrowLeft size={18} /></Link>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-500">RUAG</p>
                <h1 className="text-3xl font-black tracking-tight">Vacaciones {activeYear}</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Vista basada en la hoja anual y preparada para archivo por periodo.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/vacaciones/historico" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black dark:border-slate-700 dark:bg-slate-900"><Archive size={14} /> HISTORICO</Link>
              <button onClick={() => void fetchAll()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black dark:border-slate-700 dark:bg-slate-900"><RefreshCw size={14} /> ACTUALIZAR</button>
              <button onClick={exportExcel} disabled={exporting || !balancesYear.length} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} EXPORTAR</button>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {Array.from(new Set([currentYear, ...years])).sort((a, b) => b - a).map((year) => (
              <button key={year} onClick={() => router.push(year === currentYear ? '/vacaciones' : `/vacaciones?year=${year}`)} className={`rounded-full px-3 py-1.5 text-[11px] font-black tracking-[0.14em] ${year === activeYear ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}>{year < (years[0] ?? currentYear) ? `ARCHIVO ${year}` : year}</button>
            ))}
          </div>
        </header>
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, cargo o DNI..." className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-medium outline-none dark:border-slate-700 dark:bg-slate-950" />
            </div>
            <select value={area} onChange={(e) => setArea(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black dark:border-slate-700 dark:bg-slate-950">
              {areas.map((item) => <option key={item} value={item}>{item === 'TODAS' ? 'Todas las areas' : item}</option>)}
            </select>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Control estilo Excel</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Incluye "Vacaciones Pendientes por gozar {activeYear}" y detalle por mes.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">{filtered.length} filas</span>
            </div>
            {loading ? (
              <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={26} /></div>
            ) : !filtered.length ? (
              <div className="flex min-h-[420px] items-center justify-center px-6 text-center text-sm text-slate-400">No hay saldos de vacaciones para mostrar.</div>
            ) : (
              <div className="max-h-[72vh] overflow-y-auto">
                <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
                  <colgroup>
                    <col className="w-[3%]" /><col className="w-[14%]" /><col className="w-[9%]" /><col className="w-[5%]" />
                    {months.map((col) => <col key={col.key} className="w-[3.4%]" />)}
                    <col className="w-[5%]" /><col className="w-[6%]" /><col className="w-[7%]" /><col className="w-[5%]" /><col className="w-[8%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                    <tr>
                      <th className="px-1.5 py-3">#</th><th className="px-1.5 py-3 text-left">EMPLEADOS</th><th className="px-1.5 py-3 text-left">CARGO</th><th className="px-1.5 py-3">{activeYear - 1}</th>
                      {months.map((col) => <th key={col.key} className="px-1 py-3">{col.label}</th>)}
                      <th className="px-1.5 py-3">GOZADOS</th><th className="px-1.5 py-3">PEND. {activeYear - 1}</th><th className="px-1.5 py-3">VENCE</th><th className="px-1.5 py-3">POR VENCER</th><th className="px-1.5 py-3">PEND. {activeYear}</th>
                    </tr>
                  </thead>
                  {Object.entries(grouped).map(([groupName, rows]) => (
                    <tbody key={groupName}>
                      <tr className="border-y border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950"><td colSpan={21} className="px-4 py-2 text-[11px] font-black tracking-[0.14em] text-slate-600 dark:text-slate-300">{groupName}</td></tr>
                      {rows.map((row) => {
                        const d = derived(row)
                        return (
                          <tr key={row.id} className="border-b border-slate-200 align-top dark:border-slate-800">
                            <td className="px-1.5 py-3 text-center font-black text-slate-500">{row.codigo_excel || '-'}</td>
                            <td className="px-1.5 py-3"><p className="line-clamp-2 font-black">{row.trabajador_nombre}</p><p className="mt-1 font-mono text-[9px] text-slate-400">{row.dni}</p></td>
                            <td className="px-1.5 py-3 text-slate-600 dark:text-slate-300"><span className="line-clamp-2 block">{row.cargo || '--'}</span></td>
                            <td className="px-1.5 py-3 text-center font-black">{num(row.saldo_arrastre)}</td>
                            {months.map((col) => {
                              const view = getMonthView(row, col)
                              return <td key={col.key} className="px-0.5 py-2"><button onClick={() => setDetail({ row, col, imported: view.imported, approved: view.approved, requests: view.requests })} className={`w-full rounded-lg px-0.5 py-1 font-black ${view.total > 0 || view.requests.length ? 'bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-blue-500/20 dark:hover:text-blue-200' : 'text-slate-300 hover:bg-slate-100 dark:text-slate-700 dark:hover:bg-slate-800'}`}>{view.total}</button></td>
                            })}
                            <td className="px-1.5 py-3 text-center font-black text-blue-600 dark:text-blue-300">{d.gozados}</td>
                            <td className="px-1.5 py-3 text-center font-black">{d.pendientesPrev}</td>
                            <td className="px-1.5 py-3 text-center font-black text-slate-500 dark:text-slate-300">{shortDate(row.fecha_vencimiento)}</td>
                            <td className="px-1.5 py-3 text-center font-black text-amber-600 dark:text-amber-300">{d.porVencer}</td>
                            <td className="px-1.5 py-3 text-center font-black text-emerald-600 dark:text-emerald-300">{d.pendientesPeriodo}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  ))}
                </table>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Solicitudes en tiempo real</p></div>
              <div className="max-h-[520px] space-y-3 overflow-y-auto p-4">
                {requestsYear.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">Aun no hay solicitudes de vacaciones.</div>
                ) : requestsYear.slice(0, 12).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-black">{item.trabajador_nombre}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{longDate(item.fecha_inicio)} al {longDate(item.fecha_fin)}</p></div>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${prevStatus(item.estado)}`}>{item.estado}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400"><span>{item.dias_solicitados} dias</span><span>-</span><span>{item.area || 'SIN AREA'}</span></div>
                    {item.comentario && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">{item.comentario}</p>}
                    <p className="mt-3 text-[11px] text-slate-400">Registrada: {dateTime(item.created_at)}</p>
                    {item.estado === 'solicitada' && (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <button onClick={() => void resolveRequest(item, 'aprobada')} disabled={resolvingId === item.id} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{resolvingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} APROBAR</button>
                        <button onClick={() => void resolveRequest(item, 'cancelada')} disabled={resolvingId === item.id} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{resolvingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} RECHAZAR</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default function VacacionesPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950"><Loader2 className="animate-spin text-blue-600" size={28} /></div>}>
      <VacacionesPageContent />
    </Suspense>
  )
}
