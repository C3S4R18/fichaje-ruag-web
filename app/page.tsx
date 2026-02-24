'use client'

import * as XLSX from 'xlsx';
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/utils/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { format, isToday, subDays, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { 
  Clock, CalendarDays, ChevronLeft, ChevronRight, 
  CheckCircle2, AlertCircle, LogOut, Activity, UserCircle2,
  Sun, Moon, Unlock
} from 'lucide-react'
import { Toaster, toast } from 'sonner'

// Componente para el reloj en vivo
function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="flex flex-col items-end">
      <span className="text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums drop-shadow-sm dark:drop-shadow-md transition-colors">
        {format(time, 'HH:mm:ss')}
      </span>
      <span className="text-emerald-600 dark:text-emerald-400 font-bold tracking-widest uppercase text-[10px] sm:text-sm mt-1 transition-colors">
        Hora Oficial del Sistema
      </span>
    </div>
  )
}

export default function DualDashboardAsistencias() {
  const [asistencias, setAsistencias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [fechaActual, setFechaActual] = useState(new Date())
  
  // Estado para el Modo Oscuro y Modo Edición Secreto
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [modoEdicion, setModoEdicion] = useState(false)

  // Cargar preferencia de tema al iniciar
  useEffect(() => {
    setMounted(true)
    const savedTheme = localStorage.getItem('ruag_theme')
    if (savedTheme === 'light') {
      setIsDarkMode(false)
      document.documentElement.classList.remove('dark')
    } else {
      setIsDarkMode(true)
      document.documentElement.classList.add('dark')
    }
  }, [])

  // --- EL TRUCO SECRETO: ESCUCHAR LA PALABRA "EDITAR" ---
  useEffect(() => {
    let teclado = ''
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si el usuario está escribiendo dentro de un input
      if (e.target instanceof HTMLInputElement) return

      teclado += e.key.toUpperCase()
      if (teclado.length > 6) teclado = teclado.slice(-6) // Mantener solo los últimos 6 caracteres

      if (teclado === 'EDITAR') {
        setModoEdicion(prev => {
          const nuevoEstado = !prev
          if (nuevoEstado) {
            toast.success('MODO ADMIN ACTIVADO 🔓', { style: { background: '#3b82f6', color: 'white' } })
          } else {
            toast.error('Modo Admin Bloqueado 🔒', { style: { background: '#1e293b', color: 'white' } })
          }
          return nuevoEstado
        })
        teclado = '' // Reiniciar tras activarlo
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode)
    if (isDarkMode) {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('ruag_theme', 'light')
    } else {
      document.documentElement.classList.add('dark')
      localStorage.setItem('ruag_theme', 'dark')
    }
  }

  const fetchAsistencias = async (fecha: Date) => {
    setLoading(true)
    const fechaString = format(fecha, 'yyyy-MM-dd')
    
    const { data, error } = await supabase
      .from('registro_asistencias')
      .select('*')
      .eq('fecha', fechaString)
      .order('hora_ingreso', { ascending: false })

    if (!error && data) setAsistencias(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchAsistencias(fechaActual)

    if (isToday(fechaActual)) {
      const canal = supabase.channel('tv-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'registro_asistencias' }, (payload) => {
          setAsistencias(prev => [payload.new, ...prev])
          const audio = new Audio('/notification.mp3')
          audio.play().catch(() => {})
          toast.success(`INGRESO: ${payload.new.nombres_completos}`, {
            style: { background: '#10B981', color: 'white', border: 'none' }
          })
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'registro_asistencias' }, (payload) => {
          setAsistencias(prev => prev.map(a => a.id === payload.new.id ? payload.new : a))
        })
        .subscribe()

      return () => { supabase.removeChannel(canal) }
    }
  }, [fechaActual])

  const descargarReporteExcel = async () => {
    try {
      toast.info("Generando reporte Excel...");
      
      const { data, error } = await supabase
        .from('registro_asistencias')
        .select('*')
        .order('fecha', { ascending: false })
        .order('hora_ingreso', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error("No hay datos para exportar");
        return;
      }

      const datosFormateados = data.map((registro) => ({
        'Fecha': registro.fecha,
        'DNI': registro.dni,
        'Nombre Completo': registro.nombres_completos,
        'Área': registro.area,
        'Hora de Ingreso': new Date(registro.hora_ingreso).toLocaleTimeString('es-PE', { timeZone: 'America/Lima' }),
        'Estado': registro.estado_ingreso,
        'Hora de Salida': registro.hora_salida 
          ? new Date(registro.hora_salida).toLocaleTimeString('es-PE', { timeZone: 'America/Lima' }) 
          : 'Sin marcar'
      }));

      const hoja = XLSX.utils.json_to_sheet(datosFormateados);
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, "Asistencias");

      XLSX.writeFile(libro, `Reporte_RUAG_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success("¡Reporte descargado con éxito!");

    } catch (error) {
      console.error("Error exportando a Excel:", error);
      toast.error("Hubo un error al generar el Excel.");
    }
  };

  // --- FUNCIÓN PARA GUARDAR LA NUEVA HORA EN SUPABASE ---
  const actualizarHora = async (id: string, campo: 'hora_ingreso' | 'hora_salida', nuevaHora: string, fechaBase: string) => {
    if (!nuevaHora) return

    try {
      const [horas, minutos] = nuevaHora.split(':')
      const fechaObj = new Date(fechaBase)
      fechaObj.setHours(parseInt(horas), parseInt(minutos), 0)
      
      const timestampISO = fechaObj.toISOString()
      let datosAActualizar: any = { [campo]: timestampISO }

      // Si editamos el ingreso, recalculamos PUNTUAL o TARDANZA automáticamente
      if (campo === 'hora_ingreso') {
        const h = parseInt(horas)
        const m = parseInt(minutos)
        const isPuntual = h < 9 || (h === 9 && m <= 5)
        datosAActualizar.estado_ingreso = isPuntual ? 'PUNTUAL' : 'TARDANZA'
      }

      const { error } = await supabase
        .from('registro_asistencias')
        .update(datosAActualizar)
        .eq('id', id)

      if (error) throw error

      toast.success('Registro actualizado correctamente')
      
      // Actualizar la interfaz inmediatamente sin recargar
      setAsistencias(prev => prev.map(a => a.id === id ? { ...a, ...datosAActualizar } : a))

    } catch (error) {
      console.error(error)
      toast.error('Error al actualizar la hora')
    }
  }

  const puntuales = asistencias.filter(a => a.estado_ingreso === 'PUNTUAL').length
  const tardanzas = asistencias.filter(a => a.estado_ingreso === 'TARDANZA').length
  const salidas = asistencias.filter(a => a.hora_salida !== null).length

  if (!mounted) return null

  return (
    <div className={`min-h-screen ${modoEdicion ? 'bg-blue-50 dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-950'} text-slate-900 dark:text-slate-100 font-sans transition-colors duration-500 overflow-hidden flex flex-col`}>
      <Toaster position="top-center" richColors />
      
      {/* HEADER DUAL */}
      <header className={`${modoEdicion ? 'bg-blue-600/10 dark:bg-blue-900/20 border-blue-500/30' : 'bg-white/90 dark:bg-slate-900/80 border-slate-200 dark:border-slate-800/50'} border-b backdrop-blur-xl sticky top-0 z-50 shadow-sm transition-colors duration-500`}>
        <div className="w-full px-6 py-4 lg:py-6 flex flex-col lg:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-5 w-full lg:w-auto justify-between lg:justify-start">
            <div className="flex items-center gap-5">
              <div className={`w-14 h-14 lg:w-16 lg:h-16 ${modoEdicion ? 'bg-blue-600' : 'bg-gradient-to-br from-blue-500 to-indigo-600'} rounded-2xl flex items-center justify-center shadow-lg text-white border border-black/10 transition-colors`}>
                {modoEdicion ? <Unlock size={32} className="animate-pulse" /> : <Activity size={32} />}
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-slate-900 dark:text-white leading-none">
                  {modoEdicion ? 'MODO EDICIÓN ACTIVO' : 'RUAG ASISTENCIAS'}
                </h1>
                <p className={`text-xs lg:text-sm font-bold uppercase tracking-[0.2em] mt-1.5 lg:mt-2 ${modoEdicion ? 'text-red-500' : 'text-blue-600 dark:text-blue-400'}`}>
                  {modoEdicion ? 'Modificando Base de Datos' : 'Monitoreo en Tiempo Real'}
                </p>
              </div>
            </div>
            
            <button onClick={toggleTheme} className="lg:hidden p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-amber-400">
              {isDarkMode ? <Sun size={24}/> : <Moon size={24}/>}
            </button>
          </div>

          <div className="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-end">
            
            <button 
              onClick={descargarReporteExcel}
              className="flex items-center justify-center gap-2 p-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all border border-emerald-500/50 active:scale-95 shadow-lg shadow-emerald-600/20"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="hidden sm:inline">Exportar Excel</span>
            </button>

            <button 
              onClick={toggleTheme} 
              className="hidden lg:flex items-center justify-center p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-amber-400 transition-all border border-slate-200 dark:border-slate-700 active:scale-95"
            >
              {isDarkMode ? <Sun size={24}/> : <Moon size={24}/>}
            </button>

            <div className="flex items-center gap-2 lg:gap-4 bg-white dark:bg-slate-950/50 p-1.5 lg:p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner w-full lg:w-auto justify-between transition-colors duration-500">
              <button onClick={() => setFechaActual(prev => subDays(prev, 1))} className="p-2 lg:p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 hover:text-slate-900 dark:hover:text-white">
                <ChevronLeft size={20} />
              </button>
              <div className="flex items-center justify-center gap-2 lg:gap-3 px-2 w-48 lg:w-56 relative cursor-pointer group">
                <CalendarDays size={18} className="text-blue-600 dark:text-blue-500 group-hover:scale-110 transition-transform" />
                <span className="font-bold text-lg lg:text-xl capitalize text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-white transition-colors">
                  {isToday(fechaActual) ? 'Hoy' : format(fechaActual, "d MMM yyyy", { locale: es })}
                </span>
                <input 
                  type="date" 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                  value={format(fechaActual, 'yyyy-MM-dd')} 
                  onChange={(e) => {
                    if (e.target.value) {
                      const [year, month, day] = e.target.value.split('-').map(Number)
                      setFechaActual(new Date(year, month - 1, day))
                    }
                  }} 
                />
              </div>
              <button onClick={() => setFechaActual(prev => addDays(prev, 1))} disabled={isToday(fechaActual)} className="p-2 lg:p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 disabled:opacity-20">
                <ChevronRight size={20} />
              </button>
            </div>
            
            <div className="hidden lg:block">
              <LiveClock />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full px-6 py-6 lg:px-8 lg:py-8 flex flex-col gap-6 lg:gap-8 overflow-y-auto">
        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 shrink-0">
          <StatCard title="INGRESOS HOY" value={asistencias.length} icon={<UserCircle2 size={28}/>} color="from-blue-500 to-blue-700 dark:from-blue-600 dark:to-blue-900" border="border-blue-200 dark:border-blue-500/30" textColor="text-blue-600 dark:text-blue-400" />
          <StatCard title="PUNTUALES" value={puntuales} icon={<CheckCircle2 size={28}/>} color="from-emerald-400 to-emerald-600 dark:from-emerald-500 dark:to-emerald-900" border="border-emerald-200 dark:border-emerald-500/30" textColor="text-emerald-600 dark:text-emerald-400" />
          <StatCard title="TARDANZAS" value={tardanzas} icon={<AlertCircle size={28}/>} color="from-red-400 to-red-600 dark:from-red-500 dark:to-red-900" border="border-red-200 dark:border-red-500/30" textColor="text-red-600 dark:text-red-400" />
          <StatCard title="SALIDAS" value={salidas} icon={<LogOut size={28}/>} color="from-slate-500 to-slate-700 dark:from-slate-600 dark:to-slate-900" border="border-slate-300 dark:border-slate-500/30" textColor="text-slate-600 dark:text-slate-400" />
        </div>

        {loading ? (
          <div className="flex justify-center py-32">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 dark:border-blue-500"></div>
          </div>
        ) : asistencias.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-3xl bg-white/50 dark:bg-slate-900/20 py-20 lg:py-0">
            <CalendarDays size={80} className="text-slate-300 dark:text-slate-700 mb-6" />
            <h3 className="text-2xl lg:text-3xl font-bold text-slate-400 dark:text-slate-500 text-center px-4">Esperando ingresos...</h3>
            <p className="text-slate-500 dark:text-slate-600 text-base lg:text-lg mt-2 text-center px-4">La pantalla se actualizará automáticamente.</p>
          </motion.div>
        ) : (
          <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 auto-rows-max">
            <AnimatePresence mode="popLayout">
              {asistencias.map((asistencia, idx) => (
                <FotocheckCard 
                  key={asistencia.id} 
                  data={asistencia} 
                  index={idx} 
                  modoEdicion={modoEdicion} 
                  onActualizar={actualizarHora} 
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </main>
    </div>
  )
}

function StatCard({ title, value, icon, color, border, textColor }: any) {
  return (
    <div className={`bg-white dark:bg-slate-900/80 p-5 lg:p-6 rounded-3xl border border-slate-200 dark:border-transparent dark:border-[${border}] shadow-sm dark:shadow-2xl flex items-center gap-4 lg:gap-6 backdrop-blur-md relative overflow-hidden transition-colors duration-500`}>
      <div className={`hidden lg:block absolute -right-10 -bottom-10 opacity-5 dark:opacity-10 blur-2xl rounded-full w-40 h-40 bg-gradient-to-br ${color}`}></div>
      <div className={`w-14 h-14 lg:w-20 lg:h-20 rounded-2xl bg-gradient-to-br ${color} text-white flex items-center justify-center shadow-inner shrink-0 relative z-10 border border-black/5 dark:border-white/10`}>
        {icon}
      </div>
      <div className="relative z-10">
        <p className={`text-[10px] lg:text-sm font-black ${textColor} uppercase tracking-[0.1em] lg:tracking-[0.2em]`}>{title}</p>
        <p className="text-4xl lg:text-6xl font-black text-slate-900 dark:text-white leading-none mt-1 lg:mt-2 drop-shadow-sm transition-colors">{value}</p>
      </div>
    </div>
  )
}

function FotocheckCard({ data, index, modoEdicion, onActualizar }: { data: any, index: number, modoEdicion: boolean, onActualizar: Function }) {
  const isPuntual = data.estado_ingreso === 'PUNTUAL'
  const justAdded = index === 0 && isToday(new Date(data.hora_ingreso))
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8, x: -50 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 50 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={`rounded-3xl border overflow-hidden shadow-md dark:shadow-2xl flex flex-col relative transition-all duration-500
        ${justAdded 
          ? 'bg-blue-50/50 dark:bg-slate-800 border-blue-300 dark:border-blue-400 shadow-blue-200 dark:shadow-blue-900/50' 
          : modoEdicion ? 'bg-white dark:bg-slate-800 border-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700/50 hover:shadow-lg'}`}
    >
      <div className={`h-2 lg:h-3 w-full shadow-sm dark:shadow-[0_0_15px_rgba(0,0,0,0.5)] z-10 ${isPuntual ? 'bg-emerald-500' : 'bg-red-500'}`} />
      
      <div className="p-5 lg:p-6 flex-1 flex flex-col z-10">
        <div className="flex gap-4 lg:gap-5 items-center mb-5 lg:mb-6">
          <div className="relative shrink-0">
            {data.foto_url ? (
              <img src={data.foto_url} alt="Foto" className="w-20 h-20 lg:w-24 lg:h-24 rounded-2xl object-cover bg-slate-100 dark:bg-slate-800 shadow-inner border border-slate-200 dark:border-slate-700" />
            ) : (
              <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-500">
                <UserCircle2 size={40} />
              </div>
            )}
            <div className={`absolute -bottom-2 -right-2 w-5 h-5 lg:w-6 lg:h-6 rounded-full border-4 border-white dark:border-slate-900 shadow-sm dark:shadow-lg ${isPuntual ? 'bg-emerald-500' : 'bg-red-500'}`} />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg lg:text-xl leading-tight truncate">
              {data.nombres_completos}
            </h3>
            <p className="text-sm lg:text-base text-slate-500 dark:text-slate-400 font-mono mt-0.5 lg:mt-1 tracking-wider">{data.dni}</p>
            <div className="mt-2 lg:mt-3 inline-flex border border-slate-200 dark:border-slate-700 px-2 py-0.5 lg:px-3 lg:py-1 bg-slate-50 dark:bg-slate-950/50 text-blue-600 dark:text-blue-400 text-[10px] lg:text-xs font-bold rounded-lg uppercase tracking-widest shadow-inner">
              {data.area}
            </div>
          </div>
        </div>

        <div className="mt-auto space-y-2 lg:space-y-3 bg-slate-50 dark:bg-slate-950 rounded-2xl p-3 lg:p-4 border border-slate-100 dark:border-slate-800/50 shadow-inner">
          
          {/* HORA DE INGRESO (Editable) */}
          <div className="flex justify-between items-center">
            <span className="text-slate-500 flex items-center gap-1.5 lg:gap-2 text-[10px] lg:text-xs font-bold uppercase tracking-widest"><Clock size={14}/> INGRESO</span>
            {modoEdicion ? (
              <input 
                type="time" 
                defaultValue={format(new Date(data.hora_ingreso), 'HH:mm')}
                className="bg-transparent border-b-2 border-blue-500 text-xl lg:text-2xl font-black text-blue-600 dark:text-blue-400 outline-none w-28 text-right focus:border-emerald-500"
                onBlur={(e) => {
                  if(e.target.value !== format(new Date(data.hora_ingreso), 'HH:mm')) {
                    onActualizar(data.id, 'hora_ingreso', e.target.value, data.hora_ingreso)
                  }
                }}
              />
            ) : (
              <span className={`font-black text-xl lg:text-2xl tracking-tighter ${isPuntual ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400 dark:drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]'}`}>
                {format(new Date(data.hora_ingreso), 'HH:mm')} <span className="text-xs lg:text-sm opacity-60 font-bold">{format(new Date(data.hora_ingreso), 'a')}</span>
              </span>
            )}
          </div>
          
          {/* HORA DE SALIDA (Editable) */}
          <div className="flex justify-between items-center pt-2 lg:pt-3 border-t border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 flex items-center gap-1.5 lg:gap-2 text-[10px] lg:text-xs font-bold uppercase tracking-widest"><LogOut size={14}/> SALIDA</span>
            
            {modoEdicion ? (
              <input 
                type="time" 
                defaultValue={data.hora_salida ? format(new Date(data.hora_salida), 'HH:mm') : ''}
                className="bg-transparent border-b-2 border-blue-500 text-base lg:text-lg font-bold text-slate-700 dark:text-slate-300 outline-none w-24 text-right focus:border-emerald-500"
                onBlur={(e) => {
                  const currentValue = data.hora_salida ? format(new Date(data.hora_salida), 'HH:mm') : ''
                  if(e.target.value && e.target.value !== currentValue) {
                    // Si no había hora de salida antes, usamos la fecha base de la fila para construir el nuevo timestamp
                    const baseDate = data.hora_salida || data.hora_ingreso || `${data.fecha}T00:00:00`
                    onActualizar(data.id, 'hora_salida', e.target.value, baseDate)
                  }
                }}
              />
            ) : (
              <span className="font-bold text-base lg:text-lg text-slate-700 dark:text-slate-300">
                {data.hora_salida ? (
                  <>{format(new Date(data.hora_salida), 'HH:mm')} <span className="text-[10px] lg:text-xs opacity-60">{format(new Date(data.hora_salida), 'a')}</span></>
                ) : (
                  <span className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 px-2 py-0.5 lg:py-1 rounded animate-pulse text-[10px] lg:text-xs uppercase tracking-widest shadow-sm dark:shadow-[0_0_10px_rgba(99,102,241,0.2)]">En Turno</span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}