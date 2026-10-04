'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import LottiePlayer from '@/components/LottiePlayer'
import { HW } from '@/utils/halloween'

const SESSION_KEY = 'RUAG_HW_SPLASH_SEEN'
const DURATION_MS = 1700

/**
 * Splash de Halloween para la PWA: calabaza + marca + barra de carga.
 * Se muestra una sola vez por apertura de la app (sessionStorage) para no
 * retrasar el fichaje cuando el trabajador vuelve al escáner.
 */
export function shouldShowHalloweenSplash(): boolean {
  try { return !sessionStorage.getItem(SESSION_KEY) } catch { return false }
}

export default function HalloweenSplash({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, '1') } catch {}
    const t = setTimeout(() => setOpen(false), DURATION_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <AnimatePresence onExitComplete={onDone}>
      {open && (
        <motion.div
          className="fixed inset-0 z-[400] flex flex-col items-center justify-center overflow-hidden"
          style={{
            background:
              'radial-gradient(120% 70% at 50% 115%, rgba(232,93,4,0.30) 0%, transparent 55%), ' +
              'linear-gradient(180deg, #0B0614 0%, #150A28 60%, #1A0F2E 100%)',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.45, ease: 'easeInOut' }}
        >
          {/* Luna al fondo */}
          <div
            className="absolute rounded-full"
            style={{
              right: '12%', top: '10%', width: 110, height: 110,
              background: 'radial-gradient(circle at 38% 34%, #FFF4D6 0%, #FFD98A 45%, #F2B45C 100%)',
              animation: 'hw-moon 4.5s ease-in-out infinite',
            }}
          />
          {/* Murciélagos cruzando */}
          <div className="absolute left-0 right-0 pointer-events-none" style={{ top: '4%', height: 160 }}>
            <LottiePlayer src="/lottie/halloween-bats.json" style={{ width: '100%', height: '100%' }} />
          </div>

          {/* Halo latiendo + calabaza */}
          <motion.div
            className="relative flex items-center justify-center"
            initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.05 }}
          >
            <motion.div
              className="absolute rounded-full"
              style={{ width: 230, height: 230, background: `radial-gradient(circle, ${HW.glow} 0%, transparent 65%)`, filter: 'blur(10px)' }}
              animate={{ scale: [0.9, 1.12, 0.9], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div style={{ width: 190, height: 190 }}>
              <LottiePlayer src="/lottie/halloween-pumpkin.json" style={{ width: '100%', height: '100%' }} />
            </div>
          </motion.div>

          {/* Marca */}
          <motion.div
            className="mt-2 flex flex-col items-center"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.35, ease: [0.34, 1.2, 0.64, 1] }}
          >
            <h1
              className="font-black leading-none"
              style={{ color: HW.text1, fontFamily: 'Sora, sans-serif', fontSize: 44, letterSpacing: 10, textShadow: '0 0 24px rgba(255,122,26,0.45)' }}
            >
              RUAG
            </h1>
            <div className="mt-2 h-[2px] w-[120px]" style={{ background: `linear-gradient(90deg, transparent, ${HW.orange}, transparent)` }} />
            <p className="mt-2.5 text-xs font-bold" style={{ color: HW.text3, letterSpacing: 9 }}>JORNADA</p>

            <motion.div
              className="mt-5 flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-black"
              style={{
                background: HW.gradient,
                color: '#FFF7ED',
                letterSpacing: 1.6,
                border: '1px solid rgba(255,255,255,0.28)',
                boxShadow: '0 12px 30px rgba(232,93,4,0.35)',
              }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.6, type: 'spring', stiffness: 300, damping: 18 }}
            >
              <span>🎃</span> ¡FELIZ HALLOWEEN!
            </motion.div>
          </motion.div>

          {/* Barra de carga */}
          <div className="mt-9 h-[3px] w-[150px] overflow-hidden rounded-full" style={{ background: 'rgba(255,122,26,0.16)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${HW.orangeDeep}, ${HW.orange}, ${HW.lime})` }}
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: (DURATION_MS - 250) / 1000, ease: 'easeInOut' }}
            />
          </div>

          <p className="absolute bottom-11 text-[10px] font-semibold" style={{ color: HW.text3, letterSpacing: 2, opacity: 0.8 }}>
            Control de asistencia
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
