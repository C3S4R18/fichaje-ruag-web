import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const HIDDEN_ABSENCE_TYPE = 'INASISTENCIA_OCULTA'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function hiddenKey(fecha: string, dni: string) {
  return `${fecha}::${dni}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = String(searchParams.get('from') ?? '').trim()
  const to = String(searchParams.get('to') ?? '').trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'Rango invalido' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('sys_doc_cache')
    .select('numero_documento, data_raw')
    .eq('tipo_documento', HIDDEN_ABSENCE_TYPE)
    .gte('numero_documento', `${from}::`)
    .lte('numero_documento', `${to}::~~~~`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const keys = (data ?? [])
    .filter((item: any) => item.data_raw?.activo !== false)
    .map((item: any) => String(item.numero_documento))

  return NextResponse.json({ keys })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const fecha = String(body.fecha ?? '').trim()
  const dni = String(body.dni ?? '').trim()
  const nombre = String(body.nombre ?? '').trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !dni) {
    return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 })
  }

  const key = hiddenKey(fecha, dni)
  const payload = {
    tipo_documento: HIDDEN_ABSENCE_TYPE,
    numero_documento: key,
    razon_social: nombre || 'Inasistencia eliminada',
    data_raw: { activo: true, fecha, dni, nombre },
    consultado_at: new Date().toISOString(),
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('sys_doc_cache')
    .select('id')
    .eq('tipo_documento', HIDDEN_ABSENCE_TYPE)
    .eq('numero_documento', key)
    .maybeSingle()

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })

  const result = existing?.id
    ? await supabaseAdmin.from('sys_doc_cache').update(payload).eq('id', existing.id)
    : await supabaseAdmin.from('sys_doc_cache').insert(payload)

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })

  return NextResponse.json({ ok: true, key })
}
