'use client'

/**
 * Banderas en SVG.
 *
 * Por qué SVG y no emoji: Windows NO renderiza los emojis de bandera
 * (🇪🇸 se ve como "ES"), así que en el dashboard de escritorio quedaban letras.
 * Estas se ven igual en Windows, macOS, Android e iOS.
 */
export default function CountryFlag({
  code,
  size = 14,
  className = '',
}: {
  code?: string | null
  size?: number
  className?: string
}) {
  const w = size
  const h = Math.round(size * 0.7)
  const common = {
    width: w,
    height: h,
    viewBox: '0 0 21 15',
    className: `inline-block shrink-0 rounded-[2px] ${className}`,
    style: { boxShadow: '0 0 0 0.5px rgba(15,23,42,0.18)' },
  } as const

  switch ((code ?? 'PE').toUpperCase()) {
    case 'PE': // Perú — rojo / blanco / rojo (vertical)
      return (
        <svg {...common} aria-label="Perú">
          <rect width="21" height="15" fill="#fff" />
          <rect width="7" height="15" fill="#D91023" />
          <rect x="14" width="7" height="15" fill="#D91023" />
        </svg>
      )
    case 'ES': // España — rojo / amarillo / rojo (horizontal)
      return (
        <svg {...common} aria-label="España">
          <rect width="21" height="15" fill="#AA151B" />
          <rect y="3.75" width="21" height="7.5" fill="#F1BF00" />
        </svg>
      )
    case 'CL': // Chile
      return (
        <svg {...common} aria-label="Chile">
          <rect width="21" height="15" fill="#fff" />
          <rect y="7.5" width="21" height="7.5" fill="#D52B1E" />
          <rect width="7.5" height="7.5" fill="#0039A6" />
          <polygon fill="#fff" points="3.75,1.6 4.35,3.35 6.2,3.35 4.7,4.4 5.28,6.15 3.75,5.07 2.22,6.15 2.8,4.4 1.3,3.35 3.15,3.35" />
        </svg>
      )
    case 'CO': // Colombia
      return (
        <svg {...common} aria-label="Colombia">
          <rect width="21" height="15" fill="#FCD116" />
          <rect y="7.5" width="21" height="3.75" fill="#003893" />
          <rect y="11.25" width="21" height="3.75" fill="#CE1126" />
        </svg>
      )
    case 'MX': // México
      return (
        <svg {...common} aria-label="México">
          <rect width="21" height="15" fill="#fff" />
          <rect width="7" height="15" fill="#006847" />
          <rect x="14" width="7" height="15" fill="#CE1126" />
          <circle cx="10.5" cy="7.5" r="2" fill="#9B6A29" opacity="0.85" />
        </svg>
      )
    case 'AR': // Argentina
      return (
        <svg {...common} aria-label="Argentina">
          <rect width="21" height="15" fill="#fff" />
          <rect width="21" height="5" fill="#74ACDF" />
          <rect y="10" width="21" height="5" fill="#74ACDF" />
          <circle cx="10.5" cy="7.5" r="1.8" fill="#F6B40E" />
        </svg>
      )
    case 'EC': // Ecuador
      return (
        <svg {...common} aria-label="Ecuador">
          <rect width="21" height="15" fill="#FFDD00" />
          <rect y="7.5" width="21" height="3.75" fill="#034EA2" />
          <rect y="11.25" width="21" height="3.75" fill="#ED1C24" />
        </svg>
      )
    case 'BO': // Bolivia
      return (
        <svg {...common} aria-label="Bolivia">
          <rect width="21" height="5" fill="#D52B1E" />
          <rect y="5" width="21" height="5" fill="#F9E300" />
          <rect y="10" width="21" height="5" fill="#007934" />
        </svg>
      )
    case 'US': // EE.UU.
      return (
        <svg {...common} aria-label="Estados Unidos">
          <rect width="21" height="15" fill="#fff" />
          {[0, 2, 4, 6, 8, 10, 12].map(y => (
            <rect key={y} y={y} width="21" height="1.15" fill="#B22234" />
          ))}
          <rect width="9" height="8" fill="#3C3B6E" />
        </svg>
      )
    default:
      return (
        <svg {...common} aria-label="País">
          <rect width="21" height="15" fill="#CBD5E1" />
        </svg>
      )
  }
}
