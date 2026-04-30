import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const HOLIDAY_TYPE = 'FERIADO_ASISTENCIA'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  let query = supabaseAdmin
    .from('sys_doc_cache')
    .select('id, numero_documento, razon_social, data_raw, consultado_at')
    .eq('tipo_documento', HOLIDAY_TYPE)
    .order('numero_documento', { ascending: true })

  if (from) query = query.gte('numero_documento', from)
  if (to) query = query.lte('numero_documento', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const feriados = (data ?? [])
    .filter((item: any) => item.data_raw?.activo !== false)
    .map((item: any) => ({
      id: item.id,
      fecha: item.numero_documento,
      motivo: item.razon_social || item.data_raw?.motivo || 'Feriado',
      created_at: item.consultado_at,
    }))

  return NextResponse.json({ feriados })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const fecha = String(body.fecha ?? '').trim()
  const motivo = String(body.motivo ?? 'Feriado').trim() || 'Feriado'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Fecha invalida' }, { status: 400 })
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('sys_doc_cache')
    .select('id')
    .eq('tipo_documento', HOLIDAY_TYPE)
    .eq('numero_documento', fecha)
    .maybeSingle()

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })

  const payload = {
    tipo_documento: HOLIDAY_TYPE,
    numero_documento: fecha,
    razon_social: motivo,
    data_raw: { activo: true, motivo },
    consultado_at: new Date().toISOString(),
  }

  const result = existing?.id
    ? await supabaseAdmin.from('sys_doc_cache').update(payload).eq('id', existing.id).select('id').single()
    : await supabaseAdmin.from('sys_doc_cache').insert(payload).select('id').single()

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: result.data.id, fecha, motivo })
}
