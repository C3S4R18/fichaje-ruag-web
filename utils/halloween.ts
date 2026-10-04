/**
 * Tema de Halloween (temporada).
 *
 * Se activa solo en el reloj de Lima entre el 1 de octubre y el 2 de noviembre,
 * igual que el patrón de Fiestas Patrias: no hay que acordarse de quitarlo.
 *
 * Para verlo fuera de fecha (o apagarlo dentro de fecha) abre la PWA con
 * `?tema=halloween` o `?tema=normal`; la elección queda guardada en el dispositivo.
 */

export const HALLOWEEN_THEME_KEY = 'RUAG_TEMA'

/** Paleta: se usa donde hay colores inline que no pasan por las variables CSS. */
export const HW = {
  bg: '#0B0614',
  surface: '#1A0F2E',
  surface2: '#24143D',
  border: '#3B2460',
  border2: '#5B3A8C',
  text1: '#F7EEFF',
  text2: '#D9C7F5',
  text3: '#B39CDD',
  orange: '#FF7A1A',
  orangeDeep: '#E85D04',
  pumpkin: '#FF8C1A',
  purple: '#8B5CF6',
  lime: '#B4FF3A',
  glow: 'rgba(255,122,26,0.35)',
  gradient: 'linear-gradient(135deg, #E85D04, #FF7A1A, #8B5CF6)',
} as const

export function isHalloweenSeason(): boolean {
  if (typeof window === 'undefined') return false

  try {
    const param = new URLSearchParams(window.location.search).get('tema')
    if (param === 'halloween' || param === 'normal') localStorage.setItem(HALLOWEEN_THEME_KEY, param)
    const forced = localStorage.getItem(HALLOWEEN_THEME_KEY)
    if (forced === 'halloween') return true
    if (forced === 'normal') return false
  } catch {}

  const lima = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }))
  const month = lima.getMonth() // 0 = enero
  const day = lima.getDate()
  return month === 9 || (month === 10 && day <= 2)
}
