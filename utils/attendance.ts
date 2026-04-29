import { supabase } from '@/utils/supabase/client'

export type EstadoAsistencia = 'PUNTUAL' | 'TARDANZA' | 'INASISTENCIA'

export type AsistenciaRecord = {
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

const LIMA_TZ = 'America/Lima'
const WORKING_DAYS = new Set([1, 2, 3, 4, 5])
const INACTIVE_AREA_PREFIX = '__INACTIVO__|'

export const STATUS_PRIORITY: Record<string, number> = {
  PUNTUAL: 0,
  TARDANZA: 1,
  INASISTENCIA: 2,
}

export function getLimaDateKey(date = new Date()) {
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

export function isInactiveArea(area?: string | null) {
  return String(area ?? '').startsWith(INACTIVE_AREA_PREFIX)
}

export function getVisibleArea(area?: string | null) {
  return isInactiveArea(area) ? String(area).slice(INACTIVE_AREA_PREFIX.length) : String(area ?? '')
}

export function dateKeysBetween(startKey: string, endKey: string) {
  const keys: string[] = []
  let cursor = new Date(`${startKey}T12:00:00.000Z`)
  const end = new Date(`${endKey}T12:00:00.000Z`)

  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return keys
}

export function getWeekday(dateKey: string) {
  return new Date(`${dateKey}T12:00:00-05:00`).getUTCDay()
}

export function buildSyntheticInasistencia(fechaKey: string, perfil: any): AsistenciaRecord {
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

export function sortRecordsByStatus(records: AsistenciaRecord[]) {
  return [...records].sort((a, b) => {
    const byState = (STATUS_PRIORITY[a.estado_ingreso] ?? 9) - (STATUS_PRIORITY[b.estado_ingreso] ?? 9)
    if (byState !== 0) return byState
    return new Date(b.hora_ingreso).getTime() - new Date(a.hora_ingreso).getTime()
  })
}

export function sortRecordsForRange(records: AsistenciaRecord[]) {
  return [...records].sort((a, b) => {
    const byDate = String(a.fecha).localeCompare(String(b.fecha))
    if (byDate !== 0) return byDate
    const byState = (STATUS_PRIORITY[a.estado_ingreso] ?? 9) - (STATUS_PRIORITY[b.estado_ingreso] ?? 9)
    if (byState !== 0) return byState
    return new Date(a.hora_ingreso).getTime() - new Date(b.hora_ingreso).getTime()
  })
}

export async function loadAttendanceRangeDataset(fromKey: string, toKey: string): Promise<AsistenciaRecord[]> {
  const todayLima = getLimaDateKey()
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
  const existingKeys = new Set(records.map((row) => `${row.fecha}::${row.dni}`))
  const vacationKeys = new Set<string>()

  vacations.forEach((row: any) => {
    for (const dateKey of dateKeysBetween(String(row.fecha_inicio), String(row.fecha_fin))) {
      vacationKeys.add(`${dateKey}::${row.dni}`)
    }
  })

  const synthetic: AsistenciaRecord[] = []
  for (const dateKey of dateKeysBetween(fromKey, toKey)) {
    if (!(dateKey < todayLima) || !WORKING_DAYS.has(getWeekday(dateKey))) continue
    perfiles.forEach((perfil: any) => {
      const key = `${dateKey}::${perfil.dni}`
      if (!existingKeys.has(key) && !vacationKeys.has(key)) {
        synthetic.push(buildSyntheticInasistencia(dateKey, perfil))
      }
    })
  }

  return [...records, ...synthetic]
}
