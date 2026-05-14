'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { format, subDays } from 'date-fns'
import { ChevronLeft, ChevronRight, Home, Menu } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/utils/supabase/client'

type SidebarTone = 'emerald' | 'orange' | 'indigo' | 'fuchsia' | 'teal' | 'rose' | 'blue'

type SidebarItem = {
  key: string
  title: string
  description: string
  gif: string
  tone: SidebarTone
  href?: string
  badge?: number
  onClick?: () => void
}

const toneClasses: Record<SidebarTone, string> = {
  emerald: 'from-emerald-50 to-white border-emerald-200 text-emerald-700 dark:from-emerald-500/15 dark:to-slate-950 dark:border-emerald-500/20 dark:text-emerald-300',
  orange: 'from-orange-50 to-white border-orange-200 text-orange-700 dark:from-orange-500/15 dark:to-slate-950 dark:border-orange-500/25 dark:text-orange-300',
  indigo: 'from-indigo-50 to-white border-indigo-200 text-indigo-700 dark:from-indigo-500/15 dark:to-slate-950 dark:border-indigo-500/25 dark:text-indigo-300',
  fuchsia: 'from-fuchsia-50 to-white border-fuchsia-200 text-fuchsia-700 dark:from-fuchsia-500/15 dark:to-slate-950 dark:border-fuchsia-500/25 dark:text-fuchsia-300',
  teal: 'from-teal-50 to-white border-teal-200 text-teal-700 dark:from-teal-500/15 dark:to-slate-950 dark:border-teal-500/25 dark:text-teal-300',
  rose: 'from-rose-50 to-white border-rose-200 text-rose-700 dark:from-rose-500/15 dark:to-slate-950 dark:border-rose-500/25 dark:text-rose-300',
  blue: 'from-blue-50 to-white border-blue-200 text-blue-700 dark:from-blue-500/15 dark:to-slate-950 dark:border-blue-500/25 dark:text-blue-300',
}

const workerOnlyPaths = ['/setup', '/escaner', '/kiosko']

function todayKey() {
  return format(new Date(), 'yyyy-MM-dd')
}

function defaultMetricHref() {
  const today = new Date()
  return `/metricas?from=${format(subDays(today, 29), 'yyyy-MM-dd')}&to=${format(today, 'yyyy-MM-dd')}`
}

export default function AdminSidebarShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [vacacionesPendientes, setVacacionesPendientes] = useState(0)
  const [descansosPendientes, setDescansosPendientes] = useState(0)

  const hidden = workerOnlyPaths.some((path) => pathname?.startsWith(path))

  const fetchPending = async () => {
    const [vacaciones, descansos] = await Promise.all([
      supabase.from('vacaciones_solicitudes').select('id', { count: 'exact', head: true }).eq('estado', 'solicitada'),
      supabase.from('descansos_medicos_solicitudes').select('id', { count: 'exact', head: true }).eq('estado', 'solicitada'),
    ])
    if (!vacaciones.error) setVacacionesPendientes(vacaciones.count ?? 0)
    if (!descansos.error) setDescansosPendientes(descansos.count ?? 0)
  }

  useEffect(() => {
    if (hidden) return
    void fetchPending()

    const vacaciones = supabase.channel('global-admin-vacaciones-sidebar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vacaciones_solicitudes' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new?.estado === 'solicitada') {
          toast.info('Nueva solicitud de vacaciones')
        }
        void fetchPending()
      })
      .subscribe()

    const descansos = supabase.channel('global-admin-descansos-sidebar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'descansos_medicos_solicitudes' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new?.estado === 'solicitada') {
          toast.info('Nuevo descanso medico solicitado')
        }
        void fetchPending()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(vacaciones)
      supabase.removeChannel(descansos)
    }
  }, [hidden])

  const triggerDashboardModal = (modal: 'excel' | 'feriado') => {
    setOpen(false)
    if (pathname === '/') {
      window.dispatchEvent(new CustomEvent(`ruag-open-${modal}`))
      return
    }
    router.push(`/?open=${modal}`)
  }

  const items = useMemo<SidebarItem[]>(() => [
    {
      key: 'inicio',
      title: 'Dashboard',
      description: 'Panel principal',
      gif: '/ruag-logo.png',
      tone: 'blue',
      href: '/',
    },
    {
      key: 'excel',
      title: 'Excel',
      description: 'Exportar asistencia',
      gif: '/icons-web/excel.gif',
      tone: 'emerald',
      onClick: () => triggerDashboardModal('excel'),
    },
    {
      key: 'vacaciones',
      title: vacacionesPendientes > 0 ? 'Vacaciones alerta' : 'Vacaciones',
      description: vacacionesPendientes > 0 ? `${vacacionesPendientes} pendiente(s)` : 'Solicitudes y saldos',
      gif: '/icons-web/vacaciones.gif',
      tone: 'orange',
      href: '/vacaciones',
      badge: vacacionesPendientes,
    },
    {
      key: 'analitica',
      title: 'Analitica',
      description: 'Metricas y graficos',
      gif: '/icons-web/analitica.gif',
      tone: 'indigo',
      href: defaultMetricHref(),
    },
    {
      key: 'ranking',
      title: 'Ranking',
      description: 'Top 10 de llegada',
      gif: '/icons-web/ranking.gif',
      tone: 'fuchsia',
      href: `/ranking?date=${todayKey()}&from=admin`,
    },
    {
      key: 'ranking-tardanza',
      title: 'Ranking tardanza',
      description: 'Llegadas tarde',
      gif: '/icons-web/ranking-tardanza.gif',
      tone: 'rose',
      href: `/ranking?date=${todayKey()}&from=admin&type=tardanza`,
    },
    {
      key: 'feriado',
      title: 'Modo feriado',
      description: 'Dia no laborable',
      gif: '/icons-web/feriado.gif',
      tone: 'teal',
      onClick: () => triggerDashboardModal('feriado'),
    },
    {
      key: 'descanso',
      title: descansosPendientes > 0 ? 'Descanso alerta' : 'Descanso medico',
      description: descansosPendientes > 0 ? `${descansosPendientes} pendiente(s)` : 'Evidencias RRHH',
      gif: '/icons-web/descanso-medico.gif',
      tone: 'rose',
      href: '/descansos-medicos',
      badge: descansosPendientes,
    },
  ], [descansosPendientes, pathname, vacacionesPendientes])

  if (hidden) return <>{children}</>

  return (
    <div className="min-h-screen">
      <motion.aside
        animate={{ width: open ? 304 : 78 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className="fixed left-0 top-0 z-[80] hidden h-screen border-r border-slate-200 bg-white/95 p-3 shadow-xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95 lg:flex lg:flex-col"
      >
        <div className={`mb-4 flex items-center ${open ? 'justify-between' : 'justify-center'}`}>
          {open && (
            <div className="flex min-w-0 items-center gap-3">
              <img src="/ruag-logo.png" alt="RUAG" className="h-11 w-11 rounded-2xl object-cover shadow-sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900 dark:text-white">RUAG Control</p>
                <p className="text-[10px] font-bold text-slate-400">Sistema de Asistencias</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 shadow-sm transition hover:-translate-y-0.5 active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            title={open ? 'Cerrar menu' : 'Abrir menu'}
          >
            {open ? <ChevronLeft size={20} /> : <Menu size={21} />}
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden pb-3">
          {items.map((item) => (
            <SidebarItemButton key={item.key} item={item} open={open} active={isActive(pathname, item)} onNavigate={() => setOpen(false)} />
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="mt-auto flex h-10 items-center justify-center rounded-2xl bg-slate-950 text-white transition active:scale-95 dark:bg-white dark:text-slate-950"
        >
          {open ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </motion.aside>

      <div className="lg:pl-[78px]">{children}</div>
    </div>
  )
}

function isActive(pathname: string | null, item: SidebarItem) {
  if (!pathname || !item.href) return false
  const cleanHref = item.href.split('?')[0]
  if (cleanHref === '/') return pathname === '/'
  return pathname.startsWith(cleanHref)
}

function SidebarItemButton({ item, open, active, onNavigate }: { item: SidebarItem; open: boolean; active: boolean; onNavigate: () => void }) {
  const content = (
    <>
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10">
        <img src={item.gif} alt="" className="h-10 w-10 object-contain" />
        {!!item.badge && item.badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-black text-white shadow-md">
            {item.badge}
          </span>
        )}
      </span>
      {open && (
        <>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-black text-slate-900 dark:text-white">{item.title}</span>
            <span className="block truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">{item.description}</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-slate-400" />
        </>
      )}
    </>
  )

  const className = `group flex min-h-[60px] w-full items-center gap-3 rounded-3xl border bg-gradient-to-r p-2.5 transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] ${open ? 'justify-start' : 'justify-center'} ${toneClasses[item.tone]} ${active ? 'ring-2 ring-slate-950/10 dark:ring-white/20' : ''}`

  if (item.href) {
    return (
      <Link href={item.href} onClick={onNavigate} className={className} title={item.title}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" onClick={item.onClick} className={className} title={item.title}>
      {content}
    </button>
  )
}
