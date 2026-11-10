'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import {
  QrCode, HardHat, Store, Moon, Menu, Calendar, PlaneTakeoff,
  Stethoscope, Cake, Star, AlertTriangle, Trophy, Phone,
  ArrowRight, ArrowLeft, MapPin, Zap, Clock, Users,
  Camera, Bell, Award, Sparkles, Send, Edit3,
  ScanLine, Flag, Wallet, Hourglass, MessageCircle,
  CheckCircle2, Timer, Focus, Construction, Check,
} from 'lucide-react'

type Tip = { icon: LucideIcon; text: string }
type Step = {
  icon: LucideIcon
  title: string
  subtitle: string
  description: string
  tips: Tip[]
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
  },
  {
    icon: Menu,
    title: 'Menú lateral',
    subtitle: 'Todos tus accesos',
    description: 'Toca el botón de menú arriba o desliza hacia la izquierda en el centro de la pantalla.',
    tips: [
      { icon: ArrowLeft, text: 'Desliza de derecha a izquierda' },
      { icon: Sparkles,  text: 'Todos tus accesos en un lugar' },
    ],
  },
  {
    icon: Calendar,
    title: 'Calendario',
    subtitle: 'Tu historial completo',
    description: 'Revisa asistencias, salidas, vacaciones y feriados de cada día con visual animado.',
    tips: [
      { icon: CheckCircle2, text: 'Verde: día marcado' },
      { icon: Flag,         text: 'Amarillo: feriado o vacaciones' },
    ],
  },
  {
    icon: PlaneTakeoff,
    title: 'Vacaciones',
    subtitle: 'Solicita y consulta saldo',
    description: 'Envía solicitudes con fechas y motivo. RRHH aprueba o rechaza y ves el estado al instante.',
    tips: [
      { icon: Wallet,    text: 'Consulta tu saldo disponible' },
      { icon: Hourglass, text: 'Aprobación en tiempo real' },
    ],
  },
  {
    icon: Stethoscope,
    title: 'Descanso médico',
    subtitle: 'Sube tu certificado',
    description: 'Adjunta foto del certificado, elige rango de fechas y agrega comentario para RRHH.',
    tips: [
      { icon: Camera, text: 'Foto o galería' },
      { icon: Clock,  text: 'Rango de fechas exacto' },
    ],
  },
  {
    icon: Cake,
    title: 'Cumpleaños',
    subtitle: 'Tuyos y de tus colegas',
    description: 'Recibe notificación cuando cumple un compañero y ve la lista de próximos cumpleaños.',
    tips: [
      { icon: Bell,   text: 'Aviso automático' },
      { icon: Users,  text: 'Colegas del mes' },
    ],
  },
  {
    icon: Star,
    title: 'Ranking puntual',
    subtitle: 'Top 10 de llegada',
    description: 'Muestra los primeros trabajadores en marcar ingreso cada día. Compite por el primer puesto.',
    tips: [
      { icon: Trophy,    text: 'Podio del día' },
      { icon: ScanLine,  text: 'Solo por escáner QR' },
    ],
  },
  {
    icon: AlertTriangle,
    title: 'Ranking tardanza',
    subtitle: 'Top llegadas tarde',
    description: 'Ranking inverso: muestra a quienes marcaron después de la hora. Evita aparecer aquí.',
    tips: [
      { icon: Timer,         text: 'Solo después de la hora' },
      { icon: AlertTriangle, text: 'Reporte visible a RRHH' },
    ],
  },
  {
    icon: Trophy,
    title: 'Logros',
    subtitle: 'Insignias y progreso',
    description: 'Desbloquea insignias por asistir puntual, marcar en obra, completar semanas y usar bien la app.',
    tips: [
      { icon: Award,    text: 'Insignias animadas' },
      { icon: Sparkles, text: 'Progreso automático' },
    ],
  },
  {
    icon: Phone,
    title: 'Soporte y RRHH',
    subtitle: 'Ayuda por WhatsApp',
    description: 'Soporte: fallas de la app. RRHH: consultas de vacaciones, planilla y datos personales.',
    tips: [
      { icon: MessageCircle, text: 'Chat directo WhatsApp' },
      { icon: Phone,         text: 'Respuesta rápida' },
    ],
  },
]

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
  const isLast = index === STEPS.length - 1
  const progress = ((index + 1) / STEPS.length) * 100

  const next = () => {
    if (!isLast) {
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
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex flex-col bg-white"
          style={{
            paddingTop: 'max(env(safe-area-inset-top), 12px)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
          }}
        >
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden px-6">
            {/* Progreso + saltar */}
            <div className="flex items-center">
              <span className="flex-1 text-[13px] font-medium text-slate-500">
                {index + 1} de {STEPS.length}
              </span>
              <button onClick={skip} className="-mr-3 min-h-11 rounded-full px-3 text-sm font-semibold text-slate-500">
                Saltar
              </button>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-blue-50">
              <motion.div
                className="h-full rounded-full bg-blue-600"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>

            {/* Página */}
            <div className="relative flex-1 overflow-hidden">
              <AnimatePresence mode="wait" initial={false} custom={direction}>
                <motion.div
                  key={index}
                  initial={{ x: direction * 40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: direction * -40, opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="h-full overflow-y-auto pb-4 pt-10"
                >
                  <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-blue-50">
                    <step.icon size={48} strokeWidth={2} className="text-blue-600" />
                  </div>
                  <p className="mt-7 text-xs font-semibold uppercase tracking-[0.1em] text-blue-600">{step.subtitle}</p>
                  <h2 className="mt-1.5 text-[28px] font-bold leading-[34px] text-slate-900">{step.title}</h2>
                  <p className="mt-3 text-base leading-6 text-slate-600">{step.description}</p>

                  <div className="mt-6 space-y-2.5">
                    {step.tips.map((tip, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-[14px] border border-slate-200 bg-slate-50 p-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-900">
                          <tip.icon size={18} strokeWidth={2.2} />
                        </span>
                        <span className="text-sm leading-[19px] text-slate-900">{tip.text}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Botones */}
            <div className="flex items-center gap-3">
              {index > 0 && (
                <button
                  onClick={prev}
                  aria-label="Atrás"
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-900 active:scale-[0.97]"
                >
                  <ArrowLeft size={22} />
                </button>
              )}
              <button
                onClick={next}
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 text-base font-semibold text-white active:scale-[0.98]"
              >
                {isLast ? 'Empezar' : 'Siguiente'}
                {isLast ? <Check size={20} /> : <ArrowRight size={20} />}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
