'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import {
  QrCode, HardHat, Store, Moon, Menu, Calendar, PlaneTakeoff,
  Stethoscope, Cake, Star, AlertTriangle, Trophy, Phone,
  ArrowRight, ArrowLeft, Rocket, MapPin, Zap, Clock, Users,
  Camera, Bell, Award, Sparkles, Send, Edit3,
  ScanLine, Flag, Wallet, Hourglass, MessageCircle,
  CheckCircle2, Timer, Focus, Construction,
} from 'lucide-react'

type Tip = { icon: LucideIcon; text: string }
type Step = {
  icon: LucideIcon
  gif?: string
  title: string
  subtitle: string
  description: string
  tips: Tip[]
  colors: [string, string, string]
}

const STEPS: Step[] = [
  {
    icon: QrCode,
    title: 'Escanea el QR',
    subtitle: 'Ingreso en oficina',
    description: 'Toca el botón grande del centro para abrir la cámara y apunta al QR de oficina.',
    tips: [
      { icon: Focus,   text: 'Mantén el QR dentro del recuadro' },
      { icon: Zap,     text: 'Registra tu hora en segundos' },
    ],
    colors: ['#0F172A', '#2563EB', '#06B6D4'],
  },
  {
    icon: HardHat,
    title: 'Botón OBRA',
    subtitle: 'Trabajas en obra',
    description: 'Marca ingreso desde una obra sin necesidad de QR. Detecta tu ubicación GPS.',
    tips: [
      { icon: MapPin,       text: 'Usa el GPS del celular' },
      { icon: Construction, text: 'Solo cuando estás en obra' },
    ],
    colors: ['#1D4ED8', '#2563EB', '#38BDF8'],
  },
  {
    icon: Store,
    title: 'Botón EXTERNO',
    subtitle: 'Trabajo fuera de sede',
    description: 'Registra ingreso cuando estás en gestión, visita cliente o comisión fuera de oficina.',
    tips: [
      { icon: Send,  text: 'Reuniones o trámites externos' },
      { icon: Edit3, text: 'Agrega motivo si RRHH lo pide' },
    ],
    colors: ['#6D28D9', '#7C3AED', '#A855F7'],
  },
  {
    icon: Moon,
    title: 'Botón NOCTURNO',
    subtitle: 'Turno de noche',
    description: 'Solo si tu jornada corresponde a horario nocturno. Ingreso y salida quedan separados por día.',
    tips: [
      { icon: Moon,        text: 'Turno partido día-siguiente' },
      { icon: CheckCircle2, text: 'RRHH lo cuenta aparte' },
    ],
    colors: ['#78350F', '#B45309', '#F59E0B'],
  },
  {
    icon: Menu,
    title: 'Menú lateral',
    subtitle: 'Todos tus accesos',
    description: 'Toca el botón verde arriba o desliza desde el borde para ver todas las opciones.',
    tips: [
      { icon: ArrowLeft, text: 'Desliza desde la derecha' },
      { icon: Sparkles,  text: 'Accesos rápidos animados' },
    ],
    colors: ['#047857', '#059669', '#22C55E'],
  },
  {
    icon: Calendar,
    gif: '/icons-web/calendario.gif',
    title: 'Calendario',
    subtitle: 'Tu historial completo',
    description: 'Revisa asistencias, salidas, vacaciones y feriados de cada día con visual animado.',
    tips: [
      { icon: CheckCircle2, text: 'Verde: día marcado' },
      { icon: Flag,         text: 'Amarillo: feriado o vacaciones' },
    ],
    colors: ['#1E40AF', '#2563EB', '#06B6D4'],
  },
  {
    icon: PlaneTakeoff,
    gif: '/icons-web/vacaciones.gif',
    title: 'Vacaciones',
    subtitle: 'Solicita y consulta saldo',
    description: 'Envía solicitudes con fechas y motivo. RRHH aprueba o rechaza y ves el estado al instante.',
    tips: [
      { icon: Wallet,    text: 'Consulta tu saldo disponible' },
      { icon: Hourglass, text: 'Aprobación en tiempo real' },
    ],
    colors: ['#0369A1', '#0EA5E9', '#6366F1'],
  },
  {
    icon: Stethoscope,
    gif: '/icons-web/descanso-medico.gif',
    title: 'Descanso médico',
    subtitle: 'Sube tu certificado',
    description: 'Adjunta foto del certificado, elige rango de fechas y agrega comentario para RRHH.',
    tips: [
      { icon: Camera, text: 'Foto o galería' },
      { icon: Clock,  text: 'Rango de fechas exacto' },
    ],
    colors: ['#6D28D9', '#7C3AED', '#EC4899'],
  },
  {
    icon: Cake,
    gif: '/icons-web/cumpleanos.gif',
    title: 'Cumpleaños',
    subtitle: 'Tuyos y de tus colegas',
    description: 'Recibe notificación cuando cumple un compañero y ve la lista de próximos cumpleaños.',
    tips: [
      { icon: Bell,   text: 'Aviso automático' },
      { icon: Users,  text: 'Colegas del mes' },
    ],
    colors: ['#BE185D', '#EC4899', '#7C3AED'],
  },
  {
    icon: Star,
    gif: '/icons-web/ranking.gif',
    title: 'Ranking puntual',
    subtitle: 'Top 10 de llegada',
    description: 'Muestra los primeros trabajadores en marcar ingreso cada día. Compite por el primer puesto.',
    tips: [
      { icon: Trophy,    text: 'Podio del día' },
      { icon: ScanLine,  text: 'Solo por escáner QR' },
    ],
    colors: ['#15803D', '#22C55E', '#F59E0B'],
  },
  {
    icon: AlertTriangle,
    gif: '/icons-web/ranking-tardanza.gif',
    title: 'Ranking tardanza',
    subtitle: 'Top llegadas tarde',
    description: 'Ranking inverso: muestra a quienes marcaron después de la hora. Evita aparecer aquí.',
    tips: [
      { icon: Timer,         text: 'Solo después de la hora' },
      { icon: AlertTriangle, text: 'Reporte visible a RRHH' },
    ],
    colors: ['#991B1B', '#DC2626', '#E11D48'],
  },
  {
    icon: Trophy,
    gif: '/icons-web/logros.gif',
    title: 'Logros',
    subtitle: 'Insignias y progreso',
    description: 'Desbloquea insignias por asistir puntual, marcar en obra, completar semanas y usar bien la app.',
    tips: [
      { icon: Award,    text: 'Insignias animadas' },
      { icon: Sparkles, text: 'Progreso automático' },
    ],
    colors: ['#B45309', '#FFB020', '#16A34A'],
  },
  {
    icon: Phone,
    gif: '/icons-web/soporte.gif',
    title: 'Soporte y RRHH',
    subtitle: 'Ayuda por WhatsApp',
    description: 'Soporte: fallas de la app. RRHH: consultas de vacaciones, planilla y datos personales.',
    tips: [
      { icon: MessageCircle, text: 'Chat directo WhatsApp' },
      { icon: Phone,         text: 'Respuesta rápida' },
    ],
    colors: ['#0F766E', '#128C7E', '#25D366'],
  },
]

interface Particle { x: number; y: number; size: number; phase: number; amp: number; color: string }

function seededParticles(colors: string[]): Particle[] {
  let seed = 9182
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  return Array.from({ length: 22 }, () => ({
    x: rnd() * 100,
    y: rnd() * 100,
    size: 3 + rnd() * 6,
    phase: rnd() * Math.PI * 2,
    amp: 8 + rnd() * 18,
    color: colors[Math.floor(rnd() * colors.length)],
  }))
}

export default function OnboardingTour({
  open,
  onFinish,
}: {
  open: boolean
  onFinish: () => void
}) {
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const step = STEPS[index]
  const progress = ((index + 1) / STEPS.length) * 100

  const particles = useMemo(() => seededParticles(step.colors), [step.colors])

  const next = () => {
    if (index < STEPS.length - 1) {
      setDirection(1)
      setIndex(index + 1)
    } else {
      onFinish()
      setIndex(0)
    }
  }
  const prev = () => {
    if (index > 0) {
      setDirection(-1)
      setIndex(index - 1)
    }
  }
  const skip = () => {
    onFinish()
    setIndex(0)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
          style={{
            background: `linear-gradient(180deg,
              rgba(11,17,32,0.90) 0%,
              ${hexAlpha(step.colors[1], 0.5)} 50%,
              rgba(11,17,32,0.90) 100%)`,
            paddingTop: 'max(env(safe-area-inset-top), 24px)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
          }}
        >
          {/* Particles */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
            {particles.map((p, i) => (
              <motion.circle
                key={i}
                cx={`${p.x}%`}
                cy={`${p.y}%`}
                r={p.size}
                fill={p.color}
                initial={{ opacity: 0.15 }}
                animate={{
                  cx: [`${p.x}%`, `${p.x + Math.cos(p.phase) * 0.4}%`, `${p.x}%`],
                  cy: [`${p.y}%`, `${p.y + Math.sin(p.phase) * 0.6}%`, `${p.y}%`],
                  opacity: [0.15, 0.4, 0.15],
                }}
                transition={{ duration: 6 + i * 0.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            ))}
          </svg>

          {/* Card container */}
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            className="relative flex w-full max-w-md flex-col"
            style={{ height: 'min(760px, 100%)' }}
          >
            {/* Pill top */}
            <div className="mx-auto mb-3 flex items-center gap-2 rounded-full border px-4 py-2"
              style={{ background: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.28)' }}>
              <span className="h-2 w-2 rounded-full" style={{ background: '#22C55E' }} />
              <span className="text-[11px] font-black tracking-[2px] text-white">TOUR RUAG</span>
              <span className="h-[3px] w-[3px] rounded-full bg-white/40" />
              <span className="text-[11px] font-black tracking-[1.2px] text-white">
                {index + 1} / {STEPS.length}
              </span>
            </div>

            {/* Card */}
            <div className="relative flex-1 overflow-hidden rounded-[32px] border border-white/40 bg-white shadow-2xl">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={index}
                  custom={direction}
                  initial={{ x: direction === 1 ? 80 : -80, opacity: 0, scale: 0.96 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  exit={{ x: direction === 1 ? -80 : 80, opacity: 0, scale: 0.96 }}
                  transition={{ type: 'spring', damping: 24, stiffness: 300 }}
                  className="flex h-full flex-col"
                >
                  {/* Hero gradient */}
                  <div
                    className="relative h-[240px] overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${step.colors[0]}, ${step.colors[1]}, ${step.colors[2]})`,
                    }}
                  >
                    {/* Rings */}
                    <motion.div
                      className="absolute right-[-80px] top-[-30px] h-[280px] w-[280px] rounded-full border border-white/20"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                    />
                    <motion.div
                      className="absolute right-[-60px] top-[20px] h-[200px] w-[200px] rounded-full border border-white/15"
                      animate={{ rotate: -360 }}
                      transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
                    />
                    <motion.div
                      className="absolute bottom-[-40px] left-[-40px] h-[160px] w-[160px] rounded-full border border-white/10"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
                    />

                    {/* Shine */}
                    <motion.div
                      className="absolute top-[-40px] h-[320px] w-[110px] rotate-[20deg] rounded-full bg-white/15 blur-sm"
                      animate={{ x: ['-140%', '140%'] }}
                      transition={{ duration: 3.4, repeat: Infinity, ease: 'linear' }}
                    />

                    {/* Glow */}
                    <motion.div
                      className="absolute left-1/2 top-1/2 h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white blur-3xl"
                      animate={{ opacity: [0.2, 0.45, 0.2] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                    />

                    {/* Icon container */}
                    <motion.div
                      className="absolute left-1/2 top-1/2 flex h-[120px] w-[120px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[32px] border-2 border-white/60 bg-white shadow-2xl"
                      animate={{ y: [-6, 6, -6], scale: [0.98, 1.04, 0.98] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      {step.gif ? (
                        <img src={step.gif} alt="" className="h-[88px] w-[88px] object-contain" />
                      ) : (
                        <step.icon size={64} strokeWidth={2.2} style={{ color: step.colors[1] }} />
                      )}
                    </motion.div>

                    {/* Icon badge top right */}
                    <div className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/20 backdrop-blur">
                      <step.icon size={18} className="text-white" strokeWidth={2.4} />
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto px-6 py-6">
                    {/* Subtitle chip */}
                    <div
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
                      style={{ background: hexAlpha(step.colors[0], 0.1) }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: step.colors[0] }} />
                      <span
                        className="text-[10px] font-black uppercase tracking-[1.6px]"
                        style={{ color: step.colors[0] }}
                      >
                        {step.subtitle}
                      </span>
                    </div>

                    <h2 className="mt-2.5 text-[26px] font-black leading-[30px] text-slate-900">
                      {step.title}
                    </h2>

                    <p className="mt-2.5 text-[14px] font-medium leading-[20px] text-slate-600">
                      {step.description}
                    </p>

                    <div className="mt-4 space-y-2.5">
                      {step.tips.map((tip, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                        >
                          <span
                            className="flex h-8 w-8 items-center justify-center rounded-full text-white"
                            style={{
                              background: `linear-gradient(135deg, ${step.colors[0]}, ${step.colors[1]})`,
                            }}
                          >
                            <tip.icon size={16} strokeWidth={2.4} />
                          </span>
                          <span className="text-[13px] font-semibold text-slate-700">
                            {tip.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Progress + dots + buttons */}
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, #fff, ${step.colors[2]}, #fff)`,
                  }}
                  animate={{ width: `${progress}%` }}
                  transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                />
              </div>

              <div className="mt-3.5 flex items-center justify-center gap-1.5">
                {STEPS.map((_, i) => (
                  <motion.span
                    key={i}
                    animate={{ width: i === index ? 22 : 6 }}
                    transition={{ type: 'spring', damping: 18, stiffness: 400 }}
                    className="h-1.5 rounded-full"
                    style={{
                      background: i === index ? '#fff' : 'rgba(255,255,255,0.28)',
                    }}
                  />
                ))}
              </div>

              <div className="mt-4 flex items-center gap-2.5">
                <button
                  onClick={prev}
                  disabled={index === 0}
                  className="flex h-14 w-14 items-center justify-center rounded-full border transition"
                  style={{
                    background: index > 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)',
                    borderColor:
                      index > 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)',
                    color: index > 0 ? '#fff' : 'rgba(255,255,255,0.3)',
                    cursor: index > 0 ? 'pointer' : 'not-allowed',
                  }}
                  aria-label="Atras"
                >
                  <ArrowLeft size={22} strokeWidth={2.6} />
                </button>

                <motion.button
                  onClick={next}
                  whileTap={{ scale: 0.97 }}
                  className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full border font-black text-white"
                  style={{
                    background: `linear-gradient(90deg, ${step.colors[0]}, ${step.colors[1]}, ${step.colors[2]})`,
                    borderColor: 'rgba(255,255,255,0.35)',
                  }}
                >
                  <span className="text-[15px] tracking-[0.4px]">
                    {index < STEPS.length - 1 ? 'Siguiente' : '¡Listo! Empezar'}
                  </span>
                  {index < STEPS.length - 1 ? (
                    <ArrowRight size={20} strokeWidth={2.6} />
                  ) : (
                    <Rocket size={20} strokeWidth={2.6} />
                  )}
                </motion.button>
              </div>

              <button
                onClick={skip}
                className="mx-auto mt-3 block rounded-full px-4 py-2 text-[13px] font-bold text-white/60 hover:text-white/90"
              >
                Saltar tour
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function hexAlpha(hex: string, alpha: number) {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
