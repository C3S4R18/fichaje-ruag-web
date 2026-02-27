'use client'

import * as XLSX from 'xlsx-js-style';
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/utils/supabase/client'
import { motion, AnimatePresence, Variants } from 'framer-motion'
import { format, isToday, subDays, addDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { 
  CalendarDays, ChevronLeft, ChevronRight, 
  CheckCircle2, AlertCircle, LogOut, Activity, UserCircle2,
  Unlock, MessageSquareText, X, UserPlus, Loader2, Search, Filter,
  FileSpreadsheet, SlidersHorizontal, Users, ShieldCheck, AlignLeft,
  MapPin, Map, Download // <-- Nuevos iconos
} from 'lucide-react'
import { Toaster, toast } from 'sonner'

// --- COMPONENTE SWITCH DE TEMA (UIVERSE) ---
const ThemeSwitch = ({ isDarkMode, onToggle }: { isDarkMode: boolean, onToggle: () => void }) => (
  <div className="relative transform scale-[0.6] sm:scale-75 origin-right">
    <style dangerouslySetInnerHTML={{__html: `
      .theme-switch {
        --toggle-size: 20px;
        --container-width: 5.625em;
        --container-height: 2.5em;
        --container-radius: 6.25em;
        --container-light-bg: #3D7EAE;
        --container-night-bg: #1D1F2C;
        --circle-container-diameter: 3.375em;
        --sun-moon-diameter: 2.125em;
        --sun-bg: #ECCA2F;
        --moon-bg: #C4C9D1;
        --spot-color: #959DB1;
        --circle-container-offset: calc((var(--circle-container-diameter) - var(--container-height)) / 2 * -1);
        --stars-color: #fff;
        --clouds-color: #F3FDFF;
        --back-clouds-color: #AACADF;
        --transition: .5s cubic-bezier(0, -0.02, 0.4, 1.25);
        --circle-transition: .3s cubic-bezier(0, -0.02, 0.35, 1.17);
      }
      .theme-switch, .theme-switch *, .theme-switch *::before, .theme-switch *::after {
        box-sizing: border-box; margin: 0; padding: 0; font-size: var(--toggle-size);
      }
      .theme-switch__container {
        width: var(--container-width); height: var(--container-height);
        background-color: var(--container-light-bg); border-radius: var(--container-radius);
        overflow: hidden; cursor: pointer;
        box-shadow: 0em -0.062em 0.062em rgba(0, 0, 0, 0.25), 0em 0.062em 0.125em rgba(255, 255, 255, 0.94);
        transition: var(--transition); position: relative; display: block;
      }
      .theme-switch__container::before {
        content: ""; position: absolute; z-index: 1; inset: 0;
        box-shadow: 0em 0.05em 0.187em rgba(0, 0, 0, 0.25) inset, 0em 0.05em 0.187em rgba(0, 0, 0, 0.25) inset;
        border-radius: var(--container-radius); pointer-events: none;
      }
      .theme-switch__checkbox { display: none; }
      .theme-switch__circle-container {
        width: var(--circle-container-diameter); height: var(--circle-container-diameter);
        background-color: rgba(255, 255, 255, 0.1); position: absolute;
        left: var(--circle-container-offset); top: var(--circle-container-offset);
        border-radius: var(--container-radius);
        box-shadow: inset 0 0 0 3.375em rgba(255, 255, 255, 0.1), inset 0 0 0 3.375em rgba(255, 255, 255, 0.1), 0 0 0 0.625em rgba(255, 255, 255, 0.1), 0 0 0 1.25em rgba(255, 255, 255, 0.1);
        display: flex; transition: var(--circle-transition); pointer-events: none;
      }
      .theme-switch__sun-moon-container {
        pointer-events: auto; position: relative; z-index: 2;
        width: var(--sun-moon-diameter); height: var(--sun-moon-diameter);
        margin: auto; border-radius: var(--container-radius); background-color: var(--sun-bg);
        box-shadow: 0.062em 0.062em 0.062em 0em rgba(254, 255, 239, 0.61) inset, 0em -0.062em 0.062em 0em #a1872a inset;
        filter: drop-shadow(0.062em 0.125em 0.125em rgba(0, 0, 0, 0.25)) drop-shadow(0em 0.062em 0.125em rgba(0, 0, 0, 0.25));
        overflow: hidden; transition: var(--transition);
      }
      .theme-switch__moon {
        transform: translateX(100%); width: 100%; height: 100%;
        background-color: var(--moon-bg); border-radius: inherit;
        box-shadow: 0.062em 0.062em 0.062em 0em rgba(254, 255, 239, 0.61) inset, 0em -0.062em 0.062em 0em #969696 inset;
        transition: var(--transition); position: relative;
      }
      .theme-switch__spot {
        position: absolute; top: 0.75em; left: 0.312em; width: 0.75em; height: 0.75em;
        border-radius: var(--container-radius); background-color: var(--spot-color);
        box-shadow: 0em 0.0312em 0.062em rgba(0, 0, 0, 0.25) inset;
      }
      .theme-switch__spot:nth-of-type(2) { width: 0.375em; height: 0.375em; top: 0.937em; left: 1.375em; }
      .theme-switch__spot:nth-last-of-type(3) { width: 0.25em; height: 0.25em; top: 0.312em; left: 0.812em; }
      .theme-switch__clouds {
        width: 1.25em; height: 1.25em; background-color: var(--clouds-color);
        border-radius: var(--container-radius); position: absolute; bottom: -0.625em; left: 0.312em;
        box-shadow: 0.937em 0.312em var(--clouds-color), -0.312em -0.312em var(--back-clouds-color), 1.437em 0.375em var(--clouds-color), 0.5em -0.125em var(--back-clouds-color), 2.187em 0 var(--clouds-color), 1.25em -0.062em var(--back-clouds-color), 2.937em 0.312em var(--clouds-color), 2em -0.312em var(--back-clouds-color), 3.625em -0.062em var(--clouds-color), 2.625em 0em var(--back-clouds-color), 4.5em -0.312em var(--clouds-color), 3.375em -0.437em var(--back-clouds-color), 4.625em -1.75em 0 0.437em var(--clouds-color), 4em -0.625em var(--back-clouds-color), 4.125em -2.125em 0 0.437em var(--back-clouds-color);
        transition: 0.5s cubic-bezier(0, -0.02, 0.4, 1.25);
      }
      .theme-switch__stars-container {
        position: absolute; color: var(--stars-color); top: -100%; left: 0.312em; width: 2.75em; height: auto;
        transition: var(--transition);
      }
      .theme-switch__checkbox:checked + .theme-switch__container { background-color: var(--container-night-bg); }
      .theme-switch__checkbox:checked + .theme-switch__container .theme-switch__circle-container { left: calc(100% - var(--circle-container-offset) - var(--circle-container-diameter)); }
      .theme-switch__checkbox:checked + .theme-switch__container .theme-switch__circle-container:hover { left: calc(100% - var(--circle-container-offset) - var(--circle-container-diameter) - 0.187em) }
      .theme-switch__circle-container:hover { left: calc(var(--circle-container-offset) + 0.187em); }
      .theme-switch__checkbox:checked + .theme-switch__container .theme-switch__moon { transform: translate(0); }
      .theme-switch__checkbox:checked + .theme-switch__container .theme-switch__clouds { bottom: -4.062em; }
      .theme-switch__checkbox:checked + .theme-switch__container .theme-switch__stars-container { top: 50%; transform: translateY(-50%); }
    `}} />
    <label className="theme-switch">
      <input type="checkbox" className="theme-switch__checkbox" checked={isDarkMode} onChange={onToggle} />
      <div className="theme-switch__container">
        <div className="theme-switch__clouds" />
        <div className="theme-switch__stars-container">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 55" fill="none">
            <path fillRule="evenodd" clipRule="evenodd" d="M135.831 3.00688C135.055 3.85027 134.111 4.29946 133 4.35447C134.111 4.40947 135.055 4.85867 135.831 5.71123C136.607 6.55462 136.996 7.56303 136.996 8.72727C136.996 7.95722 137.172 7.25134 137.525 6.59129C137.886 5.93124 138.372 5.39954 138.98 5.00535C139.598 4.60199 140.268 4.39114 141 4.35447C139.88 4.2903 138.936 3.85027 138.16 3.00688C137.384 2.16348 136.996 1.16425 136.996 0C136.996 1.16425 136.607 2.16348 135.831 3.00688ZM31 23.3545C32.1114 23.2995 33.0551 22.8503 33.8313 22.0069C34.6075 21.1635 34.9956 20.1642 34.9956 19C34.9956 20.1642 35.3837 21.1635 36.1599 22.0069C36.9361 22.8503 37.8798 23.2903 39 23.3545C38.2679 23.3911 37.5976 23.602 36.9802 24.0053C36.3716 24.3995 35.8864 24.9312 35.5248 25.5913C35.172 26.2513 34.9956 26.9572 34.9956 27.7273C34.9956 26.563 34.6075 25.5546 33.8313 24.7112C33.0551 23.8587 32.1114 23.4095 31 23.3545ZM0 36.3545C1.11136 36.2995 2.05513 35.8503 2.83131 35.0069C3.6075 34.1635 3.99559 33.1642 3.99559 32C3.99559 33.1642 4.38368 34.1635 5.15987 35.0069C5.93605 35.8503 6.87982 36.2903 8 36.3545C7.26792 36.3911 6.59757 36.602 5.98015 37.0053C5.37155 37.3995 4.88644 37.9312 4.52481 38.5913C4.172 39.2513 3.99559 39.9572 3.99559 40.7273C3.99559 39.563 3.6075 38.5546 2.83131 37.7112C2.05513 36.8587 1.11136 36.4095 0 36.3545ZM56.8313 24.0069C56.0551 24.8503 55.1114 25.2995 54 25.3545C55.1114 25.4095 56.0551 25.8587 56.8313 26.7112C57.6075 27.5546 57.9956 28.563 57.9956 29.7273C57.9956 28.9572 58.172 28.2513 58.5248 27.5913C58.8864 26.9312 59.3716 26.3995 59.9802 26.0053C60.5976 25.602 61.2679 25.3911 62 25.3545C60.8798 25.2903 59.9361 24.8503 59.1599 24.0069C58.3837 23.1635 57.9956 22.1642 57.9956 21C57.9956 22.1642 57.6075 23.1635 56.8313 24.0069ZM81 25.3545C82.1114 25.2995 83.0551 24.8503 83.8313 24.0069C84.6075 23.1635 84.9956 22.1642 84.9956 21C84.9956 22.1642 85.3837 23.1635 86.1599 24.0069C86.9361 24.8503 87.8798 25.2903 89 25.3545C88.2679 25.3911 87.5976 25.602 86.9802 26.0053C86.3716 26.3995 85.8864 26.9312 85.5248 27.5913C85.172 28.2513 84.9956 28.9572 84.9956 29.7273C84.9956 28.563 84.6075 27.5546 83.8313 26.7112C83.0551 25.8587 82.1114 25.4095 81 25.3545ZM136 36.3545C137.111 36.2995 138.055 35.8503 138.831 35.0069C139.607 34.1635 139.996 33.1642 139.996 32C139.996 33.1642 140.384 34.1635 141.16 35.0069C141.936 35.8503 142.88 36.2903 144 36.3545C143.268 36.3911 142.598 36.602 141.98 37.0053C141.372 37.3995 140.886 37.9312 140.525 38.5913C140.172 39.2513 139.996 39.9572 139.996 40.7273C139.996 39.563 139.607 38.5546 138.831 37.7112C138.055 36.8587 137.111 36.4095 136 36.3545ZM101.831 49.0069C101.055 49.8503 100.111 50.2995 99 50.3545C100.111 50.4095 101.055 50.8587 101.831 51.7112C102.607 52.5546 102.996 53.563 102.996 54.7273C102.996 53.9572 103.172 53.2513 103.525 52.5913C103.886 51.9312 104.372 51.3995 104.98 51.0053C105.598 50.602 106.268 50.3911 107 50.3545C105.88 50.2903 104.936 49.8503 104.16 49.0069C103.384 48.1635 102.996 47.1642 102.996 46C102.996 47.1642 102.607 48.1635 101.831 49.0069Z" fill="currentColor" />
          </svg>
        </div>
        <div className="theme-switch__circle-container">
          <div className="theme-switch__sun-moon-container">
            <div className="theme-switch__moon">
              <div className="theme-switch__spot" />
              <div className="theme-switch__spot" />
              <div className="theme-switch__spot" />
            </div>
          </div>
        </div>
      </div>
    </label>
  </div>
)

// --- COMPONENTE LOADER MODERNO (UIVERSE) ---
const CustomLoader = ({ text = "Sincronizando..." }: { text?: string }) => (
  <div className="flex flex-col items-center justify-center h-full">
    <style dangerouslySetInnerHTML={{__html: `
      .pl { width: 6em; height: 6em; }
      .pl__ring { animation: ringA 2s linear infinite; }
      .pl__ring--a { stroke: currentColor; }
      .pl__ring--b { animation-name: ringB; stroke: currentColor; }
      .pl__ring--c { animation-name: ringC; stroke: currentColor; }
      .pl__ring--d { animation-name: ringD; stroke: currentColor; }
      @keyframes ringA { from, 4% { stroke-dasharray: 0 660; stroke-width: 20; stroke-dashoffset: -330; } 12% { stroke-dasharray: 60 600; stroke-width: 30; stroke-dashoffset: -335; } 32% { stroke-dasharray: 60 600; stroke-width: 30; stroke-dashoffset: -595; } 40%, 54% { stroke-dasharray: 0 660; stroke-width: 20; stroke-dashoffset: -660; } 62% { stroke-dasharray: 60 600; stroke-width: 30; stroke-dashoffset: -665; } 82% { stroke-dasharray: 60 600; stroke-width: 30; stroke-dashoffset: -925; } 90%, to { stroke-dasharray: 0 660; stroke-width: 20; stroke-dashoffset: -990; } }
      @keyframes ringB { from, 12% { stroke-dasharray: 0 220; stroke-width: 20; stroke-dashoffset: -110; } 20% { stroke-dasharray: 20 200; stroke-width: 30; stroke-dashoffset: -115; } 40% { stroke-dasharray: 20 200; stroke-width: 30; stroke-dashoffset: -195; } 48%, 62% { stroke-dasharray: 0 220; stroke-width: 20; stroke-dashoffset: -220; } 70% { stroke-dasharray: 20 200; stroke-width: 30; stroke-dashoffset: -225; } 90% { stroke-dasharray: 20 200; stroke-width: 30; stroke-dashoffset: -305; } 98%, to { stroke-dasharray: 0 220; stroke-width: 20; stroke-dashoffset: -330; } }
      @keyframes ringC { from { stroke-dasharray: 0 440; stroke-width: 20; stroke-dashoffset: 0; } 8% { stroke-dasharray: 40 400; stroke-width: 30; stroke-dashoffset: -5; } 28% { stroke-dasharray: 40 400; stroke-width: 30; stroke-dashoffset: -175; } 36%, 58% { stroke-dasharray: 0 440; stroke-width: 20; stroke-dashoffset: -220; } 66% { stroke-dasharray: 40 400; stroke-width: 30; stroke-dashoffset: -225; } 86% { stroke-dasharray: 40 400; stroke-width: 30; stroke-dashoffset: -395; } 94%, to { stroke-dasharray: 0 440; stroke-width: 20; stroke-dashoffset: -440; } }
      @keyframes ringD { from, 8% { stroke-dasharray: 0 440; stroke-width: 20; stroke-dashoffset: 0; } 16% { stroke-dasharray: 40 400; stroke-width: 30; stroke-dashoffset: -5; } 36% { stroke-dasharray: 40 400; stroke-width: 30; stroke-dashoffset: -175; } 44%, 50% { stroke-dasharray: 0 440; stroke-width: 20; stroke-dashoffset: -220; } 58% { stroke-dasharray: 40 400; stroke-width: 30; stroke-dashoffset: -225; } 78% { stroke-dasharray: 40 400; stroke-width: 30; stroke-dashoffset: -395; } 86%, to { stroke-dasharray: 0 440; stroke-width: 20; stroke-dashoffset: -440; } }
    `}} />
    <div className="loader-wrapper drop-shadow-md">
      <svg viewBox="0 0 240 240" height="120" width="120" className="pl">
        <circle strokeLinecap="round" strokeDashoffset="-330" strokeDasharray="0 660" strokeWidth="20" stroke="currentColor" fill="none" r="105" cy="120" cx="120" className="pl__ring pl__ring--a text-blue-600 dark:text-blue-500" />
        <circle strokeLinecap="round" strokeDashoffset="-110" strokeDasharray="0 220" strokeWidth="20" stroke="currentColor" fill="none" r="35" cy="120" cx="120" className="pl__ring pl__ring--b text-emerald-500 dark:text-emerald-400" />
        <circle strokeLinecap="round" strokeDasharray="0 440" strokeWidth="20" stroke="currentColor" fill="none" r="70" cy="120" cx="85" className="pl__ring pl__ring--c text-amber-500 dark:text-amber-400" />
        <circle strokeLinecap="round" strokeDasharray="0 440" strokeWidth="20" stroke="currentColor" fill="none" r="70" cy="120" cx="155" className="pl__ring pl__ring--d text-indigo-500 dark:text-indigo-400" />
      </svg>
    </div>
    <span className="mt-6 font-bold text-slate-500 dark:text-slate-400 text-sm animate-pulse tracking-widest uppercase">
      {text}
    </span>
  </div>
);

// Componente para el reloj en vivo
function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="flex flex-col items-end">
      <span className="text-3xl lg:text-4xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums drop-shadow-sm transition-colors">
        {format(time, 'HH:mm:ss')}
      </span>
      <span className="text-emerald-600 dark:text-emerald-400 font-bold tracking-widest uppercase text-[10px] mt-0.5 transition-colors">
        Hora Oficial
      </span>
    </div>
  )
}

export default function DualDashboardAsistencias() {
  const [asistencias, setAsistencias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true) 
  const [fechaActual, setFechaActual] = useState(new Date())
  
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [modoEdicion, setModoEdicion] = useState(false)

  // Modales
  const [notaSeleccionada, setNotaSeleccionada] = useState<{nombre: string, nota: string, hora: string, esObra: boolean, coordenadas?: string} | null>(null)
  const [mostrarModalManual, setMostrarModalManual] = useState(false)
  const [mostrarModalExportar, setMostrarModalExportar] = useState(false)

  // Filtros
  const [busqueda, setBusqueda] = useState('')
  const [filtroArea, setFiltroArea] = useState('TODAS')
  const [filtroEstado, setFiltroEstado] = useState('TODOS')

  // Exportar Fechas
  const [exportarDesde, setExportarDesde] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [exportarHasta, setExportarHasta] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [exportando, setExportando] = useState(false)
  const [tipoExportacion, setTipoExportacion] = useState<'dia'|'rango'>('dia')

  // Cargar preferencia de tema 
  useEffect(() => {
    setMounted(true)
    const savedTheme = localStorage.getItem('ruag_theme')
    if (savedTheme === 'dark') {
      setIsDarkMode(true)
      document.documentElement.classList.add('dark')
    } else {
      setIsDarkMode(false)
      document.documentElement.classList.remove('dark')
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
          if (nuevoEstado) toast.success('MODO ADMIN ACTIVADO 🔓')
          else toast.error('Modo Admin Bloqueado 🔒')
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
    if (!isDarkMode) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('ruag_theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('ruag_theme', 'light')
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
    
    if (isInitialLoad) {
      setTimeout(() => setIsInitialLoad(false), 500)
    }
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

  // --- LÓGICA DE FILTRADO (Optimizada) ---
  const areasDisponibles = useMemo(() => {
    const areasSet = new Set(asistencias.map(a => a.area).filter(Boolean));
    return ['TODAS', ...Array.from(areasSet)].sort();
  }, [asistencias]);

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


  // --- NUEVA LÓGICA DE EXPORTACIÓN (DIA O RANGO) ---
  const procesarYDescargarExcel = (data: any[], nombreArchivo: string) => {
    if (data.length === 0) {
      toast.error("No hay registros en estas fechas para exportar");
      return false;
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

    data.forEach((registro) => {
      // Limpiar nota GPS para el excel si es necesario, o dejarla entera
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

    XLSX.writeFile(libro, `${nombreArchivo}.xlsx`);
    return true;
  }

  const ejecutarExportacion = async () => {
    try {
      if (tipoExportacion === 'dia') {
        const fechaString = format(fechaActual, 'yyyy-MM-dd')
        toast.info(`Generando reporte del día...`);
        const exito = procesarYDescargarExcel(asistenciasFiltradas, `Reporte_RUAG_${fechaString}`);
        if (exito) {
          toast.success(`¡Reporte descargado!`);
          setMostrarModalExportar(false);
        }
      } 
      else {
        // Exportación por rango
        if (!exportarDesde || !exportarHasta) {
          toast.error("Selecciona ambas fechas"); return;
        }
        if (new Date(exportarDesde) > new Date(exportarHasta)) {
          toast.error("La fecha 'Desde' no puede ser mayor que 'Hasta'"); return;
        }

        setExportando(true);
        toast.loading("Descargando datos de la nube...", { id: 'descargando' });

        const { data, error } = await supabase
          .from('registro_asistencias')
          .select('*')
          .gte('fecha', exportarDesde)
          .lte('fecha', exportarHasta)
          .order('fecha', { ascending: true })
          .order('hora_ingreso', { ascending: true });

        if (error) throw error;

        toast.dismiss('descargando');
        const exito = procesarYDescargarExcel(data, `Reporte_RUAG_RANGO_${exportarDesde}_AL_${exportarHasta}`);
        
        if (exito) {
          toast.success(`¡Reporte múltiple descargado! (${data.length} registros)`);
          setMostrarModalExportar(false);
        }
      }
    } catch (error) {
      console.error("Error exportando a Excel:", error);
      toast.dismiss('descargando');
      toast.error("Hubo un error al generar el Excel.");
    } finally {
      setExportando(false);
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

  // Variantes de Animación del Contenedor de la Lista
  const listContainerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05 // Tiempo entre cada fila que aparece
      }
    }
  };

  // --- PANTALLA DE CARGA INICIAL (SPLASH SCREEN LIMPIO) ---
  if (!mounted || isInitialLoad) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa] dark:bg-slate-950 transition-colors duration-500">
        <CustomLoader text="INICIANDO SISTEMA..." />
      </div>
    )
  }

  return (
    <div className={`min-h-screen flex flex-col ${modoEdicion ? 'bg-blue-50/50 dark:bg-slate-900' : 'bg-[#f8f9fa] dark:bg-slate-950'} text-slate-900 dark:text-slate-100 font-sans transition-colors duration-500`}>
      <Toaster position="top-center" richColors />
      
      {/* HEADER SUPERIOR */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 shadow-sm transition-colors duration-500">
        <div className="max-w-[1600px] mx-auto w-full px-6 h-20 flex items-center justify-between">
          
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold shadow-md ${modoEdicion ? 'bg-blue-600' : 'bg-gradient-to-br from-blue-600 to-indigo-600'}`}>
              <ShieldCheck size={28} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-800 dark:text-white leading-tight">
                {modoEdicion ? 'MODO ADMIN' : 'RUAG Control'}
              </h1>
              <p className="text-xs text-slate-500 font-medium">Sistema de Asistencias</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <ThemeSwitch isDarkMode={isDarkMode} onToggle={toggleTheme} />
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block"></div>
            <div className="hidden sm:block">
               <LiveClock />
            </div>
          </div>

        </div>
      </header>

      {/* CONTENIDO PRINCIPAL Y BARRA DE HERRAMIENTAS */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-6 py-8 flex flex-col xl:flex-row gap-8">
        
        {/* COLUMNA IZQUIERDA: CONTROLES Y FILTROS */}
        <div className="w-full xl:w-80 shrink-0 flex flex-col gap-6">
          
          {/* Reloj móvil */}
          <div className="sm:hidden w-full flex justify-center mb-2">
            <LiveClock />
          </div>

          {/* Tarjeta de Calendario */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-500">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Fecha de Consulta</p>
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors duration-500">
              <button onClick={() => setFechaActual(prev => subDays(prev, 1))} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500">
                <ChevronLeft size={20} />
              </button>
              <div className="flex items-center gap-2 relative cursor-pointer flex-1 justify-center">
                <CalendarDays size={18} className="text-blue-600 dark:text-blue-500" />
                <span className="font-bold text-sm capitalize text-slate-700 dark:text-slate-200">
                  {isToday(fechaActual) ? 'Hoy' : format(fechaActual, "d MMM yyyy", { locale: es })}
                </span>
                <input type="date" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" value={format(fechaActual, 'yyyy-MM-dd')} onChange={(e) => { if (e.target.value) { const [year, month, day] = e.target.value.split('-').map(Number); setFechaActual(new Date(year, month - 1, day)) } }} />
              </div>
              <button onClick={() => setFechaActual(prev => addDays(prev, 1))} disabled={isToday(fechaActual)} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500 disabled:opacity-20">
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          {/* Tarjeta de Filtros */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors duration-500">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <SlidersHorizontal size={14}/> Filtros
            </p>
            
            <div className="space-y-4">
              <div className="relative">
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" placeholder="Buscar por DNI o Nombre..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all"
                />
              </div>

              <div className="relative">
                <Filter size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-950 pl-10 pr-8 py-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium cursor-pointer appearance-none transition-all">
                  {areasDisponibles.map(area => <option key={area} value={area}>{area === 'TODAS' ? 'Todas las Áreas' : area}</option>)}
                </select>
                <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" />
              </div>

              <div className="relative">
                <div className={`absolute left-4 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ${filtroEstado === 'TODOS' ? 'bg-slate-400' : filtroEstado === 'PUNTUAL' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-950 pl-10 pr-8 py-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium cursor-pointer appearance-none transition-all">
                  <option value="TODOS">Todos los Estados</option>
                  <option value="PUNTUAL">Puntuales</option>
                  <option value="TARDANZA">Tardanzas</option>
                </select>
                <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none rotate-90" />
              </div>
            </div>
          </div>

          {/* Tarjeta de Acciones Rápida */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 transition-colors duration-500">
            {/* BOTÓN ABRE MODAL DE EXPORTACIÓN */}
            <button onClick={() => setMostrarModalExportar(true)} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 text-sm font-bold transition-all active:scale-95">
              <FileSpreadsheet size={18} /> Exportar Reporte Excel
            </button>
            
            {modoEdicion && (
              <button onClick={() => setMostrarModalManual(true)} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95">
                <UserPlus size={18} /> Añadir Registro Manual
              </button>
            )}
          </div>

        </div>

        {/* COLUMNA DERECHA: TABLA Y ESTADÍSTICAS */}
        <div className="flex-1 flex flex-col min-w-0">
          
          {/* Estadísticas */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard title="Ingresos" value={asistencias.length} icon={<Users size={20}/>} color="bg-blue-500" />
            <StatCard title="Puntuales" value={puntuales} icon={<CheckCircle2 size={20}/>} color="bg-emerald-500" />
            <StatCard title="Tardanzas" value={tardanzas} icon={<AlertCircle size={20}/>} color="bg-red-500" />
            <StatCard title="Salidas" value={salidas} icon={<LogOut size={20}/>} color="bg-slate-500" />
          </div>

          {/* CONTENEDOR DE LA LISTA TIPO TABLA */}
          <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col overflow-hidden transition-colors duration-500">
            
            {/* Header de la Tabla */}
            <div className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between transition-colors duration-500">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <AlignLeft size={18} />
                <h3 className="font-bold text-sm uppercase tracking-widest">Registros del Día</h3>
              </div>
              <span className="text-xs font-bold text-slate-500 bg-slate-200 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                {asistenciasFiltradas.length} encontrados
              </span>
            </div>

            {/* Cuerpo de la Tabla con Scroll Independiente */}
            <div className="flex-1 overflow-y-auto p-3 bg-slate-50/50 dark:bg-slate-900/50 transition-colors duration-500">
              {loading ? (
                <div className="flex h-64 justify-center items-center">
                  <CustomLoader text="Buscando..." />
                </div>
              ) : asistencias.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <CalendarDays size={60} className="mb-4 opacity-50" />
                  <h3 className="text-lg font-bold">Esperando registros...</h3>
                </div>
              ) : asistenciasFiltradas.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                   <Search size={50} className="mb-4 opacity-50" />
                   <h3 className="text-lg font-bold">No hay coincidencias</h3>
                 </div>
              ) : (
                // Lista de animaciones controlada por Framer Motion
                <motion.div 
                  variants={listContainerVariants}
                  initial="hidden"
                  animate="show"
                  className="flex flex-col gap-2.5 pb-4"
                >
                  <AnimatePresence>
                    {asistenciasFiltradas.map((asistencia, idx) => (
                      <FotocheckRow 
                        key={asistencia.id} 
                        data={asistencia} 
                        index={idx} 
                        modoEdicion={modoEdicion} 
                        onActualizar={actualizarHora}
                        onAbrirNota={(notaData) => setNotaSeleccionada(notaData)}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          </div>
        </div>

      </main>

      {/* MODALES SUPERPUESTOS */}

      {/* MODAL EXPORTAR EXCEL */}
      {mostrarModalExportar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 relative animate-in zoom-in-95 duration-200">
            <div className="bg-emerald-500 h-1.5 w-full" />
            <div className="p-6 relative">
              <button onClick={() => setMostrarModalExportar(false)} className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X size={20} /></button>
              <div className="flex items-center gap-3 mb-6 text-emerald-600 dark:text-emerald-500">
                <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl"><FileSpreadsheet size={20} /></div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Exportar a Excel</h3>
              </div>
              
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-6">
                <button onClick={() => setTipoExportacion('dia')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${tipoExportacion === 'dia' ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm' : 'text-slate-500'}`}>
                  Día Actual
                </button>
                <button onClick={() => setTipoExportacion('rango')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${tipoExportacion === 'rango' ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm' : 'text-slate-500'}`}>
                  Por Rango
                </button>
              </div>

              {tipoExportacion === 'dia' ? (
                <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
                  <p className="text-slate-600 dark:text-slate-400 text-sm">Se exportarán los <strong className="text-emerald-600">{asistenciasFiltradas.length}</strong> registros filtrados del día de hoy.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Desde</label>
                    <input type="date" value={exportarDesde} onChange={e => setExportarDesde(e.target.value)} className="w-full mt-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl outline-none focus:border-emerald-500 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Hasta</label>
                    <input type="date" value={exportarHasta} onChange={e => setExportarHasta(e.target.value)} className="w-full mt-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl outline-none focus:border-emerald-500 text-sm" />
                  </div>
                </div>
              )}

              <button onClick={ejecutarExportacion} disabled={exportando} className="w-full mt-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl flex justify-center items-center transition-transform active:scale-95 shadow-md disabled:opacity-70">
                {exportando ? <Loader2 className="animate-spin" size={20}/> : <><Download size={18} className="mr-2"/> Descargar Excel</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalManual && (
        <ModalRegistroManual onClose={() => setMostrarModalManual(false)} fechaBase={format(fechaActual, 'yyyy-MM-dd')} onSuccess={(nuevoRegistro) => { if (isToday(fechaActual) || nuevoRegistro.fecha === format(fechaActual, 'yyyy-MM-dd')) { setAsistencias(prev => [nuevoRegistro, ...prev]) }; setMostrarModalManual(false) }} />
      )}

      {notaSeleccionada && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200 transition-colors duration-500">
            <div className={`${notaSeleccionada.esObra ? 'bg-red-500' : 'bg-amber-500'} h-1.5 w-full`} />
            <div className="p-6 relative">
              <button onClick={() => setNotaSeleccionada(null)} className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X size={20} /></button>
              
              <div className={`flex items-center gap-3 mb-4 ${notaSeleccionada.esObra ? 'text-red-500' : 'text-amber-500'}`}>
                {notaSeleccionada.esObra ? <MapPin size={28} /> : <MessageSquareText size={28} />}
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  {notaSeleccionada.esObra ? 'Salida desde Obra' : 'Motivo de Salida'}
                </h3>
              </div>
              
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">{notaSeleccionada.nombre} <br/><span className="font-normal opacity-70">Salió a las {notaSeleccionada.hora}</span></p>
              
              <div className="bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 min-h-[100px] whitespace-pre-wrap text-sm leading-relaxed transition-colors duration-500">
                {notaSeleccionada.nota}
              </div>

              {/* BOTÓN VER EN MAPA SI ES OBRA */}
              {notaSeleccionada.esObra && notaSeleccionada.coordenadas && (
                <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${notaSeleccionada.coordenadas}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="w-full mt-4 flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 border border-red-200 dark:border-red-500/30 font-bold py-3 rounded-xl transition-all"
                >
                  <Map size={18} /> Ver ubicación en Maps
                </a>
              )}
              
              <button onClick={() => setNotaSeleccionada(null)} className={`w-full mt-4 ${notaSeleccionada.esObra ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'} font-bold py-3 rounded-xl transition-transform active:scale-95`}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Estilos para animación del texto largo que fluye */}
      <style dangerouslySetInnerHTML={{__html: `
        .marquee-container { overflow: hidden; white-space: nowrap; position: relative; width: 100%; mask-image: linear-gradient(to right, black 85%, transparent 100%); }
        .marquee-text { display: inline-block; animation: marquee 8s linear infinite; }
        .marquee-text:hover { animation-play-state: paused; }
        @keyframes marquee { 0% { transform: translateX(0); } 15% { transform: translateX(0); } 100% { transform: translateX(calc(-100% + 150px)); } }
      `}} />

    </div>
  )
}

function StatCard({ title, value, icon, color }: any) {
  return (
    <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4 relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-md duration-500">
      <div className={`w-12 h-12 rounded-xl ${color} text-white flex items-center justify-center shadow-inner shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest truncate">{title}</p>
        <p className="text-2xl font-black text-slate-800 dark:text-white leading-none mt-1">{value}</p>
      </div>
    </div>
  )
}

// --- MODAL REGISTRO MANUAL ---
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
        dni, nombres_completos: nombres.toUpperCase(), area, fecha: fechaBase, hora_ingreso: fechaObj.toISOString(), estado_ingreso: isPuntual ? 'PUNTUAL' : 'TARDANZA', foto_url: '' 
      }

      const { data, error } = await supabase.from('registro_asistencias').insert(nuevoRegistro).select().single()
      if (error) throw error

      toast.success("Asistencia manual guardada")
      onSuccess(data)
    } catch (error: any) {
      toast.error(`Error: ${error.message}`)
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 relative animate-in zoom-in-95 duration-200 transition-colors duration-500">
        <div className="bg-blue-600 h-1.5 w-full" />
        <div className="p-6 relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X size={20} /></button>
          <div className="flex items-center gap-3 mb-6 text-blue-600 dark:text-blue-500">
            <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 rounded-xl"><UserPlus size={20} /></div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Registro Manual</h3>
          </div>
          <div className="space-y-4">
            <div><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Nombres y Apellidos</label><input type="text" value={nombres} onChange={(e) => setNombres(e.target.value)} className="w-full mt-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl outline-none focus:border-blue-500 text-sm transition-colors" placeholder="Ej: Juan Perez" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">DNI</label><input type="number" value={dni} onChange={(e) => {if(e.target.value.length <=8) setDni(e.target.value)}} className="w-full mt-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl outline-none focus:border-blue-500 text-sm transition-colors" placeholder="12345678" /></div>
              <div><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Hora Ingreso</label><input type="time" value={horaIngreso} onChange={(e) => setHoraIngreso(e.target.value)} className="w-full mt-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl outline-none focus:border-blue-500 text-sm transition-colors" /></div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Área</label>
              <select value={area} onChange={(e) => setArea(e.target.value)} className="w-full mt-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl outline-none focus:border-blue-500 text-sm transition-colors cursor-pointer appearance-none">
                <option value="" disabled>Seleccionar Área</option>{AREAS_LIST.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <button onClick={handleGuardar} disabled={guardando} className="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl flex justify-center items-center transition-transform active:scale-95 shadow-md">
            {guardando ? <Loader2 className="animate-spin" size={20}/> : "Registrar Asistencia"}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- FILA DE TABLA (INTELIGENTE: EXTRAE COORDENADAS PARA EL MAPA) ---
function FotocheckRow({ data, index, modoEdicion, onActualizar, onAbrirNota }: { data: any, index: number, modoEdicion: boolean, onActualizar: Function, onAbrirNota: (nota: {nombre: string, nota: string, hora: string, esObra: boolean, coordenadas?: string}) => void }) {
  const isPuntual = data.estado_ingreso === 'PUNTUAL'
  const justAdded = index === 0 && isToday(new Date(data.hora_ingreso))
  
  const statusColor = isPuntual ? 'bg-emerald-500' : 'bg-red-500';

  const getInitials = (name: string) => {
    if (!name) return '??';
    const words = name.trim().split(' ').filter(w => w.length > 0);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };

  // Lógica para extraer la coordenada secreta de la nota
  const tieneNota = !!data.notas;
  const esDeObra = tieneNota && data.notas.includes('[GPS:');
  
  let textoLimpio = data.notas || '';
  let coordenadas = '';

  if (esDeObra) {
    const startIdx = data.notas.indexOf('[GPS:');
    const endIdx = data.notas.indexOf(']', startIdx);
    if (startIdx !== -1 && endIdx !== -1) {
      coordenadas = data.notas.substring(startIdx + 5, endIdx).trim(); // Extrae "-12.11, -77.02"
      textoLimpio = data.notas.substring(0, startIdx).trim(); // Deja solo el texto "En la obra XYZ"
    }
  }

  const rowVariants: Variants = {
    hidden: { opacity: 0, x: -20 },
    show: { 
      opacity: 1, 
      x: 0,
      transition: { type: "spring" as const, stiffness: 300, damping: 24 }
    }
  };

  return (
    <motion.div 
      variants={rowVariants}
      whileHover={{ scale: 1.005 }}
      className={`group flex items-center justify-between p-4 rounded-xl bg-white dark:bg-slate-900 border transition-colors hover:shadow-md
        ${justAdded ? 'border-blue-400 ring-1 ring-blue-100 shadow-sm' : 'border-slate-200 dark:border-slate-800'}`}
    >
      
      <div className="flex items-center gap-5 flex-1 min-w-0 pr-4">
        <div className="relative shrink-0">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
            {data.foto_url ? (
              <img src={data.foto_url} alt="Foto" className="w-full h-full object-cover" />
            ) : (
              <span className="font-black text-slate-400 dark:text-slate-500 text-lg">{getInitials(data.nombres_completos)}</span>
            )}
          </div>
          <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 ${statusColor}`} />
        </div>
        
        <div className="flex flex-col min-w-0">
          <h4 className="font-bold text-slate-800 dark:text-slate-100 text-[17px] truncate uppercase tracking-tight">
            {data.nombres_completos}
          </h4>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm font-mono text-slate-500 font-medium">{data.dni}</span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{data.area}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-8 shrink-0">
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ingreso</span>
          {modoEdicion ? (
            <input type="time" defaultValue={format(new Date(data.hora_ingreso), 'HH:mm')} className="bg-transparent border-b border-blue-500 text-base font-black text-blue-600 outline-none w-20 text-right" onBlur={(e) => { if(e.target.value !== format(new Date(data.hora_ingreso), 'HH:mm')) onActualizar(data.id, 'hora_ingreso', e.target.value, data.hora_ingreso) }} />
          ) : (
            <div className={`font-black text-lg leading-none ${isPuntual ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {format(new Date(data.hora_ingreso), 'HH:mm')}
            </div>
          )}
        </div>
        
        <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>
        
        <div className="flex flex-col items-end min-w-[70px]">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Salida</span>
          {modoEdicion ? (
            <input type="time" defaultValue={data.hora_salida ? format(new Date(data.hora_salida), 'HH:mm') : ''} className="bg-transparent border-b border-blue-500 text-base font-bold text-slate-700 dark:text-slate-300 outline-none w-20 text-right" onBlur={(e) => { const currentValue = data.hora_salida ? format(new Date(data.hora_salida), 'HH:mm') : ''; if(e.target.value && e.target.value !== currentValue) onActualizar(data.id, 'hora_salida', e.target.value, data.hora_salida || data.hora_ingreso) }} />
          ) : (
            data.hora_salida ? (
              <div className="font-bold text-lg leading-none text-slate-700 dark:text-slate-300">
                {format(new Date(data.hora_salida), 'HH:mm')}
              </div>
            ) : (
              <span className="text-[11px] font-bold text-slate-400 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md bg-slate-50 dark:bg-slate-800">
                --:--
              </span>
            )
          )}
        </div>

        <div className="w-10 flex justify-center">
          {tieneNota ? (
            <button 
              onClick={() => onAbrirNota({ 
                nombre: data.nombres_completos, 
                nota: textoLimpio, // Se muestra sin las coordenadas raras
                hora: data.hora_salida ? format(new Date(data.hora_salida), 'HH:mm a') : 'Desconocida',
                esObra: esDeObra,
                coordenadas: coordenadas 
              })} 
              className={`p-2 rounded-full border transition-all shadow-sm hover:scale-110 
                ${esDeObra 
                  ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100 dark:bg-red-500/10 dark:border-red-500/30' 
                  : 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100 dark:bg-amber-500/10 dark:border-amber-500/30'}`} 
              title={esDeObra ? "Ver salida de obra" : "Ver motivo"}
            >
              {esDeObra ? <MapPin size={18} /> : <MessageSquareText size={18} />}
            </button>
          ) : (
            <div className="w-10"></div> 
          )}
        </div>

      </div>
    </motion.div>
  )
}