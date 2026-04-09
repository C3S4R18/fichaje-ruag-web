'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Archive, ArrowLeft, CalendarDays, Loader2 } from 'lucide-react'

import { supabase } from '@/utils/supabase/client'

type PeriodSummary = {
  periodo: number
  total: number
}

export default function VacacionesHistoricoPage() {
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [periodos, setPeriodos] = useState<PeriodSummary[]>([])

  useEffect(() => {
    setMounted(true)
    const dark = localStorage.getItem('ruag_theme') === 'dark'
    document.documentElement.classList.toggle('dark', dark)
  }, [])

  useEffect(() => {
    if (!mounted) return

    const run = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('vacaciones_saldos')
        .select('periodo')
        .order('periodo', { ascending: false })

      if (!error) {
        const grouped = (data ?? []).reduce<Record<number, number>>((acc, row: any) => {
          const year = Number(row.periodo)
          if (!year) return acc
          acc[year] = (acc[year] ?? 0) + 1
          return acc
        }, {})

        setPeriodos(
          Object.entries(grouped)
            .map(([periodo, total]) => ({ periodo: Number(periodo), total }))
            .sort((a, b) => b.periodo - a.periodo)
        )
      }
      setLoading(false)
    }

    void run()
  }, [mounted])

  const currentYear = new Date().getFullYear()
  const historicos = useMemo(
    () => periodos.filter((item) => item.periodo < currentYear),
    [periodos, currentYear]
  )

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="animate-spin text-blue-600" size={28} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-4">
            <Link
              href="/vacaciones"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition-all hover:-translate-y-0.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-500">RUAG</p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                Historico de vacaciones
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Los periodos cerrados quedan archivados aqui. El ano actual se trabaja en la vista principal.
              </p>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <Loader2 className="animate-spin text-blue-600" size={28} />
          </div>
        ) : historicos.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm font-medium text-slate-400 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            Aun no hay periodos archivados.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {historicos.map((item) => (
              <Link
                key={item.periodo}
                href={`/vacaciones?year=${item.periodo}`}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Archivo
                    </p>
                    <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                      {item.periodo}
                    </h2>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                    <Archive size={18} />
                  </div>
                </div>

                <div className="mt-6 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
                    <CalendarDays size={14} />
                    <span className="text-sm font-black">{item.total} trabajadores</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
