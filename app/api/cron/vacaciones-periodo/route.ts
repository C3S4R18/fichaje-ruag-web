import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

type VacationBalance = {
  dni: string
  trabajador_nombre: string
  area: string | null
  cargo: string | null
  codigo_excel: string | null
  periodo: number
  saldo_arrastre: number | null
  dias_pendientes: number | null
  fecha_vencimiento: string | null
  vacaciones_por_vencer: number | null
  vacaciones_pendientes_periodo: number | null
}

type VacationRequest = {
  dni: string
  fecha_inicio: string
  fecha_fin: string
  dias_solicitados: number | null
  estado: string
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getLimaYear(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Lima',
      year: 'numeric',
    }).format(date)
  )
}

function asDate(value: string) {
  return new Date(value.includes('T') ? value : `${value}T12:00:00`)
}

function overlapsYear(item: VacationRequest, year: number) {
  const yearStart = new Date(Date.UTC(year, 0, 1, 12))
  const yearEnd = new Date(Date.UTC(year, 11, 31, 12))
  const start = asDate(item.fecha_inicio)
  const end = asDate(item.fecha_fin)
  return start <= yearEnd && end >= yearStart
}

function shiftDateToYear(value: string | null, year: number) {
  if (!value) return null
  const date = asDate(value)
  const shifted = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate(), 12))
  return shifted.toISOString().slice(0, 10)
}

function num(value: number | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const currentYear = getLimaYear()
    const previousYear = currentYear - 1

    const { count: existingCount, error: existingError } = await supabaseAdmin
      .from('vacaciones_saldos')
      .select('id', { count: 'exact', head: true })
      .eq('periodo', currentYear)

    if (existingError) throw existingError

    if ((existingCount ?? 0) > 0) {
      return NextResponse.json({
        ok: true,
        created: false,
        periodo: currentYear,
        message: 'El periodo actual ya existe',
      })
    }

    const [{ data: previousRows, error: previousError }, { data: approvedRequests, error: requestsError }] =
      await Promise.all([
        supabaseAdmin
          .from('vacaciones_saldos')
          .select(
            'dni, trabajador_nombre, area, cargo, codigo_excel, periodo, saldo_arrastre, dias_pendientes, fecha_vencimiento, vacaciones_por_vencer, vacaciones_pendientes_periodo'
          )
          .eq('periodo', previousYear)
          .order('trabajador_nombre', { ascending: true }),
        supabaseAdmin
          .from('vacaciones_solicitudes')
          .select('dni, fecha_inicio, fecha_fin, dias_solicitados, estado')
          .eq('estado', 'aprobada'),
      ])

    if (previousError) throw previousError
    if (requestsError) throw requestsError

    if (!previousRows?.length) {
      return NextResponse.json(
        {
          ok: false,
          created: false,
          periodo: currentYear,
          error: `No existen saldos base para ${previousYear}`,
        },
        { status: 404 }
      )
    }

    const approvedByDni = (approvedRequests ?? [])
      .filter((item) => overlapsYear(item as VacationRequest, previousYear))
      .reduce<Record<string, number>>((acc, item) => {
        acc[item.dni] = (acc[item.dni] ?? 0) + num(item.dias_solicitados)
        return acc
      }, {})

    const rowsToInsert = (previousRows as VacationBalance[]).map((row) => {
      const carryBase =
        row.vacaciones_pendientes_periodo != null
          ? num(row.vacaciones_pendientes_periodo)
          : num(row.dias_pendientes) + (row.fecha_vencimiento ? 30 : 0)
      const approvedDays = approvedByDni[row.dni] ?? 0
      const carry = carryBase - approvedDays
      const nextFechaVencimiento = shiftDateToYear(row.fecha_vencimiento, currentYear)
      const vacacionesPorVencer = nextFechaVencimiento ? 30 : num(row.vacaciones_por_vencer)

      return {
        dni: row.dni,
        trabajador_nombre: row.trabajador_nombre,
        area: row.area,
        cargo: row.cargo,
        codigo_excel: row.codigo_excel,
        periodo: currentYear,
        saldo_arrastre: carry,
        dias_extra: 0,
        gozados_ene: 0,
        gozados_feb: 0,
        gozados_mar: 0,
        gozados_abr: 0,
        gozados_may: 0,
        gozados_jun: 0,
        gozados_jul: 0,
        gozados_ago: 0,
        gozados_set: 0,
        gozados_oct: 0,
        gozados_nov: 0,
        gozados_dic: 0,
        total_gozados: 0,
        dias_pendientes: carry,
        fecha_vencimiento: nextFechaVencimiento,
        renovaciones_aplicadas: 0,
        vacaciones_por_vencer: vacacionesPorVencer,
        vacaciones_pendientes_periodo: carry,
      }
    })

    const { error: insertError } = await supabaseAdmin
      .from('vacaciones_saldos')
      .upsert(rowsToInsert, { onConflict: 'dni,periodo' })

    if (insertError) throw insertError

    return NextResponse.json({
      ok: true,
      created: true,
      periodo: currentYear,
      clonados: rowsToInsert.length,
      base: previousYear,
    })
  } catch (error: any) {
    console.error('Error vacaciones-periodo cron:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
