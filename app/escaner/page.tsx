'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Scanner } from '@yudiel/react-qr-scanner'
import {
  MapPin, AlertTriangle, CheckCircle, Loader2, LogOut, History,
  Edit2, Edit3, X, Trophy, Lock, Map, Calendar, ChevronLeft,
  ChevronRight, ChevronDown, CheckCircle2, HardHat, Store, Moon, Star,
  PlaneTakeoff, Phone, RefreshCw, Wallet, Menu, Badge, Cloud, CloudOff,
  BookOpen, Camera, FileText, Image as ImageIcon, Send, Stethoscope, Upload,
  Cake, Gift, PartyPopper,
} from 'lucide-react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { animate, stagger } from 'animejs'
import type { AnimationParams, JSAnimation } from 'animejs'
import { supabase } from '@/utils/supabase/client'
import { activateDeviceSession, clearWorkerSession, hasDeviceSessionToken, isCurrentDeviceSession } from '@/utils/device-session'
import { ensureBirthdayPush, pushSupported } from '@/utils/push'
import LottiePlayer from '@/components/LottiePlayer'
import CalendarPicker from '@/components/CalendarPicker'
import OnboardingTour from '@/components/OnboardingTour'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Perfil      { dni: string; nombres: string; area: string; foto_url: string; fecha_cumpleanos?: string | null }
interface BirthdayPerson { dni: string; nombres: string; area: string; foto_url: string; fecha: string }
interface Asistencia  { id: string; fecha?: string; hora_ingreso: string; estado_ingreso: string; hora_salida: string | null; notas: string | null }
interface PendingAttendance {
  id: string
  payload: {
    dni: string
    nombres_completos: string
    area: string
    foto_url: string
    estado_ingreso: string
    fecha: string
    hora_ingreso: string
    notas: string | null
  }
  asistencia: Asistencia
  created_at: string
}
interface LogroItem   { id: number; emoji: string; titulo: string; desc: string }
interface VacacionesSaldo {
  dni: string
  trabajador_nombre: string
  area: string | null
  cargo: string | null
  periodo?: number
  saldo_arrastre: number
  dias_extra: number
  gozados_ene?: number | null
  gozados_feb?: number | null
  gozados_mar?: number | null
  gozados_abr?: number | null
  gozados_may?: number | null
  gozados_jun?: number | null
  gozados_jul?: number | null
  gozados_ago?: number | null
  gozados_set?: number | null
  gozados_oct?: number | null
  gozados_nov?: number | null
  gozados_dic?: number | null
  total_gozados: number
  dias_pendientes: number
  fecha_vencimiento: string
  renovaciones_aplicadas: number
  vacaciones_por_vencer?: number | null
  vacaciones_pendientes_periodo?: number | null
}
interface VacacionSolicitud {
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
  created_at: string | null
}
interface VacationCalendarDay {
  fecha: string
  solicitudes: VacacionSolicitud[]
}

const VACATION_MONTH_KEYS = [
  'gozados_ene',
  'gozados_feb',
  'gozados_mar',
  'gozados_abr',
  'gozados_may',
  'gozados_jun',
  'gozados_jul',
  'gozados_ago',
  'gozados_set',
  'gozados_oct',
  'gozados_nov',
  'gozados_dic',
] as const

interface MedicalLeaveRequest {
  id: string
  dni: string
  fecha_inicio: string
  fecha_fin: string
  comentario: string | null
  evidencia_url: string | null
  evidencia_urls?: string[] | null
  estado: string
  created_at: string | null
  reviewed_at?: string | null
}

type WorkerFeature =
  | 'logros'
  | 'calendar'
  | 'vacations'
  | 'medical'
  | 'ranking'
  | 'rankingLate'
  | 'tour'
  | 'updates'
  | 'support'
  | 'rrhh'
  | 'birthdays'

const INACTIVE_AREA_PREFIX = '__INACTIVO__|'
const AREAS_LIST = [
  "Operaciones/Proyectos", "Presupuesto", "Contabilidad",
  "Ssoma", "Rrhh", "Logística", "Finanzas", "Área comercial",
  "Software", "Mantenimiento", "Almacén"
]

function isInactiveArea(area?: string | null) {
  return String(area ?? '').startsWith(INACTIVE_AREA_PREFIX)
}

function getVisibleArea(area?: string | null) {
  return isInactiveArea(area) ? String(area).slice(INACTIVE_AREA_PREFIX.length) : String(area ?? '')
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TODOS_LOS_LOGROS: LogroItem[] = [
  { id: 1,  emoji: "⏱️", titulo: "Reloj Suizo",          desc: "Llega puntual 5 días seguidos." },
  { id: 2,  emoji: "🌅", titulo: "Madrugador",            desc: "Marca tu ingreso antes de las 8:30 AM." },
  { id: 3,  emoji: "📸", titulo: "Cámara Lista",          desc: "Actualiza tu foto de perfil en el sistema." },
  { id: 4,  emoji: "🔥", titulo: "Imparable",             desc: "Asistencia perfecta por 30 días seguidos." },
  { id: 5,  emoji: "💬", titulo: "Comunicador",           desc: "Deja una nota al marcar tu salida 3 veces." },
  { id: 6,  emoji: "🦉", titulo: "Noctámbulo",            desc: "Marca tu salida después de las 7:00 PM." },
  { id: 7,  emoji: "⚡", titulo: "Flash",                 desc: "Marca asistencia en menos de 8 seg tras abrir la app." },
  { id: 8,  emoji: "🥇", titulo: "Pionero",               desc: "Sé uno de los primeros 10 en llegar en el día." },
  { id: 9,  emoji: "🦸‍♂️", titulo: "Héroe Fin de Semana", desc: "Marca tu asistencia un sábado o domingo." },
  { id: 10, emoji: "👑", titulo: "Invencible",            desc: "¡100 días consecutivos sin ninguna tardanza!" },
]

const OBRA_LAT = -12.114859
const OBRA_LON = -77.026540
const RADIO_METROS = 50

const HORAS_NOCTURNAS = [
  { hora: 19, label: '7 PM' }, { hora: 20, label: '8 PM' },
  { hora: 21, label: '9 PM' }, { hora: 22, label: '10 PM' },
  { hora: 23, label: '11 PM' },
]

const LIMA_TZ = 'America/Lima'
const SOPORTE_WHATSAPP_NUMBER = '51947327420'
const PENDING_ATTENDANCE_KEY = 'RUAG_PENDING_ATTENDANCE'
const PROFILE_PHOTO_DATA_KEY = 'RUAG_PROFILE_PHOTO_DATA'
const BIRTHDAY_PROMPT_SNOOZE_KEY = 'RUAG_BIRTHDAY_PROMPT_SNOOZE_UNTIL'
const BIRTHDAY_PROMPT_LEGACY_SKIP_KEY = 'RUAG_BIRTHDAY_PROMPT_SKIPPED'
const BIRTHDAY_PROMPT_SNOOZE_MS = 2 * 60 * 1000
const WORKER_PUSH_PERMISSION_PROMPTED_KEY = 'RUAG_WORKER_PUSH_PERMISSION_PROMPTED'

// ─── Utils ────────────────────────────────────────────────────────────────────

// FIX: localStorage con manejo de errores para Safari en modo privado
const store = (() => {
  try {
    return {
      get:    (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
      set:    (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {} },
      remove: (k: string) => { try { localStorage.removeItem(k) } catch {} },
    }
  } catch {
    return { get: () => null, set: () => {}, remove: () => {} }
  }
})()

const shouldShowBirthdayPrompt = (fechaCumpleanos?: string | null) => {
  const snoozeUntil = Number(store.get(BIRTHDAY_PROMPT_SNOOZE_KEY) || '0')
  return !fechaCumpleanos && Date.now() >= (Number.isFinite(snoozeUntil) ? snoozeUntil : 0)
}

const readPendingAttendance = (): PendingAttendance | null => {
  try {
    const raw = store.get(PENDING_ATTENDANCE_KEY)
    return raw ? JSON.parse(raw) as PendingAttendance : null
  } catch {
    return null
  }
}

const writePendingAttendance = (item: PendingAttendance) => {
  store.set(PENDING_ATTENDANCE_KEY, JSON.stringify(item))
}

const clearPendingAttendance = () => {
  store.remove(PENDING_ATTENDANCE_KEY)
}

const isNetworkError = (err: any) => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const text = `${err?.message ?? ''} ${err?.name ?? ''}`.toLowerCase()
  return text.includes('failed to fetch') || text.includes('network') || text.includes('load failed') || text.includes('fetch')
}

const cacheProfilePhoto = async (url?: string | null) => {
  if (!url || url.startsWith('data:')) return
  try {
    const response = await fetch(url, { cache: 'force-cache' })
    if (!response.ok) return
    const blob = await response.blob()
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === 'string') store.set(PROFILE_PHOTO_DATA_KEY, reader.result)
    }
    reader.readAsDataURL(blob)
  } catch {
    // Offline cache is best-effort; initials remain as fallback.
  }
}

const calcularDistancia = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const obtenerUbicacion = (): Promise<GeolocationPosition> =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) reject(new Error('GPS no disponible en este dispositivo.'))
    else navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 })
  })

const getInitials = (name: string) => {
  const words = name.trim().split(' ').filter(Boolean)
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

const num = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeStatus = (value?: string | null) => String(value ?? '').toLowerCase()

const toDateAtNoon = (value: string) => new Date(value.includes('T') ? value : `${value}T12:00:00`)
const overlapsVacationYear = (item: VacacionSolicitud, year: number) =>
  toDateAtNoon(item.fecha_inicio) <= new Date(Date.UTC(year, 11, 31, 12)) &&
  toDateAtNoon(item.fecha_fin) >= new Date(Date.UTC(year, 0, 1, 12))

const formatShortDate = (value: string) => format(toDateAtNoon(value), 'dd MMM yyyy', { locale: es })

const todayKey = () => format(new Date(), 'yyyy-MM-dd')

const vacationRenewalCredit = (saldo: VacacionesSaldo | null) => {
  if (!saldo?.fecha_vencimiento || saldo.fecha_vencimiento > todayKey()) return 0
  const configured = num(saldo.vacaciones_por_vencer)
  if (configured > 0) return configured
  const appliedPeriod = saldo.vacaciones_pendientes_periodo == null ? 0 : num(saldo.vacaciones_pendientes_periodo)
  const inferred = appliedPeriod - num(saldo.dias_pendientes)
  return inferred > 0 ? inferred : 30
}

// ── Sync con el cálculo del dashboard (Control estilo Excel) ────────────────
// Replica de "derived" en app/vacaciones/page.tsx para que las cifras coincidan.
const vacationRenewalAmount = (saldo: VacacionesSaldo | null) => {
  if (!saldo?.fecha_vencimiento || num(saldo.renovaciones_aplicadas) > 0) return 0
  const configured = num(saldo.vacaciones_por_vencer)
  return configured > 0 ? configured : 30
}
const vacationRenewalDue = (saldo: VacacionesSaldo | null) =>
  Boolean(saldo?.fecha_vencimiento && saldo.fecha_vencimiento <= todayKey() && vacationRenewalAmount(saldo) > 0)

function overlapVacationDaysInMonth(item: VacacionSolicitud, year: number, monthIndex: number) {
  const start = toDateAtNoon(item.fecha_inicio)
  const end = toDateAtNoon(item.fecha_fin)
  const monthStart = new Date(Date.UTC(year, monthIndex, 1, 12))
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0, 12))
  const overlapStart = start > monthStart ? start : monthStart
  const overlapEnd = end < monthEnd ? end : monthEnd
  if (overlapStart > overlapEnd) return 0
  return Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1
}

function derivedVacationBalances(saldo: VacacionesSaldo | null, solicitudes: VacacionSolicitud[]) {
  if (!saldo) return { periodosAnteriores: 0, pendientesPeriodo: 0, gozados: 0, porVencer: 0 }
  const year = num(saldo.periodo) || new Date().getFullYear()
  const approvedRequests = solicitudes.filter((item) => normalizeStatus(item.estado) === 'aprobada' && overlapsVacationYear(item, year))
  const amount = vacationRenewalAmount(saldo)
  const isDue = vacationRenewalDue(saldo)
  const visibleGozados = VACATION_MONTH_KEYS.reduce((sum, key, monthIndex) => {
    const imported = num(saldo[key])
    const approved = approvedRequests.reduce((acc, item) => acc + overlapVacationDaysInMonth(item, year, monthIndex), 0)
    return sum + Math.max(imported + approved, 0)
  }, 0)
  const periodosAnteriores = num(saldo.saldo_arrastre)
  const pendientesPrev = periodosAnteriores - visibleGozados
  const porVencer = isDue ? 0 : amount
  const renewalCredit = vacationRenewalCredit(saldo)
  const pendingBase = pendientesPrev + renewalCredit
  const pendientesPeriodo = Math.max(pendingBase, 0)
  return { periodosAnteriores, pendientesPeriodo, gozados: visibleGozados, porVencer }
}

const formatDateTimeLabel = (value?: string | null) => {
  if (!value) return '--'
  try {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: LIMA_TZ,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value))
  } catch {
    return value
  }
}

const formatTimeLima = (value?: string | null) => {
  if (!value) return '--:--'
  try {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: LIMA_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(value))
  } catch {
    return '--:--'
  }
}

// ─── Cumpleaños ─────────────────────────────────────────────────────────────
const birthdayInfo = (fecha: string, today = new Date()) => {
  const [year, month, day] = fecha.split('-').map(Number)
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let next = new Date(today.getFullYear(), (month || 1) - 1, day || 1)
  if (next < todayMid) next = new Date(today.getFullYear() + 1, (month || 1) - 1, day || 1)
  const daysUntil = Math.round((next.getTime() - todayMid.getTime()) / 86400000)
  const turningAge = year ? next.getFullYear() - year : null
  return { next, daysUntil, turningAge, isToday: daysUntil === 0 }
}

const formatBirthdayDate = (fecha: string) => {
  try {
    const [, month, day] = fecha.split('-').map(Number)
    return format(new Date(2000, (month || 1) - 1, day || 1), "d 'de' MMMM", { locale: es })
  } catch {
    return fecha
  }
}

const formatVacationRangeLabel = (start: string, end: string) => {
  try {
    return `${format(toDateAtNoon(start), 'd MMM', { locale: es })} al ${format(toDateAtNoon(end), 'd MMM', { locale: es })}`
  } catch {
    return `${start} al ${end}`
  }
}

const abrirSoporteWhatsApp = (perfil: Perfil, problemaDetectado?: string | null) => {
  const fecha = new Intl.DateTimeFormat('es-PE', {
    timeZone: LIMA_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())

  const mensaje = [
    '*SOPORTE RUAG JORNADA*',
    '',
    `Trabajador: ${perfil.nombres}`,
    `DNI: ${perfil.dni}`,
    `Area: ${perfil.area}`,
    `Fecha: ${fecha}`,
    'Canal: Web iPhone',
    problemaDetectado ? `Problema: ${problemaDetectado}` : 'Problema: Necesito ayuda con mi registro.',
  ].join('\n')

  window.open(`https://wa.me/${SOPORTE_WHATSAPP_NUMBER}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener,noreferrer')
}

// ─── Logros helpers ───────────────────────────────────────────────────────────

const desbloquearLogro = async (dni: string, logroId: number): Promise<boolean> => {
  try {
    const { data: existente } = await supabase.from('logros_usuarios')
      .select('logro_id').eq('dni', dni).eq('logro_id', logroId).maybeSingle()
    if (existente) return false
    const { error } = await supabase.from('logros_usuarios').insert({ dni, logro_id: logroId })
    return !error
  } catch { return false }
}

const evaluarLogrosIngreso = async (dni: string, h: number, m: number): Promise<number[]> => {
  const nuevos: number[] = []
  try {
    const hoy = format(new Date(), 'yyyy-MM-dd')
    const dow = new Date().getDay()

    // Logro 8: Pionero
    const { count } = await supabase.from('registro_asistencias')
      .select('*', { count: 'exact', head: true }).eq('fecha', hoy)
    if ((count || 0) <= 10 && await desbloquearLogro(dni, 8)) nuevos.push(8)

    // Logro 2: Madrugador
    if ((h + m / 60) <= 8.5 && await desbloquearLogro(dni, 2)) nuevos.push(2)

    // Logro 9: Fin de semana
    if ((dow === 0 || dow === 6) && await desbloquearLogro(dni, 9)) nuevos.push(9)

    // Historial para logros largos
    const { data: hist } = await supabase.from('registro_asistencias')
      .select('fecha, estado_ingreso').eq('dni', dni).order('fecha', { ascending: false }).limit(100)

    if (hist && hist.length >= 5 && hist.slice(0, 5).every((a: { estado_ingreso: string }) => a.estado_ingreso === 'PUNTUAL'))
      if (await desbloquearLogro(dni, 1)) nuevos.push(1)

    if (hist && hist.length >= 30) {
      let racha = 1
      for (let i = 0; i < hist.length - 1; i++) {
        if (differenceInDays(parseISO(hist[i].fecha), parseISO(hist[i + 1].fecha)) === 1) {
          racha++; if (racha >= 30) break
        } else break
      }
      if (racha >= 30 && await desbloquearLogro(dni, 4)) nuevos.push(4)
    }

    if (hist && hist.length === 100 && hist.every((a: { estado_ingreso: string }) => a.estado_ingreso === 'PUNTUAL'))
      if (await desbloquearLogro(dni, 10)) nuevos.push(10)

  } catch (e) { console.error('Logros ingreso:', e) }
  return nuevos
}

const evaluarLogrosSalida = async (dni: string): Promise<number[]> => {
  const nuevos: number[] = []
  try {
    if (new Date().getHours() >= 19 && await desbloquearLogro(dni, 6)) nuevos.push(6)
    const { count } = await supabase.from('registro_asistencias')
      .select('*', { count: 'exact', head: true }).eq('dni', dni).not('notas', 'is', null)
    if ((count || 0) >= 3 && await desbloquearLogro(dni, 5)) nuevos.push(5)
  } catch (e) { console.error('Logros salida:', e) }
  return nuevos
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SheetOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end justify-center"
        style={{ background: 'rgba(30,27,75,0.45)', backdropFilter: 'blur(8px)' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

function WorkerInfoScreen({
  title,
  subtitle,
  gif,
  color,
  items,
  onClose,
}: {
  title: string
  subtitle: string
  gif: string
  color: string
  items: [string, string][]
  onClose: () => void
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-stretch justify-center"
      style={{ background: 'rgba(15,23,42,0.42)', backdropFilter: 'blur(10px)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-lg p-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+24px)] flex flex-col"
        style={{ background: 'linear-gradient(180deg, #F8FBFF, #FFFFFF, #EEF8F4)', minHeight: '100vh' }}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <button onClick={onClose} className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#0F172A', color: 'white' }}>
            <ChevronLeft size={22} />
          </button>
          <motion.div
            className="w-16 h-16 rounded-3xl flex items-center justify-center overflow-hidden border"
            style={{ background: 'white', borderColor: `${color}33`, boxShadow: `0 18px 40px ${color}22` }}
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <img src={gif} alt="" className="w-14 h-14 object-contain" />
          </motion.div>
          <div className="min-w-0">
            <h3 className="font-black text-xl" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>{title}</h3>
            <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text-3)' }}>{subtitle}</p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[30px] border p-5 mb-5" style={{ background: 'rgba(255,255,255,0.86)', borderColor: `${color}24` }}>
          <motion.div
            className="absolute -right-14 -top-14 h-32 w-32 rounded-full opacity-25 blur-2xl"
            style={{ background: color }}
            animate={{ scale: [1, 1.25, 1], opacity: [0.18, 0.32, 0.18] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
          <p className="relative z-10 text-sm font-bold leading-relaxed" style={{ color: 'var(--text-2)' }}>
            Lee esta seccion cuando tengas dudas. Cada tarjeta resume una funcion importante del PWA.
          </p>
        </div>

        <div className="overflow-y-auto scrollbar-hide flex-1 space-y-3 pr-1">
          {items.map(([itemTitle, description], index) => (
            <motion.article
              key={itemTitle}
              className="rounded-[24px] border p-4 flex gap-3"
              style={{ background: 'rgba(255,255,255,0.88)', borderColor: 'var(--border)', boxShadow: '0 14px 30px rgba(15,23,42,0.06)' }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <span className="w-10 h-10 rounded-2xl flex items-center justify-center text-white text-sm font-black shrink-0" style={{ background: `linear-gradient(135deg, ${color}, #22C55E)` }}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span>
                <span className="block text-base font-black" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>{itemTitle}</span>
                <span className="block text-sm font-semibold mt-1 leading-relaxed" style={{ color: 'var(--text-3)' }}>{description}</span>
              </span>
            </motion.article>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

function BirthdaysScreen({ myDni, onClose }: { myDni?: string | null; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [people, setPeople] = useState<BirthdayPerson[]>([])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const { data } = await supabase
          .from('fotocheck_perfiles')
          .select('dni, nombres_completos, area, foto_url, fecha_cumpleanos')
          .not('fecha_cumpleanos', 'is', null)
        if (!active) return
        const list = (data ?? [])
          .filter((row: any) => !isInactiveArea(row.area) && row.fecha_cumpleanos)
          .map((row: any) => ({ dni: row.dni, nombres: row.nombres_completos, area: getVisibleArea(row.area), foto_url: row.foto_url || '', fecha: String(row.fecha_cumpleanos).slice(0, 10) }))
        setPeople(list)
      } catch {
        // silencioso: lista vacia
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const ordered = people
    .map((p) => ({ ...p, info: birthdayInfo(p.fecha) }))
    .sort((a, b) => a.info.daysUntil - b.info.daysUntil)
  const todayList = ordered.filter((p) => p.info.isToday)
  const upcomingList = ordered.filter((p) => !p.info.isToday)
  const nextThirtyDays = ordered.filter((p) => p.info.daysUntil <= 30).length

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-stretch justify-center"
      style={{ background: 'rgba(15,23,42,0.42)', backdropFilter: 'blur(10px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-lg p-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+24px)] flex flex-col"
        style={{ background: 'linear-gradient(180deg, #FFF5FA, #FFFFFF, #F3F0FF)', minHeight: '100vh' }}
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <button onClick={onClose} className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#0F172A', color: 'white' }}>
            <ChevronLeft size={22} />
          </button>
          <motion.div
            className="w-16 h-16 rounded-3xl flex items-center justify-center overflow-hidden border"
            style={{ background: 'white', borderColor: '#EC489933', boxShadow: '0 18px 40px #EC489922' }}
            animate={{ y: [0, -5, 0] }} transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <LottiePlayer src="/lottie/birthday-cake.json" style={{ width: 56, height: 56 }} />
          </motion.div>
          <div className="min-w-0">
            <h3 className="font-black text-xl" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>Cumpleaños</h3>
            <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text-3)' }}>Mira qué cumpleaños se acercan en tu equipo.</p>
          </div>
        </div>

        {!loading && ordered.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5 mb-4">
            {[
              ['Hoy', todayList.length, '#EC4899'],
              ['30 dias', nextThirtyDays, '#0EA5E9'],
              ['Total', ordered.length, '#7C3AED'],
            ].map(([label, value, color]) => (
              <motion.div
                key={String(label)}
                className="rounded-2xl border px-3 py-3 text-center"
                style={{ background: 'rgba(255,255,255,0.9)', borderColor: `${color}2e` }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <p className="text-xl font-black leading-none" style={{ color: String(color), fontFamily: 'Sora, sans-serif' }}>{value}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{label}</p>
              </motion.div>
            ))}
          </div>
        )}

        {!loading && ordered[0] && (
          <motion.div
            className="relative overflow-hidden rounded-[30px] border p-4 mb-5"
            style={{ background: 'linear-gradient(150deg, #FFE4F1, #FFFFFF 55%, #F0E9FF)', borderColor: '#EC489944', boxShadow: '0 18px 42px rgba(236,72,153,0.16)' }}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            {ordered[0].info.isToday && (
              <div className="pointer-events-none absolute inset-0 opacity-75">
                <LottiePlayer src="/lottie/confetti.json" className="w-full h-full" style={{ width: '100%', height: '100%' }} />
              </div>
            )}
            <div className="relative z-10 flex items-center gap-3">
              <div className="w-16 h-16 rounded-3xl overflow-hidden shrink-0 border flex items-center justify-center" style={{ background: 'white', borderColor: '#EC489933' }}>
                <LottiePlayer src={ordered[0].info.isToday ? '/lottie/birthday-gifts.json' : '/lottie/birthday-cake.json'} style={{ width: 58, height: 58 }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: '#DB2777' }}>
                  {ordered[0].info.isToday ? 'Cumpleaños de hoy' : 'Próximo cumpleaños'}
                </p>
                <p className="mt-1 text-base font-black leading-snug" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>
                  {ordered[0].nombres}{ordered[0].dni === myDni ? ' (tú)' : ''}
                </p>
                <p className="mt-1 text-xs font-bold" style={{ color: 'var(--text-3)' }}>
                  {formatBirthdayDate(ordered[0].fecha)}{ordered[0].info.turningAge ? ` · ${ordered[0].info.turningAge} años` : ''}
                </p>
              </div>
              <div className="rounded-2xl border px-3 py-2 text-center shrink-0" style={{ background: ordered[0].info.isToday ? 'linear-gradient(135deg, #EC4899, #7C3AED)' : 'rgba(255,255,255,0.82)', borderColor: '#EC489933' }}>
                <p className="text-lg font-black leading-none" style={{ color: ordered[0].info.isToday ? 'white' : 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>
                  {ordered[0].info.isToday ? 'HOY' : ordered[0].info.daysUntil}
                </p>
                {!ordered[0].info.isToday && <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{ordered[0].info.daysUntil === 1 ? 'día' : 'días'}</p>}
              </div>
            </div>
          </motion.div>
        )}

        {todayList.length > 0 && (
          <motion.div
            className="relative overflow-hidden rounded-[30px] border mb-5"
            style={{ background: 'linear-gradient(150deg, #FFE4F1, #FFFFFF 55%, #F0E9FF)', borderColor: '#EC489955', boxShadow: '0 22px 50px rgba(236,72,153,0.22)' }}
            initial={{ opacity: 0, scale: 0.94, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            {/* Confetti de fondo */}
            <div className="pointer-events-none absolute inset-0 z-0 opacity-90">
              <LottiePlayer src="/lottie/confetti.json" className="w-full h-full" style={{ width: '100%', height: '100%' }} />
            </div>

            <div className="relative z-10 p-5">
              <div className="flex items-center gap-2 mb-3" style={{ color: '#DB2777' }}>
                <PartyPopper size={18} />
                <span className="text-xs font-black uppercase tracking-[0.16em]">
                  {todayList.some((p) => p.dni === myDni) ? '¡Hoy es tu cumpleaños!' : '¡Hoy cumple!'}
                </span>
              </div>

              {/* Pastel + regalos animados */}
              <div className="flex items-center justify-center gap-2 mb-1">
                <LottiePlayer src="/lottie/birthday-cake.json" style={{ width: 120, height: 120 }} />
                <LottiePlayer src="/lottie/birthday-gifts.json" style={{ width: 96, height: 96 }} />
              </div>

              <div className="space-y-2.5">
                {todayList.map((p) => (
                  <motion.div
                    key={p.dni}
                    className="flex items-center gap-3 rounded-2xl p-2.5"
                    style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid #EC489933' }}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 ring-2" style={{ background: 'var(--blue-light)', boxShadow: '0 0 0 3px #EC489922' }}>
                      {p.foto_url ? <img src={p.foto_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-sm font-black" style={{ color: 'var(--blue)' }}>{getInitials(p.nombres)}</div>}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black truncate" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>{p.nombres}{p.dni === myDni ? ' (tú)' : ''}</p>
                      <p className="text-xs font-black" style={{ color: '#DB2777' }}>{p.info.turningAge ? `Cumple ${p.info.turningAge} años hoy 🎂` : '¡Feliz cumpleaños! 🎂'}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <div className="overflow-y-auto scrollbar-hide flex-1 space-y-3 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin" size={26} style={{ color: '#DB2777' }} /></div>
          ) : ordered.length === 0 ? (
            <div className="rounded-[24px] border border-dashed p-8 text-center" style={{ borderColor: 'var(--border-2)' }}>
              <Cake size={32} className="mx-auto mb-3" style={{ color: 'var(--text-3)' }} />
              <p className="text-sm font-bold" style={{ color: 'var(--text-3)' }}>Aún no hay cumpleaños registrados. Agrega tu fecha desde el menú.</p>
            </div>
          ) : upcomingList.map((p, index) => (
            <motion.article
              key={p.dni}
              className="rounded-[24px] border p-4 flex items-center gap-3"
              style={{ background: 'rgba(255,255,255,0.92)', borderColor: 'var(--border)', boxShadow: '0 14px 30px rgba(15,23,42,0.06)' }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.4) }}
            >
              <div className="w-12 h-12 rounded-full overflow-hidden shrink-0" style={{ background: 'var(--blue-light)' }}>
                {p.foto_url ? <img src={p.foto_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-sm font-black" style={{ color: 'var(--blue)' }}>{getInitials(p.nombres)}</div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black truncate" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>{p.nombres}{p.dni === myDni ? ' (tú)' : ''}</p>
                <p className="text-xs font-bold mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                  <Gift size={12} style={{ color: '#DB2777' }} /> {formatBirthdayDate(p.fecha)}{p.info.turningAge ? ` · ${p.info.turningAge} años` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                {p.info.isToday ? (
                  <span className="px-3 py-1.5 rounded-full text-[11px] font-black" style={{ background: 'linear-gradient(135deg, #EC4899, #7C3AED)', color: 'white' }}>¡HOY!</span>
                ) : (
                  <>
                    <p className="text-lg font-black leading-none" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>{p.info.daysUntil}</p>
                    <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{p.info.daysUntil === 1 ? 'día' : 'días'}</p>
                  </>
                )}
              </div>
            </motion.article>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

function ProfileEditorModal({
  open,
  perfil,
  photoSrc,
  uploading,
  saving,
  onPickPhoto,
  onClose,
  onSave,
}: {
  open: boolean
  perfil: Perfil
  photoSrc?: string | null
  uploading: boolean
  saving: boolean
  onPickPhoto: () => void
  onClose: () => void
  onSave: (next: { dni: string; area: string; fecha_cumpleanos: string | null }) => void
}) {
  const [dni, setDni] = useState(perfil.dni)
  const [area, setArea] = useState(perfil.area)
  const [birthday, setBirthday] = useState(perfil.fecha_cumpleanos?.slice(0, 10) ?? '')

  useEffect(() => {
    if (!open) return
    setDni(perfil.dni)
    setArea(perfil.area)
    setBirthday(perfil.fecha_cumpleanos?.slice(0, 10) ?? '')
  }, [open, perfil.dni, perfil.area, perfil.fecha_cumpleanos])

  if (!open) return null
  const busy = uploading || saving
  const areaOptions = area && !AREAS_LIST.includes(area) ? [area, ...AREAS_LIST] : AREAS_LIST

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex items-center justify-center p-5"
      style={{ background: 'rgba(15,23,42,0.46)', backdropFilter: 'blur(12px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={() => { if (!busy) onClose() }}
    >
      <motion.div
        className="w-full max-w-md rounded-[2rem] p-6 relative overflow-hidden"
        style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
        initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 16 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        onClick={(event) => event.stopPropagation()}
      >
        <motion.div
          className="absolute inset-x-0 top-0 h-40 pointer-events-none"
          style={{ background: 'linear-gradient(135deg, #2563EB, #0EA5E9, #7C3AED, #EC4899)', backgroundSize: '220% 220%' }}
          animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -right-10 top-6 h-32 w-32 rounded-full pointer-events-none"
          style={{ background: 'rgba(255,255,255,0.18)', filter: 'blur(18px)' }}
          animate={{ scale: [0.92, 1.08, 0.92], opacity: [0.65, 0.95, 0.65] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="absolute right-4 top-4 z-20 w-10 h-10 rounded-2xl border flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.9)', borderColor: 'rgba(255,255,255,0.55)', color: '#0F172A' }}
        >
          <X size={18} />
        </button>

        <div className="relative z-10 flex flex-col items-center text-center">
          <motion.div
            className="absolute top-2 h-28 w-28 rounded-full"
            style={{ background: 'rgba(255,255,255,0.16)', filter: 'blur(10px)' }}
            animate={{ scale: [0.95, 1.08, 0.95] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="relative w-24 h-24 rounded-full overflow-hidden border-4 mb-3 shadow-xl" style={{ background: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.82)' }}>
            {photoSrc ? <img src={photoSrc} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl font-black" style={{ color: 'var(--blue)' }}>{getInitials(perfil.nombres)}</div>}
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.42)' }}>
                <Loader2 className="animate-spin text-white" size={26} />
              </div>
            )}
          </div>
          <p className="text-xl font-black" style={{ color: 'white', fontFamily: 'Sora, sans-serif' }}>Editar fotocheck</p>
          <p className="text-xs font-semibold mt-1" style={{ color: 'rgba(255,255,255,0.82)' }}>Foto, DNI, área y cumpleaños</p>
        </div>

        <button
          type="button"
          onClick={onPickPhoto}
          disabled={busy}
          className="relative z-10 w-full mt-8 h-12 rounded-2xl text-white font-black flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #2563EB, #0EA5E9)', fontFamily: 'Sora, sans-serif' }}
        >
          {uploading ? <Loader2 className="animate-spin" size={18} /> : <Camera size={18} />}
          {uploading ? 'SUBIENDO FOTO...' : 'CAMBIAR FOTO'}
        </button>

        <div className="relative z-10 mt-4 space-y-3">
          <label className="block rounded-2xl border px-4 py-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <span className="block text-[10px] font-black uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>DNI</span>
            <input
              value={dni}
              onChange={(event) => setDni(event.target.value.replace(/\D/g, '').slice(0, 12))}
              disabled={busy}
              className="w-full bg-transparent outline-none text-sm font-bold"
              style={{ color: 'var(--text-1)' }}
            />
          </label>

          <label className="block rounded-2xl border px-4 py-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <span className="block text-[10px] font-black uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Área</span>
            <div className="relative">
              <select
                value={area}
                onChange={(event) => setArea(event.target.value)}
                disabled={busy}
                className="w-full appearance-none bg-transparent outline-none pr-9 text-sm font-bold"
                style={{ color: area ? 'var(--text-1)' : 'var(--text-3)' }}
              >
                <option value="" disabled>Selecciona tu Área</option>
                {areaOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <ChevronDown size={17} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
            </div>
          </label>

          <label className="block rounded-2xl border px-4 py-3" style={{ background: 'var(--surface-2)', borderColor: birthday ? 'rgba(236,72,153,0.32)' : 'var(--border)' }}>
            <span className="block text-[10px] font-black uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Cumpleaños</span>
            <div className="flex items-center gap-2">
              <Cake size={16} style={{ color: '#DB2777' }} />
              <input
                type="date"
                value={birthday}
                onChange={(event) => setBirthday(event.target.value)}
                disabled={busy}
                className="min-w-0 flex-1 bg-transparent outline-none text-sm font-bold"
                style={{ color: 'var(--text-1)' }}
              />
              {birthday && (
                <button type="button" onClick={() => setBirthday('')} disabled={busy} className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'var(--surface)' }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </label>
        </div>

        <div className="grid grid-cols-[0.9fr_1.1fr] gap-3 mt-5">
          <button type="button" onClick={onClose} disabled={busy} className="h-12 rounded-2xl border font-bold" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSave({ dni, area, fecha_cumpleanos: birthday || null })}
            disabled={busy}
            className="h-12 rounded-2xl text-white font-black flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #EC4899)', fontFamily: 'Sora, sans-serif' }}
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : null}
            GUARDAR
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function BirthdayPromptModal({ open, value, onChange, onSave, onSkip, saving }: {
  open: boolean; value: string; onChange: (v: string) => void; onSave: () => void; onSkip: () => void; saving: boolean
}) {
  const [showCal, setShowCal] = useState(false)
  if (!open) return null
  return (
    <motion.div
      className="fixed inset-0 z-[90] flex items-center justify-center p-5"
      style={{ background: 'rgba(30,27,75,0.5)', backdropFilter: 'blur(12px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onSkip}
    >
      <motion.div
        className="w-full max-w-sm rounded-3xl p-7 relative overflow-hidden"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', border: '1.5px solid var(--border)' }}
        initial={{ scale: 0.92, y: 14 }} animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 440, damping: 30 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-30 blur-2xl" style={{ background: '#EC4899' }} />
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center overflow-hidden border mb-4" style={{ background: 'white', borderColor: '#EC489933', boxShadow: '0 18px 40px #EC489922' }}>
            <LottiePlayer src="/lottie/birthday-cake.json" style={{ width: 68, height: 68 }} />
          </div>
          <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.16em] mb-2" style={{ background: 'rgba(236,72,153,0.12)', color: '#DB2777' }}>Nueva función</span>
          <h3 className="text-xl font-black" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>Agrega tu fecha de cumpleaños</h3>
          <p className="text-sm font-semibold mt-2 mb-5" style={{ color: 'var(--text-3)' }}>
            Así tu equipo sabrá cuándo celebrarte. Solo se usa para el módulo de cumpleaños 🎂
          </p>
          <button
            type="button"
            onClick={() => setShowCal(true)}
            className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-2xl outline-none font-semibold"
            style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border-2)', color: value ? 'var(--text-1)' : 'var(--text-3)' }}
          >
            <Cake size={18} style={{ color: '#EC4899' }} />
            {value ? `${formatBirthdayDate(value)} de ${value.split('-')[0]}` : 'Selecciona tu fecha'}
          </button>
          {showCal && (
            <CalendarPicker value={value} onClose={() => setShowCal(false)} onSelect={onChange} />
          )}
          <motion.button
            onClick={onSave}
            disabled={saving || !value}
            className="w-full mt-5 py-4 rounded-2xl font-black text-white flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #EC4899, #7C3AED)', fontFamily: 'Sora, sans-serif' }}
            whileTap={{ scale: 0.98 }}
          >
            {saving ? <Loader2 className="animate-spin" size={20} /> : <><Cake size={18} /> GUARDAR</>}
          </motion.button>
          <button onClick={onSkip} disabled={saving} className="mt-3 text-sm font-bold" style={{ color: 'var(--text-3)' }}>
            Más tarde
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function ModalCard({ children, onClick }: { children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <motion.div
      className="w-full max-w-sm rounded-3xl p-7 relative"
      style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', border: '1.5px solid var(--border)' }}
      initial={{ scale: 0.93, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.93, opacity: 0, y: 12 }}
      transition={{ type: 'spring', stiffness: 450, damping: 30 }}
      onClick={onClick}
    >
      {children}
    </motion.div>
  )
}

function NoteInput({ value, onChange, placeholder, accentColor, disabled }: {
  value: string; onChange: (v: string) => void; placeholder: string; accentColor: string; disabled?: boolean
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      rows={4}
      className="w-full rounded-2xl p-4 resize-none outline-none text-sm font-medium transition-all"
      style={{
        background: 'var(--surface-2)', border: `1.5px solid ${value ? accentColor + '55' : 'var(--border)'}`,
        color: 'var(--text-1)', fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    />
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EscanerWeb() {
  const router = useRouter()
  const startTimeRef = useRef<number>(Date.now())

  // Data
  const [perfil, setPerfil]               = useState<Perfil | null>(null)
  const [asistenciaHoy, setAsistenciaHoy] = useState<Asistencia | null>(null)
  const [unlockedLogros, setUnlockedLogros] = useState<number[]>([])
  const [isLoading, setIsLoading]         = useState(true)

  // Scanner state
  const [scanState, setScanState]         = useState<'ESCANEO' | 'CARGANDO' | 'EXITO' | 'ERROR'>('ESCANEO')
  const [mensaje, setMensaje]             = useState('')
  const [isMarkingExit, setIsMarkingExit] = useState(false)
  const [isOnline, setIsOnline]           = useState(true)
  const [hasPendingOfflineEntry, setHasPendingOfflineEntry] = useState(false)

  // Modals
  const [showLogros, setShowLogros]         = useState(false)
  const [showCalendar, setShowCalendar]     = useState(false)
  const [showVacations, setShowVacations]   = useState(false)
  const [showMedicalLeave, setShowMedicalLeave] = useState(false)
  const [showTour, setShowTour]             = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (!localStorage.getItem('TOUR_SEEN')) {
        const t = setTimeout(() => setShowTour(true), 400)
        return () => clearTimeout(t)
      }
    } catch {}
  }, [])

  const [showUpdates, setShowUpdates]       = useState(false)
  const [showSideMenu, setShowSideMenu]     = useState(false)
  const [showBirthdays, setShowBirthdays]   = useState(false)
  const [showBirthdayPrompt, setShowBirthdayPrompt] = useState(false)
  const [birthdayDraft, setBirthdayDraft]   = useState('')
  const [savingBirthday, setSavingBirthday] = useState(false)
  const [showNota, setShowNota]             = useState(false)
  const [showObra, setShowObra]             = useState(false)
  const [showExterno, setShowExterno]       = useState(false)
  const [showNocturno, setShowNocturno]     = useState(false)
  const [achievement, setAchievement]       = useState<LogroItem | null>(null)

  // Note / remote exit
  const [notaTexto, setNotaTexto]         = useState('')
  const [guardando, setGuardando]         = useState(false)
  const [isRemoteExit, setIsRemoteExit]   = useState(false)
  const [currentLatLon, setCurrentLatLon] = useState('')

  // Nocturno
  const [horaSeleccionada, setHoraSeleccionada] = useState<number | null>(null)

  // Calendar
  const [historialMes, setHistorialMes]   = useState<Asistencia[]>([])
  const [feriadosMes, setFeriadosMes]     = useState<Set<string>>(new Set())
  const [targetDate, setTargetDate]       = useState(new Date())
  const [selectedDay, setSelectedDay]     = useState<Asistencia | null>(null)
  const [selectedVacationDay, setSelectedVacationDay] = useState<VacationCalendarDay | null>(null)
  const [loadingCal, setLoadingCal]       = useState(false)

  // Vacations
  const [vacacionesSaldo, setVacacionesSaldo] = useState<VacacionesSaldo | null>(null)
  const [vacacionesSolicitudes, setVacacionesSolicitudes] = useState<VacacionSolicitud[]>([])
  const [loadingVacaciones, setLoadingVacaciones] = useState(false)
  const [vacacionesError, setVacacionesError] = useState<string | null>(null)
  const [vacationStart, setVacationStart] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [vacationEnd, setVacationEnd] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [vacationComment, setVacationComment] = useState('')
  const [submittingVacation, setSubmittingVacation] = useState(false)
  const knownVacationStatusesRef = useRef<Record<string, string>>({})

  // Medical leave
  const [medicalStart, setMedicalStart] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [medicalEnd, setMedicalEnd] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [medicalComment, setMedicalComment] = useState('')
  const [medicalFiles, setMedicalFiles] = useState<File[]>([])
  const [medicalRequests, setMedicalRequests] = useState<MedicalLeaveRequest[]>([])
  const [loadingMedical, setLoadingMedical] = useState(false)
  const [submittingMedical, setSubmittingMedical] = useState(false)

  // Photo
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [showProfileEditor, setShowProfileEditor] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const medicalCameraRef = useRef<HTMLInputElement>(null)
  const medicalGalleryRef = useRef<HTMLInputElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const openFeature = (feature: WorkerFeature) => {
    setShowSideMenu(false)
    if (feature === 'logros') setShowLogros(true)
    if (feature === 'calendar') setShowCalendar(true)
    if (feature === 'vacations') setShowVacations(true)
    if (feature === 'medical') setShowMedicalLeave(true)
    if (feature === 'ranking') router.push('/ranking')
    if (feature === 'rankingLate') router.push('/ranking?type=tardanza')
    if (feature === 'tour') setShowTour(true)
    if (feature === 'updates') setShowUpdates(true)
    if (feature === 'birthdays') setShowBirthdays(true)
    if (feature === 'support' && perfil) abrirSoporteWhatsApp(perfil)
    if (feature === 'rrhh') {
      const phone = '51987834538'
      const text = encodeURIComponent(`Hola RRHH, soy ${perfil?.nombres ?? ''} DNI ${perfil?.dni ?? ''}. Necesito ayuda.`)
      window.open(`https://wa.me/${phone}?text=${text}`, '_blank')
    }
  }

  const saveBirthday = async () => {
    if (!perfil || !birthdayDraft) return
    setSavingBirthday(true)
    try {
      const { error } = await supabase.from('fotocheck_perfiles').update({ fecha_cumpleanos: birthdayDraft }).eq('dni', perfil.dni)
      if (error) throw error
      setPerfil({ ...perfil, fecha_cumpleanos: birthdayDraft })
      setShowBirthdayPrompt(false)
      store.remove(BIRTHDAY_PROMPT_SNOOZE_KEY)
      store.remove(BIRTHDAY_PROMPT_LEGACY_SKIP_KEY)
      toast.success('¡Fecha de cumpleaños guardada! 🎂')
      // Activa el aviso push del cumpleaños (pide permiso si hace falta).
      void ensureBirthdayPush(perfil.dni, true)
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar tu cumpleaños')
    } finally {
      setSavingBirthday(false)
    }
  }

  const skipBirthdayPrompt = () => {
    if (savingBirthday) return
    setShowBirthdayPrompt(false)
    store.set(BIRTHDAY_PROMPT_SNOOZE_KEY, String(Date.now() + BIRTHDAY_PROMPT_SNOOZE_MS))
    store.remove(BIRTHDAY_PROMPT_LEGACY_SKIP_KEY)
  }

  const cargarVacaciones = async (dniArg?: string | null, withLoader = true) => {
    const targetDni = dniArg ?? perfil?.dni
    if (!targetDni) return

    if (withLoader) setLoadingVacaciones(true)
    setVacacionesError(null)

    try {
      try {
        await supabase.rpc('procesar_vencimientos_vacaciones')
      } catch {
        // optional
      }

      const [saldoRes, solicitudesRes] = await Promise.all([
        supabase
          .from('vacaciones_saldos')
          .select('*')
          .eq('dni', targetDni)
          .order('periodo', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('vacaciones_solicitudes')
          .select('*')
          .eq('dni', targetDni)
          .order('created_at', { ascending: false }),
      ])

      if (saldoRes.error) throw saldoRes.error
      if (solicitudesRes.error) throw solicitudesRes.error

      const solicitudes = (solicitudesRes.data ?? []) as VacacionSolicitud[]
      setVacacionesSaldo((saldoRes.data ?? null) as VacacionesSaldo | null)
      setVacacionesSolicitudes(solicitudes)
      knownVacationStatusesRef.current = solicitudes.reduce<Record<string, string>>((acc, item) => {
        acc[item.id] = normalizeStatus(item.estado)
        return acc
      }, {})
    } catch (err: any) {
      setVacacionesError(err?.message || 'No se pudieron cargar tus vacaciones.')
    } finally {
      if (withLoader) setLoadingVacaciones(false)
    }
  }

  const getApprovedVacationRequestsForDay = (dateKey: string) =>
    vacacionesSolicitudes.filter((item) =>
      normalizeStatus(item.estado) === 'aprobada' &&
      item.fecha_inicio <= dateKey &&
      item.fecha_fin >= dateKey
    )

  const handleSolicitarVacaciones = async () => {
    if (!perfil) return

    const diasSolicitados = differenceInDays(toDateAtNoon(vacationEnd), toDateAtNoon(vacationStart)) + 1
    if (diasSolicitados <= 0) {
      toast.error('Selecciona un rango valido.')
      return
    }

    setSubmittingVacation(true)
    try {
      const { error } = await supabase.from('vacaciones_solicitudes').insert({
        dni: perfil.dni,
        trabajador_nombre: vacacionesSaldo?.trabajador_nombre || perfil.nombres,
        area: vacacionesSaldo?.area || perfil.area,
        fecha_inicio: vacationStart,
        fecha_fin: vacationEnd,
        dias_solicitados: diasSolicitados,
        comentario: vacationComment.trim() || null,
      })

      if (error) throw error

      toast.success('Solicitud registrada correctamente.')
      setVacationComment('')
      setVacationStart(format(new Date(), 'yyyy-MM-dd'))
      setVacationEnd(format(new Date(), 'yyyy-MM-dd'))
      await cargarVacaciones(perfil.dni, false)
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo registrar la solicitud.')
    } finally {
      setSubmittingVacation(false)
    }
  }

  const cargarDescansosMedicos = async (dniArg?: string | null, withLoader = true) => {
    const targetDni = dniArg ?? perfil?.dni
    if (!targetDni) return

    if (withLoader) setLoadingMedical(true)
    try {
      const { data, error } = await supabase
        .from('descansos_medicos_solicitudes')
        .select('id,dni,fecha_inicio,fecha_fin,comentario,evidencia_url,evidencia_urls,estado,created_at,reviewed_at')
        .eq('dni', targetDni)
        .order('created_at', { ascending: false })

      if (error) throw error
      setMedicalRequests((data ?? []) as MedicalLeaveRequest[])
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo cargar tu historial medico.')
    } finally {
      if (withLoader) setLoadingMedical(false)
    }
  }

  const handleMedicalFiles = (files: FileList | null) => {
    if (!files?.length) return
    const selected = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (!selected.length) {
      toast.error('Selecciona imagenes del certificado medico.')
      return
    }
    setMedicalFiles((current) => [...current, ...selected].slice(0, 8))
  }

  const submitMedicalLeave = async () => {
    if (!perfil) return
    if (medicalStart > medicalEnd) {
      toast.error('Revisa el rango de fechas.')
      return
    }
    if (!medicalFiles.length) {
      toast.error('Sube o toma al menos una foto del certificado.')
      return
    }
    if (medicalComment.trim().length < 5) {
      toast.error('Agrega un comentario breve para RRHH.')
      return
    }

    setSubmittingMedical(true)
    try {
      const paths: string[] = []
      const urls: string[] = []
      const cleanDni = perfil.dni.trim()
      const bucket = supabase.storage.from('descansos_medicos')

      for (const [index, file] of medicalFiles.entries()) {
        const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
        const path = `${cleanDni}/${Date.now()}-${index}.${extension}`
        const { error: uploadError } = await bucket.upload(path, file, {
          upsert: true,
          contentType: file.type || 'image/jpeg',
        })
        if (uploadError) throw uploadError
        paths.push(path)
        urls.push(bucket.getPublicUrl(path).data.publicUrl)
      }

      const { error } = await supabase.from('descansos_medicos_solicitudes').insert({
        dni: cleanDni,
        trabajador_nombre: perfil.nombres,
        area: perfil.area,
        fecha_inicio: medicalStart,
        fecha_fin: medicalEnd,
        comentario: medicalComment.trim(),
        evidencia_url: urls[0],
        evidencia_path: paths[0],
        evidencia_urls: urls,
        evidencia_paths: paths,
        estado: 'solicitada',
      })
      if (error) throw error

      toast.success('Descanso medico enviado a RRHH.')
      setMedicalFiles([])
      setMedicalComment('')
      setMedicalStart(format(new Date(), 'yyyy-MM-dd'))
      setMedicalEnd(format(new Date(), 'yyyy-MM-dd'))
      await cargarDescansosMedicos(cleanDni, false)
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo enviar el descanso medico.')
    } finally {
      setSubmittingMedical(false)
    }
  }

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    startTimeRef.current = Date.now()

    const cargar = async () => {
      const dni    = store.get('RUAG_DNI')
      const nombre = store.get('RUAG_NOMBRE')
      if (!dni || !nombre) { router.push('/setup'); return }

      const onlineNow = typeof navigator === 'undefined' ? true : navigator.onLine
      setIsOnline(onlineNow)
      if (onlineNow) {
        try {
          if (!hasDeviceSessionToken()) {
            await activateDeviceSession(dni, nombre, 'web-pwa')
          }
          const activeSession = await isCurrentDeviceSession(dni)
          if (!activeSession) {
            clearWorkerSession()
            toast.error('Tu sesion se abrio en otro dispositivo.')
            router.push('/setup')
            return
          }
        } catch {
          setIsOnline(false)
        }
      }

      let p: Perfil | null = null
      let data: any = null
      try {
        const res = await supabase.from('fotocheck_perfiles').select('*').eq('dni', dni).maybeSingle()
        data = res.data
        if (res.error) throw res.error
        setIsOnline(true)
      } catch {
        setIsOnline(false)
      }

      if (data) {
        if (isInactiveArea(data.area)) {
          store.remove('RUAG_DNI')
          store.remove('RUAG_NOMBRE')
          store.remove('RUAG_AREA')
          store.remove('RUAG_FOTO')
          toast.error('Tu fotocheck fue dado de baja. Contacta con RRHH si lo necesitas.')
          router.push('/setup')
          return
        }

        const visibleArea = getVisibleArea(data.area)
        store.set('RUAG_AREA', visibleArea)
        store.set('RUAG_FOTO', data.foto_url || '')
        void cacheProfilePhoto(data.foto_url)
        p = { dni: data.dni, nombres: data.nombres_completos, area: visibleArea, foto_url: data.foto_url || '', fecha_cumpleanos: data.fecha_cumpleanos ?? null }
        // Nueva función: si ya tiene cuenta pero no registró su cumpleaños, ofrecer agregarlo.
        if (shouldShowBirthdayPrompt(data.fecha_cumpleanos)) {
          setShowBirthdayPrompt(true)
        }
      } else {
        const area = store.get('RUAG_AREA')
        const foto = store.get('RUAG_FOTO')
        p = { dni, nombres: nombre, area: getVisibleArea(area) || 'Asignando...', foto_url: foto || '' }
      }

      if (p) {
        setPerfil(p)
        const pending = readPendingAttendance()
        if (pending?.payload.dni === p.dni) {
          setAsistenciaHoy(pending.asistencia)
          setHasPendingOfflineEntry(true)
        }
        try {
          const hoy = format(new Date(), 'yyyy-MM-dd')
          const { data: ast } = await supabase.from('registro_asistencias')
            .select('id, hora_ingreso, estado_ingreso, hora_salida, notas, fecha')
            .eq('dni', p.dni).eq('fecha', hoy).order('hora_ingreso', { ascending: false }).limit(1).single()
          // Multi-turno: si ya cerró salida hoy, no bloquear con "ya marcaste".
          // Permitir reingreso mostrando scanner de nuevo.
          if (ast && !(ast as Asistencia).hora_salida) setAsistenciaHoy(ast as Asistencia)

          const { data: logs } = await supabase.from('logros_usuarios').select('logro_id').eq('dni', p.dni)
          if (logs) setUnlockedLogros(logs.map((l: { logro_id: number }) => l.logro_id))
        } catch { /* ok */ }
        void syncPendingAttendance(true)
        await cargarVacaciones(p.dni, false)
      }
      setIsLoading(false)
    }
    cargar()
  }, [router])

  useEffect(() => {
    if (!perfil?.dni) return
    let cancelled = false
    const check = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (!cancelled) setIsOnline(false)
        return
      }
      try {
        const activeSession = await isCurrentDeviceSession(perfil.dni)
        if (!cancelled) setIsOnline(true)
        if (!cancelled && !activeSession) {
          clearWorkerSession()
          toast.error('Sesion cerrada: se inicio en otro dispositivo.')
          router.push('/setup')
        }
      } catch {
        if (!cancelled) setIsOnline(false)
      }
    }
    const id = window.setInterval(check, 15000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [perfil?.dni, router])

  useEffect(() => {
    const updateNetworkState = () => {
      const nextOnline = typeof navigator === 'undefined' ? true : navigator.onLine
      setIsOnline(nextOnline)
      if (nextOnline) void syncPendingAttendance(true)
    }

    updateNetworkState()
    window.addEventListener('online', updateNetworkState)
    window.addEventListener('offline', updateNetworkState)
    return () => {
      window.removeEventListener('online', updateNetworkState)
      window.removeEventListener('offline', updateNetworkState)
    }
  }, [perfil?.dni])

  // FIX: Calendario recarga por mes al cambiar targetDate
  useEffect(() => {
    if (!showCalendar || !perfil) return
    const fetchMes = async () => {
      setLoadingCal(true)
      const y  = targetDate.getFullYear()
      const m  = targetDate.getMonth()
      const ld = new Date(y, m + 1, 0).getDate()
      const from = `${y}-${String(m + 1).padStart(2, '0')}-01`
      const to   = `${y}-${String(m + 1).padStart(2, '0')}-${String(ld).padStart(2, '0')}`

      const [{ data }, feriadosRes] = await Promise.all([
        supabase.from('registro_asistencias')
          .select('id, fecha, hora_ingreso, estado_ingreso, hora_salida, notas')
          .eq('dni', perfil.dni)
          .gte('fecha', from).lte('fecha', to)
          .order('fecha', { ascending: false }),
        fetch(`/api/feriados?from=${from}&to=${to}`).then(r => r.ok ? r.json() : { feriados: [] }).catch(() => ({ feriados: [] })),
      ])

      setHistorialMes((data || []) as Asistencia[])
      setFeriadosMes(new Set(((feriadosRes.feriados ?? []) as any[]).map((f: any) => String(f.fecha))))
      setLoadingCal(false)
    }
    fetchMes()
  }, [showCalendar, targetDate, perfil])

  useEffect(() => {
    if (!showVacations || !perfil) return
    void cargarVacaciones(perfil.dni, true)
  }, [showVacations, perfil])

  useEffect(() => {
    if (!showMedicalLeave || !perfil) return
    void cargarDescansosMedicos(perfil.dni, true)
  }, [showMedicalLeave, perfil])

  // Reabre el modal si el cumpleanos sigue pendiente despues de posponerlo.
  useEffect(() => {
    if (!perfil || perfil.fecha_cumpleanos || showBirthdayPrompt) return
    const snoozeUntil = Number(store.get(BIRTHDAY_PROMPT_SNOOZE_KEY) || '0')
    const remaining = (Number.isFinite(snoozeUntil) ? snoozeUntil : 0) - Date.now()
    const timeoutId = window.setTimeout(() => {
      if (shouldShowBirthdayPrompt(perfil.fecha_cumpleanos)) {
        setShowBirthdayPrompt(true)
      }
    }, Math.max(remaining, 0))
    return () => window.clearTimeout(timeoutId)
  }, [perfil?.dni, perfil?.fecha_cumpleanos, showBirthdayPrompt])

  // Mantiene viva la suscripcion Web Push para cumpleanos y recordatorios de salida.
  useEffect(() => {
    if (!perfil?.dni) return
    const shouldPrompt =
      pushSupported() &&
      Notification.permission === 'default' &&
      store.get(WORKER_PUSH_PERMISSION_PROMPTED_KEY) !== '1'
    if (shouldPrompt) store.set(WORKER_PUSH_PERMISSION_PROMPTED_KEY, '1')
    void ensureBirthdayPush(perfil.dni, shouldPrompt)
  }, [perfil?.dni])

  useEffect(() => {
    if (!perfil) return

    const channel = supabase
      .channel(`vacaciones-worker-${perfil.dni}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vacaciones_saldos', filter: `dni=eq.${perfil.dni}` },
        () => {
          void cargarVacaciones(perfil.dni, false)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vacaciones_solicitudes', filter: `dni=eq.${perfil.dni}` },
        (payload: any) => {
          const next = payload?.new
          const nextId = String(next?.id ?? '')
          const nextStatus = normalizeStatus(next?.estado)

          if (nextId && nextStatus) {
            const prevStatus = knownVacationStatusesRef.current[nextId]
            if (prevStatus && prevStatus !== nextStatus) {
              const rango = formatVacationRangeLabel(String(next.fecha_inicio ?? ''), String(next.fecha_fin ?? ''))
              if (nextStatus === 'aprobada') {
                toast.success('Vacaciones aprobadas', { description: `Tu solicitud del ${rango} fue aprobada.` })
              } else if (nextStatus === 'cancelada') {
                toast.error('Vacaciones rechazadas', { description: `Tu solicitud del ${rango} fue rechazada.` })
              }
            }
            knownVacationStatusesRef.current[nextId] = nextStatus
          }

          void cargarVacaciones(perfil.dni, false)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [perfil])

  useEffect(() => {
    if (!perfil) return

    const channel = supabase
      .channel(`descansos-worker-${perfil.dni}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'descansos_medicos_solicitudes', filter: `dni=eq.${perfil.dni}` },
        (payload: any) => {
          const next = payload?.new
          const status = normalizeStatus(String(next?.estado ?? ''))
          if (payload.eventType === 'UPDATE' && status === 'aprobada') {
            toast.success('Descanso medico aprobado', { description: 'RRHH aprobo tu solicitud.' })
          } else if (payload.eventType === 'UPDATE' && status === 'rechazada') {
            toast.error('Descanso medico rechazado', { description: 'Revisa tu historial o comunicate con RRHH.' })
          }
          void cargarDescansosMedicos(perfil.dni, false)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [perfil])

  // ── Helpers ────────────────────────────────────────────────────────────────

  const mostrarExito = (msg: string) => { setMensaje(msg); setScanState('EXITO') }
  const mostrarError = (msg: string) => {
    setMensaje(msg); setScanState('ERROR')
    setTimeout(() => setScanState('ESCANEO'), 4000)
  }

  const saveOfflineAttendance = (payload: PendingAttendance['payload']) => {
    const optimistic: Asistencia = {
      id: `offline-${Date.now()}`,
      fecha: payload.fecha,
      hora_ingreso: payload.hora_ingreso,
      estado_ingreso: payload.estado_ingreso,
      hora_salida: null,
      notas: payload.notas,
    }

    writePendingAttendance({
      id: optimistic.id,
      payload,
      asistencia: optimistic,
      created_at: new Date().toISOString(),
    })
    setAsistenciaHoy(optimistic)
    setHasPendingOfflineEntry(true)
    setIsOnline(false)
    setScanState('ESCANEO')
    toast.success('Entrada guardada sin conexion. Se sincronizara automaticamente.')
  }

  const syncPendingAttendance = async (silent = true) => {
    const pending = readPendingAttendance()
    if (!pending) {
      setHasPendingOfflineEntry(false)
      return
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setHasPendingOfflineEntry(true)
      return
    }

    try {
      const { data, error } = await supabase
        .from('registro_asistencias')
        .insert(pending.payload)
        .select('id, fecha, hora_ingreso, estado_ingreso, hora_salida, notas')
        .single()

      if (error) {
        if (error.message?.toLowerCase().includes('duplicate') || error.message?.toLowerCase().includes('unique')) {
          const { data: existing } = await supabase
            .from('registro_asistencias')
            .select('id, fecha, hora_ingreso, estado_ingreso, hora_salida, notas')
            .eq('dni', pending.payload.dni)
            .eq('fecha', pending.payload.fecha)
            .order('hora_ingreso', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (existing) setAsistenciaHoy(existing as Asistencia)
          clearPendingAttendance()
          setHasPendingOfflineEntry(false)
          return
        }
        throw error
      }

      if (data) setAsistenciaHoy(data as Asistencia)
      clearPendingAttendance()
      setHasPendingOfflineEntry(false)
      setIsOnline(true)
      if (!silent) toast.success('Asistencia offline sincronizada.')
    } catch (err: any) {
      setHasPendingOfflineEntry(true)
      if (!silent && !isNetworkError(err)) toast.error(err?.message || 'No se pudo sincronizar la asistencia.')
    }
  }

  const handleOfflineEntry = () => {
    if (!perfil) return
    const h = new Date().getHours()
    const m = new Date().getMinutes()
    const est = (h < 9 || (h === 9 && m <= 5)) ? 'PUNTUAL' : 'TARDANZA'
    saveOfflineAttendance({
      dni: perfil.dni,
      nombres_completos: perfil.nombres,
      area: perfil.area,
      foto_url: perfil.foto_url,
      estado_ingreso: est,
      fecha: format(new Date(), 'yyyy-MM-dd'),
      hora_ingreso: new Date().toISOString(),
      notas: 'Entrada offline PWA',
    })
  }

  const unlockAndAnimate = (ids: number[]) => {
    if (!ids.length) return
    setUnlockedLogros(prev => Array.from(new Set([...prev, ...ids])))
    setTimeout(() => {
      const l = TODOS_LOS_LOGROS.find(x => x.id === ids[0])
      if (l) setAchievement(l)
    }, 2500)
  }

  // ── QR Processing ──────────────────────────────────────────────────────────

  const procesarQR = async (raw: string) => {
    if (scanState !== 'ESCANEO' || !perfil) return
    const elapsed = (Date.now() - startTimeRef.current) / 1000

    if (!raw.startsWith('RUAG_INGRESO_')) { mostrarError('Código QR no válido.'); return }
    const parts = raw.split('_')
    if (parts.length !== 3) return

    const qrWindow  = parseInt(parts[2])
    const nowWindow = Math.floor(Date.now() / 10000)
    if (Math.abs(nowWindow - qrWindow) > 1) {
      mostrarError('El código QR ha expirado.\nUsa el código actual de la pantalla.'); return
    }

    setScanState('CARGANDO'); setMensaje('Verificando tu ubicación GPS...')

    try {
      const pos = await obtenerUbicacion()
      const dist = calcularDistancia(pos.coords.latitude, pos.coords.longitude, OBRA_LAT, OBRA_LON)

      if (dist > RADIO_METROS) {
        mostrarError(`Estás a ${Math.round(dist)} m de la oficina.\n¡Acércate para marcar!`); return
      }

      const h   = new Date().getHours()
      const m   = new Date().getMinutes()
      const est = (h < 9 || (h === 9 && m <= 5)) ? 'PUNTUAL' : 'TARDANZA'
      const hoy = format(new Date(), 'yyyy-MM-dd')
      const nowIso = new Date().toISOString()
      const payload = {
        dni: perfil.dni,
        nombres_completos: perfil.nombres,
        area: perfil.area,
        foto_url: perfil.foto_url,
        estado_ingreso: est,
        fecha: hoy,
        hora_ingreso: nowIso,
        notas: 'Escaner Oficina',
      }

      const { data, error } = await supabase.from('registro_asistencias').insert(payload).select().single()
      if (error) throw error

      setAsistenciaHoy(data as Asistencia)

      const logros = await evaluarLogrosIngreso(perfil.dni, h, m)
      if (elapsed <= 8 && await desbloquearLogro(perfil.dni, 7)) logros.push(7)

      mostrarExito('¡INGRESO REGISTRADO!\nUbicación confirmada ✓')
      unlockAndAnimate(logros)
    } catch (err: any) {
      if (err.code === 1) mostrarError('Activa el GPS para registrar asistencia.')
      else if (err.message?.includes('duplicate') || err.message?.includes('unique')) mostrarExito('¡INGRESO YA REGISTRADO!')
      else if (isNetworkError(err) && perfil) {
        const h   = new Date().getHours()
        const m   = new Date().getMinutes()
        const est = (h < 9 || (h === 9 && m <= 5)) ? 'PUNTUAL' : 'TARDANZA'
        const nowIso = new Date().toISOString()
        saveOfflineAttendance({
          dni: perfil.dni,
          nombres_completos: perfil.nombres,
          area: perfil.area,
          foto_url: perfil.foto_url,
          estado_ingreso: est,
          fecha: format(new Date(), 'yyyy-MM-dd'),
          hora_ingreso: nowIso,
          notas: 'Escaner Oficina',
        })
      } else mostrarError(`Error: ${err.message}`)
    }
  }

  // ── Asistencia Remota (Obra / Externo) ────────────────────────────────────

  const procesarRemoto = async (tipo: 'obra' | 'externo', prefijo: string) => {
    if (!notaTexto.trim()) { toast.warning('Por favor, ingresa el nombre del lugar.'); return }
    if (!perfil) return
    setGuardando(true)

    // Duplicate detector: revisa si YA hay registro hoy antes de pedir GPS
    try {
      const hoy = format(new Date(), 'yyyy-MM-dd')
      const { data: existente } = await supabase
        .from('registro_asistencias')
        .select('id, hora_ingreso, estado_ingreso, hora_salida, notas')
        .eq('dni', perfil.dni)
        .eq('fecha', hoy)
        .order('hora_ingreso', { ascending: false })
        .limit(1)
        .maybeSingle()
      // Multi-turno: bloquear solo si hay sesión abierta (sin hora_salida).
      // Si ya cerró salida hoy, permitir reingreso.
      if (existente && !(existente as any).hora_salida) {
        const horaExistente = formatTimeLima((existente as any).hora_ingreso)
        toast.warning(`Ya marcaste tu ingreso hoy a las ${horaExistente}`, {
          description: `Estado: ${(existente as any).estado_ingreso}. Si necesitas corregir, contacta a RRHH.`,
          duration: 9000,
        })
        setAsistenciaHoy(existente as Asistencia)
        setShowObra(false); setShowExterno(false); setNotaTexto('')
        setGuardando(false)
        return
      }
    } catch { /* sin red: seguimos con flow normal */ }

    try {
      const pos  = await obtenerUbicacion()
      const lat  = pos.coords.latitude
      const lon  = pos.coords.longitude
      const dist = calcularDistancia(lat, lon, OBRA_LAT, OBRA_LON)

      if (tipo === 'obra' && dist <= RADIO_METROS) {
        toast.warning('Estás dentro de la oficina', {
          description: 'Cierra este modal y escanea el QR de la entrada para marcar tu ingreso normal.',
          duration: 8000,
        })
        setGuardando(false)
        return
      }

      const h   = new Date().getHours()
      const m   = new Date().getMinutes()
      const ok  = tipo === 'obra'
        ? (h < 7 || (h === 7 && m <= 35))
        : (h < 9 || (h === 9 && m <= 5))
      const est = ok ? 'PUNTUAL' : 'TARDANZA'
      const hoy = format(new Date(), 'yyyy-MM-dd')
      const nota = `${prefijo}: ${notaTexto.trim()} [GPS: ${lat.toFixed(6)}, ${lon.toFixed(6)}]`
      const payload = {
        dni: perfil.dni,
        nombres_completos: perfil.nombres,
        area: perfil.area,
        foto_url: perfil.foto_url,
        estado_ingreso: est,
        fecha: hoy,
        hora_ingreso: new Date().toISOString(),
        notas: nota,
      }

      const { data, error } = await supabase.from('registro_asistencias').insert(payload).select().single()
      if (error) throw error

      setAsistenciaHoy(data as Asistencia)
      setShowObra(false); setShowExterno(false); setNotaTexto('')
      toast.success(tipo === 'obra' ? '¡Ingreso en obra registrado!' : '¡Ingreso externo registrado!')
      unlockAndAnimate(await evaluarLogrosIngreso(perfil.dni, h, m))
    } catch (err: any) {
      const code = err?.code
      const msg = String(err?.message ?? '')
      if (code === 1 || msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
        toast.error('GPS bloqueado', {
          description: 'Activa permiso de ubicación en Ajustes → Privacidad → Ubicación → permite RUAG.',
          duration: 10000,
        })
      } else if (code === 2 || msg.toLowerCase().includes('unavailable')) {
        toast.error('GPS no disponible', { description: 'Sal a un lugar abierto y vuelve a intentar.', duration: 8000 })
      } else if (code === 3 || msg.toLowerCase().includes('timeout')) {
        toast.error('GPS tardó demasiado', { description: 'Verifica que el GPS esté encendido y vuelve a intentar.', duration: 8000 })
      } else if (code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
        toast.warning('Ya tienes un ingreso registrado hoy', { description: 'Solo se permite uno por día. Contacta a RRHH si necesitas corregir.', duration: 9000 })
        setShowObra(false); setShowExterno(false)
      } else if (isNetworkError(err) && perfil) {
        const h   = new Date().getHours()
        const m   = new Date().getMinutes()
        const ok  = tipo === 'obra'
          ? (h < 7 || (h === 7 && m <= 35))
          : (h < 9 || (h === 9 && m <= 5))
        saveOfflineAttendance({
          dni: perfil.dni,
          nombres_completos: perfil.nombres,
          area: perfil.area,
          foto_url: perfil.foto_url,
          estado_ingreso: ok ? 'PUNTUAL' : 'TARDANZA',
          fecha: format(new Date(), 'yyyy-MM-dd'),
          hora_ingreso: new Date().toISOString(),
          notas: `${prefijo}: ${notaTexto.trim()} [GPS pendiente por sincronizacion]`,
        })
        toast.info('Sin conexión: ingreso guardado y se sincronizará automáticamente.', { duration: 6000 })
        setShowObra(false); setShowExterno(false); setNotaTexto('')
      } else {
        toast.error('No se pudo registrar el ingreso', { description: msg || 'Error desconocido. Intenta de nuevo o contacta a RRHH.', duration: 9000 })
      }
    } finally { setGuardando(false) }
  }

  // ── Turno Nocturno ────────────────────────────────────────────────────────

  const procesarNocturno = async () => {
    if (!horaSeleccionada) { toast.warning('Selecciona tu hora de ingreso'); return }
    if (!notaTexto.trim()) { toast.warning('Indica el lugar de trabajo'); return }
    if (!perfil) return
    setGuardando(true)

    // Duplicate pre-check (multi-turno: solo bloquear sesión abierta)
    try {
      const hoy = format(new Date(), 'yyyy-MM-dd')
      const { data: existente } = await supabase
        .from('registro_asistencias')
        .select('id, hora_ingreso, estado_ingreso, hora_salida')
        .eq('dni', perfil.dni)
        .eq('fecha', hoy)
        .order('hora_ingreso', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existente && !(existente as any).hora_salida) {
        const horaExistente = formatTimeLima((existente as any).hora_ingreso)
        toast.warning(`Ya marcaste tu ingreso hoy a las ${horaExistente}`, {
          description: `Estado: ${(existente as any).estado_ingreso}. Solo se permite uno por día.`,
          duration: 9000,
        })
        setAsistenciaHoy(existente as Asistencia)
        setShowNocturno(false); setNotaTexto(''); setHoraSeleccionada(null)
        setGuardando(false)
        return
      }
    } catch { /* sin red: seguimos */ }

    try {
      const pos  = await obtenerUbicacion()
      const lat  = pos.coords.latitude
      const lon  = pos.coords.longitude
      const horaLabel = HORAS_NOCTURNAS.find(x => x.hora === horaSeleccionada)?.label ?? ''
      const hoy = format(new Date(), 'yyyy-MM-dd')
      // Turno nocturno: SIEMPRE puntual sin importar la hora real
      const nota = `Turno Nocturno (${horaLabel}): ${notaTexto.trim()} [GPS: ${lat.toFixed(6)}, ${lon.toFixed(6)}]`
      const payload = {
        dni: perfil.dni,
        nombres_completos: perfil.nombres,
        area: perfil.area,
        foto_url: perfil.foto_url,
        estado_ingreso: 'PUNTUAL',
        fecha: hoy,
        hora_ingreso: new Date().toISOString(),
        notas: nota,
      }

      const { data, error } = await supabase.from('registro_asistencias').insert(payload).select().single()
      if (error) throw error

      setAsistenciaHoy(data as Asistencia)
      setShowNocturno(false); setNotaTexto(''); setHoraSeleccionada(null)
      toast.success('¡Turno nocturno registrado!')
      const h = new Date().getHours(); const m = new Date().getMinutes()
      unlockAndAnimate(await evaluarLogrosIngreso(perfil.dni, h, m))
    } catch (err: any) {
      const code = err?.code
      const msg = String(err?.message ?? '')
      if (code === 1 || msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
        toast.error('GPS bloqueado', { description: 'Activa el permiso de ubicación para registrar tu ingreso.', duration: 10000 })
      } else if (code === 2 || msg.toLowerCase().includes('unavailable')) {
        toast.error('GPS no disponible', { description: 'Sal a un lugar abierto e intenta de nuevo.', duration: 8000 })
      } else if (code === 3 || msg.toLowerCase().includes('timeout')) {
        toast.error('GPS tardó demasiado', { description: 'Revisa que el GPS esté encendido y reintenta.', duration: 8000 })
      } else if (code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
        toast.warning('Ya tienes un ingreso registrado hoy', { description: 'Solo se permite uno por día. Contacta a RRHH si necesitas corregir.', duration: 9000 })
        setShowNocturno(false)
      } else if (isNetworkError(err) && perfil) {
        const horaLabel = HORAS_NOCTURNAS.find(x => x.hora === horaSeleccionada)?.label ?? ''
        saveOfflineAttendance({
          dni: perfil.dni,
          nombres_completos: perfil.nombres,
          area: perfil.area,
          foto_url: perfil.foto_url,
          estado_ingreso: 'PUNTUAL',
          fecha: format(new Date(), 'yyyy-MM-dd'),
          hora_ingreso: new Date().toISOString(),
          notas: `Turno Nocturno (${horaLabel}): ${notaTexto.trim()} [GPS pendiente por sincronizacion]`,
        })
        toast.info('Sin conexión: turno guardado, se sincronizará automáticamente.', { duration: 6000 })
        setShowNocturno(false); setNotaTexto(''); setHoraSeleccionada(null)
      } else {
        toast.error('No se pudo registrar el turno nocturno', { description: msg || 'Intenta de nuevo o contacta a RRHH.', duration: 9000 })
      }
    } finally { setGuardando(false) }
  }

  // ── Salida ────────────────────────────────────────────────────────────────

  const handleSalida = async () => {
    if (!asistenciaHoy || isMarkingExit || !perfil) return
    if (asistenciaHoy.id.startsWith('offline-')) {
      toast.warning('Tu entrada offline aun no se sincroniza. Marca salida cuando vuelva internet.')
      return
    }
    setIsMarkingExit(true)

    try {
      const pos  = await obtenerUbicacion()
      const dist = calcularDistancia(pos.coords.latitude, pos.coords.longitude, OBRA_LAT, OBRA_LON)

      if (dist > RADIO_METROS) {
        setCurrentLatLon(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`)
        setIsRemoteExit(true); setNotaTexto(''); setShowNota(true)
        setIsMarkingExit(false); return
      }

      const now = new Date().toISOString()
      const { error } = await supabase.from('registro_asistencias').update({ hora_salida: now }).eq('id', asistenciaHoy.id)
      if (error) throw error

      setAsistenciaHoy({ ...asistenciaHoy, hora_salida: now })
      toast.success('¡Salida registrada exitosamente!')
      unlockAndAnimate(await evaluarLogrosSalida(perfil.dni))
    } catch (err: any) {
      if (err.code === 1) toast.error('Activa el GPS para marcar salida.')
      else toast.error(`Error: ${err.message}`)
    } finally { setIsMarkingExit(false) }
  }

  // ── Nota / Salida remota ──────────────────────────────────────────────────

  const handleGuardarNota = async () => {
    if (!notaTexto.trim()) { toast.warning(isRemoteExit ? 'Indica tu ubicación actual.' : 'Escribe el motivo.'); return }
    if (!asistenciaHoy || !perfil) return
    setGuardando(true)

    try {
      if (isRemoteExit) {
        const notaRemota = `Salida Externa: ${notaTexto.trim()} [GPS: ${currentLatLon}]`
        const final = asistenciaHoy.notas ? `${asistenciaHoy.notas}\n${notaRemota}` : notaRemota
        const ahora = new Date().toISOString()
        await supabase.from('registro_asistencias').update({ notas: final, hora_salida: ahora }).eq('id', asistenciaHoy.id)
        setAsistenciaHoy({ ...asistenciaHoy, hora_salida: ahora, notas: final })
        toast.success('¡Salida remota registrada!')
        unlockAndAnimate(await evaluarLogrosSalida(perfil.dni))
      } else {
        const final = asistenciaHoy.notas ? `${asistenciaHoy.notas}\n${notaTexto.trim()}` : notaTexto.trim()
        await supabase.from('registro_asistencias').update({ notas: final }).eq('id', asistenciaHoy.id)
        setAsistenciaHoy({ ...asistenciaHoy, notas: final })
        toast.success('¡Nota guardada!')
      }
      setShowNota(false); setNotaTexto('')
    } catch (err: any) {
      toast.error(`Error: ${err.message}`)
    } finally { setGuardando(false); setIsRemoteExit(false) }
  }

  // FIX: Elimina foto anterior del bucket antes de subir la nueva
  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !perfil || !asistenciaHoy) return
    setUploadingPhoto(true)

    try {
      const ext      = file.name.split('.').pop()
      const fileName = `${perfil.dni}_${Date.now()}.${ext}`

      // Eliminar archivo anterior
      if (perfil.foto_url) {
        try {
          const old = perfil.foto_url.split('/fotos_perfil/')[1]
          if (old) await supabase.storage.from('fotos_perfil').remove([old])
        } catch { /* no importa si falla */ }
      }

      const { error: upErr } = await supabase.storage.from('fotos_perfil').upload(fileName, file, { upsert: true })
      if (upErr) throw upErr

      const { data: urlData } = supabase.storage.from('fotos_perfil').getPublicUrl(fileName)
      const newUrl = urlData.publicUrl

      await supabase.from('fotocheck_perfiles').update({ foto_url: newUrl }).eq('dni', perfil.dni)
      await supabase.from('registro_asistencias').update({ foto_url: newUrl }).eq('id', asistenciaHoy.id)

      store.set('RUAG_FOTO', newUrl)
      setPerfil({ ...perfil, foto_url: newUrl })
      toast.success('¡Foto actualizada!')

      const desbloqueado = await desbloquearLogro(perfil.dni, 3)
      if (desbloqueado) {
        setUnlockedLogros(prev => [...prev, 3])
        setTimeout(() => setAchievement(TODOS_LOS_LOGROS.find(l => l.id === 3)!), 500)
      }
    } catch (err: any) {
      toast.error(`Error al subir foto: ${err.message}`)
    } finally { setUploadingPhoto(false) }
  }

  const saveProfileChanges = async (next: { dni: string; area: string; fecha_cumpleanos: string | null }) => {
    if (!perfil) return
    const nextDni = next.dni.trim()
    const nextArea = next.area.trim()
    if (!nextDni || !nextArea) {
      toast.warning('DNI y área son obligatorios.')
      return
    }

    setSavingProfile(true)
    try {
      const { error } = await supabase
        .from('fotocheck_perfiles')
        .update({ dni: nextDni, area: nextArea, fecha_cumpleanos: next.fecha_cumpleanos })
        .eq('dni', perfil.dni)
      if (error) throw error

      if (asistenciaHoy && !asistenciaHoy.id.startsWith('offline-')) {
        await supabase
          .from('registro_asistencias')
          .update({ dni: nextDni, area: nextArea })
          .eq('id', asistenciaHoy.id)
      }

      if (nextDni !== perfil.dni) {
        await activateDeviceSession(nextDni, perfil.nombres, 'web-pwa')
      }

      const updated = { ...perfil, dni: nextDni, area: nextArea, fecha_cumpleanos: next.fecha_cumpleanos }
      store.set('RUAG_DNI', updated.dni)
      store.set('RUAG_AREA', updated.area)
      if (updated.fecha_cumpleanos) {
        store.remove(BIRTHDAY_PROMPT_SNOOZE_KEY)
        store.remove(BIRTHDAY_PROMPT_LEGACY_SKIP_KEY)
        setShowBirthdayPrompt(false)
      }
      setPerfil(updated)
      setShowProfileEditor(false)
      toast.success('Perfil actualizado.')
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo actualizar tu perfil')
    } finally {
      setSavingProfile(false)
    }
  }

  // ── Calendar grid ──────────────────────────────────────────────────────────

  const renderCalendario = () => {
    const y  = targetDate.getFullYear()
    const mo = targetDate.getMonth()
    const total = new Date(y, mo + 1, 0).getDate()
    const fDay  = new Date(y, mo, 1).getDay()
    const blanks = fDay === 0 ? 6 : fDay - 1
    const todayStr = format(new Date(), 'yyyy-MM-dd')

    let countPuntual = 0, countTardanza = 0, countVacaciones = 0
    for (let d = 1; d <= total; d++) {
      const ds = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const e = historialMes.find(x => x.fecha === ds)
      if (getApprovedVacationRequestsForDay(ds).length > 0) countVacaciones++
      else if (e?.estado_ingreso === 'PUNTUAL') countPuntual++
      else if (e?.estado_ingreso === 'TARDANZA') countTardanza++
    }

    const stats: [string, number, string, string][] = [
      ['Puntual', countPuntual, 'var(--green)', 'var(--green-light)'],
      ['Tardanza', countTardanza, 'var(--red)', 'var(--red-light)'],
      ['Vacaciones', countVacaciones, 'var(--blue)', 'var(--blue-light)'],
    ]

    return (
      <div>
        {/* Resumen del mes */}
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          {stats.map(([label, value, color, bg], i) => (
            <motion.div
              key={label}
              className="rounded-2xl p-3 border text-center relative overflow-hidden"
              style={{ background: bg, borderColor: `${color}33` }}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 320, damping: 24 }}
            >
              <p className="text-2xl font-black leading-none" style={{ color, fontFamily: 'Sora, sans-serif' }}>{value}</p>
              <p className="text-[10px] font-black uppercase tracking-wider mt-1.5" style={{ color }}>{label}</p>
            </motion.div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`${y}-${mo}`}
            className="grid grid-cols-7 gap-1.5"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.28, ease: [0.34, 1.1, 0.64, 1] }}
          >
            {['L','M','M','J','V','S','D'].map((d, i) => (
              <div key={i} className="text-center text-[11px] font-black pb-2 uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{d}</div>
            ))}
            {Array.from({ length: blanks }, (_, i) => <div key={`b${i}`} className="aspect-square" />)}
            {Array.from({ length: total }, (_, i) => {
              const day  = i + 1
              const dStr = `${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const e    = historialMes.find(x => x.fecha === dStr)
              const vacationRequests = getApprovedVacationRequestsForDay(dStr)
              const hasVacation = vacationRequests.length > 0
              const isPuntual  = e?.estado_ingreso === 'PUNTUAL'
              const isTardanza = e?.estado_ingreso === 'TARDANZA'
              const isFeriado  = feriadosMes.has(dStr) && !e && !hasVacation
              const isInteractive = Boolean(e) || hasVacation
              const isToday = dStr === todayStr
              const isFuture = dStr > todayStr
              const dotColor = hasVacation ? 'var(--blue)' : isPuntual ? 'var(--green)' : isTardanza ? 'var(--red)' : isFeriado ? '#0D9488' : null

              return (
                <motion.button
                  key={day}
                  disabled={!isInteractive}
                  onClick={() => {
                    if (hasVacation) setSelectedVacationDay({ fecha: dStr, solicitudes: vacationRequests })
                    else if (e) setSelectedDay(e)
                  }}
                  className="relative aspect-square rounded-2xl flex flex-col items-center justify-center text-sm font-black border"
                  style={{
                    background: hasVacation ? 'var(--blue-light)' : isPuntual ? 'var(--green-light)' : isTardanza ? 'var(--red-light)' : isFeriado ? '#CCFBF1' : 'var(--surface-2)',
                    borderColor: isToday ? 'var(--blue)' : hasVacation ? '#93C5FD' : isPuntual ? '#6EE7B7' : isTardanza ? '#FCA5A5' : isFeriado ? '#5EEAD4' : 'var(--border)',
                    borderWidth: isToday ? 2 : 1,
                    color: hasVacation ? 'var(--blue)' : isPuntual ? 'var(--green)' : isTardanza ? 'var(--red)' : isFeriado ? '#0F766E' : 'var(--text-3)',
                    opacity: isFuture && !isInteractive && !isFeriado ? 0.35 : !isInteractive && !isFeriado ? 0.6 : 1,
                    boxShadow: isToday ? '0 6px 18px rgba(79,70,229,0.22)' : 'none',
                  }}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: isFuture && !isInteractive ? 0.35 : 1, scale: 1 }}
                  transition={{ delay: Math.min(0.15 + i * 0.012, 0.6), type: 'spring', stiffness: 420, damping: 26 }}
                  whileHover={isInteractive ? { scale: 1.12, zIndex: 1 } : {}}
                  whileTap={isInteractive ? { scale: 0.92 } : {}}
                >
                  <span className="leading-none">{day}</span>
                  {dotColor && <span className="absolute bottom-1.5 w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />}
                  {isToday && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2" style={{ background: 'var(--blue)', borderColor: 'var(--surface)' }} />}
                </motion.button>
              )
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const showOfflineFotocheck = Boolean(!asistenciaHoy && !isOnline && perfil)
  const showScannerView = Boolean(!asistenciaHoy && !showOfflineFotocheck)

  useEffect(() => {
    if (isLoading || typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const animations: JSAnimation[] = []
    const runAnime = (selector: string, params: AnimationParams) => {
      if (!document.querySelector(selector)) return
      animations.push(animate(selector, params))
    }

    if (showScannerView) {
      runAnime('.anime-scanner-card', {
        opacity: [0, 1],
        translateY: [18, 0],
        scale: [0.985, 1],
        duration: 620,
        ease: 'out(3)',
      })
      runAnime('.anime-scanner-panel', {
        opacity: [0, 1],
        translateY: [18, 0],
        duration: 520,
        delay: 90,
        ease: 'outQuad',
      })
      runAnime('.anime-scanner-action', {
        opacity: [0, 1],
        translateY: [16, 0],
        scale: [0.94, 1],
        duration: 460,
        delay: stagger(70),
        ease: 'outBack',
      })
    }

    if (showOfflineFotocheck || asistenciaHoy) {
      runAnime('.anime-fotocheck-card', {
        opacity: [0, 1],
        translateY: [20, 0],
        scale: [0.975, 1],
        duration: 640,
        ease: 'out(3)',
      })
      runAnime('.anime-profile-photo', {
        scale: [0.9, 1],
        rotate: [-2, 0],
        duration: 640,
        delay: 110,
        ease: 'outBack',
      })
      runAnime('.anime-fotocheck-chip', {
        opacity: [0, 1],
        translateY: [8, 0],
        scale: [0.96, 1],
        duration: 420,
        delay: stagger(55, { start: 160 }),
        ease: 'outQuad',
      })
      runAnime('.anime-fotocheck-action', {
        opacity: [0, 1],
        translateY: [12, 0],
        duration: 420,
        delay: stagger(80, { start: 180 }),
        ease: 'outQuad',
      })
    }

    if (showSideMenu) {
      runAnime('.anime-menu-item', {
        opacity: [0, 1],
        translateX: [18, 0],
        duration: 430,
        delay: stagger(38, { start: 120 }),
        ease: 'outQuad',
      })
    }

    return () => {
      animations.forEach((animation) => animation.pause())
    }
  }, [asistenciaHoy?.id, isLoading, perfil?.dni, scanState, showOfflineFotocheck, showScannerView, showSideMenu])

  if (isLoading || !perfil) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--bg)' }}>
        <motion.div
          className="w-16 h-16 rounded-3xl flex items-center justify-center mb-5"
          style={{ background: 'var(--blue)', boxShadow: 'var(--shadow-glow)' }}
          animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Loader2 className="text-white animate-spin" size={30} />
        </motion.div>
        <p className="font-semibold text-lg" style={{ color: 'var(--text-2)', fontFamily: 'Sora, sans-serif' }}>Sincronizando RUAG...</p>
      </div>
    )
  }

  const cachedProfilePhoto = store.get(PROFILE_PHOTO_DATA_KEY) || ''
  const profilePhotoSrc = (!isOnline && cachedProfilePhoto) ? cachedProfilePhoto : (perfil.foto_url || cachedProfilePhoto)
  const isPuntual   = asistenciaHoy?.estado_ingreso === 'PUNTUAL'
  const isPendingLocal = Boolean(asistenciaHoy && (asistenciaHoy.id.startsWith('offline-') || hasPendingOfflineEntry))
  const cardIsOfflineOnly = showOfflineFotocheck && !asistenciaHoy
  const statusColor = cardIsOfflineOnly ? 'var(--amber)' : isPuntual ? 'var(--green)' : 'var(--red)'
  const statusBg    = cardIsOfflineOnly ? 'var(--amber-light)' : isPuntual ? 'var(--green-light)' : 'var(--red-light)'
  // Mismas fórmulas que el dashboard "Control estilo Excel" → cifras sincronizadas.
  const balances = derivedVacationBalances(vacacionesSaldo, vacacionesSolicitudes)
  const pendingDisplay   = Math.max(balances.pendientesPeriodo, 0)
  const periodosAnterioresDisplay = balances.periodosAnteriores
  const gozadosDisplay   = balances.gozados
  const porVencerDisplay = balances.porVencer
  const diasSolicitadosPreview = differenceInDays(toDateAtNoon(vacationEnd), toDateAtNoon(vacationStart)) + 1

  return (
    <div
      className="min-h-screen flex flex-col items-center relative overflow-hidden"
      onTouchStart={(e) => {
        const t = e.touches[0]
        touchStartRef.current = { x: t.clientX, y: t.clientY }
      }}
      onTouchEnd={(e) => {
        const start = touchStartRef.current
        const t = e.changedTouches[0]
        touchStartRef.current = null
        if (!start || showSideMenu || showLogros || showCalendar || showVacations || showMedicalLeave || showTour || showUpdates || showBirthdays || showBirthdayPrompt || showNota || showObra || showExterno || showNocturno) return
        const dx = t.clientX - start.x
        const dy = Math.abs(t.clientY - start.y)
        const middleBand = start.y > window.innerHeight * 0.22 && start.y < window.innerHeight * 0.78
        if (middleBand && dx < -85 && dy < 70) setShowSideMenu(true)
      }}
      style={{
        background: 'var(--bg)',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, rgba(79,70,229,0.15) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 -left-20 w-80 h-80 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)' }} />
      </div>

      <AnimatePresence>
        {showSideMenu && (
          <motion.div
            className="fixed inset-0 z-[80] flex justify-end"
            style={{ background: 'rgba(15,23,42,0.38)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowSideMenu(false)}
          >
            <motion.aside
              className="h-full w-[82vw] max-w-[330px] rounded-l-[34px] p-5 flex flex-col"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.97), rgba(239,248,244,0.97), rgba(239,246,255,0.97))', borderLeft: '1px solid rgba(255,255,255,0.9)', boxShadow: '-24px 0 60px rgba(15,23,42,0.18)' }}
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--text-3)' }}>Panel rapido</p>
                  <h3 className="text-xl font-black" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>Opciones</h3>
                </div>
                <button onClick={() => setShowSideMenu(false)} className="w-10 h-10 rounded-2xl border flex items-center justify-center" style={{ background: 'white', borderColor: 'var(--border)', color: 'var(--text-2)' }}>
                  <X size={18} />
                </button>
              </div>

              <div className="mt-5 rounded-3xl p-4 border flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.72)', borderColor: 'rgba(203,213,225,0.75)' }}>
                <div className="w-14 h-14 rounded-full overflow-hidden" style={{ background: 'var(--blue-light)' }}>
                  {profilePhotoSrc ? (
                    <img src={profilePhotoSrc} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-black" style={{ color: 'var(--blue)' }}>
                      {perfil ? getInitials(perfil.nombres) : ''}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black leading-tight truncate" style={{ color: 'var(--text-1)' }}>{perfil?.nombres}</p>
                  <p className="text-xs font-bold mt-1" style={{ color: 'var(--text-3)' }}>{perfil?.dni}</p>
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] mt-1 truncate" style={{ color: 'var(--blue)' }}>{perfil?.area}</p>
                </div>
              </div>

              <div
                className="mt-4 w-fit rounded-full px-4 py-2 border flex items-center gap-2 text-xs font-black"
                style={{
                  background: isOnline && !hasPendingOfflineEntry ? 'rgba(220,252,231,0.9)' : 'rgba(255,247,237,0.94)',
                  color: isOnline && !hasPendingOfflineEntry ? 'var(--green)' : 'var(--amber)',
                  borderColor: isOnline && !hasPendingOfflineEntry ? 'rgba(16,185,129,0.22)' : 'rgba(245,158,11,0.28)',
                }}
              >
                {isOnline && !hasPendingOfflineEntry ? <Cloud size={16} /> : <CloudOff size={16} />}
                <span>{isOnline && !hasPendingOfflineEntry ? 'Online' : hasPendingOfflineEntry ? 'Pendiente offline' : 'Offline'}</span>
              </div>

              <div className="mt-6 flex-1 space-y-3 overflow-y-auto pr-1 pb-[calc(env(safe-area-inset-bottom)+18px)]">
                {[
                  { key: 'calendar', label: 'Calendario', desc: 'Historial mensual', gif: '/icons-web/calendario.gif', icon: <Calendar size={20} />, colors: ['#2563EB', '#06B6D4'] },
                  { key: 'logros', label: 'Logros', desc: 'Insignias y progreso', gif: '/icons-web/logros.gif', icon: <Trophy size={20} />, colors: ['#F59E0B', '#FBBF24'] },
                  { key: 'birthdays', label: 'Cumpleaños', desc: 'Próximos y del día', gif: '/icons-web/cumpleanos.gif', icon: <Cake size={20} />, colors: ['#EC4899', '#7C3AED'] },
                  { key: 'vacations', label: 'Vacaciones', desc: 'Saldo y solicitudes', gif: '/icons-web/vacaciones.gif', icon: <PlaneTakeoff size={20} />, colors: ['#0EA5E9', '#6366F1'] },
                  { key: 'medical', label: 'Descanso medico', desc: 'Certificado para RRHH', gif: '/icons-web/descanso-medico.gif', icon: <Stethoscope size={20} />, colors: ['#7C3AED', '#EC4899'] },
                  { key: 'ranking', label: 'Ranking puntual', desc: 'Top 10 de oficina', gif: '/icons-web/ranking.gif', icon: <Star size={20} />, colors: ['#F59E0B', '#F97316'] },
                  { key: 'rankingLate', label: 'Ranking tardanza', desc: 'Llegadas tarde', gif: '/icons-web/ranking-tardanza.gif', icon: <AlertTriangle size={20} />, colors: ['#DC2626', '#F43F5E'] },
                  { key: 'tour', label: 'Ver tour de nuevo', desc: 'Aprende cada boton', gif: '/icons-web/guia-de-uso.gif', icon: <BookOpen size={20} />, colors: ['#2563EB', '#22C55E'] },
                  { key: 'updates', label: 'Actualizaciones', desc: 'Libro de novedades', gif: '/icons-web/actualizaciones.gif', icon: <FileText size={20} />, colors: ['#0F766E', '#0EA5E9'] },
                  { key: 'support', label: 'Soporte', desc: 'Ayuda por WhatsApp', gif: '/icons-web/soporte.gif', icon: <Phone size={20} />, colors: ['#128C7E', '#25D366'] },
                  { key: 'rrhh', label: 'RRHH', desc: 'Recursos humanos', gif: '/icons-web/rrhh.gif', icon: <Badge size={20} />, colors: ['#2563EB', '#06B6D4'] },
                ].map((item) => (
                  <motion.button key={item.key} onClick={() => openFeature(item.key as WorkerFeature)}
                    className="anime-menu-item group relative w-full overflow-hidden rounded-[24px] border p-3 flex items-center gap-3 text-left"
                    style={{ background: 'rgba(255,255,255,0.82)', borderColor: `${item.colors[0]}30`, boxShadow: '0 12px 28px rgba(15,23,42,0.06)' }}
                    whileHover={{ x: -3 }}
                    whileTap={{ scale: 0.98 }}>
                    <motion.span
                      className="absolute right-[-28px] top-[-28px] h-20 w-20 rounded-full opacity-20 blur-xl"
                      style={{ background: `linear-gradient(135deg, ${item.colors[0]}, ${item.colors[1]})` }}
                      animate={{ scale: [1, 1.25, 1], opacity: [0.14, 0.28, 0.14] }}
                      transition={{ duration: 2.7, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <span className="relative w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden border"
                      style={{ background: `linear-gradient(135deg, ${item.colors[0]}18, ${item.colors[1]}24)`, borderColor: `${item.colors[0]}24` }}>
                      {item.key === 'birthdays'
                        ? <LottiePlayer src="/lottie/birthday-cake.json" style={{ width: 46, height: 46 }} />
                        : <img src={item.gif} alt="" className="h-11 w-11 object-contain" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-black" style={{ color: 'var(--text-1)' }}>{item.label}</span>
                      <span className="block text-xs font-semibold mt-0.5" style={{ color: 'var(--text-3)' }}>{item.desc}</span>
                    </span>
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: `linear-gradient(135deg, ${item.colors[0]}, ${item.colors[1]})` }}>
                      {item.icon}
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* VISTA 1: ESCÁNER QR                                                  */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {showScannerView && (
        <div className="w-full max-w-sm mx-auto flex flex-col min-h-screen px-5 pt-6 pb-4 relative z-10">

          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
                <img src="/ruag-logo.png" alt="RUAG" className="h-full w-full object-cover" />
              </div>
              <div>
                <h1 className="font-black text-base leading-none" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>RUAG</h1>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>Registra tu asistencia</p>
              </div>
            </div>
            <motion.button
              onClick={() => setShowSideMenu(true)}
              className="w-14 h-14 rounded-[22px] flex items-center justify-center border text-white"
              style={{ background: 'linear-gradient(135deg, #0F766E, #22C55E, #0EA5E9)', borderColor: 'rgba(255,255,255,0.55)', boxShadow: '0 16px 34px rgba(16,185,129,0.22)' }}
              whileTap={{ scale: 0.94 }}>
              <Menu size={28} />
            </motion.button>
          </div>

          {/* Camera box */}
          <motion.div
            className="anime-scanner-card relative flex-1 rounded-3xl overflow-hidden min-h-[320px] max-h-[55vh]"
            style={{ background: '#0f0f1a', boxShadow: 'var(--shadow-lg)', border: '2px solid var(--border)' }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.34, 1.2, 0.64, 1] }}
          >
            {scanState === 'ESCANEO' && isOnline && !showTour && (
              <>
                <div className="absolute inset-0 z-10">
                  <Scanner
                    onScan={r => { if (r?.length) procesarQR(r[0].rawValue) }}
                    components={{ finder: false }}
                    styles={{ container: { width: '100%', height: '100%' }, video: { width: '100%', height: '100%', objectFit: 'cover' } }}
                  />
                </div>
                {/* QR frame */}
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                  <div className="relative w-56 h-56">
                    {/* Scanning line */}
                    <div className="absolute left-0 right-0 h-0.5 z-10"
                      style={{ background: 'linear-gradient(90deg, transparent, #818CF8, transparent)', animation: 'scan 2.5s ease-in-out infinite' }} />
                    {/* Corners */}
                    {[
                      'top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-2xl',
                      'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-2xl',
                      'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-2xl',
                      'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-2xl',
                    ].map((cls, i) => (
                      <div key={i} className={`absolute w-8 h-8 ${cls}`} style={{ borderColor: '#818CF8' }} />
                    ))}
                  </div>
                </div>
                {/* Bottom hint */}
                <div className="absolute bottom-4 left-0 right-0 flex justify-center z-20 pointer-events-none">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: 'rgba(15,15,26,0.7)', backdropFilter: 'blur(8px)' }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#10B981', boxShadow: '0 0 6px #10B981' }} />
                    <span className="text-white text-xs font-semibold">Se verificará tu GPS</span>
                  </div>
                </div>
              </>
            )}

            {scanState === 'ESCANEO' && !isOnline && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-7 text-center"
                style={{ background: 'linear-gradient(160deg, rgba(239,246,255,0.98), rgba(236,253,245,0.98))' }}>
                <motion.div
                  className="w-20 h-20 rounded-[28px] flex items-center justify-center mb-5"
                  style={{ background: 'rgba(255,255,255,0.88)', color: 'var(--amber)', boxShadow: 'var(--shadow-md)' }}
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <CloudOff size={34} />
                </motion.div>
                <h2 className="text-xl font-black mb-2" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>
                  Sin conexion
                </h2>
                <p className="text-sm font-semibold leading-relaxed mb-5" style={{ color: 'var(--text-3)' }}>
                  No se mostrara el escaner. Puedes guardar tu entrada en este equipo y se subira sola cuando vuelva internet.
                </p>
                <motion.button
                  onClick={handleOfflineEntry}
                  className="w-full rounded-2xl py-4 text-white font-black uppercase tracking-wider"
                  style={{ background: 'linear-gradient(135deg, #0F766E, #22C55E)', boxShadow: '0 18px 34px rgba(16,185,129,0.24)' }}
                  whileTap={{ scale: 0.97 }}
                >
                  Guardar entrada offline
                </motion.button>
              </div>
            )}

            {/* States overlay */}
            <AnimatePresence>
              {scanState !== 'ESCANEO' && (
                <motion.div
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center p-8"
                  style={{ background: 'rgba(238,242,255,0.97)', backdropFilter: 'blur(12px)' }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  {scanState === 'CARGANDO' && (
                    <motion.div className="flex flex-col items-center" initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                        style={{ background: 'var(--blue-light)', border: '2px solid var(--border-2)' }}>
                        <Loader2 className="animate-spin" size={28} style={{ color: 'var(--blue)' }} />
                      </div>
                      <p className="font-semibold text-center text-sm" style={{ color: 'var(--text-2)' }}>{mensaje}</p>
                    </motion.div>
                  )}
                  {scanState === 'EXITO' && (
                    <motion.div className="flex flex-col items-center text-center" initial={{ scale: 0.7 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
                      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
                        style={{ background: 'var(--green-light)', boxShadow: '0 0 40px rgba(5,150,105,0.25)' }}>
                        <CheckCircle size={44} style={{ color: 'var(--green)' }} />
                      </div>
                      <h3 className="font-black text-lg mb-1" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>¡INGRESO EXITOSO!</h3>
                      <p className="text-sm font-medium whitespace-pre-line" style={{ color: 'var(--text-3)' }}>{mensaje}</p>
                    </motion.div>
                  )}
                  {scanState === 'ERROR' && (
                    <motion.div className="flex flex-col items-center text-center" initial={{ x: -10 }} animate={{ x: [0, -8, 8, -8, 8, 0] }} transition={{ duration: 0.4 }}>
                      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
                        style={{ background: 'var(--red-light)', boxShadow: '0 0 40px rgba(220,38,38,0.2)' }}>
                        <AlertTriangle size={40} style={{ color: 'var(--red)' }} />
                      </div>
                      <h3 className="font-black text-base mb-1" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>ACCESO DENEGADO</h3>
                      <p className="text-sm font-medium whitespace-pre-line" style={{ color: 'var(--red)' }}>{mensaje}</p>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Bottom panel */}
          {scanState === 'ESCANEO' && (
            <motion.div
              className="anime-scanner-panel mt-4 rounded-3xl p-4"
              style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <p className="text-xs font-bold text-center mb-3" style={{ color: 'var(--text-3)' }}>
                ¿No estás en la oficina principal?
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Obra', icon: <HardHat size={20} />, color: 'var(--blue)', bg: 'var(--blue-light)', border: 'var(--border-2)', onClick: () => { setNotaTexto(''); setShowObra(true) } },
                  { label: 'Externo', icon: <Store size={20} />, color: 'var(--purple)', bg: 'var(--purple-light)', border: '#DDD6FE', onClick: () => { setNotaTexto(''); setShowExterno(true) } },
                  { label: 'Nocturno', icon: <Moon size={20} />, color: 'var(--amber)', bg: 'var(--amber-light)', border: '#FDE68A', onClick: () => { setNotaTexto(''); setHoraSeleccionada(null); setShowNocturno(true) } },
                ].map(btn => (
                  <motion.button
                    key={btn.label}
                    onClick={btn.onClick}
                    className="anime-scanner-action flex flex-col items-center justify-center py-3.5 rounded-2xl font-bold text-sm gap-1.5 transition-all border"
                    style={{ background: btn.bg, color: btn.color, borderColor: btn.border }}
                    whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.96 }}
                  >
                    {btn.icon}
                    <span className="text-xs">{btn.label}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* VISTA 2: FOTOCHECK DIGITAL                                           */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {(asistenciaHoy || showOfflineFotocheck) && (
        <div className="w-full max-w-sm mx-auto flex flex-col px-5 pt-6 pb-8 relative z-10 gap-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
              {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
            </p>
            <motion.button
              onClick={() => setShowSideMenu(true)}
              className="w-14 h-14 rounded-[22px] flex items-center justify-center border text-white"
              style={{ background: 'linear-gradient(135deg, #0F766E, #22C55E, #0EA5E9)', borderColor: 'rgba(255,255,255,0.55)', boxShadow: '0 16px 34px rgba(16,185,129,0.22)' }}
              whileTap={{ scale: 0.94 }}>
              <Menu size={28} />
            </motion.button>
          </div>

          {/* Fotocheck Card */}
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFoto} className="hidden" />

          <motion.div
            className="anime-fotocheck-card relative"
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.34, 1.2, 0.64, 1] }}
          >
            <div
              className="absolute -inset-1 rounded-[30px]"
              style={{ background: cardIsOfflineOnly
                ? 'linear-gradient(135deg, #B45309, #F59E0B 52%, #FBBF24)'
                : isPuntual
                ? 'linear-gradient(135deg, #047857, #34D399 48%, #0EA5E9)'
                : 'linear-gradient(135deg, #991B1B, #EF4444 52%, #F97316)',
                boxShadow: cardIsOfflineOnly
                  ? '0 24px 55px rgba(245,158,11,0.20)'
                  : isPuntual
                  ? '0 24px 55px rgba(16,185,129,0.20)'
                  : '0 24px 55px rgba(239,68,68,0.18)'
              }} />
            <motion.div
              className="absolute -inset-4 rounded-[34px] opacity-40"
              style={{
                background: cardIsOfflineOnly
                  ? 'radial-gradient(circle at 30% 10%, rgba(251,191,36,0.34), transparent 42%), radial-gradient(circle at 80% 85%, rgba(245,158,11,0.20), transparent 38%)'
                  : isPuntual
                  ? 'radial-gradient(circle at 30% 10%, rgba(52,211,153,0.38), transparent 42%), radial-gradient(circle at 80% 85%, rgba(14,165,233,0.22), transparent 38%)'
                  : 'radial-gradient(circle at 30% 10%, rgba(248,113,113,0.34), transparent 42%), radial-gradient(circle at 80% 85%, rgba(249,115,22,0.20), transparent 38%)',
                filter: 'blur(12px)',
              }}
              animate={{ opacity: [0.24, 0.42, 0.24], scale: [0.98, 1.02, 0.98] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
            />

            <div className="relative rounded-[26px] p-7 overflow-hidden"
              style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96))', boxShadow: 'var(--shadow-lg)' }}>
              <motion.div
                className="absolute inset-y-0 -left-24 w-20 pointer-events-none"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.75), transparent)', transform: 'skewX(-18deg)' }}
                animate={{ x: [-120, 470] }}
                transition={{ duration: 3.8, repeat: Infinity, ease: 'linear', repeatDelay: 1.4 }}
              />

              {/* Watermark */}
              <div className="absolute -bottom-8 -right-8 opacity-5">
                <svg width="140" height="140" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
                </svg>
              </div>

              {/* Photo */}
              <div className="flex justify-center mb-5">
                <div className="anime-profile-photo relative">
                  {/* Anillo cónico animado alrededor de la foto */}
                  <motion.div
                    className="absolute -inset-[6px] rounded-full"
                    style={{
                      background: `conic-gradient(from 0deg, ${statusColor}, ${statusColor}55, ${statusColor}, ${statusColor}22, ${statusColor})`,
                      filter: 'blur(0.5px)',
                    }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
                  />
                  <div className="relative w-28 h-28 rounded-full overflow-hidden border-[3px]"
                    style={{ borderColor: 'var(--surface)', boxShadow: `0 0 0 4px ${statusBg}, 0 12px 28px rgba(15,23,42,0.18)` }}>
                    {profilePhotoSrc ? (
                      <img src={profilePhotoSrc} alt="Foto" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-black text-3xl"
                        style={{ background: 'var(--surface-2)', color: 'var(--blue)' }}>
                        {getInitials(perfil.nombres)}
                      </div>
                    )}
                    {uploadingPhoto && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-full"
                        style={{ background: 'rgba(255,255,255,0.85)' }}>
                        <Loader2 className="animate-spin" size={28} style={{ color: 'var(--blue)' }} />
                      </div>
                    )}
                  </div>

                  {/* Punto de estado con pulso */}
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--surface)', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>
                    <motion.span
                      className="block w-2.5 h-2.5 rounded-full"
                      style={{ background: statusColor, boxShadow: `0 0 0 0 ${statusColor}` }}
                      animate={{ boxShadow: [`0 0 0 0 ${statusColor}aa`, `0 0 0 8px ${statusColor}00`] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                    />
                  </div>

                  {!uploadingPhoto && asistenciaHoy && (
                    <motion.button
                      onClick={() => setShowProfileEditor(true)}
                      className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full flex items-center justify-center text-white border-4"
                      style={{ background: 'var(--blue)', borderColor: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}
                      whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                    >
                      <Edit2 size={14} />
                    </motion.button>
                  )}
                </div>
              </div>

              <h2 className="text-[22px] font-extrabold text-center leading-tight uppercase tracking-tight"
                style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif', letterSpacing: '-0.01em' }}>
                {perfil.nombres}
              </h2>
              <p className="text-[13px] text-center mt-1 font-semibold tabular-nums tracking-[0.32em]"
                style={{ color: 'var(--text-3)', fontFamily: 'Sora, sans-serif' }}>
                {perfil.dni}
              </p>

              <div className="flex justify-center items-center gap-2 mt-3">
                <span className="anime-fotocheck-chip px-4 py-1.5 rounded-full text-[11px] font-extrabold tracking-[0.18em] uppercase"
                  style={{ background: 'var(--blue-light)', color: 'var(--blue)', border: '1.5px solid var(--border-2)', fontFamily: 'Sora, sans-serif' }}>
                  {perfil.area}
                </span>
                <span className="anime-fotocheck-chip px-2.5 py-1 rounded-full text-[9px] font-black tracking-[0.18em] uppercase flex items-center gap-1"
                  style={{ background: 'rgba(5,150,105,0.10)', color: 'var(--green)', border: '1px solid rgba(5,150,105,0.25)', fontFamily: 'Sora, sans-serif' }}>
                  <CheckCircle2 size={10} strokeWidth={3} /> VERIFICADO
                </span>
              </div>

              {perfil.fecha_cumpleanos && (
                <div className="flex justify-center mt-2">
                  <span className="anime-fotocheck-chip px-3 py-1.5 rounded-full text-[10px] font-black flex items-center gap-1.5"
                    style={{ background: 'rgba(236,72,153,0.10)', color: '#DB2777', border: '1px solid rgba(236,72,153,0.24)', fontFamily: 'Sora, sans-serif' }}>
                    <Cake size={13} /> Cumpleaños: {formatBirthdayDate(perfil.fecha_cumpleanos)}
                  </span>
                </div>
              )}

              {(isPendingLocal || cardIsOfflineOnly) && (
                <div className="flex justify-center mt-3">
                  <span className="anime-fotocheck-chip px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.14em] flex items-center gap-1.5"
                    style={{ background: 'rgba(255,247,237,0.96)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.28)' }}>
                    <CloudOff size={13} />
                    {isPendingLocal ? 'Pendiente offline' : 'Modo offline'}
                  </span>
                </div>
              )}

              <div className="w-full h-px my-5" style={{ background: 'var(--border)' }} />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-1" style={{ color: 'var(--text-3)' }}>Ingreso Hoy</p>
                  <p className="text-[26px] font-extrabold tabular-nums leading-none" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif', letterSpacing: '-0.02em' }}>
                    {asistenciaHoy ? formatTimeLima(asistenciaHoy.hora_ingreso) : 'Sin entrada'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-1" style={{ color: 'var(--text-3)' }}>Estado</p>
                  <motion.span
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-extrabold"
                    style={{ background: statusBg, color: statusColor, border: `1.5px solid ${statusColor}33`, fontFamily: 'Sora, sans-serif' }}
                    animate={{ boxShadow: [`0 0 0 0 ${statusColor}00`, `0 0 0 6px ${statusColor}1f`, `0 0 0 0 ${statusColor}00`] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
                    {asistenciaHoy?.estado_ingreso ?? 'OFFLINE'}
                  </motion.span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Actions */}
          {cardIsOfflineOnly ? (
            <div className="flex flex-col gap-3">
              <motion.div
                className="anime-fotocheck-action rounded-3xl p-5 text-center"
                style={{ background: 'rgba(255,247,237,0.92)', border: '1.5px solid rgba(245,158,11,0.28)', boxShadow: 'var(--shadow-sm)' }}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              >
                <CloudOff size={30} className="mx-auto mb-2" style={{ color: 'var(--amber)' }} />
                <p className="text-sm font-bold" style={{ color: 'var(--text-2)' }}>
                  Tu fotocheck esta disponible sin internet. La entrada se guardara en este equipo y se subira cuando vuelva la conexion.
                </p>
              </motion.div>
              <motion.button
                onClick={handleOfflineEntry}
                className="anime-fotocheck-action w-full h-[64px] rounded-2xl flex items-center justify-center gap-3 font-black text-base text-white"
                style={{ background: 'linear-gradient(135deg, #0F766E, #22C55E)', fontFamily: 'Sora, sans-serif', boxShadow: '0 12px 28px rgba(16,185,129,0.28)' }}
                whileTap={{ scale: 0.97 }}
              >
                <CloudOff size={22} />
                REGISTRAR ENTRADA OFFLINE
              </motion.button>
            </div>
          ) : asistenciaHoy?.hora_salida ? (
            <motion.div
              className="anime-fotocheck-action rounded-3xl p-6 flex flex-col items-center text-center"
              style={{ background: 'var(--green-light)', border: '1.5px solid #6EE7B7', boxShadow: 'var(--shadow-sm)' }}
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            >
              <CheckCircle2 size={40} style={{ color: 'var(--green)' }} className="mb-3" />
              <p className="font-semibold" style={{ color: '#047857' }}>Ya marcaste tu salida hoy.</p>
              <p className="font-black text-lg mt-1" style={{ color: '#065F46', fontFamily: 'Sora, sans-serif' }}>¡Buen descanso!</p>
            </motion.div>
          ) : (
            <div className="flex flex-col gap-3">
              <motion.button
                onClick={() => { setIsRemoteExit(false); setNotaTexto(''); setShowNota(true) }}
                className="anime-fotocheck-action w-full py-4 rounded-2xl flex items-center justify-center gap-2 font-semibold text-sm transition-all border"
                style={{ background: 'var(--surface)', color: 'var(--text-2)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-sm)' }}
                whileHover={{ y: -1, boxShadow: 'var(--shadow-md)' }} whileTap={{ scale: 0.98 }}
              >
                <Edit3 size={16} style={{ color: 'var(--blue)' }} />
                Añadir nota de permiso
                <span className="text-xs ml-0.5" style={{ color: 'var(--text-3)' }}>(Opcional)</span>
              </motion.button>

              <motion.button
                onClick={handleSalida}
                disabled={isMarkingExit}
                className="anime-fotocheck-action w-full h-[64px] rounded-2xl flex items-center justify-center gap-3 font-black text-base disabled:opacity-60 relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #DC2626, #B91C1C)',
                  color: 'white',
                  fontFamily: 'Sora, sans-serif',
                  boxShadow: '0 8px 24px rgba(220,38,38,0.35), 0 2px 6px rgba(220,38,38,0.2)',
                }}
                whileHover={{ scale: 1.02, boxShadow: '0 12px 32px rgba(220,38,38,0.45)' }}
                whileTap={{ scale: 0.97 }}
              >
                <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity"
                  style={{ background: 'linear-gradient(135deg, #EF4444, #DC2626)' }} />
                {isMarkingExit ? (
                  <>
                    <Loader2 className="animate-spin relative z-10" size={22} />
                    <span className="relative z-10">PROCESANDO...</span>
                  </>
                ) : (
                  <>
                    <LogOut size={22} className="relative z-10" />
                    <span className="relative z-10">MARCAR SALIDA</span>
                  </>
                )}
              </motion.button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODALS                                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* ── Obra ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showObra && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-5"
            style={{ background: 'rgba(30,27,75,0.45)', backdropFilter: 'blur(10px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { if (!guardando) { setShowObra(false); setNotaTexto('') } }}>
            <ModalCard onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: 'var(--blue-light)', border: '1.5px solid var(--border-2)' }}>
                  <HardHat size={24} style={{ color: 'var(--blue)' }} />
                </div>
                <div>
                  <h3 className="font-black text-base" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>Ingreso a Obra</h3>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>Indica el nombre del proyecto</p>
                </div>
                <button onClick={() => { if (!guardando) { setShowObra(false); setNotaTexto('') } }} className="ml-auto w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                  <X size={14} />
                </button>
              </div>
              <NoteInput value={notaTexto} onChange={setNotaTexto} placeholder="Ej. Obra San Isidro, Proyecto BCP..." accentColor="var(--blue)" disabled={guardando} />
              <div className="flex items-center gap-2 mt-3 mb-5 px-3 py-2 rounded-xl" style={{ background: 'var(--green-light)', border: '1px solid #6EE7B7' }}>
                <MapPin size={14} style={{ color: 'var(--green)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>Se adjuntará tu GPS actual</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { setShowObra(false); setNotaTexto('') }} disabled={guardando}
                  className="py-4 rounded-2xl font-bold text-sm transition-all"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1.5px solid var(--border)' }}>
                  Cancelar
                </button>
                <motion.button onClick={() => procesarRemoto('obra', 'Ingreso en')} disabled={guardando}
                  className="py-4 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2"
                  style={{ background: 'var(--blue)', boxShadow: 'var(--shadow-md)' }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                  {guardando ? <Loader2 className="animate-spin" size={18} /> : 'Registrar'}
                </motion.button>
              </div>
            </ModalCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Externo ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showExterno && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-5"
            style={{ background: 'rgba(30,27,75,0.45)', backdropFilter: 'blur(10px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { if (!guardando) { setShowExterno(false); setNotaTexto('') } }}>
            <ModalCard onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: 'var(--purple-light)', border: '1.5px solid #DDD6FE' }}>
                  <Store size={24} style={{ color: 'var(--purple)' }} />
                </div>
                <div>
                  <h3 className="font-black text-base" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>Diligencia Externa</h3>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>Indica el motivo o lugar</p>
                </div>
                <button onClick={() => { if (!guardando) { setShowExterno(false); setNotaTexto('') } }} className="ml-auto w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                  <X size={14} />
                </button>
              </div>
              <NoteInput value={notaTexto} onChange={setNotaTexto} placeholder="Ej. Cita Essalud, Recojo de EPPs..." accentColor="var(--purple)" disabled={guardando} />
              <div className="flex items-center gap-2 mt-3 mb-5 px-3 py-2 rounded-xl" style={{ background: 'var(--green-light)', border: '1px solid #6EE7B7' }}>
                <MapPin size={14} style={{ color: 'var(--green)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>Se adjuntará tu GPS actual</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { setShowExterno(false); setNotaTexto('') }} disabled={guardando}
                  className="py-4 rounded-2xl font-bold text-sm transition-all"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1.5px solid var(--border)' }}>
                  Cancelar
                </button>
                <motion.button onClick={() => procesarRemoto('externo', 'Marcación Externa')} disabled={guardando}
                  className="py-4 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2"
                  style={{ background: 'var(--purple)', boxShadow: '0 6px 20px rgba(124,58,237,0.3)' }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                  {guardando ? <Loader2 className="animate-spin" size={18} /> : 'Registrar'}
                </motion.button>
              </div>
            </ModalCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Nocturno ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showNocturno && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-5"
            style={{ background: 'rgba(30,27,75,0.45)', backdropFilter: 'blur(10px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { if (!guardando) { setShowNocturno(false); setNotaTexto(''); setHoraSeleccionada(null) } }}>
            <ModalCard onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: 'var(--amber-light)', border: '1.5px solid #FDE68A' }}>
                  <Moon size={22} style={{ color: 'var(--amber)' }} />
                </div>
                <div>
                  <h3 className="font-black text-base" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>Turno Nocturno</h3>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>Registro 7 PM – 11 PM · Siempre puntual</p>
                </div>
                <button onClick={() => { if (!guardando) { setShowNocturno(false); setNotaTexto(''); setHoraSeleccionada(null) } }}
                  className="ml-auto w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                  <X size={14} />
                </button>
              </div>

              {/* Hour selector */}
              <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-3)' }}>¿A qué hora entras?</p>
              <div className="grid grid-cols-5 gap-1.5 mb-5">
                {HORAS_NOCTURNAS.map(({ hora, label }) => {
                  const sel = horaSeleccionada === hora
                  return (
                    <motion.button
                      key={hora}
                      onClick={() => setHoraSeleccionada(hora)}
                      className="py-2.5 rounded-xl text-xs font-black transition-all"
                      style={{
                        background: sel ? 'var(--amber)' : 'var(--surface-2)',
                        color:      sel ? 'white' : 'var(--text-2)',
                        border:     `1.5px solid ${sel ? 'var(--amber)' : 'var(--border)'}`,
                        boxShadow:  sel ? '0 4px 12px rgba(217,119,6,0.35)' : 'none',
                      }}
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    >
                      {label}
                    </motion.button>
                  )
                })}
              </div>

              {/* Lugar */}
              <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-3)' }}>¿En qué obra o lugar trabajas?</p>
              <NoteInput value={notaTexto} onChange={setNotaTexto} placeholder="Obligatorio: Ej. Obra Callao, Planta Lima..." accentColor="var(--amber)" disabled={guardando} />

              {/* GPS note */}
              <div className="flex items-center gap-2 mt-3 mb-5 px-3 py-2 rounded-xl" style={{ background: 'var(--green-light)', border: '1px solid #6EE7B7' }}>
                <MapPin size={14} style={{ color: 'var(--green)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>GPS y hora real quedarán registrados</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { setShowNocturno(false); setNotaTexto(''); setHoraSeleccionada(null) }} disabled={guardando}
                  className="py-4 rounded-2xl font-bold text-sm transition-all"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1.5px solid var(--border)' }}>
                  Cancelar
                </button>
                <motion.button
                  onClick={procesarNocturno}
                  disabled={guardando || !horaSeleccionada || !notaTexto.trim()}
                  className="py-4 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: 'var(--amber)', boxShadow: '0 6px 20px rgba(217,119,6,0.35)' }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                  {guardando ? <Loader2 className="animate-spin" size={18} /> : <><Moon size={16} /> Registrar</>}
                </motion.button>
              </div>
            </ModalCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Nota / Salida remota ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showNota && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-5"
            style={{ background: 'rgba(30,27,75,0.45)', backdropFilter: 'blur(10px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { if (!guardando) { setShowNota(false); setIsRemoteExit(false) } }}>
            <ModalCard onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: isRemoteExit ? 'var(--red-light)' : 'var(--surface-2)', border: `1.5px solid ${isRemoteExit ? '#FCA5A5' : 'var(--border)'}` }}>
                  {isRemoteExit ? <MapPin size={22} style={{ color: 'var(--red)' }} /> : <Edit3 size={22} style={{ color: 'var(--text-2)' }} />}
                </div>
                <div>
                  <h3 className="font-black text-base" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>
                    {isRemoteExit ? 'Salida Remota' : 'Añadir Nota'}
                  </h3>
                  {isRemoteExit && <p className="text-xs font-bold" style={{ color: 'var(--red)' }}>Estás fuera de la oficina</p>}
                </div>
                <button onClick={() => { if (!guardando) { setShowNota(false); setIsRemoteExit(false) } }} className="ml-auto w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                  <X size={14} />
                </button>
              </div>
              <NoteInput value={notaTexto} onChange={setNotaTexto}
                placeholder={isRemoteExit ? 'Obligatorio: tu ubicación u obra actual...' : 'Ej: Salida por comisión, malestar físico...'}
                accentColor={isRemoteExit ? 'var(--red)' : 'var(--blue)'} disabled={guardando} />
              <div className="grid grid-cols-2 gap-3 mt-5">
                <button onClick={() => { setShowNota(false); setIsRemoteExit(false) }} disabled={guardando}
                  className="py-4 rounded-2xl font-bold text-sm"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1.5px solid var(--border)' }}>
                  Cancelar
                </button>
                <motion.button onClick={handleGuardarNota} disabled={guardando}
                  className="py-4 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2"
                  style={{ background: isRemoteExit ? 'var(--red)' : 'var(--blue)', boxShadow: 'var(--shadow-md)' }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                  {guardando ? <Loader2 className="animate-spin" size={18} /> : 'Confirmar'}
                </motion.button>
              </div>
            </ModalCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Calendario (Bottom Sheet) ─────────────────────────────────────── */}
      <AnimatePresence>
        {showCalendar && (
          <motion.div className="fixed inset-0 z-50 flex items-stretch justify-center"
            style={{ background: 'rgba(30,27,75,0.45)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowCalendar(false)}>
            <motion.div
              className="w-full max-w-lg p-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+24px)] flex flex-col"
              style={{ background: 'var(--surface)', boxShadow: '0 -20px 60px rgba(30,27,75,0.15)', maxHeight: '90vh', border: '1.5px solid var(--border)', borderBottom: 'none' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => setShowCalendar(false)} className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#0F172A', color: 'white' }}>
                <ChevronLeft size={22} />
              </button>

              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--blue-light)', border: '1.5px solid var(--border-2)' }}>
                    <Calendar size={22} style={{ color: 'var(--blue)' }} />
                  </div>
                  <div>
                    <h3 className="font-black text-lg" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>Mi Historial</h3>
                    <p className="text-sm font-semibold capitalize" style={{ color: 'var(--text-3)' }}>
                      {format(targetDate, 'MMMM yyyy', { locale: es })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <motion.button onClick={() => setTargetDate(new Date(targetDate.getFullYear(), targetDate.getMonth() - 1))}
                    className="w-9 h-9 rounded-xl flex items-center justify-center border"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-2)' }}
                    whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <ChevronLeft size={18} />
                  </motion.button>
                  <motion.button
                    onClick={() => {
                      const next = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1)
                      if (next <= new Date()) setTargetDate(next)
                    }}
                    disabled={new Date(targetDate.getFullYear(), targetDate.getMonth() + 1) > new Date()}
                    className="w-9 h-9 rounded-xl flex items-center justify-center border disabled:opacity-30"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-2)' }}
                    whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <ChevronRight size={18} />
                  </motion.button>
                </div>
              </div>

              {loadingCal ? (
                <div className="flex-1 flex items-center justify-center py-12">
                  <Loader2 className="animate-spin" size={36} style={{ color: 'var(--blue)' }} />
                </div>
              ) : (
                <div className="overflow-y-auto scrollbar-hide flex-1">
                  {renderCalendario()}
                  <div className="flex justify-center gap-5 mt-6 p-4 rounded-2xl" style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border)' }}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: 'var(--green)', boxShadow: '0 0 8px rgba(5,150,105,0.5)' }} />
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Puntual</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: 'var(--red)', boxShadow: '0 0 8px rgba(220,38,38,0.4)' }} />
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Tardanza</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: 'var(--blue)', boxShadow: '0 0 8px rgba(37,99,235,0.38)' }} />
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Vacaciones</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Detalle del día ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showVacations && (
          <motion.div className="fixed inset-0 z-50 flex items-stretch justify-center"
            style={{ background: 'rgba(30,27,75,0.45)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !submittingVacation && setShowVacations(false)}>
            <motion.div
              className="w-full max-w-lg p-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+24px)] flex flex-col"
              style={{ background: 'linear-gradient(180deg, #F8FBFF, #EEF8F4, #EAF2FF)', minHeight: '100vh' }}
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => !submittingVacation && setShowVacations(false)} className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#0F172A', color: 'white' }}>
                <ChevronLeft size={22} />
              </button>
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--blue-light)', border: '1.5px solid var(--border-2)' }}>
                    <PlaneTakeoff size={22} style={{ color: 'var(--blue)' }} />
                  </div>
                  <div>
                    <h3 className="font-black text-lg" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>Mis Vacaciones</h3>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-3)' }}>Consulta tu saldo y solicita dias desde aqui.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <motion.button
                    onClick={() => void cargarVacaciones(perfil.dni, true)}
                    className="w-10 h-10 rounded-2xl flex items-center justify-center border transition-all"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-2)' }}
                    whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}>
                    <RefreshCw size={17} />
                  </motion.button>
                  <button
                    onClick={() => !submittingVacation && setShowVacations(false)}
                    className="w-10 h-10 rounded-2xl flex items-center justify-center border"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-2)' }}>
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto scrollbar-hide flex-1 pr-1">
                {loadingVacaciones ? (
                  <div className="flex min-h-[240px] items-center justify-center">
                    <Loader2 className="animate-spin" size={32} style={{ color: 'var(--blue)' }} />
                  </div>
                ) : (
                  <div className="space-y-4 pb-2">
                    {vacacionesError && (
                      <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: 'var(--red-light)', color: 'var(--red)', border: '1.5px solid #FCA5A5' }}>
                        {vacacionesError}
                      </div>
                    )}
                    {vacacionesSaldo ? (
                      <div className="rounded-3xl p-5" style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border)' }}>
                        <p className="text-lg font-black" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>
                          {vacacionesSaldo.trabajador_nombre}
                        </p>
                        <p className="text-sm font-semibold mt-1" style={{ color: 'var(--text-3)' }}>
                          {(vacacionesSaldo.area || perfil.area || 'Sin area')} · {(vacacionesSaldo.cargo || 'Sin cargo')}
                        </p>
                        <div className="grid grid-cols-2 gap-3 mt-5">
                          {(() => {
                            const periodo = num(vacacionesSaldo.periodo) || new Date().getFullYear()
                            const tiles: { label: string; value: number; color: string; bg: string; icon: React.ReactNode }[] = [
                              { label: 'Pendientes', value: pendingDisplay, color: 'var(--green)', bg: 'var(--green-light)', icon: <Wallet size={16} /> },
                              { label: 'Gozados', value: gozadosDisplay, color: 'var(--blue)', bg: 'var(--blue-light)', icon: <PlaneTakeoff size={16} /> },
                              { label: 'Periodos anteriores', value: periodosAnterioresDisplay, color: 'var(--text-2)', bg: 'var(--surface)', icon: <History size={16} /> },
                              { label: `Pend. ${periodo}`, value: pendingDisplay, color: '#D97706', bg: '#FEF3C7', icon: <Calendar size={16} /> },
                            ]
                            if (porVencerDisplay > 0) {
                              tiles.push({ label: 'Por vencer', value: porVencerDisplay, color: '#B45309', bg: '#FEF3C7', icon: <RefreshCw size={16} /> })
                            }
                            return tiles
                          })().map((item) => (
                            <div key={item.label} className="rounded-2xl p-4 border" style={{ background: item.bg, borderColor: 'var(--border)' }}>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: item.color }}>{item.label}</span>
                                <span style={{ color: item.color }}>{item.icon}</span>
                              </div>
                              <p className="mt-3 text-2xl font-black" style={{ color: item.color, fontFamily: 'Sora, sans-serif' }}>{item.value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 rounded-2xl px-4 py-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                          <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: 'var(--text-3)' }}>Vencimiento actual</p>
                          <p className="mt-1 text-sm font-black" style={{ color: 'var(--text-1)' }}>{formatShortDate(vacacionesSaldo.fecha_vencimiento)}</p>
                          <p className="mt-1 text-xs font-medium" style={{ color: 'var(--text-3)' }}>
                            Al aprobarse, los dias bajan de pendientes y suben a gozados en tiempo real.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-3xl p-5 text-center" style={{ background: 'var(--surface-2)', border: '1.5px dashed var(--border)' }}>
                        <p className="font-black text-base" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>Sin saldo importado</p>
                        <p className="text-sm mt-2" style={{ color: 'var(--text-3)' }}>
                          Todavia no encontramos vacaciones cargadas para tu DNI en la hoja 2026.
                        </p>
                      </div>
                    )}
                    {vacacionesSaldo && (
                      <div className="rounded-3xl p-5" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div>
                            <h4 className="font-black text-base" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>Solicitar vacaciones</h4>
                            <p className="text-xs font-semibold mt-1" style={{ color: 'var(--text-3)' }}>
                              Puedes pedirlas aunque tu saldo quede en positivo o negativo.
                            </p>
                          </div>
                          <span className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black" style={{ background: 'var(--blue-light)', color: 'var(--blue)' }}>
                            {diasSolicitadosPreview > 0 ? `${diasSolicitadosPreview} dia(s)` : 'Rango invalido'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="rounded-2xl p-4 border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                            <p className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: 'var(--text-3)' }}>Desde</p>
                            <input type="date" value={vacationStart} onChange={e => setVacationStart(e.target.value)}
                              className="mt-2 w-full bg-transparent text-sm font-bold outline-none" style={{ color: 'var(--text-1)' }} />
                          </label>
                          <label className="rounded-2xl p-4 border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                            <p className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: 'var(--text-3)' }}>Hasta</p>
                            <input type="date" value={vacationEnd} onChange={e => setVacationEnd(e.target.value)}
                              className="mt-2 w-full bg-transparent text-sm font-bold outline-none" style={{ color: 'var(--text-1)' }} />
                          </label>
                        </div>
                        <div className="mt-3 rounded-2xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                          <textarea
                            value={vacationComment}
                            onChange={e => setVacationComment(e.target.value)}
                            rows={3}
                            placeholder="Comentario opcional para RRHH o jefatura..."
                            className="w-full resize-none rounded-2xl bg-transparent p-4 text-sm outline-none"
                            style={{ color: 'var(--text-1)' }}
                          />
                        </div>
                        <div className="mt-4 rounded-2xl px-4 py-3 border" style={{ background: 'var(--blue-light)', borderColor: '#BFDBFE' }}>
                          <p className="text-xs font-semibold" style={{ color: 'var(--blue)' }}>
                            Resumen: {Math.max(diasSolicitadosPreview, 0)} dia(s) calendario · saldo visible actual {pendingDisplay}
                          </p>
                        </div>
                        <motion.button
                          onClick={handleSolicitarVacaciones}
                          disabled={submittingVacation || diasSolicitadosPreview <= 0}
                          className="mt-4 w-full py-4 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 disabled:opacity-50"
                          style={{ background: 'var(--blue)', boxShadow: 'var(--shadow-md)' }}
                          whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                        >
                          {submittingVacation ? <Loader2 className="animate-spin" size={18} /> : <><PlaneTakeoff size={16} /> SOLICITAR VACACIONES</>}
                        </motion.button>
                      </div>
                    )}
                    <div className="rounded-3xl p-5" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                      <h4 className="font-black text-base" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>Historial de solicitudes</h4>
                      <p className="text-xs font-semibold mt-1 mb-4" style={{ color: 'var(--text-3)' }}>
                        Cuando una solicitud queda aprobada, tu saldo visible se recalcula automaticamente.
                      </p>
                      {vacacionesSolicitudes.length === 0 ? (
                        <div className="rounded-2xl border px-4 py-8 text-center text-sm font-semibold" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                          Aun no tienes solicitudes registradas.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {vacacionesSolicitudes.map((item) => {
                            const status = normalizeStatus(item.estado)
                            const badgeBg = status === 'aprobada' ? 'var(--green-light)' : status === 'cancelada' ? 'var(--red-light)' : '#FEF3C7'
                            const badgeColor = status === 'aprobada' ? 'var(--green)' : status === 'cancelada' ? 'var(--red)' : '#B45309'
                            return (
                              <div key={item.id} className="rounded-2xl p-4 border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-black" style={{ color: 'var(--text-1)' }}>
                                      {formatVacationRangeLabel(item.fecha_inicio, item.fecha_fin)}
                                    </p>
                                    <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                                      {num(item.dias_solicitados)} dia(s)
                                    </p>
                                  </div>
                                  <span className="inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase"
                                    style={{ background: badgeBg, color: badgeColor }}>
                                    {status === 'cancelada' ? 'rechazada' : status}
                                  </span>
                                </div>
                                {(item.saldo_antes != null || item.saldo_despues != null) && (
                                  <div className="mt-3 flex items-center justify-between rounded-xl px-3 py-2 border"
                                    style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                                    <span className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: 'var(--text-3)' }}>Saldo</span>
                                    <span className="text-sm font-black" style={{ color: 'var(--text-1)' }}>
                                      {item.saldo_antes ?? '—'} {'->'} {item.saldo_despues ?? '—'}
                                    </span>
                                  </div>
                                )}
                                {item.comentario && (
                                  <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
                                    {item.comentario}
                                  </p>
                                )}
                                {item.created_at && (
                                  <p className="mt-3 text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>
                                    Registrada: {formatDateTimeLabel(item.created_at)}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedVacationDay && (
          <motion.div className="fixed inset-0 z-[60] flex items-center justify-center p-5"
            style={{ background: 'rgba(30,27,75,0.5)', backdropFilter: 'blur(12px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSelectedVacationDay(null)}>
            <motion.div
              className="w-full max-w-sm rounded-3xl p-7 relative overflow-hidden"
              style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', border: '1.5px solid var(--border)' }}
              initial={{ scale: 0.9, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 16 }}
              transition={{ type: 'spring', stiffness: 450, damping: 30 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 right-0 h-24 opacity-40"
                style={{ background: 'linear-gradient(to bottom, rgba(37,99,235,0.2), transparent)' }} />
              <div className="flex flex-col items-center text-center relative z-10">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'var(--blue-light)' }}>
                  <PlaneTakeoff size={32} style={{ color: 'var(--blue)' }} />
                </div>
                <h3 className="text-2xl font-black capitalize" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>
                  {format(parseISO(selectedVacationDay.fecha), "EEEE dd", { locale: es })}
                </h3>
                <p className="text-sm font-medium capitalize mt-0.5" style={{ color: 'var(--text-3)' }}>
                  {format(parseISO(selectedVacationDay.fecha), "MMMM yyyy", { locale: es })}
                </p>
                <span className="mt-3 px-4 py-1.5 rounded-lg text-xs font-black tracking-wider uppercase"
                  style={{ background: 'var(--blue-light)', color: 'var(--blue)', border: '1.5px solid #93C5FD' }}>
                  Vacaciones aprobadas
                </span>
                <div className="w-full mt-6 space-y-3">
                  {selectedVacationDay.solicitudes.map((item) => (
                    <div key={item.id} className="rounded-2xl p-4 text-left"
                      style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border)' }}>
                      <p className="text-sm font-black" style={{ color: 'var(--text-1)' }}>
                        {formatVacationRangeLabel(item.fecha_inicio, item.fecha_fin)}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                        {num(item.dias_solicitados)} dia(s) aprobados
                      </p>
                      {item.comentario && (
                        <p className="text-sm mt-3 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                          {item.comentario}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <motion.button onClick={() => setSelectedVacationDay(null)}
                  className="w-full mt-6 py-4 rounded-2xl font-bold text-sm"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1.5px solid var(--border)' }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                  Cerrar
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMedicalLeave && (
          <motion.div className="fixed inset-0 z-50 flex items-stretch justify-center"
            style={{ background: 'rgba(49,46,129,0.45)', backdropFilter: 'blur(10px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !submittingMedical && setShowMedicalLeave(false)}>
            <motion.div
              className="w-full max-w-lg p-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+24px)] flex flex-col"
              style={{ background: 'linear-gradient(180deg, #F8FBFF, #F5F3FF, #ECFEFF)', minHeight: '100vh' }}
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-5">
                <button onClick={() => !submittingMedical && setShowMedicalLeave(false)} className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#0F172A', color: 'white' }}>
                  <ChevronLeft size={22} />
                </button>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden border" style={{ background: 'white', borderColor: '#DDD6FE' }}>
                  <img src="/icons-web/descanso-medico.gif" alt="" className="w-12 h-12 object-contain" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-xl" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>Descanso medico</h3>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-3)' }}>Sustenta con foto y comentario para RRHH.</p>
                </div>
              </div>

              <div className="overflow-y-auto scrollbar-hide flex-1 pr-1 space-y-5">
                <motion.div
                  className="rounded-[30px] p-5 border relative overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.88)', borderColor: '#DDD6FE', boxShadow: '0 20px 50px rgba(124,58,237,0.12)' }}
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                >
                  <motion.div className="absolute -right-16 -top-16 h-36 w-36 rounded-full opacity-25 blur-2xl"
                    style={{ background: 'linear-gradient(135deg, #7C3AED, #EC4899)' }}
                    animate={{ scale: [1, 1.25, 1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  />

                  <div className="grid grid-cols-2 gap-3 relative z-10">
                    <label className="space-y-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: 'var(--text-3)' }}>Desde</span>
                      <input type="date" value={medicalStart} onChange={(e) => {
                        setMedicalStart(e.target.value)
                        if (medicalEnd < e.target.value) setMedicalEnd(e.target.value)
                      }} className="w-full rounded-2xl border px-3 py-3 text-sm font-black outline-none" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-1)' }} />
                    </label>
                    <label className="space-y-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: 'var(--text-3)' }}>Hasta</span>
                      <input type="date" value={medicalEnd} onChange={(e) => {
                        setMedicalEnd(e.target.value)
                        if (medicalStart > e.target.value) setMedicalStart(e.target.value)
                      }} className="w-full rounded-2xl border px-3 py-3 text-sm font-black outline-none" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-1)' }} />
                    </label>
                  </div>

                  <label className="mt-4 block space-y-2 relative z-10">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: 'var(--text-3)' }}>Comentario</span>
                    <textarea
                      value={medicalComment}
                      onChange={(e) => setMedicalComment(e.target.value.slice(0, 280))}
                      placeholder="Ejemplo: descanso por indicacion medica, adjunto certificado."
                      className="min-h-[112px] w-full resize-none rounded-2xl border px-4 py-3 text-sm font-semibold outline-none"
                      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
                    />
                  </label>

                  <input ref={medicalCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
                    handleMedicalFiles(e.target.files)
                    e.currentTarget.value = ''
                  }} />
                  <input ref={medicalGalleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
                    handleMedicalFiles(e.target.files)
                    e.currentTarget.value = ''
                  }} />

                  <div className="mt-4 grid grid-cols-2 gap-3 relative z-10">
                    <motion.button type="button" onClick={() => medicalCameraRef.current?.click()} className="rounded-2xl border px-3 py-4 flex flex-col items-center gap-2 font-black text-sm"
                      style={{ background: '#F5F3FF', color: '#7C3AED', borderColor: '#DDD6FE' }} whileTap={{ scale: 0.97 }}>
                      <Camera size={22} /> Tomar foto
                    </motion.button>
                    <motion.button type="button" onClick={() => medicalGalleryRef.current?.click()} className="rounded-2xl border px-3 py-4 flex flex-col items-center gap-2 font-black text-sm"
                      style={{ background: '#FDF2F8', color: '#DB2777', borderColor: '#FBCFE8' }} whileTap={{ scale: 0.97 }}>
                      <Upload size={22} /> Subir fotos
                    </motion.button>
                  </div>

                  <AnimatePresence>
                    {medicalFiles.length > 0 && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                        className="mt-4 rounded-2xl border px-4 py-3 flex items-center gap-3 relative z-10"
                        style={{ background: '#DCFCE7', borderColor: '#86EFAC', color: '#166534' }}>
                        <CheckCircle2 size={20} />
                        <div className="flex-1">
                          <p className="font-black text-sm">{medicalFiles.length} evidencia(s) lista(s)</p>
                          <p className="text-xs font-semibold opacity-75">Maximo 8 fotos por solicitud</p>
                        </div>
                        <button type="button" onClick={() => setMedicalFiles([])} className="text-xs font-black">Limpiar</button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.button
                    onClick={submitMedicalLeave}
                    disabled={submittingMedical}
                    className="relative z-10 mt-4 w-full py-4 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #7C3AED, #EC4899)', boxShadow: '0 16px 34px rgba(124,58,237,0.24)' }}
                    whileTap={{ scale: 0.98 }}>
                    {submittingMedical ? <Loader2 className="animate-spin" size={18} /> : <><Send size={17} /> ENVIAR A RRHH</>}
                  </motion.button>
                </motion.div>

                <div className="rounded-[28px] border p-5" style={{ background: 'rgba(255,255,255,0.82)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: '#7C3AED' }}>Historial</p>
                      <h4 className="font-black text-lg" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>Tus solicitudes</h4>
                    </div>
                    <button onClick={() => perfil && cargarDescansosMedicos(perfil.dni, true)} className="w-10 h-10 rounded-2xl border flex items-center justify-center" style={{ background: 'white', borderColor: 'var(--border)', color: 'var(--text-2)' }}>
                      {loadingMedical ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />}
                    </button>
                  </div>

                  {loadingMedical ? (
                    <div className="py-8 flex justify-center"><Loader2 className="animate-spin" size={26} style={{ color: '#7C3AED' }} /></div>
                  ) : medicalRequests.length === 0 ? (
                    <div className="rounded-2xl border px-4 py-7 text-center text-sm font-semibold" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                      Todavia no tienes descansos medicos enviados.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {medicalRequests.map((item, index) => {
                        const status = normalizeStatus(item.estado)
                        const statusColor = status === 'aprobada' ? 'var(--green)' : status === 'rechazada' ? 'var(--red)' : '#B45309'
                        const statusBg = status === 'aprobada' ? 'var(--green-light)' : status === 'rechazada' ? 'var(--red-light)' : '#FEF3C7'
                        const urls = (item.evidencia_urls ?? []).filter(Boolean)
                        if (!urls.length && item.evidencia_url) urls.push(item.evidencia_url)
                        return (
                          <motion.div key={item.id} className="rounded-2xl border p-4"
                            style={{ background: 'white', borderColor: 'var(--border)' }}
                            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
                            <div className="flex items-start gap-3">
                              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: statusBg, color: statusColor }}>
                                <Stethoscope size={21} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-black text-sm" style={{ color: 'var(--text-1)' }}>{item.fecha_inicio} al {item.fecha_fin}</p>
                                <p className="text-xs font-semibold mt-1 line-clamp-2" style={{ color: 'var(--text-3)' }}>{item.comentario || 'Sin comentario'}</p>
                              </div>
                              <span className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase" style={{ background: statusBg, color: statusColor }}>
                                {status}
                              </span>
                            </div>
                            {urls.length > 0 && (
                              <button onClick={() => window.open(urls[0], '_blank', 'noopener,noreferrer')} className="mt-3 w-full rounded-2xl border px-3 py-2.5 flex items-center justify-center gap-2 text-xs font-black"
                                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-2)' }}>
                                <ImageIcon size={16} /> Ver evidencia enviada ({urls.length})
                              </button>
                            )}
                          </motion.div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <OnboardingTour
        open={showTour}
        onFinish={() => {
          setShowTour(false)
          try { localStorage.setItem('TOUR_SEEN', '1') } catch {}
        }}
      />

      <AnimatePresence>
        {showUpdates && (
          <WorkerInfoScreen
            title="Actualizaciones"
            subtitle="Libro de novedades recientes de la app."
            gif="/icons-web/actualizaciones.gif"
            color="#0F766E"
            onClose={() => setShowUpdates(false)}
            items={[
              ['v5.0 - Cumpleaños', 'Mira qué cumpleaños se acercan y el día que cumplen tus compañeros.'],
              ['v4.9 - Ranking separado', 'Ranking puntual y ranking tardanza ahora son accesos independientes.'],
              ['v4.8 - Descanso medico', 'Puedes subir una o varias evidencias y revisar el historial de aprobacion.'],
              ['v4.7 - Sidebar animado', 'El panel rapido incluye GIFs y tarjetas modernas.'],
              ['v4.6 - Modo offline', 'El fotocheck y la asistencia pueden mantenerse hasta recuperar conexion.'],
              ['v4.5 - Vacaciones en tiempo real', 'Las solicitudes y estados se actualizan sin cerrar la app.'],
            ]}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBirthdays && (
          <BirthdaysScreen myDni={perfil?.dni} onClose={() => setShowBirthdays(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProfileEditor && perfil && (
          <ProfileEditorModal
            open={showProfileEditor}
            perfil={perfil}
            photoSrc={profilePhotoSrc}
            uploading={uploadingPhoto}
            saving={savingProfile}
            onPickPhoto={() => fileInputRef.current?.click()}
            onClose={() => setShowProfileEditor(false)}
            onSave={(next) => void saveProfileChanges(next)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        <BirthdayPromptModal
          open={showBirthdayPrompt}
          value={birthdayDraft}
          onChange={setBirthdayDraft}
          onSave={() => void saveBirthday()}
          onSkip={skipBirthdayPrompt}
          saving={savingBirthday}
        />
      </AnimatePresence>

      <AnimatePresence>
        {selectedDay && (
          <motion.div className="fixed inset-0 z-[60] flex items-center justify-center p-5"
            style={{ background: 'rgba(30,27,75,0.5)', backdropFilter: 'blur(12px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSelectedDay(null)}>
            <motion.div
              className="w-full max-w-sm rounded-3xl p-7 relative overflow-hidden"
              style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', border: '1.5px solid var(--border)' }}
              initial={{ scale: 0.9, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 16 }}
              transition={{ type: 'spring', stiffness: 450, damping: 30 }}
              onClick={e => e.stopPropagation()}
            >
              {/* Color header */}
              <div className="absolute top-0 left-0 right-0 h-24 opacity-40"
                style={{ background: `linear-gradient(to bottom, ${selectedDay.estado_ingreso === 'PUNTUAL' ? 'rgba(5,150,105,0.2)' : 'rgba(220,38,38,0.2)'}, transparent)` }} />

              <div className="flex flex-col items-center text-center relative z-10">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                  style={{ background: selectedDay.estado_ingreso === 'PUNTUAL' ? 'var(--green-light)' : 'var(--red-light)' }}>
                  {selectedDay.estado_ingreso === 'PUNTUAL'
                    ? <CheckCircle2 size={36} style={{ color: 'var(--green)' }} />
                    : <AlertTriangle size={36} style={{ color: 'var(--red)' }} />}
                </div>

                <h3 className="text-2xl font-black capitalize" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>
                  {selectedDay.fecha ? format(parseISO(selectedDay.fecha), "EEEE dd", { locale: es }) : '—'}
                </h3>
                <p className="text-sm font-medium capitalize mt-0.5" style={{ color: 'var(--text-3)' }}>
                  {selectedDay.fecha ? format(parseISO(selectedDay.fecha), "MMMM yyyy", { locale: es }) : ''}
                </p>

                <span className="mt-3 px-4 py-1.5 rounded-lg text-xs font-black tracking-wider uppercase"
                  style={{
                    background: selectedDay.estado_ingreso === 'PUNTUAL' ? 'var(--green-light)' : 'var(--red-light)',
                    color: selectedDay.estado_ingreso === 'PUNTUAL' ? 'var(--green)' : 'var(--red)',
                    border: `1.5px solid ${selectedDay.estado_ingreso === 'PUNTUAL' ? '#6EE7B7' : '#FCA5A5'}`,
                  }}>
                  {selectedDay.estado_ingreso}
                </span>

                <div className="w-full flex gap-3 mt-6">
                  {[
                    { label: 'INGRESO', time: formatTimeLima(selectedDay.hora_ingreso) },
                    { label: 'SALIDA',  time: formatTimeLima(selectedDay.hora_salida) },
                  ].map(({ label, time }) => (
                    <div key={label} className="flex-1 rounded-2xl p-4 text-center"
                      style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border)' }}>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--text-3)' }}>{label}</p>
                      <p className="font-black text-lg" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>{time}</p>
                    </div>
                  ))}
                </div>

                {selectedDay.notas && (
                  <div className="w-full mt-4 p-4 rounded-2xl text-left" style={{ background: 'var(--surface-2)', border: '1.5px solid var(--border)' }}>
                    <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>Notas</p>
                    <p className="text-sm font-medium leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-2)' }}>{selectedDay.notas}</p>
                  </div>
                )}

                <motion.button onClick={() => setSelectedDay(null)}
                  className="w-full mt-6 py-4 rounded-2xl font-bold text-sm"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1.5px solid var(--border)' }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                  Cerrar
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Logros (Bottom Sheet) ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showLogros && (
          <motion.div className="fixed inset-0 z-50 flex items-stretch justify-center"
            style={{ background: 'rgba(30,27,75,0.45)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowLogros(false)}>
            <motion.div
              className="w-full max-w-lg p-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+24px)] flex flex-col"
              style={{ background: 'linear-gradient(180deg, #F8FBFF, #FFF7E6, #EEF8F4)', minHeight: '100vh' }}
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => setShowLogros(false)} className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#0F172A', color: 'white' }}>
                <ChevronLeft size={22} />
              </button>

              <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: 'var(--gold-light)', border: '1.5px solid #FDE68A' }}>
                  <Trophy size={28} style={{ color: 'var(--gold)' }} />
                </div>
                <div>
                  <h3 className="font-black text-xl" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>Mis Trofeos</h3>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-3)' }}>
                    {unlockedLogros.length} de {TODOS_LOS_LOGROS.length} desbloqueados
                  </p>
                </div>
              </div>

              {/* Progress */}
              <div className="w-full h-2.5 rounded-full overflow-hidden mb-6" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <motion.div className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, var(--gold), #FBBF24)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(unlockedLogros.length / TODOS_LOS_LOGROS.length) * 100}%` }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                />
              </div>

              <div className="overflow-y-auto scrollbar-hide flex-1 pb-4 space-y-3">
                {TODOS_LOS_LOGROS.map((logro, i) => {
                  const unlocked = unlockedLogros.includes(logro.id)
                  return (
                    <motion.div
                      key={logro.id}
                      className="flex items-center p-4 rounded-2xl border transition-all"
                      style={{
                        background:   unlocked ? 'var(--gold-light)' : 'var(--surface-2)',
                        borderColor:  unlocked ? '#FDE68A' : 'var(--border)',
                      }}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 border"
                        style={{
                          background:  unlocked ? 'rgba(217,119,6,0.1)' : 'var(--border)',
                          borderColor: unlocked ? '#FDE68A' : 'var(--border)',
                        }}>
                        {unlocked ? logro.emoji : <Lock size={18} style={{ color: 'var(--text-3)' }} />}
                      </div>
                      <div className="ml-4 flex-1">
                        <h4 className="font-black text-base" style={{ color: unlocked ? 'var(--gold)' : 'var(--text-3)', fontFamily: 'Sora, sans-serif' }}>
                          {logro.titulo}
                        </h4>
                        <p className="text-xs font-medium mt-0.5 leading-snug" style={{ color: unlocked ? 'var(--text-2)' : 'var(--text-3)' }}>
                          {logro.desc}
                        </p>
                      </div>
                      {unlocked && <CheckCircle2 size={20} className="ml-2 shrink-0" style={{ color: 'var(--green)' }} />}
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Achievement Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {achievement && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ background: 'rgba(30,27,75,0.92)', backdropFilter: 'blur(16px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setAchievement(null)}
          >
            <motion.div
              className="flex flex-col items-center px-8 text-center"
              initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 350, damping: 22 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="relative mb-8">
                <div className="absolute inset-0 rounded-full opacity-50"
                  style={{ background: 'radial-gradient(circle, rgba(217,119,6,0.6), transparent 70%)', filter: 'blur(20px)' }} />
                <div className="text-8xl relative z-10" style={{ animation: 'float 3s ease-in-out infinite' }}>
                  {achievement.emoji}
                </div>
              </div>

              <div className="px-5 py-1.5 rounded-full mb-4"
                style={{ background: 'rgba(217,119,6,0.15)', border: '1.5px solid rgba(251,191,36,0.4)' }}>
                <span className="text-xs font-black tracking-widest uppercase" style={{ color: '#FBBF24' }}>
                  ¡NUEVO TROFEO!
                </span>
              </div>

              <h2 className="text-4xl font-black text-white mb-3" style={{ fontFamily: 'Sora, sans-serif' }}>
                {achievement.titulo}
              </h2>
              <p className="text-base mb-10 max-w-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {achievement.desc}
              </p>

              <motion.button
                onClick={() => setAchievement(null)}
                className="px-12 py-4 rounded-2xl font-black text-lg"
                style={{
                  background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                  color: '#1E1B4B',
                  boxShadow: '0 12px 40px rgba(217,119,6,0.45)',
                  fontFamily: 'Sora, sans-serif',
                }}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
              >
                ¡Genial!
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
