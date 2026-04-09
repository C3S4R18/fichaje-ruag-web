import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const LIMA_TZ = 'America/Lima'
const LIMA_UTC_OFFSET_HOURS = 5
const WORKING_DAYS = new Set([1, 2, 3, 4, 5])

type WorkerProfile = {
  dni: string
  nombres_completos: string
  area: string | null
  foto_url: string | null
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

function addDays(dateKey: string, delta: number) {
  const pivot = new Date(`${dateKey}T12:00:00.000Z`)
  pivot.setUTCDate(pivot.getUTCDate() + delta)
  return pivot.toISOString().slice(0, 10)
}

function getWeekday(dateKey: string) {
  return new Date(`${dateKey}T12:00:00-05:00`).getUTCDay()
}

function toUtcIsoFromLimaDate(dateKey: string, hour = 0, minute = 0) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(
    Date.UTC(year, month - 1, day, hour + LIMA_UTC_OFFSET_HOURS, minute, 0, 0)
  ).toISOString()
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const todayLima = getLimaDateKey(new Date())
    const processingDate = addDays(todayLima, -1)
    const weekday = getWeekday(processingDate)

    if (!WORKING_DAYS.has(weekday)) {
      return NextResponse.json({
        ok: true,
        fecha: processingDate,
        mensaje: 'Dia no laborable: no se marcan inasistencias',
      })
    }

    const startUtc = toUtcIsoFromLimaDate(processingDate, 0)
    const endUtc = toUtcIsoFromLimaDate(addDays(processingDate, 1), 0)
    const placeholderIngresoUtc = toUtcIsoFromLimaDate(processingDate, 8)

    const [perfilesRes, registrosRes, vacacionesRes] = await Promise.all([
      supabaseAdmin
        .from('fotocheck_perfiles')
        .select('dni, nombres_completos, area, foto_url'),
      supabaseAdmin
        .from('registro_asistencias')
        .select('dni')
        .gte('hora_ingreso', startUtc)
        .lt('hora_ingreso', endUtc),
      supabaseAdmin
        .from('vacaciones_solicitudes')
        .select('dni')
        .eq('estado', 'aprobada')
        .lte('fecha_inicio', processingDate)
        .gte('fecha_fin', processingDate),
    ])

    if (perfilesRes.error) throw perfilesRes.error
    if (registrosRes.error) throw registrosRes.error
    if (vacacionesRes.error) throw vacacionesRes.error

    const perfiles = (perfilesRes.data ?? []) as WorkerProfile[]
    if (!perfiles.length) {
      return NextResponse.json({
        ok: true,
        fecha: processingDate,
        mensaje: 'Sin trabajadores registrados',
      })
    }

    const dnisConRegistro = new Set((registrosRes.data ?? []).map((item: any) => String(item.dni)))
    const dnisConVacaciones = new Set((vacacionesRes.data ?? []).map((item: any) => String(item.dni)))

    const ausentes = perfiles.filter(
      (perfil) => !dnisConRegistro.has(perfil.dni) && !dnisConVacaciones.has(perfil.dni)
    )

    if (!ausentes.length) {
      return NextResponse.json({
        ok: true,
        fecha: processingDate,
        mensaje: 'No hay inasistencias pendientes',
        excluidosPorVacaciones: dnisConVacaciones.size,
      })
    }

    const inserts = ausentes.map((perfil) => ({
      dni: perfil.dni,
      nombres_completos: perfil.nombres_completos,
      area: perfil.area,
      foto_url: perfil.foto_url ?? '',
      estado_ingreso: 'INASISTENCIA',
      hora_ingreso: placeholderIngresoUtc,
      fecha: processingDate,
      notas: 'Marcado automaticamente por el sistema - Sin registro en el dia',
    }))

    const { error: insertError } = await supabaseAdmin
      .from('registro_asistencias')
      .insert(inserts)

    if (insertError) throw insertError

    return NextResponse.json({
      ok: true,
      fecha: processingDate,
      marcados: ausentes.length,
      excluidosPorVacaciones: dnisConVacaciones.size,
      trabajadores: ausentes.map((item) => item.nombres_completos),
    })
  } catch (error: any) {
    console.error('Error inasistencias cron:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'Error inesperado' },
      { status: 500 }
    )
  }
}
