const DEVICE_ID_KEY = 'RUAG_DEVICE_ID'
const SESSION_TOKEN_KEY = 'RUAG_SESSION_TOKEN'
const WORKER_KEYS = ['RUAG_DNI', 'RUAG_NOMBRE', 'RUAG_AREA', 'RUAG_FOTO', SESSION_TOKEN_KEY]

type SafeStore = {
  get: (key: string) => string | null
  set: (key: string, value: string) => void
  remove: (key: string) => void
}

function store(): SafeStore {
  try {
    return {
      get: (key) => localStorage.getItem(key),
      set: (key, value) => localStorage.setItem(key, value),
      remove: (key) => localStorage.removeItem(key),
    }
  } catch {
    return { get: () => null, set: () => {}, remove: () => {} }
  }
}

export function getOrCreateDeviceId() {
  const safeStore = store()
  const current = safeStore.get(DEVICE_ID_KEY)
  if (current) return current
  const next = crypto.randomUUID()
  safeStore.set(DEVICE_ID_KEY, next)
  return next
}

export async function activateDeviceSession(dni: string, nombre: string, platform = 'web-pwa') {
  const deviceId = getOrCreateDeviceId()
  const response = await fetch('/api/device-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dni, nombre, deviceId, platform }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'No se pudo activar la sesion')
  store().set(SESSION_TOKEN_KEY, payload.token)
  return payload.token as string
}

export async function isCurrentDeviceSession(dni: string) {
  const safeStore = store()
  const token = safeStore.get(SESSION_TOKEN_KEY)
  if (!token) return false
  const response = await fetch(`/api/device-session?dni=${encodeURIComponent(dni)}&token=${encodeURIComponent(token)}`, {
    cache: 'no-store',
  })
  if (!response.ok) return true
  const payload = await response.json().catch(() => ({}))
  return payload.active !== false
}

export function hasDeviceSessionToken() {
  return Boolean(store().get(SESSION_TOKEN_KEY))
}

export function clearWorkerSession() {
  const safeStore = store()
  WORKER_KEYS.forEach((key) => safeStore.remove(key))
}
