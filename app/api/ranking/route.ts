import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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

function isOfficeScannerRecord(record: any) {
  const notes = String(record.notas ?? '').trim()
  if (record.estado_ingreso === 'INASISTENCIA') return false
  if (!notes) return true
  return notes === 'Escaner Oficina' || notes.includes('[OFICINA]')
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || getLimaDateKey()

  const { data, error } = await supabaseAdmin
    .from('registro_asistencias')
    .select('id, dni, nombres_completos, area, foto_url, hora_ingreso, estado_ingreso, notas')
    .eq('fecha', date)
    .order('hora_ingreso', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const seen = new Set<string>()
  const ranking = (data ?? [])
    .filter(isOfficeScannerRecord)
    .filter((record: any) => {
      if (seen.has(record.dni)) return false
      seen.add(record.dni)
      return true
    })
    .slice(0, 10)
    .map((record: any, index: number) => ({
      puesto: index + 1,
      dni: record.dni,
      nombres_completos: record.nombres_completos,
      area: record.area,
      foto_url: record.foto_url,
      hora_ingreso: record.hora_ingreso,
      estado_ingreso: record.estado_ingreso,
    }))

  return NextResponse.json({ date, ranking })
}
