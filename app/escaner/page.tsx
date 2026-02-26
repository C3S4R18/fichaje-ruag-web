'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Scanner } from '@yudiel/react-qr-scanner'
import { createClient } from '@supabase/supabase-js'
import { MapPin, AlertTriangle, CheckCircle, Loader2, User, LogOut, History, Edit2, Edit3, X, Trophy, Lock } from 'lucide-react'
import { format } from 'date-fns'

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

interface LogroItem {
  id: number;
  emoji: string;
  titulo: string;
  desc: string;
  desbloqueado: boolean;
}

const TODOS_LOS_LOGROS: LogroItem[] = [
  { id: 1, emoji: "⏱️", titulo: "Reloj Suizo", desc: "Llega puntual 5 días seguidos.", desbloqueado: false },
  { id: 2, emoji: "🌅", titulo: "Madrugador", desc: "Marca tu ingreso antes de las 8:30 AM.", desbloqueado: false },
  { id: 3, emoji: "📸", titulo: "Cámara Lista", desc: "Actualiza tu foto de perfil en el sistema.", desbloqueado: false },
  { id: 4, emoji: "🔥", titulo: "Imparable", desc: "Asistencia perfecta por 30 días seguidos.", desbloqueado: false },
  { id: 5, emoji: "💬", titulo: "Comunicador", desc: "Deja una nota al marcar tu salida 3 veces.", desbloqueado: false },
  { id: 6, emoji: "🦉", titulo: "Noctámbulo", desc: "Marca tu salida después de las 7:00 PM.", desbloqueado: false },
  { id: 7, emoji: "⚡", titulo: "Flash", desc: "Marca asistencia en menos de 5 seg tras abrir la app.", desbloqueado: false },
  { id: 8, emoji: "🥇", titulo: "Pionero", desc: "Sé uno de los primeros 10 en llegar en el día.", desbloqueado: false },
  { id: 9, emoji: "🦸‍♂️", titulo: "Héroe de Fin de Semana", desc: "Marca tu asistencia un sábado o domingo.", desbloqueado: false },
  { id: 10, emoji: "👑", titulo: "Invencible", desc: "¡100 días consecutivos sin ninguna tardanza!", desbloqueado: false }
]

// --- CONFIGURACIÓN ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

const OBRA_LAT = -12.114859
const OBRA_LON = -77.026540
const RADIO_PERMITIDO_METROS = 50

// --- UTILIDAD DE DISTANCIA GPS ---
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

// --- FUNCIÓN EVALUAR LOGROS (Reutilizada de Android) ---
const evaluarLogrosDeIngreso = async (dni: string, horaActual: number, minutoActual: number): Promise<number[]> => {
  const nuevos: number[] = []
  try {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const dayOfWeek = new Date().getDay() // 0 = Domingo, 6 = Sábado
    
    // 1. PIONERO (Top 10)
    const { count } = await supabase.from('registro_asistencias').select('*', { count: 'exact', head: true }).eq('fecha', todayStr)
    if ((count || 0) <= 10) {
      if (await desbloquearLogro(dni, 8)) nuevos.push(8)
    }

    // 2. MADRUGADOR (Antes 8:30)
    const horaDecimal = horaActual + (minutoActual / 60.0)
    if (horaDecimal <= 8.5) {
      if (await desbloquearLogro(dni, 2)) nuevos.push(2)
    }

    // 3. FIN DE SEMANA
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      if (await desbloquearLogro(dni, 9)) nuevos.push(9)
    }

    // 4. RELOJ SUIZO (5 puntuales seguidos)
    const { data: ultimos } = await supabase.from('registro_asistencias')
      .select('estado_ingreso').eq('dni', dni).order('fecha', { ascending: false }).limit(5)
    
    if (ultimos && ultimos.length === 5 && ultimos.every(a => a.estado_ingreso === 'PUNTUAL')) {
      if (await desbloquearLogro(dni, 1)) nuevos.push(1)
    }
  } catch (e) { console.error("Error logros:", e) }
  return nuevos
}

const desbloquearLogro = async (dni: string, logroId: number): Promise<boolean> => {
  try {
    const { error } = await supabase.from('logros_usuarios').insert({ dni, logro_id: logroId })
    return !error 
  } catch { return false }
}

export default function EscanerIOS() {
  const router = useRouter()
  
  // Estados Globales
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [asistenciaHoy, setAsistenciaHoy] = useState<Asistencia | null>(null)
  const [unlockedLogros, setUnlockedLogros] = useState<number[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Estados UI
  const [estadoEscaner, setEstadoEscaner] = useState<'ESCANEO' | 'CARGANDO' | 'EXITO' | 'ERROR'>('ESCANEO')
  const [mensaje, setMensaje] = useState('')
  const [isMarkingExit, setIsMarkingExit] = useState(false)
  const [mostrarLogros, setMostrarLogros] = useState(false)
  const [achievementToAnimate, setAchievementToAnimate] = useState<LogroItem | null>(null)

  // Estados Notas
  const [mostrarDialogoNota, setMostrarDialogoNota] = useState(false)
  const [notaTexto, setNotaTexto] = useState('')
  const [guardandoNota, setGuardandoNota] = useState(false)
  const [isRemoteExit, setIsRemoteExit] = useState(false)
  const [currentLatLon, setCurrentLatLon] = useState('')
  
  // Foto
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 1. CARGAR DATOS
  useEffect(() => {
    const cargarDatos = async () => {
      const dni = localStorage.getItem('RUAG_DNI')
      const nombres = localStorage.getItem('RUAG_NOMBRE')
      const area = localStorage.getItem('RUAG_AREA')
      const foto = localStorage.getItem('RUAG_FOTO')

      if (!dni || !nombres) {
        router.push('/setup')
        return
      }

      setPerfil({ dni, nombres, area: area || '', foto_url: foto || '' })

      try {
        const hoyStr = format(new Date(), 'yyyy-MM-dd')
        
        // Cargar Asistencia
        const { data: astData } = await supabase.from('registro_asistencias')
          .select('id, hora_ingreso, estado_ingreso, hora_salida')
          .eq('dni', dni).eq('fecha', hoyStr).order('hora_ingreso', { ascending: false }).limit(1).single()

        if (astData) setAsistenciaHoy(astData as Asistencia)

        // Cargar Logros
        const { data: logData } = await supabase.from('logros_usuarios').select('logro_id').eq('dni', dni)
        if (logData) setUnlockedLogros(logData.map(l => l.logro_id))

      } catch (e) {
        console.error("Error carga:", e)
      } finally {
        setIsLoading(false)
      }
    }
    cargarDatos()
  }, [router])

  // --- PROCESAR QR ---
  const procesarQR = async (textoQR: string) => {
    if (estadoEscaner !== 'ESCANEO' || !perfil) return
    
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

    try {
      const position = await obtenerUbicacion()
      const distancia = calcularDistancia(position.coords.latitude, position.coords.longitude, OBRA_LAT, OBRA_LON)

      if (distancia > RADIO_PERMITIDO_METROS) {
        mostrarError(`ACCESO DENEGADO\nEstás a ${Math.round(distancia)} metros de la oficina.`)
        return
      }

      const horaActual = new Date().getHours()
      const minutoActual = new Date().getMinutes()
      const isPuntual = horaActual < 9 || (horaActual === 9 && minutoActual <= 5)
      const estado = isPuntual ? 'PUNTUAL' : 'TARDANZA'
      const hoyStr = format(new Date(), 'yyyy-MM-dd')

      const { data, error } = await supabase.from('registro_asistencias').insert({
        dni: perfil.dni, nombres_completos: perfil.nombres, area: perfil.area,
        foto_url: perfil.foto_url, estado_ingreso: estado, fecha: hoyStr 
      }).select().single()

      if (error) throw error

      setAsistenciaHoy(data as Asistencia)
      
      // Evaluar Logros
      const nuevosLogros = await evaluarLogrosDeIngreso(perfil.dni, horaActual, minutoActual)
      
      mostrarExito("¡INGRESO REGISTRADO!\nGPS Verificado")
      
      if (nuevosLogros.length > 0) {
        setTimeout(() => {
          const logroObj = TODOS_LOS_LOGROS.find(l => l.id === nuevosLogros[0])
          if (logroObj) setAchievementToAnimate(logroObj)
        }, 2500)
      }

    } catch (error: any) {
       // ... manejo de errores igual
       const errorStr = error.message || ''
       if (error.code === 1) mostrarError("Enciende el GPS de tu celular para poder registrar tu asistencia.")
       else if (errorStr.includes('duplicate key') || errorStr.includes('unique constraint')) {
           mostrarExito("¡INGRESO REGISTRADO!\nGPS Verificado")
       } else mostrarError(`Error al registrar: ${error.message}`)
    }
  }

  const handleMarcarSalidaClick = async () => {
    if (!asistenciaHoy || isMarkingExit) return
    setIsMarkingExit(true)

    try {
      const position = await obtenerUbicacion()
      const lat = position.coords.latitude
      const lon = position.coords.longitude
      const distancia = calcularDistancia(lat, lon, OBRA_LAT, OBRA_LON)

      if (distancia > RADIO_PERMITIDO_METROS) {
        // ES SALIDA REMOTA
        setCurrentLatLon(`${lat}, ${lon}`)
        setIsRemoteExit(true)
        setMostrarDialogoNota(true)
        setIsMarkingExit(false)
        return
      }

      // SALIDA NORMAL
      const horaSalidaISO = new Date().toISOString()
      const { error } = await supabase.from('registro_asistencias').update({ hora_salida: horaSalidaISO }).eq('id', asistenciaHoy.id)
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

  const handleGuardarNota = async () => {
    if (notaTexto.trim() === '') {
      alert(isRemoteExit ? "Debes ingresar tu ubicación." : "El motivo no puede estar vacío")
      return
    }
    if (!asistenciaHoy) return

    setGuardandoNota(true)
    try {
      if (isRemoteExit) {
        const notaConGps = `${notaTexto.trim()} [GPS: ${currentLatLon}]`
        const horaSalidaISO = new Date().toISOString()
        
        await supabase.from('registro_asistencias').update({ notas: notaConGps, hora_salida: horaSalidaISO }).eq('id', asistenciaHoy.id)
        
        setAsistenciaHoy({ ...asistenciaHoy, hora_salida: horaSalidaISO })
        alert("¡Salida remota registrada exitosamente!")
        setMostrarDialogoNota(false)
      } else {
        await supabase.from('registro_asistencias').update({ notas: notaTexto }).eq('id', asistenciaHoy.id)
        alert("¡Motivo guardado correctamente!")
        setMostrarDialogoNota(false)
        setNotaTexto('')
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    } finally {
      setGuardandoNota(false)
      setIsRemoteExit(false)
    }
  }

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !perfil || !asistenciaHoy) return

    setIsUploadingPhoto(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${perfil.dni}_${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage.from('fotos_perfil').upload(fileName, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage.from('fotos_perfil').getPublicUrl(fileName)
      const nuevaFotoUrl = publicUrlData.publicUrl

      await supabase.from('fotocheck_perfiles').update({ foto_url: nuevaFotoUrl }).eq('dni', perfil.dni)
      await supabase.from('registro_asistencias').update({ foto_url: nuevaFotoUrl }).eq('id', asistenciaHoy.id)

      localStorage.setItem('RUAG_FOTO', nuevaFotoUrl)
      setPerfil({ ...perfil, foto_url: nuevaFotoUrl })

      // LOGRO CAMARA
      if (await desbloquearLogro(perfil.dni, 3)) {
        const logroObj = TODOS_LOS_LOGROS.find(l => l.id === 3)
        if (logroObj) setAchievementToAnimate(logroObj)
      }

      alert("¡Foto actualizada!")
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  const mostrarError = (msg: string) => { setMensaje(msg); setEstadoEscaner('ERROR'); setTimeout(() => setEstadoEscaner('ESCANEO'), 3500) }
  const mostrarExito = (msg: string) => { setMensaje(msg); setEstadoEscaner('EXITO') }

  if (isLoading || !perfil) {
    return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center"><Loader2 className="animate-spin text-blue-600 mb-4" size={48} /><p className="text-white font-medium">Verificando estado...</p></div>
  }

  // ============================================================================================
  // VISTA 2: EL FOTOCHECK DIGITAL WEB (DISEÑO CYBERPUNK)
  // ============================================================================================
  if (asistenciaHoy) {
    const isPuntual = asistenciaHoy.estado_ingreso === "PUNTUAL"
    const gradientFrom = isPuntual ? 'from-[#047857]' : 'from-[#991B1B]'
    const gradientTo = isPuntual ? 'to-[#34D399]' : 'to-[#F87171]'
    const statusTextColor = isPuntual ? 'text-emerald-500' : 'text-red-500'
    const statusBorderColor = isPuntual ? 'border-emerald-500' : 'border-red-500'
    const yaMarcoSalida = asistenciaHoy.hora_salida !== null

    let horaIngresoFormateada = "--:--"
    if (asistenciaHoy.hora_ingreso) horaIngresoFormateada = format(new Date(asistenciaHoy.hora_ingreso), 'hh:mm a')

    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        
        {/* BOTONES SUPERIORES */}
        <div className="absolute top-6 right-6 flex gap-3 z-40">
          <button onClick={() => setMostrarLogros(true)} className="text-yellow-400 bg-slate-800/80 p-3 rounded-full hover:bg-slate-700 transition backdrop-blur-md">
            <Trophy size={24} />
          </button>
          <button className="text-white bg-slate-800/80 p-3 rounded-full hover:bg-slate-700 transition backdrop-blur-md">
            <History size={24} />
          </button>
        </div>

        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageChange} className="hidden" />

        <div className="w-full max-w-sm mb-10 relative">
          {/* Brillo Neon Posterior */}
          <div className={`absolute -inset-1 bg-gradient-to-tr ${gradientFrom} via-transparent ${gradientTo} rounded-[26px] blur-xl opacity-70 animate-pulse`} />
          <div className={`absolute -inset-0.5 bg-gradient-to-tr ${gradientFrom} ${gradientTo} rounded-[24px] opacity-100`} />
          
          {/* Tarjeta Negra Principal */}
          <div className="relative bg-[#050505] rounded-[22px] shadow-2xl p-8 flex flex-col items-center z-10">
            <div className="relative mb-6 mt-2">
              <div className={`w-32 h-32 rounded-full border-[3px] ${statusBorderColor} p-1 relative overflow-hidden`}>
                <img src={perfil.foto_url || 'https://via.placeholder.com/150'} alt="Foto" className="w-full h-full rounded-full object-cover" />
                {isUploadingPhoto && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 className="animate-spin text-white" size={32} /></div>}
              </div>
              {!isUploadingPhoto && (
                <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-0 right-0 w-10 h-10 bg-blue-600 rounded-full border-[3px] border-[#050505] flex items-center justify-center text-white hover:bg-blue-500 transition-colors">
                  <Edit2 size={16} />
                </button>
              )}
            </div>
            
            <h2 className="text-white text-[22px] leading-tight font-black text-center">{perfil.nombres}</h2>
            <p className="text-slate-400 text-[15px] mt-1">{perfil.dni}</p>

            <div className="mt-4 bg-slate-900 border border-slate-800 rounded-lg px-4 py-1.5">
              <span className="text-blue-400 text-xs font-bold tracking-widest uppercase">{perfil.area}</span>
            </div>

            <div className="w-full h-px bg-slate-900 my-6" />

            <div className="w-full flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-slate-400 text-xs font-bold mb-1">INGRESO HOY</span>
                <span className="text-white text-2xl font-black tabular-nums">{horaIngresoFormateada}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-slate-400 text-xs font-bold mb-1">ESTADO</span>
                <span className={`${statusTextColor} text-xl font-black`}>{asistenciaHoy.estado_ingreso}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ZONA DE BOTONES DE SALIDA */}
        {yaMarcoSalida ? (
          <div className="text-center">
            <p className="text-slate-400 text-base">Ya marcaste tu salida hoy.</p>
            <p className="text-white text-xl font-bold mt-2">Hasta mañana.</p>
          </div>
        ) : (
          <div className="w-full max-w-sm flex flex-col gap-3">
            <button
              onClick={() => { setIsRemoteExit(false); setMostrarDialogoNota(true); }}
              className="w-full py-4 border border-slate-800 rounded-[16px] flex items-center justify-center text-slate-400 font-semibold"
            >
              <Edit3 size={20} className="mr-2" /> Añadir motivo de salida (Opcional)
            </button>

            {/* UIVERSE MODERN EXIT BUTTON COMPONENT REPLICA PARA REACT */}
            <button 
              disabled={isMarkingExit}
              onClick={handleMarcarSalidaClick}
              className="group relative w-full h-[68px] rounded-[14px] flex items-center justify-center font-sans text-lg font-bold transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95 border-none"
              style={{
                background: 'linear-gradient(#f7f8f7, #e7e7e7) padding-box, linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.45)) border-box',
                boxShadow: '0 0.5px 0.5px 1px rgba(255, 255, 255, 0.2), 0 10px 20px rgba(0, 0, 0, 0.2), 0 4px 5px 0px rgba(0, 0, 0, 0.05)',
                textShadow: '0 1px 1px rgba(0,0,0,0.3)',
                color: 'black'
              }}
            >
              <div className="absolute inset-[2px] rounded-[12px] border border-white opacity-80 pointer-events-none" />
              {isMarkingExit ? (
                <div className="flex items-center text-[#ff5569]">
                  <Loader2 className="animate-spin mr-2" size={24} /> PROCESANDO...
                </div>
              ) : (
                <div className="flex items-center">
                  <LogOut size={26} className="mr-3" /> MARCAR SALIDA
                </div>
              )}
            </button>
          </div>
        )}

        {/* MODAL INTELIGENTE (UIVERSE ADAPTADO PARA REACT) */}
        {mostrarDialogoNota && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-2xl p-5 shadow-2xl relative">
              <h2 className={`text-center text-xl font-bold mb-4 ${isRemoteExit ? 'text-red-600' : 'bg-gradient-to-r from-slate-600 to-slate-800 bg-clip-text text-transparent'}`}>
                {isRemoteExit ? "Salida Remota Detectada" : "Añadir Motivo"}
              </h2>
              
              <textarea 
                className={`w-full bg-slate-50/80 text-slate-700 h-32 placeholder:text-slate-400 border col-span-6 resize-none outline-none rounded-xl p-4 duration-300 focus:ring-2 focus:shadow-inner ${isRemoteExit ? 'border-red-200 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 focus:border-slate-600 focus:ring-slate-200'}`} 
                placeholder={isRemoteExit ? "Obligatorio: Escribe tu ubicación u obra..." : "Ej: Permiso por cita médica..."}
                value={notaTexto}
                onChange={(e) => setNotaTexto(e.target.value)}
              />
              
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button onClick={() => {setMostrarDialogoNota(false); setIsRemoteExit(false)}} className="w-full py-3 rounded-xl font-semibold text-slate-500 hover:bg-slate-100 transition">
                  Cancelar
                </button>
                <button 
                  onClick={handleGuardarNota}
                  disabled={guardandoNota}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 bg-slate-100 border border-slate-200 text-slate-700 font-bold hover:bg-slate-200 active:scale-95 transition-all shadow-sm"
                >
                  {guardandoNota ? <Loader2 className="animate-spin" size={20}/> : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 stroke-slate-700"><path d="M7.4 6.3L15.9 3.5C19.7 2.2 21.8 4.3 20.5 8.1L17.7 16.6C15.8 22.3 12.7 22.3 10.8 16.6L9.9 14.1L7.4 13.2C1.7 11.3 1.7 8.2 7.4 6.3Z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M10.1 13.7L13.7 10.1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      Enviar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM SHEET DE LOGROS */}
        {mostrarLogros && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setMostrarLogros(false)}>
            <div className="w-full max-w-md h-[85vh] bg-slate-900 rounded-t-[32px] p-6 pb-0 flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-6" />
              <div className="flex items-center gap-3 mb-6">
                <Trophy size={40} className="text-yellow-400" />
                <div>
                  <h2 className="text-2xl font-black text-white">Tus Logros</h2>
                  <p className="text-slate-400 font-bold text-sm">{unlockedLogros.length} de {TODOS_LOS_LOGROS.length} desbloqueados</p>
                </div>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full mb-6 overflow-hidden">
                <div className="h-full bg-yellow-400" style={{ width: `${(unlockedLogros.length / TODOS_LOS_LOGROS.length) * 100}%` }} />
              </div>
              <div className="flex-1 overflow-y-auto pb-6 space-y-3 pr-2 scrollbar-hide">
                {TODOS_LOS_LOGROS.map(logro => {
                  const unlocked = unlockedLogros.includes(logro.id);
                  return (
                    <div key={logro.id} className={`flex items-center p-4 rounded-2xl border ${unlocked ? 'bg-slate-800 border-yellow-400/50' : 'bg-slate-950 border-slate-800'}`}>
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center text-3xl shrink-0 ${unlocked ? 'bg-yellow-400/20' : 'bg-slate-800'}`}>
                        {unlocked ? logro.emoji : <Lock size={20} className="text-slate-500" />}
                      </div>
                      <div className={`ml-4 ${unlocked ? 'opacity-100' : 'opacity-50'}`}>
                        <h4 className={`font-black text-lg ${unlocked ? 'text-yellow-400' : 'text-slate-400'}`}>{logro.titulo}</h4>
                        <p className="text-sm text-slate-300 leading-tight">{logro.desc}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* MODAL ANIMADO DE "LOGRO DESBLOQUEADO" A PANTALLA COMPLETA */}
        {achievementToAnimate && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in zoom-in duration-300" onClick={() => setAchievementToAnimate(null)}>
            <div className="flex flex-col items-center p-8 text-center" onClick={e => e.stopPropagation()}>
              <div className="relative w-48 h-48 flex items-center justify-center mb-8">
                <div className="absolute inset-0 bg-yellow-400/30 rounded-full blur-2xl animate-pulse" />
                <span className="text-[120px] relative z-10 animate-bounce">{achievementToAnimate.emoji}</span>
              </div>
              <h3 className="text-yellow-400 font-black tracking-widest uppercase text-sm mb-2">¡LOGRO DESBLOQUEADO!</h3>
              <h1 className="text-4xl font-black text-white mb-4">{achievementToAnimate.titulo}</h1>
              <p className="text-slate-400 text-lg max-w-xs mb-10">{achievementToAnimate.desc}</p>
              <button onClick={() => setAchievementToAnimate(null)} className="bg-yellow-400 text-slate-900 font-black text-lg py-4 px-12 rounded-2xl active:scale-95 transition-transform">
                ¡Genial!
              </button>
            </div>
          </div>
        )}

      </div>
    )
  }

  // ============================================================================================
  // VISTA 1 (UI ESCÁNER) REUTILIZADO
  // ============================================================================================
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full p-6 z-20 flex flex-col items-start bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <IconoQR />
        <h1 className="text-lg font-bold text-white mt-4">Escanea el QR de Ingreso</h1>
        <p className="text-xs text-emerald-400 mt-1">Se verificará tu GPS</p>
      </div>

      <div className="flex-1 relative bg-black flex items-center justify-center">
        {estadoEscaner === 'ESCANEO' && (
          <div className="absolute inset-0 z-10 opacity-80">
            <Scanner onScan={(result) => { if (result && result.length > 0) procesarQR(result[0].rawValue) }} components={{ finder: false }} />
          </div>
        )}

        {estadoEscaner === 'ESCANEO' && (
          <div className="z-20 w-64 h-64 border-4 border-blue-400 rounded-3xl relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_15px_#60A5FA] animate-[scan_2s_linear_infinite_alternate]" />
          </div>
        )}

        {estadoEscaner !== 'ESCANEO' && (
          <div className="z-30 absolute inset-0 flex flex-col items-center justify-center p-6 backdrop-blur-xl bg-slate-950/90">
            {estadoEscaner === 'CARGANDO' && (
              <><Loader2 size={64} className="text-white animate-spin mb-6" /><p className="text-white text-lg font-medium">{mensaje}</p></>
            )}
            {estadoEscaner === 'EXITO' && (
              <div className="flex flex-col items-center animate-[pop_0.5s_ease-out_forwards]">
                <CheckCircle size={100} className="text-emerald-500 mb-6" />
                <h2 className="text-2xl font-black text-white text-center mb-2">¡INGRESO REGISTRADO!</h2>
                <p className="text-emerald-500 font-medium whitespace-pre-line text-center">{mensaje}</p>
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
      
      <style dangerouslySetInnerHTML={{__html: `@keyframes scan { 0% { top: 0%; } 100% { top: 100%; } } @keyframes pop { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }`}} />
    </div>
  )
}

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