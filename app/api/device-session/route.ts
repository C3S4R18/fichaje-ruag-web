import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const SESSION_TYPE = 'ACTIVE_DEVICE_SESSION'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function makeToken() {
  return crypto.randomUUID()
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const dni = String(searchParams.get('dni') ?? '').trim()
  const token = String(searchParams.get('token') ?? '').trim()

  if (!dni || !token) {
    return NextResponse.json({ active: false, error: 'Sesion incompleta' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('sys_doc_cache')
    .select('data_raw')
    .eq('tipo_documento', SESSION_TYPE)
    .eq('numero_documento', dni)
    .order('consultado_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ active: false, error: error.message }, { status: 500 })

  const activeToken = (data as any)?.data_raw?.token
  return NextResponse.json({ active: Boolean(activeToken && activeToken === token) })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const dni = String(body.dni ?? '').trim()
  const deviceId = String(body.deviceId ?? '').trim()
  const nombre = String(body.nombre ?? '').trim()
  const platform = String(body.platform ?? 'web').trim()

  if (!dni || !deviceId) {
    return NextResponse.json({ error: 'DNI y dispositivo requeridos' }, { status: 400 })
  }

  const token = makeToken()
  const now = new Date().toISOString()
  const payload = {
    tipo_documento: SESSION_TYPE,
    numero_documento: dni,
    razon_social: nombre || dni,
    data_raw: { token, deviceId, platform, updatedAt: now },
    consultado_at: now,
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('sys_doc_cache')
    .select('id')
    .eq('tipo_documento', SESSION_TYPE)
    .eq('numero_documento', dni)
    .order('consultado_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })

  const result = existing?.id
    ? await supabaseAdmin.from('sys_doc_cache').update(payload).eq('id', existing.id).select('id').single()
    : await supabaseAdmin.from('sys_doc_cache').insert(payload).select('id').single()

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })

  return NextResponse.json({ ok: true, token, deviceId })
}
