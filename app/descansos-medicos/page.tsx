'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/utils/supabase/client'
import { motion } from 'framer-motion'
import { ArrowLeft, CheckCircle2, Clock3, Download, ExternalLink, Image as ImageIcon, Loader2, Stethoscope, Trash2, X, XCircle } from 'lucide-react'
import { Toaster, toast } from 'sonner'

type MedicalRequest = {
  id: string
  dni: string
  trabajador_nombre: string
  area: string | null
  fecha_inicio: string
  fecha_fin: string
  comentario: string | null
  evidencia_url: string
  evidencia_path: string | null
  evidencia_urls?: string[] | null
  evidencia_paths?: string[] | null
  estado: 'solicitada' | 'aprobada' | 'rechazada' | string
  created_at: string
  reviewed_at?: string | null
}

const WORKING_DAYS = new Set([1, 2, 3, 4, 5])

function evidenceUrls(row: MedicalRequest) {
  const urls = Array.isArray(row.evidencia_urls) ? row.evidencia_urls.filter(Boolean) : []
  if (!urls.length && row.evidencia_url) urls.push(row.evidencia_url)
  return urls
}

function getWeekday(dateKey: string) {
  return new Date(`${dateKey}T12:00:00-05:00`).getUTCDay()
}

function dateKeysBetween(startKey: string, endKey: string) {
  const keys: string[] = []
  let cursor = new Date(`${startKey}T12:00:00.000Z`)
  const end = new Date(`${endKey}T12:00:00.000Z`)
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return keys
}

function medicalIsoForDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 28, 59, 0, 0)).toISOString()
}

export default function DescansosMedicosPage() {
  const [rows, setRows] = useState<MedicalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'todas' | 'solicitada' | 'aprobada' | 'rechazada'>('solicitada')
  const [viewer, setViewer] = useState<MedicalRequest | null>(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('descansos_medicos_solicitudes')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) toast.error(error.message)
    else setRows((data ?? []) as MedicalRequest[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('descansos-medicos-rrhh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'descansos_medicos_solicitudes' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'todas') return rows
    return rows.filter((row) => row.estado === filter)
  }, [rows, filter])

  const aprobar = async (row: MedicalRequest) => {
    setSavingId(row.id)
    try {
      const fechas = dateKeysBetween(row.fecha_inicio, row.fecha_fin).filter((dateKey) => WORKING_DAYS.has(getWeekday(dateKey)))
      if (!fechas.length) throw new Error('El rango no tiene dias laborables')

      const { data: existing, error: existingError } = await supabase
        .from('registro_asistencias')
        .select('fecha')
        .eq('dni', row.dni)
        .gte('fecha', row.fecha_inicio)
        .lte('fecha', row.fecha_fin)

      if (existingError) throw existingError
      const existingDates = new Set((existing ?? []).map((item: any) => String(item.fecha)))
      const inserts = fechas
        .filter((dateKey) => !existingDates.has(dateKey))
        .map((dateKey) => ({
          dni: row.dni,
          fecha: dateKey,
          hora_ingreso: medicalIsoForDate(dateKey),
          hora_salida: null,
          estado_ingreso: 'DESCANSO MEDICO',
          nombres_completos: row.trabajador_nombre,
          area: row.area ?? '',
          foto_url: '',
          notas: `Descanso medico aprobado por RRHH. Solicitud: ${row.id}. ${row.comentario ?? ''}`.trim(),
        }))

      if (inserts.length) {
        const { error: insertError } = await supabase.from('registro_asistencias').insert(inserts)
        if (insertError) throw insertError
      }

      const { error: updateError } = await supabase
        .from('descansos_medicos_solicitudes')
        .update({ estado: 'aprobada', reviewed_at: new Date().toISOString() })
        .eq('id', row.id)
      if (updateError) throw updateError

      toast.success(`Aprobado: ${inserts.length} dia/s registrados`)
      await load()
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo aprobar')
    } finally {
      setSavingId(null)
    }
  }

  const rechazar = async (row: MedicalRequest) => {
    setSavingId(row.id)
    try {
      const { error } = await supabase
        .from('descansos_medicos_solicitudes')
        .update({ estado: 'rechazada', reviewed_at: new Date().toISOString() })
        .eq('id', row.id)
      if (error) throw error
      toast.success('Solicitud rechazada')
      await load()
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo rechazar')
    } finally {
      setSavingId(null)
    }
  }

  const descargarEvidencia = async (row: MedicalRequest) => {
    if (!row.evidencia_url) return
    try {
      const targetUrl = evidenceUrls(row)[0] ?? row.evidencia_url
      const response = await fetch(targetUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `descanso-medico-${row.dni}-${row.fecha_inicio}.jpg`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      window.open(evidenceUrls(row)[0] ?? row.evidencia_url, '_blank', 'noopener,noreferrer')
    }
  }

  const eliminar = async (row: MedicalRequest) => {
    const ok = window.confirm(`Eliminar descanso medico de ${row.trabajador_nombre}?`)
    if (!ok) return

    setSavingId(row.id)
    try {
      if (row.estado === 'aprobada') {
        const { error: attendanceError } = await supabase
          .from('registro_asistencias')
          .delete()
          .eq('dni', row.dni)
          .eq('estado_ingreso', 'DESCANSO MEDICO')
          .gte('fecha', row.fecha_inicio)
          .lte('fecha', row.fecha_fin)
          .ilike('notas', `%${row.id}%`)
        if (attendanceError) throw attendanceError
      }

      const paths = Array.isArray(row.evidencia_paths) && row.evidencia_paths.length
        ? row.evidencia_paths
        : row.evidencia_path ? [row.evidencia_path] : []
      if (paths.length) {
        await supabase.storage.from('descansos_medicos').remove(paths)
      }

      const { error } = await supabase
        .from('descansos_medicos_solicitudes')
        .delete()
        .eq('id', row.id)
      if (error) throw error

      if (viewer?.id === row.id) setViewer(null)
      toast.success('Descanso medico eliminado')
      await load()
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo eliminar')
    } finally {
      setSavingId(null)
    }
  }

  const counts = {
    solicitada: rows.filter((row) => row.estado === 'solicitada').length,
    aprobada: rows.filter((row) => row.estado === 'aprobada').length,
    rechazada: rows.filter((row) => row.estado === 'rechazada').length,
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-sky-50 p-4 sm:p-8">
      <Toaster richColors position="top-center" />
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 rounded-[28px] border border-white/80 bg-white/80 p-5 shadow-xl shadow-rose-100/60 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white transition active:scale-95">
              <ArrowLeft size={20} />
            </Link>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-lg shadow-rose-300">
              <Stethoscope size={26} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-500">RRHH</p>
              <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">Descansos Medicos</h1>
              <p className="text-sm font-semibold text-slate-500">Revisa evidencias, aprueba y registra los dias justificados.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <StatusPill label="Pendientes" value={counts.solicitada} tone="bg-amber-100 text-amber-700" />
            <StatusPill label="Aprobadas" value={counts.aprobada} tone="bg-emerald-100 text-emerald-700" />
            <StatusPill label="Rechazadas" value={counts.rechazada} tone="bg-rose-100 text-rose-700" />
          </div>
        </header>

        <section className="mb-5 flex flex-wrap gap-2">
          {(['solicitada', 'aprobada', 'rechazada', 'todas'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`rounded-2xl border px-4 py-2 text-xs font-black uppercase tracking-wider transition active:scale-95 ${
                filter === item ? 'border-slate-950 bg-slate-950 text-white shadow-lg' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              }`}
            >
              {item}
            </button>
          ))}
        </section>

        {loading ? (
          <div className="flex h-72 items-center justify-center rounded-[28px] bg-white/80">
            <Loader2 className="animate-spin text-rose-500" size={34} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/70 p-12 text-center">
            <Clock3 className="mx-auto mb-3 text-slate-300" size={42} />
            <p className="font-black text-slate-700">No hay solicitudes en este filtro.</p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {filtered.map((row, index) => (
              <motion.article
                key={row.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-xl shadow-slate-200/60"
              >
                <div className="grid gap-4 p-5 sm:grid-cols-[180px_1fr]">
                  <button type="button" onClick={() => setViewer(row)} className="group relative block overflow-hidden rounded-3xl bg-slate-100 text-left">
                    {evidenceUrls(row)[0] ? (
                      <img src={evidenceUrls(row)[0]} alt="Evidencia medica" className="h-52 w-full object-cover transition duration-500 group-hover:scale-105 sm:h-full" />
                    ) : (
                      <div className="flex h-52 items-center justify-center"><ImageIcon className="text-slate-300" size={42} /></div>
                    )}
                    <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-[10px] font-black text-slate-700 shadow">
                      VER {evidenceUrls(row).length > 1 ? `(${evidenceUrls(row).length})` : ''} <ExternalLink size={11} />
                    </span>
                  </button>
                  <div className="min-w-0">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-black uppercase text-slate-950">{row.trabajador_nombre}</h2>
                        <p className="text-xs font-bold text-slate-400">{row.dni} · {row.area || 'SIN AREA'}</p>
                      </div>
                      <StatusBadge estado={row.estado} />
                    </div>
                    <div className="mb-4 grid grid-cols-2 gap-2">
                      <InfoBox label="Desde" value={row.fecha_inicio} />
                      <InfoBox label="Hasta" value={row.fecha_fin} />
                    </div>
                    <div className="mb-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-600">
                      {row.comentario || 'Sin comentario'}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {row.estado === 'solicitada' && (
                        <>
                        <button disabled={savingId === row.id} onClick={() => rechazar(row)} className="flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-black text-rose-700 transition active:scale-95 disabled:opacity-50">
                          <XCircle size={15} /> RECHAZAR
                        </button>
                        <button disabled={savingId === row.id} onClick={() => aprobar(row)} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-emerald-200 transition active:scale-95 disabled:opacity-50">
                          {savingId === row.id ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />} APROBAR
                        </button>
                        </>
                      )}
                      <button disabled={savingId === row.id} onClick={() => descargarEvidencia(row)} className="flex items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-black text-sky-700 transition active:scale-95 disabled:opacity-50">
                        <Download size={15} /> DESCARGAR
                      </button>
                      <button disabled={savingId === row.id} onClick={() => eliminar(row)} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-xs font-black text-white transition active:scale-95 disabled:opacity-50">
                        {savingId === row.id ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />} ELIMINAR
                      </button>
                    </div>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </div>
      {viewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/20 bg-white shadow-2xl"
          >
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-rose-500">Evidencia medica</p>
                <h3 className="text-lg font-black text-slate-950">{viewer.trabajador_nombre}</h3>
                <p className="text-xs font-bold text-slate-500">{viewer.fecha_inicio} al {viewer.fecha_fin}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => descargarEvidencia(viewer)} className="flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black text-white transition active:scale-95">
                  <Download size={15} /> DESCARGAR
                </button>
                <a href={evidenceUrls(viewer)[0] ?? viewer.evidencia_url} target="_blank" className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black text-slate-700 transition active:scale-95">
                  <ExternalLink size={15} /> ABRIR
                </a>
                <button onClick={() => setViewer(null)} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition active:scale-95">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="max-h-[78vh] overflow-auto bg-slate-100 p-3">
              <div className="grid gap-3 lg:grid-cols-2">
                {evidenceUrls(viewer).map((url, idx) => (
                  <img key={url} src={url} alt={`Evidencia medica ${idx + 1}`} className="mx-auto max-h-[74vh] w-auto max-w-full rounded-2xl object-contain shadow-lg" />
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </main>
  )
}

function StatusPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className={`rounded-2xl px-4 py-3 ${tone}`}><p className="text-xl font-black">{value}</p><p className="text-[10px] font-black uppercase tracking-wider">{label}</p></div>
}

function StatusBadge({ estado }: { estado: string }) {
  const cls = estado === 'aprobada' ? 'bg-emerald-100 text-emerald-700' : estado === 'rechazada' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
  return <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${cls}`}>{estado}</span>
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="font-black text-slate-900">{value}</p></div>
}
