'use client'

import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { format } from 'date-fns'
import { motion } from 'framer-motion'

export default function KioskoQR() {
  const [qrValue, setQrValue]   = useState("RUAG_INGRESO")
  const [time, setTime]         = useState(new Date())
  const [mounted, setMounted]   = useState(false)
  const [qrKey, setQrKey]       = useState(0) // para animar refresh del QR

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const update = () => {
      const window = Math.floor(Date.now() / 10000)
      setQrValue(`RUAG_INGRESO_${window}`)
      setQrKey(window)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  if (!mounted) return null

  const hours   = format(time, 'HH')
  const minutes = format(time, 'mm')
  const seconds = format(time, 'ss')
  const dateStr = format(time, "EEEE d 'de' MMMM")

  return (
    <div
      className="min-h-screen flex flex-col select-none overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 50%, #EDE9FE 100%)',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Decorative blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-40"
          style={{ background: 'radial-gradient(circle, rgba(79,70,229,0.2) 0%, transparent 70%)', animation: 'float 8s ease-in-out infinite' }} />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-40"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)', animation: 'float 10s ease-in-out infinite reverse' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, rgba(79,70,229,0.3) 0%, transparent 60%)' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-10 pt-8 pb-4">
        <motion.div
          className="flex items-center gap-4"
          initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.34, 1.2, 0.64, 1] }}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--blue)', boxShadow: '0 8px 32px rgba(79,70,229,0.35)' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/>
              <rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="14" y="14" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>RUAG</h1>
            <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--text-3)' }}>Jornada · Ingreso Seguro</p>
          </div>
        </motion.div>

        <motion.div
          className="text-right"
          initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.34, 1.2, 0.64, 1], delay: 0.1 }}
        >
          {/* Clock */}
          <div className="flex items-end gap-1 justify-end">
            <motion.span
              key={hours}
              className="text-6xl lg:text-7xl font-black tabular-nums leading-none"
              style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}
              initial={{ opacity: 0.5, y: -4 }} animate={{ opacity: 1, y: 0 }}
            >
              {hours}
            </motion.span>
            <span className="text-6xl lg:text-7xl font-black" style={{ color: 'var(--blue)', fontFamily: 'Syne, sans-serif' }}>:</span>
            <motion.span
              key={minutes}
              className="text-6xl lg:text-7xl font-black tabular-nums leading-none"
              style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}
              initial={{ opacity: 0.5, y: -4 }} animate={{ opacity: 1, y: 0 }}
            >
              {minutes}
            </motion.span>
            <motion.span
              key={seconds}
              className="text-3xl font-bold tabular-nums mb-1"
              style={{ color: 'var(--text-3)' }}
              initial={{ opacity: 0.3 }} animate={{ opacity: 1 }}
            >
              :{seconds}
            </motion.span>
          </div>
          <p className="text-sm font-semibold capitalize mt-1" style={{ color: 'var(--text-3)' }}>{dateStr}</p>
        </motion.div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center relative z-10 px-6 py-8">
        <motion.div
          className="flex flex-col items-center"
          initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.34, 1.2, 0.64, 1], delay: 0.2 }}
        >
          <h2 className="text-4xl lg:text-5xl font-black text-center mb-3 tracking-tight"
            style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>
            CÓDIGO DE INGRESO
          </h2>

          <motion.div
            className="flex items-center gap-2 px-5 py-2 rounded-full mb-10"
            style={{ background: 'var(--blue-light)', border: '1.5px solid var(--border-2)' }}
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
            <span className="text-sm font-bold tracking-wider uppercase" style={{ color: 'var(--blue)' }}>
              Apunta con la App RUAG
            </span>
          </motion.div>

          {/* QR Card */}
          <motion.div
            className="relative p-6 sm:p-8 rounded-4xl"
            style={{
              background: 'var(--surface)',
              boxShadow: '0 24px 80px rgba(79,70,229,0.18), 0 8px 32px rgba(79,70,229,0.10)',
              border: '2px solid var(--border)',
            }}
          >
            {/* Corner decorations */}
            {[
              'top-4 left-4 border-t-4 border-l-4 rounded-tl-2xl',
              'top-4 right-4 border-t-4 border-r-4 rounded-tr-2xl',
              'bottom-4 left-4 border-b-4 border-l-4 rounded-bl-2xl',
              'bottom-4 right-4 border-b-4 border-r-4 rounded-br-2xl',
            ].map((cls, i) => (
              <div key={i} className={`absolute w-10 h-10 ${cls}`} style={{ borderColor: 'var(--blue)' }} />
            ))}

            <motion.div
              key={qrKey}
              initial={{ opacity: 0.7, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="w-56 h-56 sm:w-72 sm:h-72 md:w-80 md:h-80 lg:w-96 lg:h-96"
            >
              <QRCodeSVG
                value={qrValue}
                style={{ width: '100%', height: '100%' }}
                level="H"
                includeMargin={false}
                fgColor="#1E1B4B"
              />
            </motion.div>
          </motion.div>

          {/* Anti-fraud badge */}
          <motion.div
            className="mt-8 flex items-center gap-3 px-6 py-3 rounded-2xl"
            style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--green-light)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="m9 12 2 2 4-4"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-1)' }}>
                Sistema Antifraude Activo
              </p>
              <p className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>
                El código cambia cada 10 segundos
              </p>
            </div>
          </motion.div>
        </motion.div>
      </main>
    </div>
  )
}