// Edge Function: envia recordatorios de salida por Web Push.
// Programar dos veces al dia:
// - 17:30 Lima (22:30 UTC) con body {"slot":"1730"}
// - 18:00 Lima (23:00 UTC) con body {"slot":"1800"}
//
// Variables de entorno requeridas:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen inyectadas por Supabase.

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

function limaSlot() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const hour = parts.find((p) => p.type === 'hour')?.value ?? ''
  const minute = parts.find((p) => p.type === 'minute')?.value ?? ''
  return `${hour}${minute}`
}

function payloadForSlot(slot: string) {
  if (slot === '1730') {
    return {
      title: 'RUAG Asistencias',
      body: 'Ya casi es hora de irse a casita',
      tag: 'ruag-salida-1730',
      url: '/escaner',
    }
  }
  if (slot === '1800') {
    return {
      title: 'RUAG Asistencias',
      body: 'Ya es hora de irse a casita, no olvides marcar tu salida',
      tag: 'ruag-salida-1800',
      url: '/escaner',
    }
  }
  return null
}

Deno.serve(async (req) => {
  let requestedSlot = ''
  try {
    const body = await req.json()
    requestedSlot = String(body?.slot ?? '')
  } catch {
    requestedSlot = ''
  }

  const slot = requestedSlot || limaSlot()
  const payload = payloadForSlot(slot)
  if (!payload) {
    return new Response(JSON.stringify({ ok: true, skipped: true, slot }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, subscription')

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let sent = 0
  let cleaned = 0

  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        s.subscription as webpush.PushSubscription,
        JSON.stringify(payload),
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

  return new Response(JSON.stringify({ ok: true, slot, sent, cleaned }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
