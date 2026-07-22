'use client'

import * as XLSX from 'xlsx-js-style'
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/utils/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { format, isToday, subDays, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'
import { loadHiddenAbsenceKeys, loadHolidayKeys } from '@/utils/attendance'
import {
  CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle,
  LogOut, UserPlus, Loader2, Search, FileSpreadsheet, SlidersHorizontal,
  Users, ShieldCheck, AlignLeft, MapPin, Map as MapIcon, Download,
  HardHat, Trash2, MessageSquareText, X, Sunrise, Sun, Sunset, MoonStar,
  Store, Moon, RefreshCw, Activity, BarChart3, TrendingUp, Trophy, Stethoscope,
  Cake, Gift, PartyPopper, Laptop
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import LottiePlayer from '@/components/LottiePlayer'
import CalendarPicker from '@/components/CalendarPicker'
import { countryOf, timezoneOf, DEFAULT_COUNTRY } from '@/utils/countries'
import CountryFlag from '@/components/CountryFlag'
import MapGL, {
  Marker, NavigationControl, FullscreenControl, GeolocateControl, type MapRef
} from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night'
type BirthdayItem = { dni: string; nombre: string; area: string; foto: string; fecha: string; daysUntil: number; turningAge: number | null; isToday: boolean; label: string }
type TipoMarcacion = 'ninguna' | 'ingreso_obra' | 'salida_obra' | 'externo' | 'nota' | 'nocturno' | 'remoto'
type EstadoAsistencia = 'PUNTUAL' | 'TARDANZA' | 'INASISTENCIA' | 'DESCANSO MEDICO' | 'VACACIONES' | 'FERIADO'

type AsistenciaRecord = {
  id: string
  dni: string
  fecha: string
  hora_ingreso: string
  hora_salida: string | null
  estado_ingreso: EstadoAsistencia | string
  nombres_completos: string
  area: string
  foto_url?: string | null
  notas?: string | null
  _syntheticInasistencia?: boolean
  _entroAyer?: boolean
  _saleHoy?: boolean
  [key: string]: any
}

type TrendPoint = {
  fecha: string
  puntuales: number
  tardanzas: number
  inasistencias: number
  total: number
}

type AreaMetric = {
  area: string
  puntuales: number
  tardanzas: number
  inasistencias: number
  total: number
}

type MetricasData = {
  resumenDia: {
    total: number
    puntuales: number
    tardanzas: number
    inasistencias: number
    conSalida: number
    reingresos: number
  }
  trend: TrendPoint[]
  areaBreakdown: AreaMetric[]
  bestDay: TrendPoint | null
  worstDay: TrendPoint | null
  rangeLabel: string
}

// Oficina principal (mismas coordenadas que valida la app del trabajador antes de
// permitir el escaneo del QR, radio 50 m).
const OFICINA_LAT = -12.114859
const OFICINA_LON = -77.026540

const HIDDEN_ABSENCE_TYPE = 'INASISTENCIA_OCULTA'
const LIMA_TZ = 'America/Lima'
const WORKING_DAYS = new Set([1, 2, 3, 4, 5])
const INACTIVE_AREA_PREFIX = '__INACTIVO__|'
const STATUS_PRIORITY: Record<string, number> = { PUNTUAL: 0, TARDANZA: 1, 'DESCANSO MEDICO': 2, INASISTENCIA: 3 }

/**
 * Hora de un instante ISO renderizada en el reloj del país del trabajador.
 * Por defecto Perú, así que los registros de Perú se ven exactamente igual que antes.
 */
function horaEnPais(iso: string, pais?: string | null): string {
  try {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: timezoneOf(pais),
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso))
  } catch {
    return '--:--'
  }
}

const EMPRESA_TABS: { id: string; label: string; colors: [string, string]; border: string }[] = [
  { id: 'TODAS', label: 'Todas',  colors: ['#0F172A', '#334155'], border: 'rgba(100,116,139,0.35)' },
  { id: 'RUAG',  label: 'RUAG',   colors: ['#047857', '#22C55E'], border: 'rgba(5,150,105,0.35)' },
  { id: 'ARUG',  label: 'ARUG',   colors: ['#1D4ED8', '#38BDF8'], border: 'rgba(37,99,235,0.35)' },
  { id: 'CG',    label: 'CG',     colors: ['#B45309', '#FBBF24'], border: 'rgba(245,158,11,0.35)' },
  { id: 'SIN',   label: 'Sin empresa', colors: ['#64748B', '#94A3B8'], border: 'rgba(100,116,139,0.3)' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLimaHour() {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: LIMA_TZ, hour: '2-digit', hour12: false })
    .formatToParts(new Date()).find(p => p.type === 'hour')?.value ?? '12')
}

function isInactiveArea(area?: string | null) {
  return String(area ?? '').startsWith(INACTIVE_AREA_PREFIX)
}

function getVisibleArea(area?: string | null) {
  return isInactiveArea(area) ? String(area).slice(INACTIVE_AREA_PREFIX.length) : String(area ?? '')
}

function makeInactiveArea(area?: string | null) {
  return `${INACTIVE_AREA_PREFIX}${getVisibleArea(area) || 'SIN AREA'}`
}

function getLimaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LIMA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'

  return `${year}-${month}-${day}`
}

const MESES_CUMPLE = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function computeBirthday(fecha: string): { daysUntil: number; turningAge: number | null; isToday: boolean; label: string } | null {
  const parts = String(fecha).slice(0, 10).split('-').map(Number)
  if (parts.length < 3 || !parts[1] || !parts[2]) return null
  const [year, month, day] = parts
  const todayKey = getLimaDateKey()
  const [ty, tm, td] = todayKey.split('-').map(Number)
  const todayMid = new Date(ty, tm - 1, td)
  const safeDay = (m: number, d: number, y: number) => Math.min(d, new Date(y, m, 0).getDate())
  let next = new Date(ty, month - 1, safeDay(month, day, ty))
  if (next < todayMid) next = new Date(ty + 1, month - 1, safeDay(month, day, ty + 1))
  const daysUntil = Math.round((next.getTime() - todayMid.getTime()) / 86400000)
  const turningAge = year > 1900 ? next.getFullYear() - year : null
  const label = `${day} de ${MESES_CUMPLE[month - 1] ?? ''}`
  return { daysUntil, turningAge, isToday: daysUntil === 0, label }
}

function getWeekday(dateKey: string) {
  return new Date(`${dateKey}T12:00:00-05:00`).getUTCDay()
}

function buildSyntheticInasistencia(fechaKey: string, perfil: any): AsistenciaRecord {
  const [year, month, day] = fechaKey.split('-').map(Number)

  return {
    id: `synthetic-inasistencia-${fechaKey}-${perfil.dni}`,
    dni: perfil.dni,
    fecha: fechaKey,
    hora_ingreso: new Date(Date.UTC(year, month - 1, day, 28, 59, 0, 0)).toISOString(),
    hora_salida: null,
    estado_ingreso: 'INASISTENCIA',
    nombres_completos: perfil.nombres_completos,
    area: getVisibleArea(perfil.area),
    foto_url: perfil.foto_url ?? '',
    notas: 'Marcado automaticamente por el sistema - Sin registro en el dia',
    _syntheticInasistencia: true,
  }
}

function buildSyntheticVacaciones(fechaKey: string, perfil: any, comentario?: string | null): AsistenciaRecord {
  const [year, month, day] = fechaKey.split('-').map(Number)
  return {
    id: `synthetic-vacaciones-${fechaKey}-${perfil.dni}`,
    dni: perfil.dni,
    fecha: fechaKey,
    hora_ingreso: new Date(Date.UTC(year, month - 1, day, 28, 0, 0, 0)).toISOString(),
    hora_salida: null,
    estado_ingreso: 'VACACIONES',
    nombres_completos: perfil.nombres_completos,
    area: getVisibleArea(perfil.area),
    foto_url: perfil.foto_url ?? '',
    notas: comentario ? `Vacaciones aprobadas - ${comentario}` : 'Vacaciones aprobadas por RRHH',
    _syntheticInasistencia: false,
    _syntheticVacaciones: true,
  }
}

function buildSyntheticFeriado(fechaKey: string, perfil: any, motivo?: string | null): AsistenciaRecord {
  const [year, month, day] = fechaKey.split('-').map(Number)
  return {
    id: `synthetic-feriado-${fechaKey}-${perfil.dni}`,
    dni: perfil.dni,
    fecha: fechaKey,
    hora_ingreso: new Date(Date.UTC(year, month - 1, day, 28, 45, 0, 0)).toISOString(),
    hora_salida: null,
    estado_ingreso: 'FERIADO',
    nombres_completos: perfil.nombres_completos,
    area: getVisibleArea(perfil.area),
    foto_url: perfil.foto_url ?? '',
    notas: motivo ? `Feriado: ${motivo}` : 'Día feriado · No laborable',
    _syntheticInasistencia: false,
    _syntheticFeriado: true,
  }
}

function buildSyntheticDescansoMedico(fechaKey: string, perfil: any, comentario?: string | null): AsistenciaRecord {
  const [year, month, day] = fechaKey.split('-').map(Number)
  return {
    id: `synthetic-descanso-${fechaKey}-${perfil.dni}`,
    dni: perfil.dni,
    fecha: fechaKey,
    hora_ingreso: new Date(Date.UTC(year, month - 1, day, 28, 30, 0, 0)).toISOString(),
    hora_salida: null,
    estado_ingreso: 'DESCANSO MEDICO',
    nombres_completos: perfil.nombres_completos,
    area: getVisibleArea(perfil.area),
    foto_url: perfil.foto_url ?? '',
    notas: comentario ? `Descanso médico aprobado - ${comentario}` : 'Descanso médico aprobado',
    _syntheticInasistencia: false,
    _syntheticDescanso: true,
  }
}

async function hideAbsence(record: AsistenciaRecord) {
  const response = await fetch('/api/inasistencias-ocultas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fecha: record.fecha,
      dni: record.dni,
      nombre: record.nombres_completos,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'No se pudo ocultar la inasistencia')
}

function dateKeysBetween(startKey: string, endKey: string) {
  const keys: string[] = []
  let cursor = new Date(`${startKey}T12:00:00.000Z`)
  const end = new Date(`${endKey}T12:00:00.000Z`)

  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return keys
}

function sortRecordsByStatus(records: AsistenciaRecord[]) {
  return [...records].sort((a, b) => {
    const byState = (STATUS_PRIORITY[a.estado_ingreso] ?? 9) - (STATUS_PRIORITY[b.estado_ingreso] ?? 9)
    if (byState !== 0) return byState
    return new Date(b.hora_ingreso).getTime() - new Date(a.hora_ingreso).getTime()
  })
}

function sortRecordsForRange(records: AsistenciaRecord[]) {
  return [...records].sort((a, b) => {
    const byDate = String(a.fecha).localeCompare(String(b.fecha))
    if (byDate !== 0) return byDate
    const byState = (STATUS_PRIORITY[a.estado_ingreso] ?? 9) - (STATUS_PRIORITY[b.estado_ingreso] ?? 9)
    if (byState !== 0) return byState
    return new Date(a.hora_ingreso).getTime() - new Date(b.hora_ingreso).getTime()
  })
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
  const mins = calcMinutos(ingreso, salida)
  if (mins <= 0) return '—'
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function calcMinutos(ingreso: string, salida: string | null): number {
  if (!salida) return 0
  try {
    const mins = Math.floor((new Date(salida).getTime() - new Date(ingreso).getTime()) / 60000)
    return mins > 0 ? mins : 0
  } catch { return 0 }
}

function formatMinutos(total: number) {
  if (total <= 0) return '0h 0m'
  const h = Math.floor(total / 60), m = total % 60
  return `${h}h ${m}m`
}

function weekRangeFor(date: Date) {
  const start = new Date(date)
  const day = start.getDay()
  const diff = day === 0 ? -6 : 1 - day
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() + diff)
  const end = addDays(start, 6)
  return { from: format(start, 'yyyy-MM-dd'), to: format(end, 'yyyy-MM-dd') }
}

function formatRecordTime(record: AsistenciaRecord, value?: string | null) {
  if (record.estado_ingreso === 'INASISTENCIA') return '—'
  if (record.estado_ingreso === 'DESCANSO MEDICO') return 'DESCANSO'
  return value ? new Date(value).toLocaleTimeString('es-PE', { timeZone: LIMA_TZ, hour: '2-digit', minute: '2-digit' }) : '—'
}

// ─── Nota parser ──────────────────────────────────────────────────────────────

function toIsoOrNull(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function decorateForVisibleDate(record: any, fecha: Date) {
  const fechaStr = format(fecha, 'yyyy-MM-dd')
  const prevStr = format(subDays(fecha, 1), 'yyyy-MM-dd')
  const nextStr = format(addDays(fecha, 1), 'yyyy-MM-dd')
  const limaIni = `${fechaStr}T05:00:00.000Z`
  const limaFin = `${nextStr}T05:00:00.000Z`
  const noctIni = `${nextStr}T00:00:00.000Z`
  const noctIniPrev = `${fechaStr}T00:00:00.000Z`
  const ingresoIso = toIsoOrNull(record?.hora_ingreso)
  const salidaIso = toIsoOrNull(record?.hora_salida)

  if (record?.fecha === fechaStr) return record
  if (record?.fecha === nextStr && ingresoIso && ingresoIso >= noctIni && ingresoIso < limaFin) {
    return { ...record, _entroAyer: true }
  }
  if (record?.fecha === prevStr && salidaIso && salidaIso >= limaIni && salidaIso < limaFin && ingresoIso && ingresoIso >= noctIniPrev) {
    return { ...record, _saleHoy: true }
  }

  return null
}

function upsertAsistencia(prev: any[], next: any) {
  return sortRecordsByStatus([next, ...prev.filter((item) => item.id !== next.id)])
}

function extraerDetalleNota(notas?: string | null) {
  const raw = notas ?? ''
  if (!raw.trim()) return { tieneNota: false, contieneGPS: false, textoLimpio: '', coordenadas: '', lat: null as number | null, lng: null as number | null, tipoMarcacion: 'ninguna' as TipoMarcacion }
  const contieneGPS = raw.includes('[GPS:')
  let tipoMarcacion: TipoMarcacion = 'nota'
  if (raw.startsWith('Ingreso en:')) tipoMarcacion = 'ingreso_obra'
  else if (raw.startsWith('Salida de obra:') || raw.startsWith('Salida en:')) tipoMarcacion = 'salida_obra'
  else if (raw.startsWith('Marcación Externa:') || raw.startsWith('Salida Externa:')) tipoMarcacion = 'externo'
  else if (raw.startsWith('Turno Nocturno')) tipoMarcacion = 'nocturno'
  else if (raw.startsWith('Trabajo Remoto')) tipoMarcacion = 'remoto'
  let textoLimpio = raw, coordenadas = '', lat: number | null = null, lng: number | null = null
  if (contieneGPS) {
    const s = raw.indexOf('[GPS:'), e = raw.indexOf(']', s)
    if (s !== -1 && e !== -1) {
      coordenadas = raw.substring(s + 5, e).trim()
      textoLimpio = raw.substring(0, s).trim()
        .replace(/^(Ingreso en:|Salida de obra:|Salida en:|Marcación Externa:|Salida Externa:|Trabajo Remoto:)\s*/, '')
        .replace(/^Turno Nocturno \([^)]+\):\s*/, '').trim()
      if (!textoLimpio) textoLimpio = tipoMarcacion === 'nocturno' ? 'Turno Nocturno' : 'Marcación GPS'
      const [ls, lo] = coordenadas.split(',')
      lat = isNaN(parseFloat(ls?.trim())) ? null : parseFloat(ls.trim())
      lng = isNaN(parseFloat(lo?.trim())) ? null : parseFloat(lo.trim())
    }
  } else {
    textoLimpio = raw.replace(/^Turno Nocturno \([^)]+\):\s*/, '').replace(/^Trabajo Remoto:\s*/, '').trim()
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
    case 'remoto':       return { bg: 'bg-sky-500',    label: 'Trabajo Remoto', icon: Laptop,            gradient: 'from-teal-600 to-indigo-500' }
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
  const [asistencias, setAsistencias]     = useState<AsistenciaRecord[]>([])
  const [loading, setLoading]             = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [fechaActual, setFechaActual]     = useState(new Date())
  const [showFechaPicker, setShowFechaPicker] = useState(false)
  const [isDark, setIsDark]               = useState(false)
  const [mounted, setMounted]             = useState(false)
  const [modoEdicion, setModoEdicion]     = useState(false)
  const [vistaActual, setVistaActual]     = useState<'lista' | 'mapa'>('lista')
  const mapRef = useRef<MapRef | null>(null)
  const [tod, setTod]                     = useState<TimeOfDay>('day')
  const [notaModal, setNotaModal]         = useState<any>(null)
  const [showExportar, setShowExportar]   = useState(false)
  const [showManual, setShowManual]       = useState(false)
  const [showFeriado, setShowFeriado]     = useState(false)
  const [sidebarOpen, setSidebarOpen]     = useState(false)
  const actionAlign = 'justify-center px-0'
  const actionLabel = 'sr-only'
  const [feriadoFecha, setFeriadoFecha]   = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [feriadoMotivo, setFeriadoMotivo] = useState('Feriado')
  const [feriadoSaving, setFeriadoSaving] = useState(false)
  const [showDescansoMedico, setShowDescansoMedico] = useState(false)
  const [descansoDni, setDescansoDni] = useState('')
  const [descansoDesde, setDescansoDesde] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [descansoHasta, setDescansoHasta] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [descansoMotivo, setDescansoMotivo] = useState('Descanso medico')
  const [descansoSaving, setDescansoSaving] = useState(false)
  const [showMetricas, setShowMetricas]   = useState(false)
  const [busqueda, setBusqueda]           = useState('')
  const [filtroArea, setFiltroArea]       = useState('TODAS')
  const [filtroEstado, setFiltroEstado]   = useState('TODOS')
  const [filtroEmpresa, setFiltroEmpresa] = useState('TODAS')
  const [exportDesde, setExportDesde]     = useState(format(new Date(), 'yyyy-MM-dd'))
  const [exportHasta, setExportHasta]     = useState(format(new Date(), 'yyyy-MM-dd'))
  const [exportando, setExportando]       = useState(false)
  const [tipoExport, setTipoExport]       = useState<'dia' | 'rango'>('dia')
  const initialPreviewRange = useMemo(() => weekRangeFor(new Date()), [])
  const [showPreview, setShowPreview]     = useState(false)
  const [previewDesde, setPreviewDesde]   = useState(initialPreviewRange.from)
  const [previewHasta, setPreviewHasta]   = useState(initialPreviewRange.to)
  const [previewArea, setPreviewArea]     = useState('TODAS')
  const [previewBusqueda, setPreviewBusqueda] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewData, setPreviewData]     = useState<AsistenciaRecord[]>([])
  const [metricasLoading, setMetricasLoading] = useState(false)
  const [metricasData, setMetricasData] = useState<MetricasData | null>(null)
  const [vacacionesPendientes, setVacacionesPendientes] = useState(0)
  const [vacacionesPendientesPreview, setVacacionesPendientesPreview] = useState<string[]>([])
  const [descansosPendientes, setDescansosPendientes] = useState(0)
  const [descansosPendientesPreview, setDescansosPendientesPreview] = useState<string[]>([])
  const pendingVacacionesRef = useRef(0)
  const pendingDescansosRef = useRef(0)
  const [cumpleHoy, setCumpleHoy] = useState<BirthdayItem[]>([])
  const [cumpleProximos, setCumpleProximos] = useState<BirthdayItem[]>([])
  const cumpleNotifiedRef = useRef(false)

  useEffect(() => {
    setMounted(true)
    const dark = localStorage.getItem('ruag_theme') === 'dark'
    setIsDark(dark)
    document.documentElement.classList.toggle('dark', dark)
  }, [])

  useEffect(() => {
    const openExcel = () => setShowExportar(true)
    const openFeriado = () => {
      setFeriadoFecha(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
      setShowFeriado(true)
    }

    window.addEventListener('ruag-open-excel', openExcel)
    window.addEventListener('ruag-open-feriado', openFeriado)

    const open = new URLSearchParams(window.location.search).get('open')
    if (open === 'excel') openExcel()
    if (open === 'feriado') openFeriado()

    return () => {
      window.removeEventListener('ruag-open-excel', openExcel)
      window.removeEventListener('ruag-open-feriado', openFeriado)
    }
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

  const fetchPendingVacaciones = async (showToast = false) => {
    const { data, error, count } = await supabase
      .from('vacaciones_solicitudes')
      .select('id, trabajador_nombre, created_at', { count: 'exact' })
      .eq('estado', 'solicitada')
      .order('created_at', { ascending: false })
      .limit(3)

    if (error) return

    const nextCount = count ?? data?.length ?? 0
    const prevCount = pendingVacacionesRef.current

    setVacacionesPendientes(nextCount)
    setVacacionesPendientesPreview((data ?? []).map((item: any) => String(item.trabajador_nombre)))
    pendingVacacionesRef.current = nextCount

    if (showToast && nextCount > prevCount) {
      const latestName = data?.[0]?.trabajador_nombre
      toast.info('Nueva solicitud de vacaciones', {
        description: latestName ? String(latestName) : `${nextCount} pendientes`,
      })
    }
  }

  const fetchPendingDescansos = async (showToast = false) => {
    const { data, error, count } = await supabase
      .from('descansos_medicos_solicitudes')
      .select('id, trabajador_nombre, created_at', { count: 'exact' })
      .eq('estado', 'solicitada')
      .order('created_at', { ascending: false })
      .limit(3)

    if (error) return

    const nextCount = count ?? data?.length ?? 0
    const prevCount = pendingDescansosRef.current

    setDescansosPendientes(nextCount)
    setDescansosPendientesPreview((data ?? []).map((item: any) => String(item.trabajador_nombre)))
    pendingDescansosRef.current = nextCount

    if (showToast && nextCount > prevCount) {
      const latestName = data?.[0]?.trabajador_nombre
      toast.info('Nueva solicitud de descanso medico', {
        description: latestName ? String(latestName) : `${nextCount} pendientes`,
      })
    }
  }

  // ── Fetch con soporte multi-turno ─────────────────────────────────────────

  const fetchData = async (fecha: Date) => {
    setLoading(true)
    const fechaStr = format(fecha, 'yyyy-MM-dd')
    const todayLima = getLimaDateKey()
    const prevStr  = format(subDays(fecha, 1), 'yyyy-MM-dd')
    const nextStr  = format(addDays(fecha, 1), 'yyyy-MM-dd')
    const limaIni     = `${fechaStr}T05:00:00.000Z`
    const limaFin     = `${nextStr}T05:00:00.000Z`
    const noctIni     = `${nextStr}T00:00:00.000Z`
    const noctIniPrev = `${fechaStr}T00:00:00.000Z`

    const [holidayKeys, hiddenAbsenceKeys] = await Promise.all([
      loadHolidayKeys(fechaStr, fechaStr).catch(() => new Set<string>()),
      loadHiddenAbsenceKeys(fechaStr, fechaStr).catch(() => new Set<string>()),
    ])
    const esFeriado = holidayKeys.has(fechaStr)
    const shouldBuildAbsences = fechaStr < todayLima && WORKING_DAYS.has(getWeekday(fechaStr)) && !esFeriado
    // Generar sintéticos FERIADO en cualquier día marcado feriado (laborable o no), pasado o hoy.
    const shouldBuildFeriado = esFeriado && fechaStr <= todayLima

    const [q1, q2, q3, perfilesRes, vacacionesRes, descansosRes] = await Promise.all([
      supabase.from('registro_asistencias').select('*').eq('fecha', fechaStr).order('hora_ingreso', { ascending: false }),
      supabase.from('registro_asistencias').select('*').eq('fecha', nextStr).gte('hora_ingreso', noctIni).lt('hora_ingreso', limaFin).order('hora_ingreso', { ascending: false }),
      supabase.from('registro_asistencias').select('*').eq('fecha', prevStr).gte('hora_ingreso', noctIniPrev).gte('hora_salida', limaIni).lt('hora_salida', limaFin).order('hora_ingreso', { ascending: false }),
      supabase.from('fotocheck_perfiles').select('dni, nombres_completos, area, foto_url, empresa, pais').order('nombres_completos'),
      supabase.from('vacaciones_solicitudes').select('dni, comentario, fecha_inicio, fecha_fin').eq('estado', 'aprobada').lte('fecha_inicio', fechaStr).gte('fecha_fin', fechaStr),
      supabase.from('descansos_medicos_solicitudes').select('dni, comentario, fecha_inicio, fecha_fin').eq('estado', 'aprobada').lte('fecha_inicio', fechaStr).gte('fecha_fin', fechaStr),
    ])

    const seen = new Set<string>()
    const todos = [
      ...(q1.data ?? []),
      ...(q2.data ?? []).map((r: any) => ({ ...r, _entroAyer: true })),
      ...(q3.data ?? []).map((r: any) => ({ ...r, _saleHoy: true })),
    ].filter((r: any) => { if (seen.has(r.id)) return false; seen.add(r.id); return true })

    const perfiles = (perfilesRes?.data ?? [])
      .filter((perfil: any) => !String(perfil.dni).startsWith('EXCEL-'))
      .filter((perfil: any) => !isInactiveArea(perfil.area))
    const vacaciones = vacacionesRes?.data ?? []
    const descansos = descansosRes?.data ?? []
    const dnisConRegistro = new Set(todos.map((item: any) => String(item.dni)))
    const perfilByDni = new Map(perfiles.map((p: any) => [String(p.dni), p]))

    // VACACIONES sintéticas (siempre, no solo en días pasados)
    const syntheticVacaciones: AsistenciaRecord[] = []
    const dnisConVacaciones = new Set<string>()
    for (const v of vacaciones) {
      const dni = String(v.dni)
      if (dnisConRegistro.has(dni)) continue
      const perfil = perfilByDni.get(dni)
      if (!perfil) continue
      syntheticVacaciones.push(buildSyntheticVacaciones(fechaStr, perfil, v.comentario))
      dnisConVacaciones.add(dni)
    }

    // DESCANSO MÉDICO sintético (siempre)
    const syntheticDescansos: AsistenciaRecord[] = []
    const dnisConDescanso = new Set<string>()
    for (const d of descansos) {
      const dni = String(d.dni)
      if (dnisConRegistro.has(dni) || dnisConVacaciones.has(dni)) continue
      const perfil = perfilByDni.get(dni)
      if (!perfil) continue
      syntheticDescansos.push(buildSyntheticDescansoMedico(fechaStr, perfil, d.comentario))
      dnisConDescanso.add(dni)
    }

    // FERIADO sintético (cuando día está marcado feriado). Workers que SÍ marcaron quedan como están.
    const syntheticFeriados: AsistenciaRecord[] = []
    if (shouldBuildFeriado) {
      for (const perfil of perfiles) {
        const dni = String(perfil.dni)
        if (dnisConRegistro.has(dni) || dnisConVacaciones.has(dni) || dnisConDescanso.has(dni)) continue
        if (hiddenAbsenceKeys.has(`${fechaStr}::${dni}`)) continue
        syntheticFeriados.push(buildSyntheticFeriado(fechaStr, perfil, null))
      }
    }

    // INASISTENCIA sintética (solo días laborables pasados, sin feriado)
    const syntheticAbsences = shouldBuildAbsences
      ? perfiles
          .filter((perfil: any) => !dnisConRegistro.has(String(perfil.dni)) && !dnisConVacaciones.has(String(perfil.dni)) && !dnisConDescanso.has(String(perfil.dni)))
          .filter((perfil: any) => !hiddenAbsenceKeys.has(`${fechaStr}::${perfil.dni}`))
          .map((perfil: any) => buildSyntheticInasistencia(fechaStr, perfil))
      : []

    const conEmpresa = [...todos, ...syntheticVacaciones, ...syntheticDescansos, ...syntheticFeriados, ...syntheticAbsences]
      .map((r: any) => ({
        ...r,
        empresa: (perfilByDni.get(String(r.dni)) as any)?.empresa ?? r.empresa ?? null,
        // El país guardado en el registro manda (es donde realmente se marcó);
        // si es antiguo y no lo tiene, se usa el país actual del perfil.
        pais: r.pais ?? (perfilByDni.get(String(r.dni)) as any)?.pais ?? DEFAULT_COUNTRY,
      }))
    setAsistencias(sortRecordsByStatus(conEmpresa))
    setLoading(false)
    if (isInitialLoad) setTimeout(() => setIsInitialLoad(false), 400)
  }

  const loadRangeDataset = async (fromKey: string, toKey: string): Promise<AsistenciaRecord[]> => {
    const todayLima = getLimaDateKey()
    const [holidayKeys, hiddenAbsenceKeys] = await Promise.all([
      loadHolidayKeys(fromKey, toKey).catch(() => new Set<string>()),
      loadHiddenAbsenceKeys(fromKey, toKey).catch(() => new Set<string>()),
    ])
    const [recordsRes, perfilesRes, vacacionesRes] = await Promise.all([
      supabase.from('registro_asistencias').select('*').gte('fecha', fromKey).lte('fecha', toKey),
      supabase.from('fotocheck_perfiles').select('dni, nombres_completos, area, foto_url').order('nombres_completos'),
      supabase.from('vacaciones_solicitudes')
        .select('dni, fecha_inicio, fecha_fin, estado')
        .eq('estado', 'aprobada')
        .lte('fecha_inicio', toKey)
        .gte('fecha_fin', fromKey),
    ])

    if (recordsRes.error) throw recordsRes.error
    if (perfilesRes.error) throw perfilesRes.error
    if (vacacionesRes.error) throw vacacionesRes.error

    const records = (recordsRes.data ?? []) as AsistenciaRecord[]
    const perfiles = (perfilesRes.data ?? [])
      .filter((perfil: any) => !String(perfil.dni).startsWith('EXCEL-'))
      .filter((perfil: any) => !isInactiveArea(perfil.area))

    const vacations = vacacionesRes.data ?? []
    const existingKeys = new Set(records.map((row: any) => `${row.fecha}::${row.dni}`))
    const vacationKeys = new Set<string>()

    vacations.forEach((row: any) => {
      for (const dateKey of dateKeysBetween(String(row.fecha_inicio), String(row.fecha_fin))) {
        vacationKeys.add(`${dateKey}::${row.dni}`)
      }
    })

    const synthetic: AsistenciaRecord[] = []
    for (const dateKey of dateKeysBetween(fromKey, toKey)) {
      if (holidayKeys.has(dateKey)) continue
      if (!(dateKey < todayLima) || !WORKING_DAYS.has(getWeekday(dateKey))) continue
      perfiles.forEach((perfil: any) => {
        const key = `${dateKey}::${perfil.dni}`
        if (!existingKeys.has(key) && !vacationKeys.has(key) && !hiddenAbsenceKeys.has(key)) {
          synthetic.push(buildSyntheticInasistencia(dateKey, perfil))
        }
      })
    }

    return [...records, ...synthetic]
  }

  const openPreviewModal = () => {
    const range = weekRangeFor(fechaActual)
    setPreviewDesde(range.from)
    setPreviewHasta(range.to)
    setPreviewArea(filtroArea)
    setPreviewBusqueda(busqueda)
    setShowPreview(true)
  }

  useEffect(() => {
    if (!showPreview) return
    if (!previewDesde || !previewHasta || previewDesde > previewHasta) {
      setPreviewData([])
      return
    }

    let cancelled = false
    setPreviewLoading(true)
    loadRangeDataset(previewDesde, previewHasta)
      .then((data) => {
        if (!cancelled) setPreviewData(sortRecordsForRange(data))
      })
      .catch((error) => {
        if (!cancelled) {
          setPreviewData([])
          toast.error(error?.message || 'No se pudo cargar la vista previa')
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })

    return () => { cancelled = true }
  }, [showPreview, previewDesde, previewHasta])

  useEffect(() => {
    fetchData(fechaActual)
    if (!isToday(fechaActual)) return
    const canal = supabase.channel('admin-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'registro_asistencias' }, p => {
        const visible = decorateForVisibleDate(p.new, fechaActual)
        if (!visible) return
        setAsistencias(prev => upsertAsistencia(
          prev.filter(item => !(item._syntheticInasistencia && item.dni === p.new.dni)),
          visible
        ))
        new Audio('/notification.mp3').play().catch(() => {})
        toast.success(`📥 ${p.new.nombres_completos}`, { description: p.new.estado_ingreso })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'registro_asistencias' }, p => {
        const visible = decorateForVisibleDate(p.new, fechaActual)
        setAsistencias(prev => {
          const cleaned = prev.filter(item => item.id !== p.new.id && !(item._syntheticInasistencia && item.dni === p.new.dni))
          if (!visible) return cleaned
          const exists = cleaned.some(a => a.id === p.new.id)
          return exists
            ? cleaned.map(a => a.id === p.new.id ? { ...a, ...visible } : a)
            : upsertAsistencia(cleaned, visible)
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sys_doc_cache', filter: `tipo_documento=eq.${HIDDEN_ABSENCE_TYPE}` }, () => {
        fetchData(fechaActual)
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [fechaActual])

  useEffect(() => {
    fetchPendingVacaciones()
    const canalVacaciones = supabase.channel('admin-vacaciones-alerta')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vacaciones_solicitudes' }, (payload) => {
        const isNewRequest = payload.eventType === 'INSERT' && payload.new?.estado === 'solicitada'
        void fetchPendingVacaciones(isNewRequest)
      })
      .subscribe()

    return () => { supabase.removeChannel(canalVacaciones) }
  }, [])

  const fetchBirthdays = async () => {
    const { data, error } = await supabase
      .from('fotocheck_perfiles')
      .select('dni, nombres_completos, area, foto_url, fecha_cumpleanos')
      .not('fecha_cumpleanos', 'is', null)
    if (error) return

    const items: BirthdayItem[] = []
    for (const row of data ?? []) {
      if (isInactiveArea(row.area) || !row.fecha_cumpleanos) continue
      const info = computeBirthday(row.fecha_cumpleanos)
      if (!info) continue
      items.push({
        dni: row.dni,
        nombre: row.nombres_completos,
        area: getVisibleArea(row.area),
        foto: row.foto_url || '',
        fecha: String(row.fecha_cumpleanos).slice(0, 10),
        ...info,
      })
    }
    items.sort((a, b) => a.daysUntil - b.daysUntil)
    const hoy = items.filter((i) => i.isToday)
    setCumpleHoy(hoy)
    setCumpleProximos(items.filter((i) => !i.isToday))

    if (hoy.length && !cumpleNotifiedRef.current) {
      cumpleNotifiedRef.current = true
      const nombres = hoy.map((h) => h.nombre.split(' ')[0]).join(', ')
      toast.success('🎉 ¡Hoy hay cumpleaños!', { description: nombres, duration: 9000 })
      new Audio('/notification.mp3').play().catch(() => {})
    }
  }

  useEffect(() => {
    void fetchBirthdays()
    const canalCumple = supabase.channel('admin-cumple-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fotocheck_perfiles' }, () => { void fetchBirthdays() })
      .subscribe()
    const t = setInterval(() => { void fetchBirthdays() }, 60 * 60 * 1000)
    return () => { supabase.removeChannel(canalCumple); clearInterval(t) }
  }, [])

  useEffect(() => {
    fetchPendingDescansos()
    const canalDescansos = supabase.channel('admin-descansos-alerta')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'descansos_medicos_solicitudes' }, (payload) => {
        const isNewRequest = payload.eventType === 'INSERT' && payload.new?.estado === 'solicitada'
        void fetchPendingDescansos(isNewRequest)
      })
      .subscribe()

    return () => { supabase.removeChannel(canalDescansos) }
  }, [])

  // ── Memos ─────────────────────────────────────────────────────────────────

  const areas = useMemo(() => ['TODAS', ...Array.from(new Set(asistencias.map(a => a.area).filter(Boolean))).sort()], [asistencias])

  const filtradas = useMemo(() => {
    const q = busqueda.toLowerCase()

    return sortRecordsByStatus(asistencias
      .filter(a =>
        (!q || a.nombres_completos?.toLowerCase().includes(q) || a.dni?.includes(q)) &&
        (filtroArea === 'TODAS' || a.area === filtroArea) &&
        (filtroEstado === 'TODOS' || a.estado_ingreso === filtroEstado) &&
        (filtroEmpresa === 'TODAS' ||
          (filtroEmpresa === 'SIN' ? !a.empresa : a.empresa === filtroEmpresa))
      ))
  }, [asistencias, busqueda, filtroArea, filtroEstado, filtroEmpresa])

  // Conteo por empresa para las pastillas de pestañas
  const empresaCounts = useMemo(() => {
    const base = asistencias.filter(a => {
      const q = busqueda.toLowerCase()
      return (!q || a.nombres_completos?.toLowerCase().includes(q) || a.dni?.includes(q)) &&
        (filtroArea === 'TODAS' || a.area === filtroArea) &&
        (filtroEstado === 'TODOS' || a.estado_ingreso === filtroEstado)
    })
    const counts: Record<string, number> = { TODAS: base.length, RUAG: 0, ARUG: 0, CG: 0, SIN: 0 }
    for (const a of base) {
      const e = a.empresa
      if (e === 'RUAG' || e === 'ARUG' || e === 'CG') counts[e]++
      else counts.SIN++
    }
    return counts
  }, [asistencias, busqueda, filtroArea, filtroEstado])

  const previewAreas = useMemo(() => ['TODAS', ...Array.from(new Set([previewArea, ...previewData.map(a => a.area)].filter(Boolean))).filter(a => a !== 'TODAS').sort()], [previewData, previewArea])
  const previewFiltradas = useMemo(() => {
    const q = previewBusqueda.toLowerCase().trim()
    return sortRecordsForRange(previewData.filter(a =>
      (!q || a.nombres_completos?.toLowerCase().includes(q) || a.dni?.includes(q)) &&
      (previewArea === 'TODAS' || a.area === previewArea)
    ))
  }, [previewData, previewArea, previewBusqueda])
  const previewConSalida = useMemo(() => previewFiltradas.filter(a => a.hora_salida && a.estado_ingreso !== 'INASISTENCIA' && a.estado_ingreso !== 'DESCANSO MEDICO').length, [previewFiltradas])
  const previewTotalMinutos = useMemo(() => previewFiltradas.reduce((sum, item) => sum + calcMinutos(item.hora_ingreso, item.hora_salida), 0), [previewFiltradas])
  const previewTrabajadores = useMemo(() => new Set(previewFiltradas.map(a => a.dni)).size, [previewFiltradas])

  /**
   * Datos del mapa en 3 grupos:
   *  - campo:        marcaciones con GPS real (obra, externo, nocturno, remoto)
   *  - oficina:      ingresos por QR de oficina. No traen GPS en la nota, pero la app
   *                  valida que estés dentro de 50 m antes de permitir el escaneo,
   *                  así que ubicarlos en la oficina es fiel a la realidad.
   *  - sinUbicacion: marcaciones reales sin forma de ubicarlas (remoto sin GPS, offline).
   *                  NO se inventan coordenadas: se muestran como contador aparte.
   * Los estados sintéticos (inasistencia, vacaciones, feriado, descanso) se excluyen.
   */
  const mapData = useMemo(() => {
    const campo: any[] = []
    const oficina: any[] = []
    const sinUbicacion: any[] = []
    const NO_PRESENCIALES = new Set(['INASISTENCIA', 'VACACIONES', 'FERIADO', 'DESCANSO MEDICO'])

    filtradas.forEach(a => {
      if (NO_PRESENCIALES.has(String(a.estado_ingreso))) return
      const d = extraerDetalleNota(a.notas)
      if (d.contieneGPS && d.lat !== null && d.lng !== null) campo.push({ ...a, ...d })
      else if ((a.notas ?? '').startsWith('Escaner Oficina')) oficina.push({ ...a, ...d })
      else sinUbicacion.push({ ...a, ...d })
    })
    return { campo, oficina, sinUbicacion }
  }, [filtradas])

  const conGPS = mapData.campo

  const centroMapa = useMemo(() => {
    const pts = [...mapData.campo.map(m => ({ lng: m.lng, lat: m.lat }))]
    if (mapData.oficina.length) pts.push({ lng: OFICINA_LON, lat: OFICINA_LAT })
    if (!pts.length) return { longitude: OFICINA_LON, latitude: OFICINA_LAT }
    return {
      longitude: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
      latitude: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    }
  }, [mapData])

  useEffect(() => {
    if (vistaActual !== 'mapa' || !mapRef.current) return
    const map = mapRef.current.getMap()
    if (!map?.isStyleLoaded()) return

    const pts = mapData.campo.map(m => ({ lng: m.lng, lat: m.lat }))
    if (mapData.oficina.length) pts.push({ lng: OFICINA_LON, lat: OFICINA_LAT })
    if (!pts.length) return

    if (pts.length === 1) {
      map.flyTo({ center: [pts[0].lng, pts[0].lat], zoom: 16.5, pitch: 55, bearing: -18, duration: 1300 })
      return
    }
    let [minLng, maxLng, minLat, maxLat] = [pts[0].lng, pts[0].lng, pts[0].lat, pts[0].lat]
    pts.forEach(p => {
      minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng)
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat)
    })
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
      padding: { top: 90, bottom: 70, left: 70, right: 70 },
      maxZoom: 16.5, duration: 1300, pitch: 50, bearing: -15,
    })
  }, [vistaActual, mapData])

  // FIX MÓVIL: mapbox-gl no repinta cuando el contenedor cambia de tamaño después del mount.
  // Forzamos resize al entrar a 'mapa', al rotar la pantalla y cuando el contenedor cambia.
  useEffect(() => {
    if (vistaActual !== 'mapa') return
    const m = mapRef.current?.getMap()
    if (!m) return
    const resize = () => { try { m.resize() } catch {} }
    const t1 = window.setTimeout(resize, 50)
    const t2 = window.setTimeout(resize, 300)
    const t3 = window.setTimeout(resize, 800)
    window.addEventListener('resize', resize)
    window.addEventListener('orientationchange', resize)
    let observer: ResizeObserver | null = null
    const container = m.getContainer?.()
    if (container && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize)
      observer.observe(container)
    }
    return () => {
      window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3)
      window.removeEventListener('resize', resize)
      window.removeEventListener('orientationchange', resize)
      observer?.disconnect()
    }
  }, [vistaActual])

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
  const totalDescansosMedicos = useMemo(() => asistencias.filter(a => a.estado_ingreso === 'DESCANSO MEDICO').length, [asistencias])

  // ── Excel ─────────────────────────────────────────────────────────────────

  const exportarExcel = (data: AsistenciaRecord[], nombre: string) => {
    if (!data.length) { toast.error('Sin registros'); return false }
    const hS = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: { fgColor: { rgb: '1E293B' } }, alignment: { horizontal: 'center', vertical: 'center' } }
    const pS = { font: { color: { rgb: '059669' }, bold: true }, alignment: { horizontal: 'center' } }
    const tS = { font: { color: { rgb: 'DC2626' }, bold: true }, alignment: { horizontal: 'center' } }
    const iS = { font: { color: { rgb: 'EA580C' }, bold: true }, alignment: { horizontal: 'center' } }
    const mS = { font: { color: { rgb: '7C3AED' }, bold: true }, alignment: { horizontal: 'center' } }
    const cS = { alignment: { horizontal: 'center' } }
    const ord = (s: string) => {
      const p = s?.trim().split(' ')
      const formatted = !p?.length ? '-' : p.length >= 3 ? `${p.slice(-2).join(' ')}, ${p.slice(0,-2).join(' ')}` : p.length === 2 ? `${p[1]}, ${p[0]}` : s
      return String(formatted).toUpperCase()
    }
    const tt = (ts: string, estado?: string) => estado === 'INASISTENCIA'
      ? '11:59 p. m.'
      : estado === 'DESCANSO MEDICO'
        ? 'DESCANSO'
        : new Date(ts).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })
    const rows: any[][] = [["FECHA","DNI","APELLIDOS Y NOMBRES","ÁREA","INGRESO","ESTADO","SALIDA","DURACIÓN","NOTA","MAPA"]]
    data.forEach(r => {
      const d = extraerDetalleNota(r.notas)
      rows.push([r.fecha, r.dni, ord(r.nombres_completos), String(r.area || '').toUpperCase(), tt(r.hora_ingreso, r.estado_ingreso), r.estado_ingreso,
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
          if (C === 5) ws[cell].s = ws[cell].v === 'PUNTUAL' ? pS : ws[cell].v === 'INASISTENCIA' ? iS : ws[cell].v === 'DESCANSO MEDICO' ? mS : tS
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
      if (tipoExport === 'dia') {
        const ok = exportarExcel(sortRecordsForRange(filtradas), `RUAG_${format(fechaActual,'yyyy-MM-dd')}`)
        if (ok) { toast.success('Excel descargado'); setShowExportar(false) }
      }
      else {
        if (!exportDesde || !exportHasta) { toast.error('Selecciona fechas'); return }
        setExportando(true); toast.loading('Descargando...', { id: 'dl' })
        const data = await loadRangeDataset(exportDesde, exportHasta)
        toast.dismiss('dl')
        const ok = exportarExcel(sortRecordsForRange(data), `RUAG_${exportDesde}_AL_${exportHasta}`)
        if (ok) { toast.success(`${data.length} registros`); setShowExportar(false) }
      }
    } catch { toast.dismiss('dl'); toast.error('Error al exportar') } finally { setExportando(false) }
  }

  // ── Edit helpers ──────────────────────────────────────────────────────────

  const actualizarHora = async (id: string, campo: 'hora_ingreso' | 'hora_salida', hora: string | null, fechaBase: string) => {
    try {
      const current = asistencias.find(item => item.id === id)
      if (current?._syntheticInasistencia) {
        if (campo === 'hora_salida') {
          toast.info('Primero guarda la hora de entrada')
          return
        }
        if (!hora) return
        const [h, m] = hora.split(':').map(Number)
        const [year, month, day] = String(current.fecha).split('-').map(Number)
        const ingreso = new Date(Date.UTC(year, month - 1, day, h + 5, m, 0, 0))
        const estado = (h < 9 || (h === 9 && m <= 5)) ? 'PUNTUAL' : 'TARDANZA'
        const { data, error } = await supabase.from('registro_asistencias').insert({
          dni: current.dni,
          nombres_completos: current.nombres_completos,
          area: current.area,
          foto_url: current.foto_url ?? '',
          fecha: current.fecha,
          hora_ingreso: ingreso.toISOString(),
          estado_ingreso: estado,
          notas: 'Registro corregido desde inasistencia',
        }).select().single()

        if (error) throw error
        toast.success('Inasistencia convertida en asistencia')
        setAsistencias(prev => sortRecordsByStatus(prev.map(item => item.id === id ? data as AsistenciaRecord : item)))
        return
      }

      let upd: any = hora === null ? { [campo]: null } : (() => {
        const [h, m] = hora.split(':').map(Number); const d = new Date(fechaBase); d.setHours(h, m, 0)
        return { [campo]: d.toISOString(), ...(campo === 'hora_ingreso' ? { estado_ingreso: (h < 9 || (h === 9 && m <= 5)) ? 'PUNTUAL' : 'TARDANZA' } : {}) }
      })()
      await supabase.from('registro_asistencias').update(upd).eq('id', id)
      toast.success('Actualizado'); setAsistencias(prev => sortRecordsByStatus(prev.map(a => a.id === id ? { ...a, ...upd } : a)))
    } catch { toast.error('Error') }
  }

  const borrarNota = async (id: string) => {
    try { await supabase.from('registro_asistencias').update({ notas: null }).eq('id', id); toast.success('Nota eliminada'); setAsistencias(prev => prev.map(a => a.id === id ? { ...a, notas: null } : a)) } catch { toast.error('Error') }
  }

  const borrarRegistro = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar registro de ${nombre}?`)) return
    try {
      const current = asistencias.find((item) => item.id === id)
      if (current?.estado_ingreso === 'INASISTENCIA') await hideAbsence(current)
      if (!current?._syntheticInasistencia) await supabase.from('registro_asistencias').delete().eq('id', id)
      toast.success('Eliminado')
      setAsistencias(prev => prev.filter(a => a.id !== id))
    } catch (error: any) {
      toast.error(error?.message || 'Error')
    }
  }

  const darDeBajaTrabajador = async (dni: string, nombre: string, areaActual?: string | null) => {
    if (!confirm(`¿Dar de baja a ${nombre}?\n\nSeguirá conservando su historial, pero ya no aparecerá en inasistencias futuras.`)) return
    try {
      const { error } = await supabase
        .from('fotocheck_perfiles')
        .update({ area: makeInactiveArea(areaActual) })
        .eq('dni', dni)

      if (error) throw error

      toast.success(`${nombre} fue dado de baja`)
      await fetchData(fechaActual)
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo dar de baja al trabajador')
    }
  }

  const cambiarEstado = async (id: string, estadoActual: string) => {
    const n = estadoActual === 'PUNTUAL' ? 'TARDANZA' : 'PUNTUAL'
    try { await supabase.from('registro_asistencias').update({ estado_ingreso: n }).eq('id', id); toast.success(`→ ${n}`); setAsistencias(prev => sortRecordsByStatus(prev.map(a => a.id === id ? { ...a, estado_ingreso: n } : a))) } catch { toast.error('Error') }
  }

  const actualizarNombre = async (id: string, dni: string, nuevoNombre: string) => {
    const nombre = nuevoNombre.trim().toUpperCase()
    if (!nombre) { toast.error('El nombre no puede estar vacío'); return }
    try {
      // Actualizar en registro_asistencias
      await supabase.from('registro_asistencias').update({ nombres_completos: nombre }).eq('id', id)
      // Actualizar también en fotocheck_perfiles para que quede sincronizado
      await supabase.from('fotocheck_perfiles').update({ nombres_completos: nombre }).eq('dni', dni)
      toast.success('Nombre actualizado')
      setAsistencias(prev => prev.map(a => a.id === id ? { ...a, nombres_completos: nombre } : a))
    } catch { toast.error('Error al actualizar nombre') }
  }

  const guardarFeriado = async () => {
    if (!feriadoFecha) { toast.error('Selecciona una fecha'); return }
    setFeriadoSaving(true)
    try {
      const response = await fetch('/api/feriados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: feriadoFecha, motivo: feriadoMotivo }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'No se pudo guardar el feriado')
      toast.success(`Feriado activado: ${feriadoFecha}`)
      setShowFeriado(false)
      await fetchData(fechaActual)
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo guardar el feriado')
    } finally {
      setFeriadoSaving(false)
    }
  }

  const medicalIsoForDate = (dateKey: string) => {
    const [year, month, day] = dateKey.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day, 28, 59, 0, 0)).toISOString()
  }

  const guardarDescansoMedico = async () => {
    const dni = descansoDni.trim()
    if (!/^\d{8}$/.test(dni)) { toast.error('Ingresa un DNI valido de 8 digitos'); return }
    if (!descansoDesde || !descansoHasta || descansoDesde > descansoHasta) { toast.error('Rango de fechas invalido'); return }

    setDescansoSaving(true)
    try {
      const { data: perfil, error: perfilError } = await supabase
        .from('fotocheck_perfiles')
        .select('dni, nombres_completos, area, foto_url')
        .eq('dni', dni)
        .maybeSingle()

      if (perfilError) throw perfilError
      if (!perfil) throw new Error('No encontre un trabajador con ese DNI')

      const candidateDates = dateKeysBetween(descansoDesde, descansoHasta)
        .filter((dateKey) => WORKING_DAYS.has(getWeekday(dateKey)))

      if (!candidateDates.length) throw new Error('El rango no contiene dias laborables')

      const { data: existentes, error: existentesError } = await supabase
        .from('registro_asistencias')
        .select('fecha')
        .eq('dni', dni)
        .gte('fecha', descansoDesde)
        .lte('fecha', descansoHasta)

      if (existentesError) throw existentesError

      const fechasConRegistro = new Set((existentes ?? []).map((row: any) => String(row.fecha)))
      const rows = candidateDates
        .filter((dateKey) => !fechasConRegistro.has(dateKey))
        .map((dateKey) => ({
          dni,
          fecha: dateKey,
          hora_ingreso: medicalIsoForDate(dateKey),
          hora_salida: null,
          estado_ingreso: 'DESCANSO MEDICO',
          nombres_completos: perfil.nombres_completos,
          area: getVisibleArea(perfil.area),
          foto_url: perfil.foto_url ?? '',
          notas: `Descanso medico: ${descansoMotivo.trim() || 'Sin detalle'}`,
        }))

      if (!rows.length) throw new Error('Ese trabajador ya tiene registros en ese rango')

      const { error } = await supabase.from('registro_asistencias').insert(rows)
      if (error) throw error

      toast.success(`Descanso medico registrado (${rows.length} dia/s)`)
      setShowDescansoMedico(false)
      setDescansoDni('')
      setDescansoMotivo('Descanso medico')
      await fetchData(fechaActual)
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo registrar el descanso medico')
    } finally {
      setDescansoSaving(false)
    }
  }

  const cargarMetricas = async () => {
    setMetricasLoading(true)
    try {
      const endKey = format(fechaActual, 'yyyy-MM-dd')
      const startKey = format(subDays(fechaActual, 13), 'yyyy-MM-dd')
      const rangeData = sortRecordsForRange(await loadRangeDataset(startKey, endKey))
      const createTrendPoint = (fecha: string): TrendPoint => ({ fecha, puntuales: 0, tardanzas: 0, inasistencias: 0, total: 0 })
      const createAreaMetric = (area: string): AreaMetric => ({ area, puntuales: 0, tardanzas: 0, inasistencias: 0, total: 0 })

      const resumenDia = {
        total: asistencias.length,
        puntuales,
        tardanzas,
        inasistencias: totalInasistencias,
        conSalida,
        reingresos,
      }

      const trendMap = new Map<string, TrendPoint>()
      rangeData.forEach((row) => {
        const current = trendMap.get(row.fecha) ?? createTrendPoint(row.fecha)
        if (row.estado_ingreso === 'PUNTUAL') current.puntuales += 1
        else if (row.estado_ingreso === 'TARDANZA') current.tardanzas += 1
        else if (row.estado_ingreso === 'INASISTENCIA') current.inasistencias += 1
        current.total += 1
        trendMap.set(row.fecha, current)
      })

      const areaMap = new Map<string, AreaMetric>()
      asistencias.forEach((row) => {
        const key = row.area || 'SIN AREA'
        const current = areaMap.get(key) ?? createAreaMetric(key)
        if (row.estado_ingreso === 'PUNTUAL') current.puntuales += 1
        else if (row.estado_ingreso === 'TARDANZA') current.tardanzas += 1
        else if (row.estado_ingreso === 'INASISTENCIA') current.inasistencias += 1
        current.total += 1
        areaMap.set(key, current)
      })

      const trend = Array.from(trendMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha))
      const areaBreakdown = Array.from(areaMap.values()).sort((a, b) => b.total - a.total).slice(0, 8)
      const bestDay = trend.reduce<TrendPoint | null>((best, item) => item.puntuales > (best?.puntuales ?? -1) ? item : best, null)
      const worstDay = trend.reduce<TrendPoint | null>((worst, item) => item.inasistencias > (worst?.inasistencias ?? -1) ? item : worst, null)

      setMetricasData({
        resumenDia,
        trend,
        areaBreakdown,
        bestDay,
        worstDay,
        rangeLabel: `${startKey} al ${endKey}`,
      })
      setShowMetricas(true)
    } catch (error: any) {
      toast.error(error?.message || 'No se pudieron cargar las métricas')
    } finally {
      setMetricasLoading(false)
    }
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
              className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center overflow-hidden bg-white shadow-md ring-1 ${modoEdicion ? 'ring-blue-200' : 'ring-slate-200 dark:ring-slate-700'}`}>
              <img src="/ruag-logo.png" alt="RUAG" className="h-full w-full object-cover" />
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

      {/* Banner de cumpleaños del día */}
      <AnimatePresence>
        {cumpleHoy.length > 0 && (
          <motion.div
            className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 pt-5"
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
          >
            <div className="relative overflow-hidden rounded-3xl border shadow-lg"
              style={{ background: 'linear-gradient(120deg, #FFE4F1, #FFFFFF 45%, #EDE9FE)', borderColor: '#EC489955' }}>
              <div className="pointer-events-none absolute inset-0 opacity-80">
                <LottiePlayer src="/lottie/confetti.json" style={{ width: '100%', height: '100%' }} />
              </div>
              <div className="relative z-10 flex items-center gap-4 p-4 sm:p-5">
                <div className="shrink-0 hidden sm:block">
                  <LottiePlayer src="/lottie/birthday-cake.json" style={{ width: 84, height: 84 }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1" style={{ color: '#DB2777' }}>
                    <PartyPopper size={16} />
                    <span className="text-[11px] font-black uppercase tracking-[0.16em]">Cumpleaños de hoy</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {cumpleHoy.map((c) => (
                      <span key={c.dni} className="flex items-center gap-2 text-sm sm:text-base font-black text-slate-800 dark:text-slate-100">
                        <span className="inline-flex w-8 h-8 rounded-full overflow-hidden bg-pink-100 items-center justify-center text-[10px] text-pink-600 font-black">
                          {c.foto ? <img src={c.foto} alt="" className="w-full h-full object-cover" /> : c.nombre.split(' ').slice(0, 2).map(w => w[0]).join('')}
                        </span>
                        {c.nombre}{c.turningAge ? <span className="text-pink-600 font-bold">· {c.turningAge} años</span> : null}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs font-semibold mt-1" style={{ color: '#9D174D' }}>¡No olvides saludarlos! 🎂🎈</p>
                </div>
                <Gift size={26} className="shrink-0 hidden md:block" style={{ color: '#DB2777' }} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col xl:flex-row gap-6">

        {/* Date and filters */}
        <aside className="w-full xl:w-72 shrink-0 flex flex-col gap-4">

          {false && (
          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-2">
            {sidebarOpen && (
              <div className="min-w-0">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em]">Panel</p>
                <p className="text-sm font-black text-slate-800 dark:text-white truncate">Acciones rápidas</p>
              </div>
            )}
            <button
              onClick={() => setSidebarOpen((prev) => !prev)}
              className={`h-11 w-11 rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950 flex items-center justify-center shadow-sm transition-all active:scale-95 ${!sidebarOpen ? 'mx-auto' : ''}`}
              title={sidebarOpen ? 'Cerrar panel' : 'Abrir panel'}
            >
              {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            </button>
          </div>
          )}

          {/* Date */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5"><CalendarDays size={11} /> Fecha</p>
            <div className="flex items-center bg-slate-50 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
              <button onClick={() => setFechaActual(p => subDays(p, 1))} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                onClick={() => setShowFechaPicker(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-all"
              >
                <CalendarDays size={13} className="text-blue-500" />
                <span className="font-black text-sm text-slate-700 dark:text-slate-200 capitalize">
                  {isToday(fechaActual) ? '· Hoy ·' : format(fechaActual, "d MMM yy", { locale: es })}
                </span>
              </button>
              <button onClick={() => setFechaActual(p => addDays(p, 1))} disabled={isToday(fechaActual)}
                className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20">
                <ChevronRight size={15} />
              </button>
            </div>
            {!isToday(fechaActual) && (
              <button onClick={() => setFechaActual(new Date())}
                className="mt-2 w-full text-[10px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-wider">
                Volver a hoy
              </button>
            )}
          </div>

          {showFechaPicker && (
            <CalendarPicker
              value={format(fechaActual, 'yyyy-MM-dd')}
              onClose={() => setShowFechaPicker(false)}
              onSelect={(v) => { const [y, m, d] = v.split('-').map(Number); setFechaActual(new Date(y, m - 1, d)) }}
              accent="#2563EB"
              accent2="#06B6D4"
            />
          )}

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
                { value: filtroEstado, onChange: setFiltroEstado, opts: [{ v:'TODOS', l:'Todos' }, { v:'PUNTUAL', l:'Puntuales' }, { v:'TARDANZA', l:'Tardanzas' }, { v:'DESCANSO MEDICO', l:'Descansos medicos' }, { v:'INASISTENCIA', l:'Inasistencias' }] },
              ].map((f, i) => (
                <div key={i} className="relative">
                  <select value={f.value} onChange={e => f.onChange(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 pl-3 pr-7 py-2 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500 text-xs font-medium cursor-pointer appearance-none transition-all">
                    {f.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                  <ChevronRight size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" />
                </div>
              ))}
              <button onClick={openPreviewModal}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-[11px] font-black text-blue-700 transition-all hover:bg-blue-100 active:scale-[0.99] dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20">
                <CalendarDays size={13} /> VISTA PREVIA POR RANGO
              </button>
            </div>
          </div>

          {/* Próximos cumpleaños */}
          {(cumpleHoy.length > 0 || cumpleProximos.length > 0) && (
            <motion.div
              className="relative overflow-hidden rounded-3xl border shadow-lg shadow-pink-500/5"
              style={{ background: 'linear-gradient(155deg, #FFFFFF, #FFF1F9 35%, #FAF5FF 70%, #EEF4FF)', borderColor: '#EC489933' }}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.34, 1.2, 0.64, 1] }}
            >
              {/* Glow orbs */}
              <motion.div
                className="pointer-events-none absolute -top-12 -right-10 h-36 w-36 rounded-full blur-3xl"
                style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.38), transparent 70%)' }}
                animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="pointer-events-none absolute -bottom-16 -left-10 h-36 w-36 rounded-full blur-3xl"
                style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.30), transparent 70%)' }}
                animate={{ scale: [1.1, 1, 1.1], opacity: [0.45, 0.75, 0.45] }}
                transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
              />
              {cumpleHoy.length > 0 && (
                <div className="pointer-events-none absolute inset-0 opacity-50">
                  <LottiePlayer src="/lottie/confetti.json" style={{ width: '100%', height: '100%' }} />
                </div>
              )}

              {/* Header sticky */}
              <div className="relative z-10 flex items-center justify-between gap-2 px-4 pt-4 pb-3">
                <div className="flex items-center gap-2.5">
                  <motion.div
                    className="w-10 h-10 rounded-2xl overflow-hidden bg-white border flex items-center justify-center"
                    style={{ borderColor: '#EC489955', boxShadow: '0 8px 22px rgba(236,72,153,0.22)' }}
                    animate={{ y: [0, -3, 0], rotate: [0, -4, 4, 0] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <LottiePlayer src="/lottie/birthday-cake.json" style={{ width: 34, height: 34 }} />
                  </motion.div>
                  <div>
                    <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.18em] leading-none">Cumpleaños</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">
                      {cumpleHoy.length > 0
                        ? `🎉 Hoy cumple${cumpleHoy.length > 1 ? 'n' : ''} ${cumpleHoy.length}`
                        : `${cumpleProximos.length} próximo${cumpleProximos.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                </div>
                {cumpleHoy.length > 0 ? (
                  <motion.span
                    className="px-2.5 py-1 rounded-full text-[9px] font-black text-white shadow-md shadow-pink-500/30"
                    style={{ background: 'linear-gradient(135deg, #EC4899, #7C3AED)' }}
                    animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  >🎉 HOY</motion.span>
                ) : cumpleProximos[0] && cumpleProximos[0].daysUntil <= 3 && (
                  <motion.span
                    className="px-2 py-1 rounded-full text-[9px] font-black"
                    style={{ background: 'rgba(245,158,11,0.15)', color: '#B45309' }}
                    animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 1.4, repeat: Infinity }}
                  >✨ ¡PRONTO!</motion.span>
                )}
              </div>

              {/* Scroll list */}
              <motion.div
                className="relative z-10 px-3 pb-3 space-y-1.5 overflow-y-auto scrollbar-hide"
                style={{ maxHeight: 360 }}
                initial="hidden" animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
              >
                {[...cumpleHoy, ...cumpleProximos].map((c) => {
                  const proximity = c.isToday
                    ? 'today'
                    : c.daysUntil <= 3 ? 'imminent'
                    : c.daysUntil <= 7 ? 'soon'
                    : c.daysUntil <= 30 ? 'month'
                    : 'later'
                  const tone = {
                    today:    { ring: '#EC4899', accent: '#DB2777', bg: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(253,242,248,0.85))', bord: '#EC489966' },
                    imminent: { ring: '#F97316', accent: '#C2410C', bg: 'linear-gradient(135deg, rgba(255,255,255,0.85), rgba(255,247,237,0.75))', bord: '#F9731655' },
                    soon:     { ring: '#F59E0B', accent: '#B45309', bg: 'rgba(255,255,255,0.75)', bord: 'rgba(245,158,11,0.35)' },
                    month:    { ring: '#6366F1', accent: '#4338CA', bg: 'rgba(255,255,255,0.65)', bord: 'rgba(99,102,241,0.20)' },
                    later:    { ring: '#94A3B8', accent: '#64748B', bg: 'rgba(255,255,255,0.55)', bord: 'rgba(148,163,184,0.25)' },
                  }[proximity]
                  return (
                    <motion.div
                      key={c.dni}
                      className="relative flex items-center gap-2.5 rounded-2xl p-2 border overflow-hidden"
                      style={{ background: tone.bg, borderColor: tone.bord, boxShadow: proximity === 'today' || proximity === 'imminent' ? `0 4px 14px ${tone.ring}25` : 'none' }}
                      variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}
                      whileHover={{ x: 3, scale: 1.015 }}
                    >
                      {/* Avatar con anillo cónico animado según proximidad */}
                      <div className="relative shrink-0 w-11 h-11">
                        {(proximity === 'today' || proximity === 'imminent' || proximity === 'soon') && (
                          <motion.div
                            className="absolute -inset-1 rounded-full"
                            style={{ background: `conic-gradient(from 0deg, ${tone.ring}, ${tone.ring}33, ${tone.ring})` }}
                            animate={{ rotate: 360 }}
                            transition={{ duration: proximity === 'today' ? 4 : proximity === 'imminent' ? 6 : 9, repeat: Infinity, ease: 'linear' }}
                          />
                        )}
                        <div className="relative w-11 h-11 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-black ring-2 ring-white"
                          style={{ background: `${tone.ring}1a`, color: tone.accent }}>
                          {c.foto ? <img src={c.foto} alt="" className="w-full h-full object-cover" /> : c.nombre.split(' ').slice(0, 2).map(w => w[0]).join('')}
                        </div>
                        {proximity === 'today' && (
                          <motion.span
                            className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white"
                            style={{ background: '#EC4899' }}
                            animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }}
                          />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate leading-tight">{c.nombre}</p>
                        <p className="text-[10px] font-bold mt-0.5 flex items-center gap-1" style={{ color: tone.accent }}>
                          <Cake size={9} /> {c.label}{c.turningAge ? ` · ${c.turningAge}` : ''}
                        </p>
                        {/* Barra de proximidad: llena = menos días */}
                        {!c.isToday && c.daysUntil <= 30 && (
                          <div className="mt-1 h-[3px] w-full rounded-full overflow-hidden" style={{ background: `${tone.ring}1f` }}>
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: tone.ring }}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.max(6, 100 - (c.daysUntil / 30) * 100)}%` }}
                              transition={{ duration: 0.6, ease: 'easeOut' }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Counter */}
                      {proximity === 'today' ? (
                        <motion.span
                          className="px-2 py-1 rounded-lg text-[9px] font-black text-white shrink-0 shadow-sm"
                          style={{ background: 'linear-gradient(135deg, #EC4899, #7C3AED)' }}
                          animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1.4, repeat: Infinity }}
                        >HOY</motion.span>
                      ) : (
                        <div className="text-right shrink-0">
                          <motion.p
                            className="text-base font-black leading-none tabular-nums"
                            style={{ color: tone.accent, fontFamily: 'Sora, sans-serif' }}
                            animate={proximity === 'imminent' ? { scale: [1, 1.12, 1] } : {}}
                            transition={{ duration: 1.4, repeat: Infinity }}
                          >{c.daysUntil}</motion.p>
                          <p className="text-[8px] font-black uppercase tracking-wider" style={{ color: tone.accent, opacity: 0.7 }}>{c.daysUntil === 1 ? 'día' : 'días'}</p>
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </motion.div>
            </motion.div>
          )}

          {false && (
          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-2">
            <button onClick={() => setShowExportar(true)} title="Exportar Excel"
              className={`relative w-full flex items-center ${actionAlign} gap-2 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/20 text-[11px] font-black transition-all active:scale-95 tracking-wider`}>
              <FileSpreadsheet size={16} className="shrink-0" /> <span className={actionLabel}>EXCEL</span>
            </button>
            <Link
              href="/vacaciones"
              title={vacacionesPendientesPreview.length ? `Pendientes: ${vacacionesPendientesPreview.join(', ')}` : 'Sin solicitudes pendientes'}
              className={`relative w-full flex items-center ${sidebarOpen ? 'justify-between px-3' : 'justify-center px-0'} gap-3 h-11 rounded-xl border text-[11px] font-black transition-all active:scale-95 tracking-wider ${
                vacacionesPendientes > 0
                  ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-500/20 border-orange-200 dark:border-orange-500/30 shadow-[0_0_0_1px_rgba(249,115,22,0.18)]'
                  : 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-500/20 border-sky-200 dark:border-sky-500/20'
              }`}
            >
              <span className="flex items-center gap-2">
                <CalendarDays size={16} className="shrink-0" />
                <span className={actionLabel}>{vacacionesPendientes > 0 ? 'VACACIONES ALERTA' : 'VACACIONES'}</span>
              </span>
              {vacacionesPendientes > 0 ? (
                <span className={`${sidebarOpen ? 'flex' : 'absolute -right-1 -top-1 flex'} items-center gap-2`}>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-500 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-500" />
                  </span>
                  <span className={`rounded-full bg-white/80 dark:bg-slate-950/60 ${sidebarOpen ? 'px-2 py-0.5' : 'min-w-5 h-5 flex items-center justify-center'} text-[10px] font-black tabular-nums`}>
                    {vacacionesPendientes}
                  </span>
                </span>
              ) : (
                sidebarOpen && <span className="text-[10px] font-bold opacity-70">OK</span>
              )}
            </Link>
            <Link
              href={`/metricas?from=${format(subDays(fechaActual, 29), 'yyyy-MM-dd')}&to=${format(fechaActual, 'yyyy-MM-dd')}`}
              title="Analítica"
              className={`relative w-full flex items-center ${actionAlign} gap-2 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/20 text-[11px] font-black transition-all active:scale-95 tracking-wider`}>
              <BarChart3 size={16} className="shrink-0" /> <span className={actionLabel}>ANALÍTICA</span>
            </Link>
            <Link
              href={`/ranking?date=${format(fechaActual, 'yyyy-MM-dd')}&from=admin`}
              title="Ranking"
              className={`relative w-full flex items-center ${actionAlign} gap-2 h-11 rounded-xl bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-500/20 border border-fuchsia-200 dark:border-fuchsia-500/25 shadow-[0_8px_22px_rgba(217,70,239,0.08)] text-[11px] font-black transition-all active:scale-95 tracking-wider`}>
              <Trophy size={16} className="shrink-0" /> <span className={actionLabel}>RANKING</span>
            </Link>
            <button onClick={cargarMetricas} hidden
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/20 text-[11px] font-black transition-all active:scale-95 tracking-wider">
              {metricasLoading ? <Loader2 size={13} className="animate-spin" /> : <BarChart3 size={13} />} MÉTRICAS
            </button>
            <button onClick={() => { setFeriadoFecha(format(addDays(fechaActual, 1), 'yyyy-MM-dd')); setShowFeriado(true) }} title="Modo feriado"
              className={`relative w-full flex items-center ${actionAlign} gap-2 h-11 rounded-xl bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-500/20 border border-teal-200 dark:border-teal-500/25 shadow-[0_8px_22px_rgba(20,184,166,0.08)] text-[11px] font-black transition-all active:scale-95 tracking-wider`}>
              <CalendarDays size={16} className="shrink-0" /> <span className={actionLabel}>MODO FERIADO</span>
            </button>
            <Link href="/descansos-medicos" title={descansosPendientesPreview.length ? `Pendientes: ${descansosPendientesPreview.join(', ')}` : 'Sin solicitudes pendientes'}
              className={`relative w-full flex items-center ${sidebarOpen ? 'justify-between px-3' : 'justify-center px-0'} gap-3 h-11 rounded-xl border text-[11px] font-black transition-all active:scale-95 tracking-wider ${
                descansosPendientes > 0
                  ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/20 border-rose-300 dark:border-rose-500/35 shadow-[0_0_0_1px_rgba(244,63,94,0.2)]'
                  : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/20 border-rose-200 dark:border-rose-500/25 shadow-[0_8px_22px_rgba(244,63,94,0.08)]'
              }`}>
              <span className="flex items-center gap-2">
                <Stethoscope size={16} className="shrink-0" />
                <span className={actionLabel}>{descansosPendientes > 0 ? 'DESCANSO ALERTA' : 'DESCANSO MEDICO'}</span>
              </span>
              {descansosPendientes > 0 ? (
                <span className={`${sidebarOpen ? 'flex' : 'absolute -right-1 -top-1 flex'} items-center gap-2`}>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                  </span>
                  <span className={`rounded-full bg-white/80 dark:bg-slate-950/60 ${sidebarOpen ? 'px-2 py-0.5' : 'min-w-5 h-5 flex items-center justify-center'} text-[10px] font-black tabular-nums`}>{descansosPendientes}</span>
                </span>
              ) : (sidebarOpen && <span className="text-[10px] font-bold opacity-70">OK</span>)}
            </Link>
            <AnimatePresence>
              {modoEdicion && (
                <motion.button initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  onClick={() => setShowManual(true)} title="Registro manual"
                  className={`w-full flex items-center ${actionAlign} gap-2 h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-black transition-all shadow-md shadow-blue-600/20 active:scale-95 tracking-wider`}>
                  <UserPlus size={16} className="shrink-0" /> <span className={actionLabel}>MANUAL</span>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          )}

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
            {totalDescansosMedicos > 0 && <StatCard title="Descanso Medico" value={totalDescansosMedicos} icon={<Stethoscope size={16} />} color="bg-fuchsia-500" sub="justificados" />}
            {totalOffline > 0 && <StatCard title="Offline" value={totalOffline} icon={<span className="text-xs">📵</span>} color="bg-violet-500" sub="sincronizados" />}
            {totalInasistencias > 0 && <StatCard title="Inasistencias" value={totalInasistencias} icon={<span className="text-xs">✗</span>} color="bg-orange-500" sub="sin marcar" />}
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

            {/* ── Pestañas por empresa ─────────────────────────────────────── */}
            <div className="border-b border-slate-100 dark:border-slate-800 px-3 py-2.5 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                {EMPRESA_TABS.map(tab => {
                  const active = filtroEmpresa === tab.id
                  const count = empresaCounts[tab.id] ?? 0
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setFiltroEmpresa(tab.id)}
                      className="relative shrink-0 flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] transition-all"
                      style={{
                        background: active
                          ? `linear-gradient(90deg, ${tab.colors[0]}, ${tab.colors[1]})`
                          : 'transparent',
                        color: active ? '#fff' : 'var(--tab-fg, #64748b)',
                        border: `1.5px solid ${active ? 'transparent' : tab.border}`,
                        boxShadow: active ? `0 6px 16px ${tab.colors[0]}44` : 'none',
                      }}
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: active ? '#fff' : tab.colors[0] }}
                      />
                      {tab.label}
                      <span
                        className="ml-0.5 rounded-full px-1.5 py-[1px] text-[10px] tabular-nums"
                        style={{
                          background: active ? 'rgba(255,255,255,0.25)' : `${tab.colors[0]}1A`,
                          color: active ? '#fff' : tab.colors[0],
                        }}
                      >
                        {count}
                      </span>
                    </button>
                  )
                })}
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
                          onAbrirNota={n => setNotaModal(n)} onBorrarNota={borrarNota}
                          onBorrarRegistro={borrarRegistro} onActualizarNombre={actualizarNombre}
                          onDarDeBaja={darDeBajaTrabajador} />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                </div>
              ) : (
                <div className="w-full h-full min-h-[400px] relative">
                  {process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? (
                    <MapGL ref={mapRef}
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
                      {/* Oficina principal: agrupa los ingresos por QR (sin GPS en la nota) */}
                      {mapData.oficina.length > 0 && (
                        <Marker latitude={OFICINA_LAT} longitude={OFICINA_LON} anchor="bottom">
                          <div className="relative flex flex-col items-center group cursor-pointer">
                            <div className="pointer-events-none absolute left-1/2 bottom-full mb-3 -translate-x-1/2 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200 z-40 w-72">
                              <div className="rounded-2xl border border-white/60 bg-white/95 backdrop-blur-xl shadow-2xl overflow-hidden">
                                <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-400" />
                                <div className="p-3">
                                  <p className="font-black text-xs text-slate-900 uppercase">Oficina principal</p>
                                  <p className="text-[9px] text-slate-400 mb-2">
                                    {mapData.oficina.length} ingreso{mapData.oficina.length === 1 ? '' : 's'} por QR · GPS validado a 50 m
                                  </p>
                                  <div className="max-h-40 overflow-y-auto space-y-1">
                                    {mapData.oficina.slice(0, 12).map((o: any) => (
                                      <div key={o.id} className="flex items-center gap-2">
                                        <span className={`w-1.5 h-1.5 rounded-full ${o.estado_ingreso === 'PUNTUAL' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                        <span className="text-[10px] font-bold text-slate-700 truncate flex-1">{o.nombres_completos}</span>
                                        <span className="text-[9px] tabular-nums text-slate-400">{horaEnPais(o.hora_ingreso, o.pais)}</span>
                                      </div>
                                    ))}
                                    {mapData.oficina.length > 12 && (
                                      <p className="text-[9px] text-slate-400 pt-1">+{mapData.oficina.length - 12} más…</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="relative">
                              <span className="absolute inset-0 rounded-2xl bg-emerald-400/40 animate-ping" />
                              <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 border-2 border-white shadow-xl flex items-center justify-center">
                                <ShieldCheck size={20} className="text-white" />
                              </div>
                              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-slate-900 text-white text-[10px] font-black flex items-center justify-center border-2 border-white tabular-nums">
                                {mapData.oficina.length}
                              </span>
                            </div>
                          </div>
                        </Marker>
                      )}

                      <FullscreenControl position="top-right" />
                      <NavigationControl position="top-right" visualizePitch />
                      <GeolocateControl position="top-right" />
                    </MapGL>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                      <MapIcon size={36} className="mb-3 opacity-40" />
                      <p className="font-bold text-sm">Falta NEXT_PUBLIC_MAPBOX_TOKEN</p>
                    </div>
                  )}
                  <div className="absolute top-3 left-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Leyenda</p>
                    {[
                      { color: 'bg-gradient-to-br from-emerald-600 to-teal-500', label: `Oficina (${mapData.oficina.length})` },
                      { color: 'bg-blue-500', label: 'Obra' },
                      { color: 'bg-purple-500', label: 'Externo' },
                      { color: 'bg-amber-500', label: 'Nocturno' },
                      { color: 'bg-sky-500', label: 'Remoto' },
                      { color: 'bg-slate-500', label: 'Nota GPS' },
                    ].map(l => (
                      <div key={l.label} className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        <div className={`w-2 h-2 rounded-full ${l.color}`} />{l.label}
                      </div>
                    ))}
                  </div>

                  {/* Resumen de cobertura: deja claro qué se ve y qué no */}
                  <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
                    <span className="rounded-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-2.5 py-1.5 text-[9px] font-black text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 shadow-lg">
                      📍 {mapData.campo.length} en campo · 🏢 {mapData.oficina.length} en oficina
                    </span>
                    {mapData.sinUbicacion.length > 0 && (
                      <span
                        className="rounded-lg bg-amber-50/95 dark:bg-amber-500/15 backdrop-blur-md px-2.5 py-1.5 text-[9px] font-black text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 shadow-lg"
                        title="Marcaciones reales sin coordenadas (remoto sin GPS o sincronizadas offline). No se ubican en el mapa para no inventar posiciones."
                      >
                        ⚠️ {mapData.sinUbicacion.length} sin ubicación
                      </span>
                    )}
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
            style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(14px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowExportar(false)}>
            <motion.div className="relative w-full max-w-md rounded-3xl overflow-hidden shadow-2xl shadow-emerald-500/20"
              initial={{ scale: 0.9, y: 24, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              onClick={e => e.stopPropagation()}>
              {/* Hero header */}
              <div className="relative px-6 pt-6 pb-7" style={{ background: 'linear-gradient(135deg, #059669 0%, #10B981 50%, #06B6D4 100%)' }}>
                {/* Decorative blobs */}
                <motion.div className="pointer-events-none absolute -top-12 -right-10 w-40 h-40 rounded-full bg-white/15 blur-3xl"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }} transition={{ duration: 3.4, repeat: Infinity }} />
                <motion.div className="pointer-events-none absolute -bottom-10 -left-8 w-36 h-36 rounded-full bg-cyan-300/25 blur-3xl"
                  animate={{ scale: [1.1, 1, 1.1], opacity: [0.5, 0.8, 0.5] }} transition={{ duration: 4, repeat: Infinity }} />
                <button onClick={() => setShowExportar(false)}
                  className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur flex items-center justify-center text-white transition">
                  <X size={16} />
                </button>
                <div className="relative flex items-center gap-3.5">
                  <motion.div className="w-14 h-14 rounded-2xl bg-white/95 flex items-center justify-center shadow-lg text-emerald-600"
                    animate={{ y: [0, -4, 0], rotate: [0, -5, 5, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
                    <FileSpreadsheet size={26} strokeWidth={2.4} />
                  </motion.div>
                  <div>
                    <p className="text-[10px] font-black text-white/70 uppercase tracking-[0.18em]">Reporte</p>
                    <h3 className="font-black text-xl text-white tracking-tight" style={{ fontFamily: 'Sora, sans-serif' }}>Exportar Excel</h3>
                    <p className="text-[11px] font-bold text-white/70 mt-0.5">Descarga asistencia en XLSX</p>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="bg-white dark:bg-slate-900 p-5 space-y-4">
                {/* Tabs */}
                <div className="relative flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
                  {[{ v: 'dia', l: 'Día actual', icon: <CalendarDays size={12} /> }, { v: 'rango', l: 'Por rango', icon: <Activity size={12} /> }].map(t => (
                    <button key={t.v} onClick={() => setTipoExport(t.v as any)}
                      className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-black rounded-xl transition-all ${tipoExport === t.v ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}>
                      {tipoExport === t.v && (
                        <motion.span layoutId="export-tab-pill" className="absolute inset-0 bg-white dark:bg-slate-700 rounded-xl shadow-sm"
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                      )}
                      <span className="relative flex items-center gap-1.5">{t.icon}{t.l}</span>
                    </button>
                  ))}
                </div>

                {/* Content por tipo */}
                <AnimatePresence mode="wait">
                  {tipoExport === 'dia' ? (
                    <motion.div key="dia"
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                      className="relative overflow-hidden rounded-2xl border border-emerald-100 dark:border-emerald-500/20 p-5"
                      style={{ background: 'linear-gradient(135deg, #ECFDF5, #F0FDFA)' }}>
                      <div className="flex items-baseline justify-center gap-2">
                        <motion.span
                          className="text-5xl font-black text-emerald-600 tabular-nums"
                          style={{ fontFamily: 'Sora, sans-serif' }}
                          initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 320, damping: 20 }}>
                          {filtradas.length}
                        </motion.span>
                        <span className="text-xs font-black text-emerald-700 uppercase tracking-widest">registros</span>
                      </div>
                      <p className="text-center text-[11px] font-bold text-slate-500 mt-1 capitalize">
                        {format(fechaActual, "EEEE d 'de' MMMM yyyy", { locale: es })}
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div key="rango"
                      initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                      className="grid grid-cols-2 gap-3">
                      {[{ label: 'Desde', value: exportDesde, onChange: setExportDesde }, { label: 'Hasta', value: exportHasta, onChange: setExportHasta }].map(f => (
                        <div key={f.label} className="relative">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 flex items-center gap-1">
                            <CalendarDays size={9} /> {f.label}
                          </label>
                          <input type="date" value={f.value} onChange={e => f.onChange(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950/50 border-2 border-slate-200 dark:border-slate-800 px-3 py-2.5 rounded-xl outline-none focus:border-emerald-500 text-sm font-bold transition" />
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Format chips */}
                <div className="flex flex-wrap items-center gap-1.5 px-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Incluye</span>
                  {['Nombres', 'DNI', 'Área', 'Ingreso/Salida', 'Duración', 'Mapa GPS'].map(c => (
                    <span key={c} className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{c}</span>
                  ))}
                </div>

                {/* Action */}
                <motion.button
                  onClick={ejecutarExport} disabled={exportando}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  className="relative w-full overflow-hidden text-white font-black py-3.5 rounded-2xl flex justify-center items-center gap-2 disabled:opacity-60 text-sm shadow-lg shadow-emerald-500/30"
                  style={{ background: 'linear-gradient(135deg, #059669, #10B981, #06B6D4)', fontFamily: 'Sora, sans-serif' }}>
                  {exportando
                    ? <><Loader2 className="animate-spin" size={18} /><span>GENERANDO XLSX...</span></>
                    : <><Download size={16} /><span className="tracking-wider">DESCARGAR EXCEL</span></>}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPreview && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(15,23,42,0.66)', backdropFilter: 'blur(12px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowPreview(false)}>
            <motion.div className="w-full max-w-6xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
              initial={{ scale: 0.94, y: 18 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 18 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              onClick={e => e.stopPropagation()}>
              <div className="h-1.5 bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-400" />
              <div className="max-h-[86vh] overflow-y-auto p-5 sm:p-6">
                <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                      <CalendarDays size={12} /> Vista previa de rango
                    </div>
                    <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Entradas, salidas y horas</h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Selecciona un intervalo, filtra por area y revisa las horas acumuladas antes de exportar.</p>
                  </div>
                  <button onClick={() => setShowPreview(false)} className="self-start rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><X size={16} /></button>
                </div>

                <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.25fr_1.25fr_auto]">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Desde</span>
                    <input type="date" value={previewDesde} onChange={e => setPreviewDesde(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-black outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Hasta</span>
                    <input type="date" value={previewHasta} onChange={e => setPreviewHasta(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-black outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Area</span>
                    <select value={previewArea} onChange={e => setPreviewArea(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-black outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950">
                      {previewAreas.map(area => <option key={area} value={area}>{area === 'TODAS' ? 'Todas las areas' : area}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Buscar</span>
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input value={previewBusqueda} onChange={e => setPreviewBusqueda(e.target.value)} placeholder="Nombre o DNI"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-bold outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" />
                    </div>
                  </label>
                  <div className="flex items-end">
                    <button onClick={() => {
                      const range = weekRangeFor(fechaActual)
                      setPreviewDesde(range.from)
                      setPreviewHasta(range.to)
                    }} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-[11px] font-black text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                      LUN-DOM
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    { label: 'Registros', value: previewFiltradas.length, color: 'text-blue-600', sub: `${previewTrabajadores} trabajadores` },
                    { label: 'Con salida', value: previewConSalida, color: 'text-emerald-600', sub: 'turnos cerrados' },
                    { label: 'Horas total', value: formatMinutos(previewTotalMinutos), color: 'text-indigo-600', sub: 'del filtro' },
                    { label: 'Promedio', value: formatMinutos(previewConSalida ? Math.round(previewTotalMinutos / previewConSalida) : 0), color: 'text-sky-600', sub: 'por salida' },
                    { label: 'Rango', value: dateKeysBetween(previewDesde, previewHasta).length, color: 'text-slate-700 dark:text-slate-200', sub: 'dias' },
                  ].map(item => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">{item.label}</p>
                      <p className={`mt-1 text-2xl font-black tabular-nums ${item.color}`}>{item.value}</p>
                      <p className="mt-0.5 text-[10px] font-bold text-slate-400">{item.sub}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Detalle del intervalo</p>
                    {previewLoading && <span className="inline-flex items-center gap-2 text-[11px] font-black text-blue-600"><Loader2 size={13} className="animate-spin" /> Cargando</span>}
                  </div>
                  <div className="max-h-[420px] overflow-auto">
                    {previewLoading ? (
                      <div className="flex justify-center py-16"><CustomLoader text="Cargando rango..." /></div>
                    ) : previewFiltradas.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
                        <Search size={34} />
                        <p className="text-sm font-black">Sin registros para ese filtro</p>
                      </div>
                    ) : (
                      <table className="min-w-[920px] w-full text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                          <tr>
                            <th className="px-4 py-3">Fecha</th>
                            <th className="px-4 py-3">Trabajador</th>
                            <th className="px-4 py-3">Area</th>
                            <th className="px-4 py-3 text-center">Entrada</th>
                            <th className="px-4 py-3 text-center">Salida</th>
                            <th className="px-4 py-3 text-center">Horas</th>
                            <th className="px-4 py-3 text-center">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {previewFiltradas.map((item) => {
                            const horas = calcHoras(item.hora_ingreso, item.hora_salida)
                            return (
                              <tr key={item.id} className="bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60">
                                <td className="px-4 py-3 font-black text-slate-600 dark:text-slate-300">
                                  <span className="capitalize">{format(new Date(`${item.fecha}T12:00:00`), 'EEE d MMM', { locale: es })}</span>
                                  <p className="font-mono text-[10px] font-bold text-slate-400">{item.fecha}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-[11px] font-black text-slate-500 dark:bg-slate-800">
                                      {item.foto_url ? <img src={item.foto_url} alt="" className="h-full w-full object-cover" /> : getInitials(item.nombres_completos)}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="max-w-[260px] truncate font-black text-slate-900 dark:text-white">{item.nombres_completos}</p>
                                      <p className="font-mono text-[10px] font-bold text-slate-400">{item.dni}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400">{item.area || 'SIN AREA'}</td>
                                <td className="px-4 py-3 text-center font-black tabular-nums text-emerald-600">{formatRecordTime(item, item.hora_ingreso)}</td>
                                <td className="px-4 py-3 text-center font-black tabular-nums text-slate-700 dark:text-slate-200">{formatRecordTime(item, item.hora_salida)}</td>
                                <td className="px-4 py-3 text-center font-black tabular-nums text-blue-600">{horas}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${item.estado_ingreso === 'PUNTUAL' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : item.estado_ingreso === 'INASISTENCIA' ? 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300' : item.estado_ingreso === 'DESCANSO MEDICO' ? 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-300' : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'}`}>
                                    {item.estado_ingreso}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMetricas && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(15,23,42,0.68)', backdropFilter: 'blur(12px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowMetricas(false)}>
            <motion.div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-[28px] shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
              initial={{ scale: 0.94, y: 18 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 18 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              onClick={e => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-indigo-600 via-sky-500 to-emerald-500 h-1.5" />
              <div className="p-6 sm:p-7 max-h-[85vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1 text-[11px] font-black tracking-[0.14em] text-indigo-700 dark:text-indigo-300 uppercase">
                      <TrendingUp size={12} /> Analítica Operativa
                    </div>
                    <h3 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">Métricas de Asistencia</h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Vista del día seleccionado y tendencia reciente: {metricasData?.rangeLabel}</p>
                  </div>
                  <button onClick={() => setShowMetricas(false)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
                </div>

                {metricasData && (
                  <>
                    <div className="grid grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
                      {[
                        { label: 'Total Día', value: metricasData.resumenDia.total, color: 'from-slate-700 to-slate-900' },
                        { label: 'Puntuales', value: metricasData.resumenDia.puntuales, color: 'from-emerald-500 to-teal-500' },
                        { label: 'Tardanzas', value: metricasData.resumenDia.tardanzas, color: 'from-rose-500 to-red-500' },
                        { label: 'Inasistencias', value: metricasData.resumenDia.inasistencias, color: 'from-orange-500 to-amber-500' },
                        { label: 'Con Salida', value: metricasData.resumenDia.conSalida, color: 'from-blue-500 to-indigo-500' },
                        { label: 'Reingresos', value: metricasData.resumenDia.reingresos, color: 'from-violet-500 to-fuchsia-500' },
                      ].map((item, index) => (
                        <motion.div
                          key={item.label}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.04 }}
                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 shadow-sm"
                        >
                          <div className={`h-1.5 rounded-full bg-gradient-to-r ${item.color} mb-4`} />
                          <p className="text-[10px] font-black tracking-[0.14em] uppercase text-slate-400">{item.label}</p>
                          <p className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white tabular-nums">{item.value}</p>
                        </motion.div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-5">
                      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-5">
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <div>
                            <p className="text-[10px] font-black tracking-[0.14em] uppercase text-slate-400">Tendencia 14 días</p>
                            <h4 className="text-lg font-black text-slate-900 dark:text-white">Puntualidad vs tardanza vs inasistencia</h4>
                          </div>
                          <div className="text-right text-[11px] text-slate-400">
                            <div>Mejor: <span className="font-black text-emerald-600">{metricasData.bestDay?.fecha ?? '-'}</span></div>
                            <div>Crítico: <span className="font-black text-orange-600">{metricasData.worstDay?.fecha ?? '-'}</span></div>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {metricasData.trend.map((item: any, index: number) => {
                            const max = Math.max(item.total, 1)
                            return (
                              <motion.div key={item.fecha} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.02 }}>
                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1">
                                  <span>{item.fecha}</span>
                                  <span>{item.total} registros</span>
                                </div>
                                <div className="flex h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                                  <div className="bg-emerald-500" style={{ width: `${(item.puntuales / max) * 100}%` }} />
                                  <div className="bg-red-500" style={{ width: `${(item.tardanzas / max) * 100}%` }} />
                                  <div className="bg-orange-500" style={{ width: `${(item.inasistencias / max) * 100}%` }} />
                                </div>
                              </motion.div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5">
                        <p className="text-[10px] font-black tracking-[0.14em] uppercase text-slate-400">Áreas del día</p>
                        <h4 className="text-lg font-black text-slate-900 dark:text-white mb-4">Distribución operativa</h4>
                        <div className="space-y-3">
                          {metricasData.areaBreakdown.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 px-4 py-6 text-center text-sm text-slate-400">Sin datos para el día seleccionado</div>
                          ) : metricasData.areaBreakdown.map((item: any, index: number) => {
                            const ratio = metricasData.resumenDia.total > 0 ? (item.total / metricasData.resumenDia.total) * 100 : 0
                            return (
                              <motion.div key={item.area} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1">
                                  <span className="truncate pr-3">{item.area}</span>
                                  <span className="tabular-nums">{item.total}</span>
                                </div>
                                <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-400" style={{ width: `${ratio}%` }} />
                                </div>
                                <div className="mt-1 flex gap-3 text-[10px] font-bold text-slate-400">
                                  <span className="text-emerald-600">P {item.puntuales}</span>
                                  <span className="text-red-500">T {item.tardanzas}</span>
                                  <span className="text-orange-500">I {item.inasistencias}</span>
                                </div>
                              </motion.div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual */}
      <AnimatePresence>
        {showManual && <ModalManual onClose={() => setShowManual(false)} fechaBase={format(fechaActual, 'yyyy-MM-dd')} onSuccess={r => { setAsistencias(p => sortRecordsByStatus([r, ...p])); setShowManual(false) }} />}
      </AnimatePresence>

      <AnimatePresence>
        {showFeriado && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(15,23,42,0.58)', backdropFilter: 'blur(10px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowFeriado(false)}>
            <motion.div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              onClick={e => e.stopPropagation()}>
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">Calendario laboral</p>
                  <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">Modo feriado</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">La fecha elegida no generara inasistencias automaticas.</p>
                </div>
                <button onClick={() => setShowFeriado(false)} className="rounded-xl border border-slate-200 p-2 text-slate-400 dark:border-slate-700"><X size={16} /></button>
              </div>
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Fecha</span>
                  <input type="date" value={feriadoFecha} onChange={e => setFeriadoFecha(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black outline-none dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Motivo</span>
                  <input value={feriadoMotivo} onChange={e => setFeriadoMotivo(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-950"
                    placeholder="Feriado" />
                </label>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button onClick={() => setShowFeriado(false)} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-black dark:border-slate-700">CANCELAR</button>
                <button onClick={guardarFeriado} disabled={feriadoSaving} className="rounded-xl bg-amber-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50">
                  {feriadoSaving ? 'GUARDANDO...' : 'ACTIVAR'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDescansoMedico && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(15,23,42,0.58)', backdropFilter: 'blur(10px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowDescansoMedico(false)}>
            <motion.div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-5 shadow-2xl dark:border-rose-500/20 dark:bg-slate-900"
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              onClick={e => e.stopPropagation()}>
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="flex gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                    <Stethoscope size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-600">Justificacion laboral</p>
                    <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">Descanso medico</h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Registra el rango para que no se marque como inasistencia.</p>
                  </div>
                </div>
                <button onClick={() => setShowDescansoMedico(false)} className="rounded-xl border border-slate-200 p-2 text-slate-400 dark:border-slate-700"><X size={16} /></button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">DNI</span>
                  <input inputMode="numeric" value={descansoDni} onChange={e => setDescansoDni(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black outline-none focus:border-rose-400 dark:border-slate-700 dark:bg-slate-950"
                    placeholder="12345678" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Desde</span>
                  <input type="date" value={descansoDesde} onChange={e => setDescansoDesde(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black outline-none focus:border-rose-400 dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Hasta</span>
                  <input type="date" value={descansoHasta} onChange={e => setDescansoHasta(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black outline-none focus:border-rose-400 dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Motivo / nota</span>
                  <textarea value={descansoMotivo} onChange={e => setDescansoMotivo(e.target.value)}
                    className="min-h-[88px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-rose-400 dark:border-slate-700 dark:bg-slate-950"
                    placeholder="Diagnostico, descanso, observacion..." />
                </label>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button onClick={() => setShowDescansoMedico(false)} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-black dark:border-slate-700">CANCELAR</button>
                <button onClick={guardarDescansoMedico} disabled={descansoSaving} className="rounded-xl bg-rose-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50">
                  {descansoSaving ? 'GUARDANDO...' : 'REGISTRAR'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
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
                const grads: Record<TipoMarcacion, string> = { ingreso_obra: 'from-blue-500 to-cyan-400', salida_obra: 'from-red-500 to-rose-400', externo: 'from-purple-500 to-fuchsia-400', nocturno: 'from-amber-500 to-orange-400', remoto: 'from-teal-600 to-indigo-500', nota: 'from-slate-400 to-slate-500', ninguna: 'from-slate-300 to-slate-400' }
                const icons: Record<TipoMarcacion, React.ReactNode> = { ingreso_obra: <HardHat size={20} className="text-blue-500" />, salida_obra: <MapPin size={20} className="text-red-500" />, externo: <Store size={20} className="text-purple-500" />, nocturno: <Moon size={20} className="text-amber-500" />, remoto: <Laptop size={20} className="text-sky-500" />, nota: <MessageSquareText size={20} className="text-slate-500" />, ninguna: <MessageSquareText size={20} className="text-slate-400" /> }
                const lbls: Record<TipoMarcacion, string> = { ingreso_obra: 'Ingreso en Obra', salida_obra: 'Salida de Obra', externo: 'Marcación Externa', nocturno: 'Turno Nocturno', remoto: 'Trabajo Remoto', nota: 'Nota', ninguna: 'Sin tipo' }
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
      .then(({ data }) => {
        if (data) {
          setTrabajadores(
            data
              .filter((item: any) => !isInactiveArea(item.area))
              .map((item: any) => ({ ...item, area: getVisibleArea(item.area) }))
          )
        }
        setLoadingP(false)
      })
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

function FotocheckRow({ data, index, modoEdicion, onActualizar, onCambiarEstado, onAbrirNota, onBorrarNota, onBorrarRegistro, onActualizarNombre, onDarDeBaja }: {
  data: any; index: number; modoEdicion: boolean
  onActualizar: (id: string, campo: 'hora_ingreso' | 'hora_salida', hora: string | null, fechaBase: string) => void
  onCambiarEstado: (id: string, estadoActual: string) => void
  onAbrirNota: (n: any) => void
  onBorrarNota: (id: string) => void
  onBorrarRegistro: (id: string, nombre: string) => void
  onActualizarNombre: (id: string, dni: string, nuevoNombre: string) => void
  onDarDeBaja: (dni: string, nombre: string, areaActual?: string | null) => void
}) {
  const [editandoNombre, setEditandoNombre] = useState(false)
  const [nombreTemp, setNombreTemp] = useState(data.nombres_completos)
  const esSintetica = !!data._syntheticInasistencia
  const esInasistencia = data.estado_ingreso === 'INASISTENCIA'
  const esDescansoMedico = data.estado_ingreso === 'DESCANSO MEDICO'
  const esVacaciones = data.estado_ingreso === 'VACACIONES'
  const esFeriado = data.estado_ingreso === 'FERIADO'
  const isPuntual  = data.estado_ingreso === 'PUNTUAL'
  const entroAyer  = !!data._entroAyer
  const saleHoy    = !!data._saleHoy
  const tieneSalida = !!data.hora_salida
  const nota   = extraerDetalleNota(data.notas)
  const tone   = getMarkerTone(nota.tipoMarcacion)
  const NIcon  = tone.icon
  const horas  = (esDescansoMedico || esVacaciones || esFeriado) ? '—' : calcHoras(data.hora_ingreso, data.hora_salida)
  const esNocturno = data.notas?.startsWith('Turno Nocturno') ?? false
  const esRemoto   = data.notas?.startsWith('Trabajo Remoto') ?? false
  // Trabajador fuera de Perú: se muestra su hora local + bandera para evitar confusión
  const esOtroPais = Boolean(data.pais) && data.pais !== DEFAULT_COUNTRY
  const esOffline  = (data.notas ?? '').includes('[OFFLINE]')
  const hasBadge = entroAyer || saleHoy || esOffline || esInasistencia || esDescansoMedico || esVacaciones || esFeriado || esRemoto
  const puedeEditarRegistro = modoEdicion && (!esSintetica || esInasistencia || esDescansoMedico)

  // Acentos por estado para gradient + ring del card
  const accent = esFeriado ? { ring: '#0D9488', tint: 'rgba(13,148,136,0.05)', border: 'rgba(45,212,191,0.5)' }
    : esVacaciones ? { ring: '#0891B2', tint: 'rgba(8,145,178,0.06)', border: 'rgba(34,211,238,0.45)' }
    : esDescansoMedico ? { ring: '#A21CAF', tint: 'rgba(217,70,239,0.06)', border: 'rgba(232,121,249,0.45)' }
    : esInasistencia ? { ring: '#F97316', tint: 'rgba(249,115,22,0.06)', border: 'rgba(251,146,60,0.45)' }
    : entroAyer || saleHoy ? { ring: '#D97706', tint: 'rgba(245,158,11,0.05)', border: 'rgba(252,211,77,0.5)' }
    : esOffline ? { ring: '#7C3AED', tint: 'rgba(124,58,237,0.05)', border: 'rgba(167,139,250,0.45)' }
    : isPuntual ? { ring: '#059669', tint: 'rgba(16,185,129,0.04)', border: 'rgba(167,243,208,0.7)' }
    : { ring: '#DC2626', tint: 'rgba(239,68,68,0.05)', border: 'rgba(252,165,165,0.6)' }

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 380, damping: 28 } } }}
      whileHover={{ scale: 1.005, y: -2 }}
      transition={{ duration: 0.2 }}
      className={`group relative flex items-center justify-between rounded-2xl border bg-white dark:bg-slate-900 shadow-sm hover:shadow-lg hover:shadow-slate-900/5 transition-all
        ${hasBadge ? 'pt-7 pb-4 px-4 sm:pt-8 sm:pb-5 sm:px-5' : 'p-4 sm:p-5'}`}
      style={{
        borderColor: accent.border,
        backgroundImage: `linear-gradient(135deg, ${accent.tint}, transparent 45%)`,
      }}
    >
      {/* Barra acento lateral izquierda */}
      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-10 w-1 rounded-r-full" style={{ background: accent.ring }} />

      {entroAyer && (
        <div className="absolute -top-2.5 left-4 z-10 flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[8px] font-black px-2.5 py-1 rounded-full shadow-md shadow-amber-500/30">
          <Moon size={8} /> NOCTURNO · Entró {new Date(data.hora_ingreso).toLocaleTimeString('es-PE', { timeZone:'America/Lima', hour:'2-digit', minute:'2-digit', hour12:true })} · Sale mañana
        </div>
      )}
      {saleHoy && (
        <div className="absolute -top-2.5 left-4 z-10 flex items-center gap-1 bg-gradient-to-r from-indigo-500 to-blue-500 text-white text-[8px] font-black px-2.5 py-1 rounded-full shadow-md shadow-indigo-500/30">
          <Moon size={8} /> SALIDA HOY · Entró ayer {new Date(data.hora_ingreso).toLocaleTimeString('es-PE', { timeZone:'America/Lima', hour:'2-digit', minute:'2-digit', hour12:true })}
          {data.hora_salida && ` · Salió ${new Date(data.hora_salida).toLocaleTimeString('es-PE', { timeZone:'America/Lima', hour:'2-digit', minute:'2-digit', hour12:true })}`}
        </div>
      )}
      {esOffline && (
        <div className="absolute -top-2.5 left-4 z-10 flex items-center gap-1 bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[8px] font-black px-2.5 py-1 rounded-full shadow-md shadow-violet-500/30">
          📵 SIN CONEXIÓN · Sincronizado offline
        </div>
      )}
      {esRemoto && (
        <div className="absolute -top-2.5 left-4 z-10 flex items-center gap-1 bg-gradient-to-r from-teal-600 via-sky-500 to-indigo-500 text-white text-[8px] font-black px-2.5 py-1 rounded-full shadow-md shadow-sky-500/30">
          <Laptop size={8} /> TRABAJO REMOTO · Sin tardanza
        </div>
      )}
      {esInasistencia && (
        <div className="absolute -top-2.5 left-4 z-10 flex items-center gap-1 bg-gradient-to-r from-orange-500 to-red-500 text-white text-[8px] font-black px-2.5 py-1 rounded-full shadow-md shadow-orange-500/30">
          ✗ INASISTENCIA · Sin registro en el día
        </div>
      )}
      {esDescansoMedico && (
        <div className="absolute -top-2.5 left-4 z-10 flex items-center gap-1 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-[8px] font-black px-2.5 py-1 rounded-full shadow-md shadow-fuchsia-500/30">
          <Stethoscope size={8} /> DESCANSO MEDICO · Justificado
        </div>
      )}
      {esVacaciones && (
        <div className="absolute -top-2.5 left-4 z-10 flex items-center gap-1 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-[8px] font-black px-2.5 py-1 rounded-full shadow-md shadow-cyan-500/30">
          🏖️ VACACIONES · Aprobada
        </div>
      )}
      {esFeriado && (
        <div className="absolute -top-2.5 left-4 z-10 flex items-center gap-1 bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-[8px] font-black px-2.5 py-1 rounded-full shadow-md shadow-teal-500/30">
          🎌 FERIADO · Día no laborable
        </div>
      )}

      {/* Avatar */}
      <div className="flex items-center gap-3.5 flex-1 min-w-0 pr-3">
        <div className="relative shrink-0">
          {/* Aro acento */}
          <div className="absolute -inset-0.5 rounded-full opacity-70" style={{ background: `conic-gradient(from 0deg, ${accent.ring}, ${accent.ring}33, ${accent.ring})` }} />
          <div className="relative w-14 h-14 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 ring-2 ring-white dark:ring-slate-900">
            {data.foto_url ? <img src={data.foto_url} alt="" className="w-full h-full object-cover" /> :
              <div className="w-full h-full flex items-center justify-center font-black text-slate-400 text-sm">{getInitials(data.nombres_completos)}</div>}
          </div>
          {/* Status dot */}
          <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-[2.5px] border-white dark:border-slate-900 flex items-center justify-center ${esFeriado ? 'bg-teal-500' : esVacaciones ? 'bg-cyan-500' : esDescansoMedico ? 'bg-fuchsia-500' : esInasistencia ? 'bg-orange-400' : isPuntual ? 'bg-emerald-500' : 'bg-red-500'}`}>
            {isPuntual && !esDescansoMedico && !esInasistencia && !esVacaciones && !esFeriado && <CheckCircle2 size={9} className="text-white" strokeWidth={3} />}
          </div>
          {esNocturno && <div className="absolute -top-0.5 -left-0.5 w-4 h-4 rounded-full bg-amber-400 border-[2.5px] border-white dark:border-slate-900 flex items-center justify-center shadow-sm"><Moon size={8} className="text-white" /></div>}
          {esOffline && !esNocturno && <div className="absolute -top-0.5 -left-0.5 w-4 h-4 rounded-full bg-violet-500 border-[2.5px] border-white dark:border-slate-900 flex items-center justify-center text-white text-[7px] font-black leading-none">📵</div>}
        </div>
        <div className="min-w-0 flex-1">
          {puedeEditarRegistro && editandoNombre ? (
            <div className="flex items-center gap-1.5 mb-0.5">
              <input
                autoFocus
                value={nombreTemp}
                onChange={e => setNombreTemp(e.target.value.toUpperCase())}
                onBlur={() => {
                  if (nombreTemp.trim() && nombreTemp.trim() !== data.nombres_completos) {
                    onActualizarNombre(data.id, data.dni, nombreTemp)
                  }
                  setEditandoNombre(false)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (nombreTemp.trim() && nombreTemp.trim() !== data.nombres_completos) {
                      onActualizarNombre(data.id, data.dni, nombreTemp)
                    }
                    setEditandoNombre(false)
                  }
                  if (e.key === 'Escape') { setNombreTemp(data.nombres_completos); setEditandoNombre(false) }
                }}
                className="flex-1 bg-transparent border-b-2 border-blue-500 outline-none text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight min-w-0"
              />
            </div>
          ) : (
            <div
              className={`flex items-center gap-1 group/name ${puedeEditarRegistro ? 'cursor-pointer' : ''}`}
              onClick={() => { if (puedeEditarRegistro) { setNombreTemp(data.nombres_completos); setEditandoNombre(true) } }}
              title={puedeEditarRegistro ? 'Clic para editar nombre' : undefined}
            >
              <div className="hidden lg:block max-w-[240px] xl:max-w-[300px]">
                <p className="font-black text-slate-800 dark:text-slate-100 text-base uppercase tracking-tight truncate">{data.nombres_completos}</p>
              </div>
              <div className="lg:hidden mq-wrap max-w-[130px] sm:max-w-[200px]">
                <span className="mq-inner font-black text-slate-800 dark:text-slate-100 text-base uppercase tracking-tight">{data.nombres_completos}</span>
              </div>
              {puedeEditarRegistro && <span className="opacity-0 group-hover/name:opacity-100 transition-opacity text-blue-400 shrink-0" title="Editar nombre">✏️</span>}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="px-1.5 py-[1px] rounded-md text-[9px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400">{data.dni}</span>
            {esOtroPais && (
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                title={`Marca en horario de ${countryOf(data.pais).name}`}
              >
                <CountryFlag code={data.pais} size={13} />
                {countryOf(data.pais).name}
              </span>
            )}
            {esRemoto && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black text-white uppercase tracking-wider bg-gradient-to-r from-teal-600 to-indigo-500">
                <Laptop size={9} strokeWidth={3} /> REMOTO
              </span>
            )}
            {data.empresa && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black text-white uppercase tracking-wider"
                style={{
                  background: data.empresa === 'RUAG'
                    ? 'linear-gradient(90deg, #047857, #22C55E)'
                    : data.empresa === 'ARUG'
                    ? 'linear-gradient(90deg, #1D4ED8, #38BDF8)'
                    : 'linear-gradient(90deg, #B45309, #FBBF24)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white/90" />
                {data.empresa}
              </span>
            )}
            <span className="hidden sm:inline-flex items-center gap-1 text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
              {data.area}
            </span>
            {esFeriado ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" /> FERIADO
              </span>
            ) : esVacaciones ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" /> VACACIONES
              </span>
            ) : esDescansoMedico ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300">
                <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500" /> DESCANSO MEDICO
              </span>
            ) : esInasistencia ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> INASISTENCIA
              </span>
            ) : puedeEditarRegistro ? (
              <button onClick={() => onCambiarEstado(data.id, data.estado_ingreso)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black border transition-all hover:scale-105 active:scale-95
                  ${isPuntual ? 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300' : 'bg-red-100 text-red-700 border-red-300 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isPuntual ? 'bg-emerald-500' : 'bg-red-500'}`} />
                {data.estado_ingreso} ⇄
              </button>
            ) : (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black ${isPuntual ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isPuntual ? 'bg-emerald-500' : 'bg-red-500'}`} />
                {data.estado_ingreso}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Times */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Entrada tile */}
        <div className="flex flex-col items-center px-2.5 py-1.5 rounded-xl border bg-white/60 dark:bg-slate-950/40 dark:border-slate-800 min-w-[58px]"
          style={{ borderColor: 'rgba(226,232,240,0.9)' }}>
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Entrada</span>
          {puedeEditarRegistro ? (
            <input type="time" defaultValue={(esInasistencia || esDescansoMedico || esVacaciones || esFeriado) ? '' : format(new Date(data.hora_ingreso), 'HH:mm')}
              className="bg-transparent border-b border-blue-500 text-xs font-black text-blue-600 outline-none w-14 text-center"
              onBlur={e => {
                const current = (esInasistencia || esDescansoMedico || esVacaciones || esFeriado) ? '' : format(new Date(data.hora_ingreso), 'HH:mm')
                if (e.target.value && e.target.value !== current) onActualizar(data.id, 'hora_ingreso', e.target.value, data.hora_ingreso)
              }} />
          ) : (
            <span className={`font-black text-base tabular-nums leading-tight ${esFeriado ? 'text-teal-600 dark:text-teal-300' : esVacaciones ? 'text-cyan-600 dark:text-cyan-300' : esDescansoMedico ? 'text-fuchsia-600 dark:text-fuchsia-300' : esInasistencia ? 'text-orange-500 dark:text-orange-300' : isPuntual ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {(esInasistencia || esDescansoMedico || esVacaciones || esFeriado) ? '—' : horaEnPais(data.hora_ingreso, data.pais)}
            </span>
          )}
          {esOtroPais && !esInasistencia && !esDescansoMedico && !esVacaciones && !esFeriado && (
            <span className="mt-0.5 flex flex-col items-center gap-[1px] leading-none">
              <span className="flex items-center gap-1 text-[8px] font-black text-slate-400">
                <CountryFlag code={data.pais} size={10} /> local
              </span>
              {/* Equivalencia en hora de Perú para ver la diferencia de un vistazo */}
              <span className="flex items-center gap-1 text-[8px] font-black text-slate-400 tabular-nums">
                <CountryFlag code={DEFAULT_COUNTRY} size={10} /> {horaEnPais(data.hora_ingreso, DEFAULT_COUNTRY)}
              </span>
            </span>
          )}
        </div>

        {/* Salida tile */}
        <div className="hidden sm:flex flex-col items-center px-2.5 py-1.5 rounded-xl border bg-white/60 dark:bg-slate-950/40 dark:border-slate-800 min-w-[58px]"
          style={{ borderColor: 'rgba(226,232,240,0.9)' }}>
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Salida</span>
          {puedeEditarRegistro ? (
            <div className="flex items-center gap-1">
              <input type="time" defaultValue={data.hora_salida ? format(new Date(data.hora_salida), 'HH:mm') : ''}
                className="bg-transparent border-b border-blue-500 text-xs font-bold text-slate-600 dark:text-slate-300 outline-none w-14 text-center"
                onBlur={e => { const c = data.hora_salida ? format(new Date(data.hora_salida), 'HH:mm') : ''; if (e.target.value && e.target.value !== c) onActualizar(data.id, 'hora_salida', e.target.value, data.hora_salida || data.hora_ingreso) }} />
              {data.hora_salida && <button onClick={() => onActualizar(data.id, 'hora_salida', null, data.hora_ingreso)} className="text-red-400 hover:text-red-600"><X size={10} /></button>}
            </div>
          ) : data.hora_salida ? (
            <span className="font-black text-base text-slate-700 dark:text-slate-300 tabular-nums leading-tight">{horaEnPais(data.hora_salida, data.pais)}</span>
          ) : (
            <span className="text-[10px] font-bold text-slate-400 tabular-nums">--:--</span>
          )}
          {esOtroPais && data.hora_salida && (
            <span className="mt-0.5 flex flex-col items-center gap-[1px] leading-none">
              <span className="flex items-center gap-1 text-[8px] font-black text-slate-400">
                <CountryFlag code={data.pais} size={10} /> local
              </span>
              <span className="flex items-center gap-1 text-[8px] font-black text-slate-400 tabular-nums">
                <CountryFlag code={DEFAULT_COUNTRY} size={10} /> {horaEnPais(data.hora_salida, DEFAULT_COUNTRY)}
              </span>
            </span>
          )}
        </div>

        {/* Duración tile */}
        {horas !== '—' && (
          <div className="hidden md:flex flex-col items-center px-2.5 py-1.5 rounded-xl bg-blue-50 border border-blue-100 dark:bg-blue-500/10 dark:border-blue-500/20 min-w-[58px]">
            <span className="text-[8px] font-black text-blue-500 uppercase tracking-wider">Total</span>
            <span className="text-sm font-black text-blue-600 dark:text-blue-300 tabular-nums leading-tight">{horas}</span>
          </div>
        )}

        <div className="flex items-center gap-1">
          {!esInasistencia && nota.tieneNota && (
            <>
              <button onClick={() => onAbrirNota({ nombre: data.nombres_completos, nota: nota.textoLimpio, hora: format(new Date(data.hora_ingreso), 'HH:mm'), tipoObra: nota.tipoMarcacion, estadoIngreso: data.estado_ingreso })}
                className={`p-1.5 rounded-full border transition-all hover:scale-110 ${nota.tipoMarcacion === 'ingreso_obra' ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/30' : nota.tipoMarcacion === 'externo' ? 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-500/10 dark:border-purple-500/30' : nota.tipoMarcacion === 'nocturno' ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30' : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-500/10 dark:border-slate-500/30'}`}
                title={tone.label}>
                <NIcon size={12} />
              </button>
              {puedeEditarRegistro && (
                <button onClick={() => onBorrarNota(data.id)} className="p-1.5 rounded-full border border-red-200 dark:border-red-500/30 text-red-400 hover:bg-red-50 hover:scale-110 transition-all">
                  <Trash2 size={11} />
                </button>
              )}
            </>
          )}
          {puedeEditarRegistro && (
            <button onClick={() => onBorrarRegistro(data.id, data.nombres_completos)}
              className="p-1.5 rounded-full border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 hover:scale-110 transition-all ml-0.5">
              <X size={12} />
            </button>
          )}
          {modoEdicion && (
            <button
              onClick={() => onDarDeBaja(data.dni, data.nombres_completos, data.area)}
              className="px-2 py-1 rounded-full border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-[8px] font-black text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all ml-0.5"
              title="Dar de baja trabajador"
            >
              BAJA
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
