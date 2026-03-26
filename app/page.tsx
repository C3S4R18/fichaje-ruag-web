'use client'

import * as XLSX from 'xlsx-js-style';
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/utils/supabase/client'
import { motion, AnimatePresence, Variants } from 'framer-motion'
import { format, isToday, subDays, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  CalendarDays, ChevronLeft, ChevronRight,
  CheckCircle2, AlertCircle, LogOut, UserPlus, Loader2, Search, Filter,
  FileSpreadsheet, SlidersHorizontal, Users, ShieldCheck, AlignLeft,
  MapPin, Map as MapIcon, Download, HardHat, Trash2, MessageSquareText, X,
  Sunrise, Sun, Sunset, MoonStar, Store, Moon
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import Map, {
  Marker,
  NavigationControl,
  FullscreenControl,
  GeolocateControl,
  type MapRef
} from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night'
// FIX: Se agregó 'nocturno' como tipo de marcación válido
type TipoMarcacion = 'ninguna' | 'ingreso_obra' | 'salida_obra' | 'externo' | 'nota' | 'nocturno'

// ─── Lima time helpers ─────────────────────────────────────────────────────────

function getLimaHour() {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Lima', hour: '2-digit', hour12: false
    }).formatToParts(new Date()).find(p => p.type === 'hour')?.value ?? '12'
  )
}

function getTimeOfDay(): TimeOfDay {
  const h = getLimaHour()
  if (h >= 6 && h < 8)  return 'dawn'
  if (h >= 8 && h < 17) return 'day'
  if (h >= 17 && h < 19) return 'dusk'
  return 'night'
}

function getTimeMeta(tod: TimeOfDay) {
  switch (tod) {
    case 'dawn':  return { title: 'Amanecer', subtitle: 'Luz suave de inicio',      icon: Sunrise,  chip: 'bg-amber-50 text-amber-700 border-amber-200' }
    case 'day':   return { title: 'Día',      subtitle: 'Sol alto y sombras activas', icon: Sun,      chip: 'bg-sky-50 text-sky-700 border-sky-200' }
    case 'dusk':  return { title: 'Atardecer', subtitle: 'Luz cálida del cierre',    icon: Sunset,   chip: 'bg-orange-50 text-orange-700 border-orange-200' }
    default:      return { title: 'Noche',    subtitle: 'Entorno nocturno activo',   icon: MoonStar, chip: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
  }
}

function getInitials(name: string) {
  if (!name) return '??'
  const w = name.trim().split(' ').filter(Boolean)
  return w.length === 1 ? w[0].substring(0, 2).toUpperCase() : (w[0][0] + w[1][0]).toUpperCase()
}

// ─── Nota parser ──────────────────────────────────────────────────────────────

function extraerDetalleNota(notas?: string | null) {
  const raw = notas ?? ''
  if (!raw.trim()) return { tieneNota: false, contieneGPS: false, textoLimpio: '', coordenadas: '', lat: null, lng: null, tipoMarcacion: 'ninguna' as TipoMarcacion }

  const contieneGPS = raw.includes('[GPS:')
  let tipoMarcacion: TipoMarcacion = 'nota'
  let textoLimpio = raw

  // FIX: Se reconoce el prefijo "Turno Nocturno" correctamente
  if      (raw.startsWith('Ingreso en:'))           tipoMarcacion = 'ingreso_obra'
  else if (raw.startsWith('Salida de obra:') || raw.startsWith('Salida en:')) tipoMarcacion = 'salida_obra'
  else if (raw.startsWith('Marcación Externa:') || raw.startsWith('Salida Externa:')) tipoMarcacion = 'externo'
  else if (raw.startsWith('Turno Nocturno'))         tipoMarcacion = 'nocturno'
  else                                               tipoMarcacion = 'nota'

  let coordenadas = '', lat: number | null = null, lng: number | null = null

  if (contieneGPS) {
    const s = raw.indexOf('[GPS:')
    const e = raw.indexOf(']', s)
    if (s !== -1 && e !== -1) {
      coordenadas = raw.substring(s + 5, e).trim()
      textoLimpio = raw.substring(0, s).trim()
        .replace(/^(Ingreso en:|Salida de obra:|Salida en:|Marcación Externa:|Salida Externa:)\s*/, '')
        .replace(/^Turno Nocturno \([^)]+\):\s*/, '')
        .trim()

      if (!textoLimpio) {
        textoLimpio = tipoMarcacion === 'ingreso_obra' ? 'Ingreso en obra'
          : tipoMarcacion === 'salida_obra'  ? 'Salida de obra'
          : tipoMarcacion === 'externo'      ? 'Marcación Externa'
          : tipoMarcacion === 'nocturno'     ? 'Turno Nocturno'
          : 'Nota con ubicación'
      }
      const [ls, lo] = coordenadas.split(',')
      const pl = parseFloat(ls?.trim() ?? '')
      const plo = parseFloat(lo?.trim() ?? '')
      lat = isNaN(pl) ? null : pl
      lng = isNaN(plo) ? null : plo
    }
  } else {
    textoLimpio = raw.replace(/^Turno Nocturno \([^)]+\):\s*/, '').trim()
  }

  return { tieneNota: true, contieneGPS, textoLimpio, coordenadas, lat, lng, tipoMarcacion }
}

// ─── Mapa helpers ─────────────────────────────────────────────────────────────

function aplicarEstiloMapa(map: any, tod: TimeOfDay) {
  try { map.setConfigProperty('basemap', 'lightPreset', tod) } catch {}
  try { map.setConfigProperty('basemap', 'show3dObjects', true) } catch {}
  try { map.setConfigProperty('basemap', 'showPointOfInterestLabels', false) } catch {}

  const fog: Record<TimeOfDay, any> = {
    dawn:  { color: 'rgb(255,211,170)', 'high-color': 'rgb(87,133,221)',  'horizon-blend': 0.08, 'space-color': 'rgb(39,53,95)',  'star-intensity': 0.15 },
    day:   { color: 'rgb(186,210,235)', 'high-color': 'rgb(36,92,223)',   'horizon-blend': 0.04, 'space-color': 'rgb(11,11,25)',  'star-intensity': 0 },
    dusk:  { color: 'rgb(255,183,148)', 'high-color': 'rgb(88,74,169)',   'horizon-blend': 0.1,  'space-color': 'rgb(28,22,54)', 'star-intensity': 0.25 },
    night: { color: 'rgb(30,40,72)',    'high-color': 'rgb(17,24,39)',    'horizon-blend': 0.08, 'space-color': 'rgb(7,10,22)',  'star-intensity': 0.7 },
  }
  try { map.setFog(fog[tod]) } catch {}
}

// ─── Theme Switch ─────────────────────────────────────────────────────────────

const ThemeSwitch = ({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) => (
  <div className="relative transform scale-[0.6] sm:scale-75 origin-right">
    <style dangerouslySetInnerHTML={{ __html: `
      .ts { --s:20px;--cw:5.625em;--ch:2.5em;--cr:6.25em;--lbg:#3D7EAE;--nbg:#1D1F2C;--cd:3.375em;--sd:2.125em;--sun:#ECCA2F;--moon:#C4C9D1;--spot:#959DB1;--co:calc((var(--cd) - var(--ch)) / 2 * -1);--sc:#fff;--cc:#F3FDFF;--bc:#AACADF;--t:.5s cubic-bezier(0,-0.02,.4,1.25);--ct:.3s cubic-bezier(0,-0.02,.35,1.17); }
      .ts,.ts *,.ts *::before,.ts *::after{box-sizing:border-box;margin:0;padding:0;font-size:var(--s)}
      .ts__c{width:var(--cw);height:var(--ch);background:var(--lbg);border-radius:var(--cr);overflow:hidden;cursor:pointer;box-shadow:0em -0.062em 0.062em rgba(0,0,0,.25),0em 0.062em 0.125em rgba(255,255,255,.94);transition:var(--t);position:relative;display:block}
      .ts__c::before{content:"";position:absolute;z-index:1;inset:0;box-shadow:0em .05em .187em rgba(0,0,0,.25) inset,0em .05em .187em rgba(0,0,0,.25) inset;border-radius:var(--cr);pointer-events:none}
      .ts__i{display:none}
      .ts__cc{width:var(--cd);height:var(--cd);background:rgba(255,255,255,.1);position:absolute;left:var(--co);top:var(--co);border-radius:var(--cr);box-shadow:inset 0 0 0 3.375em rgba(255,255,255,.1),0 0 0 .625em rgba(255,255,255,.1);display:flex;transition:var(--ct);pointer-events:none}
      .ts__sm{pointer-events:auto;position:relative;z-index:2;width:var(--sd);height:var(--sd);margin:auto;border-radius:var(--cr);background:var(--sun);box-shadow:.062em .062em .062em 0em rgba(254,255,239,.61) inset,0em -.062em .062em 0em #a1872a inset;filter:drop-shadow(.062em .125em .125em rgba(0,0,0,.25));overflow:hidden;transition:var(--t)}
      .ts__m{transform:translateX(100%);width:100%;height:100%;background:var(--moon);border-radius:inherit;box-shadow:.062em .062em .062em 0em rgba(254,255,239,.61) inset;transition:var(--t);position:relative}
      .ts__sp{position:absolute;top:.75em;left:.312em;width:.75em;height:.75em;border-radius:var(--cr);background:var(--spot);box-shadow:0em .0312em .062em rgba(0,0,0,.25) inset}
      .ts__sp:nth-of-type(2){width:.375em;height:.375em;top:.937em;left:1.375em}
      .ts__sp:nth-last-of-type(3){width:.25em;height:.25em;top:.312em;left:.812em}
      .ts__cl{width:1.25em;height:1.25em;background:var(--cc);border-radius:var(--cr);position:absolute;bottom:-.625em;left:.312em;box-shadow:.937em .312em var(--cc),-.312em -.312em var(--bc),1.437em .375em var(--cc),.5em -.125em var(--bc),2.187em 0 var(--cc),1.25em -.062em var(--bc),2.937em .312em var(--cc),2em -.312em var(--bc),3.625em -.062em var(--cc),2.625em 0em var(--bc),4.5em -.312em var(--cc),3.375em -.437em var(--bc),4.625em -1.75em 0 .437em var(--cc),4em -.625em var(--bc),4.125em -2.125em 0 .437em var(--bc);transition:.5s cubic-bezier(0,-0.02,.4,1.25)}
      .ts__sc{position:absolute;color:var(--sc);top:-100%;left:.312em;width:2.75em;height:auto;transition:var(--t)}
      .ts__i:checked + .ts__c{background:var(--nbg)}
      .ts__i:checked + .ts__c .ts__cc{left:calc(100% - var(--co) - var(--cd))}
      .ts__i:checked + .ts__c .ts__cc:hover{left:calc(100% - var(--co) - var(--cd) - .187em)}
      .ts__cc:hover{left:calc(var(--co) + .187em)}
      .ts__i:checked + .ts__c .ts__m{transform:translate(0)}
      .ts__i:checked + .ts__c .ts__cl{bottom:-4.062em}
      .ts__i:checked + .ts__c .ts__sc{top:50%;transform:translateY(-50%)}
    ` }} />
    <label className="ts">
      <input type="checkbox" className="ts__i" checked={isDark} onChange={onToggle} />
      <div className="ts__c">
        <div className="ts__cl" />
        <div className="ts__sc">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 55" fill="none">
            <path fillRule="evenodd" clipRule="evenodd" d="M135.831 3.00688C135.055 3.85027 134.111 4.29946 133 4.35447C134.111 4.40947 135.055 4.85867 135.831 5.71123C136.607 6.55462 136.996 7.56303 136.996 8.72727C136.996 7.95722 137.172 7.25134 137.525 6.59129C137.886 5.93124 138.372 5.39954 138.98 5.00535C139.598 4.60199 140.268 4.39114 141 4.35447C139.88 4.2903 138.936 3.85027 138.16 3.00688C137.384 2.16348 136.996 1.16425 136.996 0C136.996 1.16425 136.607 2.16348 135.831 3.00688ZM31 23.3545C32.1114 23.2995 33.0551 22.8503 33.8313 22.0069C34.6075 21.1635 34.9956 20.1642 34.9956 19C34.9956 20.1642 35.3837 21.1635 36.1599 22.0069C36.9361 22.8503 37.8798 23.2903 39 23.3545C38.2679 23.3911 37.5976 23.602 36.9802 24.0053C36.3716 24.3995 35.8864 24.9312 35.5248 25.5913C35.172 26.2513 34.9956 26.9572 34.9956 27.7273C34.9956 26.563 34.6075 25.5546 33.8313 24.7112C33.0551 23.8587 32.1114 23.4095 31 23.3545ZM0 36.3545C1.11136 36.2995 2.05513 35.8503 2.83131 35.0069C3.6075 34.1635 3.99559 33.1642 3.99559 32C3.99559 33.1642 4.38368 34.1635 5.15987 35.0069C5.93605 35.8503 6.87982 36.2903 8 36.3545C7.26792 36.3911 6.59757 36.602 5.98015 37.0053C5.37155 37.3995 4.88644 37.9312 4.52481 38.5913C4.172 39.2513 3.99559 39.9572 3.99559 40.7273C3.99559 39.563 3.6075 38.5546 2.83131 37.7112C2.05513 36.8587 1.11136 36.4095 0 36.3545ZM56.8313 24.0069C56.0551 24.8503 55.1114 25.2995 54 25.3545C55.1114 25.4095 56.0551 25.8587 56.8313 26.7112C57.6075 27.5546 57.9956 28.563 57.9956 29.7273C57.9956 28.9572 58.172 28.2513 58.5248 27.5913C58.8864 26.9312 59.3716 26.3995 59.9802 26.0053C60.5976 25.602 61.2679 25.3911 62 25.3545C60.8798 25.2903 59.9361 24.8503 59.1599 24.0069C58.3837 23.1635 57.9956 22.1642 57.9956 21C57.9956 22.1642 57.6075 23.1635 56.8313 24.0069ZM81 25.3545C82.1114 25.2995 83.0551 24.8503 83.8313 24.0069C84.6075 23.1635 84.9956 22.1642 84.9956 21C84.9956 22.1642 85.3837 23.1635 86.1599 24.0069C86.9361 24.8503 87.8798 25.2903 89 25.3545C88.2679 25.3911 87.5976 25.602 86.9802 26.0053C86.3716 26.3995 85.8864 26.9312 85.5248 27.5913C85.172 28.2513 84.9956 28.9572 84.9956 29.7273C84.9956 28.563 84.6075 27.5546 83.8313 26.7112C83.0551 25.8587 82.1114 25.4095 81 25.3545ZM136 36.3545C137.111 36.2995 138.055 35.8503 138.831 35.0069C139.607 34.1635 139.996 33.1642 139.996 32C139.996 33.1642 140.384 34.1635 141.16 35.0069C141.936 35.8503 142.88 36.2903 144 36.3545C143.268 36.3911 142.598 36.602 141.98 37.0053C141.372 37.3995 140.886 37.9312 140.525 38.5913C140.172 39.2513 139.996 39.9572 139.996 40.7273C139.996 39.563 139.607 38.5546 138.831 37.7112C138.055 36.8587 137.111 36.4095 136 36.3545ZM101.831 49.0069C101.055 49.8503 100.111 50.2995 99 50.3545C100.111 50.4095 101.055 50.8587 101.831 51.7112C102.607 52.5546 102.996 53.563 102.996 54.7273C102.996 53.9572 103.172 53.2513 103.525 52.5913C103.886 51.9312 104.372 51.3995 104.98 51.0053C105.598 50.602 106.268 50.3911 107 50.3545C105.88 50.2903 104.936 49.8503 104.16 49.0069C103.384 48.1635 102.996 47.1642 102.996 46C102.996 47.1642 102.607 48.1635 101.831 49.0069Z" fill="currentColor"/>
          </svg>
        </div>
        <div className="ts__cc">
          <div className="ts__sm">
            <div className="ts__m">
              <div className="ts__sp" /><div className="ts__sp" /><div className="ts__sp" />
            </div>
          </div>
        </div>
      </div>
    </label>
  </div>
)

// ─── Animated Loader ──────────────────────────────────────────────────────────

const CustomLoader = ({ text = "Sincronizando..." }: { text?: string }) => (
  <div className="flex flex-col items-center justify-center h-full gap-6">
    <svg viewBox="0 0 240 240" height="80" width="80">
      {[
        { r: 105, offset: -330, arr: "0 660", stroke: "stroke-blue-600 dark:stroke-blue-500",    anim: "ringA" },
        { r:  35, offset: -110, arr: "0 220", stroke: "stroke-emerald-500 dark:stroke-emerald-400", anim: "ringB" },
        { r:  70, offset:    0, arr: "0 440", stroke: "stroke-amber-500 dark:stroke-amber-400",   anim: "ringC", cx: 85 },
        { r:  70, offset:    0, arr: "0 440", stroke: "stroke-indigo-500 dark:stroke-indigo-400", anim: "ringD", cx: 155 },
      ].map((ring, i) => (
        <circle key={i} strokeLinecap="round" strokeDashoffset={ring.offset} strokeDasharray={ring.arr}
          strokeWidth="20" fill="none" r={ring.r} cy="120" cx={ring.cx ?? 120}
          className={`${ring.stroke}`}
          style={{ animation: `${ring.anim} 2s linear infinite`, stroke: 'currentColor' }} />
      ))}
    </svg>
    <span className="font-bold text-slate-400 dark:text-slate-500 text-xs animate-pulse tracking-widest uppercase">{text}</span>
    <style dangerouslySetInnerHTML={{ __html: `
      @keyframes ringA{from,4%{stroke-dasharray:0 660;stroke-width:20;stroke-dashoffset:-330}12%{stroke-dasharray:60 600;stroke-width:30;stroke-dashoffset:-335}32%{stroke-dasharray:60 600;stroke-width:30;stroke-dashoffset:-595}40%,54%{stroke-dasharray:0 660;stroke-width:20;stroke-dashoffset:-660}62%{stroke-dasharray:60 600;stroke-width:30;stroke-dashoffset:-665}82%{stroke-dasharray:60 600;stroke-width:30;stroke-dashoffset:-925}90%,to{stroke-dasharray:0 660;stroke-width:20;stroke-dashoffset:-990}}
      @keyframes ringB{from,12%{stroke-dasharray:0 220;stroke-width:20;stroke-dashoffset:-110}20%{stroke-dasharray:20 200;stroke-width:30;stroke-dashoffset:-115}40%{stroke-dasharray:20 200;stroke-width:30;stroke-dashoffset:-195}48%,62%{stroke-dasharray:0 220;stroke-width:20;stroke-dashoffset:-220}70%{stroke-dasharray:20 200;stroke-width:30;stroke-dashoffset:-225}90%{stroke-dasharray:20 200;stroke-width:30;stroke-dashoffset:-305}98%,to{stroke-dasharray:0 220;stroke-width:20;stroke-dashoffset:-330}}
      @keyframes ringC{from{stroke-dasharray:0 440;stroke-width:20;stroke-dashoffset:0}8%{stroke-dasharray:40 400;stroke-width:30;stroke-dashoffset:-5}28%{stroke-dasharray:40 400;stroke-width:30;stroke-dashoffset:-175}36%,58%{stroke-dasharray:0 440;stroke-width:20;stroke-dashoffset:-220}66%{stroke-dasharray:40 400;stroke-width:30;stroke-dashoffset:-225}86%{stroke-dasharray:40 400;stroke-width:30;stroke-dashoffset:-395}94%,to{stroke-dasharray:0 440;stroke-width:20;stroke-dashoffset:-440}}
      @keyframes ringD{from,8%{stroke-dasharray:0 440;stroke-width:20;stroke-dashoffset:0}16%{stroke-dasharray:40 400;stroke-width:30;stroke-dashoffset:-5}36%{stroke-dasharray:40 400;stroke-width:30;stroke-dashoffset:-175}44%,50%{stroke-dasharray:0 440;stroke-width:20;stroke-dashoffset:-220}58%{stroke-dasharray:40 400;stroke-width:30;stroke-dashoffset:-225}78%{stroke-dasharray:40 400;stroke-width:30;stroke-dashoffset:-395}86%,to{stroke-dasharray:0 440;stroke-width:20;stroke-dashoffset:-440}}
    ` }} />
  </div>
)

function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t) }, [])
  const text = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(time)
  return (
    <div className="flex flex-col items-end">
      <span className="text-2xl lg:text-3xl font-black text-slate-800 dark:text-white tracking-tighter tabular-nums">{text}</span>
      <span className="text-emerald-600 dark:text-emerald-400 font-bold tracking-widest uppercase text-[9px] mt-0.5">Hora Oficial Lima</span>
    </div>
  )
}

function TimeBadge({ tod }: { tod: TimeOfDay }) {
  const m = getTimeMeta(tod)
  const Icon = m.icon
  return (
    <div className={`inline-flex items-center gap-2 border px-2.5 py-1.5 rounded-xl text-xs ${m.chip}`}>
      <Icon size={14} />
      <span className="font-black uppercase tracking-wider hidden sm:inline">{m.title}</span>
    </div>
  )
}

// ─── Map marker tone config ────────────────────────────────────────────────────

function getMarkerTone(tipo: TipoMarcacion) {
  switch (tipo) {
    case 'ingreso_obra': return { bg: 'bg-blue-500',   label: 'Ingreso Obra',     icon: HardHat,          gradient: 'from-blue-500 to-cyan-400' }
    case 'salida_obra':  return { bg: 'bg-red-500',    label: 'Salida Obra',      icon: MapPin,           gradient: 'from-red-500 to-rose-400' }
    case 'externo':      return { bg: 'bg-purple-500', label: 'Externo',          icon: Store,            gradient: 'from-purple-500 to-fuchsia-400' }
    // FIX: Turno nocturno con color ámbar/naranja diferenciado
    case 'nocturno':     return { bg: 'bg-amber-500',  label: 'Turno Nocturno',   icon: Moon,             gradient: 'from-amber-500 to-orange-400' }
    default:             return { bg: 'bg-slate-500',  label: 'Nota GPS',         icon: MessageSquareText, gradient: 'from-slate-500 to-slate-400' }
  }
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [asistencias, setAsistencias]   = useState<any[]>([])
  const [loading, setLoading]           = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [fechaActual, setFechaActual]   = useState(new Date())

  // FIX: isDark empieza en false → modo CLARO por defecto
  const [isDark, setIsDark]           = useState(false)
  const [mounted, setMounted]         = useState(false)
  const [modoEdicion, setModoEdicion] = useState(false)
  const [vistaActual, setVistaActual] = useState<'lista' | 'mapa'>('lista')

  const mapRef = useRef<MapRef | null>(null)
  const [tod, setTod] = useState<TimeOfDay>('day')

  const [notaModal, setNotaModal]               = useState<any>(null)
  const [showExportar, setShowExportar]         = useState(false)
  const [showManual, setShowManual]             = useState(false)

  const [busqueda, setBusqueda]         = useState('')
  const [filtroArea, setFiltroArea]     = useState('TODAS')
  const [filtroEstado, setFiltroEstado] = useState('TODOS')

  const [exportDesde, setExportDesde]         = useState(format(new Date(), 'yyyy-MM-dd'))
  const [exportHasta, setExportHasta]         = useState(format(new Date(), 'yyyy-MM-dd'))
  const [exportando, setExportando]           = useState(false)
  const [tipoExport, setTipoExport]           = useState<'dia' | 'rango'>('dia')

  // FIX: Lee la preferencia guardada pero arranca en CLARO si no hay nada guardado
  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('ruag_theme')
    const prefersDark = saved === 'dark'
    setIsDark(prefersDark)
    if (prefersDark) document.documentElement.classList.add('dark')
    else             document.documentElement.classList.remove('dark')
  }, [])

  useEffect(() => {
    setTod(getTimeOfDay())
    const t = setInterval(() => setTod(getTimeOfDay()), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current.getMap()
    if (map?.isStyleLoaded()) aplicarEstiloMapa(map, tod)
  }, [tod])

  // Shortcut EDITAR para modo admin
  useEffect(() => {
    let buf = ''
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      buf = (buf + e.key.toUpperCase()).slice(-6)
      if (buf === 'EDITAR') {
        setModoEdicion(p => {
          const n = !p
          toast[n ? 'success' : 'error'](n ? 'MODO ADMIN ACTIVADO 🔓' : 'Modo Admin Bloqueado 🔒')
          return n
        })
        buf = ''
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const toggleTheme = () => {
    setIsDark(p => {
      const next = !p
      if (next) { document.documentElement.classList.add('dark');    localStorage.setItem('ruag_theme', 'dark') }
      else      { document.documentElement.classList.remove('dark'); localStorage.setItem('ruag_theme', 'light') }
      return next
    })
  }

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchData = async (fecha: Date) => {
    setLoading(true)
    const { data, error } = await supabase.from('registro_asistencias').select('*')
      .eq('fecha', format(fecha, 'yyyy-MM-dd')).order('hora_ingreso', { ascending: false })
    if (!error && data) setAsistencias(data)
    setLoading(false)
    if (isInitialLoad) setTimeout(() => setIsInitialLoad(false), 500)
  }

  useEffect(() => {
    fetchData(fechaActual)
    if (!isToday(fechaActual)) return

    const canal = supabase.channel('admin-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'registro_asistencias' }, p => {
        setAsistencias(prev => [p.new, ...prev])
        new Audio('/notification.mp3').play().catch(() => {})
        toast.success(`INGRESO: ${p.new.nombres_completos}`, { style: { background: '#10B981', color: 'white', border: 'none' } })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'registro_asistencias' }, p => {
        setAsistencias(prev => prev.map(a => a.id === p.new.id ? p.new : a))
      })
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [fechaActual])

  // ── Memos ────────────────────────────────────────────────────────────────────

  const areas = useMemo(() => {
    const s = new Set(asistencias.map(a => a.area).filter(Boolean))
    return ['TODAS', ...Array.from(s)].sort()
  }, [asistencias])

  const filtradas = useMemo(() =>
    asistencias.filter(a => {
      const q = busqueda.toLowerCase()
      return (
        (!q || a.nombres_completos?.toLowerCase().includes(q) || a.dni?.includes(q)) &&
        (filtroArea === 'TODAS'  || a.area           === filtroArea)  &&
        (filtroEstado === 'TODOS' || a.estado_ingreso === filtroEstado)
      )
    }), [asistencias, busqueda, filtroArea, filtroEstado])

  const conGPS = useMemo(() =>
    filtradas.map(a => {
      const d = extraerDetalleNota(a.notas)
      if (!d.contieneGPS || d.lat === null || d.lng === null) return null
      return { ...a, ...d }
    }).filter(Boolean) as any[]
  , [filtradas])

  const centroMapa = useMemo(() => {
    if (!conGPS.length) return { longitude: -77.0428, latitude: -12.0464 }
    return {
      longitude: conGPS.reduce((s, m) => s + m.lng, 0) / conGPS.length,
      latitude:  conGPS.reduce((s, m) => s + m.lat, 0) / conGPS.length,
    }
  }, [conGPS])

  useEffect(() => {
    if (vistaActual !== 'mapa' || !mapRef.current || !conGPS.length) return
    const map = mapRef.current.getMap()
    if (!map?.isStyleLoaded()) return

    if (conGPS.length === 1) {
      map.flyTo({ center: [conGPS[0].lng, conGPS[0].lat], zoom: 16, pitch: 65, bearing: -20, duration: 1200 })
      return
    }
    let [minLng, maxLng, minLat, maxLat] = [conGPS[0].lng, conGPS[0].lng, conGPS[0].lat, conGPS[0].lat]
    conGPS.forEach(m => { minLng = Math.min(minLng, m.lng); maxLng = Math.max(maxLng, m.lng); minLat = Math.min(minLat, m.lat); maxLat = Math.max(maxLat, m.lat) })
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 90, duration: 1200, pitch: 60, bearing: -20 })
  }, [vistaActual, conGPS])

  // ── Stats ────────────────────────────────────────────────────────────────────

  const puntuales  = asistencias.filter(a => a.estado_ingreso === 'PUNTUAL').length
  const tardanzas  = asistencias.filter(a => a.estado_ingreso === 'TARDANZA').length
  const salidas    = asistencias.filter(a => a.hora_salida).length
  const totalNotas = filtradas.filter(a => a.notas).length
  // FIX: contadores de mapa incluyendo nocturno
  const ingObra    = conGPS.filter(m => m.tipoMarcacion === 'ingreso_obra').length
  const salObra    = conGPS.filter(m => m.tipoMarcacion === 'salida_obra').length
  const externos   = conGPS.filter(m => m.tipoMarcacion === 'externo').length
  const nocturnos  = conGPS.filter(m => m.tipoMarcacion === 'nocturno').length

  // ── Excel ────────────────────────────────────────────────────────────────────

  const exportarExcel = (data: any[], nombre: string) => {
    if (!data.length) { toast.error('No hay registros para exportar'); return false }

    const hStyle = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 }, fill: { fgColor: { rgb: '1E293B' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: { bottom: { style: 'medium', color: { rgb: '000000' } } } }
    const sPuntual  = { font: { color: { rgb: '059669' }, bold: true }, alignment: { horizontal: 'center' } }
    const sTardanza = { font: { color: { rgb: 'DC2626' }, bold: true }, alignment: { horizontal: 'center' } }
    const sCenter   = { alignment: { horizontal: 'center' } }

    const ordena = (s: string) => {
      if (!s) return '-'
      const p = s.trim().split(' ')
      if (p.length >= 3) return `${p.slice(-2).join(' ')}, ${p.slice(0, -2).join(' ')}`
      if (p.length === 2) return `${p[1]}, ${p[0]}`
      return s
    }

    const rows: any[][] = [["FECHA","DNI","APELLIDOS Y NOMBRES","ÁREA","INGRESO","ESTADO","SALIDA","MOTIVO / NOTA","UBICACIÓN (MAPS)"]]
    data.forEach(r => {
      const d = extraerDetalleNota(r.notas)
      rows.push([
        r.fecha, r.dni, ordena(r.nombres_completos), r.area,
        new Date(r.hora_ingreso).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }),
        r.estado_ingreso,
        r.hora_salida ? new Date(r.hora_salida).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }) : 'Sin marcar',
        d.tieneNota ? d.textoLimpio : '-',
        d.contieneGPS && d.coordenadas ? `http://maps.google.com/?q=${d.coordenadas}` : '-'
      ])
    })

    const ws = XLSX.utils.aoa_to_sheet(rows)
    rows.forEach((_, R) => {
      for (let C = 0; C < 9; C++) {
        const cell = XLSX.utils.encode_cell({ r: R, c: C })
        if (!ws[cell]) continue
        if (R === 0) ws[cell].s = hStyle
        else {
          if (C === 5) ws[cell].s = ws[cell].v === 'PUNTUAL' ? sPuntual : sTardanza
          else if ([0,1,3,4,6].includes(C)) ws[cell].s = sCenter
          if (C === 8 && ws[cell].v !== '-') {
            ws[cell].l = { Target: ws[cell].v }
            ws[cell].v = '📍 Ver Mapa'
            ws[cell].s = { font: { color: { rgb: '2563EB' }, underline: true }, alignment: { horizontal: 'center' } }
          }
        }
      }
    })
    ws['!cols'] = [{ wpx: 80 },{ wpx: 80 },{ wpx: 240 },{ wpx: 130 },{ wpx: 80 },{ wpx: 90 },{ wpx: 80 },{ wpx: 280 },{ wpx: 120 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencias')
    XLSX.writeFile(wb, `${nombre}.xlsx`)
    return true
  }

  const ejecutarExport = async () => {
    try {
      if (tipoExport === 'dia') {
        const ok = exportarExcel(filtradas, `Reporte_RUAG_${format(fechaActual, 'yyyy-MM-dd')}`)
        if (ok) { toast.success('¡Reporte descargado!'); setShowExportar(false) }
      } else {
        if (!exportDesde || !exportHasta) { toast.error('Selecciona ambas fechas'); return }
        if (new Date(exportDesde) > new Date(exportHasta)) { toast.error("'Desde' no puede ser mayor que 'Hasta'"); return }
        setExportando(true)
        toast.loading('Descargando datos...', { id: 'dl' })
        const { data, error } = await supabase.from('registro_asistencias').select('*')
          .gte('fecha', exportDesde).lte('fecha', exportHasta).order('fecha').order('hora_ingreso')
        if (error) throw error
        toast.dismiss('dl')
        const ok = exportarExcel(data, `Reporte_RUAG_${exportDesde}_AL_${exportHasta}`)
        if (ok) { toast.success(`¡Reporte descargado! (${data.length} registros)`); setShowExportar(false) }
      }
    } catch (e) { toast.dismiss('dl'); toast.error('Error al generar Excel') }
    finally { setExportando(false) }
  }

  // ── Edit helpers ─────────────────────────────────────────────────────────────

  const actualizarHora = async (id: string, campo: 'hora_ingreso' | 'hora_salida', hora: string | null, fechaBase: string) => {
    try {
      let upd: any = {}
      if (hora === null) { upd[campo] = null }
      else {
        const [h, m] = hora.split(':').map(Number)
        const d = new Date(fechaBase); d.setHours(h, m, 0)
        upd[campo] = d.toISOString()
        if (campo === 'hora_ingreso') upd.estado_ingreso = (h < 9 || (h === 9 && m <= 5)) ? 'PUNTUAL' : 'TARDANZA'
      }
      const { error } = await supabase.from('registro_asistencias').update(upd).eq('id', id)
      if (error) throw error
      toast.success(hora === null ? 'Hora eliminada' : 'Registro actualizado')
      setAsistencias(prev => prev.map(a => a.id === id ? { ...a, ...upd } : a))
    } catch { toast.error('Error al actualizar') }
  }

  const borrarNota = async (id: string) => {
    try {
      const { error } = await supabase.from('registro_asistencias').update({ notas: null }).eq('id', id)
      if (error) throw error
      toast.success('Nota eliminada')
      setAsistencias(prev => prev.map(a => a.id === id ? { ...a, notas: null } : a))
    } catch { toast.error('Error al eliminar nota') }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!mounted || isInitialLoad) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <CustomLoader text="INICIANDO SISTEMA..." />
    </div>
  )

  return (
    <div className={`min-h-screen flex flex-col ${modoEdicion ? 'bg-blue-50/40 dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-950'} text-slate-900 dark:text-slate-100 transition-colors duration-300`}>
      <Toaster position="top-center" richColors />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white shadow-md ${modoEdicion ? 'bg-blue-600' : 'bg-gradient-to-br from-blue-600 to-indigo-600'}`}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-800 dark:text-white leading-tight">
                {modoEdicion ? 'MODO ADMIN' : 'RUAG Control'}
              </h1>
              <p className="text-[10px] sm:text-xs text-slate-400 font-medium hidden sm:block">Sistema de Asistencias</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-3">
              <TimeBadge tod={tod} />
              <LiveClock />
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 py-5 sm:py-8 flex flex-col xl:flex-row gap-5 sm:gap-8">

        {/* Sidebar */}
        <aside className="w-full xl:w-72 shrink-0 flex flex-col gap-4">

          {/* Mobile clock */}
          <div className="sm:hidden flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <TimeBadge tod={tod} />
            <LiveClock />
          </div>

          {/* Date picker */}
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Fecha de Consulta</p>
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
              <button onClick={() => setFechaActual(p => subDays(p, 1))} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500">
                <ChevronLeft size={18} />
              </button>
              <div className="relative flex-1 flex items-center justify-center gap-2 cursor-pointer py-1">
                <CalendarDays size={16} className="text-blue-600" />
                <span className="font-bold text-sm capitalize text-slate-700 dark:text-slate-200">
                  {isToday(fechaActual) ? 'Hoy' : format(fechaActual, "d MMM yyyy", { locale: es })}
                </span>
                <input type="date" className="absolute inset-0 opacity-0 cursor-pointer w-full"
                  value={format(fechaActual, 'yyyy-MM-dd')}
                  onChange={e => { if (e.target.value) { const [y,m,d] = e.target.value.split('-').map(Number); setFechaActual(new Date(y,m-1,d)) } }} />
              </div>
              <button onClick={() => setFechaActual(p => addDays(p, 1))} disabled={isToday(fechaActual)}
                className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500 disabled:opacity-20">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <SlidersHorizontal size={12} /> Filtros
            </p>
            <div className="space-y-3">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="DNI o Nombre..." value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all" />
              </div>
              {[
                { value: filtroArea,   onChange: setFiltroArea,   options: areas.map(a => ({ v: a, l: a === 'TODAS' ? 'Todas las Áreas' : a })) },
                { value: filtroEstado, onChange: setFiltroEstado, options: [{ v:'TODOS', l:'Todos los Estados' }, { v:'PUNTUAL', l:'Puntuales' }, { v:'TARDANZA', l:'Tardanzas' }] },
              ].map((f, i) => (
                <div key={i} className="relative">
                  <select value={f.value} onChange={e => f.onChange(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 pl-4 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium cursor-pointer appearance-none transition-all">
                    {f.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                  <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" />
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-2.5">
            <button onClick={() => setShowExportar(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/20 text-sm font-bold transition-all active:scale-95">
              <FileSpreadsheet size={16} /> Exportar Excel
            </button>
            {modoEdicion && (
              <button onClick={() => setShowManual(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all shadow-md shadow-blue-600/20 active:scale-95">
                <UserPlus size={16} /> Añadir Manual
              </button>
            )}
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0 gap-4 sm:gap-5">

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            {[
              { title: 'Ingresos', value: asistencias.length, icon: <Users size={18} />,       color: 'bg-blue-500' },
              { title: 'Puntuales', value: puntuales,          icon: <CheckCircle2 size={18} />, color: 'bg-emerald-500' },
              { title: 'Tardanzas', value: tardanzas,          icon: <AlertCircle size={18} />,  color: 'bg-red-500' },
              { title: 'Salidas',   value: salidas,            icon: <LogOut size={18} />,       color: 'bg-slate-500' },
              { title: 'Notas',     value: totalNotas,         icon: <MessageSquareText size={18} />, color: 'bg-amber-500' },
            ].map(s => (
              <div key={s.title}
                className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3 hover:-translate-y-0.5 hover:shadow-md transition-all duration-300">
                <div className={`w-10 h-10 rounded-xl ${s.color} text-white flex items-center justify-center shrink-0 shadow-inner`}>{s.icon}</div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{s.title}</p>
                  <p className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white leading-none mt-0.5">{s.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Table/Map card */}
          <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col overflow-hidden">

            {/* Card header */}
            <div className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-sm text-slate-600 dark:text-slate-400 uppercase tracking-widest">Registros</h3>
                <span className="text-xs font-bold text-slate-400 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-lg">
                  {filtradas.length}
                </span>
              </div>
              <div className="flex bg-slate-200/60 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto gap-1">
                {[
                  { id: 'lista', label: 'Lista',    icon: <AlignLeft size={13} /> },
                  { id: 'mapa',  label: 'Mapa 3D',  icon: <MapIcon size={13} /> },
                ].map(v => (
                  <button key={v.id} onClick={() => setVistaActual(v.id as any)}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${vistaActual === v.id ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Card body */}
            <div className="flex-1 overflow-hidden relative min-h-[400px]">
              {loading ? (
                <div className="flex h-full justify-center items-center py-12">
                  <CustomLoader text="Buscando..." />
                </div>
              ) : asistencias.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 py-20">
                  <CalendarDays size={48} className="mb-3 opacity-40" />
                  <p className="font-bold text-base">Esperando registros...</p>
                  <p className="text-sm mt-1 opacity-70">No hay asistencias en esta fecha</p>
                </div>
              ) : filtradas.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 py-20">
                  <Search size={40} className="mb-3 opacity-40" />
                  <p className="font-bold text-base">Sin coincidencias</p>
                </div>
              ) : vistaActual === 'lista' ? (
                <div className="h-full overflow-y-auto p-3">
                  <motion.div
                    initial="hidden" animate="show"
                    variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } }}
                    className="flex flex-col gap-2 pb-4"
                  >
                    <AnimatePresence>
                      {filtradas.map((a, i) => (
                        <FotocheckRow key={a.id} data={a} index={i} modoEdicion={modoEdicion}
                          onActualizar={actualizarHora}
                          onAbrirNota={n => setNotaModal(n)}
                          onBorrarNota={borrarNota} />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                </div>
              ) : (
                /* MAP VIEW */
                <div className="w-full h-full min-h-[400px]">
                  {process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? (
                    <Map ref={mapRef}
                      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
                      initialViewState={{ longitude: centroMapa.longitude, latitude: centroMapa.latitude, zoom: 14.5, pitch: 65, bearing: -20 }}
                      mapStyle="mapbox://styles/mapbox/standard"
                      style={{ width: '100%', height: '100%' }}
                      onLoad={() => { const m = mapRef.current?.getMap(); if (m) aplicarEstiloMapa(m, tod) }}
                    >
                      {conGPS.map(m => {
                        const tone = getMarkerTone(m.tipoMarcacion)
                        const MIcon = tone.icon
                        const ring  = m.estado_ingreso === 'PUNTUAL' ? 'ring-[5px] ring-emerald-400/35' : 'ring-[5px] ring-red-400/35'
                        const chip  = m.estado_ingreso === 'PUNTUAL' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        const hora  = m.tipoMarcacion === 'ingreso_obra' || m.tipoMarcacion === 'nocturno'
                          ? format(new Date(m.hora_ingreso), 'HH:mm')
                          : m.hora_salida ? format(new Date(m.hora_salida), 'HH:mm') : '--:--'

                        return (
                          <Marker key={m.id} latitude={m.lat} longitude={m.lng} anchor="bottom">
                            <div className="relative flex flex-col items-center group cursor-pointer">
                              {/* Tooltip card */}
                              <div className="pointer-events-none absolute left-1/2 bottom-full mb-4 -translate-x-1/2 opacity-0 scale-95 translate-y-2 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0 transition-all duration-300 z-30 w-[300px]">
                                <div className="rounded-2xl border border-white/70 bg-white/95 backdrop-blur-xl shadow-xl overflow-hidden">
                                  <div className={`h-1 w-full bg-gradient-to-r ${tone.gradient}`} />
                                  <div className="p-3">
                                    <div className="flex items-start gap-2.5">
                                      <div className={`shrink-0 w-12 h-12 rounded-xl overflow-hidden bg-slate-100 border border-white shadow ${ring}`}>
                                        {m.foto_url ? <img src={m.foto_url} alt="" className="w-full h-full object-cover" /> :
                                          <div className="w-full h-full flex items-center justify-center font-black text-sm text-slate-500">{getInitials(m.nombres_completos)}</div>}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-1">
                                          <p className="font-black text-sm text-slate-900 truncate uppercase">{m.nombres_completos}</p>
                                          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black ${chip}`}>{m.estado_ingreso}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 truncate">{m.area} · {m.dni}</p>
                                        <div className="flex items-center gap-1.5 mt-1.5">
                                          <span className={`px-2 py-0.5 rounded text-[9px] font-black text-white ${tone.bg}`}>{tone.label}</span>
                                          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600">{hora}</span>
                                        </div>
                                      </div>
                                    </div>
                                    {m.textoLimpio && (
                                      <p className="mt-2 text-[11px] text-slate-600 leading-relaxed bg-slate-50 rounded-xl p-2 line-clamp-3">
                                        {m.textoLimpio}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {/* Marker pin */}
                              <div className={`relative w-12 h-12 rounded-full overflow-hidden border-3 border-white shadow-xl ${ring}`}>
                                {m.foto_url ? <img src={m.foto_url} alt="" className="w-full h-full object-cover" /> :
                                  <div className="w-full h-full flex items-center justify-center font-black text-sm bg-slate-100 text-slate-600">{getInitials(m.nombres_completos)}</div>}
                                <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center ${tone.bg}`}>
                                  <MIcon size={10} className="text-white" />
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
                      <MapIcon size={40} className="mb-3 opacity-40" />
                      <p className="font-bold">Falta el token de Mapbox</p>
                      <p className="text-sm mt-1">Agrega NEXT_PUBLIC_MAPBOX_TOKEN en tu .env.local</p>
                    </div>
                  )}

                  {/* Map legend overlay */}
                  <div className="absolute top-3 left-3 right-16 flex flex-col gap-2 pointer-events-none">
                    <div className="pointer-events-auto bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg w-fit">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Leyenda</p>
                      {[
                        { color: 'bg-blue-500',   label: 'Ingreso Obra' },
                        { color: 'bg-red-500',    label: 'Salida Obra' },
                        { color: 'bg-purple-500', label: 'Externo' },
                        // FIX: Nocturno en la leyenda del mapa
                        { color: 'bg-amber-500',  label: 'Nocturno' },
                        { color: 'bg-slate-500',  label: 'Nota GPS' },
                      ].map(l => (
                        <div key={l.label} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          <div className={`w-2.5 h-2.5 rounded-full ${l.color}`} />{l.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Map stats */}
                  <div className="absolute bottom-3 left-3 right-3 pointer-events-none">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        { t: 'Obras in',   v: ingObra,  tone: 'blue'    },
                        { t: 'Obras out',  v: salObra,  tone: 'red'     },
                        { t: 'Externos',   v: externos, tone: 'purple'  },
                        // FIX: Counter de nocturnos en el mapa
                        { t: 'Nocturnos',  v: nocturnos, tone: 'amber'  },
                        { t: 'Puntuales',  v: filtradas.filter(a => a.estado_ingreso === 'PUNTUAL').length, tone: 'emerald' },
                      ].map(s => {
                        const colors: Record<string, string> = {
                          blue: 'bg-blue-50/90 text-blue-700 border-blue-200', red: 'bg-red-50/90 text-red-700 border-red-200',
                          purple: 'bg-purple-50/90 text-purple-700 border-purple-200', amber: 'bg-amber-50/90 text-amber-700 border-amber-200',
                          emerald: 'bg-emerald-50/90 text-emerald-700 border-emerald-200'
                        }
                        return (
                          <div key={s.t} className={`pointer-events-auto backdrop-blur-sm border rounded-xl px-3 py-2 ${colors[s.tone]}`}>
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-70 truncate">{s.t}</p>
                            <p className="text-lg font-black leading-none mt-0.5">{s.v}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {/* Export */}
      <AnimatePresence>
        {showExportar && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowExportar(false)}>
            <motion.div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700"
              initial={{ scale: 0.93, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93, y: 12 }}
              transition={{ type: 'spring', stiffness: 450, damping: 30 }}
              onClick={e => e.stopPropagation()}>
              <div className="bg-emerald-500 h-1" />
              <div className="p-6">
                <button onClick={() => setShowExportar(false)} className="absolute top-5 right-5 p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X size={18} /></button>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600"><FileSpreadsheet size={18} /></div>
                  <h3 className="font-black text-lg text-slate-900 dark:text-white">Exportar Excel</h3>
                </div>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-5">
                  {[{ v: 'dia', l: 'Día Actual' }, { v: 'rango', l: 'Por Rango' }].map(t => (
                    <button key={t.v} onClick={() => setTipoExport(t.v as any)}
                      className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${tipoExport === t.v ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm' : 'text-slate-500'}`}>
                      {t.l}
                    </button>
                  ))}
                </div>
                {tipoExport === 'dia' ? (
                  <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center text-sm text-slate-600 dark:text-slate-400">
                    Se exportarán <strong className="text-emerald-600">{filtradas.length}</strong> registros del día actual.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {[{ label: 'Desde', value: exportDesde, onChange: setExportDesde }, { label: 'Hasta', value: exportHasta, onChange: setExportHasta }].map(f => (
                      <div key={f.label}>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{f.label}</label>
                        <input type="date" value={f.value} onChange={e => f.onChange(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 px-3 py-2.5 rounded-xl outline-none focus:border-emerald-500 text-sm" />
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={ejecutarExport} disabled={exportando}
                  className="w-full mt-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl flex justify-center items-center gap-2 transition-all active:scale-95 disabled:opacity-60">
                  {exportando ? <Loader2 className="animate-spin" size={18} /> : <><Download size={16} /> Descargar Excel</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual register */}
      {showManual && (
        <ModalManual onClose={() => setShowManual(false)}
          fechaBase={format(fechaActual, 'yyyy-MM-dd')}
          onSuccess={r => { if (isToday(fechaActual) || r.fecha === format(fechaActual, 'yyyy-MM-dd')) setAsistencias(p => [r, ...p]); setShowManual(false) }} />
      )}

      {/* Nota detail */}
      <AnimatePresence>
        {notaModal && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setNotaModal(null)}>
            <motion.div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700"
              initial={{ scale: 0.93, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93, y: 12 }}
              transition={{ type: 'spring', stiffness: 450, damping: 30 }}
              onClick={e => e.stopPropagation()}>
              {(() => {
                const colors: Record<TipoMarcacion, string> = {
                  ingreso_obra: 'bg-blue-500', salida_obra: 'bg-red-500', externo: 'bg-purple-500',
                  nocturno: 'bg-amber-500', nota: 'bg-slate-500', ninguna: 'bg-slate-300'
                }
                const iconMap: Record<TipoMarcacion, React.ReactNode> = {
                  ingreso_obra: <HardHat size={24} className="text-blue-500" />,
                  salida_obra:  <MapIcon size={24} className="text-red-500" />,
                  externo:      <Store size={24} className="text-purple-500" />,
                  nocturno:     <Moon size={24} className="text-amber-500" />,
                  nota:         <MessageSquareText size={24} className="text-slate-500" />,
                  ninguna:      <MessageSquareText size={24} className="text-slate-500" />,
                }
                const labels: Record<TipoMarcacion, string> = {
                  ingreso_obra: 'Ingreso en Obra', salida_obra: 'Salida de Obra', externo: 'Marcación Externa',
                  nocturno: 'Turno Nocturno', nota: 'Nota', ninguna: 'Sin tipo'
                }
                return (
                  <>
                    <div className={`${colors[notaModal.tipoObra as TipoMarcacion] ?? 'bg-slate-400'} h-1.5 w-full`} />
                    <div className="p-6 relative">
                      <button onClick={() => setNotaModal(null)} className="absolute top-4 right-4 p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X size={18} /></button>
                      <div className="flex items-center gap-3 mb-4">
                        {iconMap[notaModal.tipoObra as TipoMarcacion]}
                        <h3 className="font-black text-lg text-slate-900 dark:text-white">{labels[notaModal.tipoObra as TipoMarcacion]}</h3>
                      </div>
                      <p className="text-sm font-bold text-slate-500 mb-1">{notaModal.nombre}</p>
                      <p className="text-xs text-slate-400 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">{notaModal.hora}</p>
                      {notaModal.estadoIngreso && (
                        <span className={`inline-flex mb-4 px-3 py-1 rounded-lg text-xs font-black ${notaModal.estadoIngreso === 'PUNTUAL' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {notaModal.estadoIngreso}
                        </span>
                      )}
                      <div className="bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {notaModal.nota}
                      </div>
                      <button onClick={() => setNotaModal(null)}
                        className="w-full mt-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3 rounded-xl active:scale-95 transition-all">
                        Cerrar
                      </button>
                    </div>
                  </>
                )
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        .marquee-container{overflow:hidden;white-space:nowrap;mask-image:linear-gradient(to right,black 85%,transparent 100%)}
        .marquee-text{display:inline-block;animation:marquee 8s linear infinite}
        .marquee-text:hover{animation-play-state:paused}
        @keyframes marquee{0%{transform:translateX(0)}15%{transform:translateX(0)}100%{transform:translateX(calc(-100% + 150px))}}
      `}} />
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ModalManual({ onClose, fechaBase, onSuccess }: { onClose: () => void; fechaBase: string; onSuccess: (d: any) => void }) {
  const [nombres, setNombres] = useState('')
  const [dni, setDni]         = useState('')
  const [area, setArea]       = useState('')
  const [hora, setHora]       = useState('08:00')
  const [saving, setSaving]   = useState(false)

  const AREAS = ["Operaciones/Proyectos","Presupuesto","Contabilidad","Ssoma","Rrhh","Logística","Finanzas","Área comercial","Software","Mantenimiento","Almacén"]

  const save = async () => {
    if (!nombres || dni.length !== 8 || !area || !hora) { toast.error('Llena todos los campos'); return }
    setSaving(true)
    try {
      const [h, m] = hora.split(':').map(Number)
      const d = new Date(fechaBase); d.setHours(h, m, 0)
      const isPuntual = h < 9 || (h === 9 && m <= 5)
      const row = { dni, nombres_completos: nombres.toUpperCase(), area, fecha: fechaBase, hora_ingreso: d.toISOString(), estado_ingreso: isPuntual ? 'PUNTUAL' : 'TARDANZA', foto_url: '' }
      const { data, error } = await supabase.from('registro_asistencias').insert(row).select().single()
      if (error) throw error
      toast.success('Asistencia registrada')
      onSuccess(data)
    } catch (e: any) { toast.error(`Error: ${e.message}`); setSaving(false) }
  }

  return (
    <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700"
        initial={{ scale: 0.93, y: 12 }} animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 450, damping: 30 }}>
        <div className="bg-blue-600 h-1" />
        <div className="p-6 relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"><X size={18} /></button>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600"><UserPlus size={18} /></div>
            <h3 className="font-black text-lg text-slate-900 dark:text-white">Registro Manual</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Nombres y Apellidos</label>
              <input type="text" value={nombres} onChange={e => setNombres(e.target.value)} placeholder="Juan Pérez García"
                className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl outline-none focus:border-blue-500 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">DNI</label>
                <input type="number" value={dni} onChange={e => { if (e.target.value.length <= 8) setDni(e.target.value) }} placeholder="12345678"
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl outline-none focus:border-blue-500 text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Hora Ingreso</label>
                <input type="time" value={hora} onChange={e => setHora(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl outline-none focus:border-blue-500 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Área</label>
              <select value={area} onChange={e => setArea(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl outline-none focus:border-blue-500 text-sm cursor-pointer appearance-none">
                <option value="" disabled>Seleccionar...</option>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <button onClick={save} disabled={saving}
            className="w-full mt-5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl flex justify-center items-center gap-2 transition-all active:scale-95 disabled:opacity-60">
            {saving ? <Loader2 className="animate-spin" size={18} /> : 'Registrar Asistencia'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function FotocheckRow({ data, index, modoEdicion, onActualizar, onAbrirNota, onBorrarNota }: {
  data: any; index: number; modoEdicion: boolean
  onActualizar: (id: string, campo: 'hora_ingreso' | 'hora_salida', hora: string | null, fechaBase: string) => void
  onAbrirNota: (n: any) => void
  onBorrarNota: (id: string) => void
}) {
  const isPuntual = data.estado_ingreso === 'PUNTUAL'
  const nota = extraerDetalleNota(data.notas)
  const tone = getMarkerTone(nota.tipoMarcacion)
  const NIcon = tone.icon

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, x: -16 }, show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } } }}
      whileHover={{ scale: 1.003 }}
      className={`flex items-center justify-between p-3 sm:p-4 rounded-xl bg-white dark:bg-slate-900 border transition-all hover:shadow-md
        ${index === 0 && isToday(new Date(data.hora_ingreso)) ? 'border-blue-300 ring-1 ring-blue-100 shadow-sm' : 'border-slate-200 dark:border-slate-800'}`}
    >
      {/* Avatar + info */}
      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 pr-3">
        <div className="relative shrink-0">
          <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {data.foto_url ? <img src={data.foto_url} alt="" className="w-full h-full object-cover" /> :
              <div className="w-full h-full flex items-center justify-center font-black text-slate-400 text-sm">{getInitials(data.nombres_completos)}</div>}
          </div>
          <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 ${isPuntual ? 'bg-emerald-500' : 'bg-red-500'}`} />
        </div>
        <div className="min-w-0">
          <div className="marquee-container max-w-[140px] sm:max-w-[220px]">
            <h4 className="marquee-text font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base uppercase tracking-tight">{data.nombres_completos}</h4>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            <span className="text-xs font-mono text-slate-400">{data.dni}</span>
            <span className="text-slate-200 dark:text-slate-700">·</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase hidden sm:inline">{data.area}</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${isPuntual ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300'}`}>
              {data.estado_ingreso}
            </span>
          </div>
        </div>
      </div>

      {/* Times + actions */}
      <div className="flex items-center gap-3 sm:gap-6 shrink-0">
        {/* Ingreso */}
        <div className="flex flex-col items-end">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Ingreso</span>
          {modoEdicion ? (
            <input type="time" defaultValue={format(new Date(data.hora_ingreso), 'HH:mm')}
              className="bg-transparent border-b border-blue-500 text-sm font-black text-blue-600 outline-none w-16 text-right"
              onBlur={e => { if (e.target.value !== format(new Date(data.hora_ingreso), 'HH:mm')) onActualizar(data.id, 'hora_ingreso', e.target.value, data.hora_ingreso) }} />
          ) : (
            <span className={`font-black text-base ${isPuntual ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {format(new Date(data.hora_ingreso), 'HH:mm')}
            </span>
          )}
        </div>

        <div className="w-px h-7 bg-slate-200 dark:bg-slate-700 hidden sm:block" />

        {/* Salida */}
        <div className="flex flex-col items-end min-w-[60px]">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Salida</span>
          {modoEdicion ? (
            <div className="flex items-center gap-1">
              <input type="time" defaultValue={data.hora_salida ? format(new Date(data.hora_salida), 'HH:mm') : ''}
                className="bg-transparent border-b border-blue-500 text-sm font-bold text-slate-700 dark:text-slate-300 outline-none w-16 text-right"
                onBlur={e => { const c = data.hora_salida ? format(new Date(data.hora_salida), 'HH:mm') : ''; if (e.target.value && e.target.value !== c) onActualizar(data.id, 'hora_salida', e.target.value, data.hora_salida || data.hora_ingreso) }} />
              {data.hora_salida && <button onClick={() => onActualizar(data.id, 'hora_salida', null, data.hora_ingreso)} className="text-red-400 hover:text-red-600 p-0.5"><X size={12} /></button>}
            </div>
          ) : data.hora_salida ? (
            <span className="font-bold text-base text-slate-700 dark:text-slate-300">{format(new Date(data.hora_salida), 'HH:mm')}</span>
          ) : (
            <span className="text-[10px] font-bold text-slate-400 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md">--:--</span>
          )}
        </div>

        {/* Nota icon */}
        <div className="flex items-center gap-1">
          {nota.tieneNota && (
            <>
              <button
                onClick={() => onAbrirNota({ nombre: data.nombres_completos, nota: nota.textoLimpio, hora: format(new Date(data.hora_ingreso), 'HH:mm'), tipoObra: nota.tipoMarcacion, coordenadas: nota.coordenadas, estadoIngreso: data.estado_ingreso })}
                className={`p-1.5 rounded-full border transition-all hover:scale-110 ${
                  nota.tipoMarcacion === 'ingreso_obra' ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/30'
                  : nota.tipoMarcacion === 'salida_obra' ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:border-red-500/30'
                  : nota.tipoMarcacion === 'externo' ? 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-500/10 dark:border-purple-500/30'
                  // FIX: Icono de luna para turno nocturno
                  : nota.tipoMarcacion === 'nocturno' ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30'
                  : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:border-slate-500/30'}`}
                title={tone.label}
              >
                <NIcon size={15} />
              </button>
              {modoEdicion && (
                <button onClick={() => onBorrarNota(data.id)}
                  className="p-1.5 rounded-full border border-red-200 dark:border-red-500/30 text-red-500 hover:bg-red-50 dark:bg-red-500/10 hover:scale-110 transition-all">
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}