'use client'

import * as XLSX from 'xlsx-js-style'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { differenceInCalendarDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react'
import { Toaster, toast } from 'sonner'

import { supabase } from '@/utils/supabase/client'

type Balance = {
  id: string
  dni: string
  trabajador_nombre: string
  area: string | null
  cargo: string | null
  codigo_excel: string | null
  periodo: number
  saldo_arrastre: number
  gozados_ene: number
  gozados_feb: number
  gozados_mar: number
  gozados_abr: number
  gozados_may: number
  gozados_jun: number
  gozados_jul: number
  gozados_ago: number
  gozados_set: number
  gozados_oct: number
  gozados_nov: number
  gozados_dic: number
  total_gozados: number
  dias_pendientes: number
  fecha_vencimiento: string | null
  vacaciones_por_vencer?: number | null
  vacaciones_pendientes_periodo?: number | null
}

type RequestRow = {
  id: string
  dni: string
  trabajador_nombre: string
  area: string | null
  fecha_inicio: string
  fecha_fin: string
  dias_solicitados: number
  comentario: string | null
  estado: string
  created_at: string
}

type MonthCol = {
  key: keyof Balance
  label: string
  monthIndex: number
}

type MonthDetail = {
  row: Balance
  col: MonthCol
  imported: number
  approved: number
  requests: RequestRow[]
}

type EditorDraft = {
  id?: string
  dni: string
  trabajador_nombre: string
  area: string
  cargo: string
  codigo_excel: string
  saldo_arrastre: string
  dias_pendientes: string
  fecha_vencimiento: string
  vacaciones_por_vencer: string
}

type ManualRequestDraft = {
  id?: string
  dni: string
  trabajador_nombre: string
  area: string
  fecha_inicio: string
  fecha_fin: string
  comentario: string
  estado: 'aprobada' | 'solicitada' | 'cancelada'
}

const months: MonthCol[] = [
  { key: 'gozados_ene', label: 'ENE', monthIndex: 0 },
  { key: 'gozados_feb', label: 'FEB', monthIndex: 1 },
  { key: 'gozados_mar', label: 'MAR', monthIndex: 2 },
  { key: 'gozados_abr', label: 'ABR', monthIndex: 3 },
  { key: 'gozados_may', label: 'MAY', monthIndex: 4 },
  { key: 'gozados_jun', label: 'JUN', monthIndex: 5 },
  { key: 'gozados_jul', label: 'JUL', monthIndex: 6 },
  { key: 'gozados_ago', label: 'AGO', monthIndex: 7 },
  { key: 'gozados_set', label: 'SET', monthIndex: 8 },
  { key: 'gozados_oct', label: 'OCT', monthIndex: 9 },
  { key: 'gozados_nov', label: 'NOV', monthIndex: 10 },
  { key: 'gozados_dic', label: 'DIC', monthIndex: 11 },
]

const preferredAreaOrder = [
  'AREA DE GERENCIA',
  'AREA DE PRESUPUESTO',
  'AREA DE OPERACIONES',
  'AREA CONTABLE',
  'AREA DE FINANZAS',
  'AREA DE LOGISTICA',
  'AREA DE REGURSOS HUMANOS',
  'AREA DE SEGURIDAD',
  'AREA COMERCIAL',
]

const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const cloneDeep = <T,>(value: T): T => JSON.parse(JSON.stringify(value))

const normalizeTemplateName = (value: string | null | undefined) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toUpperCase()

function toExcelSerial(value: string | null) {
  if (!value) return ''
  const date = asDate(value)
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000)
}

function formatCommentDate(value: string) {
  return format(asDate(value), 'dd/MM', { locale: es })
}

const blankDraft = (): EditorDraft => ({
  dni: '',
  trabajador_nombre: '',
  area: '',
  cargo: '',
  codigo_excel: '',
  saldo_arrastre: '0',
  dias_pendientes: '0',
  fecha_vencimiento: '',
  vacaciones_por_vencer: '0',
})

const blankManualRequestDraft = (): ManualRequestDraft => ({
  dni: '',
  trabajador_nombre: '',
  area: '',
  fecha_inicio: '',
  fecha_fin: '',
  comentario: '',
  estado: 'aprobada',
})

function areaSortValue(value: string | null) {
  const normalized = String(value ?? 'SIN AREA').trim().toUpperCase()
  const index = preferredAreaOrder.indexOf(normalized)
  return index === -1 ? preferredAreaOrder.length + 100 : index
}

const asDate = (value: string) => new Date(value.includes('T') ? value : `${value}T12:00:00`)
const shortDate = (value: string | null) => (value ? format(asDate(value), 'dd/MM/yy', { locale: es }) : '--')
const longDate = (value: string) => format(asDate(value), 'dd MMM yyyy', { locale: es })
const dateTime = (value: string) => format(asDate(value), 'dd MMM yyyy - HH:mm', { locale: es })
const inputDate = (value: Date) => format(value, 'yyyy-MM-dd')
const requestedDays = (start: string, end: string) => {
  if (!start || !end) return 0
  const days = differenceInCalendarDays(asDate(end), asDate(start)) + 1
  return days > 0 ? days : 0
}
const overlapsYear = (item: RequestRow, year: number) => asDate(item.fecha_inicio) <= new Date(Date.UTC(year, 11, 31, 12)) && asDate(item.fecha_fin) >= new Date(Date.UTC(year, 0, 1, 12))
const overlapsMonth = (item: RequestRow, year: number, month: number) => asDate(item.fecha_inicio) <= new Date(Date.UTC(year, month + 1, 0, 12)) && asDate(item.fecha_fin) >= new Date(Date.UTC(year, month, 1, 12))
function overlapDaysInMonth(item: RequestRow, year: number, month: number) {
  const start = asDate(item.fecha_inicio)
  const end = asDate(item.fecha_fin)
  const monthStart = new Date(Date.UTC(year, month, 1, 12))
  const monthEnd = new Date(Date.UTC(year, month + 1, 0, 12))
  const overlapStart = start > monthStart ? start : monthStart
  const overlapEnd = end < monthEnd ? end : monthEnd
  if (overlapStart > overlapEnd) return 0
  return Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1
}

const prevStatus = (estado: string) =>
  estado === 'aprobada'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
    : estado === 'cancelada'
      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
      : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'

function MonthModal({
  detail,
  onClose,
  onAddManual,
  onEditRequest,
}: {
  detail: MonthDetail | null
  onClose: () => void
  onAddManual: (row: Balance, monthIndex: number) => void
  onEditRequest: (row: RequestRow) => void
}) {
  if (!detail) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Detalle {detail.col.label} {detail.row.periodo}</p>
            <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">{detail.row.trabajador_nombre}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{detail.row.area || 'SIN AREA'} - {detail.row.cargo || 'SIN CARGO'}</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 p-2 dark:border-slate-700"><X size={16} /></button>
        </div>
        <div className="grid gap-3 border-b border-slate-200 p-5 sm:grid-cols-3 dark:border-slate-800">
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950"><p className="text-[10px] font-black uppercase text-slate-400">Importado</p><p className="mt-2 text-2xl font-black">{detail.imported}</p></div>
          <div className="rounded-2xl bg-blue-50 p-4 dark:bg-blue-500/10"><p className="text-[10px] font-black uppercase text-blue-500">Aprobado</p><p className="mt-2 text-2xl font-black text-blue-700 dark:text-blue-300">{detail.approved}</p></div>
          <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10"><p className="text-[10px] font-black uppercase text-emerald-500">Visible</p><p className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300">{detail.imported + detail.approved}</p></div>
        </div>
        <div className="border-b border-slate-200 p-5 dark:border-slate-800">
          <button
            onClick={() => onAddManual(detail.row, detail.col.monthIndex)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white"
          >
            <UserPlus size={14} />
            REGISTRAR VACACIONES MANUAL
          </button>
        </div>
        <div className="max-h-[420px] space-y-3 overflow-y-auto p-5">
          {detail.requests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">No hay solicitudes en este mes.</div>
          ) : detail.requests.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{longDate(item.fecha_inicio)} al {longDate(item.fecha_fin)}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pedido: {item.dias_solicitados} dias - En este mes: {overlapDaysInMonth(item, detail.row.periodo, detail.col.monthIndex)} dias</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => onEditRequest(item)} className="rounded-lg border border-blue-200 p-1.5 text-blue-600 hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-300 dark:hover:bg-blue-500/10" title="Editar solicitud">
                    <Pencil size={12} />
                  </button>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${prevStatus(item.estado)}`}>{item.estado}</span>
                </div>
              </div>
              {item.comentario && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">{item.comentario}</p>}
              <p className="mt-3 text-[11px] text-slate-400">Registrada: {dateTime(item.created_at)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ManualRequestModal({
  open,
  draft,
  setDraft,
  onClose,
  onSave,
  saving,
  isEdit = false,
}: {
  open: boolean
  draft: ManualRequestDraft
  setDraft: (next: ManualRequestDraft) => void
  onClose: () => void
  onSave: () => void
  saving: boolean
  isEdit?: boolean
}) {
  if (!open) return null

  const totalDias = requestedDays(draft.fecha_inicio, draft.fecha_fin)

  const update = (key: keyof ManualRequestDraft, value: string) => setDraft({ ...draft, [key]: value })

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">RRHH</p>
            <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">{isEdit ? 'Editar solicitud de vacaciones' : 'Registrar vacaciones manuales'}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{draft.trabajador_nombre || 'Selecciona un trabajador'}{draft.area ? ` - ${draft.area}` : ''}</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 p-2 dark:border-slate-700"><X size={16} /></button>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Fecha inicio</label>
            <input type="date" value={draft.fecha_inicio} onChange={(e) => update('fecha_inicio', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none dark:border-slate-700 dark:bg-slate-950" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Fecha fin</label>
            <input type="date" value={draft.fecha_fin} onChange={(e) => update('fecha_fin', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none dark:border-slate-700 dark:bg-slate-950" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Estado</label>
            <select value={draft.estado} onChange={(e) => update('estado', e.target.value as ManualRequestDraft['estado'])} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black outline-none dark:border-slate-700 dark:bg-slate-950">
              <option value="aprobada">APROBADA</option>
              <option value="solicitada">SOLICITADA</option>
              <option value="cancelada">CANCELADA</option>
            </select>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-500">Dias calculados</p>
            <p className="mt-2 text-3xl font-black text-blue-700 dark:text-blue-300">{totalDias}</p>
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-200">Se cuentan dias calendario entre inicio y fin.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Comentario</label>
            <textarea value={draft.comentario} onChange={(e) => update('comentario', e.target.value)} rows={3} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none dark:border-slate-700 dark:bg-slate-950" placeholder="Ej. Registro manual de RRHH" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-5 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Al guardar, los dias se recalculan automaticamente entre fecha inicio y fin.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black dark:border-slate-700">CANCELAR</button>
            <button onClick={onSave} disabled={saving || totalDias <= 0} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
              {saving ? 'GUARDANDO...' : isEdit ? 'GUARDAR CAMBIOS' : 'GUARDAR VACACIONES'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EditorModal({
  open,
  draft,
  setDraft,
  onClose,
  onSave,
  saving,
  isEdit,
  areaSuggestions,
}: {
  open: boolean
  draft: EditorDraft
  setDraft: (next: EditorDraft) => void
  onClose: () => void
  onSave: () => void
  saving: boolean
  isEdit: boolean
  areaSuggestions: string[]
}) {
  if (!open) return null

  const update = (key: keyof EditorDraft, value: string) => setDraft({ ...draft, [key]: value })

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">RRHH</p>
            <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">{isEdit ? 'Editar trabajador' : 'Nuevo trabajador'}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Actualiza categoria, cargo y datos base para vacaciones.</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 p-2 dark:border-slate-700"><X size={16} /></button>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">DNI</label>
            <input value={draft.dni} onChange={(e) => update('dni', e.target.value.toUpperCase())} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none dark:border-slate-700 dark:bg-slate-950" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Codigo Excel</label>
            <input value={draft.codigo_excel} onChange={(e) => update('codigo_excel', e.target.value.toUpperCase())} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none dark:border-slate-700 dark:bg-slate-950" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Trabajador</label>
            <input value={draft.trabajador_nombre} onChange={(e) => update('trabajador_nombre', e.target.value.toUpperCase())} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none dark:border-slate-700 dark:bg-slate-950" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Categoria / Area</label>
            <input list="vac-area-suggestions" value={draft.area} onChange={(e) => update('area', e.target.value.toUpperCase())} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none dark:border-slate-700 dark:bg-slate-950" />
            <datalist id="vac-area-suggestions">
              {areaSuggestions.map((item) => <option key={item} value={item} />)}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Cargo</label>
            <input value={draft.cargo} onChange={(e) => update('cargo', e.target.value.toUpperCase())} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none dark:border-slate-700 dark:bg-slate-950" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Saldo arrastre</label>
            <input type="number" value={draft.saldo_arrastre} onChange={(e) => update('saldo_arrastre', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none dark:border-slate-700 dark:bg-slate-950" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Pendientes año previo</label>
            <input type="number" value={draft.dias_pendientes} onChange={(e) => update('dias_pendientes', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none dark:border-slate-700 dark:bg-slate-950" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Fecha vencimiento</label>
            <input type="date" value={draft.fecha_vencimiento} onChange={(e) => update('fecha_vencimiento', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none dark:border-slate-700 dark:bg-slate-950" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Vacaciones por vencer</label>
            <input type="number" value={draft.vacaciones_por_vencer} onChange={(e) => update('vacaciones_por_vencer', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium outline-none dark:border-slate-700 dark:bg-slate-950" />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-5 dark:border-slate-800">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black dark:border-slate-700">CANCELAR</button>
          <button onClick={onSave} disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
            {saving ? 'GUARDANDO...' : isEdit ? 'GUARDAR CAMBIOS' : 'CREAR TRABAJADOR'}
          </button>
        </div>
      </div>
    </div>
  )
}

function VacacionesPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [balances, setBalances] = useState<Balance[]>([])
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('TODAS')
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MonthDetail | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorSaving, setEditorSaving] = useState(false)
  const [editorDraft, setEditorDraft] = useState<EditorDraft>(blankDraft())
  const [manualOpen, setManualOpen] = useState(false)
  const [manualSaving, setManualSaving] = useState(false)
  const [manualDraft, setManualDraft] = useState<ManualRequestDraft>(blankManualRequestDraft())
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null)
  const currentYear = new Date().getFullYear()
  const requestedYear = Number(searchParams.get('year') || 0) || null

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [balancesRes, requestsRes] = await Promise.all([
      supabase.from('vacaciones_saldos').select('*').order('periodo', { ascending: false }).order('area').order('trabajador_nombre'),
      supabase.from('vacaciones_solicitudes').select('*').order('created_at', { ascending: false }),
    ])
    if (balancesRes.error) toast.error(balancesRes.error.message)
    if (requestsRes.error) toast.error(requestsRes.error.message)
    setBalances((balancesRes.data ?? []) as Balance[])
    setRequests((requestsRes.data ?? []) as RequestRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    setMounted(true)
    void fetchAll()
    const channel = supabase
      .channel('vacaciones-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vacaciones_saldos' }, () => void fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vacaciones_solicitudes' }, () => void fetchAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchAll])

  const years = useMemo(() => Array.from(new Set(balances.map((row) => num(row.periodo)))).filter(Boolean).sort((a, b) => b - a), [balances])
  const activeYear = requestedYear && years.includes(requestedYear) ? requestedYear : (years[0] ?? currentYear)
  const balancesYear = useMemo(() => (
    balances
      .filter((row) => num(row.periodo) === activeYear)
      .slice()
      .sort((a, b) => {
        const areaDiff = areaSortValue(a.area) - areaSortValue(b.area)
        if (areaDiff !== 0) return areaDiff
        const nameDiff = String(a.trabajador_nombre).localeCompare(String(b.trabajador_nombre), 'es', { sensitivity: 'base' })
        if (nameDiff !== 0) return nameDiff
        return String(a.codigo_excel || '').localeCompare(String(b.codigo_excel || ''), 'es', { sensitivity: 'base' })
      })
  ), [balances, activeYear])
  const requestsYear = useMemo(() => requests.filter((row) => overlapsYear(row, activeYear)), [requests, activeYear])
  const areaSuggestions = useMemo(() => {
    const extras = Array.from(new Set(balances.map((row) => String(row.area || '').trim().toUpperCase()).filter(Boolean)))
    return Array.from(new Set([...preferredAreaOrder, ...extras])).filter(Boolean)
  }, [balances])
  const areas = useMemo(() => ['TODAS', ...areaSuggestions], [areaSuggestions])
  const filtered = useMemo(() => balancesYear.filter((row) => {
    const q = query.trim().toLowerCase()
    return (!q || row.trabajador_nombre.toLowerCase().includes(q) || row.dni.includes(q) || (row.cargo || '').toLowerCase().includes(q))
      && (area === 'TODAS' || row.area === area)
  }), [balancesYear, query, area])

  const grouped = useMemo(() => filtered.reduce<Record<string, Balance[]>>((acc, row) => {
    const key = row.area || 'SIN AREA'
    if (!acc[key]) acc[key] = []
    acc[key].push(row)
    return acc
  }, {}), [filtered])

  const groupedAll = useMemo(() => balancesYear.reduce<Record<string, Balance[]>>((acc, row) => {
    const key = row.area || 'SIN AREA'
    if (!acc[key]) acc[key] = []
    acc[key].push(row)
    return acc
  }, {}), [balancesYear])

  const getMonthRequests = useCallback((dni: string, year: number, monthIndex: number) => requestsYear.filter((row) => row.dni === dni && overlapsMonth(row, year, monthIndex)), [requestsYear])
  const getMonthView = useCallback((row: Balance, col: MonthCol) => {
    const imported = num(row[col.key])
    const monthRequests = getMonthRequests(row.dni, row.periodo, col.monthIndex)
    const approved = monthRequests.filter((item) => item.estado === 'aprobada').reduce((sum, item) => sum + overlapDaysInMonth(item, row.periodo, col.monthIndex), 0)
    return { imported, approved, total: imported + approved, requests: monthRequests }
  }, [getMonthRequests])

  const derived = useCallback((row: Balance) => {
    const approvedDays = requestsYear.filter((item) => item.dni === row.dni && item.estado === 'aprobada').reduce((sum, item) => sum + num(item.dias_solicitados), 0)
    const pendientesPrev = num(row.dias_pendientes) - approvedDays
    const porVencer = row.vacaciones_por_vencer != null ? num(row.vacaciones_por_vencer) : (row.fecha_vencimiento ? 30 : 0)
    const pendientesPeriodo = (row.vacaciones_pendientes_periodo != null ? num(row.vacaciones_pendientes_periodo) : (num(row.dias_pendientes) + porVencer)) - approvedDays
    return { approvedDays, pendientesPrev, pendientesPeriodo, gozados: num(row.total_gozados) + approvedDays, porVencer }
  }, [requestsYear])

  const exportExcel = useCallback(async () => {
    if (!balancesYear.length) return toast.error('No hay datos para exportar')
    setExporting(true)
    try {
      const response = await fetch('/vacaciones-template.xlsx')
      if (!response.ok) throw new Error('No se encontro la plantilla del Excel')

      const buffer = await response.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellStyles: true })
      const targetSheetName = `vacaciones ${activeYear}`
      const sourceSheetName =
        wb.SheetNames.find((name) => String(name).toLowerCase() === targetSheetName.toLowerCase()) ||
        wb.SheetNames.find((name) => /^vacaciones \d{4}$/i.test(String(name)))

      if (!sourceSheetName) throw new Error('La plantilla no tiene una hoja de vacaciones base')

      const templateSheet = cloneDeep(wb.Sheets[sourceSheetName])
      const titleRowIndex = 0
      const headerRowIndex = 1
      const areaRowIndex = 2
      const employeeRowIndex = 3
      const titleStyles = Array.from({ length: 21 }, (_, c) => cloneDeep(templateSheet[XLSX.utils.encode_cell({ r: titleRowIndex, c })]?.s || null))
      const headerStyles = Array.from({ length: 21 }, (_, c) => cloneDeep(templateSheet[XLSX.utils.encode_cell({ r: headerRowIndex, c })]?.s || null))
      const areaStyles = Array.from({ length: 21 }, (_, c) => cloneDeep(templateSheet[XLSX.utils.encode_cell({ r: areaRowIndex, c })]?.s || null))
      const employeeStyles = Array.from({ length: 21 }, (_, c) => cloneDeep(templateSheet[XLSX.utils.encode_cell({ r: employeeRowIndex, c })]?.s || null))
      const templateRowsMeta = cloneDeep(templateSheet['!rows'] || [])

      const templateMatrix = XLSX.utils.sheet_to_json(templateSheet, { header: 1, raw: true, defval: '' }) as Array<Array<string | number>>
      const templateAreaOrder: string[] = []
      const templatePeopleByArea: Record<string, string[]> = {}
      let currentArea = ''
      for (let i = 2; i < templateMatrix.length; i++) {
        const nombre = String(templateMatrix[i]?.[1] ?? '').trim()
        const cargo = String(templateMatrix[i]?.[2] ?? '').trim()
        if (!nombre) continue
        if (/^AREA\b/i.test(nombre)) {
          currentArea = nombre.toUpperCase()
          if (!templateAreaOrder.includes(currentArea)) templateAreaOrder.push(currentArea)
          if (!templatePeopleByArea[currentArea]) templatePeopleByArea[currentArea] = []
          continue
        }
        if (!cargo || !currentArea) continue
        templatePeopleByArea[currentArea] ||= []
        templatePeopleByArea[currentArea].push(normalizeTemplateName(nombre))
      }

      const rowsByArea = new Map<string, Balance[]>()
      balancesYear.forEach((row) => {
        const key = String(row.area || 'SIN AREA').trim().toUpperCase()
        if (!rowsByArea.has(key)) rowsByArea.set(key, [])
        rowsByArea.get(key)!.push(row)
      })

      const orderedAreas = [
        ...templateAreaOrder,
        ...Array.from(rowsByArea.keys()).filter((area) => !templateAreaOrder.includes(area)).sort((a, b) => areaSortValue(a) - areaSortValue(b) || a.localeCompare(b, 'es', { sensitivity: 'base' })),
      ]

      const rows: Array<Array<string | number>> = [
        ['', 'REPORTE DE VACACIONES'],
        ['', 'EMPLEADOS', '', `SALDOS DE DIAS POR GOZAR ${activeYear - 1}`, 'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SET', 'OCT', 'NOV', 'DIC', 'Total días gozados', `PENDIENTES POR GOZAR ${activeYear - 1}`, `FECHAS DE VENCIMIENTO ${activeYear}`, `VACACIONES POR VENCER ${activeYear}`, `Vacaciones Pendientes por gozar ${activeYear}`],
      ]

      orderedAreas.forEach((groupName) => {
        const sourceRows = [...(rowsByArea.get(groupName) ?? [])]
        if (!sourceRows.length && !templateAreaOrder.includes(groupName)) return

        rows.push(['', groupName])
        const used = new Set<number>()
        const templatePeople = templatePeopleByArea[groupName] ?? []

        templatePeople.forEach((personName) => {
          const index = sourceRows.findIndex((row, idx) => !used.has(idx) && normalizeTemplateName(row.trabajador_nombre) === personName)
          if (index === -1) return
          used.add(index)
          const row = sourceRows[index]
          const d = derived(row)
          rows.push([
            row.codigo_excel || '',
            row.trabajador_nombre,
            row.cargo || '',
            num(row.saldo_arrastre),
            ...months.map((col) => getMonthView(row, col).total),
            d.gozados,
            d.pendientesPrev,
            toExcelSerial(row.fecha_vencimiento),
            d.porVencer,
            d.pendientesPeriodo,
          ])
        })

        sourceRows
          .filter((_, idx) => !used.has(idx))
          .sort((a, b) => String(a.codigo_excel || '').localeCompare(String(b.codigo_excel || ''), 'es', { sensitivity: 'base' }) || a.trabajador_nombre.localeCompare(b.trabajador_nombre, 'es', { sensitivity: 'base' }))
          .forEach((row) => {
            const d = derived(row)
            rows.push([
              row.codigo_excel || '',
              row.trabajador_nombre,
              row.cargo || '',
              num(row.saldo_arrastre),
              ...months.map((col) => getMonthView(row, col).total),
              d.gozados,
              d.pendientesPrev,
              toExcelSerial(row.fecha_vencimiento),
              d.porVencer,
              d.pendientesPeriodo,
            ])
          })
      })

      const ws = cloneDeep(templateSheet)
      ws['!merges'] = cloneDeep(templateSheet['!merges'] || [{ s: { r: 0, c: 1 }, e: { r: 0, c: 20 } }])
      ws['!cols'] = cloneDeep(templateSheet['!cols'] || [])
      const areaHeight = templateRowsMeta[areaRowIndex]?.hpx || templateRowsMeta[areaRowIndex]?.hpt || 22
      const employeeHeight = templateRowsMeta[employeeRowIndex]?.hpx || templateRowsMeta[employeeRowIndex]?.hpt || 22
      ws['!rows'] = rows.map((row, index) => {
        if (index < 2) return cloneDeep(templateRowsMeta[index] || {})
        const isAreaRow = Boolean(row[1] && !row[2] && !row[3])
        return cloneDeep(isAreaRow ? { hpx: areaHeight } : { hpx: employeeHeight })
      })

      const templateRowCount = XLSX.utils.decode_range(templateSheet['!ref'] || 'A1:U1').e.r + 1
      for (let r = 0; r < templateRowCount; r++) {
        for (let c = 0; c <= 20; c++) {
          const address = XLSX.utils.encode_cell({ r, c })
          if (!ws[address]) ws[address] = { t: 's', v: '' }
          ws[address].v = ''
          ws[address].t = 's'
          delete ws[address].c
        }
      }

      rows.forEach((row, r) => {
        const isAreaRow = r >= 2 && Boolean(row[1] && !row[2] && !row[3])
        for (let c = 0; c <= 20; c++) {
          const address = XLSX.utils.encode_cell({ r, c })
          const value = row[c] ?? ''
          const existing = ws[address] || { v: '', t: 's' }
          ws[address] = {
            ...existing,
            v: value,
            t: typeof value === 'number' ? 'n' : 's',
            s:
              r === 0
                ? cloneDeep(titleStyles[c])
                : r === 1
                  ? cloneDeep(headerStyles[c])
                  : isAreaRow
                    ? {
                        ...(cloneDeep(areaStyles[c]) || {}),
                        fill: { patternType: 'solid', fgColor: { rgb: 'BDD7EE' } },
                        font: { ...((cloneDeep(areaStyles[c]) || {}).font || {}), bold: true, color: { rgb: '000000' } },
                      }
                    : cloneDeep(employeeStyles[c]),
          }
        }
      })

      rows.forEach((row, r) => {
        if (r < 2) return
        const isAreaRow = Boolean(row[1] && !row[2] && !row[3])
        if (isAreaRow) return
        const workerName = String(row[1] || '')
        const worker = balancesYear.find((item) => normalizeTemplateName(item.trabajador_nombre) === normalizeTemplateName(workerName))
        if (!worker) return

        months.forEach((col, index) => {
          const monthRequests = getMonthRequests(worker.dni, activeYear, col.monthIndex).filter((item) => item.estado === 'aprobada')
          if (!monthRequests.length) return

          const address = XLSX.utils.encode_cell({ r, c: 4 + index })
          const commentLines = monthRequests.map((item) => {
            const start = formatCommentDate(item.fecha_inicio)
            const end = formatCommentDate(item.fecha_fin)
            return start === end ? `VACACIONES ${start}` : `VACACIONES ${start} AL ${end}`
          })

          ws[address] = ws[address] || { t: 'n', v: 0 }
          ws[address].c = [
            {
              a: 'RUAG',
              t: `RUAG:\n${commentLines.join('\n')}`,
            },
          ] as any
          ;(ws[address].c as any).hidden = true
        })
      })

      ws['!ref'] = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: Math.max(rows.length - 1, 1), c: 20 },
      })

      if (!wb.SheetNames.includes(targetSheetName)) wb.SheetNames.push(targetSheetName)
      wb.Sheets[targetSheetName] = ws
      if (sourceSheetName !== targetSheetName) {
        wb.SheetNames = wb.SheetNames.filter((name, index, arr) => arr.indexOf(name) === index)
      }

      XLSX.writeFile(wb, `119 Control de vacaciones al ${format(new Date(), 'dd.MM.yy')} RGA.xlsx`)
      toast.success(`Excel ${activeYear} descargado`)
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo exportar el Excel')
    } finally {
      setExporting(false)
    }
  }, [activeYear, balancesYear, derived, getMonthRequests, getMonthView, groupedAll])

  const resolveRequest = useCallback(async (row: RequestRow, estado: 'aprobada' | 'cancelada') => {
    setResolvingId(row.id)
    const { error } = await supabase.from('vacaciones_solicitudes').update({ estado }).eq('id', row.id)
    setResolvingId(null)
    if (error) toast.error(error.message)
    else toast.success(estado === 'aprobada' ? `Vacaciones aprobadas para ${row.trabajador_nombre}` : `Vacaciones rechazadas para ${row.trabajador_nombre}`)
  }, [])

  const openNewEditor = useCallback(() => {
    setEditorDraft(blankDraft())
    setEditorOpen(true)
  }, [])

  const openEditEditor = useCallback((row: Balance) => {
    setEditorDraft({
      id: row.id,
      dni: row.dni,
      trabajador_nombre: row.trabajador_nombre,
      area: row.area || '',
      cargo: row.cargo || '',
      codigo_excel: row.codigo_excel || '',
      saldo_arrastre: String(num(row.saldo_arrastre)),
      dias_pendientes: String(num(row.dias_pendientes)),
      fecha_vencimiento: row.fecha_vencimiento || '',
      vacaciones_por_vencer: String(row.vacaciones_por_vencer != null ? num(row.vacaciones_por_vencer) : (row.fecha_vencimiento ? 30 : 0)),
    })
    setEditorOpen(true)
  }, [])

  const openManualRequest = useCallback((row: Balance, monthIndex?: number) => {
    const now = new Date()
    let startDate = activeYear === now.getFullYear() ? now : new Date(activeYear, 0, 1)
    let endDate = startDate

    if (typeof monthIndex === 'number') {
      const monthStart = new Date(activeYear, monthIndex, 1)
      const monthEnd = new Date(activeYear, monthIndex + 1, 0)
      if (activeYear === now.getFullYear() && monthIndex === now.getMonth()) {
        startDate = now > monthStart ? now : monthStart
        endDate = monthEnd
      } else {
        startDate = monthStart
        endDate = monthEnd
      }
    }

    setManualDraft({
      dni: row.dni,
      trabajador_nombre: row.trabajador_nombre,
      area: row.area || '',
      fecha_inicio: inputDate(startDate),
      fecha_fin: inputDate(endDate),
      comentario: 'Registro manual RRHH',
      estado: 'aprobada',
    })
    setEditingRequestId(null)
    setManualOpen(true)
  }, [activeYear])

  const openEditRequest = useCallback((row: RequestRow) => {
    setManualDraft({
      id: row.id,
      dni: row.dni,
      trabajador_nombre: row.trabajador_nombre,
      area: row.area || '',
      fecha_inicio: row.fecha_inicio,
      fecha_fin: row.fecha_fin,
      comentario: row.comentario || '',
      estado: row.estado === 'cancelada' ? 'cancelada' : row.estado === 'solicitada' ? 'solicitada' : 'aprobada',
    })
    setEditingRequestId(row.id)
    setManualOpen(true)
  }, [])

  const saveManualRequest = useCallback(async () => {
    const totalDias = requestedDays(manualDraft.fecha_inicio, manualDraft.fecha_fin)
    if (!manualDraft.dni || !manualDraft.trabajador_nombre) {
      toast.error('Selecciona un trabajador')
      return
    }
    if (!manualDraft.fecha_inicio || !manualDraft.fecha_fin) {
      toast.error('Completa el rango de fechas')
      return
    }
    if (totalDias <= 0) {
      toast.error('El rango de fechas no es valido')
      return
    }

    setManualSaving(true)
    const payload = {
      dni: manualDraft.dni,
      trabajador_nombre: manualDraft.trabajador_nombre,
      area: manualDraft.area || null,
      fecha_inicio: manualDraft.fecha_inicio,
      fecha_fin: manualDraft.fecha_fin,
      dias_solicitados: totalDias,
      comentario: manualDraft.comentario.trim() || (editingRequestId ? 'Actualizado por RRHH' : 'Registro manual RRHH'),
      estado: manualDraft.estado,
    }
    const { error } = editingRequestId
      ? await supabase.from('vacaciones_solicitudes').update(payload).eq('id', editingRequestId)
      : await supabase.from('vacaciones_solicitudes').insert(payload)
    setManualSaving(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(editingRequestId ? 'Solicitud de vacaciones actualizada' : manualDraft.estado === 'aprobada' ? 'Vacaciones registradas y aprobadas' : 'Solicitud manual registrada')
    setManualOpen(false)
    setManualDraft(blankManualRequestDraft())
    setEditingRequestId(null)
    void fetchAll()
  }, [editingRequestId, fetchAll, manualDraft])

  const saveEditor = useCallback(async () => {
    if (!editorDraft.dni.trim() || !editorDraft.trabajador_nombre.trim() || !editorDraft.area.trim() || !editorDraft.cargo.trim()) {
      toast.error('Completa DNI, trabajador, categoria y cargo')
      return
    }

    setEditorSaving(true)
    const profileDni = editorDraft.dni.trim().toUpperCase()
    const profileName = editorDraft.trabajador_nombre.trim().toUpperCase()
    const profileArea = editorDraft.area.trim().toUpperCase()

    const { data: existingProfile, error: profileFetchError } = await supabase
      .from('fotocheck_perfiles')
      .select('dni, foto_url')
      .eq('dni', profileDni)
      .maybeSingle()

    if (profileFetchError) {
      setEditorSaving(false)
      toast.error(profileFetchError.message)
      return
    }

    const profileMutation = existingProfile
      ? await supabase
          .from('fotocheck_perfiles')
          .update({
            nombres_completos: profileName,
            area: profileArea,
          })
          .eq('dni', profileDni)
      : await supabase
          .from('fotocheck_perfiles')
          .insert({
            dni: profileDni,
            nombres_completos: profileName,
            area: profileArea,
            foto_url: '',
          })

    if (profileMutation.error) {
      setEditorSaving(false)
      toast.error(profileMutation.error.message)
      return
    }

    const payload = {
      dni: profileDni,
      trabajador_nombre: profileName,
      area: profileArea,
      cargo: editorDraft.cargo.trim().toUpperCase(),
      codigo_excel: editorDraft.codigo_excel.trim().toUpperCase() || null,
      periodo: activeYear,
      saldo_arrastre: num(editorDraft.saldo_arrastre),
      dias_extra: 0,
      gozados_ene: 0,
      gozados_feb: 0,
      gozados_mar: 0,
      gozados_abr: 0,
      gozados_may: 0,
      gozados_jun: 0,
      gozados_jul: 0,
      gozados_ago: 0,
      gozados_set: 0,
      gozados_oct: 0,
      gozados_nov: 0,
      gozados_dic: 0,
      total_gozados: 0,
      dias_pendientes: num(editorDraft.dias_pendientes),
      fecha_vencimiento: editorDraft.fecha_vencimiento || null,
      vacaciones_por_vencer: num(editorDraft.vacaciones_por_vencer),
      vacaciones_pendientes_periodo: num(editorDraft.dias_pendientes) + num(editorDraft.vacaciones_por_vencer),
    }

    const { error } = editorDraft.id
      ? await supabase.from('vacaciones_saldos').update({
          dni: payload.dni,
          trabajador_nombre: payload.trabajador_nombre,
          area: payload.area,
          cargo: payload.cargo,
          codigo_excel: payload.codigo_excel,
          saldo_arrastre: payload.saldo_arrastre,
          dias_pendientes: payload.dias_pendientes,
          fecha_vencimiento: payload.fecha_vencimiento,
          vacaciones_por_vencer: payload.vacaciones_por_vencer,
          vacaciones_pendientes_periodo: payload.vacaciones_pendientes_periodo,
        }).eq('id', editorDraft.id)
      : await supabase.from('vacaciones_saldos').insert(payload)

    setEditorSaving(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(editorDraft.id ? 'Trabajador actualizado' : 'Trabajador agregado a vacaciones')
    setEditorOpen(false)
    setEditorDraft(blankDraft())
    void fetchAll()
  }, [activeYear, editorDraft, fetchAll])

  if (!mounted) return <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950"><Loader2 className="animate-spin text-blue-600" size={28} /></div>

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-white sm:px-6 lg:px-8">
      <Toaster position="top-center" richColors />
      <MonthModal detail={detail} onClose={() => setDetail(null)} onAddManual={openManualRequest} onEditRequest={openEditRequest} />
      <EditorModal
        open={editorOpen}
        draft={editorDraft}
        setDraft={setEditorDraft}
        onClose={() => setEditorOpen(false)}
        onSave={() => void saveEditor()}
        saving={editorSaving}
        isEdit={Boolean(editorDraft.id)}
        areaSuggestions={areaSuggestions}
      />
      <ManualRequestModal
        open={manualOpen}
        draft={manualDraft}
        setDraft={setManualDraft}
        onClose={() => { setManualOpen(false); setEditingRequestId(null); setManualDraft(blankManualRequestDraft()) }}
        onSave={() => void saveManualRequest()}
        saving={manualSaving}
        isEdit={Boolean(editingRequestId)}
      />
      <div className="mx-auto max-w-[1800px] space-y-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-4">
              <Link href="/" className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"><ArrowLeft size={18} /></Link>
              <div className="hidden h-11 w-11 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 sm:block">
                <img src="/ruag-logo.png" alt="RUAG" className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-500">RUAG</p>
                <h1 className="text-3xl font-black tracking-tight">Vacaciones {activeYear}</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Vista basada en la hoja anual y preparada para archivo por periodo.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/vacaciones/historico" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black dark:border-slate-700 dark:bg-slate-900"><Archive size={14} /> HISTORICO</Link>
              <button onClick={() => void fetchAll()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black dark:border-slate-700 dark:bg-slate-900"><RefreshCw size={14} /> ACTUALIZAR</button>
              <button onClick={openNewEditor} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"><UserPlus size={14} /> NUEVO RRHH</button>
              <button onClick={exportExcel} disabled={exporting || !balancesYear.length} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} EXPORTAR</button>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {Array.from(new Set([currentYear, ...years])).sort((a, b) => b - a).map((year) => (
              <button key={year} onClick={() => router.push(year === currentYear ? '/vacaciones' : `/vacaciones?year=${year}`)} className={`rounded-full px-3 py-1.5 text-[11px] font-black tracking-[0.14em] ${year === activeYear ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}>{year < (years[0] ?? currentYear) ? `ARCHIVO ${year}` : year}</button>
            ))}
          </div>
        </header>
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, cargo o DNI..." className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-medium outline-none dark:border-slate-700 dark:bg-slate-950" />
            </div>
            <select value={area} onChange={(e) => setArea(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black dark:border-slate-700 dark:bg-slate-950">
              {areas.map((item) => <option key={item} value={item}>{item === 'TODAS' ? 'Todas las areas' : item}</option>)}
            </select>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Control estilo Excel</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Incluye "Vacaciones Pendientes por gozar {activeYear}" y detalle por mes.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">{filtered.length} filas</span>
            </div>
            {loading ? (
              <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={26} /></div>
            ) : !filtered.length ? (
              <div className="flex min-h-[420px] items-center justify-center px-6 text-center text-sm text-slate-400">No hay saldos de vacaciones para mostrar.</div>
            ) : (
              <div className="max-h-[72vh] overflow-y-auto">
                <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
                  <colgroup>
                    <col className="w-[3%]" /><col className="w-[14%]" /><col className="w-[9%]" /><col className="w-[5%]" />
                    {months.map((col) => <col key={col.key} className="w-[3.4%]" />)}
                    <col className="w-[5%]" /><col className="w-[6%]" /><col className="w-[7%]" /><col className="w-[5%]" /><col className="w-[8%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                    <tr>
                      <th className="px-1.5 py-3">#</th><th className="px-1.5 py-3 text-left">EMPLEADOS</th><th className="px-1.5 py-3 text-left">CARGO</th><th className="px-1.5 py-3">{activeYear - 1}</th>
                      {months.map((col) => <th key={col.key} className="px-1 py-3">{col.label}</th>)}
                      <th className="px-1.5 py-3">GOZADOS</th><th className="px-1.5 py-3">PEND. {activeYear - 1}</th><th className="px-1.5 py-3">VENCE</th><th className="px-1.5 py-3">POR VENCER</th><th className="px-1.5 py-3">PEND. {activeYear}</th>
                    </tr>
                  </thead>
                  {Object.entries(grouped).map(([groupName, rows]) => (
                    <tbody key={groupName}>
                      <tr className="border-y border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950"><td colSpan={21} className="px-4 py-2 text-[11px] font-black tracking-[0.14em] text-slate-600 dark:text-slate-300">{groupName}</td></tr>
                      {rows.map((row) => {
                        const d = derived(row)
                        return (
                          <tr key={row.id} className="border-b border-slate-200 align-top dark:border-slate-800">
                            <td className="px-1.5 py-3 text-center font-black text-slate-500">{row.codigo_excel || '-'}</td>
                            <td className="px-1.5 py-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="line-clamp-2 font-black">{row.trabajador_nombre}</p>
                                  <p className="mt-1 font-mono text-[9px] text-slate-400">{row.dni}</p>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                  <button onClick={() => openManualRequest(row)} className="rounded-lg border border-blue-200 p-1.5 text-blue-600 hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-300 dark:hover:bg-blue-500/10" title="Registrar vacaciones manuales">
                                    <UserPlus size={12} />
                                  </button>
                                  <button onClick={() => openEditEditor(row)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" title="Editar trabajador">
                                    <Pencil size={12} />
                                  </button>
                                </div>
                              </div>
                            </td>
                            <td className="px-1.5 py-3 text-slate-600 dark:text-slate-300"><span className="line-clamp-2 block">{row.cargo || '--'}</span></td>
                            <td className="px-1.5 py-3 text-center font-black">{num(row.saldo_arrastre)}</td>
                            {months.map((col) => {
                              const view = getMonthView(row, col)
                              return <td key={col.key} className="px-0.5 py-2"><button onClick={() => setDetail({ row, col, imported: view.imported, approved: view.approved, requests: view.requests })} className={`w-full rounded-lg px-0.5 py-1 font-black ${view.total > 0 || view.requests.length ? 'bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-blue-500/20 dark:hover:text-blue-200' : 'text-slate-300 hover:bg-slate-100 dark:text-slate-700 dark:hover:bg-slate-800'}`}>{view.total}</button></td>
                            })}
                            <td className="px-1.5 py-3 text-center font-black text-blue-600 dark:text-blue-300">{d.gozados}</td>
                            <td className="px-1.5 py-3 text-center font-black">{d.pendientesPrev}</td>
                            <td className="px-1.5 py-3 text-center font-black text-slate-500 dark:text-slate-300">{shortDate(row.fecha_vencimiento)}</td>
                            <td className="px-1.5 py-3 text-center font-black text-amber-600 dark:text-amber-300">{d.porVencer}</td>
                            <td className="px-1.5 py-3 text-center font-black text-emerald-600 dark:text-emerald-300">{d.pendientesPeriodo}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  ))}
                </table>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Solicitudes en tiempo real</p></div>
              <div className="max-h-[520px] space-y-3 overflow-y-auto p-4">
                {requestsYear.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">Aun no hay solicitudes de vacaciones.</div>
                ) : requestsYear.slice(0, 12).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-black">{item.trabajador_nombre}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{longDate(item.fecha_inicio)} al {longDate(item.fecha_fin)}</p></div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button onClick={() => openEditRequest(item)} className="rounded-lg border border-blue-200 p-1.5 text-blue-600 hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-300 dark:hover:bg-blue-500/10" title="Editar solicitud">
                          <Pencil size={12} />
                        </button>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${prevStatus(item.estado)}`}>{item.estado}</span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400"><span>{item.dias_solicitados} dias</span><span>-</span><span>{item.area || 'SIN AREA'}</span></div>
                    {item.comentario && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">{item.comentario}</p>}
                    <p className="mt-3 text-[11px] text-slate-400">Registrada: {dateTime(item.created_at)}</p>
                    {item.estado === 'solicitada' && (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <button onClick={() => void resolveRequest(item, 'aprobada')} disabled={resolvingId === item.id} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{resolvingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} APROBAR</button>
                        <button onClick={() => void resolveRequest(item, 'cancelada')} disabled={resolvingId === item.id} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{resolvingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} RECHAZAR</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default function VacacionesPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950"><Loader2 className="animate-spin text-blue-600" size={28} /></div>}>
      <VacacionesPageContent />
    </Suspense>
  )
}
