import { supabase } from '@/utils/supabase/client'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Registra el service worker, pide permiso si hace falta, crea la suscripcion Web Push
 * y la guarda en Supabase para avisos de cumpleanos y recordatorios de salida.
 *
 * @param dni del trabajador
 * @param promptIfNeeded si es true, pide permiso al usuario; si es false, solo suscribe cuando ya está concedido.
 */
export async function ensureBirthdayPush(dni: string, promptIfNeeded = false): Promise<boolean> {
  if (!pushSupported() || !VAPID_PUBLIC_KEY || !dni) return false
  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    if (Notification.permission === 'denied') return false
    if (Notification.permission === 'default') {
      if (!promptIfNeeded) return false
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return false
    }

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      })
    }

    const json = subscription.toJSON()
    if (!json.endpoint) return false

    await supabase.from('push_subscriptions').upsert(
      {
        dni,
        endpoint: json.endpoint,
        subscription: json,
        platform: 'web',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    )
    return true
  } catch {
    return false
  }
}
