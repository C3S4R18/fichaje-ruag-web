// app/api/cron/inasistencias/route.ts
// Llamado por GitHub Actions cada día a las 05:00 UTC (= 00:00 Lima)
// Marca como INASISTENCIA a todos los trabajadores que no marcaron en el día Lima anterior

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // ← clave de servicio (no la anon)
)

export async function POST(req: NextRequest) {
  // Verificar token secreto para que nadie más llame este endpoint
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    // Lima = UTC-5 → medianoche Lima = 05:00 UTC
    // "Ayer Lima" = el día que acaba de terminar cuando son las 05:00 UTC
    const now = new Date()
    const ayerLimaIni = new Date(now)
    ayerLimaIni.setUTCHours(ayerLimaIni.getUTCHours() - 24) // retroceder 24h
    // Redondear a las 05:00 UTC de ayer (= medianoche Lima de ayer)
    ayerLimaIni.setUTCHours(5, 0, 0, 0)
    ayerLimaIni.setUTCDate(ayerLimaIni.getUTCDate() - 1)

    const hoyLimaIni = new Date(now)
    hoyLimaIni.setUTCHours(5, 0, 0, 0)

    // Fecha Lima del día que acaba de terminar (para el campo fecha)
    const ayerFechaLima = ayerLimaIni.toISOString().split('T')[0]

    // Día de la semana del día Lima de ayer (0=dom, 6=sáb)
    const diaSemana = ayerLimaIni.getUTCDay()
    if (diaSemana === 0 || diaSemana === 6) {
      return NextResponse.json({
        ok: true,
        mensaje: 'Fin de semana — no se marcan inasistencias',
        fecha: ayerFechaLima
      })
    }

    // 1. Obtener todos los trabajadores registrados
    const { data: perfiles, error: errPerfiles } = await supabaseAdmin
      .from('fotocheck_perfiles')
      .select('dni, nombres_completos, area, foto_url')

    if (errPerfiles) throw errPerfiles
    if (!perfiles?.length) return NextResponse.json({ ok: true, mensaje: 'Sin trabajadores registrados' })

    // 2. Obtener los DNIs que SÍ marcaron en el día Lima de ayer
    const { data: registros, error: errReg } = await supabaseAdmin
      .from('registro_asistencias')
      .select('dni')
      .gte('hora_ingreso', ayerLimaIni.toISOString())
      .lt('hora_ingreso', hoyLimaIni.toISOString())

    if (errReg) throw errReg

    const dnisPresentes = new Set((registros ?? []).map((r: any) => r.dni))

    // 3. Filtrar los que NO marcaron
    const ausentes = perfiles.filter(p => !dnisPresentes.has(p.dni))

    if (!ausentes.length) {
      return NextResponse.json({
        ok: true,
        mensaje: 'Todos marcaron — no hay inasistencias',
        fecha: ayerFechaLima
      })
    }

    // 4. Insertar inasistencias (hora ficticia = 8:00 AM Lima del día)
    const horaInasistencia = new Date(ayerLimaIni)
    horaInasistencia.setUTCHours(horaInasistencia.getUTCHours() + 3) // 05:00 + 3h = 08:00 UTC Lima

    const inserts = ausentes.map(p => ({
      dni              : p.dni,
      nombres_completos: p.nombres_completos,
      area             : p.area,
      foto_url         : p.foto_url ?? '',
      estado_ingreso   : 'INASISTENCIA',
      hora_ingreso     : horaInasistencia.toISOString(),
      fecha            : ayerFechaLima,
      notas            : 'Marcado automáticamente por el sistema — Sin registro en el día'
    }))

    const { error: errInsert } = await supabaseAdmin
      .from('registro_asistencias')
      .insert(inserts)

    if (errInsert) throw errInsert

    return NextResponse.json({
      ok       : true,
      fecha    : ayerFechaLima,
      marcados : ausentes.length,
      trabajadores: ausentes.map(a => a.nombres_completos)
    })

  } catch (error: any) {
    console.error('Error inasistencias cron:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}