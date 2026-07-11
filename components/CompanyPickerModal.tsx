'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Building2, CheckCircle2, Rocket } from 'lucide-react'

export type CompanyCode = 'RUAG' | 'ARUG' | 'CG'

interface CompanyOption {
  code: CompanyCode
  name: string
  tagline: string
  colors: [string, string, string]
}

const OPTIONS: CompanyOption[] = [
  { code: 'RUAG', name: 'RUAG', tagline: 'Servicios integrales',   colors: ['#047857', '#059669', '#22C55E'] },
  { code: 'ARUG', name: 'ARUG', tagline: 'Ingeniería y proyectos', colors: ['#1D4ED8', '#2563EB', '#38BDF8'] },
  { code: 'CG',   name: 'CG',   tagline: 'Consultoría general',    colors: ['#B45309', '#F59E0B', '#FBBF24'] },
]

export default function CompanyPickerModal({
  open,
  onSelected,
}: {
  open: boolean
  onSelected: (code: CompanyCode) => void
}) {
  const [selected, setSelected] = useState<CompanyCode | null>(null)
  const chosen = OPTIONS.find(o => o.code === selected)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[300] flex items-center justify-center p-4"
          style={{
            background: 'rgba(11,17,32,0.78)',
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
            {/* Pill superior */}
            <div className="mx-auto mb-3 flex items-center gap-2 rounded-full border px-4 py-2 w-fit"
              style={{ background: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.28)' }}>
              <Building2 size={14} className="text-white" />
              <span className="text-[10px] font-black tracking-[2px] text-white">SELECCIÓN DE EMPRESA</span>
            </div>

            <div className="relative rounded-[30px] border border-white/40 bg-white p-6 shadow-2xl">
              {/* Hero */}
              <div className="mx-auto flex h-[88px] w-[88px] items-center justify-center">
                <motion.div
                  className="absolute h-[88px] w-[88px] rounded-full border-2"
                  style={{ borderColor: `${(chosen?.colors[0] ?? '#2563EB')}66` }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
                />
                <motion.div
                  className="relative flex h-[74px] w-[74px] items-center justify-center overflow-hidden rounded-full text-white"
                  style={{
                    background: chosen
                      ? `linear-gradient(135deg, ${chosen.colors[0]}, ${chosen.colors[1]}, ${chosen.colors[2]})`
                      : 'linear-gradient(135deg, #0F172A, #2563EB, #06B6D4)',
                  }}
                  animate={{ scale: [0.96, 1.04, 0.96] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <motion.div
                    className="absolute h-[120px] w-[30px] rotate-[20deg] rounded-full bg-white/25"
                    animate={{ x: [-40, 60] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
                  />
                  <Building2 size={32} strokeWidth={2.2} />
                </motion.div>
              </div>

              <h2 className="mt-4 text-center text-[20px] font-black leading-[24px] text-slate-900">
                ¿A qué empresa perteneces?
              </h2>
              <p className="mt-1.5 text-center text-[13px] font-medium leading-[18px] text-slate-500">
                Elige tu empresa para completar tu fotocheck. Solo aparecerá una vez.
              </p>

              <div className="mt-5 space-y-2.5">
                {OPTIONS.map(opt => {
                  const isSel = selected === opt.code
                  return (
                    <motion.button
                      key={opt.code}
                      onClick={() => setSelected(opt.code)}
                      whileTap={{ scale: 0.98 }}
                      className="flex w-full items-center gap-3 rounded-[18px] border px-3.5 py-3 text-left transition"
                      style={{
                        background: isSel
                          ? `linear-gradient(135deg, ${opt.colors[0]}18, ${opt.colors[1]}18, ${opt.colors[2]}18)`
                          : 'linear-gradient(135deg, #F8FAFC, #F1F5F9)',
                        borderColor: isSel ? opt.colors[0] : '#E2E8F0',
                        borderWidth: isSel ? 2 : 1,
                      }}
                      animate={{ scale: isSel ? 1.02 : 1 }}
                      transition={{ type: 'spring', damping: 20, stiffness: 400 }}
                    >
                      <span
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white text-[12px] font-black text-white"
                        style={{
                          background: `linear-gradient(135deg, ${opt.colors[0]}, ${opt.colors[1]}, ${opt.colors[2]})`,
                        }}
                      >
                        {opt.code}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-black leading-tight text-slate-900">
                          {opt.name}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">
                          {opt.tagline}
                        </span>
                      </span>
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-full text-white"
                        style={{
                          background: isSel
                            ? `linear-gradient(135deg, ${opt.colors[0]}, ${opt.colors[1]}, ${opt.colors[2]})`
                            : 'linear-gradient(135deg, #E2E8F0, #CBD5E1)',
                        }}
                      >
                        {isSel && <CheckCircle2 size={18} strokeWidth={2.6} />}
                      </span>
                    </motion.button>
                  )
                })}
              </div>

              <motion.button
                onClick={() => selected && onSelected(selected)}
                disabled={!selected}
                whileTap={{ scale: 0.97 }}
                className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full border font-black text-white transition"
                style={{
                  background: selected && chosen
                    ? `linear-gradient(90deg, ${chosen.colors[0]}, ${chosen.colors[1]}, ${chosen.colors[2]})`
                    : 'linear-gradient(90deg, #CBD5E1, #94A3B8)',
                  borderColor: 'rgba(255,255,255,0.35)',
                  cursor: selected ? 'pointer' : 'not-allowed',
                }}
              >
                <span className="text-[15px] tracking-[0.4px]">
                  {selected ? 'Confirmar empresa' : 'Elige una opción'}
                </span>
                {selected && <Rocket size={20} strokeWidth={2.6} />}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
