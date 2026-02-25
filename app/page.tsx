'use client'

import * as XLSX from 'xlsx-js-style';
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/utils/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { format, isToday, subDays, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { 
  Clock, CalendarDays, ChevronLeft, ChevronRight, 
  CheckCircle2, AlertCircle, LogOut, Activity, UserCircle2,
  Sun, Moon, Unlock, MessageSquareText, X, UserPlus, Loader2, Search, Filter, SlidersHorizontal
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
  
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [modoEdicion, setModoEdicion] = useState(false)

  const [notaSeleccionada, setNotaSeleccionada] = useState<{nombre: string, nota: string, hora: string} | null>(null)
  const [mostrarModalManual, setMostrarModalManual] = useState(false)

  // --- ESTADOS PARA FILTROS ---
  const [busqueda, setBusqueda] = useState('')
  const [filtroArea, setFiltroArea] = useState('TODAS')
  const [filtroEstado, setFiltroEstado] = useState('TODOS')

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

  useEffect(() => {
    let teclado = ''
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return

      teclado += e.key.toUpperCase()
      if (teclado.length > 6) teclado = teclado.slice(-6)

      if (teclado === 'EDITAR') {
        setModoEdicion(prev => {
          const nuevoEstado = !prev
          if (nuevoEstado) toast.success('MODO ADMIN ACTIVADO 🔓', { style: { background: '#3b82f6', color: 'white' } })
          else toast.error('Modo Admin Bloqueado 🔒', { style: { background: '#1e293b', color: 'white' } })
          return nuevoEstado
        })
        teclado = '' 
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

  // --- LÓGICA DE FILTRADO ---
  // 1. Obtener lista única de áreas presentes en los datos de hoy
  const areasDisponibles = useMemo(() => {
    const areasSet = new Set(asistencias.map(a => a.area).filter(Boolean));
    return ['TODAS', ...Array.from(areasSet)].sort();
  }, [asistencias]);

  // 2. Aplicar filtros
  const asistenciasFiltradas = useMemo(() => {
    return asistencias.filter(item => {
      const coincideBusqueda = 
        busqueda === '' || 
        item.nombres_completos.toLowerCase().includes(busqueda.toLowerCase()) ||
        item.dni.includes(busqueda);
      
      const coincideArea = filtroArea === 'TODAS' || item.area === filtroArea;
      const coincideEstado = filtroEstado === 'TODOS' || item.estado_ingreso === filtroEstado;

      return coincideBusqueda && coincideArea && coincideEstado;
    });
  }, [asistencias, busqueda, filtroArea, filtroEstado]);


  const descargarReporteExcel = async () => {
    try {
      const fechaString = format(fechaActual, 'yyyy-MM-dd')
      toast.info(`Generando reporte Excel del ${fechaString}...`);
      
      // Usamos los datos filtrados si hay filtros activos, si no, descargamos todo el día.
      // IMPORTANTE: Si quieres que SIEMPRE descargue todo el día ignorando filtros visuales,
      // cambia 'asistenciasFiltradas' por 'asistencias' en la siguiente línea.
      const dataParaExcel = asistenciasFiltradas;

      if (dataParaExcel.length === 0) {
        toast.error("No hay datos visibles para exportar");
        return;
      }

      const headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
        fill: { fgColor: { rgb: "1E293B" } }, 
        alignment: { horizontal: "center", vertical: "center" },
        border: { bottom: { style: "medium", color: { rgb: "000000" } } }
      };

      const stylePuntual = { font: { color: { rgb: "059669" }, bold: true }, alignment: { horizontal: "center" } };
      const styleTardanza = { font: { color: { rgb: "DC2626" }, bold: true }, alignment: { horizontal: "center" } };
      const styleCenter = { alignment: { horizontal: "center" } };

      const ws_data: any[][] = [
        ["FECHA", "DNI", "APELLIDOS Y NOMBRES", "ÁREA", "INGRESO", "ESTADO", "SALIDA", "MOTIVO / NOTA"]
      ];

      const ordenarApellidosNombres = (nombreCompleto: string) => {
        if (!nombreCompleto) return '-';
        const partes = nombreCompleto.trim().split(' ');
        if (partes.length >= 3) {
          const apellidos = partes.slice(-2).join(' ');
          const nombres = partes.slice(0, -2).join(' ');
          return `${apellidos}, ${nombres}`;
        } else if (partes.length === 2) {
          return `${partes[1]}, ${partes[0]}`;
        }
        return nombreCompleto;
      };

      dataParaExcel.forEach((registro) => {
        ws_data.push([
          registro.fecha,
          registro.dni,
          ordenarApellidosNombres(registro.nombres_completos),
          registro.area,
          new Date(registro.hora_ingreso).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute:'2-digit' }),
          registro.estado_ingreso,
          registro.hora_salida ? new Date(registro.hora_salida).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute:'2-digit' }) : 'Sin marcar',
          registro.notas || '-'
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(ws_data);

      for (let R = 0; R < ws_data.length; R++) {
        for (let C = 0; C < 8; C++) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddress]) continue;
          if (R === 0) ws[cellAddress].s = headerStyle;
          else {
            if (C === 5) ws[cellAddress].s = ws[cellAddress].v === 'PUNTUAL' ? stylePuntual : styleTardanza;
            else if ([0, 1, 3, 4, 6].includes(C)) ws[cellAddress].s = styleCenter;
          }
        }
      }

      ws['!cols'] = [
        { wpx: 80 }, { wpx: 80 }, { wpx: 240 }, { wpx: 130 }, 
        { wpx: 80 }, { wpx: 90 }, { wpx: 80 }, { wpx: 280 }
      ];

      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, ws, "Asistencias");

      XLSX.writeFile(libro, `Reporte_RUAG_${fechaString}_filtrado.xlsx`);
      toast.success(`¡Reporte descargado!`);

    } catch (error) {
      console.error("Error exportando a Excel:", error);
      toast.error("Hubo un error al generar el Excel.");
    }
  };

  const actualizarHora = async (id: string, campo: 'hora_ingreso' | 'hora_salida', nuevaHora: string, fechaBase: string) => {
    if (!nuevaHora) return
    try {
      const [horas, minutos] = nuevaHora.split(':')
      const fechaObj = new Date(fechaBase)
      fechaObj.setHours(parseInt(horas), parseInt(minutos), 0)
      
      const timestampISO = fechaObj.toISOString()
      let datosAActualizar: any = { [campo]: timestampISO }

      if (campo === 'hora_ingreso') {
        const h = parseInt(horas)
        const m = parseInt(minutos)
        const isPuntual = h < 9 || (h === 9 && m <= 5)
        datosAActualizar.estado_ingreso = isPuntual ? 'PUNTUAL' : 'TARDANZA'
      }

      const { error } = await supabase.from('registro_asistencias').update(datosAActualizar).eq('id', id)
      if (error) throw error

      toast.success('Registro actualizado correctamente')
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
    <div className={`min-h-screen ${modoEdicion ? 'bg-blue-50 dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-950'} text-slate-900 dark:text-slate-100 font-sans transition-colors duration-500 overflow-hidden flex flex-col relative`}>
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
            
            {modoEdicion && (
               <button 
                onClick={() => setMostrarModalManual(true)}
                className="flex items-center justify-center gap-2 p-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all border border-blue-500/50 active:scale-95 shadow-lg shadow-blue-600/20"
               >
                 <UserPlus size={20} />
                 <span className="hidden sm:inline">Registro Manual</span>
               </button>
            )}

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

      <main className="flex-1 w-full px-6 py-6 lg:px-8 lg:py-8 flex flex-col gap-6 lg:gap-8 overflow-y-auto z-10">
        
        {/* --- ESTADÍSTICAS SUPERIORES --- */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 shrink-0">
          <StatCard title="INGRESOS HOY" value={asistencias.length} icon={<UserCircle2 size={28}/>} color="from-blue-500 to-blue-700 dark:from-blue-600 dark:to-blue-900" border="border-blue-200 dark:border-blue-500/30" textColor="text-blue-600 dark:text-blue-400" />
          <StatCard title="PUNTUALES" value={puntuales} icon={<CheckCircle2 size={28}/>} color="from-emerald-400 to-emerald-600 dark:from-emerald-500 dark:to-emerald-900" border="border-emerald-200 dark:border-emerald-500/30" textColor="text-emerald-600 dark:text-emerald-400" />
          <StatCard title="TARDANZAS" value={tardanzas} icon={<AlertCircle size={28}/>} color="from-red-400 to-red-600 dark:from-red-500 dark:to-red-900" border="border-red-200 dark:border-red-500/30" textColor="text-red-600 dark:text-red-400" />
          <StatCard title="SALIDAS" value={salidas} icon={<LogOut size={28}/>} color="from-slate-500 to-slate-700 dark:from-slate-600 dark:to-slate-900" border="border-slate-300 dark:border-slate-500/30" textColor="text-slate-600 dark:text-slate-400" />
        </div>

        {/* --- BARRA DE FILTROS INTELIGENTE --- */}
        {asistencias.length > 0 && (
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row gap-4 items-center">
            <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 mr-2">
              <SlidersHorizontal size={20} />
              <span className="font-bold text-sm uppercase tracking-widest hidden lg:inline">Filtros</span>
            </div>
            
            {/* Buscador Nombre/DNI */}
            <div className="relative flex-1 w-full">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar por Nombre o DNI..." 
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full bg-slate-100 dark:bg-slate-950/50 pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white"
              />
            </div>

             {/* Filtro Área */}
            <div className="relative w-full lg:w-auto">
              <Filter size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select 
                value={filtroArea} 
                onChange={(e) => setFiltroArea(e.target.value)}
                className="w-full lg:w-48 appearance-none bg-slate-100 dark:bg-slate-950/50 pl-12 pr-8 py-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white cursor-pointer font-medium"
              >
                {areasDisponibles.map(area => (
                  <option key={area} value={area}>{area === 'TODAS' ? 'Todas las Áreas' : area}</option>
                ))}
              </select>
              <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" />
            </div>

            {/* Filtro Estado */}
            <div className="relative w-full lg:w-auto">
              <div className={`absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ${filtroEstado === 'TODOS' ? 'bg-slate-400' : filtroEstado === 'PUNTUAL' ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <select 
                value={filtroEstado} 
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="w-full lg:w-48 appearance-none bg-slate-100 dark:bg-slate-950/50 pl-10 pr-8 py-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white cursor-pointer font-medium"
              >
                <option value="TODOS">Todos los Estados</option>
                <option value="PUNTUAL">PUNTUAL</option>
                <option value="TARDANZA">TARDANZA</option>
              </select>
              <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" />
            </div>
          </div>
        )}


        {/* --- LISTADO DE TARJETAS --- */}
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
        ) : asistenciasFiltradas.length === 0 ? (
           // Mensaje cuando el filtro no encuentra nada
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-3xl">
             <Search size={60} className="text-slate-300 dark:text-slate-600 mb-4" />
             <h3 className="text-xl font-bold text-slate-500 dark:text-slate-400">No se encontraron resultados</h3>
             <p className="text-slate-400 dark:text-slate-500 mt-2">Intenta ajustar los filtros de búsqueda.</p>
           </motion.div>
        ) : (
          <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 auto-rows-max pb-20">
            <AnimatePresence mode="popLayout">
              {/* USAMOS LA LISTA FILTRADA AQUÍ */}
              {asistenciasFiltradas.map((asistencia, idx) => (
                <FotocheckCard 
                  key={asistencia.id} 
                  data={asistencia} 
                  index={idx} 
                  modoEdicion={modoEdicion} 
                  onActualizar={actualizarHora}
                  onAbrirNota={(notaData: {nombre: string, nota: string, hora: string}) => setNotaSeleccionada(notaData)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      {/* MODALES SUPERPUESTOS */}
      <AnimatePresence>
        {mostrarModalManual && (
          <ModalRegistroManual 
            onClose={() => setMostrarModalManual(false)} 
            fechaBase={format(fechaActual, 'yyyy-MM-dd')}
            onSuccess={(nuevoRegistro) => {
              if (isToday(fechaActual) || nuevoRegistro.fecha === format(fechaActual, 'yyyy-MM-dd')) {
                setAsistencias(prev => [nuevoRegistro, ...prev])
              }
              setMostrarModalManual(false)
            }}
          />
        )}

        {notaSeleccionada && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} 
              animate={{ scale: 1, y: 0 }} 
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[24px] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700"
            >
              <div className="bg-amber-500 h-2 w-full" />
              <div className="p-6 relative">
                <button 
                  onClick={() => setNotaSeleccionada(null)}
                  className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
                
                <div className="flex items-center gap-3 mb-4 text-amber-500">
                  <MessageSquareText size={28} />
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">Motivo de Salida</h3>
                </div>
                
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  {notaSeleccionada.nombre} <br/>
                  <span className="font-normal opacity-70">Salió a las {notaSeleccionada.hora}</span>
                </p>
                
                <div className="bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 min-h-[100px] whitespace-pre-wrap">
                  {notaSeleccionada.nota}
                </div>
                
                <button 
                  onClick={() => setNotaSeleccionada(null)}
                  className="w-full mt-6 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-white font-bold py-3 rounded-xl transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ESTILOS GLOBALES PARA EL DASHBOARD */}
      <style dangerouslySetInnerHTML={{__html: `
        /* Animación para nombres largos */
        .marquee-container {
          overflow: hidden;
          white-space: nowrap;
          position: relative;
          width: 100%;
          mask-image: linear-gradient(to right, black 85%, transparent 100%);
        }
        .marquee-text {
          display: inline-block;
          animation: marquee 8s linear infinite;
        }
        .marquee-text:hover {
          animation-play-state: paused;
        }
        @keyframes marquee {
          0% { transform: translateX(0); }
          15% { transform: translateX(0); }
          100% { transform: translateX(calc(-100% + 150px)); }
        }
      `}} />

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

// --- MODAL PARA REGISTRO MANUAL ---
function ModalRegistroManual({ onClose, fechaBase, onSuccess }: { onClose: () => void, fechaBase: string, onSuccess: (data: any) => void }) {
  const [nombres, setNombres] = useState('')
  const [dni, setDni] = useState('')
  const [area, setArea] = useState('')
  const [horaIngreso, setHoraIngreso] = useState('08:00')
  const [guardando, setGuardando] = useState(false)

  const AREAS_LIST = ["Operaciones/Proyectos", "Presupuesto", "Contabilidad", "Ssoma", "Rrhh", "Logística", "Finanzas", "Área comercial", "Software"]

  const handleGuardar = async () => {
    if (!nombres || dni.length !== 8 || !area || !horaIngreso) {
      toast.error("Llena todos los campos correctamente.")
      return
    }

    setGuardando(true)
    try {
      const [horas, minutos] = horaIngreso.split(':')
      const fechaObj = new Date(fechaBase)
      fechaObj.setHours(parseInt(horas), parseInt(minutos), 0)
      
      const isPuntual = parseInt(horas) < 9 || (parseInt(horas) === 9 && parseInt(minutos) <= 5)
      
      const nuevoRegistro = {
        dni,
        nombres_completos: nombres.toUpperCase(),
        area,
        fecha: fechaBase,
        hora_ingreso: fechaObj.toISOString(),
        estado_ingreso: isPuntual ? 'PUNTUAL' : 'TARDANZA',
        foto_url: '' // Forzamos vacío para que se active el Avatar inteligente
      }

      const { data, error } = await supabase.from('registro_asistencias').insert(nuevoRegistro).select().single()
      if (error) throw error

      toast.success("Asistencia manual guardada con éxito")
      onSuccess(data)
    } catch (error: any) {
      toast.error(`Error: ${error.message}`)
      setGuardando(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[24px] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 relative">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2 w-full" />
        <div className="p-6 relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X size={20} /></button>
          
          <div className="flex items-center gap-3 mb-6 text-blue-600 dark:text-blue-500">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <UserPlus size={24} />
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">Registro Manual</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombres y Apellidos</label>
              <input type="text" value={nombres} onChange={(e) => setNombres(e.target.value)} className="w-full mt-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" placeholder="Ej: Juan Perez" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">DNI</label>
                <input type="number" value={dni} onChange={(e) => {if(e.target.value.length <=8) setDni(e.target.value)}} className="w-full mt-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" placeholder="12345678" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Hora Ingreso</label>
                <input type="time" value={horaIngreso} onChange={(e) => setHoraIngreso(e.target.value)} className="w-full mt-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Área</label>
              <select value={area} onChange={(e) => setArea(e.target.value)} className="w-full mt-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all cursor-pointer">
                <option value="" disabled>Seleccionar Área</option>
                {AREAS_LIST.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          
          <button onClick={handleGuardar} disabled={guardando} className="w-full mt-8 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/25 text-white font-bold py-4 rounded-xl transition-all flex justify-center items-center active:scale-95">
            {guardando ? <Loader2 className="animate-spin" size={24}/> : "Registrar Asistencia"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// --- NUEVO DISEÑO GLASSMORPHISM PARA LA TARJETA ---
function FotocheckCard({ data, index, modoEdicion, onActualizar, onAbrirNota }: { data: any, index: number, modoEdicion: boolean, onActualizar: Function, onAbrirNota: (nota: {nombre: string, nota: string, hora: string}) => void }) {
  const isPuntual = data.estado_ingreso === 'PUNTUAL'
  const justAdded = index === 0 && isToday(new Date(data.hora_ingreso))
  
  const nombreLargo = data.nombres_completos.length > 20;
  
  // Color dinámico según estado
  const accentColor = isPuntual ? 'bg-emerald-500' : 'bg-red-500';
  const glowColor = isPuntual ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
  const textColor = isPuntual ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';

  // Función inteligente para extraer las iniciales
  const getInitials = (name: string) => {
    if (!name) return '??';
    const words = name.trim().split(' ').filter(w => w.length > 0);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 30 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{ boxShadow: `0 10px 40px -10px ${glowColor}` }}
      className={`relative group rounded-[2rem] p-5 flex flex-col overflow-hidden transition-all duration-300
        ${justAdded ? 'border-2 border-blue-400 dark:border-blue-500' : 'border border-slate-200 dark:border-slate-800'}
        bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl hover:-translate-y-1 z-10`}
    >
      {/* Resplandor de fondo invisible */}
      <div className={`absolute -top-20 -right-20 w-40 h-40 rounded-full blur-[50px] opacity-50 pointer-events-none ${accentColor}`} />

      {/* Botón Flotante de Notas */}
      {data.notas && (
        <button 
          onClick={() => onAbrirNota({
            nombre: data.nombres_completos, 
            nota: data.notas,
            hora: data.hora_salida ? format(new Date(data.hora_salida), 'HH:mm a') : 'Desconocida'
          })}
          className="absolute top-4 right-4 z-20 bg-white dark:bg-slate-800 shadow-lg border border-amber-200 dark:border-amber-900/50 hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-500 p-2 rounded-full transition-all hover:scale-110"
          title="Ver motivo de salida"
        >
          <MessageSquareText size={18} />
        </button>
      )}

      {/* Cabecera: Foto + Info */}
      <div className="flex items-start gap-4 mb-6 relative z-10">
        
        {/* AVATAR INTELIGENTE (Foto o Iniciales con gradiente) */}
        <div className="relative shrink-0">
          <div className="w-[72px] h-[72px] rounded-2xl overflow-hidden shadow-inner bg-slate-100 dark:bg-slate-800">
            {data.foto_url ? (
              <img src={data.foto_url} alt="Foto" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white font-black text-2xl shadow-inner">
                {getInitials(data.nombres_completos)}
              </div>
            )}
          </div>
          {/* Indicador de estado sobre la foto */}
          <div className={`absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 shadow-md ${accentColor}`} />
        </div>

        {/* Nombres y DNI */}
        <div className="flex-1 min-w-0 pt-1">
          <div className={nombreLargo ? "marquee-container" : ""}>
            <h3 className={`font-black text-slate-900 dark:text-white text-[17px] leading-tight ${nombreLargo ? "marquee-text" : "truncate"}`}>
              {data.nombres_completos} {nombreLargo && <span className="opacity-0">___</span>}
            </h3>
          </div>
          <p className="text-xs font-mono text-slate-500 mt-1 mb-2 tracking-widest">{data.dni}</p>
          <span className="inline-block px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold rounded-lg uppercase tracking-wider">
            {data.area}
          </span>
        </div>
      </div>

      {/* Bloque de Tiempos Integrado */}
      <div className="mt-auto bg-slate-50/50 dark:bg-slate-950/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-inner relative z-10">
        
        {/* INGRESO */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${accentColor} animate-pulse`} />
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Ingreso</span>
          </div>
          {modoEdicion ? (
            <input 
              type="time" 
              defaultValue={format(new Date(data.hora_ingreso), 'HH:mm')}
              className="bg-transparent border-b border-blue-500 text-lg font-black text-blue-600 dark:text-blue-400 outline-none w-20 text-right focus:border-emerald-500"
              onBlur={(e) => {
                if(e.target.value !== format(new Date(data.hora_ingreso), 'HH:mm')) {
                  onActualizar(data.id, 'hora_ingreso', e.target.value, data.hora_ingreso)
                }
              }}
            />
          ) : (
            <span className={`font-black text-xl tracking-tight ${textColor}`}>
              {format(new Date(data.hora_ingreso), 'HH:mm')} <span className="text-xs opacity-60 font-bold">{format(new Date(data.hora_ingreso), 'a')}</span>
            </span>
          )}
        </div>
        
        <div className="h-px w-full bg-slate-200 dark:bg-slate-800 my-2" />
        
        {/* SALIDA */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5 text-slate-500">
            <LogOut size={12} strokeWidth={3} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Salida</span>
          </div>
          
          {modoEdicion ? (
            <input 
              type="time" 
              defaultValue={data.hora_salida ? format(new Date(data.hora_salida), 'HH:mm') : ''}
              className="bg-transparent border-b border-blue-500 text-base font-bold text-slate-700 dark:text-slate-300 outline-none w-20 text-right focus:border-emerald-500"
              onBlur={(e) => {
                const currentValue = data.hora_salida ? format(new Date(data.hora_salida), 'HH:mm') : ''
                if(e.target.value && e.target.value !== currentValue) {
                  const baseDate = data.hora_salida || data.hora_ingreso || `${data.fecha}T00:00:00`
                  onActualizar(data.id, 'hora_salida', e.target.value, baseDate)
                }
              }}
            />
          ) : (
            <span className="font-bold text-base text-slate-700 dark:text-slate-200">
              {data.hora_salida ? (
                <>{format(new Date(data.hora_salida), 'HH:mm')} <span className="text-[10px] opacity-60">{format(new Date(data.hora_salida), 'a')}</span></>
              ) : (
                <span className="text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-md animate-pulse text-[10px] uppercase tracking-widest border border-indigo-500/20">En Turno</span>
              )}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}