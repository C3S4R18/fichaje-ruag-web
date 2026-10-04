'use client'

import { useMemo } from 'react'
import LottiePlayer from '@/components/LottiePlayer'

/**
 * Fondo de temporada para el escáner: luna, estrellas, telarañas, niebla,
 * murciélagos cruzando arriba y un fantasma flotando abajo.
 * Todo es decorativo y no intercepta toques (pointer-events: none).
 */
export default function HalloweenBackdrop() {
  const stars = useMemo(() => {
    let seed = 31337
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    return Array.from({ length: 42 }, () => ({
      x: rnd() * 100,
      y: rnd() * 62,
      r: 0.8 + rnd() * 1.6,
      delay: rnd() * 4,
      dur: 2.2 + rnd() * 2.6,
    }))
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Cielo: degradado de noche con un rubor naranja abajo */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 70% at 50% 110%, rgba(232,93,4,0.22) 0%, transparent 55%), ' +
            'radial-gradient(80% 50% at 85% -5%, rgba(139,92,246,0.22) 0%, transparent 60%), ' +
            'linear-gradient(180deg, #0B0614 0%, #140A26 55%, #1A0F2E 100%)',
        }}
      />

      {/* Estrellas */}
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.r * 2,
            height: s.r * 2,
            background: i % 5 === 0 ? '#FFD6A0' : '#F3E8FF',
            boxShadow: i % 5 === 0 ? '0 0 6px #FFB703' : '0 0 4px rgba(243,232,255,0.8)',
            animation: `hw-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}

      {/* Luna */}
      <div
        className="absolute rounded-full"
        style={{
          right: '9%',
          top: '7%',
          width: 92,
          height: 92,
          background: 'radial-gradient(circle at 38% 34%, #FFF4D6 0%, #FFD98A 45%, #F2B45C 100%)',
          animation: 'hw-moon 4.5s ease-in-out infinite',
        }}
      >
        {/* Cráteres */}
        <span className="absolute rounded-full" style={{ left: 22, top: 30, width: 14, height: 14, background: 'rgba(214,160,80,0.35)' }} />
        <span className="absolute rounded-full" style={{ left: 52, top: 18, width: 9, height: 9, background: 'rgba(214,160,80,0.30)' }} />
        <span className="absolute rounded-full" style={{ left: 58, top: 52, width: 18, height: 18, background: 'rgba(214,160,80,0.28)' }} />
      </div>

      {/* Murciélagos cruzando el cielo */}
      <div className="absolute left-0 right-0" style={{ top: '2%', height: 150, opacity: 0.95 }}>
        <LottiePlayer src="/lottie/halloween-bats.json" style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Telarañas en las esquinas superiores */}
      <Cobweb className="absolute left-0 top-0 w-[110px] h-[110px] opacity-40" />
      <Cobweb className="absolute right-0 top-0 w-[90px] h-[90px] opacity-30" flip />

      {/* Fantasma flotando abajo a la izquierda */}
      <div className="absolute" style={{ left: '3%', bottom: '11%', width: 78, height: 88, animation: 'hw-float 5.2s ease-in-out infinite' }}>
        <LottiePlayer src="/lottie/halloween-ghost.json" style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Niebla */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${-20 + i * 30}%`,
            bottom: `${-6 + i * 3}%`,
            width: '80%',
            height: 110 + i * 30,
            background: 'radial-gradient(ellipse at center, rgba(200,180,255,0.16) 0%, rgba(200,180,255,0.06) 45%, transparent 70%)',
            filter: 'blur(18px)',
            animation: `hw-fog ${14 + i * 5}s ease-in-out ${i * -4}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

function Cobweb({ className, flip = false }: { className?: string; flip?: boolean }) {
  // Telaraña radial desde la esquina: 5 radios + 4 hilos concéntricos curvados.
  const radii = [90, 60, 30, 0, -30].map((deg) => (deg * Math.PI) / 180)
  const rings = [22, 44, 66, 88]
  const pt = (r: number, a: number) => [r * Math.cos(a), r * Math.sin(a)] as const
  return (
    <svg viewBox="0 0 100 100" className={className} style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
      <g stroke="#E9DDFF" strokeWidth="0.9" fill="none" strokeLinecap="round">
        {radii.map((a, i) => {
          const [x, y] = pt(100, a)
          return <line key={i} x1="0" y1="0" x2={x} y2={y} />
        })}
        {rings.map((r, i) => {
          const d = radii
            .map((a, j) => {
              const [x, y] = pt(r, a)
              if (j === 0) return `M${x},${y}`
              const [px, py] = pt(r, radii[j - 1])
              const mx = (px + x) / 2 * 0.86
              const my = (py + y) / 2 * 0.86
              return `Q${mx},${my} ${x},${y}`
            })
            .join(' ')
          return <path key={i} d={d} />
        })}
      </g>
      {/* Arañita colgando */}
      <line x1="70" y1="0" x2="70" y2="26" stroke="#E9DDFF" strokeWidth="0.7" />
      <circle cx="70" cy="29" r="3.2" fill="#1A0A2E" stroke="#A78BFA" strokeWidth="0.6" />
      <circle cx="70" cy="24.5" r="1.9" fill="#1A0A2E" stroke="#A78BFA" strokeWidth="0.6" />
    </svg>
  )
}
