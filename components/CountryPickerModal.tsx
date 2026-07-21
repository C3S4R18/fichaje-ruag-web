'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe2, CheckCircle2, Clock } from 'lucide-react'
import { COUNTRIES, DEFAULT_COUNTRY, countryOf, detectCountryFromDevice, localHourMinute } from '@/utils/countries'

export default function CountryPickerModal({
  open,
  currentCode,
  onSelected,
}: {
  open: boolean
  currentCode?: string | null
  onSelected: (code: string) => void
}) {
  const detected = useMemo(() => detectCountryFromDevice(), [])
  const [selected, setSelected] = useState<string>(currentCode ?? detected ?? DEFAULT_COUNTRY)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [open])

  const chosen = countryOf(selected)
  const { hour, minute } = localHourMinute(selected)
  const horaLocal = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[310] flex items-center justify-center p-4"
          style={{
            background: 'rgba(11,17,32,0.80)',
            paddingTop: 'max(env(safe-area-inset-top), 24px)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
          }}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            className="w-full max-w-md"
          >
            <div className="mx-auto mb-3 flex w-fit items-center gap-2 rounded-full border px-4 py-2"
              style={{ background: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.28)' }}>
              <Globe2 size={14} className="text-white" />
              <span className="text-[10px] font-black tracking-[2px] text-white">ZONA HORARIA</span>
            </div>

            <div className="relative rounded-[30px] border border-white/40 bg-white p-6 shadow-2xl">
              {/* Globo animado con bandera */}
              <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
                <motion.div
                  className="absolute h-24 w-24 rounded-full border-2"
                  style={{ borderColor: 'rgba(37,99,235,0.35)' }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
                />
                <motion.div
                  className="relative flex h-[78px] w-[78px] items-center justify-center overflow-hidden rounded-full"
                  style={{ background: 'linear-gradient(135deg,#0F172A,#2563EB,#06B6D4)' }}
                  animate={{ scale: [0.96, 1.05, 0.96] }}
                  transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <motion.div
                    className="absolute h-[120px] w-[26px] rotate-[20deg] bg-white/20"
                    animate={{ x: [-40, 60] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }}
                  />
                  <span className="text-[34px] leading-none">{chosen.flag}</span>
                </motion.div>
              </div>

              <h2 className="mt-4 text-center text-[20px] font-black leading-tight text-slate-900">
                ¿En qué país estás?
              </h2>
              <p className="mt-1.5 text-center text-[13px] font-medium leading-[18px] text-slate-500">
                Tu horario de entrada se calcula con la hora de este país.
              </p>

              <div className="mt-3 flex justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-black"
                  style={{ background: 'rgba(37,99,235,0.10)', color: '#2563EB' }}>
                  <Clock size={14} /> Ahora ahí son {horaLocal}
                </span>
              </div>

              {detected && !currentCode && (
                <p className="mt-2 text-center text-[11px] font-semibold text-slate-400">
                  Detectamos {countryOf(detected).flag} {countryOf(detected).name} por tu dispositivo
                </p>
              )}

              <div className="mt-4 max-h-[260px] space-y-2 overflow-y-auto pr-1">
                {COUNTRIES.map(c => {
                  const isSel = selected === c.code
                  return (
                    <motion.button
                      key={c.code}
                      onClick={() => setSelected(c.code)}
                      whileTap={{ scale: 0.98 }}
                      animate={{ scale: isSel ? 1.02 : 1 }}
                      transition={{ type: 'spring', damping: 20, stiffness: 400 }}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left"
                      style={{
                        background: isSel ? 'rgba(37,99,235,0.08)' : '#F8FAFC',
                        border: `${isSel ? 2 : 1}px solid ${isSel ? '#2563EB' : '#E2E8F0'}`,
                      }}
                    >
                      <span className="text-[26px] leading-none">{c.flag}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-black leading-tight text-slate-900">{c.name}</span>
                        <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">{c.hint}</span>
                      </span>
                      {c.code === DEFAULT_COUNTRY && (
                        <span className="rounded-full px-1.5 py-0.5 text-[8px] font-black tracking-wider"
                          style={{ background: 'rgba(5,150,105,0.12)', color: '#059669' }}>
                          MAYORÍA
                        </span>
                      )}
                      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-white"
                        style={{ background: isSel ? '#2563EB' : '#E2E8F0' }}>
                        {isSel && <CheckCircle2 size={17} strokeWidth={2.6} />}
                      </span>
                    </motion.button>
                  )
                })}
              </div>

              <motion.button
                onClick={() => onSelected(selected)}
                whileTap={{ scale: 0.97 }}
                className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full font-black text-white"
                style={{ background: 'linear-gradient(90deg,#1D4ED8,#2563EB,#06B6D4)' }}
              >
                <span className="text-[15px]">Confirmar {chosen.flag} {chosen.name}</span>
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
