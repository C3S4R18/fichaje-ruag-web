'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Scanner } from '@yudiel/react-qr-scanner'
import { createClient } from '@supabase/supabase-js'
import { MapPin, AlertTriangle, CheckCircle, Loader2, User, LogOut, History } from 'lucide-react'
import { format, parseISO } from 'date-fns'

// --- INTERFACES TYPESCRIPT ---
interface Perfil {
  dni: string;
  nombres: string;
  area: string;
  foto_url: string;
}

interface Asistencia {
  id: string;
  hora_ingreso: string;
  estado_ingreso: string;
  hora_salida: string | null;
}

// --- CONFIGURACIÓN ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

const OBRA_LAT = -12.114859
const OBRA_LON = -77.026540
const RADIO_PERMITIDO_METROS = 50

export default function EscanerIOS() {
  const router = useRouter()
  
  // Estados Globales
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [asistenciaHoy, setAsistenciaHoy] = useState<Asistencia | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Estados del Escáner
  const [estadoEscaner, setEstadoEscaner] = useState<'ESCANEO' | 'CARGANDO' | 'EXITO' | 'ERROR'>('ESCANEO')
  const [mensaje, setMensaje] = useState('')
  const [isMarkingExit, setIsMarkingExit] = useState(false)

  // 1. CARGAR DATOS AL INICIAR
  useEffect(() => {
    const cargarDatos = async () => {
      // Leer LocalStorage
      const dni = localStorage.getItem('RUAG_DNI')
      const nombres = localStorage.getItem('RUAG_NOMBRE')
      const area = localStorage.getItem('RUAG_AREA')
      const foto = localStorage.getItem('RUAG_FOTO')

      if (!dni || !nombres) {
        // Si no hay datos, lo mandamos a crear su perfil
        router.push('/setup')
        return
      }

      setPerfil({ dni, nombres, area: area || '', foto_url: foto || '' })

      // Buscar si ya marcó asistencia hoy
      try {
        const hoy = new Date().toISOString().split('T')[0]
        const { data, error } = await supabase
          .from('registro_asistencias')
          .select('id, hora_ingreso, estado_ingreso, hora_salida')
          .eq('dni', dni)
          .like('created_at', `${hoy}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (data) {
          setAsistenciaHoy(data as Asistencia)
        }
      } catch (e) {
        console.error("No hay registro hoy o hubo un error:", e)
      } finally {
        setIsLoading(false)
      }
    }

    cargarDatos()
  }, [router])


  // --- LÓGICA DE GEOLOCALIZACIÓN ---
  const calcularDistancia = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3 
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }

  const obtenerUbicacion = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Tu navegador no soporta GPS."))
      } else {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
      }
    })
  }


  // --- PROCESAR CÓDIGO QR (MARCAR INGRESO) ---
  const procesarQR = async (textoQR: string) => {
    if (estadoEscaner !== 'ESCANEO' || !perfil) return
    
    // 1. Antifraude Dinámico
    if (!textoQR.startsWith("RUAG_INGRESO_")) {
        mostrarError("Código QR no reconocido.")
        return
    }

    const partes = textoQR.split("_")
    if (partes.length !== 3) return
    
    const tiempoQR = parseInt(partes[2])
    const tiempoActual = Math.floor(Date.now() / 10000)

    if (Math.abs(tiempoActual - tiempoQR) > 1) {
        mostrarError("El código QR ha expirado.\nPor favor, escanea el código actual de la pantalla.")
        return
    }

    setEstadoEscaner('CARGANDO')
    setMensaje('Calculando coordenadas y validando...')

    // 2. Candado GPS
    try {
      const position = await obtenerUbicacion()
      const distancia = calcularDistancia(position.coords.latitude, position.coords.longitude, OBRA_LAT, OBRA_LON)

      if (distancia > RADIO_PERMITIDO_METROS) {
        mostrarError(`ACCESO DENEGADO\nEstás a ${Math.round(distancia)} metros de la oficina.\n¡Acércate a las instalaciones para marcar!`)
        return
      }

      // 3. Registrar Ingreso
      const horaActual = new Date().getHours()
      const minutoActual = new Date().getMinutes()
      const isPuntual = horaActual < 9 || (horaActual === 9 && minutoActual <= 5)
      const estado = isPuntual ? 'PUNTUAL' : 'TARDANZA'

      const { data, error } = await supabase.from('registro_asistencias').insert({
        dni: perfil.dni,
        nombres_completos: perfil.nombres,
        area: perfil.area,
        foto_url: perfil.foto_url,
        estado_ingreso: estado,
      }).select().single()

      if (error) throw error

      setAsistenciaHoy(data as Asistencia)
      mostrarExito("¡INGRESO REGISTRADO!\nGPS Verificado")

    } catch (error: any) {
      if (error.code === 1) mostrarError("Enciende el GPS de tu celular para poder registrar tu asistencia.")
      else mostrarError(`Error al registrar: ${error.message}`)
    }
  }

  // --- MARCAR SALIDA (Botón Rojo) ---
  const handleMarcarSalida = async () => {
    if (!asistenciaHoy || isMarkingExit) return
    setIsMarkingExit(true)

    try {
      const position = await obtenerUbicacion()
      const distancia = calcularDistancia(position.coords.latitude, position.coords.longitude, OBRA_LAT, OBRA_LON)

      if (distancia > RADIO_PERMITIDO_METROS) {
        alert(`❌ Fraude detectado: Estás a ${Math.round(distancia)} metros de la oficina. Acércate para salir.`)
        setIsMarkingExit(false)
        return
      }

      const horaSalidaISO = new Date().toISOString()
      const { error } = await supabase
        .from('registro_asistencias')
        .update({ hora_salida: horaSalidaISO })
        .eq('id', asistenciaHoy.id)

      if (error) throw error

      setAsistenciaHoy({ ...asistenciaHoy, hora_salida: horaSalidaISO })
      alert("¡Salida marcada exitosamente!")

    } catch (error: any) {
      if (error.code === 1) alert("Enciende tu GPS para marcar salida.")
      else alert(`Error: ${error.message}`)
    } finally {
      setIsMarkingExit(false)
    }
  }


  // --- UTILIDADES VISUALES ---
  const mostrarError = (msg: string) => {
    setMensaje(msg)
    setEstadoEscaner('ERROR')
    setTimeout(() => setEstadoEscaner('ESCANEO'), 3500)
  }

  const mostrarExito = (msg: string) => {
    setMensaje(msg)
    setEstadoEscaner('EXITO')
    // No reseteamos porque la UI cambiará automáticamente al fotocheck al tener 'asistenciaHoy'
  }

  // PANTALLA DE CARGA INICIAL
  if (isLoading || !perfil) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <p className="text-white font-medium">Verificando estado...</p>
      </div>
    )
  }

  // ============================================================================================
  // VISTA 2: EL FOTOCHECK DIGITAL + BOTÓN SALIDA (SI YA MARCÓ INGRESO)
  // ============================================================================================
  if (asistenciaHoy) {
    const isPuntual = asistenciaHoy.estado_ingreso === "PUNTUAL"
    const statusColor = isPuntual ? 'bg-emerald-500' : 'bg-amber-500'
    const statusTextColor = isPuntual ? 'text-emerald-500' : 'text-amber-500'
    const statusBorderColor = isPuntual ? 'border-emerald-500' : 'border-amber-500'
    const yaMarcoSalida = asistenciaHoy.hora_salida !== null

    // Formatear hora de ingreso de "2024-10-31T14:30:00" a "02:30 PM"
    let horaIngresoFormateada = "--:--"
    try {
      if (asistenciaHoy.hora_ingreso) {
        // Parsear ISO y ajustar por UTC si es necesario. (Dependiendo de cómo lo guarde Supabase)
        const fecha = new Date(asistenciaHoy.hora_ingreso)
        horaIngresoFormateada = format(fecha, 'hh:mm a')
      }
    } catch (e) {}

    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative">
        
        {/* Botón superior de Historial */}
        <button className="absolute top-6 right-6 text-white bg-slate-800 p-3 rounded-full hover:bg-slate-700 transition">
            <History size={24} />
        </button>

        <div className="w-full max-w-sm mb-10">
          <div className="bg-slate-900 rounded-[24px] shadow-2xl overflow-hidden border border-slate-800">
            {/* Barra superior de estado */}
            <div className={`w-full h-2 ${statusColor}`} />
            
            <div className="p-8 flex flex-col items-center">
              {/* Foto circular con borde dinámico */}
              <div className={`w-32 h-32 rounded-full border-4 ${statusBorderColor} p-1 mb-4`}>
                <img 
                  src={perfil.foto_url || 'https://via.placeholder.com/150'} 
                  alt="Fotocheck" 
                  className="w-full h-full rounded-full object-cover"
                />
              </div>
              
              <h2 className="text-white text-xl font-bold text-center">{perfil.nombres}</h2>
              <p className="text-slate-400 text-sm mt-1">{perfil.dni}</p>

              <div className="mt-4 bg-slate-800 rounded-lg px-4 py-2">
                <span className="text-blue-400 text-xs font-bold tracking-widest uppercase">{perfil.area}</span>
              </div>

              <div className="w-full h-px bg-slate-800 my-8" />

              {/* Tiempos y Estado */}
              <div className="w-full flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-slate-400 text-xs font-bold mb-1">INGRESO HOY</span>
                  <span className="text-white text-2xl font-black tabular-nums">{horaIngresoFormateada}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-slate-400 text-xs font-bold mb-1">ESTADO</span>
                  <span className={`${statusTextColor} text-lg font-bold`}>{asistenciaHoy.estado_ingreso}</span>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Zona de Acción (Salida) */}
        {yaMarcoSalida ? (
          <div className="text-center">
            <p className="text-slate-400 text-base">Ya marcaste tu salida hoy.</p>
            <p className="text-white text-xl font-bold mt-2">Hasta mañana.</p>
          </div>
        ) : (
          <div className="w-full max-w-sm text-center">
            <button
              onClick={handleMarcarSalida}
              disabled={isMarkingExit}
              className="w-full h-20 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 disabled:cursor-not-allowed rounded-2xl flex items-center justify-center text-white font-bold text-xl transition-colors shadow-[0_0_30px_rgba(239,68,68,0.3)]"
            >
              {isMarkingExit ? (
                <Loader2 className="animate-spin" size={32} />
              ) : (
                <>
                  <LogOut size={28} className="mr-3" />
                  MARCAR SALIDA
                </>
              )}
            </button>
            <p className="text-slate-400 text-xs mt-4">Toca al finalizar tu turno laboral</p>
          </div>
        )}

      </div>
    )
  }

  // ============================================================================================
  // VISTA 1: EL ESCÁNER CON CÁMARA (MODO INGRESO)
  // ============================================================================================
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden">
      
      {/* Botón superior de Historial */}
      <button className="absolute top-6 right-6 text-white bg-slate-800/80 p-3 rounded-full hover:bg-slate-700 transition z-40 backdrop-blur-md">
          <History size={24} />
      </button>

      {/* Cabecera Flotante */}
      <div className="absolute top-0 left-0 w-full p-6 z-20 flex flex-col items-start bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <IconoQR />
        <h1 className="text-lg font-bold text-white mt-4">Escanea el QR de Ingreso</h1>
        <p className="text-xs text-emerald-400 mt-1">Se verificará tu GPS</p>
      </div>

      {/* Visor de Cámara */}
      <div className="flex-1 relative bg-black flex items-center justify-center">
        {estadoEscaner === 'ESCANEO' && (
          <div className="absolute inset-0 z-10 opacity-80">
            <Scanner 
              onScan={(result) => {
                if (result && result.length > 0) {
                  procesarQR(result[0].rawValue)
                }
              }}
              onError={(error) => console.log("Error de cámara", error)}
              components={{ finder: false }}
            />
          </div>
        )}

        {/* Overlay Cuadrado Animado (Diseño Ruag) */}
        {estadoEscaner === 'ESCANEO' && (
          <div className="z-20 w-64 h-64 border-4 border-blue-400 rounded-3xl relative">
            {/* Línea escaneadora */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_15px_#60A5FA] animate-[scan_2s_linear_infinite_alternate]" />
          </div>
        )}

        {/* Pantallas de Estado superpuestas (Error/Éxito/Carga) */}
        {estadoEscaner !== 'ESCANEO' && (
          <div className={`z-30 absolute inset-0 flex flex-col items-center justify-center p-6 backdrop-blur-xl transition-all duration-300 ${
            estadoEscaner === 'CARGANDO' ? 'bg-slate-950/90' : 
            estadoEscaner === 'EXITO' ? 'bg-slate-950' : 'bg-slate-950'
          }`}>
            
            {estadoEscaner === 'CARGANDO' && (
              <>
                <Loader2 size={64} className="text-white animate-spin mb-6" />
                <p className="text-white text-lg font-medium">{mensaje}</p>
              </>
            )}

            {estadoEscaner === 'EXITO' && (
              <div className="flex flex-col items-center animate-[pop_0.5s_ease-out_forwards]">
                <CheckCircle size={100} className="text-emerald-500 mb-6" />
                <h2 className="text-2xl font-black text-white text-center mb-2">¡INGRESO REGISTRADO!</h2>
                <p className="text-emerald-500 font-medium">GPS Verificado</p>
              </div>
            )}

            {estadoEscaner === 'ERROR' && (
              <div className="flex flex-col items-center">
                <AlertTriangle size={80} className="text-red-500 mb-6" />
                <h2 className="text-2xl font-black text-white text-center mb-6">ACCESO DENEGADO</h2>
                <p className="text-red-500 text-center whitespace-pre-line">{mensaje}</p>
              </div>
            )}
            
          </div>
        )}
      </div>
      
      {/* Definición de animaciones CSS in-line */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan {
          0% { top: 0%; }
          100% { top: 100%; }
        }
        @keyframes pop {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}} />

    </div>
  )
}

// Subcomponente simple para el icono del QR en la esquina
function IconoQR() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <path d="M7 7h.01M18 7h.01M7 18h.01M18 18h.01"/>
    </svg>
  )
}