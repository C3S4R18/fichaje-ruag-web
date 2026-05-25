// Edge Function: envia el aviso de cumpleaños (mañana / hoy) por Web Push.
// Programar para que corra UNA vez al dia (ver instrucciones al final del chat).
//
// Variables de entorno requeridas (Supabase > Edge Functions > Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ej. mailto:soporte@ruag.pe)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen inyectadas por la plataforma.

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

function limaMonthDay(offsetDays = 0) {
  const moment = new Date(Date.now() + offsetDays * 86_400_000)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(moment)
  return {
    m: Number(parts.find((p) => p.type === 'month')!.value),
    d: Number(parts.find((p) => p.type === 'day')!.value),
  }
}

Deno.serve(async () => {
  const today = limaMonthDay(0)
  const tomorrow = limaMonthDay(1)

  const { data: perfiles, error } = await supabase
    .from('fotocheck_perfiles')
    .select('dni, nombres_completos, fecha_cumpleanos')
    .not('fecha_cumpleanos', 'is', null)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let sent = 0
  let cleaned = 0

  for (const p of perfiles ?? []) {
    const parts = String(p.fecha_cumpleanos).slice(0, 10).split('-')
    const m = Number(parts[1])
    const d = Number(parts[2])

    let payload: { title: string; body: string } | null = null
    if (m === today.m && d === today.d) {
      payload = { title: '🎉 ¡Feliz cumpleaños!', body: 'Hoy es tu día. ¡Que lo disfrutes muchísimo! 🥳🎂' }
    } else if (m === tomorrow.m && d === tomorrow.d) {
      payload = { title: '🎂 ¡Mañana es tu cumpleaños!', body: 'Mañana cumples años. Prepárate para celebrar 🎈' }
    }
    if (!payload) continue

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, subscription')
      .eq('dni', p.dni)

    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          s.subscription as webpush.PushSubscription,
          JSON.stringify({ ...payload, url: '/escaner', tag: 'ruag-cumple' }),
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

  return new Response(JSON.stringify({ ok: true, sent, cleaned }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
