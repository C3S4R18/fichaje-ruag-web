'use client'

import Link from 'next/link'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowLeft, CalendarDays, CheckCircle2, Clock3, Loader2,
  MoonStar, PlaneTakeoff, RefreshCw, Search, Sun, Wallet, AlertTriangle, XCircle
} from 'lucide-react'
import { Toaster, toast } from 'sonner'

type VacationBalance = {
  id: string
  dni: string
  trabajador_nombre: string
  area: string | null
  cargo: string | null
  codigo_excel: string | null
  periodo: number
  saldo_arrastre: number
  dias_extra: number
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
  fecha_vencimiento: string
  renovaciones_aplicadas: number
}

type VacationRequest = {
  id: string
  dni: string
  trabajador_nombre: string
  area: string | null
  fecha_inicio: string
  fecha_fin: string
  dias_solicitados: number
  comentario: string | null
  estado: string
  saldo_antes: number | null
  saldo_despues: number | null
  created_at: string
}

type MonthColumn = {
  key: keyof VacationBalance
  label: string
  monthIndex: number
}

type MonthDetail = {
  row: VacationBalance
  column: MonthColumn
  importedValue: number
  autoApprovedValue: number
  requests: VacationRequest[]
}

type DerivedBalance = {
  approvedDays: number
  effectivePendientes: number
  effectiveGozados: number
}

const monthColumns: MonthColumn[] = [
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

function asDate(value: string) {
  return new Date(value.includes('T') ? value : `${value}T12:00:00`)
}

function formatDate(value: string) {
  return format(asDate(value), 'dd MMM yyyy', { locale: es })
}

function formatDateTime(value: string) {
  return format(asDate(value), 'dd MMM yyyy · HH:mm', { locale: es })
}

function num(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function overlapsMonth(item: VacationRequest, year: number, monthIndex: number) {
  const monthStart = new Date(Date.UTC(year, monthIndex, 1, 12))
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0, 12))
  const start = asDate(item.fecha_inicio)
  const end = asDate(item.fecha_fin)
  return start <= monthEnd && end >= monthStart
}

function overlapDaysInMonth(item: VacationRequest, year: number, monthIndex: number) {
  const monthStart = new Date(Date.UTC(year, monthIndex, 1, 12))
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0, 12))
  const start = asDate(item.fecha_inicio)
  const end = asDate(item.fecha_fin)
  const overlapStart = start > monthStart ? start : monthStart
  const overlapEnd = end < monthEnd ? end : monthEnd
  if (overlapStart > overlapEnd) return 0
  return Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1
}

function ThemeButton({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-black text-slate-600 dark:text-slate-300 shadow-sm transition-all hover:-translate-y-0.5"
    >
      {isDark ? <Sun size={14} /> : <MoonStar size={14} />}
      {isDark ? 'CLARO' : 'OSCURO'}
    </button>
  )
}

function StatCard({
  title,
  value,
  accent,
  icon,
  sub,
}: {
  title: string
  value: number | string
  accent: string
  icon: ReactNode
  sub?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{title}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white tabular-nums">{value}</p>
          {sub && <p className="mt-1 text-[11px] font-medium text-slate-400">{sub}</p>}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl text-white ${accent}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

export default function VacacionesPage() {
  const [mounted, setMounted] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saldos, setSaldos] = useState<VacationBalance[]>([])
  const [solicitudes, setSolicitudes] = useState<VacationRequest[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroArea, setFiltroArea] = useState('TODAS')
  const [error, setError] = useState<string | null>(null)
  const [resolviendoId, setResolviendoId] = useState<string | null>(null)
  const [monthDetail, setMonthDetail] = useState<MonthDetail | null>(null)

  useEffect(() => {
    setMounted(true)
    const dark = localStorage.getItem('ruag_theme') === 'dark'
    setIsDark(dark)
    document.documentElement.classList.toggle('dark', dark)
  }, [])

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev
      document.documentElement.classList.toggle('dark', next)
      localStorage.setItem('ruag_theme', next ? 'dark' : 'light')
      return next
    })
  }

  const fetchVacaciones = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      try {
        await supabase.rpc('procesar_vencimientos_vacaciones').throwOnError()
      } catch {
        // El refresco de vencimientos es opcional; si la función no existe aún,
        // seguimos intentando mostrar los datos disponibles.
      }

      const [saldosRes, solicitudesRes] = await Promise.all([
        supabase
          .from('vacaciones_saldos')
          .select('*')
          .order('area', { ascending: true })
          .order('trabajador_nombre', { ascending: true }),
        supabase
          .from('vacaciones_solicitudes')
          .select('*')
          .order('created_at', { ascending: false })
      ])

      if (saldosRes.error) throw saldosRes.error
      if (solicitudesRes.error) throw solicitudesRes.error

      setSaldos((saldosRes.data ?? []) as VacationBalance[])
      setSolicitudes((solicitudesRes.data ?? []) as VacationRequest[])
    } catch (err: any) {
      const message = err?.message || 'No se pudieron cargar las vacaciones'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!mounted) return

    void fetchVacaciones()

    const channel = supabase
      .channel('vacaciones-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vacaciones_saldos' }, () => {
        void fetchVacaciones()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vacaciones_solicitudes' }, () => {
        void fetchVacaciones()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [mounted, fetchVacaciones])

  const resolverSolicitud = useCallback(
    async (item: VacationRequest, nextEstado: 'aprobada' | 'cancelada') => {
      setResolviendoId(item.id)
      try {
        const { error } = await supabase
          .from('vacaciones_solicitudes')
          .update({ estado: nextEstado })
          .eq('id', item.id)

        if (error) throw error

        toast.success(
          nextEstado === 'aprobada'
            ? `Vacaciones aprobadas para ${item.trabajador_nombre}`
            : `Vacaciones rechazadas para ${item.trabajador_nombre}`
        )

        void fetchVacaciones()
      } catch (err: any) {
        toast.error(err?.message || 'No se pudo actualizar la solicitud')
      } finally {
        setResolviendoId((current) => (current === item.id ? null : current))
      }
    },
    [fetchVacaciones]
  )

  const areas = useMemo(
    () => ['TODAS', ...Array.from(new Set(saldos.map((row) => row.area).filter(Boolean) as string[])).sort()],
    [saldos]
  )

  const saldosFiltrados = useMemo(() => {
    const query = busqueda.trim().toLowerCase()
    return saldos.filter((row) => {
      const matchText =
        !query ||
        row.trabajador_nombre.toLowerCase().includes(query) ||
        row.dni.includes(query) ||
        (row.cargo ?? '').toLowerCase().includes(query)

      const matchArea = filtroArea === 'TODAS' || row.area === filtroArea
      return matchText && matchArea
    })
  }, [saldos, busqueda, filtroArea])

  const groupedByArea = useMemo(() => {
    return saldosFiltrados.reduce<Record<string, VacationBalance[]>>((acc, row) => {
      const key = row.area || 'SIN ÁREA'
      if (!acc[key]) acc[key] = []
      acc[key].push(row)
      return acc
    }, {})
  }, [saldosFiltrados])

  const getMonthRequests = useCallback(
    (dni: string, year: number, monthIndex: number) =>
      solicitudes.filter((item) => item.dni === dni && overlapsMonth(item, year, monthIndex)),
    [solicitudes]
  )

  const getMonthDisplay = useCallback(
    (row: VacationBalance, column: MonthColumn) => {
      const importedValue = num(row[column.key])
      const requests = getMonthRequests(row.dni, row.periodo, column.monthIndex)
      const autoApprovedValue = requests
        .filter((item) => item.estado === 'aprobada')
        .reduce((sum, item) => sum + overlapDaysInMonth(item, row.periodo, column.monthIndex), 0)

      return {
        importedValue,
        autoApprovedValue,
        totalValue: importedValue + autoApprovedValue,
        requests,
      }
    },
    [getMonthRequests]
  )

  const getDerivedBalance = useCallback(
    (row: VacationBalance): DerivedBalance => {
      const approvedDays = solicitudes
        .filter((item) => item.dni === row.dni && item.estado === 'aprobada')
        .reduce((sum, item) => sum + num(item.dias_solicitados), 0)

      return {
        approvedDays,
        effectivePendientes: num(row.dias_pendientes) - approvedDays,
        effectiveGozados: num(row.total_gozados) + approvedDays,
      }
    },
    [solicitudes]
  )

  const totalPendientes = useMemo(
    () => saldosFiltrados.reduce((sum, row) => sum + getDerivedBalance(row).effectivePendientes, 0),
    [saldosFiltrados, getDerivedBalance]
  )

  const totalGozados = useMemo(
    () => saldosFiltrados.reduce((sum, row) => sum + getDerivedBalance(row).effectiveGozados, 0),
    [saldosFiltrados, getDerivedBalance]
  )

  const totalRenovados = useMemo(
    () => saldosFiltrados.reduce((sum, row) => sum + num(row.dias_extra), 0),
    [saldosFiltrados]
  )

  const proximosVencer = useMemo(() => {
    const today = new Date()
    return saldosFiltrados.filter((row) => {
      const diff = Math.ceil((asDate(row.fecha_vencimiento).getTime() - today.getTime()) / 86400000)
      return diff >= 0 && diff <= 30
    }).length
  }, [saldosFiltrados])

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="animate-spin text-blue-600" size={28} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <Toaster position="top-center" richColors />

      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1700px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-500">RUAG</p>
              <h1 className="text-xl font-black tracking-tight">Vacaciones 2026</h1>
              <p className="text-xs font-medium text-slate-400">Vista operativa basada en la hoja “vacaciones 2026”</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                void fetchVacaciones()
                toast.success('Vacaciones actualizadas')
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-black text-slate-600 dark:text-slate-300 shadow-sm transition-all hover:-translate-y-0.5"
            >
              <RefreshCw size={14} />
              ACTUALIZAR
            </button>
            <ThemeButton isDark={isDark} onToggle={toggleTheme} />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1700px] flex-col gap-5 px-4 py-6 sm:px-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Trabajadores" value={saldosFiltrados.length} accent="bg-blue-600" icon={<CalendarDays size={18} />} />
          <StatCard title="Pendientes" value={totalPendientes} accent="bg-emerald-600" icon={<Wallet size={18} />} sub="días disponibles" />
          <StatCard title="Gozados" value={totalGozados} accent="bg-indigo-600" icon={<PlaneTakeoff size={18} />} sub="consumidos en 2026" />
          <StatCard title="Vencen pronto" value={proximosVencer} accent="bg-amber-500" icon={<AlertTriangle size={18} />} sub="+30 días al vencer" />
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, cargo o DNI..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-10 py-2.5 text-sm font-medium outline-none transition-all focus:border-blue-500"
              />
            </div>
            <select
              value={filtroArea}
              onChange={(e) => setFiltroArea(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm font-bold outline-none transition-all focus:border-blue-500"
            >
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area === 'TODAS' ? 'Todas las áreas' : area}
                </option>
              ))}
            </select>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3">
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Control estilo Excel</h2>
            </div>

            {loading ? (
              <div className="flex min-h-[400px] items-center justify-center">
                <Loader2 className="animate-spin text-blue-600" size={28} />
              </div>
            ) : saldosFiltrados.length === 0 ? (
              <div className="flex min-h-[280px] items-center justify-center px-6 text-center text-sm font-semibold text-slate-400">
                No hay saldos de vacaciones para mostrar.
              </div>
            ) : (
              <div className="space-y-5 p-4">
                {Object.entries(groupedByArea).map(([area, rows]) => (
                  <div key={area} className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                    <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3">
                      <p className="text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">{area}</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-[1300px] w-full text-sm">
                        <thead className="bg-slate-900 text-white">
                          <tr>
                            <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-[0.12em]">Empleado</th>
                            <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-[0.12em]">Cargo</th>
                            <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-[0.12em]">Saldo 2025</th>
                            {monthColumns.map((column) => (
                              <th key={column.key} className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-[0.12em]">
                                {column.label}
                              </th>
                            ))}
                            <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-[0.12em]">Gozados</th>
                            <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-[0.12em]">Extra</th>
                            <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-[0.12em]">Pendientes</th>
                            <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-[0.12em]">Vence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => {
                            const derived = getDerivedBalance(row)
                            const venceEn = Math.ceil((asDate(row.fecha_vencimiento).getTime() - Date.now()) / 86400000)
                            const vencimientoClass =
                              venceEn < 0
                                ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
                                : venceEn <= 30
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                                  : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300'

                            return (
                              <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                                <td className="px-3 py-3 align-top">
                                  <div className="min-w-[220px]">
                                    <p className="font-black uppercase tracking-tight text-slate-800 dark:text-slate-100">
                                      {row.trabajador_nombre}
                                    </p>
                                    <p className="mt-1 text-[11px] font-medium text-slate-400">{row.dni}</p>
                                  </div>
                                </td>
                                <td className="px-3 py-3 align-top text-slate-600 dark:text-slate-300">{row.cargo || '—'}</td>
                                <td className="px-3 py-3 text-center font-black tabular-nums">{num(row.saldo_arrastre)}</td>
                                {monthColumns.map((column) => {
                                  const monthData = getMonthDisplay(row, column)
                                  const isInteractive = monthData.requests.length > 0
                                  const hasAutoApproved = monthData.autoApprovedValue > 0

                                  return (
                                    <td key={column.key} className="px-2 py-2 text-center">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setMonthDetail({
                                            row,
                                            column,
                                            importedValue: monthData.importedValue,
                                            autoApprovedValue: monthData.autoApprovedValue,
                                            requests: monthData.requests,
                                          })
                                        }
                                        className={`w-full rounded-xl px-2 py-2 text-center font-black tabular-nums transition-all ${
                                          isInteractive || hasAutoApproved
                                            ? 'bg-sky-50 text-sky-700 hover:-translate-y-0.5 dark:bg-sky-500/10 dark:text-sky-300'
                                            : 'text-slate-600 dark:text-slate-300'
                                        }`}
                                      >
                                        {monthData.totalValue || '—'}
                                      </button>
                                    </td>
                                  )
                                })}
                                <td className="px-3 py-3 text-center font-black tabular-nums text-indigo-600 dark:text-indigo-300">{derived.effectiveGozados}</td>
                                <td className="px-3 py-3 text-center font-black tabular-nums text-sky-600 dark:text-sky-300">{num(row.dias_extra)}</td>
                                <td className="px-3 py-3 text-center font-black tabular-nums text-emerald-600 dark:text-emerald-300">{derived.effectivePendientes}</td>
                                <td className="px-3 py-3 text-center">
                                  <span className={`inline-flex rounded-lg px-2 py-1 text-[11px] font-black ${vencimientoClass}`}>
                                    {formatDate(row.fecha_vencimiento)}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3">
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Solicitudes en tiempo real</h2>
            </div>

            <div className="max-h-[960px] overflow-y-auto p-4 space-y-3">
              {solicitudes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 px-4 py-10 text-center text-sm font-semibold text-slate-400">
                  Aún no hay solicitudes de vacaciones.
                </div>
              ) : (
                solicitudes.map((item) => {
                  const isResolving = resolviendoId === item.id
                  const statusLabel =
                    item.estado === 'cancelada' ? 'rechazada' : item.estado === 'solicitada' ? 'pendiente' : item.estado
                  const statusClass =
                    item.estado === 'cancelada'
                      ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
                      : item.estado === 'aprobada'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'

                  return (
                    <div key={item.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black uppercase tracking-tight text-slate-800 dark:text-slate-100">
                            {item.trabajador_nombre}
                          </p>
                          <p className="mt-1 text-[11px] font-medium text-slate-400">{item.area || 'Sin área'}</p>
                        </div>
                        <span className={`inline-flex shrink-0 rounded-lg px-2 py-1 text-[10px] font-black uppercase ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-950 px-3 py-2">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Desde</p>
                          <p className="mt-1 font-bold text-slate-700 dark:text-slate-200">{formatDate(item.fecha_inicio)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-950 px-3 py-2">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Hasta</p>
                          <p className="mt-1 font-bold text-slate-700 dark:text-slate-200">{formatDate(item.fecha_fin)}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2">
                        <div className="flex items-center gap-2 text-sm font-black text-indigo-600 dark:text-indigo-300">
                          <PlaneTakeoff size={15} />
                          {num(item.dias_solicitados)} día(s)
                        </div>
                        <div className="text-right text-[11px] font-semibold text-slate-400">
                          {item.saldo_antes != null && item.saldo_despues != null ? `${item.saldo_antes} → ${item.saldo_despues}` : 'Sin saldo'}
                        </div>
                      </div>

                      {item.comentario && (
                        <p className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                          {item.comentario}
                        </p>
                      )}

                      {item.estado === 'solicitada' && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            onClick={() => void resolverSolicitud(item, 'aprobada')}
                            disabled={isResolving}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isResolving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            ACEPTAR
                          </button>
                          <button
                            onClick={() => void resolverSolicitud(item, 'cancelada')}
                            disabled={isResolving}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isResolving ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                            RECHAZAR
                          </button>
                        </div>
                      )}

                      <div className="mt-3 flex items-center gap-2 text-[11px] font-medium text-slate-400">
                        <Clock3 size={13} />
                        {formatDateTime(item.created_at)}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </aside>
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-950 px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
              <CheckCircle2 size={14} className="text-emerald-500" />
              El dashboard escucha `vacaciones_saldos` y `vacaciones_solicitudes` en tiempo real.
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-950 px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
              <Wallet size={14} className="text-sky-500" />
              Cuando una solicitud queda aprobada, pendientes y gozados se recalculan al instante.
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-950 px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
              <CalendarDays size={14} className="text-amber-500" />
              La fecha de vence sale de la hoja 2026; cuando llega ese día se suman 30 días y se mueve la próxima fecha.
            </div>
          </div>
        </section>
      </main>

      {monthDetail && (
        <MonthRequestsModal
          detail={monthDetail}
          onClose={() => setMonthDetail(null)}
        />
      )}
    </div>
  )
}

function MonthRequestsModal({
  detail,
  onClose,
}: {
  detail: MonthDetail
  onClose: () => void
}) {
  const { row, column, requests, importedValue, autoApprovedValue } = detail

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-500">{column.label} {row.periodo}</p>
              <h3 className="mt-1 text-lg font-black tracking-tight text-slate-900 dark:text-white">{row.trabajador_nombre}</h3>
              <p className="mt-1 text-xs font-medium text-slate-400">{row.area || 'Sin área'} · {row.cargo || 'Sin cargo'}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-500 transition-all hover:-translate-y-0.5 dark:border-slate-700 dark:text-slate-300"
            >
              CERRAR
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Base Excel</p>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{importedValue}</p>
          </div>
          <div className="rounded-2xl bg-sky-50 px-4 py-3 dark:bg-sky-500/10">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-sky-500">Aprobadas sistema</p>
            <p className="mt-2 text-2xl font-black text-sky-700 dark:text-sky-300">+{autoApprovedValue}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 dark:bg-emerald-500/10">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-500">Total mostrado</p>
            <p className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300">{importedValue + autoApprovedValue}</p>
          </div>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4">
          {requests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm font-semibold text-slate-400 dark:border-slate-700">
              No hay solicitudes registradas en el sistema para este mes.
            </div>
          ) : (
            requests.map((item) => {
              const statusLabel =
                item.estado === 'cancelada' ? 'rechazada' : item.estado === 'solicitada' ? 'pendiente' : item.estado
              const statusClass =
                item.estado === 'cancelada'
                  ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
                  : item.estado === 'aprobada'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'

              return (
                <div key={item.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-white">
                        {formatDate(item.fecha_inicio)} → {formatDate(item.fecha_fin)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-400">{num(item.dias_solicitados)} día(s) solicitados</p>
                    </div>
                    <span className={`inline-flex rounded-lg px-2 py-1 text-[10px] font-black uppercase ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>

                  {item.comentario && (
                    <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                      {item.comentario}
                    </p>
                  )}

                  <p className="mt-3 text-[11px] font-medium text-slate-400">{formatDateTime(item.created_at)}</p>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
