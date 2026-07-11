'use client'

import { motion } from 'framer-motion'
import { useMemo } from 'react'

const RED = '#D91023'
const WHITE = '#FFFFFF'
const GOLD = '#FFD700'
const ADOBE = '#9A6B3F'
const CAJON_DARK = '#7B3F00'
const CAJON_MID = '#9A5A20'
const CAJON_EDGE = '#3E1E00'

export function isFiestasPatriasMonth(): boolean {
  const now = new Date()
  const lima = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }))
  return lima.getMonth() === 6
}

interface Dot { x: number; y: number; r: number; red: boolean }

export default function PatriaFotocheckOverlay() {
  const dots = useMemo<Dot[]>(() => {
    let seed = 7183
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    return Array.from({ length: 34 }, () => ({
      x: rnd() * 100,
      y: rnd() * 100,
      r: 1.4 + rnd() * 2.2,
      red: rnd() > 0.5,
    }))
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[26px]">
      {/* Machu Picchu watermark izquierda */}
      <svg
        viewBox="0 0 100 60"
        preserveAspectRatio="none"
        className="absolute left-[-2%] top-[38%] h-[110px] w-[190px] opacity-10"
      >
        <path
          d="M0,60 L0,45 L12,33 L18,37 L25,24 L34,33 L42,18 L52,9 L60,21 L68,15 L76,27 L85,18 L92,30 L100,36 L100,60 Z"
          fill={ADOBE}
        />
        {[0.8, 0.7, 0.6, 0.5].map((f, i) => (
          <line
            key={i}
            x1="10" y1={60 * f} x2="95" y2={60 * f}
            stroke="#5A3A1E" strokeOpacity="0.6" strokeWidth="0.5"
          />
        ))}
      </svg>

      {/* Confetti dots background */}
      <svg className="absolute inset-0 h-full w-full opacity-55">
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={`${d.x}%`}
            cy={`${d.y}%`}
            r={d.r}
            fill={d.red ? RED : '#64748B'}
          />
        ))}
      </svg>

      {/* Papel picado top */}
      <motion.svg
        viewBox="0 0 300 50"
        preserveAspectRatio="none"
        className="absolute left-0 right-0 top-0 h-[46px] w-full"
        animate={{ rotate: [-1.2, 1.2, -1.2] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path
          d="M0,10 Q150,22 300,10"
          fill="none"
          stroke="#64748B"
          strokeOpacity="0.5"
          strokeWidth="1.2"
        />
        {Array.from({ length: 16 }).map((_, i) => {
          const gap = 300 / 16
          const cx = i * gap + gap / 2
          const yOff = (i % 2) * 2
          const isRed = i % 2 === 0
          return (
            <g key={i}>
              <path
                d={`M${cx - gap * 0.35},${10 + yOff} L${cx + gap * 0.35},${10 + yOff} L${cx},${34 + yOff} Z`}
                fill={isRed ? RED : WHITE}
                stroke={isRed ? '#8B0000' : '#94A3B8'}
                strokeOpacity="0.6"
                strokeWidth="0.6"
              />
            </g>
          )
        })}
      </motion.svg>

      {/* Escarapela top-left */}
      <motion.svg
        viewBox="0 0 60 90"
        className="absolute left-[6px] top-[42px] h-[74px] w-[58px]"
        style={{ transform: 'rotate(-6deg)' }}
        animate={{ scale: [0.98, 1.03, 0.98] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Cintas */}
        <path d="M20,42 L14,78 L22,80 L26,46 Z" fill={RED} />
        <path d="M34,46 L38,80 L46,78 L40,42 Z" fill={RED} />
        {/* Rosetón exterior rojo */}
        <circle cx="30" cy="30" r="24" fill={RED} />
        {/* Pliegues radiales */}
        {Array.from({ length: 16 }).map((_, i) => {
          const a = (i * 22.5 * Math.PI) / 180
          const x2 = 30 + Math.cos(a) * 24
          const y2 = 30 + Math.sin(a) * 24
          return (
            <line
              key={i}
              x1="30" y1="30" x2={x2} y2={y2}
              stroke="#8B0000" strokeOpacity="0.5" strokeWidth="0.6"
            />
          )
        })}
        {/* Anillo blanco */}
        <circle cx="30" cy="30" r="15" fill={WHITE} />
        {/* Centro rojo */}
        <circle cx="30" cy="30" r="8" fill={RED} />
        {/* Estrella dorada */}
        <polygon
          points={buildStar(30, 30, 6, 2.4, 5)}
          fill={GOLD}
        />
      </motion.svg>

      {/* Viva el Perú top-right */}
      <div
        className="absolute right-[8px] top-[38px] flex flex-col items-end"
        style={{ color: RED }}
      >
        <span
          style={{
            fontFamily: '"Segoe Script","Brush Script MT","Lucida Handwriting",cursive',
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: '24px',
            lineHeight: 1,
            textShadow: '1px 1px 0 rgba(139,0,0,0.15)',
          }}
        >
          ¡Viva el
        </span>
        <span
          style={{
            fontFamily: '"Segoe Script","Brush Script MT","Lucida Handwriting",cursive',
            fontStyle: 'italic',
            fontWeight: 900,
            fontSize: '32px',
            lineHeight: 1,
            marginTop: '-4px',
            marginRight: '6px',
            textShadow: '1px 1px 0 rgba(139,0,0,0.15)',
          }}
        >
          Perú!
        </span>
      </div>

      {/* Bandera Perú media izquierda */}
      <motion.svg
        viewBox="0 0 90 70"
        className="absolute left-[4px] top-[52%] h-[64px] w-[86px]"
        animate={{ rotate: [-4, 4, -4] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Asta */}
        <rect x="0" y="0" width="5" height="70" fill={ADOBE} />
        {/* Punta esfera */}
        <circle cx="2.5" cy="0" r="4" fill={GOLD} />
        {/* Franjas */}
        <rect x="5" y="4" width="27" height="42" fill={RED} />
        <rect x="32" y="4" width="27" height="42" fill={WHITE} />
        <rect x="59" y="4" width="27" height="42" fill={RED} />
        <rect x="5" y="4" width="81" height="42" fill="none" stroke="#7A0000" strokeOpacity="0.35" strokeWidth="0.6" />
      </motion.svg>

      {/* Llama emoji derecha */}
      <motion.div
        className="absolute right-[6px] top-[52%] text-[40px] leading-none"
        animate={{ y: [-3, 3, -3] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        🦙
      </motion.div>

      {/* Cajón peruano derecha bajo */}
      <svg
        viewBox="0 0 50 62"
        className="absolute right-[14px] bottom-[90px] h-[62px] w-[50px]"
      >
        {/* Caja principal */}
        <rect x="0" y="10" width="50" height="46" fill={CAJON_DARK} stroke={CAJON_EDGE} strokeWidth="1" />
        {/* Cara frontal */}
        <rect x="7" y="14" width="36" height="40" fill={CAJON_MID} />
        {/* Agujero */}
        <circle cx="25" cy="36" r="6" fill="#1B0900" />
        {/* Correa roja */}
        <rect x="0" y="0" width="50" height="7" fill={RED} />
        {/* Rombos blancos */}
        {[0, 1, 2, 3].map((i) => {
          const cx = 6.25 + i * 12.5
          return (
            <polygon
              key={i}
              points={`${cx},1 ${cx + 3.5},3.5 ${cx},6 ${cx - 3.5},3.5`}
              fill={WHITE}
            />
          )
        })}
      </svg>

      {/* Chakana strip inferior */}
      <svg
        viewBox="0 0 300 18"
        preserveAspectRatio="none"
        className="absolute bottom-0 left-0 right-0 h-[18px] w-full"
      >
        <rect x="0" y="0" width="300" height="18" fill={WHITE} />
        <rect x="0" y="0" width="300" height="3.6" fill={RED} />
        <rect x="0" y="14.4" width="300" height="3.6" fill={RED} />
        {Array.from({ length: 22 }).map((_, i) => {
          const step = 300 / 22
          const cx = i * step + step / 2
          const cy = 9
          const d = 5
          return (
            <polygon
              key={i}
              points={`${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`}
              fill={i % 2 === 0 ? RED : GOLD}
            />
          )
        })}
      </svg>
    </div>
  )
}

function buildStar(cx: number, cy: number, outer: number, inner: number, points: number): string {
  const pts: string[] = []
  const step = Math.PI / points
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = i * step - Math.PI / 2
    pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`)
  }
  return pts.join(' ')
}
