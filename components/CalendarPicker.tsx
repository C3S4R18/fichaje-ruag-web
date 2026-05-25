'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

// Calendario personalizado y moderno. El padre lo monta con {open && <CalendarPicker .../>}.
export default function CalendarPicker({
  value,
  onClose,
  onSelect,
  accent = '#EC4899',
  accent2 = '#7C3AED',
}: {
  value?: string
  onClose: () => void
  onSelect: (value: string) => void
  accent?: string
  accent2?: string
}) {
  const now = new Date()
  const todayStr = ymd(now.getFullYear(), now.getMonth(), now.getDate())
  const initial = value ? value.split('-').map(Number) : [now.getFullYear() - 20, now.getMonth() + 1, 1]
  const [cy, setCy] = useState(initial[0])
  const [cm, setCm] = useState(initial[1] - 1)
  const [selected, setSelected] = useState(value || '')
  const [mode, setMode] = useState<'days' | 'years' | 'months'>('days')

  const total = new Date(cy, cm + 1, 0).getDate()
  const firstDay = new Date(cy, cm, 1).getDay()
  const blanks = (firstDay + 6) % 7

  const headerDate = selected
    ? (() => {
        const [y, m, d] = selected.split('-').map(Number)
        const wd = new Date(y, m - 1, d).getDay()
        return { weekday: DIAS_LARGOS[wd], label: `${d} de ${MESES[m - 1].slice(0, 3).toLowerCase()}`, year: y }
      })()
    : { weekday: 'Selecciona', label: 'tu fecha', year: '' }

  const prevMonth = () => { if (cm === 0) { setCm(11); setCy(cy - 1) } else setCm(cm - 1) }
  const nextMonth = () => {
    const target = new Date(cy, cm + 1, 1)
    if (target > new Date(now.getFullYear(), now.getMonth(), 1)) return
    if (cm === 11) { setCm(0); setCy(cy + 1) } else setCm(cm + 1)
  }
  const canGoNext = new Date(cy, cm + 1, 1) <= new Date(now.getFullYear(), now.getMonth(), 1)

  const years = Array.from({ length: 96 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-5" style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <motion.div
        className="w-full max-w-[360px] overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-slate-900"
        initial={{ scale: 0.92, opacity: 0, y: 14 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-5" style={{ background: `linear-gradient(135deg, ${accent}, ${accent2})` }}>
          <button onClick={onClose} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white">
            <X size={16} />
          </button>
          <button onClick={() => setMode(mode === 'years' ? 'days' : 'years')} className="block text-left">
            <p className="text-sm font-bold text-white/80">{headerDate.year || '—'}</p>
            <h3 className="text-2xl font-black text-white capitalize" style={{ fontFamily: 'Sora, sans-serif' }}>
              {headerDate.weekday}{selected ? `, ${headerDate.label}` : ` ${headerDate.label}`}
            </h3>
          </button>
        </div>

        <div className="p-4">
          {/* Navegación */}
          <div className="mb-3 flex items-center justify-between">
            <button onClick={() => setMode(mode === 'months' ? 'days' : 'months')} className="rounded-xl px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800">
              {MESES[cm]} {cy}
            </button>
            {mode === 'days' && (
              <div className="flex gap-1">
                <button onClick={prevMonth} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft size={18} /></button>
                <button onClick={nextMonth} disabled={!canGoNext} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"><ChevronRight size={18} /></button>
              </div>
            )}
          </div>

          {mode === 'years' && (
            <div className="grid max-h-[260px] grid-cols-4 gap-2 overflow-y-auto p-1">
              {years.map((y) => (
                <button key={y} onClick={() => { setCy(y); setMode('days') }}
                  className="rounded-xl py-2.5 text-sm font-black"
                  style={y === cy ? { background: accent, color: 'white' } : {}}>
                  <span className={y === cy ? '' : 'text-slate-600 dark:text-slate-300'}>{y}</span>
                </button>
              ))}
            </div>
          )}

          {mode === 'months' && (
            <div className="grid grid-cols-3 gap-2 p-1">
              {MESES.map((mes, i) => {
                const disabled = new Date(cy, i, 1) > new Date(now.getFullYear(), now.getMonth(), 1)
                return (
                  <button key={mes} onClick={() => { if (!disabled) { setCm(i); setMode('days') } }} disabled={disabled}
                    className="rounded-xl py-3 text-xs font-black disabled:opacity-25"
                    style={i === cm ? { background: accent, color: 'white' } : {}}>
                    <span className={i === cm ? '' : 'text-slate-600 dark:text-slate-300'}>{mes.slice(0, 3)}</span>
                  </button>
                )
              })}
            </div>
          )}

          {mode === 'days' && (
            <>
              <div className="mb-1 grid grid-cols-7">
                {WEEKDAYS.map((d, i) => <div key={i} className="text-center text-[11px] font-black text-slate-400">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: blanks }, (_, i) => <div key={`b${i}`} className="aspect-square" />)}
                {Array.from({ length: total }, (_, i) => {
                  const day = i + 1
                  const ds = ymd(cy, cm, day)
                  const isSel = ds === selected
                  const isToday = ds === todayStr
                  const isFuture = ds > todayStr
                  return (
                    <button key={day} disabled={isFuture} onClick={() => setSelected(ds)}
                      className="relative flex aspect-square items-center justify-center rounded-full text-sm font-bold transition-colors disabled:opacity-25"
                      style={isSel
                        ? { background: accent, color: 'white', boxShadow: `0 6px 16px ${accent}66` }
                        : { color: 'var(--text-1, #1e1b4b)' }}>
                      <span className={isSel ? '' : isToday ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}>{day}</span>
                      {isToday && !isSel && <span className="absolute bottom-1 h-1 w-1 rounded-full" style={{ background: accent }} />}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-black text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">CANCELAR</button>
          <button onClick={() => { if (selected) { onSelect(selected); onClose() } }} disabled={!selected}
            className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-black text-white disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accent2})` }}>
            <Check size={16} /> ACEPTAR
          </button>
        </div>
      </motion.div>
    </div>
  )
}
