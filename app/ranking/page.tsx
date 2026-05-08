'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
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
import { AnimatePresence, motion } from 'framer-motion'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'

type RankingItem = {
  puesto: number
  dni: string
  nombres_completos: string
  area: string
  foto_url: string | null
  hora_ingreso: string
  estado_ingreso: string
}

const podiumMeta: Record<number, { label: string; gradient: string; glow: string; height: string; icon: 'crown' | 'medal' }> = {
  1: {
    label: 'Primer lugar',
    gradient: 'from-amber-200 via-yellow-400 to-orange-500',
    glow: 'shadow-amber-500/30',
    height: 'md:min-h-[360px]',
    icon: 'crown',
  },
  2: {
    label: 'Segundo lugar',
    gradient: 'from-slate-100 via-slate-300 to-slate-500',
    glow: 'shadow-slate-400/25',
    height: 'md:min-h-[310px]',
    icon: 'medal',
  },
  3: {
    label: 'Tercer lugar',
    gradient: 'from-orange-200 via-orange-500 to-amber-800',
    glow: 'shadow-orange-500/25',
    height: 'md:min-h-[290px]',
    icon: 'medal',
  },
}

const particles = Array.from({ length: 26 }, (_, index) => ({
  id: index,
  left: `${(index * 37) % 100}%`,
  top: `${(index * 53) % 100}%`,
  delay: (index % 9) * 0.22,
  duration: 4 + (index % 5) * 0.55,
  size: 5 + (index % 4) * 3,
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

function PodiumCard({ item, index }: { item: RankingItem; index: number }) {
  const meta = podiumMeta[item.puesto]
  const Icon = meta.icon === 'crown' ? Crown : Medal

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 44, rotateX: 12, scale: 0.88 }}
      animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
      whileHover={{ y: -8, rotate: item.puesto === 1 ? 0 : item.puesto === 2 ? -1.5 : 1.5 }}
      transition={{ delay: 0.08 + index * 0.08, type: 'spring', stiffness: 210, damping: 20 }}
      className={`group relative overflow-hidden rounded-[2.2rem] bg-gradient-to-br ${meta.gradient} p-[2px] shadow-2xl ${meta.glow} ${meta.height}`}
    >
      <motion.div
        className="absolute inset-[-30%] bg-[radial-gradient(circle,rgba(255,255,255,0.85),transparent_34%)] opacity-0 blur-2xl group-hover:opacity-70"
        animate={{ x: ['-30%', '30%', '-30%'], y: ['-20%', '20%', '-20%'] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="relative flex h-full flex-col items-center overflow-hidden rounded-[2rem] bg-white/86 px-5 py-6 text-center shadow-inner backdrop-blur-xl">
        <div className="absolute left-5 top-5 rounded-full bg-white/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          {meta.label}
        </div>
        <motion.div
          animate={{ rotate: item.puesto === 1 ? [0, -7, 7, 0] : [0, 4, -4, 0] }}
          transition={{ duration: item.puesto === 1 ? 2.6 : 3.4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute right-5 top-5 text-slate-950/20"
        >
          <Icon size={item.puesto === 1 ? 52 : 42} />
        </motion.div>

        <motion.div
          animate={{ y: item.puesto === 1 ? [0, -8, 0] : [0, -4, 0] }}
          transition={{ duration: item.puesto === 1 ? 2.7 : 3.1, repeat: Infinity, ease: 'easeInOut' }}
          className={`mt-10 flex items-center justify-center rounded-full bg-gradient-to-br ${meta.gradient} p-1 shadow-xl ${meta.glow}`}
        >
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-slate-100 sm:h-28 sm:w-28">
            {item.foto_url ? (
              <img src={item.foto_url} alt={item.nombres_completos} className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl font-black">{initials(item.nombres_completos)}</span>
            )}
          </div>
        </motion.div>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white shadow-lg">
          <Sparkles size={15} />
          {positionLabel(item.puesto)} lugar
        </div>
        <h2 className="mt-5 line-clamp-2 text-xl font-black leading-tight text-slate-950">{item.nombres_completos}</h2>
        <p className="mt-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{item.area || 'Sin area'}</p>
        <div className="mt-auto pt-6">
          <div className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-950 shadow-sm ring-1 ring-slate-200">
            <Clock3 size={15} />
            {timeLabel(item.hora_ingreso)}
          </div>
        </div>
      </div>
    </motion.article>
  )
}

function RunnerRow({ item, index, total }: { item: RankingItem; index: number; total: number }) {
  const percentage = Math.max(18, 100 - index * 9)

  return (
    <motion.article
      layout
      initial={{ opacity: 0, x: -26, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 18 }}
      whileHover={{ x: 8, scale: 1.01 }}
      transition={{ delay: 0.2 + index * 0.045, type: 'spring', stiffness: 260, damping: 24 }}
      className="group relative overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/82 p-3 shadow-sm backdrop-blur-xl"
    >
      <motion.div
        className="absolute inset-y-0 left-0 w-1 rounded-full bg-gradient-to-b from-emerald-400 via-cyan-400 to-blue-500"
        animate={{ opacity: [0.45, 1, 0.45] }}
        transition={{ duration: 2.5, repeat: Infinity, delay: index * 0.1 }}
      />
      <div className="relative flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white shadow-lg shadow-slate-950/10">
          #{item.puesto}
        </div>
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-4 ring-white">
          {item.foto_url ? (
            <img src={item.foto_url} alt={item.nombres_completos} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-black">{initials(item.nombres_completos)}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-black text-slate-950">{item.nombres_completos}</p>
            {index === 0 && total > 6 ? <Zap className="shrink-0 text-amber-500" size={15} /> : null}
          </div>
          <p className="truncate text-xs font-bold text-slate-400">{item.area || 'Sin area'}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ delay: 0.3 + index * 0.04, duration: 0.8, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500"
            />
          </div>
        </div>
        <div className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 group-hover:bg-slate-950 group-hover:text-white">
          {timeLabel(item.hora_ingreso)}
        </div>
      </div>
    </motion.article>
  )
}

export default function RankingPage() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [backHref, setBackHref] = useState('/escaner')
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const podium = useMemo(() => ranking.slice(0, 3), [ranking])
  const podiumDisplay = useMemo(() => {
    const byPosition = new Map(podium.map((item) => [item.puesto, item]))
    return [byPosition.get(2), byPosition.get(1), byPosition.get(3)].filter(Boolean) as RankingItem[]
  }, [podium])
  const rest = useMemo(() => ranking.slice(3), [ranking])
  const leader = ranking[0]

  const loadRanking = async (targetDate = date, silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const response = await fetch(`/api/ranking?date=${encodeURIComponent(targetDate)}`, { cache: 'no-store' })
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
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) setDate(dateParam)
    if (params.get('from') === 'admin') setBackHref('/')
  }, [])

  useEffect(() => {
    void loadRanking(date)
    const id = window.setInterval(() => void loadRanking(date, true), 15000)
    return () => window.clearInterval(id)
  }, [date])

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07111f] px-4 py-5 font-sans text-white sm:px-6">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(45,212,191,0.34),transparent_34%),radial-gradient(circle_at_90%_20%,rgba(251,191,36,0.28),transparent_28%),linear-gradient(135deg,#07111f_0%,#10233b_46%,#18290f_100%)]" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.7)_1px,transparent_1px)] [background-size:42px_42px]" />
        {particles.map((particle) => (
          <motion.span
            key={particle.id}
            className="absolute rounded-full bg-white/70"
            style={{ left: particle.left, top: particle.top, width: particle.size, height: particle.size }}
            animate={{ y: [0, -28, 0], opacity: [0.08, 0.8, 0.08], scale: [0.8, 1.25, 0.8] }}
            transition={{ duration: particle.duration, repeat: Infinity, delay: particle.delay, ease: 'easeInOut' }}
          />
        ))}
      </div>

      <section className="relative mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-7xl flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link href={backHref} className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white shadow-lg backdrop-blur-xl transition hover:bg-white/20">
            <ArrowLeft size={19} />
          </Link>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-black text-white/80 backdrop-blur-xl">
              <ShieldCheck size={15} className="text-emerald-300" />
              Solo oficina
            </div>
            <label className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-black text-white/80 backdrop-blur-xl">
              <CalendarDays size={15} />
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="bg-transparent text-white outline-none [color-scheme:dark]"
              />
            </label>
            <button
              onClick={() => void loadRanking(date)}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-4 text-xs font-black text-slate-950 shadow-xl shadow-black/20 transition hover:scale-[1.03]"
            >
              {loading || refreshing ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
              Actualizar
            </button>
          </div>
        </header>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="grid gap-6 pt-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <motion.div
              animate={{ boxShadow: ['0 0 0 0 rgba(45,212,191,0.2)', '0 0 0 10px rgba(45,212,191,0)', '0 0 0 0 rgba(45,212,191,0)'] }}
              transition={{ duration: 2.2, repeat: Infinity }}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.26em] text-emerald-200 backdrop-blur-xl"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-300" />
              Ranking en vivo
            </motion.div>
            <h1 className="mt-5 max-w-3xl text-5xl font-black leading-[0.9] tracking-tight sm:text-7xl lg:text-8xl">
              Top 10 primeros en llegar
            </h1>
            <p className="mt-5 max-w-2xl text-sm font-semibold leading-6 text-white/62 sm:text-base">
              Ranking animado del escaner de oficina. Excluye obra, externo, turno nocturno e inasistencias para que el podio sea limpio.
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 180, damping: 22 }}
            className="overflow-hidden rounded-[2rem] border border-white/15 bg-white/10 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/45">
                  {format(new Date(`${date}T12:00:00`), "EEEE d 'de' MMMM", { locale: es })}
                </p>
                <p className="mt-2 text-3xl font-black">{ranking.length}/10 lugares</p>
              </div>
              <motion.div
                animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-yellow-300 to-orange-500 text-slate-950 shadow-xl shadow-orange-500/20"
              >
                <Trophy size={34} />
              </motion.div>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, ranking.length * 10)}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-yellow-300"
              />
            </div>
            <div className="mt-4 flex items-center justify-between text-xs font-bold text-white/50">
              <span>{leader ? `Lider: ${leader.nombres_completos}` : 'Esperando marcaciones'}</span>
              <span>{lastUpdated ? `Act. ${lastUpdated}` : 'Sin actualizar'}</span>
            </div>
          </motion.div>
        </motion.div>

        {loading && !ranking.length ? (
          <div className="flex flex-1 items-center justify-center py-24">
            <div className="text-center">
              <Loader2 className="mx-auto animate-spin text-emerald-200" size={42} />
              <p className="mt-4 text-sm font-black uppercase tracking-[0.2em] text-white/45">Cargando ranking</p>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-10 grid gap-4 md:grid-cols-3 md:items-end">
              <AnimatePresence mode="popLayout">
                {podiumDisplay.map((item, index) => (
                  <PodiumCard key={item.dni} item={item} index={index} />
                ))}
              </AnimatePresence>
            </div>

            <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_360px]">
              <div className="grid gap-3">
                <AnimatePresence mode="popLayout">
                  {rest.map((item, index) => (
                    <RunnerRow key={item.dni} item={item} index={index} total={rest.length} />
                  ))}
                </AnimatePresence>
              </div>

              <aside className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-white/10 p-5 shadow-2xl shadow-black/10 backdrop-blur-xl">
                <motion.div
                  className="absolute right-[-60px] top-[-60px] h-36 w-36 rounded-full bg-emerald-300/25 blur-2xl"
                  animate={{ scale: [1, 1.28, 1], opacity: [0.35, 0.8, 0.35] }}
                  transition={{ duration: 3.6, repeat: Infinity }}
                />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-white/50">
                    <Star size={13} className="text-yellow-300" />
                    Reglas
                  </div>
                  <h2 className="mt-4 text-2xl font-black">Ranking limpio</h2>
                  <div className="mt-5 grid gap-3 text-sm font-semibold text-white/62">
                    <p className="rounded-2xl bg-white/8 p-4">Cuenta solo ingresos hechos desde el escaner de oficina.</p>
                    <p className="rounded-2xl bg-white/8 p-4">Si un trabajador marca varias veces, solo se toma su primera entrada.</p>
                    <p className="rounded-2xl bg-white/8 p-4">Se actualiza automaticamente cada 15 segundos sin refrescar la pagina.</p>
                  </div>
                </div>
              </aside>
            </div>

            {!ranking.length && (
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-12 rounded-[2rem] border border-dashed border-white/20 bg-white/10 p-10 text-center backdrop-blur-xl"
              >
                <Trophy className="mx-auto text-white/25" size={48} />
                <p className="mt-4 text-xl font-black">Aun no hay marcaciones de oficina para este dia.</p>
              </motion.div>
            )}
          </>
        )}
      </section>
    </main>
  )
}
