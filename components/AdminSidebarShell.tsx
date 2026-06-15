'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { format, subDays } from 'date-fns'
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
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

// Solo el acento (barra activa + halo). Resto del card stays neutro slate.
const accent: Record<SidebarTone, { bar: string; halo: string; chip: string }> = {
  emerald: { bar: 'bg-emerald-500', halo: 'shadow-emerald-500/30', chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
  orange:  { bar: 'bg-orange-500',  halo: 'shadow-orange-500/30',  chip: 'bg-orange-500/10 text-orange-600 dark:text-orange-300' },
  indigo:  { bar: 'bg-indigo-500',  halo: 'shadow-indigo-500/30',  chip: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300' },
  fuchsia: { bar: 'bg-fuchsia-500', halo: 'shadow-fuchsia-500/30', chip: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300' },
  teal:    { bar: 'bg-teal-500',    halo: 'shadow-teal-500/30',    chip: 'bg-teal-500/10 text-teal-600 dark:text-teal-300' },
  rose:    { bar: 'bg-rose-500',    halo: 'shadow-rose-500/30',    chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-300' },
  blue:    { bar: 'bg-blue-500',    halo: 'shadow-blue-500/30',    chip: 'bg-blue-500/10 text-blue-600 dark:text-blue-300' },
}

const workerOnlyPaths = ['/setup', '/escaner', '/kiosko']
const SIDEBAR_OPEN_KEY = 'ruag_sidebar_open'

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
  const [mobileOpen, setMobileOpen] = useState(false)
  const [vacacionesPendientes, setVacacionesPendientes] = useState(0)
  const [descansosPendientes, setDescansosPendientes] = useState(0)

  const hidden = workerOnlyPaths.some((path) => pathname?.startsWith(path))

  // Persistir estado open/cerrado
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_OPEN_KEY)
      if (stored === '1') setOpen(true)
    } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_OPEN_KEY, open ? '1' : '0') } catch {}
  }, [open])

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
    setMobileOpen(false)
    if (pathname === '/') {
      window.dispatchEvent(new CustomEvent(`ruag-open-${modal}`))
      return
    }
    router.push(`/?open=${modal}`)
  }

  const items = useMemo<SidebarItem[]>(() => [
    { key: 'inicio',          title: 'Dashboard',        description: 'Panel principal',     gif: '/ruag-logo.png',                 tone: 'blue',    href: '/' },
    { key: 'excel',           title: 'Excel',            description: 'Exportar asistencia', gif: '/icons-web/excel.gif',           tone: 'emerald', onClick: () => triggerDashboardModal('excel') },
    { key: 'vacaciones',      title: vacacionesPendientes > 0 ? 'Vacaciones' : 'Vacaciones', description: vacacionesPendientes > 0 ? `${vacacionesPendientes} pendiente(s)` : 'Solicitudes y saldos', gif: '/icons-web/vacaciones.gif', tone: 'orange', href: '/vacaciones', badge: vacacionesPendientes },
    { key: 'analitica',       title: 'Analitica',        description: 'Metricas y graficos', gif: '/icons-web/analitica.gif',       tone: 'indigo',  href: defaultMetricHref() },
    { key: 'ranking',         title: 'Ranking',          description: 'Top 10 de llegada',   gif: '/icons-web/ranking.gif',         tone: 'fuchsia', href: `/ranking?date=${todayKey()}&from=admin` },
    { key: 'ranking-tardanza',title: 'Ranking tardanza', description: 'Llegadas tarde',      gif: '/icons-web/ranking-tardanza.gif',tone: 'rose',    href: `/ranking?date=${todayKey()}&from=admin&type=tardanza` },
    { key: 'feriado',         title: 'Modo feriado',     description: 'Dia no laborable',    gif: '/icons-web/feriado.gif',         tone: 'teal',    onClick: () => triggerDashboardModal('feriado') },
    { key: 'descanso',        title: 'Descanso medico',  description: descansosPendientes > 0 ? `${descansosPendientes} pendiente(s)` : 'Evidencias RRHH', gif: '/icons-web/descanso-medico.gif', tone: 'rose', href: '/descansos-medicos', badge: descansosPendientes },
  ], [descansosPendientes, pathname, vacacionesPendientes])

  if (hidden) return <>{children}</>

  const sidebarWidth = open ? 256 : 76

  return (
    <div className="min-h-screen">
      {/* Mobile floating toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-[70] flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/95 text-slate-700 shadow-lg backdrop-blur-sm transition active:scale-95 dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-200 lg:hidden"
        aria-label="Abrir menu"
      >
        <PanelLeftOpen size={20} />
      </button>

      {/* Mobile scrim */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-[80] bg-slate-950/40 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        animate={{ width: sidebarWidth }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className={`fixed left-0 top-0 z-[90] hidden h-screen flex-col border-r border-slate-200/70 bg-white/80 backdrop-blur-2xl dark:border-slate-800/70 dark:bg-slate-950/85 lg:flex`}
        style={{ boxShadow: '0 0 40px rgba(15,23,42,0.05)' }}
      >
        <SidebarBody
          items={items}
          open={open}
          setOpen={setOpen}
          pathname={pathname}
          onNavigate={() => {}}
        />
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            className="fixed left-0 top-0 z-[90] flex h-screen w-[280px] flex-col border-r border-slate-200/70 bg-white/95 backdrop-blur-2xl dark:border-slate-800/70 dark:bg-slate-950/95 lg:hidden"
          >
            <SidebarBody
              items={items}
              open
              setOpen={() => setMobileOpen(false)}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
              mobile
            />
          </motion.aside>
        )}
      </AnimatePresence>

      <div
        className="transition-[padding] duration-300"
        style={{ paddingLeft: 'var(--ruag-sidebar-pad, 0px)' }}
      >
        {children}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `@media (min-width: 1024px) { :root { --ruag-sidebar-pad: ${sidebarWidth}px; } }` }} />
    </div>
  )
}

function SidebarBody({
  items, open, setOpen, pathname, onNavigate, mobile = false,
}: {
  items: SidebarItem[]
  open: boolean
  setOpen: (next: boolean) => void
  pathname: string | null
  onNavigate: () => void
  mobile?: boolean
}) {
  return (
    <>
      {/* Brand */}
      <div className={`flex items-center gap-3 border-b border-slate-200/70 px-3 py-4 dark:border-slate-800/70 ${open ? '' : 'justify-center'}`}>
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-fuchsia-500 p-[2px] shadow-lg shadow-indigo-500/30">
          <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-white dark:bg-slate-900">
            <img src="/ruag-logo.png" alt="RUAG" className="h-9 w-9 rounded-xl object-cover" />
          </div>
        </div>
        {open && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black tracking-tight text-slate-900 dark:text-white">RUAG Control</p>
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Asistencias</p>
          </div>
        )}
        {open && !mobile && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Cerrar menu"
          >
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>

      {/* Items */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.key}>
              <SidebarRow item={item} open={open} active={isActive(pathname, item)} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer toggle */}
      {!mobile && (
        <div className="border-t border-slate-200/70 p-2 dark:border-slate-800/70">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className={`flex w-full items-center gap-2 rounded-2xl px-2.5 py-2 text-xs font-black text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white ${open ? '' : 'justify-center'}`}
          >
            {open ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            {open && <span className="uppercase tracking-[0.14em]">Colapsar</span>}
          </button>
        </div>
      )}
    </>
  )
}

function isActive(pathname: string | null, item: SidebarItem) {
  if (!pathname || !item.href) return false
  const cleanHref = item.href.split('?')[0]
  if (cleanHref === '/') return pathname === '/'
  return pathname.startsWith(cleanHref)
}

function SidebarRow({ item, open, active, onNavigate }: { item: SidebarItem; open: boolean; active: boolean; onNavigate: () => void }) {
  const tone = accent[item.tone]

  const inner = (
    <div className={`relative flex w-full items-center gap-3 rounded-2xl px-2 py-2 transition-all ${
      active
        ? 'bg-slate-100 dark:bg-slate-800/70'
        : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/40'
    } ${open ? '' : 'justify-center'}`}>
      {/* Barra activa lateral */}
      {active && (
        <motion.span
          layoutId="ruag-sidebar-active-bar"
          className={`absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full ${tone.bar}`}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        />
      )}

      {/* Icono tile */}
      <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200/70 transition group-hover:scale-105 dark:bg-slate-900 dark:ring-slate-700/60 ${active ? `shadow-md ${tone.halo}` : ''}`}>
        <img src={item.gif} alt="" className="h-9 w-9 object-contain" />
        {!!item.badge && item.badge > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white ring-2 ring-white dark:ring-slate-950">
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </span>

      {/* Texto */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.span
            initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.15 }}
            className="flex min-w-0 flex-1 flex-col text-left"
          >
            <span className={`truncate text-sm font-black tracking-tight ${active ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>{item.title}</span>
            <span className="truncate text-[11px] font-semibold text-slate-400">{item.description}</span>
          </motion.span>
        )}
      </AnimatePresence>
      {open && (
        <ChevronRight size={14} className={`shrink-0 transition ${active ? 'text-slate-700 dark:text-slate-200' : 'text-slate-300 dark:text-slate-600'}`} />
      )}
    </div>
  )

  const cls = 'group block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-2xl'

  if (item.href) {
    return (
      <Link href={item.href} onClick={onNavigate} className={cls} title={item.title}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" onClick={() => { item.onClick?.(); onNavigate() }} className={cls} title={item.title}>
      {inner}
    </button>
  )
}
