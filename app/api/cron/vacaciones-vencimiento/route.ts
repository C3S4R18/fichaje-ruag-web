import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('procesar_vencimientos_vacaciones')
    if (error) throw error

    return NextResponse.json({
      ok: true,
      procesados: Number(data ?? 0),
      fecha: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Error vacaciones-vencimiento cron:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
