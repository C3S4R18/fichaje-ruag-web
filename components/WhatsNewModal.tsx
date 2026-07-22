'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Laptop, CheckCircle2, ChevronDown } from 'lucide-react'

/** Cambiar esta clave vuelve a mostrar el modal a todos. */
export const WHATS_NEW_KEY = 'WHATS_NEW_SEEN_trabajo_remoto_v1'

export function shouldShowWhatsNew(): boolean {
  try { return !localStorage.getItem(WHATS_NEW_KEY) } catch { return false }
}

export function markWhatsNewSeen() {
  try { localStorage.setItem(WHATS_NEW_KEY, '1') } catch {}
}

const BENEFICIOS: [string, string][] = [
  ['Nunca cuenta como tardanza', 'Se registra siempre como PUNTUAL.'],
  ['Un solo toque', 'No pide escribir nada: marcas y listo.'],
  ['Sin depender del GPS', 'Si el permiso está apagado, igual puedes marcar.'],
]

export default function WhatsNewModal({
  open,
  onDismiss,
}: {
  open: boolean
  onDismiss: () => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[320] flex items-center justify-center p-4 overflow-y-auto"
          style={{
            background: 'rgba(11,17,32,0.82)',
            paddingTop: 'max(env(safe-area-inset-top), 20px)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 20px)',
          }}
        >
          <motion.div
            initial={{ scale: 0.93, opacity: 0, y: 22 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 22 }}
            transition={{ type: 'spring', damping: 22, stiffness: 250 }}
            className="w-full max-w-md my-auto"
          >
            <div className="mx-auto mb-3 flex w-fit items-center gap-2 rounded-full border px-4 py-2"
              style={{ background: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.3)' }}>
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: '#22C55E' }} />
              <span className="text-[10px] font-black tracking-[1.8px] text-white">NUEVO EN ESTA VERSIÓN</span>
            </div>

            <div className="rounded-[30px] bg-white p-6 shadow-2xl">
              {/* Icono con halo */}
              <div className="relative mx-auto flex h-[110px] w-[110px] items-center justify-center">
                <motion.div
                  className="absolute h-[110px] w-[110px] rounded-full blur-2xl"
                  style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.55), transparent 70%)' }}
                  animate={{ opacity: [0.25, 0.6, 0.25] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                  className="absolute h-[92px] w-[92px] rounded-full border-[1.5px]"
                  style={{ borderColor: 'rgba(14,165,233,0.35)' }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
                />
                <div className="relative flex h-[76px] w-[76px] items-center justify-center rounded-[26px] text-white"
                  style={{ background: 'linear-gradient(135deg,#0F766E,#0EA5E9,#6366F1)' }}>
                  <Laptop size={34} />
                </div>
              </div>

              <h2 className="mt-4 text-center text-[21px] font-black leading-[25px] text-slate-900">
                Nuevo botón: Trabajo remoto
              </h2>
              <p className="mt-2 text-center text-[13.5px] font-medium leading-[19px] text-slate-500">
                Si hoy trabajas desde casa, un coworking o de viaje, márcalo con este botón.
              </p>

              <div className="mt-4 space-y-2.5">
                {BENEFICIOS.map(([titulo, detalle]) => (
                  <div key={titulo}
                    className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <CheckCircle2 size={19} className="shrink-0" style={{ color: '#0EA5E9' }} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-black leading-tight text-slate-900">{titulo}</span>
                      <span className="block text-[11px] font-semibold text-slate-500">{detalle}</span>
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-center text-[11px] font-black tracking-wide text-slate-400">
                Lo encuentras aquí abajo 👇
              </p>
              <motion.div
                className="flex justify-center"
                animate={{ y: [-4, 6, -4] }}
                transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
              >
                <ChevronDown size={30} style={{ color: '#0EA5E9' }} />
              </motion.div>

              {/* Réplica del botón real para reconocerlo al instante */}
              <div className="relative mt-1 flex h-[52px] w-full items-center justify-center gap-2 overflow-hidden rounded-2xl font-black text-white"
                style={{
                  background: 'linear-gradient(90deg,#0F766E,#0EA5E9,#6366F1)',
                  border: '2px solid rgba(14,165,233,0.5)',
                }}>
                <motion.span
                  className="pointer-events-none absolute inset-y-0 w-20 -skew-x-12"
                  style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.38),transparent)' }}
                  animate={{ x: ['-140%', '320%'] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
                />
                <Laptop size={19} />
                <span className="text-[14px]">Trabajo remoto</span>
              </div>

              <button
                onClick={onDismiss}
                className="mt-5 h-[52px] w-full rounded-full text-[14.5px] font-black text-white"
                style={{ background: '#0F172A' }}
              >
                Entendido
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
