/**
 * Catálogo de países soportados.
 *
 * IMPORTANTE: la puntualidad y el "día" de la asistencia se calculan con el reloj
 * LOCAL del país elegido por el trabajador (no con hora de Lima). Perú es el valor
 * por defecto porque la mayoría del equipo está allí.
 */

export interface CountryOption {
  code: string
  name: string
  flag: string
  timezone: string
  hint: string
}

export const COUNTRIES: CountryOption[] = [
  { code: 'PE', name: 'Perú',      flag: '🇵🇪', timezone: 'America/Lima',                   hint: 'UTC-5' },
  { code: 'ES', name: 'España',    flag: '🇪🇸', timezone: 'Europe/Madrid',                  hint: 'UTC+1/+2' },
  { code: 'CL', name: 'Chile',     flag: '🇨🇱', timezone: 'America/Santiago',               hint: 'UTC-4/-3' },
  { code: 'CO', name: 'Colombia',  flag: '🇨🇴', timezone: 'America/Bogota',                 hint: 'UTC-5' },
  { code: 'MX', name: 'México',    flag: '🇲🇽', timezone: 'America/Mexico_City',            hint: 'UTC-6' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', timezone: 'America/Argentina/Buenos_Aires', hint: 'UTC-3' },
  { code: 'EC', name: 'Ecuador',   flag: '🇪🇨', timezone: 'America/Guayaquil',              hint: 'UTC-5' },
  { code: 'BO', name: 'Bolivia',   flag: '🇧🇴', timezone: 'America/La_Paz',                 hint: 'UTC-4' },
  { code: 'US', name: 'EE.UU.',    flag: '🇺🇸', timezone: 'America/New_York',               hint: 'UTC-5/-4' },
]

export const DEFAULT_COUNTRY = 'PE'

export function countryOf(code?: string | null): CountryOption {
  return COUNTRIES.find(c => c.code === (code ?? DEFAULT_COUNTRY)) ?? COUNTRIES[0]
}

export function timezoneOf(code?: string | null): string {
  return countryOf(code).timezone
}

/** Deduce el país por la zona horaria del navegador. null si no coincide. */
export function detectCountryFromDevice(): string | null {
  if (typeof Intl === 'undefined') return null
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const exact = COUNTRIES.find(c => c.timezone.toLowerCase() === tz?.toLowerCase())
    if (exact) return exact.code

    // Fallback por offset actual
    const now = new Date()
    const localOffset = -now.getTimezoneOffset()
    const match = COUNTRIES.find(c => offsetMinutesFor(c.timezone, now) === localOffset)
    return match?.code ?? null
  } catch {
    return null
  }
}

function offsetMinutesFor(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0')
  // hour12:false puede devolver 24 a medianoche
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return Math.round((asUTC - at.getTime()) / 60000)
}

// ── Helpers de fecha/hora en el reloj local del país ─────────────────────────

/** yyyy-MM-dd en el reloj local del país. */
export function localDateKey(code?: string | null, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezoneOf(code),
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '01'
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Hora y minuto actuales en el reloj local del país. */
export function localHourMinute(code?: string | null, at: Date = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezoneOf(code),
    hour12: false, hour: '2-digit', minute: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0')
  // Intl puede devolver 24 para medianoche en hour12:false
  const h = get('hour') % 24
  return { hour: h, minute: get('minute') }
}

/** Formatea un instante (ISO UTC) como hora legible en el reloj del país. */
export function formatHourInCountry(iso: string, code?: string | null): string {
  try {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: timezoneOf(code),
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(iso))
  } catch {
    return '--:--'
  }
}

/** Estado de puntualidad de oficina medido en el reloj local del país. */
export function officeStatusForCountry(code?: string | null, at: Date = new Date()): 'PUNTUAL' | 'TARDANZA' {
  const { hour, minute } = localHourMinute(code, at)
  return hour < 9 || (hour === 9 && minute <= 5) ? 'PUNTUAL' : 'TARDANZA'
}
