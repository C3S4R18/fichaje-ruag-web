'use client'

import * as XLSX from 'xlsx-js-style'
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/utils/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { format, isToday, subDays, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle,
  LogOut, UserPlus, Loader2, Search, FileSpreadsheet, SlidersHorizontal,
  Users, ShieldCheck, AlignLeft, MapPin, Map as MapIcon, Download,
  HardHat, Trash2, MessageSquareText, X, Sunrise, Sun, Sunset, MoonStar,
  Store, Moon, RefreshCw, Activity
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import Map, {
  Marker, NavigationControl, FullscreenControl, GeolocateControl, type MapRef
} from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night'
type TipoMarcacion = 'ninguna' | 'ingreso_obra' | 'salida_obra' | 'externo' | 'nota' | 'nocturno'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLimaHour() {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', hour: '2-digit', hour12: false })
    .formatToParts(new Date()).find(p => p.type === 'hour')?.value ?? '12')
}

function getTimeOfDay(): TimeOfDay {
  const h = getLimaHour()
  if (h >= 6 && h < 8) return 'dawn'
  if (h >= 8 && h < 17) return 'day'
  if (h >= 17 && h < 19) return 'dusk'
  return 'night'
}

function getTimeMeta(tod: TimeOfDay) {
  const map = {
    dawn:  { title: 'Amanecer', icon: Sunrise,  chip: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' },
    day:   { title: 'Día',      icon: Sun,      chip: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20' },
    dusk:  { title: 'Atardecer',icon: Sunset,   chip: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20' },
    night: { title: 'Noche',    icon: MoonStar, chip: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20' },
  }
  return map[tod]
}

function getInitials(name: string) {
  if (!name) return '??'
  const w = name.trim().split(' ').filter(Boolean)
  return w.length === 1 ? w[0].substring(0, 2).toUpperCase() : (w[0][0] + w[1][0]).toUpperCase()
}

function calcHoras(ingreso: string, salida: string | null): string {
  if (!salida) return '—'
  try {
    const mins = Math.floor((new Date(salida).getTime() - new Date(ingreso).getTime()) / 60000)
    if (mins <= 0) return '—'
    const h = Math.floor(mins / 60), m = mins % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  } catch { return '—' }
}

// ─── Nota parser ──────────────────────────────────────────────────────────────

function extraerDetalleNota(notas?: string | null) {
  const raw = notas ?? ''
  if (!raw.trim()) return { tieneNota: false, contieneGPS: false, textoLimpio: '', coordenadas: '', lat: null as number | null, lng: null as number | null, tipoMarcacion: 'ninguna' as TipoMarcacion }
  const contieneGPS = raw.includes('[GPS:')
  let tipoMarcacion: TipoMarcacion = 'nota'
  if (raw.startsWith('Ingreso en:')) tipoMarcacion = 'ingreso_obra'
  else if (raw.startsWith('Salida de obra:') || raw.startsWith('Salida en:')) tipoMarcacion = 'salida_obra'
  else if (raw.startsWith('Marcación Externa:') || raw.startsWith('Salida Externa:')) tipoMarcacion = 'externo'
  else if (raw.startsWith('Turno Nocturno')) tipoMarcacion = 'nocturno'
  let textoLimpio = raw, coordenadas = '', lat: number | null = null, lng: number | null = null
  if (contieneGPS) {
    const s = raw.indexOf('[GPS:'), e = raw.indexOf(']', s)
    if (s !== -1 && e !== -1) {
      coordenadas = raw.substring(s + 5, e).trim()
      textoLimpio = raw.substring(0, s).trim()
        .replace(/^(Ingreso en:|Salida de obra:|Salida en:|Marcación Externa:|Salida Externa:)\s*/, '')
        .replace(/^Turno Nocturno \([^)]+\):\s*/, '').trim()
      if (!textoLimpio) textoLimpio = tipoMarcacion === 'nocturno' ? 'Turno Nocturno' : 'Marcación GPS'
      const [ls, lo] = coordenadas.split(',')
      lat = isNaN(parseFloat(ls?.trim())) ? null : parseFloat(ls.trim())
      lng = isNaN(parseFloat(lo?.trim())) ? null : parseFloat(lo.trim())
    }
  } else {
    textoLimpio = raw.replace(/^Turno Nocturno \([^)]+\):\s*/, '').trim()
  }
  // Quitar el marcador [OFFLINE] del texto visible (solo se usa para detectar el tipo)
  textoLimpio = textoLimpio.replace(/\s*\[OFFLINE\]\s*/g, '').trim()
  return { tieneNota: true, contieneGPS, textoLimpio, coordenadas, lat, lng, tipoMarcacion }
}

// ─── Map helpers ──────────────────────────────────────────────────────────────

function aplicarEstiloMapa(map: any, tod: TimeOfDay) {
  try { map.setConfigProperty('basemap', 'lightPreset', tod) } catch {}
  try { map.setConfigProperty('basemap', 'show3dObjects', true) } catch {}
  const fog: Record<TimeOfDay, any> = {
    dawn:  { color: 'rgb(255,211,170)', 'high-color': 'rgb(87,133,221)',  'horizon-blend': 0.08, 'space-color': 'rgb(39,53,95)',  'star-intensity': 0.15 },
    day:   { color: 'rgb(186,210,235)', 'high-color': 'rgb(36,92,223)',   'horizon-blend': 0.04, 'space-color': 'rgb(11,11,25)',  'star-intensity': 0 },
    dusk:  { color: 'rgb(255,183,148)', 'high-color': 'rgb(88,74,169)',   'horizon-blend': 0.1,  'space-color': 'rgb(28,22,54)', 'star-intensity': 0.25 },
    night: { color: 'rgb(30,40,72)',    'high-color': 'rgb(17,24,39)',    'horizon-blend': 0.08, 'space-color': 'rgb(7,10,22)',  'star-intensity': 0.7 },
  }
  try { map.setFog(fog[tod]) } catch {}
}

function getMarkerTone(tipo: TipoMarcacion) {
  switch (tipo) {
    case 'ingreso_obra': return { bg: 'bg-blue-500',   label: 'Ingreso Obra',   icon: HardHat,           gradient: 'from-blue-500 to-cyan-400' }
    case 'salida_obra':  return { bg: 'bg-red-500',    label: 'Salida Obra',    icon: MapPin,            gradient: 'from-red-500 to-rose-400' }
    case 'externo':      return { bg: 'bg-purple-500', label: 'Externo',        icon: Store,             gradient: 'from-purple-500 to-fuchsia-400' }
    case 'nocturno':     return { bg: 'bg-amber-500',  label: 'Turno Nocturno', icon: Moon,              gradient: 'from-amber-500 to-orange-400' }
    default:             return { bg: 'bg-slate-500',  label: 'Nota GPS',       icon: MessageSquareText, gradient: 'from-slate-500 to-slate-400' }
  }
}

// ─── Theme Switch ─────────────────────────────────────────────────────────────

const ThemeSwitch = ({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) => (
  <div className="relative transform scale-[0.6] sm:scale-75 origin-right">
    <style dangerouslySetInnerHTML={{ __html: `
      .ts{--s:20px;--cw:5.625em;--ch:2.5em;--cr:6.25em;--lbg:#3D7EAE;--nbg:#1D1F2C;--cd:3.375em;--sd:2.125em;--sun:#ECCA2F;--moon:#C4C9D1;--spot:#959DB1;--co:calc((var(--cd) - var(--ch)) / 2 * -1);--t:.5s cubic-bezier(0,-0.02,.4,1.25);--ct:.3s cubic-bezier(0,-0.02,.35,1.17)}
      .ts,.ts *,.ts *::before,.ts *::after{box-sizing:border-box;margin:0;padding:0;font-size:var(--s)}
      .ts__c{width:var(--cw);height:var(--ch);background:var(--lbg);border-radius:var(--cr);overflow:hidden;cursor:pointer;box-shadow:0em -.062em .062em rgba(0,0,0,.25);transition:var(--t);position:relative;display:block}
      .ts__i{display:none}.ts__cc{width:var(--cd);height:var(--cd);background:rgba(255,255,255,.1);position:absolute;left:var(--co);top:var(--co);border-radius:var(--cr);display:flex;transition:var(--ct);pointer-events:none}
      .ts__sm{pointer-events:auto;position:relative;z-index:2;width:var(--sd);height:var(--sd);margin:auto;border-radius:var(--cr);background:var(--sun);filter:drop-shadow(.062em .125em .125em rgba(0,0,0,.25));overflow:hidden;transition:var(--t)}
      .ts__m{transform:translateX(100%);width:100%;height:100%;background:var(--moon);border-radius:inherit;transition:var(--t);position:relative}
      .ts__sp{position:absolute;top:.75em;left:.312em;width:.75em;height:.75em;border-radius:var(--cr);background:var(--spot)}
      .ts__sp:nth-of-type(2){width:.375em;height:.375em;top:.937em;left:1.375em}.ts__sp:nth-last-of-type(3){width:.25em;height:.25em;top:.312em;left:.812em}
      .ts__cl{width:1.25em;height:1.25em;background:#F3FDFF;border-radius:var(--cr);position:absolute;bottom:-.625em;left:.312em;box-shadow:.937em .312em #F3FDFF,-.312em -.312em #AACADF,1.437em .375em #F3FDFF,.5em -.125em #AACADF,2.187em 0 #F3FDFF,1.25em -.062em #AACADF,2.937em .312em #F3FDFF,2em -.312em #AACADF,3.625em -.062em #F3FDFF,2.625em 0em #AACADF,4.5em -.312em #F3FDFF,3.375em -.437em #AACADF,4.625em -1.75em 0 .437em #F3FDFF,4em -.625em #AACADF,4.125em -2.125em 0 .437em #AACADF;transition:.5s cubic-bezier(0,-0.02,.4,1.25)}
      .ts__i:checked+.ts__c{background:var(--nbg)}.ts__i:checked+.ts__c .ts__cc{left:calc(100% - var(--co) - var(--cd))}.ts__i:checked+.ts__c .ts__m{transform:translate(0)}.ts__i:checked+.ts__c .ts__cl{bottom:-4.062em}
    ` }} />
    <label className="ts">
      <input type="checkbox" className="ts__i" checked={isDark} onChange={onToggle} />
      <div className="ts__c">
        <div className="ts__cl" />
        <div className="ts__cc">
          <div className="ts__sm"><div className="ts__m"><div className="ts__sp" /><div className="ts__sp" /><div className="ts__sp" /></div></div>
        </div>
      </div>
    </label>
  </div>
)

// ─── Loader ───────────────────────────────────────────────────────────────────

const CustomLoader = ({ text = 'Cargando...' }: { text?: string }) => (
  <div className="flex flex-col items-center gap-4">
    <div className="relative w-14 h-14">
      <div className="absolute inset-0 rounded-full border-[3px] border-slate-200 dark:border-slate-800" />
      <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-blue-600 animate-spin" />
      <div className="absolute inset-2 rounded-full border-[3px] border-transparent border-t-indigo-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.75s' }} />
    </div>
    <span className="text-[10px] font-black text-slate-400 tracking-[0.2em] uppercase animate-pulse">{text}</span>
  </div>
)

// ─── Clock ────────────────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t) }, [])
  const text = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(time)
  return (
    <div className="flex flex-col items-end">
      <span className="text-xl lg:text-2xl font-black text-slate-800 dark:text-white tracking-tighter tabular-nums">{text}</span>
      <span className="text-emerald-600 dark:text-emerald-400 font-black tracking-widest uppercase text-[8px] mt-0.5">Hora Lima</span>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ title, value, icon, color, sub }: { title: string; value: number | string; icon: React.ReactNode; color: string; sub?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -1 }}
      className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4 overflow-hidden relative group">
      <div className={`w-11 h-11 rounded-xl ${color} text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.12em] truncate">{title}</p>
        <p className="text-3xl font-black text-slate-800 dark:text-white leading-none mt-0.5 tabular-nums">{value}</p>
        {sub && <p className="text-[9px] text-slate-400 font-medium mt-0.5 truncate">{sub}</p>}
      </div>
    </motion.div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [asistencias, setAsistencias]     = useState<any[]>([])
  const [loading, setLoading]             = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [fechaActual, setFechaActual]     = useState(new Date())
  const [isDark, setIsDark]               = useState(false)
  const [mounted, setMounted]             = useState(false)
  const [modoEdicion, setModoEdicion]     = useState(false)
  const [vistaActual, setVistaActual]     = useState<'lista' | 'mapa'>('lista')
  const mapRef = useRef<MapRef | null>(null)
  const [tod, setTod]                     = useState<TimeOfDay>('day')
  const [notaModal, setNotaModal]         = useState<any>(null)
  const [showExportar, setShowExportar]   = useState(false)
  const [showManual, setShowManual]       = useState(false)
  const [busqueda, setBusqueda]           = useState('')
  const [filtroArea, setFiltroArea]       = useState('TODAS')
  const [filtroEstado, setFiltroEstado]   = useState('TODOS')
  const [exportDesde, setExportDesde]     = useState(format(new Date(), 'yyyy-MM-dd'))
  const [exportHasta, setExportHasta]     = useState(format(new Date(), 'yyyy-MM-dd'))
  const [exportando, setExportando]       = useState(false)
  const [tipoExport, setTipoExport]       = useState<'dia' | 'rango'>('dia')

  useEffect(() => {
    setMounted(true)
    const dark = localStorage.getItem('ruag_theme') === 'dark'
    setIsDark(dark)
    document.documentElement.classList.toggle('dark', dark)
  }, [])

  useEffect(() => {
    setTod(getTimeOfDay())
    const t = setInterval(() => setTod(getTimeOfDay()), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (mapRef.current) { const m = mapRef.current.getMap(); if (m?.isStyleLoaded()) aplicarEstiloMapa(m, tod) }
  }, [tod])

  useEffect(() => {
    let buf = ''
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      buf = (buf + e.key.toUpperCase()).slice(-6)
      if (buf === 'EDITAR') { setModoEdicion(p => { const n = !p; toast[n ? 'success' : 'error'](n ? '🔓 Modo Admin activado' : '🔒 Desactivado'); return n }); buf = '' }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const toggleTheme = () => {
    setIsDark(p => { const n = !p; document.documentElement.classList.toggle('dark', n); localStorage.setItem('ruag_theme', n ? 'dark' : 'light'); return n })
  }

  // ── Fetch con soporte multi-turno ─────────────────────────────────────────

  const fetchData = async (fecha: Date) => {
    setLoading(true)
    const fechaStr = format(fecha, 'yyyy-MM-dd')
    const prevStr  = format(subDays(fecha, 1), 'yyyy-MM-dd')
    const nextStr  = format(addDays(fecha, 1), 'yyyy-MM-dd')
    const limaIni     = `${fechaStr}T05:00:00.000Z`
    const limaFin     = `${nextStr}T05:00:00.000Z`
    const noctIni     = `${nextStr}T00:00:00.000Z`
    const noctIniPrev = `${fechaStr}T00:00:00.000Z`

    const [q1, q2, q3] = await Promise.all([
      supabase.from('registro_asistencias').select('*').eq('fecha', fechaStr).order('hora_ingreso', { ascending: false }),
      supabase.from('registro_asistencias').select('*').eq('fecha', nextStr).gte('hora_ingreso', noctIni).lt('hora_ingreso', limaFin).order('hora_ingreso', { ascending: false }),
      supabase.from('registro_asistencias').select('*').eq('fecha', prevStr).gte('hora_ingreso', noctIniPrev).gte('hora_salida', limaIni).lt('hora_salida', limaFin).order('hora_ingreso', { ascending: false }),
    ])

    const seen = new Set<string>()
    const todos = [
      ...(q1.data ?? []),
      ...(q2.data ?? []).map((r: any) => ({ ...r, _entroAyer: true })),
      ...(q3.data ?? []).map((r: any) => ({ ...r, _saleHoy: true })),
    ].filter((r: any) => { if (seen.has(r.id)) return false; seen.add(r.id); return true })

    setAsistencias(todos)
    setLoading(false)
    if (isInitialLoad) setTimeout(() => setIsInitialLoad(false), 400)
  }

  useEffect(() => {
    fetchData(fechaActual)
    if (!isToday(fechaActual)) return
    const canal = supabase.channel('admin-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'registro_asistencias' }, p => {
        setAsistencias(prev => [p.new, ...prev])
        new Audio('/notification.mp3').play().catch(() => {})
        toast.success(`📥 ${p.new.nombres_completos}`, { description: p.new.estado_ingreso })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'registro_asistencias' }, p => {
        setAsistencias(prev => prev.map(a => a.id === p.new.id ? { ...a, ...p.new } : a))
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [fechaActual])

  // ── Memos ─────────────────────────────────────────────────────────────────

  const areas = useMemo(() => ['TODAS', ...Array.from(new Set(asistencias.map(a => a.area).filter(Boolean))).sort()], [asistencias])

  const filtradas = useMemo(() => asistencias.filter(a => {
    const q = busqueda.toLowerCase()
    return (!q || a.nombres_completos?.toLowerCase().includes(q) || a.dni?.includes(q)) &&
      (filtroArea === 'TODAS' || a.area === filtroArea) &&
      (filtroEstado === 'TODOS' || a.estado_ingreso === filtroEstado)
  }), [asistencias, busqueda, filtroArea, filtroEstado])

  const conGPS = useMemo(() => filtradas.map(a => {
    const d = extraerDetalleNota(a.notas)
    return (!d.contieneGPS || d.lat === null || d.lng === null) ? null : { ...a, ...d }
  }).filter(Boolean) as any[], [filtradas])

  const centroMapa = useMemo(() => conGPS.length
    ? { longitude: conGPS.reduce((s, m) => s + m.lng, 0) / conGPS.length, latitude: conGPS.reduce((s, m) => s + m.lat, 0) / conGPS.length }
    : { longitude: -77.0428, latitude: -12.0464 }, [conGPS])

  useEffect(() => {
    if (vistaActual !== 'mapa' || !mapRef.current || !conGPS.length) return
    const map = mapRef.current.getMap()
    if (!map?.isStyleLoaded()) return
    if (conGPS.length === 1) { map.flyTo({ center: [conGPS[0].lng, conGPS[0].lat], zoom: 16, pitch: 65, duration: 1200 }); return }
    let [minLng, maxLng, minLat, maxLat] = [conGPS[0].lng, conGPS[0].lng, conGPS[0].lat, conGPS[0].lat]
    conGPS.forEach(m => { minLng = Math.min(minLng, m.lng); maxLng = Math.max(maxLng, m.lng); minLat = Math.min(minLat, m.lat); maxLat = Math.max(maxLat, m.lat) })
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 80, duration: 1200, pitch: 60 })
  }, [vistaActual, conGPS])

  // ── Stats — multi-turno ───────────────────────────────────────────────────

  const trabajadoresUnicos = useMemo(() => new Set(asistencias.map(a => a.dni)).size, [asistencias])
  const puntuales  = asistencias.filter(a => a.estado_ingreso === 'PUNTUAL').length
  const tardanzas  = asistencias.filter(a => a.estado_ingreso === 'TARDANZA').length
  const conSalida  = asistencias.filter(a => a.hora_salida).length
  const reingresos = useMemo(() => {
    const cnt: Record<string, number> = {}
    return asistencias.filter(a => { cnt[a.dni] = (cnt[a.dni] ?? 0) + 1; return cnt[a.dni] > 1 }).length
  }, [asistencias])
  const totalOffline      = useMemo(() => asistencias.filter(a => (a.notas ?? '').includes('[OFFLINE]')).length, [asistencias])
  const totalInasistencias = useMemo(() => asistencias.filter(a => a.estado_ingreso === 'INASISTENCIA').length, [asistencias])

  // ── Excel ─────────────────────────────────────────────────────────────────

  const exportarExcel = (data: any[], nombre: string) => {
    if (!data.length) { toast.error('Sin registros'); return false }
    const hS = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: { fgColor: { rgb: '1E293B' } }, alignment: { horizontal: 'center', vertical: 'center' } }
    const pS = { font: { color: { rgb: '059669' }, bold: true }, alignment: { horizontal: 'center' } }
    const tS = { font: { color: { rgb: 'DC2626' }, bold: true }, alignment: { horizontal: 'center' } }
    const cS = { alignment: { horizontal: 'center' } }
    const ord = (s: string) => { const p = s?.trim().split(' '); return !p?.length ? '-' : p.length >= 3 ? `${p.slice(-2).join(' ')}, ${p.slice(0,-2).join(' ')}` : p.length === 2 ? `${p[1]}, ${p[0]}` : s }
    const tt = (ts: string) => new Date(ts).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })
    const rows: any[][] = [["FECHA","DNI","APELLIDOS Y NOMBRES","ÁREA","INGRESO","ESTADO","SALIDA","DURACIÓN","NOTA","MAPA"]]
    data.forEach(r => {
      const d = extraerDetalleNota(r.notas)
      rows.push([r.fecha, r.dni, ord(r.nombres_completos), r.area, tt(r.hora_ingreso), r.estado_ingreso,
        r.hora_salida ? tt(r.hora_salida) : '—', calcHoras(r.hora_ingreso, r.hora_salida),
        d.tieneNota ? d.textoLimpio : '—',
        d.contieneGPS && d.coordenadas ? `http://maps.google.com/?q=${d.coordenadas}` : '—'])
    })
    const ws = XLSX.utils.aoa_to_sheet(rows)
    rows.forEach((_, R) => {
      for (let C = 0; C < 10; C++) {
        const cell = XLSX.utils.encode_cell({ r: R, c: C })
        if (!ws[cell]) continue
        if (R === 0) ws[cell].s = hS
        else {
          if (C === 5) ws[cell].s = ws[cell].v === 'PUNTUAL' ? pS : tS
          else if ([0,1,3,4,6,7].includes(C)) ws[cell].s = cS
          if (C === 9 && ws[cell].v !== '—') { ws[cell].l = { Target: ws[cell].v }; ws[cell].v = '📍 Ver'; ws[cell].s = { font: { color: { rgb: '2563EB' }, underline: true }, alignment: { horizontal: 'center' } } }
        }
      }
    })
    ws['!cols'] = [80,80,220,110,70,80,70,65,240,80].map(w => ({ wpx: w }))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Asistencias'); XLSX.writeFile(wb, `${nombre}.xlsx`)
    return true
  }

  const ejecutarExport = async () => {
    try {
      if (tipoExport === 'dia') { const ok = exportarExcel(filtradas, `RUAG_${format(fechaActual,'yyyy-MM-dd')}`); if (ok) { toast.success('Excel descargado'); setShowExportar(false) } }
      else {
        if (!exportDesde || !exportHasta) { toast.error('Selecciona fechas'); return }
        setExportando(true); toast.loading('Descargando...', { id: 'dl' })
        const { data, error } = await supabase.from('registro_asistencias').select('*').gte('fecha', exportDesde).lte('fecha', exportHasta).order('fecha').order('hora_ingreso')
        if (error) throw error
        toast.dismiss('dl')
        const ok = exportarExcel(data, `RUAG_${exportDesde}_AL_${exportHasta}`)
        if (ok) { toast.success(`${data.length} registros`); setShowExportar(false) }
      }
    } catch { toast.dismiss('dl'); toast.error('Error al exportar') } finally { setExportando(false) }
  }

  // ── Edit helpers ──────────────────────────────────────────────────────────

  const actualizarHora = async (id: string, campo: 'hora_ingreso' | 'hora_salida', hora: string | null, fechaBase: string) => {
    try {
      let upd: any = hora === null ? { [campo]: null } : (() => {
        const [h, m] = hora.split(':').map(Number); const d = new Date(fechaBase); d.setHours(h, m, 0)
        return { [campo]: d.toISOString(), ...(campo === 'hora_ingreso' ? { estado_ingreso: (h < 9 || (h === 9 && m <= 5)) ? 'PUNTUAL' : 'TARDANZA' } : {}) }
      })()
      await supabase.from('registro_asistencias').update(upd).eq('id', id)
      toast.success('Actualizado'); setAsistencias(prev => prev.map(a => a.id === id ? { ...a, ...upd } : a))
    } catch { toast.error('Error') }
  }

  const borrarNota = async (id: string) => {
    try { await supabase.from('registro_asistencias').update({ notas: null }).eq('id', id); toast.success('Nota eliminada'); setAsistencias(prev => prev.map(a => a.id === id ? { ...a, notas: null } : a)) } catch { toast.error('Error') }
  }

  const borrarRegistro = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar registro de ${nombre}?`)) return
    try { await supabase.from('registro_asistencias').delete().eq('id', id); toast.success('Eliminado'); setAsistencias(prev => prev.filter(a => a.id !== id)) } catch { toast.error('Error') }
  }

  const cambiarEstado = async (id: string, estadoActual: string) => {
    const n = estadoActual === 'PUNTUAL' ? 'TARDANZA' : 'PUNTUAL'
    try { await supabase.from('registro_asistencias').update({ estado_ingreso: n }).eq('id', id); toast.success(`→ ${n}`); setAsistencias(prev => prev.map(a => a.id === id ? { ...a, estado_ingreso: n } : a)) } catch { toast.error('Error') }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!mounted || isInitialLoad) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <CustomLoader text="INICIANDO SISTEMA..." />
    </div>
  )

  const meta = getTimeMeta(tod)
  const MetaIcon = meta.icon

  return (
    <div className={`min-h-screen flex flex-col ${modoEdicion ? 'bg-blue-50/30 dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-950'} transition-colors duration-300`}>
      <Toaster position="top-center" richColors expand />

      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <motion.div animate={modoEdicion ? { rotate: [0, -5, 5, 0] } : {}} transition={{ duration: 0.4 }}
              className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-white shadow-md ${modoEdicion ? 'bg-blue-600' : 'bg-gradient-to-br from-blue-600 to-indigo-700'}`}>
              <ShieldCheck size={20} />
            </motion.div>
            <div>
              <h1 className="text-sm sm:text-base font-black tracking-tight text-slate-800 dark:text-white">{modoEdicion ? '⚡ MODO ADMIN' : 'RUAG Control'}</h1>
              <p className="text-[10px] text-slate-400 font-medium hidden sm:block">Sistema de Asistencias</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black ${meta.chip}`}>
              <MetaIcon size={13} /><span className="hidden md:inline uppercase tracking-wider">{meta.title}</span>
            </div>
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
            <LiveClock />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col xl:flex-row gap-6">

        {/* Sidebar */}
        <aside className="w-full xl:w-72 shrink-0 flex flex-col gap-4">

          {/* Date */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5"><CalendarDays size={11} /> Fecha</p>
            <div className="flex items-center bg-slate-50 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
              <button onClick={() => setFechaActual(p => subDays(p, 1))} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <ChevronLeft size={15} />
              </button>
              <div className="relative flex-1 flex items-center justify-center cursor-pointer py-1">
                <span className="font-black text-sm text-slate-700 dark:text-slate-200 capitalize">
                  {isToday(fechaActual) ? '· Hoy ·' : format(fechaActual, "d MMM yy", { locale: es })}
                </span>
                <input type="date" className="absolute inset-0 opacity-0 cursor-pointer w-full"
                  value={format(fechaActual, 'yyyy-MM-dd')}
                  onChange={e => { if (e.target.value) { const [y,m,d] = e.target.value.split('-').map(Number); setFechaActual(new Date(y,m-1,d)) } }} />
              </div>
              <button onClick={() => setFechaActual(p => addDays(p, 1))} disabled={isToday(fechaActual)}
                className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5"><SlidersHorizontal size={11} /> Filtros</p>
            <div className="space-y-2">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500 text-xs font-medium transition-all" />
              </div>
              {[
                { value: filtroArea,   onChange: setFiltroArea,   opts: areas.map(a => ({ v: a, l: a === 'TODAS' ? 'Todas las Áreas' : a })) },
                { value: filtroEstado, onChange: setFiltroEstado, opts: [{ v:'TODOS', l:'Todos' }, { v:'PUNTUAL', l:'Puntuales' }, { v:'TARDANZA', l:'Tardanzas' }, { v:'INASISTENCIA', l:'Inasistencias' }] },
              ].map((f, i) => (
                <div key={i} className="relative">
                  <select value={f.value} onChange={e => f.onChange(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 pl-3 pr-7 py-2 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500 text-xs font-medium cursor-pointer appearance-none transition-all">
                    {f.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                  <ChevronRight size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" />
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-2">
            <button onClick={() => setShowExportar(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/20 text-[11px] font-black transition-all active:scale-95 tracking-wider">
              <FileSpreadsheet size={13} /> EXCEL
            </button>
            <button onClick={() => fetchData(fechaActual)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-[11px] font-black transition-all active:scale-95 tracking-wider">
              <RefreshCw size={12} /> ACTUALIZAR
            </button>
            <AnimatePresence>
              {modoEdicion && (
                <motion.button initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  onClick={() => setShowManual(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-black transition-all shadow-md shadow-blue-600/20 active:scale-95 tracking-wider">
                  <UserPlus size={13} /> MANUAL
                </motion.button>
              )}
            </AnimatePresence>
          </div>

        </aside>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0 gap-4">

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard title="Trabajadores" value={trabajadoresUnicos} icon={<Users size={16} />}      color="bg-blue-500"   sub={`${asistencias.length} registros`} />
            <StatCard title="Puntuales"    value={puntuales}          icon={<CheckCircle2 size={16} />} color="bg-emerald-500" />
            <StatCard title="Tardanzas"    value={tardanzas}          icon={<AlertCircle size={16} />}  color="bg-red-500" />
            <StatCard title="Con Salida"   value={conSalida}          icon={<LogOut size={16} />}       color="bg-slate-500" />
            <StatCard title="Reingresos"   value={reingresos}         icon={<RefreshCw size={16} />}    color="bg-indigo-500" sub="multi-turno" />
            {totalOffline > 0 && <StatCard title="Offline" value={totalOffline} icon={<span className="text-xs">📵</span>} color="bg-violet-500" sub="sincronizados" />}
            {totalInasistencias > 0 && <StatCard title="Inasistencias" value={totalInasistencias} icon={<span className="text-xs">✗</span>} color="bg-slate-500" sub="sin marcar" />}
          </div>

          {/* Table / Map */}
          <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col overflow-hidden min-h-[520px]">

            <div className="border-b border-slate-100 dark:border-slate-800 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/30">
              <div className="flex items-center gap-2">
                <Activity size={13} className="text-slate-400" />
                <h3 className="font-black text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-[0.15em]">Registros</h3>
                <span className="text-[11px] font-black text-white bg-slate-400 dark:bg-slate-700 px-2 py-0.5 rounded-md tabular-nums">{filtradas.length}</span>
              </div>
              <div className="flex bg-slate-200/60 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto gap-1">
                {[{ id: 'lista', label: 'Lista', icon: <AlignLeft size={12} /> }, { id: 'mapa', label: 'Mapa 3D', icon: <MapIcon size={12} /> }].map(v => (
                  <button key={v.id} onClick={() => setVistaActual(v.id as any)}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-1.5 text-[11px] font-black rounded-lg transition-all tracking-wide ${vistaActual === v.id ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
              {loading ? (
                <div className="h-full flex items-center justify-center py-16"><CustomLoader text="Buscando..." /></div>
              ) : asistencias.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 py-20 gap-3">
                  <CalendarDays size={40} /><p className="font-black text-sm text-slate-400">Sin registros</p>
                </div>
              ) : filtradas.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 py-20 gap-3">
                  <Search size={36} /><p className="font-black text-sm text-slate-400">Sin coincidencias</p>
                </div>
              ) : vistaActual === 'lista' ? (
                <div className="h-full overflow-y-auto p-3">
                  <motion.div initial="hidden" animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.03 } } }}
                    className="flex flex-col gap-2 pb-4">
                    <AnimatePresence>
                      {filtradas.map((a, i) => (
                        <FotocheckRow key={a.id} data={a} index={i} modoEdicion={modoEdicion}
                          onActualizar={actualizarHora} onCambiarEstado={cambiarEstado}
                          onAbrirNota={n => setNotaModal(n)} onBorrarNota={borrarNota} onBorrarRegistro={borrarRegistro} />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                </div>
              ) : (
                <div className="w-full h-full min-h-[400px] relative">
                  {process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? (
                    <Map ref={mapRef}
                      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
                      initialViewState={{ longitude: centroMapa.longitude, latitude: centroMapa.latitude, zoom: 14.5, pitch: 65, bearing: -20 }}
                      mapStyle="mapbox://styles/mapbox/standard"
                      style={{ width: '100%', height: '100%' }}
                      onLoad={() => { const m = mapRef.current?.getMap(); if (m) aplicarEstiloMapa(m, tod) }}
                    >
                      {conGPS.map((m: any) => {
                        const tone = getMarkerTone(m.tipoMarcacion)
                        const MIcon = tone.icon
                        const ring = m.estado_ingreso === 'PUNTUAL' ? 'ring-4 ring-emerald-400/30' : 'ring-4 ring-red-400/30'
                        return (
                          <Marker key={m.id} latitude={m.lat} longitude={m.lng} anchor="bottom">
                            <div className="relative flex flex-col items-center group cursor-pointer">
                              <div className="pointer-events-none absolute left-1/2 bottom-full mb-3 -translate-x-1/2 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200 z-30 w-64">
                                <div className="rounded-2xl border border-white/60 bg-white/95 backdrop-blur-xl shadow-xl overflow-hidden">
                                  <div className={`h-1 w-full bg-gradient-to-r ${tone.gradient}`} />
                                  <div className="p-3 flex items-start gap-2">
                                    <div className={`shrink-0 w-10 h-10 rounded-xl overflow-hidden bg-slate-100 ${ring}`}>
                                      {m.foto_url ? <img src={m.foto_url} alt="" className="w-full h-full object-cover" /> :
                                        <div className="w-full h-full flex items-center justify-center font-black text-xs text-slate-500">{getInitials(m.nombres_completos)}</div>}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="font-black text-xs text-slate-900 truncate uppercase">{m.nombres_completos}</p>
                                      <p className="text-[9px] text-slate-400">{m.area}</p>
                                      <div className="flex gap-1 mt-1">
                                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black text-white ${tone.bg}`}>{tone.label}</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${m.estado_ingreso === 'PUNTUAL' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{m.estado_ingreso}</span>
                                      </div>
                                    </div>
                                  </div>
                                  {m.textoLimpio && <p className="mx-3 mb-3 text-[10px] text-slate-500 bg-slate-50 rounded-lg p-2 line-clamp-2">{m.textoLimpio}</p>}
                                </div>
                              </div>
                              <div className={`relative w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-xl ${ring}`}>
                                {m.foto_url ? <img src={m.foto_url} alt="" className="w-full h-full object-cover" /> :
                                  <div className="w-full h-full flex items-center justify-center font-black text-xs bg-slate-100 text-slate-600">{getInitials(m.nombres_completos)}</div>}
                                <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${tone.bg}`}>
                                  <MIcon size={8} className="text-white" />
                                </div>
                              </div>
                            </div>
                          </Marker>
                        )
                      })}
                      <FullscreenControl position="top-right" />
                      <NavigationControl position="top-right" visualizePitch />
                      <GeolocateControl position="top-right" />
                    </Map>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                      <MapIcon size={36} className="mb-3 opacity-40" />
                      <p className="font-bold text-sm">Falta NEXT_PUBLIC_MAPBOX_TOKEN</p>
                    </div>
                  )}
                  <div className="absolute top-3 left-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Leyenda</p>
                    {[{ color: 'bg-blue-500', label: 'Obra' }, { color: 'bg-purple-500', label: 'Externo' }, { color: 'bg-amber-500', label: 'Nocturno' }, { color: 'bg-slate-500', label: 'Nota GPS' }].map(l => (
                      <div key={l.label} className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        <div className={`w-2 h-2 rounded-full ${l.color}`} />{l.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}

      {/* Export */}
      <AnimatePresence>
        {showExportar && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(10px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowExportar(false)}>
            <motion.div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
              initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 16 }}
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              onClick={e => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-1.5" />
              <div className="p-5">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600"><FileSpreadsheet size={16} /></div>
                    <h3 className="font-black text-base text-slate-900 dark:text-white">Exportar Excel</h3>
                  </div>
                  <button onClick={() => setShowExportar(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
                </div>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4">
                  {[{ v: 'dia', l: 'Día actual' }, { v: 'rango', l: 'Por rango' }].map(t => (
                    <button key={t.v} onClick={() => setTipoExport(t.v as any)}
                      className={`flex-1 py-1.5 text-xs font-black rounded-lg transition-all ${tipoExport === t.v ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm' : 'text-slate-400'}`}>
                      {t.l}
                    </button>
                  ))}
                </div>
                {tipoExport === 'dia' ? (
                  <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center text-sm text-slate-500">
                    <strong className="text-emerald-600 text-xl font-black">{filtradas.length}</strong> registros del {format(fechaActual, "d MMM yyyy", { locale: es })}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {[{ label: 'Desde', value: exportDesde, onChange: setExportDesde }, { label: 'Hasta', value: exportHasta, onChange: setExportHasta }].map(f => (
                      <div key={f.label}>
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">{f.label}</label>
                        <input type="date" value={f.value} onChange={e => f.onChange(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl outline-none focus:border-emerald-500 text-sm" />
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={ejecutarExport} disabled={exportando}
                  className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl flex justify-center items-center gap-2 transition-all active:scale-95 disabled:opacity-50 text-sm">
                  {exportando ? <Loader2 className="animate-spin" size={16} /> : <><Download size={14} /> DESCARGAR</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual */}
      <AnimatePresence>
        {showManual && <ModalManual onClose={() => setShowManual(false)} fechaBase={format(fechaActual, 'yyyy-MM-dd')} onSuccess={r => { setAsistencias(p => [r, ...p]); setShowManual(false) }} />}
      </AnimatePresence>

      {/* Nota */}
      <AnimatePresence>
        {notaModal && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(10px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setNotaModal(null)}>
            <motion.div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
              initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 16 }}
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              onClick={e => e.stopPropagation()}>
              {(() => {
                const grads: Record<TipoMarcacion, string> = { ingreso_obra: 'from-blue-500 to-cyan-400', salida_obra: 'from-red-500 to-rose-400', externo: 'from-purple-500 to-fuchsia-400', nocturno: 'from-amber-500 to-orange-400', nota: 'from-slate-400 to-slate-500', ninguna: 'from-slate-300 to-slate-400' }
                const icons: Record<TipoMarcacion, React.ReactNode> = { ingreso_obra: <HardHat size={20} className="text-blue-500" />, salida_obra: <MapPin size={20} className="text-red-500" />, externo: <Store size={20} className="text-purple-500" />, nocturno: <Moon size={20} className="text-amber-500" />, nota: <MessageSquareText size={20} className="text-slate-500" />, ninguna: <MessageSquareText size={20} className="text-slate-400" /> }
                const lbls: Record<TipoMarcacion, string> = { ingreso_obra: 'Ingreso en Obra', salida_obra: 'Salida de Obra', externo: 'Marcación Externa', nocturno: 'Turno Nocturno', nota: 'Nota', ninguna: 'Sin tipo' }
                const tipo = notaModal.tipoObra as TipoMarcacion
                return (
                  <>
                    <div className={`h-1.5 w-full bg-gradient-to-r ${grads[tipo] ?? grads.nota}`} />
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">{icons[tipo]}<h3 className="font-black text-base text-slate-900 dark:text-white">{lbls[tipo]}</h3></div>
                        <button onClick={() => setNotaModal(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={15} /></button>
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{notaModal.nombre}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">{notaModal.hora}</p>
                      {notaModal.estadoIngreso && <span className={`inline-flex mb-3 px-2.5 py-1 rounded-lg text-xs font-black ${notaModal.estadoIngreso === 'PUNTUAL' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{notaModal.estadoIngreso}</span>}
                      <div className="bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{notaModal.nota}</div>
                      <button onClick={() => setNotaModal(null)} className="w-full mt-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black py-2.5 rounded-xl active:scale-95 transition-all text-sm">Cerrar</button>
                    </div>
                  </>
                )
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        .mq-wrap{overflow:hidden;white-space:nowrap;mask-image:linear-gradient(to right,black 80%,transparent 100%)}
        .mq-inner{display:inline-block;animation:mqx 8s linear infinite}
        .mq-inner:hover{animation-play-state:paused}
        @keyframes mqx{0%,15%{transform:translateX(0)}100%{transform:translateX(calc(-100% + 160px))}}
      `}} />
    </div>
  )
}

// ─── ModalManual ─────────────────────────────────────────────────────────────
// Permite múltiples registros por día — ya no bloquea si hay entradas previas

type PerfilTrabajador = { dni: string; nombres_completos: string; area: string; foto_url: string }

function ModalManual({ onClose, fechaBase, onSuccess }: { onClose: () => void; fechaBase: string; onSuccess: (d: any) => void }) {
  const [busq, setBusq]                   = useState('')
  const [trabajadores, setTrabajadores]   = useState<PerfilTrabajador[]>([])
  const [loadingP, setLoadingP]           = useState(true)
  const [perfil, setPerfil]               = useState<PerfilTrabajador | null>(null)
  const [showDrop, setShowDrop]           = useState(false)
  const [hora, setHora]                   = useState('08:00')
  const [saving, setSaving]               = useState(false)
  const [turnosHoy, setTurnosHoy]         = useState(0)
  const [checking, setChecking]           = useState(false)
  const [fechaRegistro, setFechaRegistro] = useState(fechaBase)

  useEffect(() => {
    supabase.from('fotocheck_perfiles').select('dni, nombres_completos, area, foto_url').order('nombres_completos')
      .then(({ data }) => { if (data) setTrabajadores(data); setLoadingP(false) })
  }, [])

  useEffect(() => {
    if (!perfil) { setTurnosHoy(0); return }
    setChecking(true)
    const [y, m, d] = fechaRegistro.split('-')
    const next = new Date(Number(y), Number(m) - 1, Number(d) + 1)
    const nextStr = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`
    supabase.from('registro_asistencias').select('id', { count: 'exact', head: true })
      .eq('dni', perfil.dni).gte('hora_ingreso', `${fechaRegistro}T05:00:00.000Z`).lt('hora_ingreso', `${nextStr}T05:00:00.000Z`)
      .then(({ count }) => { setTurnosHoy(count ?? 0); setChecking(false) })
  }, [perfil, fechaRegistro])

  const filtrados = trabajadores.filter(t => t.nombres_completos.toLowerCase().includes(busq.toLowerCase()) || t.dni.includes(busq))

  const save = async () => {
    if (!perfil || !hora) { toast.error('Completa todos los campos'); return }
    setSaving(true)
    try {
      const [h, m] = hora.split(':').map(Number)
      const d = new Date(fechaRegistro); d.setHours(h, m, 0)
      const esReingreso = turnosHoy > 0
      const isPuntual = esReingreso || h < 9 || (h === 9 && m <= 5)
      const { data, error } = await supabase.from('registro_asistencias').insert({
        dni: perfil.dni, nombres_completos: perfil.nombres_completos,
        area: perfil.area, foto_url: perfil.foto_url ?? '', fecha: fechaRegistro,
        hora_ingreso: d.toISOString(), estado_ingreso: isPuntual ? 'PUNTUAL' : 'TARDANZA',
      }).select().single()
      if (error) throw error
      toast.success(`${isPuntual ? '✓ PUNTUAL' : '✗ TARDANZA'}${esReingreso ? ' · Reingreso' : ''}`)
      onSuccess(data)
    } catch (e: any) { toast.error(e.message); setSaving(false) }
  }

  return (
    <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(10px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
        initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-1.5" />
        <div className="p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600"><UserPlus size={16} /></div>
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">Registro Manual</h3>
                <p className="text-[10px] text-slate-400">Para cualquier fecha</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={15} /></button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Fecha del Registro</label>
              <div className="relative">
                <input
                  type="date"
                  value={fechaRegistro}
                  max={format(new Date(), 'yyyy-MM-dd')}
                  onChange={e => { if (e.target.value) setFechaRegistro(e.target.value) }}
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 px-3 py-2.5 rounded-xl outline-none focus:border-blue-500 text-sm font-bold cursor-pointer"
                />
                {fechaRegistro !== fechaBase && (
                  <span className="absolute right-9 top-1/2 -translate-y-1/2 text-[9px] font-black text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded">
                    DÍA ANTERIOR
                  </span>
                )}
              </div>
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                Trabajador {loadingP && <span className="text-blue-400 normal-case font-medium">(cargando...)</span>}
              </label>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type="text" value={busq} placeholder="Buscar por nombre o DNI..."
                  onChange={e => { setBusq(e.target.value); setShowDrop(true); if (!e.target.value) setPerfil(null) }}
                  onFocus={() => setShowDrop(true)}
                  className={`w-full pl-8 pr-7 py-2.5 rounded-xl border text-sm font-medium outline-none transition-all ${perfil ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30' : 'bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 focus:border-blue-500'}`} />
                {perfil && <button onClick={() => { setPerfil(null); setBusq('') }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><X size={12} /></button>}
                {showDrop && !perfil && busq.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-44 overflow-y-auto">
                    {filtrados.length === 0 ? <div className="p-3 text-xs text-slate-400 text-center">Sin resultados</div> :
                      filtrados.slice(0, 6).map(t => (
                        <button key={t.dni} onClick={() => { setPerfil(t); setBusq(t.nombres_completos); setShowDrop(false) }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left">
                          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden shrink-0 flex items-center justify-center">
                            {t.foto_url ? <img src={t.foto_url} alt="" className="w-full h-full object-cover" /> :
                              <span className="text-[9px] font-black text-slate-500">{getInitials(t.nombres_completos)}</span>}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate uppercase">{t.nombres_completos}</p>
                            <p className="text-[9px] text-slate-400">{t.dni} · {t.area}</p>
                          </div>
                        </button>
                      ))
                    }
                  </div>
                )}
              </div>
              <AnimatePresence>
                {perfil && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="mt-2 p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-slate-200 overflow-hidden shrink-0">
                        {perfil.foto_url ? <img src={perfil.foto_url} alt="" className="w-full h-full object-cover" /> :
                          <div className="w-full h-full flex items-center justify-center text-[9px] font-black text-slate-500">{getInitials(perfil.nombres_completos)}</div>}
                      </div>
                      <p className="text-xs font-black text-slate-700 dark:text-slate-200 truncate uppercase">{perfil.nombres_completos}</p>
                    </div>
                    {checking ? <Loader2 size={12} className="animate-spin text-slate-400 shrink-0" /> : (
                      <span className={`shrink-0 px-2 py-0.5 rounded text-[9px] font-black ${turnosHoy > 0 ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'}`}>
                        {turnosHoy > 0 ? `${turnosHoy} turno${turnosHoy > 1 ? 's' : ''} hoy` : 'Sin turnos'}
                      </span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Hora de Ingreso</label>
              <input type="time" value={hora} onChange={e => setHora(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 px-3 py-2.5 rounded-xl outline-none focus:border-blue-500 text-sm" />
              {hora && (() => {
                const [h, m] = hora.split(':').map(Number)
                const esRe = turnosHoy > 0
                const p = esRe || h < 9 || (h === 9 && m <= 5)
                return <p className={`text-[10px] font-black mt-1 ml-0.5 ${p ? 'text-emerald-600' : 'text-red-500'}`}>→ {p ? '✓ PUNTUAL' : '✗ TARDANZA'}{esRe ? ' (reingreso)' : ''}</p>
              })()}
            </div>
          </div>

          <button onClick={save} disabled={saving || !perfil}
            className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl flex justify-center items-center gap-2 transition-all active:scale-95 disabled:opacity-50 text-sm tracking-wide">
            {saving ? <Loader2 className="animate-spin" size={16} /> : 'REGISTRAR'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── FotocheckRow ─────────────────────────────────────────────────────────────

function FotocheckRow({ data, index, modoEdicion, onActualizar, onCambiarEstado, onAbrirNota, onBorrarNota, onBorrarRegistro }: {
  data: any; index: number; modoEdicion: boolean
  onActualizar: (id: string, campo: 'hora_ingreso' | 'hora_salida', hora: string | null, fechaBase: string) => void
  onCambiarEstado: (id: string, estadoActual: string) => void
  onAbrirNota: (n: any) => void
  onBorrarNota: (id: string) => void
  onBorrarRegistro: (id: string, nombre: string) => void
}) {
  const esInasistencia = data.estado_ingreso === 'INASISTENCIA'
  const isPuntual  = data.estado_ingreso === 'PUNTUAL'
  const entroAyer  = !!data._entroAyer
  const saleHoy    = !!data._saleHoy
  const tieneSalida = !!data.hora_salida
  const nota   = extraerDetalleNota(data.notas)
  const tone   = getMarkerTone(nota.tipoMarcacion)
  const NIcon  = tone.icon
  const horas  = calcHoras(data.hora_ingreso, data.hora_salida)
  const esNocturno = data.notas?.startsWith('Turno Nocturno') ?? false
  const esOffline  = (data.notas ?? '').includes('[OFFLINE]')
  const hasBadge = entroAyer || saleHoy || esOffline || esInasistencia

  const borderClass = esInasistencia ? 'border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/30'
    : entroAyer || saleHoy ? 'border-amber-300 dark:border-amber-500/30 ring-1 ring-amber-100 dark:ring-amber-500/10'
    : esOffline ? 'border-violet-300 dark:border-violet-500/30 ring-1 ring-violet-100 dark:ring-violet-500/10'
    : tieneSalida && isToday(new Date(data.hora_ingreso)) ? 'border-emerald-200 dark:border-emerald-500/20'
    : index === 0 && isToday(new Date(data.hora_ingreso)) ? 'border-blue-200 dark:border-blue-500/20 ring-1 ring-blue-50 dark:ring-blue-500/10'
    : 'border-slate-200 dark:border-slate-800'

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 380, damping: 28 } } }}
      whileHover={{ scale: 1.002 }}
      className={`relative flex items-center justify-between bg-white dark:bg-slate-900 border rounded-xl transition-all hover:shadow-md
        ${hasBadge ? 'pt-7 pb-4 px-4 sm:pt-8 sm:pb-5 sm:px-5' : 'p-4 sm:p-5'} ${borderClass}`}
    >
      {entroAyer && (
        <div className="absolute -top-2.5 left-3 z-10 flex items-center gap-1 bg-amber-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-sm">
          <Moon size={7} /> 🌙 NOCTURNO · Entró {new Date(data.hora_ingreso).toLocaleTimeString('es-PE', { timeZone:'America/Lima', hour:'2-digit', minute:'2-digit', hour12:true })} · Sale mañana
        </div>
      )}
      {saleHoy && (
        <div className="absolute -top-2.5 left-3 z-10 flex items-center gap-1 bg-indigo-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-sm">
          <Moon size={7} /> 🌅 SALIDA HOY · Entró ayer {new Date(data.hora_ingreso).toLocaleTimeString('es-PE', { timeZone:'America/Lima', hour:'2-digit', minute:'2-digit', hour12:true })}
          {data.hora_salida && ` · Salió ${new Date(data.hora_salida).toLocaleTimeString('es-PE', { timeZone:'America/Lima', hour:'2-digit', minute:'2-digit', hour12:true })}`}
        </div>
      )}

      {esOffline && (
        <div className="absolute -top-2.5 left-3 z-10 flex items-center gap-1 bg-violet-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-sm">
          📵 SIN CONEXIÓN · Sincronizado offline
        </div>
      )}
      {esInasistencia && (
        <div className="absolute -top-2.5 left-3 z-10 flex items-center gap-1 bg-slate-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-sm">
          ✗ INASISTENCIA · Sin registro en el día
        </div>
      )}

      {/* Avatar */}
      <div className="flex items-center gap-3 flex-1 min-w-0 pr-3">
        <div className="relative shrink-0">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {data.foto_url ? <img src={data.foto_url} alt="" className="w-full h-full object-cover" /> :
              <div className="w-full h-full flex items-center justify-center font-black text-slate-400 text-sm">{getInitials(data.nombres_completos)}</div>}
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${esInasistencia ? 'bg-slate-400' : isPuntual ? 'bg-emerald-500' : 'bg-red-500'}`} />
          {esNocturno && <div className="absolute -top-0.5 -left-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white dark:border-slate-900 flex items-center justify-center"><Moon size={7} className="text-white" /></div>}
          {esOffline && !esNocturno && <div className="absolute -top-0.5 -left-0.5 w-3.5 h-3.5 rounded-full bg-violet-500 border-2 border-white dark:border-slate-900 flex items-center justify-center text-white text-[7px] font-black leading-none">📵</div>}
        </div>
        <div className="min-w-0">
          <div className="hidden lg:block max-w-[280px] xl:max-w-[340px]">
            <p className="font-black text-slate-800 dark:text-slate-100 text-base uppercase tracking-tight truncate">{data.nombres_completos}</p>
          </div>
          <div className="lg:hidden mq-wrap max-w-[140px] sm:max-w-[220px]">
            <span className="mq-inner font-black text-slate-800 dark:text-slate-100 text-base uppercase tracking-tight">{data.nombres_completos}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[9px] font-mono text-slate-400">{data.dni}</span>
            <span className="hidden sm:inline text-[9px] font-bold text-slate-300 dark:text-slate-700">·</span>
            <span className="text-[9px] font-bold text-slate-400 uppercase hidden sm:inline">{data.area}</span>
            {esInasistencia ? (
              <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                INASISTENCIA
              </span>
            ) : modoEdicion ? (
              <button onClick={() => onCambiarEstado(data.id, data.estado_ingreso)}
                className={`px-1.5 py-0.5 rounded text-[8px] font-black border transition-all hover:scale-105 active:scale-95
                  ${isPuntual ? 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300' : 'bg-red-100 text-red-700 border-red-300 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300'}`}>
                {data.estado_ingreso} ⇄
              </button>
            ) : (
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${isPuntual ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'}`}>
                {data.estado_ingreso}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Times */}
      <div className="flex items-center gap-3 sm:gap-5 shrink-0">
        <div className="flex flex-col items-end">
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Entrada</span>
          {modoEdicion ? (
            <input type="time" defaultValue={format(new Date(data.hora_ingreso), 'HH:mm')}
              className="bg-transparent border-b border-blue-500 text-xs font-black text-blue-600 outline-none w-14 text-right"
              onBlur={e => { if (e.target.value !== format(new Date(data.hora_ingreso), 'HH:mm')) onActualizar(data.id, 'hora_ingreso', e.target.value, data.hora_ingreso) }} />
          ) : (
            <span className={`font-black text-base tabular-nums ${esInasistencia ? 'text-slate-400 dark:text-slate-600' : isPuntual ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {esInasistencia ? '—' : format(new Date(data.hora_ingreso), 'HH:mm')}
            </span>
          )}
        </div>

        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 hidden sm:block" />

        <div className="flex flex-col items-end">
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Salida</span>
          {modoEdicion ? (
            <div className="flex items-center gap-1">
              <input type="time" defaultValue={data.hora_salida ? format(new Date(data.hora_salida), 'HH:mm') : ''}
                className="bg-transparent border-b border-blue-500 text-xs font-bold text-slate-600 dark:text-slate-300 outline-none w-14 text-right"
                onBlur={e => { const c = data.hora_salida ? format(new Date(data.hora_salida), 'HH:mm') : ''; if (e.target.value && e.target.value !== c) onActualizar(data.id, 'hora_salida', e.target.value, data.hora_salida || data.hora_ingreso) }} />
              {data.hora_salida && <button onClick={() => onActualizar(data.id, 'hora_salida', null, data.hora_ingreso)} className="text-red-400 hover:text-red-600"><X size={10} /></button>}
            </div>
          ) : data.hora_salida ? (
            <span className="font-black text-base text-slate-700 dark:text-slate-300 tabular-nums">{format(new Date(data.hora_salida), 'HH:mm')}</span>
          ) : (
            <span className="text-[9px] font-bold text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 px-1.5 py-0.5 rounded">--:--</span>
          )}
        </div>

        {horas !== '—' && (
          <>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 hidden md:block" />
            <div className="hidden md:flex flex-col items-end">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Duración</span>
              <span className="text-sm font-black text-blue-600 dark:text-blue-400 tabular-nums">{horas}</span>
            </div>
          </>
        )}

        <div className="flex items-center gap-1">
          {nota.tieneNota && (
            <>
              <button onClick={() => onAbrirNota({ nombre: data.nombres_completos, nota: nota.textoLimpio, hora: format(new Date(data.hora_ingreso), 'HH:mm'), tipoObra: nota.tipoMarcacion, estadoIngreso: data.estado_ingreso })}
                className={`p-1.5 rounded-full border transition-all hover:scale-110 ${nota.tipoMarcacion === 'ingreso_obra' ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/30' : nota.tipoMarcacion === 'externo' ? 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-500/10 dark:border-purple-500/30' : nota.tipoMarcacion === 'nocturno' ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30' : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-500/10 dark:border-slate-500/30'}`}
                title={tone.label}>
                <NIcon size={12} />
              </button>
              {modoEdicion && (
                <button onClick={() => onBorrarNota(data.id)} className="p-1.5 rounded-full border border-red-200 dark:border-red-500/30 text-red-400 hover:bg-red-50 hover:scale-110 transition-all">
                  <Trash2 size={11} />
                </button>
              )}
            </>
          )}
          {modoEdicion && (
            <button onClick={() => onBorrarRegistro(data.id, data.nombres_completos)}
              className="p-1.5 rounded-full border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 hover:scale-110 transition-all ml-0.5">
              <X size={12} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}