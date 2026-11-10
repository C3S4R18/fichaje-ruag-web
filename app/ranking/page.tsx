'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, BarChart3, CalendarDays, Loader2, RefreshCw, Trophy } from 'lucide-react'
import { toast } from 'sonner'

type RankingType = 'puntual' | 'tardanza'

type RankingItem = {
  puesto: number
  dni: string
  nombres_completos: string
  area: string
  foto_url: string | null
  hora_ingreso: string
  estado_ingreso: string
}

const typeConfig: Record<RankingType, { title: string; subtitle: string; accent: string; soft: string }> = {
  puntual: {
    title: 'Ranking puntual',
    subtitle: 'Primeros 10 en llegar a tiempo, marcando con el escáner de oficina.',
    accent: '#D97706',
    soft: '#FFFBEB',
  },
  tardanza: {
    title: 'Ranking de tardanzas',
    subtitle: 'Llegadas tarde del día registradas con el escáner de oficina.',
    accent: '#DC2626',
    soft: '#FEF2F2',
  },
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'R'
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value))
}

function Avatar({ item, size }: { item: RankingItem; size: number }) {
  return (
    <div
      className="shrink-0 overflow-hidden rounded-full bg-slate-100 flex items-center justify-center font-semibold text-slate-500"
      style={{ width: size, height: size, fontSize: size / 3.4 }}
    >
      {item.foto_url ? <img src={item.foto_url} alt="" className="h-full w-full object-cover" /> : initials(item.nombres_completos)}
    </div>
  )
}

function TimeChip({ value, type }: { value: string; type: RankingType }) {
  const cfg = typeConfig[type]
  return (
    <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums" style={{ background: cfg.soft, color: cfg.accent }}>
      {timeLabel(value)}
    </span>
  )
}

function WinnerCard({ item, type }: { item: RankingItem; type: RankingType }) {
  const cfg = typeConfig[type]
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-5 text-center"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: cfg.soft, color: cfg.accent }}>
        <Trophy size={14} /> 1.er lugar
      </span>
      <div className="mt-4 rounded-full border-[3px] p-1" style={{ borderColor: cfg.accent }}>
        <Avatar item={item} size={92} />
      </div>
      <p className="mt-3 text-lg font-semibold leading-snug text-slate-900">{item.nombres_completos}</p>
      <p className="text-xs text-slate-500">{item.area || 'Sin área'}</p>
      <div className="mt-3"><TimeChip value={item.hora_ingreso} type={type} /></div>
    </motion.div>
  )
}

function PodiumCard({ item, type }: { item: RankingItem; type: RankingType }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-4 text-center"
    >
      <p className="text-xs font-semibold text-slate-500">{item.puesto}.º lugar</p>
      <div className="mt-2.5"><Avatar item={item} size={58} /></div>
      <p className="mt-2.5 line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900">{item.nombres_completos}</p>
      <div className="mt-2"><TimeChip value={item.hora_ingreso} type={type} /></div>
    </motion.div>
  )
}

function RunnerRow({ item, index, type }: { item: RankingItem; index: number; type: RankingType }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: index * 0.04 }}
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[13px] font-semibold text-slate-900">
        {item.puesto}
      </span>
      <Avatar item={item} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">{item.nombres_completos}</p>
        <p className="truncate text-xs text-slate-500">{item.area || 'Sin área'}</p>
      </div>
      <TimeChip value={item.hora_ingreso} type={type} />
    </motion.div>
  )
}

export default function RankingPageWrapper() {
  return (
    <Suspense fallback={null}>
      <RankingPage />
    </Suspense>
  )
}

function RankingPage() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [backHref, setBackHref] = useState('/escaner')
  const [type, setType] = useState<RankingType>('puntual')
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const cfg = typeConfig[type]
  const byPosition = useMemo(() => new Map(ranking.map((item) => [item.puesto, item])), [ranking])
  const rest = useMemo(() => ranking.filter((item) => item.puesto > 3), [ranking])

  const loadRanking = async (targetDate = date, targetType = type, silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const response = await fetch(`/api/ranking?date=${encodeURIComponent(targetDate)}&type=${targetType}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el ranking')
      setRanking(payload.ranking ?? [])
      setLastUpdated(timeLabel(new Date().toISOString()))
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo cargar el ranking')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const searchParams = useSearchParams()
  useEffect(() => {
    const dateParam = searchParams.get('date')
    const typeParam = searchParams.get('type')
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) setDate(dateParam)
    setType(typeParam === 'tardanza' ? 'tardanza' : 'puntual')
    if (searchParams.get('from') === 'admin') setBackHref('/')
  }, [searchParams])

  useEffect(() => {
    void loadRanking(date, type)
    const id = window.setInterval(() => void loadRanking(date, type, true), 15000)
    return () => window.clearInterval(id)
  }, [date, type])

  const first = byPosition.get(1)
  const second = byPosition.get(2)
  const third = byPosition.get(3)

  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Barra superior */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-2 py-2.5 pr-3">
          <Link href={backHref} aria-label="Volver" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-900">
            <ArrowLeft size={22} />
          </Link>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: cfg.soft, color: cfg.accent }}>
            <BarChart3 size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold leading-tight">{cfg.title}</h1>
            <p className="truncate text-xs text-slate-500">
              Escáner de oficina{lastUpdated ? ` · act. ${lastUpdated}` : ''}
            </p>
          </div>
          <button
            onClick={() => void loadRanking(date, type)}
            aria-label="Actualizar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700"
          >
            {loading || refreshing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-2xl space-y-3 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+32px)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-[13px] leading-5 text-slate-500">{cfg.subtitle}</p>
          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <CalendarDays size={15} />
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="bg-transparent text-slate-900 outline-none"
            />
          </label>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {format(new Date(`${date}T12:00:00`), "EEEE d 'de' MMMM", { locale: es })} · {ranking.length}/10
        </p>

        {loading && !ranking.length ? (
          <div className="flex justify-center py-24">
            <Loader2 className="animate-spin text-slate-400" size={36} />
          </div>
        ) : !ranking.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <BarChart3 className="mx-auto text-slate-300" size={36} />
            <p className="mt-3 text-sm font-semibold text-slate-900">Aún no hay registros para este día.</p>
          </div>
        ) : (
          <>
            {first && <WinnerCard item={first} type={type} />}
            {(second || third) && (
              <div className="grid grid-cols-2 gap-3">
                {second && <PodiumCard item={second} type={type} />}
                {third && <PodiumCard item={third} type={type} />}
              </div>
            )}
            <div className="space-y-2.5">
              <AnimatePresence mode="popLayout">
                {rest.map((item, index) => (
                  <RunnerRow key={item.dni} item={item} index={index} type={type} />
                ))}
              </AnimatePresence>
            </div>
            <p className="pt-2 text-center text-xs text-slate-400">Si alguien marca varias veces, cuenta su primera entrada. Se actualiza cada 15 s.</p>
          </>
        )}
      </section>
    </main>
  )
}
