'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Crown,
  Loader2,
  Medal,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Zap,
} from 'lucide-react'
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

const typeConfig: Record<RankingType, {
  label: string
  short: string
  title: string
  subtitle: string
  gif: string
  primary: string
  soft: string
  ring: string
  shadow: string
  confetti: string[]
}> = {
  puntual: {
    label: 'Primeros en llegar',
    short: 'Puntuales',
    title: 'Ranking dorado',
    subtitle: 'Solo cuenta el escaner de oficina y entradas puntuales.',
    gif: '/icons-web/ranking.gif',
    primary: 'from-amber-300 via-yellow-400 to-orange-500',
    soft: 'from-amber-50 via-yellow-50 to-orange-50',
    ring: 'ring-amber-200',
    shadow: 'shadow-amber-500/20',
    confetti: ['#f59e0b', '#facc15', '#fb923c', '#fde68a', '#f97316'],
  },
  tardanza: {
    label: 'Llegadas tarde',
    short: 'Tardanzas',
    title: 'Ranking rojo',
    subtitle: 'Muestra a quienes llegaron tarde por escaner de oficina.',
    gif: '/icons-web/ranking-tardanza.gif',
    primary: 'from-red-500 via-rose-500 to-orange-600',
    soft: 'from-red-50 via-rose-50 to-orange-50',
    ring: 'ring-red-200',
    shadow: 'shadow-red-500/20',
    confetti: ['#dc2626', '#fb7185', '#f97316', '#fecaca', '#991b1b'],
  },
}

const confetti = Array.from({ length: 36 }, (_, index) => ({
  id: index,
  left: `${(index * 31) % 100}%`,
  delay: (index % 10) * 0.16,
  duration: 3.8 + (index % 7) * 0.25,
  colorIndex: index % 5,
}))

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

function positionLabel(position: number) {
  if (position === 1) return '1er'
  if (position === 2) return '2do'
  if (position === 3) return '3er'
  return `${position}to`
}

function PodiumCard({ item, index, type }: { item: RankingItem; index: number; type: RankingType }) {
  const cfg = typeConfig[type]
  const isWinner = item.puesto === 1
  const Icon = isWinner ? Crown : Medal
  const scale = isWinner ? 'lg:scale-110 lg:-translate-y-5' : ''

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 56, rotate: index === 0 ? -3 : 3, scale: 0.86 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      whileHover={{ y: -10, rotate: isWinner ? 0 : index === 0 ? -1.5 : 1.5 }}
      transition={{ delay: 0.08 + index * 0.08, type: 'spring', stiffness: 210, damping: 20 }}
      className={`relative ${scale}`}
    >
      <div className={`absolute inset-x-5 -bottom-4 h-12 rounded-full bg-gradient-to-r ${cfg.primary} blur-2xl opacity-45`} />
      <div className={`relative overflow-hidden rounded-[2.25rem] border-2 border-white bg-gradient-to-br ${cfg.soft} p-4 shadow-2xl ${cfg.shadow} ring-1 ${cfg.ring}`}>
        <motion.div
          className={`absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br ${cfg.primary} opacity-25 blur-xl`}
          animate={{ scale: [1, 1.25, 1], rotate: [0, 90, 0] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative flex min-h-[330px] flex-col items-center rounded-[1.75rem] bg-white/88 p-5 text-center ring-1 ring-white/80">
          <div className={`absolute left-4 top-4 rounded-full bg-gradient-to-r ${cfg.primary} px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-lg`}>
            {positionLabel(item.puesto)}
          </div>
          <motion.div
            animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] }}
            transition={{ duration: isWinner ? 2.4 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute right-4 top-4 text-slate-900/20"
          >
            <Icon size={isWinner ? 58 : 44} />
          </motion.div>

          <motion.div
            animate={{ y: [0, -10, 0], rotate: isWinner ? [0, -2, 2, 0] : [0, 0, 0] }}
            transition={{ duration: isWinner ? 2.2 : 3, repeat: Infinity, ease: 'easeInOut' }}
            className={`mt-9 rounded-full bg-gradient-to-br ${cfg.primary} p-1.5 shadow-xl`}
          >
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-slate-100">
              {item.foto_url ? (
                <img src={item.foto_url} alt={item.nombres_completos} className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-black text-slate-700">{initials(item.nombres_completos)}</span>
              )}
            </div>
          </motion.div>

          <h2 className="mt-5 line-clamp-2 text-xl font-black leading-tight text-slate-950">{item.nombres_completos}</h2>
          <p className="mt-2 text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">{item.area || 'Sin area'}</p>
          <div className={`mt-auto flex items-center gap-2 rounded-2xl bg-gradient-to-r ${cfg.primary} px-4 py-2 text-sm font-black text-white shadow-lg ${cfg.shadow}`}>
            <Clock3 size={15} />
            {timeLabel(item.hora_ingreso)}
          </div>
        </div>
      </div>
    </motion.article>
  )
}

function RunnerRow({ item, index, type }: { item: RankingItem; index: number; type: RankingType }) {
  const cfg = typeConfig[type]
  const width = Math.max(28, 100 - index * 8)

  return (
    <motion.article
      layout
      initial={{ opacity: 0, x: -26, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 26 }}
      whileHover={{ x: 8, scale: 1.01 }}
      transition={{ delay: 0.18 + index * 0.045, type: 'spring', stiffness: 260, damping: 24 }}
      className={`group relative overflow-hidden rounded-[1.8rem] border border-white bg-white p-3 shadow-lg ${cfg.shadow}`}
    >
      <div className={`absolute inset-y-0 left-0 w-2 bg-gradient-to-b ${cfg.primary}`} />
      <div className="relative flex items-center gap-3 sm:gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${cfg.primary} text-sm font-black text-white shadow-lg ${cfg.shadow}`}>
          #{item.puesto}
        </div>
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-4 ring-slate-50">
          {item.foto_url ? (
            <img src={item.foto_url} alt={item.nombres_completos} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-black text-slate-700">{initials(item.nombres_completos)}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-black text-slate-950">{item.nombres_completos}</p>
            {index === 0 ? <Zap className="shrink-0 text-amber-500" size={15} /> : null}
          </div>
          <p className="truncate text-xs font-bold text-slate-400">{item.area || 'Sin area'}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${width}%` }}
              transition={{ delay: 0.3 + index * 0.04, duration: 0.8, ease: 'easeOut' }}
              className={`h-full rounded-full bg-gradient-to-r ${cfg.primary}`}
            />
          </div>
        </div>
        <div className={`rounded-2xl bg-gradient-to-r ${cfg.primary} px-3 py-2 text-xs font-black text-white shadow-md transition group-hover:scale-105`}>
          {timeLabel(item.hora_ingreso)}
        </div>
      </div>
    </motion.article>
  )
}

export default function RankingPage() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [backHref, setBackHref] = useState('/escaner')
  const [type, setType] = useState<RankingType>('puntual')
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const cfg = typeConfig[type]
  const podium = useMemo(() => ranking.slice(0, 3), [ranking])
  const podiumDisplay = useMemo(() => {
    const byPosition = new Map(podium.map((item) => [item.puesto, item]))
    return [byPosition.get(2), byPosition.get(1), byPosition.get(3)].filter(Boolean) as RankingItem[]
  }, [podium])
  const rest = useMemo(() => ranking.slice(3), [ranking])

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const dateParam = params.get('date')
    const typeParam = params.get('type')
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) setDate(dateParam)
    if (typeParam === 'tardanza') setType('tardanza')
    if (params.get('from') === 'admin') setBackHref('/')
  }, [])

  useEffect(() => {
    void loadRanking(date, type)
    const id = window.setInterval(() => void loadRanking(date, type, true), 15000)
    return () => window.clearInterval(id)
  }, [date, type])

  return (
    <main className={`relative min-h-screen overflow-hidden bg-gradient-to-br ${cfg.soft} px-4 py-5 font-sans text-slate-950 sm:px-6`}>
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_12%,rgba(255,255,255,0.9),transparent_24%),radial-gradient(circle_at_80%_8%,rgba(255,255,255,0.7),transparent_18%)]" />
        {confetti.map((item) => (
          <motion.span
            key={item.id}
            className="absolute top-[-20px] h-3 w-2 rounded-full"
            style={{ left: item.left, backgroundColor: cfg.confetti[item.colorIndex] }}
            animate={{ y: ['0vh', '110vh'], rotate: [0, 240, 520], opacity: [0, 1, 0] }}
            transition={{ duration: item.duration, repeat: Infinity, delay: item.delay, ease: 'linear' }}
          />
        ))}
      </div>

      <section className="relative mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-7xl flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link href={backHref} className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-lg transition hover:-translate-y-0.5">
            <ArrowLeft size={19} />
          </Link>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 shadow-sm">
              <ShieldCheck size={15} className="text-emerald-500" />
              Solo oficina
            </div>
            <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 shadow-sm">
              <CalendarDays size={15} />
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="bg-transparent text-slate-900 outline-none"
              />
            </label>
            <button
              onClick={() => void loadRanking(date, type)}
              className={`inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-r ${cfg.primary} px-4 text-xs font-black text-white shadow-xl transition hover:scale-[1.03]`}
            >
              {loading || refreshing ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
              Actualizar
            </button>
          </div>
        </header>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="grid gap-6 pt-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-slate-500 shadow-sm ring-1 ring-slate-200">
              <Sparkles size={14} className={type === 'puntual' ? 'text-amber-500' : 'text-red-500'} />
              {type === 'puntual' ? 'Ranking de puntuales' : 'Ranking de tardanzas'}
            </div>
            <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[0.9] tracking-tight sm:text-7xl lg:text-8xl">
              {cfg.title}
            </h1>
            <p className="mt-5 max-w-2xl text-sm font-semibold leading-6 text-slate-600 sm:text-base">{cfg.subtitle}</p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 180, damping: 22 }}
            className="overflow-hidden rounded-[2rem] border border-white bg-white p-5 shadow-2xl shadow-slate-900/10"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                  {format(new Date(`${date}T12:00:00`), "EEEE d 'de' MMMM", { locale: es })}
                </p>
                <p className="mt-2 text-3xl font-black">{ranking.length}/10 lugares</p>
                <p className="mt-1 text-xs font-bold text-slate-400">{lastUpdated ? `Actualizado ${lastUpdated}` : 'Sin actualizar'}</p>
              </div>
              <motion.img
                src={cfg.gif}
                alt=""
                className="h-20 w-20 rounded-3xl bg-slate-50 object-contain p-2 shadow-inner"
                animate={{ rotate: [0, -4, 4, 0], scale: [1, 1.06, 1] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
            <div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-100">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, ranking.length * 10)}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className={`h-full rounded-full bg-gradient-to-r ${cfg.primary}`}
              />
            </div>
          </motion.div>
        </motion.div>

        {loading && !ranking.length ? (
          <div className="flex flex-1 items-center justify-center py-24">
            <div className="text-center">
              <Loader2 className="mx-auto animate-spin text-slate-500" size={42} />
              <p className="mt-4 text-sm font-black uppercase tracking-[0.2em] text-slate-400">Cargando ranking</p>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-10 grid gap-4 md:grid-cols-3 md:items-end">
              <AnimatePresence mode="popLayout">
                {podiumDisplay.map((item, index) => (
                  <PodiumCard key={item.dni} item={item} index={index} type={type} />
                ))}
              </AnimatePresence>
            </div>

            <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_360px]">
              <section className="rounded-[2.25rem] border border-white bg-white/65 p-4 shadow-xl shadow-slate-900/5 backdrop-blur">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Lista separada</p>
                    <h2 className="text-xl font-black text-slate-950">{type === 'puntual' ? 'Puntuales en dorado' : 'Tardanzas en rojo'}</h2>
                  </div>
                  <div className={`rounded-2xl bg-gradient-to-r ${cfg.primary} px-4 py-2 text-xs font-black text-white shadow-lg ${cfg.shadow}`}>
                    {rest.length} mas
                  </div>
                </div>
                <div className="grid gap-3">
                <AnimatePresence mode="popLayout">
                  {rest.map((item, index) => (
                    <RunnerRow key={item.dni} item={item} index={index} type={type} />
                  ))}
                </AnimatePresence>
                </div>
              </section>

              <aside className="relative overflow-hidden rounded-[2rem] border border-white bg-white p-5 shadow-2xl shadow-slate-900/10">
                <motion.div
                  className={`absolute right-[-60px] top-[-60px] h-36 w-36 rounded-full bg-gradient-to-br ${cfg.primary} opacity-20 blur-2xl`}
                  animate={{ scale: [1, 1.28, 1], opacity: [0.2, 0.48, 0.2] }}
                  transition={{ duration: 3.6, repeat: Infinity }}
                />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                    <Star size={13} className="text-yellow-500" />
                    Reglas
                  </div>
                  <h2 className="mt-4 text-2xl font-black">{cfg.label}</h2>
                  <div className="mt-5 grid gap-3 text-sm font-semibold text-slate-600">
                    <p className="rounded-2xl bg-slate-50 p-4">Cuenta solo marcaciones realizadas desde el escaner de oficina.</p>
                    <p className="rounded-2xl bg-slate-50 p-4">Si una persona marca varias veces, se usa su primera entrada del dia.</p>
                    <p className="rounded-2xl bg-slate-50 p-4">El ranking se actualiza automaticamente cada 15 segundos.</p>
                  </div>
                </div>
              </aside>
            </div>

            {!ranking.length && (
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-12 rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"
              >
                <Trophy className="mx-auto text-slate-300" size={48} />
                <p className="mt-4 text-xl font-black">No hay registros para este ranking.</p>
              </motion.div>
            )}
          </>
        )}
      </section>
    </main>
  )
}
