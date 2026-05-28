// Edge Function: aviso push de salida.
// Se invoca DOS veces al día (Lima):
//   17:50 → kind="soon"  ⇒ "Falta poco para ir a casa"
//   18:00 → kind="now"   ⇒ "Hora de irse, no olvides marcar tu salida"
//
// Solo notifica a quienes NO marcaron salida hoy todavía.
//
// Programación con pg_cron (UTC, Lima = UTC-5):
//   22:50 UTC → kind=soon
//   23:00 UTC → kind=now
//
// Variables de entorno: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:soporte@ruag.pe',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

function limaDateKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const d = parts.find((p) => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

const SOON = { title: '⏰ Falta poco para ir a casa', body: 'En unos minutos termina tu jornada. Prepárate para marcar salida.', tag: 'ruag-salida-soon' }
const NOW  = { title: '🏠 Hora de irse', body: 'No olvides marcar tu salida en RUAG.', tag: 'ruag-salida-now' }

Deno.serve(async (req) => {
  let kind: 'soon' | 'now' = 'now'
  try {
    const body = await req.json().catch(() => ({}))
    if (body?.kind === 'soon') kind = 'soon'
  } catch (_e) {
    // ignorar
  }
  const payload = kind === 'soon' ? SOON : NOW
  const todayLima = limaDateKey()

  // 1. Todos los DNIs con suscripciones activas.
  const { data: subs, error: subsErr } = await supabase
    .from('push_subscriptions')
    .select('dni, endpoint, subscription')
  if (subsErr) {
    return new Response(JSON.stringify({ error: subsErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
  const subsByDni = new Map<string, typeof subs>()
  for (const s of subs ?? []) {
    const list = subsByDni.get(s.dni) ?? []
    list.push(s)
    subsByDni.set(s.dni, list as typeof subs)
  }
  if (subsByDni.size === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, cleaned: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }

  // 2. Asistencias del día Lima para todos esos DNIs.
  const dnis = Array.from(subsByDni.keys())
  const { data: asistencias } = await supabase
    .from('registro_asistencias')
    .select('dni, hora_salida')
    .eq('fecha', todayLima)
    .in('dni', dnis)
  const exitMarked = new Set<string>()
  for (const a of asistencias ?? []) {
    if (a.hora_salida) exitMarked.add(a.dni)
  }

  let sent = 0
  let cleaned = 0
  for (const [dni, list] of subsByDni) {
    if (exitMarked.has(dni)) continue
    for (const s of list ?? []) {
      try {
        await webpush.sendNotification(
          s.subscription as webpush.PushSubscription,
          JSON.stringify({ ...payload, url: '/escaner' }),
        )
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
          cleaned++
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, kind, sent, cleaned }), { headers: { 'Content-Type': 'application/json' } })
})
