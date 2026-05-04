import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

type VacationBalance = {
  id: string
  dias_pendientes: number | null
  fecha_vencimiento: string | null
  vacaciones_por_vencer: number | null
  renovaciones_aplicadas: number | null
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getLimaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function num(value: number | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function renewalAmount(row: VacationBalance) {
  if (!row.fecha_vencimiento || num(row.renovaciones_aplicadas) > 0) return 0
  const configured = num(row.vacaciones_por_vencer)
  return configured > 0 ? configured : 30
}

async function handleVacacionesVencimiento(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const today = getLimaDateKey()
    const { data: rows, error } = await supabaseAdmin
      .from('vacaciones_saldos')
      .select('id, dias_pendientes, fecha_vencimiento, vacaciones_por_vencer, renovaciones_aplicadas')
      .not('fecha_vencimiento', 'is', null)
      .lte('fecha_vencimiento', today)

    if (error) throw error

    const dueRows = ((rows ?? []) as VacationBalance[]).filter((row) => renewalAmount(row) > 0)
    const updates = await Promise.all(dueRows.map((row) => {
      const amount = renewalAmount(row)
      return supabaseAdmin
        .from('vacaciones_saldos')
        .update({
          vacaciones_por_vencer: 0,
          vacaciones_pendientes_periodo: num(row.dias_pendientes) + amount,
          renovaciones_aplicadas: num(row.renovaciones_aplicadas) + 1,
        })
        .eq('id', row.id)
    }))

    const failed = updates.find((item) => item.error)
    if (failed?.error) throw failed.error

    return NextResponse.json({
      ok: true,
      procesados: dueRows.length,
      fecha: today,
    })
  } catch (error: any) {
    console.error('Error vacaciones-vencimiento cron:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handleVacacionesVencimiento(req)
}

export async function POST(req: NextRequest) {
  return handleVacacionesVencimiento(req)
}
