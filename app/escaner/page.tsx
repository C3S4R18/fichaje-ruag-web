'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Scanner } from '@yudiel/react-qr-scanner'
import {
  MapPin, AlertTriangle, CheckCircle, Loader2, LogOut, History,
  Edit2, Edit3, X, Trophy, Lock, Map, Calendar, ChevronLeft,
  ChevronRight, CheckCircle2, HardHat, Store, Moon, Star,
  PlaneTakeoff, Phone, RefreshCw, Wallet,
} from 'lucide-react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/utils/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Perfil      { dni: string; nombres: string; area: string; foto_url: string }
interface Asistencia  { id: string; fecha?: string; hora_ingreso: string; estado_ingreso: string; hora_salida: string | null; notas: string | null }
interface LogroItem   { id: number; emoji: string; titulo: string; desc: string }
interface VacacionesSaldo {
  dni: string
  trabajador_nombre: string
  area: string | null
  cargo: string | null
  periodo?: number
  saldo_arrastre: number
  dias_extra: number
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

const INACTIVE_AREA_PREFIX = '__INACTIVO__|'

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

// ─── Utils ────────────────────────────────────────────────────────────────────

// FIX: localStorage con manejo de errores para Safari en modo privado
const store = (() => {
  try {
    return {
      get:    (k: string) => localStorage.getItem(k),
      set:    (k: string, v: string) => localStorage.setItem(k, v),
      remove: (k: string) => localStorage.removeItem(k),
    }
  } catch {
    return { get: () => null, set: () => {}, remove: () => {} }
  }
})()

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
        color: 'var(--text-1)', fontFamily: "'DM Sans', sans-serif",
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

  // Modals
  const [showLogros, setShowLogros]         = useState(false)
  const [showCalendar, setShowCalendar]     = useState(false)
  const [showVacations, setShowVacations]   = useState(false)
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

  // Photo
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    startTimeRef.current = Date.now()

    const cargar = async () => {
      const dni    = store.get('RUAG_DNI')
      const nombre = store.get('RUAG_NOMBRE')
      if (!dni || !nombre) { router.push('/setup'); return }

      let p: Perfil | null = null
      const { data } = await supabase.from('fotocheck_perfiles').select('*').eq('dni', dni).maybeSingle()

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
        p = { dni: data.dni, nombres: data.nombres_completos, area: visibleArea, foto_url: data.foto_url || '' }
      } else {
        const area = store.get('RUAG_AREA')
        const foto = store.get('RUAG_FOTO')
        p = { dni, nombres: nombre, area: getVisibleArea(area) || 'Asignando...', foto_url: foto || '' }
      }

      if (p) {
        setPerfil(p)
        try {
          const hoy = format(new Date(), 'yyyy-MM-dd')
          const { data: ast } = await supabase.from('registro_asistencias')
            .select('id, hora_ingreso, estado_ingreso, hora_salida, notas, fecha')
            .eq('dni', p.dni).eq('fecha', hoy).order('hora_ingreso', { ascending: false }).limit(1).single()
          if (ast) setAsistenciaHoy(ast as Asistencia)

          const { data: logs } = await supabase.from('logros_usuarios').select('logro_id').eq('dni', p.dni)
          if (logs) setUnlockedLogros(logs.map((l: { logro_id: number }) => l.logro_id))
        } catch { /* ok */ }
        await cargarVacaciones(p.dni, false)
      }
      setIsLoading(false)
    }
    cargar()
  }, [router])

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

      const { data } = await supabase.from('registro_asistencias')
        .select('id, fecha, hora_ingreso, estado_ingreso, hora_salida, notas')
        .eq('dni', perfil.dni)
        .gte('fecha', from).lte('fecha', to)
        .order('fecha', { ascending: false })

      setHistorialMes((data || []) as Asistencia[])
      setLoadingCal(false)
    }
    fetchMes()
  }, [showCalendar, targetDate, perfil])

  useEffect(() => {
    if (!showVacations || !perfil) return
    void cargarVacaciones(perfil.dni, true)
  }, [showVacations, perfil])

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

  // ── Helpers ────────────────────────────────────────────────────────────────

  const mostrarExito = (msg: string) => { setMensaje(msg); setScanState('EXITO') }
  const mostrarError = (msg: string) => {
    setMensaje(msg); setScanState('ERROR')
    setTimeout(() => setScanState('ESCANEO'), 4000)
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

      const { data, error } = await supabase.from('registro_asistencias').insert({
        dni: perfil.dni, nombres_completos: perfil.nombres, area: perfil.area,
        foto_url: perfil.foto_url, estado_ingreso: est, fecha: hoy,
      }).select().single()
      if (error) throw error

      setAsistenciaHoy(data as Asistencia)

      const logros = await evaluarLogrosIngreso(perfil.dni, h, m)
      if (elapsed <= 8 && await desbloquearLogro(perfil.dni, 7)) logros.push(7)

      mostrarExito('¡INGRESO REGISTRADO!\nUbicación confirmada ✓')
      unlockAndAnimate(logros)
    } catch (err: any) {
      if (err.code === 1) mostrarError('Activa el GPS para registrar asistencia.')
      else if (err.message?.includes('duplicate') || err.message?.includes('unique')) mostrarExito('¡INGRESO YA REGISTRADO!')
      else mostrarError(`Error: ${err.message}`)
    }
  }

  // ── Asistencia Remota (Obra / Externo) ────────────────────────────────────

  const procesarRemoto = async (tipo: 'obra' | 'externo', prefijo: string) => {
    if (!notaTexto.trim()) { toast.warning('Por favor, ingresa el nombre del lugar.'); return }
    if (!perfil) return
    setGuardando(true)

    try {
      const pos  = await obtenerUbicacion()
      const lat  = pos.coords.latitude
      const lon  = pos.coords.longitude
      const dist = calcularDistancia(lat, lon, OBRA_LAT, OBRA_LON)

      if (tipo === 'obra' && dist <= RADIO_METROS) {
        toast.info('Estás en la oficina. Por favor escanea el QR.')
        setGuardando(false); setShowObra(false); return
      }

      const h   = new Date().getHours()
      const m   = new Date().getMinutes()
      const ok  = tipo === 'obra'
        ? (h < 7 || (h === 7 && m <= 35))
        : (h < 9 || (h === 9 && m <= 5))
      const est = ok ? 'PUNTUAL' : 'TARDANZA'
      const hoy = format(new Date(), 'yyyy-MM-dd')
      const nota = `${prefijo}: ${notaTexto.trim()} [GPS: ${lat.toFixed(6)}, ${lon.toFixed(6)}]`

      const { data, error } = await supabase.from('registro_asistencias').insert({
        dni: perfil.dni, nombres_completos: perfil.nombres, area: perfil.area,
        foto_url: perfil.foto_url, estado_ingreso: est, fecha: hoy, notas: nota,
      }).select().single()
      if (error) throw error

      setAsistenciaHoy(data as Asistencia)
      setShowObra(false); setShowExterno(false); setNotaTexto('')
      toast.success(tipo === 'obra' ? '¡Ingreso en obra registrado!' : '¡Ingreso externo registrado!')
      unlockAndAnimate(await evaluarLogrosIngreso(perfil.dni, h, m))
    } catch (err: any) {
      if (err.code === 1) toast.error('Activa el GPS para marcar entrada externa.')
      else if (err.message?.includes('duplicate') || err.message?.includes('unique')) {
        toast.info('Ingreso ya registrado'); setShowObra(false); setShowExterno(false)
      } else toast.error(`Error: ${err.message}`)
    } finally { setGuardando(false) }
  }

  // ── Turno Nocturno ────────────────────────────────────────────────────────

  const procesarNocturno = async () => {
    if (!horaSeleccionada) { toast.warning('Selecciona tu hora de ingreso'); return }
    if (!notaTexto.trim()) { toast.warning('Indica el lugar de trabajo'); return }
    if (!perfil) return
    setGuardando(true)

    try {
      const pos  = await obtenerUbicacion()
      const lat  = pos.coords.latitude
      const lon  = pos.coords.longitude
      const horaLabel = HORAS_NOCTURNAS.find(x => x.hora === horaSeleccionada)?.label ?? ''
      const hoy = format(new Date(), 'yyyy-MM-dd')
      // Turno nocturno: SIEMPRE puntual sin importar la hora real
      const nota = `Turno Nocturno (${horaLabel}): ${notaTexto.trim()} [GPS: ${lat.toFixed(6)}, ${lon.toFixed(6)}]`

      const { data, error } = await supabase.from('registro_asistencias').insert({
        dni: perfil.dni, nombres_completos: perfil.nombres, area: perfil.area,
        foto_url: perfil.foto_url, estado_ingreso: 'PUNTUAL', fecha: hoy, notas: nota,
      }).select().single()
      if (error) throw error

      setAsistenciaHoy(data as Asistencia)
      setShowNocturno(false); setNotaTexto(''); setHoraSeleccionada(null)
      toast.success('¡Turno nocturno registrado!')
      const h = new Date().getHours(); const m = new Date().getMinutes()
      unlockAndAnimate(await evaluarLogrosIngreso(perfil.dni, h, m))
    } catch (err: any) {
      if (err.code === 1) toast.error('Activa el GPS para registrar el ingreso.')
      else if (err.message?.includes('duplicate') || err.message?.includes('unique')) {
        toast.info('Ingreso ya registrado'); setShowNocturno(false)
      } else toast.error(`Error: ${err.message}`)
    } finally { setGuardando(false) }
  }

  // ── Salida ────────────────────────────────────────────────────────────────

  const handleSalida = async () => {
    if (!asistenciaHoy || isMarkingExit || !perfil) return
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

  // ── Calendar grid ──────────────────────────────────────────────────────────

  const renderCalendario = () => {
    const y  = targetDate.getFullYear()
    const mo = targetDate.getMonth()
    const total = new Date(y, mo + 1, 0).getDate()
    const fDay  = new Date(y, mo, 1).getDay()
    const blanks = fDay === 0 ? 6 : fDay - 1

    return (
      <div className="grid grid-cols-7 gap-1.5 mt-4">
        {['L','M','M','J','V','S','D'].map((d, i) => (
          <div key={i} className="text-center text-xs font-black pb-2" style={{ color: 'var(--text-3)' }}>{d}</div>
        ))}
        {Array.from({ length: blanks }, (_, i) => <div key={`b${i}`} className="h-10" />)}
        {Array.from({ length: total }, (_, i) => {
          const day  = i + 1
          const dStr = `${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const e    = historialMes.find(x => x.fecha === dStr)
          const vacationRequests = getApprovedVacationRequestsForDay(dStr)
          const hasVacation = vacationRequests.length > 0
          const isPuntual  = e?.estado_ingreso === 'PUNTUAL'
          const isTardanza = e?.estado_ingreso === 'TARDANZA'
          const isInteractive = Boolean(e) || hasVacation

          return (
            <motion.button
              key={day}
              disabled={!isInteractive}
              onClick={() => {
                if (hasVacation) {
                  setSelectedVacationDay({ fecha: dStr, solicitudes: vacationRequests })
                } else if (e) {
                  setSelectedDay(e)
                }
              }}
              className="aspect-square rounded-xl flex items-center justify-center text-sm font-bold border transition-all"
              style={{
                background:   hasVacation ? 'var(--blue-light)' : isPuntual ? 'var(--green-light)' : isTardanza ? 'var(--red-light)' : 'var(--surface-2)',
                borderColor:  hasVacation ? '#93C5FD' : isPuntual ? '#6EE7B7' : isTardanza ? '#FCA5A5' : 'var(--border)',
                color:        hasVacation ? 'var(--blue)' : isPuntual ? 'var(--green)' : isTardanza ? 'var(--red)' : 'var(--text-3)',
                opacity:      !isInteractive ? 0.5 : 1,
              }}
              whileHover={isInteractive ? { scale: 1.1 } : {}}
              whileTap={isInteractive ? { scale: 0.95 } : {}}
            >
              {day}
            </motion.button>
          )
        })}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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
        <p className="font-semibold text-lg" style={{ color: 'var(--text-2)', fontFamily: 'Syne, sans-serif' }}>Sincronizando RUAG...</p>
      </div>
    )
  }

  const isPuntual   = asistenciaHoy?.estado_ingreso === 'PUNTUAL'
  const statusColor = isPuntual ? 'var(--green)' : 'var(--red)'
  const statusBg    = isPuntual ? 'var(--green-light)' : 'var(--red-light)'
  const approvedVacationDays = vacacionesSolicitudes
    .filter((item) =>
      normalizeStatus(item.estado) === 'aprobada' &&
      overlapsVacationYear(item, vacacionesSaldo?.periodo ?? new Date().getFullYear())
    )
    .reduce((sum, item) => sum + num(item.dias_solicitados), 0)
  const porVencerDb = vacacionesSaldo ? num(vacacionesSaldo.vacaciones_por_vencer) : 0
  const porVencerDisplay = vacacionesSaldo
    ? porVencerDb > 0
      ? porVencerDb
      : vacacionesSaldo.fecha_vencimiento
        ? 30
        : 0
    : 0
  const pendingPeriodoDb = vacacionesSaldo ? num(vacacionesSaldo.vacaciones_pendientes_periodo) : 0
  const pendingBase = vacacionesSaldo
    ? pendingPeriodoDb > 0
      ? pendingPeriodoDb
      : num(vacacionesSaldo.dias_pendientes) + porVencerDisplay
    : 0
  const pendingDisplay = pendingBase - approvedVacationDays
  const gozadosDisplay = vacacionesSaldo ? num(vacacionesSaldo.total_gozados) + approvedVacationDays : 0
  const diasSolicitadosPreview = differenceInDays(toDateAtNoon(vacationEnd), toDateAtNoon(vacationStart)) + 1

  return (
    <div
      className="min-h-screen flex flex-col items-center relative overflow-hidden"
      style={{
        background: 'var(--bg)',
        fontFamily: "'DM Sans', sans-serif",
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

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* VISTA 1: ESCÁNER QR                                                  */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {!asistenciaHoy && (
        <div className="w-full max-w-sm mx-auto flex flex-col min-h-screen px-5 pt-6 pb-4 relative z-10">

          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--blue)', boxShadow: 'var(--shadow-md)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                  <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                  <rect x="14" y="14" width="7" height="7" rx="1.5"/>
                  <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                </svg>
              </div>
              <div>
                <h1 className="font-black text-base leading-none" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>RUAG</h1>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>Registra tu asistencia</p>
              </div>
            </div>
            <div className="flex gap-2">
              <motion.button
                onClick={() => setShowLogros(true)}
                className="w-10 h-10 rounded-2xl flex items-center justify-center border transition-all"
                style={{ background: 'var(--gold-light)', borderColor: '#FDE68A', color: 'var(--gold)', boxShadow: 'var(--shadow-sm)' }}
                whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
                <Trophy size={18} />
              </motion.button>
              <motion.button
                onClick={() => setShowCalendar(true)}
                className="w-10 h-10 rounded-2xl flex items-center justify-center border transition-all"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-2)', boxShadow: 'var(--shadow-sm)' }}
                whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
                <History size={18} />
              </motion.button>
              <motion.button
                onClick={() => setShowVacations(true)}
                className="w-10 h-10 rounded-2xl flex items-center justify-center border transition-all"
                style={{ background: 'var(--blue-light)', borderColor: '#BFDBFE', color: 'var(--blue)', boxShadow: 'var(--shadow-sm)' }}
                whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
                <PlaneTakeoff size={18} />
              </motion.button>
              <motion.button
                onClick={() => abrirSoporteWhatsApp(perfil)}
                className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all"
                style={{ background: 'linear-gradient(135deg, #22C55E, #10B981)', color: 'white', boxShadow: '0 8px 20px rgba(16,185,129,0.28)' }}
                whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
                <Phone size={18} />
              </motion.button>
            </div>
          </div>

          {/* Camera box */}
          <motion.div
            className="relative flex-1 rounded-3xl overflow-hidden min-h-[320px] max-h-[55vh]"
            style={{ background: '#0f0f1a', boxShadow: 'var(--shadow-lg)', border: '2px solid var(--border)' }}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.34, 1.2, 0.64, 1] }}
          >
            {scanState === 'ESCANEO' && (
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
                      <h3 className="font-black text-lg mb-1" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>¡INGRESO EXITOSO!</h3>
                      <p className="text-sm font-medium whitespace-pre-line" style={{ color: 'var(--text-3)' }}>{mensaje}</p>
                    </motion.div>
                  )}
                  {scanState === 'ERROR' && (
                    <motion.div className="flex flex-col items-center text-center" initial={{ x: -10 }} animate={{ x: [0, -8, 8, -8, 8, 0] }} transition={{ duration: 0.4 }}>
                      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
                        style={{ background: 'var(--red-light)', boxShadow: '0 0 40px rgba(220,38,38,0.2)' }}>
                        <AlertTriangle size={40} style={{ color: 'var(--red)' }} />
                      </div>
                      <h3 className="font-black text-base mb-1" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>ACCESO DENEGADO</h3>
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
              className="mt-4 rounded-3xl p-4"
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
                    className="flex flex-col items-center justify-center py-3.5 rounded-2xl font-bold text-sm gap-1.5 transition-all border"
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
      {asistenciaHoy && (
        <div className="w-full max-w-sm mx-auto flex flex-col px-5 pt-6 pb-8 relative z-10 gap-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
              {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
            </p>
            <div className="flex gap-2">
              <motion.button onClick={() => setShowLogros(true)} className="w-10 h-10 rounded-2xl flex items-center justify-center border transition-all"
                style={{ background: 'var(--gold-light)', borderColor: '#FDE68A', color: 'var(--gold)', boxShadow: 'var(--shadow-sm)' }}
                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Trophy size={18} />
              </motion.button>
              <motion.button onClick={() => setShowCalendar(true)} className="w-10 h-10 rounded-2xl flex items-center justify-center border transition-all"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-2)', boxShadow: 'var(--shadow-sm)' }}
                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <History size={18} />
              </motion.button>
              <motion.button onClick={() => setShowVacations(true)} className="w-10 h-10 rounded-2xl flex items-center justify-center border transition-all"
                style={{ background: 'var(--blue-light)', borderColor: '#BFDBFE', color: 'var(--blue)', boxShadow: 'var(--shadow-sm)' }}
                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <PlaneTakeoff size={18} />
              </motion.button>
              <motion.button onClick={() => abrirSoporteWhatsApp(perfil)} className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all"
                style={{ background: 'linear-gradient(135deg, #22C55E, #10B981)', color: 'white', boxShadow: '0 8px 20px rgba(16,185,129,0.28)' }}
                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Phone size={18} />
              </motion.button>
            </div>
          </div>

          {/* Fotocheck Card */}
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFoto} className="hidden" />

          <motion.div
            className="relative"
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.34, 1.2, 0.64, 1] }}
          >
            {/* Glow border */}
            <div className="absolute -inset-0.5 rounded-[28px] opacity-70"
              style={{ background: isPuntual
                ? 'linear-gradient(135deg, #047857, #34D399, #6EE7B7)'
                : 'linear-gradient(135deg, #991B1B, #EF4444, #FCA5A5)',
                filter: 'blur(2px)',
              }} />
            {/* Glow pulse */}
            <div className="absolute -inset-2 rounded-[32px] opacity-30"
              style={{
                background: isPuntual
                  ? 'radial-gradient(ellipse, rgba(5,150,105,0.4) 0%, transparent 70%)'
                  : 'radial-gradient(ellipse, rgba(220,38,38,0.4) 0%, transparent 70%)',
                animation: 'glow-pulse 3s ease-in-out infinite',
              }} />

            <div className="relative rounded-[26px] p-7 overflow-hidden"
              style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}>

              {/* Watermark */}
              <div className="absolute -bottom-8 -right-8 opacity-5">
                <svg width="140" height="140" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
                </svg>
              </div>

              {/* Photo */}
              <div className="flex justify-center mb-5">
                <div className="relative">
                  <div className="w-28 h-28 rounded-full overflow-hidden border-4" style={{ borderColor: statusColor, boxShadow: `0 0 0 4px ${statusBg}` }}>
                    {perfil.foto_url ? (
                      <img src={perfil.foto_url} alt="Foto" className="w-full h-full object-cover" />
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
                  {!uploadingPhoto && (
                    <motion.button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full flex items-center justify-center text-white border-4"
                      style={{ background: 'var(--blue)', borderColor: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}
                      whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                    >
                      <Edit2 size={14} />
                    </motion.button>
                  )}
                </div>
              </div>

              <h2 className="text-xl font-black text-center leading-tight uppercase tracking-tight"
                style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>
                {perfil.nombres}
              </h2>
              <p className="text-sm text-center mt-1 font-mono tracking-widest" style={{ color: 'var(--text-3)' }}>
                {perfil.dni}
              </p>

              <div className="flex justify-center mt-3">
                <span className="px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase"
                  style={{ background: 'var(--blue-light)', color: 'var(--blue)', border: '1.5px solid var(--border-2)' }}>
                  {perfil.area}
                </span>
              </div>

              <div className="w-full h-px my-5" style={{ background: 'var(--border)' }} />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-1" style={{ color: 'var(--text-3)' }}>Ingreso Hoy</p>
                  <p className="text-2xl font-black" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>
                    {formatTimeLima(asistenciaHoy.hora_ingreso)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-1" style={{ color: 'var(--text-3)' }}>Estado</p>
                  <span className="px-3 py-1 rounded-lg text-sm font-black"
                    style={{ background: statusBg, color: statusColor, border: `1.5px solid ${statusColor}33` }}>
                    {asistenciaHoy.estado_ingreso}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Actions */}
          {asistenciaHoy.hora_salida ? (
            <motion.div
              className="rounded-3xl p-6 flex flex-col items-center text-center"
              style={{ background: 'var(--green-light)', border: '1.5px solid #6EE7B7', boxShadow: 'var(--shadow-sm)' }}
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            >
              <CheckCircle2 size={40} style={{ color: 'var(--green)' }} className="mb-3" />
              <p className="font-semibold" style={{ color: '#047857' }}>Ya marcaste tu salida hoy.</p>
              <p className="font-black text-lg mt-1" style={{ color: '#065F46', fontFamily: 'Syne, sans-serif' }}>¡Buen descanso!</p>
            </motion.div>
          ) : (
            <div className="flex flex-col gap-3">
              <motion.button
                onClick={() => { setIsRemoteExit(false); setNotaTexto(''); setShowNota(true) }}
                className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 font-semibold text-sm transition-all border"
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
                className="w-full h-[64px] rounded-2xl flex items-center justify-center gap-3 font-black text-base disabled:opacity-60 relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #DC2626, #B91C1C)',
                  color: 'white',
                  fontFamily: 'Syne, sans-serif',
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
                  <h3 className="font-black text-base" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>Ingreso a Obra</h3>
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
                  <h3 className="font-black text-base" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>Diligencia Externa</h3>
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
                  <h3 className="font-black text-base" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>Turno Nocturno</h3>
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
                  <h3 className="font-black text-base" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>
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
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ background: 'rgba(30,27,75,0.45)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowCalendar(false)}>
            <motion.div
              className="w-full max-w-lg rounded-t-[32px] p-6 pb-10 flex flex-col"
              style={{ background: 'var(--surface)', boxShadow: '0 -20px 60px rgba(30,27,75,0.15)', maxHeight: '90vh', border: '1.5px solid var(--border)', borderBottom: 'none' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-1.5 rounded-full mx-auto mb-6" style={{ background: 'var(--border-2)' }} />

              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--blue-light)', border: '1.5px solid var(--border-2)' }}>
                    <Calendar size={22} style={{ color: 'var(--blue)' }} />
                  </div>
                  <div>
                    <h3 className="font-black text-lg" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>Mi Historial</h3>
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
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ background: 'rgba(30,27,75,0.45)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !submittingVacation && setShowVacations(false)}>
            <motion.div
              className="w-full max-w-lg rounded-t-[32px] p-6 pb-10 flex flex-col"
              style={{ background: 'var(--surface)', boxShadow: '0 -20px 60px rgba(30,27,75,0.15)', maxHeight: '92vh', border: '1.5px solid var(--border)', borderBottom: 'none' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-1.5 rounded-full mx-auto mb-6" style={{ background: 'var(--border-2)' }} />
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--blue-light)', border: '1.5px solid var(--border-2)' }}>
                    <PlaneTakeoff size={22} style={{ color: 'var(--blue)' }} />
                  </div>
                  <div>
                    <h3 className="font-black text-lg" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>Mis Vacaciones</h3>
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
                        <p className="text-lg font-black" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>
                          {vacacionesSaldo.trabajador_nombre}
                        </p>
                        <p className="text-sm font-semibold mt-1" style={{ color: 'var(--text-3)' }}>
                          {(vacacionesSaldo.area || perfil.area || 'Sin area')} · {(vacacionesSaldo.cargo || 'Sin cargo')}
                        </p>
                        <div className="grid grid-cols-2 gap-3 mt-5">
                          {[
                            { label: 'Pendientes', value: pendingDisplay, color: 'var(--green)', bg: 'var(--green-light)', icon: <Wallet size={16} /> },
                            { label: 'Gozados', value: gozadosDisplay, color: 'var(--blue)', bg: 'var(--blue-light)', icon: <PlaneTakeoff size={16} /> },
                            { label: 'Arrastre', value: num(vacacionesSaldo.saldo_arrastre), color: 'var(--text-2)', bg: 'var(--surface)', icon: <History size={16} /> },
                            { label: 'Extra', value: num(vacacionesSaldo.dias_extra), color: '#D97706', bg: '#FEF3C7', icon: <Calendar size={16} /> },
                          ].map((item) => (
                            <div key={item.label} className="rounded-2xl p-4 border" style={{ background: item.bg, borderColor: 'var(--border)' }}>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: item.color }}>{item.label}</span>
                                <span style={{ color: item.color }}>{item.icon}</span>
                              </div>
                              <p className="mt-3 text-2xl font-black" style={{ color: item.color, fontFamily: 'Syne, sans-serif' }}>{item.value}</p>
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
                        <p className="font-black text-base" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>Sin saldo importado</p>
                        <p className="text-sm mt-2" style={{ color: 'var(--text-3)' }}>
                          Todavia no encontramos vacaciones cargadas para tu DNI en la hoja 2026.
                        </p>
                      </div>
                    )}
                    {vacacionesSaldo && (
                      <div className="rounded-3xl p-5" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div>
                            <h4 className="font-black text-base" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>Solicitar vacaciones</h4>
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
                      <h4 className="font-black text-base" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>Historial de solicitudes</h4>
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
                <h3 className="text-2xl font-black capitalize" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>
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

                <h3 className="text-2xl font-black capitalize" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>
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
                      <p className="font-black text-lg" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>{time}</p>
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
          <motion.div className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ background: 'rgba(30,27,75,0.45)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowLogros(false)}>
            <motion.div
              className="w-full max-w-lg rounded-t-[32px] p-6 flex flex-col"
              style={{ background: 'var(--surface)', boxShadow: '0 -20px 60px rgba(30,27,75,0.15)', maxHeight: '90vh', border: '1.5px solid var(--border)', borderBottom: 'none' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-1.5 rounded-full mx-auto mb-6" style={{ background: 'var(--border-2)' }} />

              <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: 'var(--gold-light)', border: '1.5px solid #FDE68A' }}>
                  <Trophy size={28} style={{ color: 'var(--gold)' }} />
                </div>
                <div>
                  <h3 className="font-black text-xl" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>Mis Trofeos</h3>
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
                        <h4 className="font-black text-base" style={{ color: unlocked ? 'var(--gold)' : 'var(--text-3)', fontFamily: 'Syne, sans-serif' }}>
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

              <h2 className="text-4xl font-black text-white mb-3" style={{ fontFamily: 'Syne, sans-serif' }}>
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
                  fontFamily: 'Syne, sans-serif',
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
