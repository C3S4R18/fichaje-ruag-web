'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Scanner } from '@yudiel/react-qr-scanner'
import { createClient } from '@supabase/supabase-js'
import { MapPin, AlertTriangle, CheckCircle, Loader2, User, LogOut, History, Edit2, Edit3, X, Trophy, Lock, Map, Calendar, ChevronLeft, ChevronRight, CheckCircle2, HardHat, Store } from 'lucide-react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale' 

// --- INTERFACES TYPESCRIPT ---
interface Perfil {
  dni: string;
  nombres: string;
  area: string;
  foto_url: string;
}

interface Asistencia {
  id: string;
  fecha?: string;
  hora_ingreso: string;
  estado_ingreso: string;
  hora_salida: string | null;
  notas: string | null;
}

interface LogroItem {
  id: number;
  emoji: string;
  titulo: string;
  desc: string;
  desbloqueado: boolean;
}

// --- CONSTANTES DE LOGROS ---
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

// --- CONFIGURACIÓN SUPABASE ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

// --- CONFIGURACIÓN GEOCERCA (Oficina Principal Miraflores) ---
const OBRA_LAT = -12.114859
const OBRA_LON = -77.026540
const RADIO_PERMITIDO_METROS = 50

// --- UTILIDADES ---
const calcularDistancia = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3 // Radio de la Tierra en metros
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
      reject(new Error("Tu dispositivo no soporta o tiene desactivado el GPS."))
    } else {
      navigator.geolocation.getCurrentPosition(resolve, reject, { 
        enableHighAccuracy: true,
        timeout: 10000, 
        maximumAge: 0 
      })
    }
  })
}

function getInitialsFromName(name: string) {
    if (!name) return '??'
    const words = name.trim().split(' ').filter(w => w.length > 0)
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase()
    return (words[0][0] + words[1][0]).toUpperCase()
}

// --- FUNCIONES EVALUAR LOGROS CORREGIDAS ---

const desbloquearLogro = async (dni: string, logroId: number): Promise<boolean> => {
  try {
    const { data: existente } = await supabase.from('logros_usuarios')
      .select('logro_id')
      .eq('dni', dni)
      .eq('logro_id', logroId)
      .maybeSingle()
      
    if (existente) return false 

    const { error } = await supabase.from('logros_usuarios').insert({ dni, logro_id: logroId })
    return !error 
  } catch { return false }
}

const evaluarLogrosDeIngreso = async (dni: string, horaActual: number, minutoActual: number): Promise<number[]> => {
  const nuevos: number[] = []
  try {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const dayOfWeek = new Date().getDay() 
    
    // Logro 8: Pionero
    const { count } = await supabase.from('registro_asistencias')
      .select('*', { count: 'exact', head: true })
      .eq('fecha', todayStr)
      
    if ((count || 0) <= 10) {
      if (await desbloquearLogro(dni, 8)) nuevos.push(8)
    }

    // Logro 2: Madrugador (Antes 8:30 AM)
    const horaDecimal = horaActual + (minutoActual / 60.0)
    if (horaDecimal <= 8.5) {
      if (await desbloquearLogro(dni, 2)) nuevos.push(2)
    }

    // Logro 9: Héroe de Fin de Semana
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      if (await desbloquearLogro(dni, 9)) nuevos.push(9)
    }

    const { data: historial } = await supabase.from('registro_asistencias')
      .select('fecha, estado_ingreso')
      .eq('dni', dni)
      .order('fecha', { ascending: false })
      .limit(100)
    
    if (historial && historial.length > 0) {
        // Logro 1: Reloj Suizo (5 días puntuales seguidos)
        if (historial.length >= 5 && historial.slice(0, 5).every(a => a.estado_ingreso === 'PUNTUAL')) {
          if (await desbloquearLogro(dni, 1)) nuevos.push(1)
        }

        // Logro 4: Imparable (30 días seguidos de racha)
        if (historial.length >= 30) {
            let rachaConsecutiva = 1;
            for (let i = 0; i < historial.length - 1; i++) {
                const fechaActual = parseISO(historial[i].fecha);
                const fechaAnterior = parseISO(historial[i+1].fecha);
                if (differenceInDays(fechaActual, fechaAnterior) === 1) {
                    rachaConsecutiva++;
                    if (rachaConsecutiva >= 30) break;
                } else {
                    break;
                }
            }
            if (rachaConsecutiva >= 30) {
                if (await desbloquearLogro(dni, 4)) nuevos.push(4)
            }
        }

        // Logro 10: Invencible (100 días puntuales)
        if (historial.length === 100 && historial.every(a => a.estado_ingreso === 'PUNTUAL')) {
             if (await desbloquearLogro(dni, 10)) nuevos.push(10)
        }
    }

  } catch (e) { console.error("Error logros ingreso:", e) }
  return nuevos
}

const evaluarLogrosDeSalida = async (dni: string): Promise<number[]> => {
    const nuevos: number[] = []
    try {
        const horaActual = new Date().getHours()
        // Logro 6: Noctámbulo (Después de las 7:00 PM)
        if (horaActual >= 19) {
            if (await desbloquearLogro(dni, 6)) nuevos.push(6)
        }
    } catch (e) { console.error("Error logros salida:", e) }
    return nuevos;
}

const evaluarLogrosDeNotas = async (dni: string): Promise<number[]> => {
    const nuevos: number[] = []
    try {
        // Logro 5: Comunicador (3 notas registradas)
        const { count, error } = await supabase.from('registro_asistencias')
            .select('*', { count: 'exact', head: true })
            .eq('dni', dni)
            .not('notas', 'is', null)

        if (!error && count && count >= 3) {
             if (await desbloquearLogro(dni, 5)) nuevos.push(5)
        }
    } catch(e) { console.error("Error logros notas:", e)}
    return nuevos;
}


export default function EscanerIOS() {
  const router = useRouter()
  
  // Tiempo de inicio para Logro 7 (Flash)
  const startTimeRef = useRef<number>(Date.now());

  // Estados Globales de Datos
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [asistenciaHoy, setAsistenciaHoy] = useState<Asistencia | null>(null)
  const [unlockedLogros, setUnlockedLogros] = useState<number[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Estados de Interfaz de Usuario (UI)
  const [estadoEscaner, setEstadoEscaner] = useState<'ESCANEO' | 'CARGANDO' | 'EXITO' | 'ERROR'>('ESCANEO')
  const [mensaje, setMensaje] = useState('')
  const [isMarkingExit, setIsMarkingExit] = useState(false)
  const [mostrarLogros, setMostrarLogros] = useState(false)
  const [achievementToAnimate, setAchievementToAnimate] = useState<LogroItem | null>(null)

  // Estados Notas y Marcación Externa
  const [mostrarDialogoNota, setMostrarDialogoNota] = useState(false)
  const [notaTexto, setNotaTexto] = useState('')
  const [guardandoNota, setGuardandoNota] = useState(false)
  const [isRemoteExit, setIsRemoteExit] = useState(false)
  const [currentLatLon, setCurrentLatLon] = useState('')

  // Modales de ingresos manuales
  const [mostrarModalIngresoObra, setMostrarModalIngresoObra] = useState(false)
  const [mostrarModalExterno, setMostrarModalExterno] = useState(false)
  
  // Estado Calendario (Historial)
  const [mostrarCalendario, setMostrarCalendario] = useState(false)
  const [historialMes, setHistorialMes] = useState<Asistencia[]>([])
  const [targetDate, setTargetDate] = useState(new Date())
  const [selectedDayInfo, setSelectedDayInfo] = useState<Asistencia | null>(null)
  const [loadingCalendar, setLoadingCalendar] = useState(false)

  // Estado Actualización de Foto
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reiniciar temporizador Flash al montar componente
  useEffect(() => {
      startTimeRef.current = Date.now();
  }, [])

  // 1. CARGA INICIAL DE DATOS Y SESIÓN
  useEffect(() => {
    const cargarDatos = async () => {
      const dni = localStorage.getItem('RUAG_DNI')
      const nombres = localStorage.getItem('RUAG_NOMBRE')

      if (!dni || !nombres) {
        router.push('/setup') // Redirigir si no hay registro previo
        return
      }

      let perfilCargado: Perfil | null = null
      const area = localStorage.getItem('RUAG_AREA')
      const foto = localStorage.getItem('RUAG_FOTO')

      // Intentar cargar perfil completo desde caché, si no, desde BD
      if(!area || !foto) {
        const { data } = await supabase.from('fotocheck_perfiles').select('*').eq('dni', dni).single()
        if(data) {
           localStorage.setItem('RUAG_AREA', data.area)
           localStorage.setItem('RUAG_FOTO', data.foto_url || '')
           perfilCargado = { dni: data.dni, nombres: data.nombres_completos, area: data.area, foto_url: data.foto_url || '' }
        } else {
            // Fallback si no está en fotocheck_perfiles aún
            perfilCargado = { dni, nombres, area: area || 'Asignando...', foto_url: '' }
        }
      } else {
        perfilCargado = { dni, nombres, area, foto_url: foto }
      }

      if(perfilCargado) {
        setPerfil(perfilCargado)
        try {
          const hoyStr = format(new Date(), 'yyyy-MM-dd')
          // Cargar asistencia de hoy
          const { data: astData } = await supabase.from('registro_asistencias')
            .select('id, hora_ingreso, estado_ingreso, hora_salida, notas')
            .eq('dni', perfilCargado.dni).eq('fecha', hoyStr).order('hora_ingreso', { ascending: false }).limit(1).single()

          if (astData) setAsistenciaHoy(astData as Asistencia)

          // Cargar logros desbloqueados
          const { data: logData } = await supabase.from('logros_usuarios').select('logro_id').eq('dni', perfilCargado.dni)
          if (logData) setUnlockedLogros(logData.map(l => l.logro_id))
        } catch (e) { console.error("Error carga datos secundarios:", e) } 
      }
      setIsLoading(false)
    }
    cargarDatos()
  }, [router])

  // --- CARGAR HISTORIAL PARA CALENDARIO ---
  useEffect(() => {
    if (mostrarCalendario && perfil) {
      const fetchHistorial = async () => {
        setLoadingCalendar(true)
        const { data } = await supabase.from('registro_asistencias')
          .select('*')
          .eq('dni', perfil.dni)
          .order('fecha', { ascending: false })
        if (data) setHistorialMes(data as Asistencia[])
        setLoadingCalendar(false)
      }
      fetchHistorial()
    }
  }, [mostrarCalendario, perfil])

  // --- PROCESAR QR (Marcación en Oficina) ---
  const procesarQR = async (textoQR: string) => {
    if (estadoEscaner !== 'ESCANEO' || !perfil) return
    
    const tiempoEscaneo = Date.now();
    const tiempoTranscurridoSecs = (tiempoEscaneo - startTimeRef.current) / 1000;

    // Validación básica del formato del QR
    if (!textoQR.startsWith("RUAG_INGRESO_")) {
        mostrarError("Código QR no válido para asistencia.")
        return
    }

    const partes = textoQR.split("_")
    if (partes.length !== 3) return
    
    // Validación de expiración del QR (Anti-fraude por foto)
    const tiempoQR = parseInt(partes[2])
    const tiempoActual = Math.floor(Date.now() / 10000) // Bloques de 10 seg

    if (Math.abs(tiempoActual - tiempoQR) > 1) { // Tolerancia de 1 bloque
        mostrarError("El código QR ha expirado.\nUsa el código actual de la pantalla.")
        return
    }

    setEstadoEscaner('CARGANDO')
    setMensaje('Verificando tu ubicación GPS...')

    try {
      const position = await obtenerUbicacion()
      const distancia = calcularDistancia(position.coords.latitude, position.coords.longitude, OBRA_LAT, OBRA_LON)

      // Verificación de Geocerca (50 metros)
      if (distancia > RADIO_PERMITIDO_METROS) {
        mostrarError(`ESTÁS FUERA DE RANGO\nDistancia a oficina: ${Math.round(distancia)} metros.`)
        return
      }

      // Cálculo de puntualidad
      const horaActual = new Date().getHours()
      const minutoActual = new Date().getMinutes()
      // Tolerancia: Antes de las 9:05 AM
      const isPuntual = horaActual < 9 || (horaActual === 9 && minutoActual <= 5)
      const estado = isPuntual ? 'PUNTUAL' : 'TARDANZA'
      const hoyStr = format(new Date(), 'yyyy-MM-dd')

      // Registro en Supabase
      const { data, error } = await supabase.from('registro_asistencias').insert({
        dni: perfil.dni, nombres_completos: perfil.nombres, area: perfil.area,
        foto_url: perfil.foto_url, estado_ingreso: estado, fecha: hoyStr 
      }).select().single()

      if (error) throw error

      setAsistenciaHoy(data as Asistencia)
      
      // Evaluación de logros post-ingreso
      const nuevosLogros = await evaluarLogrosDeIngreso(perfil.dni, horaActual, minutoActual)
      
      // Logro 7: Flash (Menos de 5 segundos)
      if (tiempoTranscurridoSecs <= 5) {
          if (await desbloquearLogro(perfil.dni, 7)) nuevosLogros.push(7);
      }

      mostrarExito("¡INGRESO REGISTRADO!\nUbicación confirmada")
      
      // Manejo de animaciones de nuevos logros
      if (nuevosLogros.length > 0) {
        setUnlockedLogros(prev => [...prev, ...nuevosLogros])
        setTimeout(() => {
          const logroObj = TODOS_LOS_LOGROS.find(l => l.id === nuevosLogros[0])
          if (logroObj) setAchievementToAnimate(logroObj)
        }, 2500) // Esperar a que termine la animación de éxito
      }

    } catch (error: any) {
       console.error("Error en marcación QR:", error);
       const errorStr = error.message || ''
       if (error.code === 1) mostrarError("Se requiere permiso de GPS para registrar asistencia.")
       else if (errorStr.includes('duplicate key') || errorStr.includes('unique constraint')) {
           mostrarExito("¡INGRESO YA REGISTRADO!") // Manejar re-escaneos accidentales
       } else mostrarError(`Error crítico: ${error.message}`)
    }
  }

  // --- FUNCIÓN GENÉRICA PARA REGISTRO EXTERNO (OBRA/HOSPITAL) ---
  const procesarAsistenciaRemota = async (tipo: 'obra' | 'externo', prefijoNota: string) => {
    if (notaTexto.trim() === '') {
      alert("Por favor, ingresa el nombre o referencia del lugar.")
      return
    }
    if (!perfil) return

    setGuardandoNota(true)
    try {
      const position = await obtenerUbicacion()
      const lat = position.coords.latitude
      const lon = position.coords.longitude
      const distancia = calcularDistancia(lat, lon, OBRA_LAT, OBRA_LON)

      // Anti-trampa: Si es OBRA y está en la oficina, debe usar QR obligatoriamente
      if (tipo === 'obra' && distancia <= RADIO_PERMITIDO_METROS) {
        alert("Detectamos que estás en la oficina. Por favor escanea el código QR de la pantalla.")
        setGuardandoNota(false)
        setMostrarModalIngresoObra(false)
        return
      }

      const horaActual = new Date().getHours()
      const minutoActual = new Date().getMinutes()
      
      // Lógica de horarios corregida
      const isPuntual = tipo === 'obra' 
        ? (horaActual < 7 || (horaActual === 7 && minutoActual <= 35)) // 7:35 AM Tolerancia Obra
        : (horaActual < 9 || (horaActual === 9 && minutoActual <= 5)); // 9:05 AM Tolerancia Normal
      
      const estado = isPuntual ? 'PUNTUAL' : 'TARDANZA'
      
      const hoyStr = format(new Date(), 'yyyy-MM-dd')
      // Empaquetar info GPS en la columna notas (Formato estándar RUAG)
      const notaConGps = `${prefijoNota}: ${notaTexto.trim()} [GPS: ${lat}, ${lon}]`

      const { data, error } = await supabase.from('registro_asistencias').insert({
        dni: perfil.dni, nombres_completos: perfil.nombres, area: perfil.area,
        foto_url: perfil.foto_url, estado_ingreso: estado, fecha: hoyStr, notas: notaConGps 
      }).select().single()

      if (error) throw error

      setAsistenciaHoy(data as Asistencia)
      setMostrarModalIngresoObra(false)
      setMostrarModalExterno(false)
      setNotaTexto('')
      
      const nuevosLogros = await evaluarLogrosDeIngreso(perfil.dni, horaActual, minutoActual)
      mostrarExito(tipo === 'obra' ? "¡INGRESO EN OBRA REGISTRADO!" : "¡INGRESO EXTERNO REGISTRADO!")
      
      if (nuevosLogros.length > 0) {
        setUnlockedLogros(prev => [...prev, ...nuevosLogros])
        setTimeout(() => {
          const logroObj = TODOS_LOS_LOGROS.find(l => l.id === nuevosLogros[0])
          if (logroObj) setAchievementToAnimate(logroObj)
        }, 2500)
      }
    } catch (error: any) {
       if (error.code === 1) alert("Activa el GPS de tu iPhone para marcar entrada externa.")
       else if (error.message && error.message.includes('duplicate')) {
           mostrarExito("¡INGRESO REGISTRADO PREVIAMENTE!")
           setMostrarModalIngresoObra(false)
           setMostrarModalExterno(false)
       }
       else alert(`Error en marcación externa: ${error.message}`)
    } finally {
      setGuardandoNota(false)
    }
  }

  // --- PROCESAR SALIDA (Oficina o Detección Externa) ---
  const handleMarcarSalidaClick = async () => {
    if (!asistenciaHoy || isMarkingExit || !perfil) return
    setIsMarkingExit(true)

    try {
      const position = await obtenerUbicacion()
      const lat = position.coords.latitude
      const lon = position.coords.longitude
      const distancia = calcularDistancia(lat, lon, OBRA_LAT, OBRA_LON)

      // Si está fuera de oficina, forzar "Salida Remota" con nota obligatoria
      if (distancia > RADIO_PERMITIDO_METROS) {
        setCurrentLatLon(`${lat}, ${lon}`)
        setIsRemoteExit(true)
        setMostrarDialogoNota(true) // Abrir modal de nota
        setIsMarkingExit(false)
        return
      }

      // Salida normal en oficina
      const horaSalidaISO = new Date().toISOString()
      const { error } = await supabase.from('registro_asistencias').update({ hora_salida: horaSalidaISO }).eq('id', asistenciaHoy.id)
      if (error) throw error

      setAsistenciaHoy({ ...asistenciaHoy, hora_salida: horaSalidaISO })
      
      const nuevosLogros = await evaluarLogrosDeSalida(perfil.dni);
      
      alert("¡Salida registrada exitosamente!")

      if (nuevosLogros.length > 0) {
        setUnlockedLogros(prev => [...prev, ...nuevosLogros])
        const logroObj = TODOS_LOS_LOGROS.find(l => l.id === nuevosLogros[0])
        if (logroObj) setTimeout(() => setAchievementToAnimate(logroObj), 500)
      }

    } catch (error: any) {
      if (error.code === 1) alert("Se requiere GPS activado para marcar salida.")
      else alert(`Error en salida: ${error.message}`)
    } finally {
      setIsMarkingExit(false)
    }
  }

  // --- GUARDAR NOTA (Motivo opcional o Salida Remota obligatoria) ---
  const handleGuardarNota = async () => {
    if (notaTexto.trim() === '') {
      alert(isRemoteExit ? "Por favor, indica tu ubicación actual u obra." : "Escribe el motivo de la nota.")
      return
    }
    if (!asistenciaHoy || !perfil) return

    setGuardandoNota(true)
    try {
      let nuevaAsistenciaData = { ...asistenciaHoy }

      if (isRemoteExit) {
        // Lógica Salida Remota: Guardar Nota + GPS + Hora Salida
        const notaNueva = `Salida Externa: ${notaTexto.trim()} [GPS: ${currentLatLon}]`
        // Concatenar si ya existen notas previas
        const notaFinal = asistenciaHoy.notas ? `${asistenciaHoy.notas}\n${notaNueva}` : notaNueva
        const horaSalidaISO = new Date().toISOString()
        
        await supabase.from('registro_asistencias').update({ notas: notaFinal, hora_salida: horaSalidaISO }).eq('id', asistenciaHoy.id)
        
        nuevaAsistenciaData = { ...asistenciaHoy, hora_salida: horaSalidaISO, notas: notaFinal }
        setAsistenciaHoy(nuevaAsistenciaData)
        alert("¡Salida remota registrada exitosamente!")
        
        // Evaluar logro noctámbulo
        const logrosSalida = await evaluarLogrosDeSalida(perfil.dni);
        if (logrosSalida.length > 0) {
             setUnlockedLogros(prev => [...prev, ...logrosSalida])
             const logroObj = TODOS_LOS_LOGROS.find(l => l.id === logrosSalida[0])
             if (logroObj) setTimeout(() => setAchievementToAnimate(logroObj), 500)
        }

      } else {
        // Lógica Nota Normal (Durante el día o antes de salir)
        const notaFinal = asistenciaHoy.notas ? `${asistenciaHoy.notas}\n${notaTexto}` : notaTexto
        await supabase.from('registro_asistencias').update({ notas: notaFinal }).eq('id', asistenciaHoy.id)
        
        nuevaAsistenciaData = { ...asistenciaHoy, notas: notaFinal }
        setAsistenciaHoy(nuevaAsistenciaData)
        alert("¡Nota guardada correctamente!")
      }

      setMostrarDialogoNota(false)
      setNotaTexto('')

      // Evaluar logro Comunicador (3 notas)
      const nuevosLogrosNotas = await evaluarLogrosDeNotas(perfil.dni);
      if (nuevosLogrosNotas.length > 0 && !isRemoteExit) { // No solapar modales si es salida remota
          setUnlockedLogros(prev => [...prev, ...nuevosLogrosNotas])
          const logroObj = TODOS_LOS_LOGROS.find(l => l.id === nuevosLogrosNotas[0])
          if (logroObj) setTimeout(() => setAchievementToAnimate(logroObj), 500)
      }

    } catch (error: any) {
      alert(`Error al guardar nota: ${error.message}`)
    } finally {
      setGuardandoNota(false)
      setIsRemoteExit(false)
    }
  }

  // --- ACTUALIZAR FOTO DE PERFIL (Desde Fotocheck) ---
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !perfil || !asistenciaHoy) return

    setIsUploadingPhoto(true)
    try {
      // 1. Subir imagen a Storage
      const fileExt = file.name.split('.').pop()
      const fileName = `${perfil.dni}_${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage.from('fotos_perfil').upload(fileName, file, { upsert: true })
      if (uploadError) throw uploadError

      // 2. Obtener URL pública
      const { data: publicUrlData } = supabase.storage.from('fotos_perfil').getPublicUrl(fileName)
      const nuevaFotoUrl = publicUrlData.publicUrl

      // 3. Actualizar URL en Perfil y Asistencia de hoy (BD)
      await supabase.from('fotocheck_perfiles').update({ foto_url: nuevaFotoUrl }).eq('dni', perfil.dni)
      await supabase.from('registro_asistencias').update({ foto_url: nuevaFotoUrl }).eq('id', asistenciaHoy.id)

      // 4. Actualizar Estado Local y Caché
      localStorage.setItem('RUAG_FOTO', nuevaFotoUrl)
      setPerfil({ ...perfil, foto_url: nuevaFotoUrl })

      // Logro 3: Cámara Lista
      const seDesbloqueo = await desbloquearLogro(perfil.dni, 3)
      alert("¡Foto de perfil actualizada correctamente!")

      if (seDesbloqueo) {
        setUnlockedLogros(prev => [...prev, 3]) 
        const logroObj = TODOS_LOS_LOGROS.find(l => l.id === 3)
        if (logroObj) setTimeout(() => setAchievementToAnimate(logroObj), 500)
      }

    } catch (error: any) {
      alert(`Error al actualizar foto: ${error.message}`)
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  // --- RENDERIZADO DEL CALENDARIO (Lógica portadada de Android) ---
  const renderCalendarGrid = () => {
    const year = targetDate.getFullYear()
    const month = targetDate.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const firstDay = new Date(year, month, 1).getDay()
    // Ajuste lunes inicio semana
    const startingBlanks = firstDay === 0 ? 6 : firstDay - 1 

    const blanks = Array.from({ length: startingBlanks })
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

    return (
      <div className="grid grid-cols-7 gap-2 mt-4">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(day => (
          <div key={day} className="text-slate-400 font-black text-sm text-center pb-2">{day}</div>
        ))}
        {blanks.map((_, i) => <div key={`blank-${i}`} className="h-10" />)}
        
        {days.map(day => {
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const entryForDay = historialMes.find(e => e.fecha === dateStr)
          
          const isPuntual = entryForDay?.estado_ingreso === 'PUNTUAL'
          const isTardanza = entryForDay?.estado_ingreso === 'TARDANZA'

          let bgClass = "bg-slate-950 border-slate-800 text-slate-400"
          if (isPuntual) bgClass = "bg-emerald-500/15 border-emerald-500/60 text-emerald-500 font-bold"
          if (isTardanza) bgClass = "bg-red-500/15 border-red-500/60 text-red-500 font-bold"

          return (
            <button
              key={day}
              disabled={!entryForDay}
              onClick={() => entryForDay && setSelectedDayInfo(entryForDay)}
              className={`aspect-square rounded-xl border flex items-center justify-center transition-all ${bgClass} ${entryForDay ? 'cursor-pointer hover:scale-105 hover:shadow-lg active:scale-95' : 'cursor-default opacity-50'}`}
            >
              {day}
            </button>
          )
        })}
      </div>
    )
  }

  // Mensajes flotantes temporales (Estilo Android toasts)
  const mostrarError = (msg: string) => { setMensaje(msg); setEstadoEscaner('ERROR'); setTimeout(() => setEstadoEscaner('ESCANEO'), 4000) }
  const mostrarExito = (msg: string) => { setMensaje(msg); setEstadoEscaner('EXITO') }

  // Pantalla de carga inicial
  if (isLoading || !perfil) {
    return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6"><Loader2 className="animate-spin text-blue-600 mb-6" size={56} strokeWidth={1.5} /><p className="text-white font-medium text-lg animate-pulse">Sincronizando RUAG...</p></div>
  }

  return (
    // Diseño Base (Idéntico a Android, optimizado para SafeArea de iPhone)
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] relative overflow-hidden font-sans antialiased text-slate-100">
      
      {/* ========================================================================= */}
      {/* VISTA 1: MODO ESCÁNER QR (Antes de Marcar Ingreso) */}
      {/* ========================================================================= */}
      {!asistenciaHoy && (
        <>
          {/* Header Superior (UI portade de Android) */}
          <div className="absolute top-0 left-0 w-full p-6 z-20 flex flex-col items-start bg-gradient-to-b from-black/90 to-transparent pointer-events-none pt-[calc(env(safe-area-inset-top)+24px)]">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-90">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M7 7h.01M18 7h.01M7 18h.01M18 18h.01" strokeWidth="2"/>
            </svg>
            <h1 className="text-2xl font-extrabold text-white mt-5 tracking-tight">Escanea Código QR</h1>
            <p className="text-sm text-emerald-400 mt-1.5 font-semibold bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">Se validará tu ubicación GPS</p>
          </div>

          {/* Botón Historial (UI Glassmorphism portade de Android) */}
          <button onClick={() => setMostrarCalendario(true)} className="absolute top-[calc(env(safe-area-inset-top)+24px)] right-6 text-white bg-slate-800/60 p-3.5 rounded-full hover:bg-slate-700 active:scale-95 transition z-40 backdrop-blur-lg border border-slate-700 shadow-xl">
            <History size={24} />
          </button>

          {/* Área de Cámara / Estados (Lógica iOS, Estilo Android) */}
          <div className="flex-1 w-full relative bg-black flex items-center justify-center overflow-hidden rounded-[32px] my-4 shadow-inner border border-slate-900">
            {estadoEscaner === 'ESCANEO' && !mostrarModalIngresoObra && (
              <div className="absolute inset-0 z-10 opacity-90 pointer-events-none transform scale-105">
                <Scanner 
                    onScan={(result) => { if (result && result.length > 0) procesarQR(result[0].rawValue) }} 
                    components={{ finder: false }} 
                    styles={{ container: { width: '100%', height: '100%' }, video: { width: '100%', height: '100%', objectFit: 'cover' } }}
                />
              </div>
            )}

            {/* Visor QR Animado (Idéntico a Android) */}
            {estadoEscaner === 'ESCANEO' && !mostrarModalIngresoObra && (
              <div className="z-20 w-72 h-72 border-[3px] border-dashed border-blue-400/70 rounded-[32px] relative overflow-hidden pointer-events-none flex items-center justify-center shadow-[0_0_60px_-10px_rgba(59,130,246,0.3)]">
                <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_20px_4px_#60A5FA] animate-[scan_2.5s_ease-in-out_infinite]" />
                <div className="w-16 h-16 border-l-4 border-t-4 border-blue-400 rounded-tl-lg absolute top-6 left-6"/>
                <div className="w-16 h-16 border-r-4 border-t-4 border-blue-400 rounded-tr-lg absolute top-6 right-6"/>
                <div className="w-16 h-16 border-l-4 border-b-4 border-blue-400 rounded-bl-lg absolute bottom-6 left-6"/>
                <div className="w-16 h-16 border-r-4 border-b-4 border-blue-400 rounded-br-lg absolute bottom-6 right-6"/>
              </div>
            )}

            {/* Superposición de Estados (Glassmorphism portado de Android) */}
            {estadoEscaner !== 'ESCANEO' && (
              <div className="z-30 absolute inset-0 flex flex-col items-center justify-center p-8 backdrop-blur-2xl bg-slate-950/90 animate-in fade-in duration-300">
                {estadoEscaner === 'CARGANDO' && (
                  <><Loader2 size={72} strokeWidth={1} className="text-white animate-spin mb-8" /><p className="text-white text-xl font-semibold text-center leading-relaxed whitespace-pre-line bg-slate-800/50 px-6 py-3 rounded-2xl border border-slate-700">{mensaje}</p></>
                )}
                {estadoEscaner === 'EXITO' && (
                  <div className="flex flex-col items-center animate-in zoom-in duration-500">
                    <div className="relative mb-8">
                        <div className="absolute inset-0 bg-emerald-500 rounded-full blur-2xl opacity-40 animate-pulse"/>
                        <CheckCircle size={120} strokeWidth={1} className="text-emerald-500 relative z-10" />
                    </div>
                    <h2 className="text-3xl font-extrabold text-white text-center mb-3 tracking-tight">¡INGRESO EXITOSO!</h2>
                    <p className="text-emerald-400 font-bold text-lg whitespace-pre-line text-center bg-emerald-500/10 px-6 py-3 rounded-2xl border border-emerald-500/20">{mensaje}</p>
                  </div>
                )}
                {estadoEscaner === 'ERROR' && (
                  <div className="flex flex-col items-center animate-in shake duration-500">
                    <AlertTriangle size={100} strokeWidth={1} className="text-red-500 mb-8" />
                    <h2 className="text-3xl font-extrabold text-white text-center mb-4 tracking-tight">ERROR DE ACCESO</h2>
                    <p className="text-red-400 text-center font-semibold text-lg whitespace-pre-line bg-red-500/10 px-6 py-3 rounded-2xl border border-red-500/20 shadow-inner">{mensaje}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Botones Inferiores Externos (UI Glassmorphism portade de Android) */}
          {estadoEscaner === 'ESCANEO' && !mostrarModalIngresoObra && !mostrarModalExterno && (
            <div className="absolute bottom-6 left-0 right-0 px-6 z-20 pb-[env(safe-area-inset-bottom)] flex flex-col gap-3">
              <p className="text-slate-400 text-xs font-bold text-center w-full shadow-sm drop-shadow-md">¿No estás en la oficina principal?</p>
              <div className="flex gap-3 w-full">
                  <button 
                    onClick={() => { setNotaTexto(''); setMostrarModalIngresoObra(true); }}
                    className="flex-1 flex flex-col items-center justify-center py-3 bg-blue-600/20 backdrop-blur-md border border-blue-500/30 rounded-2xl text-blue-400 font-bold transition hover:bg-blue-600/30 active:scale-95 shadow-xl"
                  >
                    <HardHat className="mb-1" size={24} />
                    Obra
                  </button>
                  <button 
                    onClick={() => { setNotaTexto(''); setMostrarModalExterno(true); }}
                    className="flex-1 flex flex-col items-center justify-center py-3 bg-purple-600/20 backdrop-blur-md border border-purple-500/30 rounded-2xl text-purple-400 font-bold transition hover:bg-purple-600/30 active:scale-95 shadow-xl"
                  >
                    <Store className="mb-1" size={24} />
                    Externo
                  </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: EL FOTOCHECK DIGITAL (Después de Marcar Ingreso) */}
      {/* ========================================================================= */}
      {asistenciaHoy && (
        <>
          {/* Header Superior (Botones Trofeos e Historial idénticos a Android) */}
          <div className="absolute top-[calc(env(safe-area-inset-top)+24px)] right-6 flex gap-4 z-40">
            <button onClick={() => setMostrarLogros(true)} className="text-yellow-400 bg-slate-800/60 p-3.5 rounded-full hover:bg-slate-700 active:scale-95 transition backdrop-blur-lg border border-slate-700 shadow-xl">
              <Trophy size={24} />
            </button>
            <button onClick={() => setMostrarCalendario(true)} className="text-white bg-slate-800/60 p-3.5 rounded-full hover:bg-slate-700 active:scale-95 transition backdrop-blur-lg border border-slate-700 shadow-xl">
              <History size={24} />
            </button>
          </div>

          {/* Input oculto para subir foto */}
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageChange} className="hidden" />

          {/* TARJETA FOTOCHECK DIGITAL (Rediseño Premium Glassmorphism portado de Android) */}
          <div className="w-full max-w-sm mb-12 relative mt-20 transform transition-all duration-500 animate-in fade-in slide-in-from-bottom-10">
            {/* Brillo de fondo dinámico (Puntual=Verde, Tardanza=Rojo) */}
            <div className={`absolute -inset-2 bg-gradient-to-tr ${asistenciaHoy.estado_ingreso === 'PUNTUAL' ? 'from-[#047857] via-transparent to-[#34D399]' : 'from-[#991B1B] via-transparent to-[#F87171]'} rounded-[32px] blur-2xl opacity-60 animate-pulse`} />
            
            {/* Borde dinámico con degradado */}
            <div className={`absolute -inset-0.5 bg-gradient-to-tr ${asistenciaHoy.estado_ingreso === 'PUNTUAL' ? 'from-[#047857] via-slate-800 to-[#34D399]' : 'from-[#991B1B] via-slate-800 to-[#F87171]'} rounded-[30px] opacity-100 shadow-2xl`} />
            
            {/* Cuerpo de la tarjeta (Glassmorphism oscuro) */}
            <div className="relative bg-[#080a10]/95 backdrop-blur-xl rounded-[28px] p-9 flex flex-col items-center z-10 overflow-hidden border border-white/5">
              {/* Marca de agua de fondo */}
              <ShieldCheckIcon className="absolute -bottom-10 -right-10 text-slate-900 opacity-30 w-48 h-48 pointer-events-none"/>
              
              {/* Área de Foto (UI portade de Android) */}
              <div className="relative mb-7 mt-3 flex justify-center items-center">
                 {/* Anillo de estado dinámico */}
                 <div className={`absolute inset-0 rounded-full blur-md opacity-70 ${asistenciaHoy.estado_ingreso === 'PUNTUAL' ? 'bg-emerald-500' : 'bg-red-500'}`}/>
                
                <div className={`w-36 h-36 rounded-full border-[5px] ${asistenciaHoy.estado_ingreso === 'PUNTUAL' ? 'border-emerald-500' : 'border-red-500'} p-1 relative overflow-hidden bg-slate-900 shadow-xl z-10`}>
                  {perfil.foto_url ? (
                    <img src={perfil.foto_url} alt="Foto Perfil" className="w-full h-full rounded-full object-cover transition-opacity duration-300" />
                  ) : (
                    <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center text-slate-500 font-black text-4xl">
                        {getInitialsFromName(perfil.nombres)}
                    </div>
                  )}
                  {/* Loader de subida */}
                  {isUploadingPhoto && <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20 rounded-full"><Loader2 className="animate-spin text-white" size={40} strokeWidth={1.5} /></div>}
                </div>
                
                {/* Botón editar foto */}
                {!isUploadingPhoto && (
                  <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-1 right-1 w-11 h-11 bg-blue-600 rounded-full border-4 border-[#080a10] flex items-center justify-center text-white hover:bg-blue-500 active:scale-95 transition-all shadow-lg z-20">
                    <Edit2 size={18} />
                  </button>
                )}
              </div>
              
              {/* Info Personal (Estilo Android) */}
              <h2 className="text-white text-2xl font-black text-center leading-tight tracking-tight uppercase relative z-10">{perfil.nombres}</h2>
              <p className="text-slate-400 text-base mt-1.5 font-mono tracking-wider relative z-10">{perfil.dni}</p>

              {/* Badge de Área (UI Glassmorphism portade de Android) */}
              <div className="mt-5 bg-blue-600/10 border border-blue-500/20 rounded-full px-5 py-2 relative z-10">
                <span className="text-blue-400 text-xs font-black tracking-[0.15em] uppercase">{perfil.area}</span>
              </div>

              {/* Divisor Moderno */}
              <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-800 to-transparent my-8 relative z-10" />

              {/* Info Asistencia (Idéntico a Android) */}
              <div className="w-full flex justify-between items-center relative z-10 gap-4">
                <div className="flex flex-col flex-1">
                  <span className="text-slate-400 text-xs font-bold tracking-widest mb-1.5 uppercase">INGRESO HOY</span>
                  <div className="flex items-end gap-1.5">
                    <ClockIcon color="#94a3b8" />
                    <span className="text-white text-2xl font-black tabular-nums leading-none">{asistenciaHoy.hora_ingreso ? format(new Date(asistenciaHoy.hora_ingreso), 'hh:mm a') : '--:--'}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end flex-1">
                  <span className="text-slate-400 text-xs font-bold tracking-widest mb-1.5 uppercase">ESTADO</span>
                  <div className={`px-4 py-1.5 rounded-lg text-sm font-black tracking-wider ${asistenciaHoy.estado_ingreso === 'PUNTUAL' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                    {asistenciaHoy.estado_ingreso}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ÁREA DE ACCIONES INFERIORES (Estilo Android) */}
          {asistenciaHoy.hora_salida !== null ? (
            // Estado: Jornada Finalizada
            <div className="text-center bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-3xl p-8 shadow-xl animate-in fade-in">
              <CheckCircle2 size={56} className="text-emerald-500 mx-auto mb-4" strokeWidth={1.5} />
              <p className="text-slate-300 text-lg font-semibold">Ya registraste tu salida.</p>
              <p className="text-white text-2xl font-extrabold mt-2 tracking-tight">¡Buen descanso!</p>
            </div>
          ) : (
            // Estado: Trabajando (Acciones disponibles)
            <div className="w-full max-w-sm flex flex-col gap-4 pb-[env(safe-area-inset-bottom)]">
              {/* Botón Añadir Nota (UI Glassmorphism portade de Android) */}
              <button onClick={() => { setIsRemoteExit(false); setNotaTexto(''); setMostrarDialogoNota(true); }} className="w-full py-4.5 border border-slate-800 rounded-2xl flex items-center justify-center text-slate-400 font-bold hover:bg-slate-900 hover:text-white active:scale-95 transition-all backdrop-blur-sm bg-slate-950/50">
                <Edit3 size={20} className="mr-2.5 text-blue-400" /> Añadir nota o permiso <span className="text-slate-600 ml-1.5 font-medium">(Opcional)</span>
              </button>

              {/* BOTÓN MARCAR SALIDA (UI PREMIUM "iOS-Style" portade de Android) */}
              <button 
                disabled={isMarkingExit}
                onClick={handleMarcarSalidaClick}
                className="group relative w-full h-[72px] rounded-2xl flex items-center justify-center transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.03] active:scale-95 border-none shadow-[0_15px_40px_-10px_rgba(0,0,0,0.4)] overflow-hidden"
                style={{ 
                    background: 'linear-gradient(#f7f8f7, #e3e3e3) padding-box, linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.3)) border-box', 
                    boxShadow: '0 1px 1px 0px rgba(255, 255, 255, 0.5) inset, 0 10px 20px 0px rgba(0, 0, 0, 0.2), 0 2px 4px 0px rgba(0, 0, 0, 0.1)',
                    color: '#111' 
                }}
              >
                {/* Efecto de brillo interior */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"/>
                
                {isMarkingExit ? (
                  <div className="flex items-center text-[#ff3b30] font-bold text-xl tracking-tight animate-pulse"><Loader2 className="animate-spin mr-3" size={26} strokeWidth={2.5}/> REGISTRANDO...</div>
                ) : (
                  <div className="flex items-center font-extrabold text-xl tracking-tight"><LogOut size={26} strokeWidth={2.5} className="mr-3.5 text-[#ff3b30]" /> REGISTRAR SALIDA</div>
                )}
              </button>
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* SECCIÓN DE MODALES Y OVERLAYS (UI portade de Android) */}
      {/* ========================================================================= */}
      
      {/* 1. MODAL MARCACIÓN OBRA */}
      {mostrarModalIngresoObra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => {if(!guardandoNota) {setMostrarModalIngresoObra(false); setNotaTexto('')}}}>
          {/* Card Blanca Estilo Android */}
          <div className="w-full max-w-sm bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-3xl p-7 shadow-2xl relative animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3.5 mb-5">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 border border-blue-200">
                    <HardHat size={26}/>
                </div>
                <h2 className="text-xl font-extrabold text-slate-950 tracking-tight">Marcación a Obra</h2>
            </div>
            
            <p className="text-slate-600 text-sm mb-4 leading-relaxed">Indica el nombre de la obra, proyecto o cliente donde iniciarás tu jornada.</p>
            
            <textarea 
              className="w-full bg-slate-100 text-slate-800 h-32 placeholder:text-slate-400 border border-slate-200 resize-none outline-none rounded-2xl p-4 duration-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 focus:bg-white focus:shadow-inner text-base font-medium" 
              placeholder="Ej: Obra San Isidro, Cliente BCP, etc..."
              value={notaTexto} onChange={(e) => setNotaTexto(e.target.value)}
              disabled={guardandoNota}
            />
            
            {/* GPS Indicador (portado de Android) */}
            <div className="flex items-center gap-2 mt-4 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                <MapPin size={16}/>
                <span className="text-xs font-bold uppercase tracking-wider">Se adjuntará tu GPS actual</span>
            </div>

            <div className="grid grid-cols-2 gap-3.5 mt-6">
              <button onClick={() => {setMostrarModalIngresoObra(false); setNotaTexto('')}} disabled={guardandoNota} className="w-full py-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-95 transition disabled:opacity-50">Cancelar</button>
              <button onClick={() => procesarAsistenciaRemota('obra', 'Ingreso en')} disabled={guardandoNota} className="w-full flex items-center justify-center gap-2 rounded-xl py-4 bg-blue-600 text-white font-bold hover:bg-blue-700 active:scale-95 transition-all shadow-md disabled:bg-blue-400">
                {guardandoNota ? <Loader2 className="animate-spin" size={22}/> : <>Registrar Ingreso</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. MODAL MARCACIÓN EXTERNA */}
      {mostrarModalExterno && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => {if(!guardandoNota) {setMostrarModalExterno(false); setNotaTexto('')}}}>
          <div className="w-full max-w-sm bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-3xl p-7 shadow-2xl relative animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3.5 mb-5">
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 border border-purple-200">
                    <Store size={26}/>
                </div>
                <h2 className="text-xl font-extrabold text-slate-950 tracking-tight">Diligencia Externa</h2>
            </div>
            
            <p className="text-slate-600 text-sm mb-4 leading-relaxed">Indica qué diligencia realizarás fuera de la oficina (Essalud, almacén, trámites).</p>
            
            <textarea 
              className="w-full bg-purple-50/50 text-slate-800 h-32 placeholder:text-slate-400 border border-purple-200 resize-none outline-none rounded-2xl p-4 duration-300 focus:ring-2 focus:ring-purple-100 focus:border-purple-400 focus:bg-white focus:shadow-inner text-base font-medium" 
              placeholder="Ej: Cita Essalud, Recojo de EPPs Almacén..."
              value={notaTexto} onChange={(e) => setNotaTexto(e.target.value)}
              disabled={guardandoNota}
            />
            
            <div className="flex items-center gap-2 mt-4 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                <MapPin size={16}/>
                <span className="text-xs font-bold uppercase tracking-wider">Se adjuntará tu GPS actual</span>
            </div>

            <div className="grid grid-cols-2 gap-3.5 mt-6">
              <button onClick={() => {setMostrarModalExterno(false); setNotaTexto('')}} disabled={guardandoNota} className="w-full py-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-95 transition disabled:opacity-50">Cancelar</button>
              <button onClick={() => procesarAsistenciaRemota('externo', 'Marcación Externa')} disabled={guardandoNota} className="w-full flex items-center justify-center gap-2 rounded-xl py-4 bg-purple-600 text-white font-bold hover:bg-purple-700 active:scale-95 transition-all shadow-md disabled:bg-purple-400">
                {guardandoNota ? <Loader2 className="animate-spin" size={22}/> : <>Registrar Ingreso</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. MODAL AÑADIR NOTA O SALIDA REMOTA */}
      {mostrarDialogoNota && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => {if(!guardandoNota) {setMostrarDialogoNota(false); setIsRemoteExit(false)}}}>
          <div className="w-full max-w-sm bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-3xl p-7 shadow-2xl relative animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3.5 mb-5">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${isRemoteExit ? 'bg-red-100 text-red-600 border-red-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                    {isRemoteExit ? <MapPin size={26}/> : <Edit3 size={24}/>}
                </div>
                <div>
                    <h2 className={`text-xl font-extrabold tracking-tight ${isRemoteExit ? 'text-red-700' : 'text-slate-950'}`}>
                        {isRemoteExit ? "Detección Externa" : "Añadir Nota"}
                    </h2>
                    {isRemoteExit && <p className="text-xs font-bold text-red-500 uppercase tracking-wider">Estás fuera de oficina</p>}
                </div>
            </div>

            <p className="text-slate-600 text-sm mb-4 leading-relaxed">
                {isRemoteExit ? "Indica tu ubicación u obra actual para autorizar el registro de salida remota." : "Escribe el motivo de tu permiso, descanso médico o nota adicional."}
            </p>
            
            <textarea 
              className={`w-full text-slate-800 h-32 placeholder:text-slate-400 border resize-none outline-none rounded-2xl p-4 duration-300 focus:ring-2 focus:bg-white focus:shadow-inner text-base font-medium ${isRemoteExit ? 'bg-red-50/50 border-red-200 focus:ring-red-100 focus:border-red-400' : 'bg-slate-100 border-slate-200 focus:ring-slate-100 focus:border-slate-400'}`} 
              placeholder={isRemoteExit ? "Obligatorio: Ej. Obra San Miguel, Cita Médica ESSALUD..." : "Ej: Salida por comisión de servicio, malestar físico..."}
              value={notaTexto} onChange={(e) => setNotaTexto(e.target.value)}
              disabled={guardandoNota}
            />
            
            {isRemoteExit && (
                <div className="flex items-center gap-2 mt-4 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 animate-pulse">
                    <MapPin size={16}/>
                    <span className="text-xs font-bold uppercase tracking-wider">Se validará tu GPS actual</span>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3.5 mt-6">
              <button onClick={() => {setMostrarDialogoNota(false); setIsRemoteExit(false)}} disabled={guardandoNota} className="w-full py-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-95 transition disabled:opacity-50">Cancelar</button>
              <button onClick={handleGuardarNota} disabled={guardandoNota} className={`w-full flex items-center justify-center gap-2 rounded-xl py-4 text-white font-bold hover:opacity-90 active:scale-95 transition-all shadow-md ${isRemoteExit ? 'bg-red-600' : 'bg-slate-800'}`}>
                {guardandoNota ? <Loader2 className="animate-spin" size={22}/> : <>Confirmar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. BOTTOM SHEET CALENDARIO (HISTORIAL) */}
      {mostrarCalendario && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setMostrarCalendario(false)}>
          <div className="w-full max-w-md h-[88vh] bg-[#0c101a] rounded-t-[36px] p-7 pb-[env(safe-area-inset-bottom)] flex flex-col border-t border-slate-800 animate-in slide-in-from-bottom duration-300 shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.7)]" onClick={e => e.stopPropagation()}>
            {/* Tirador superior Sheet iOS style */}
            <div className="w-16 h-1.5 bg-slate-700 rounded-full mx-auto mb-7 shrink-0" />
            
            {/* Header Calendario */}
            <div className="flex items-center justify-between mb-8 shrink-0">
              <div className="flex items-center gap-4.5">
                <div className="w-14 h-14 bg-blue-600/10 rounded-2xl flex items-center justify-center text-blue-400 border border-blue-500/20 shadow-inner">
                  <Calendar size={26} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Tu Historial</h2>
                  <p className="text-slate-400 font-bold text-base capitalize bg-slate-800/60 px-3 py-0.5 rounded-full inline-block mt-1">{format(targetDate, 'MMMM yyyy', { locale: es })}</p>
                </div>
              </div>
              <div className="flex gap-2.5 bg-slate-900 border border-slate-800 p-1.5 rounded-full backdrop-blur-sm">
                <button onClick={() => setTargetDate(new Date(targetDate.getFullYear(), targetDate.getMonth() - 1))} className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-white hover:bg-slate-700 active:scale-90 transition shadow"><ChevronLeft size={22}/></button>
                <button 
                  onClick={() => {
                    const nextMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1)
                    if (nextMonth <= new Date()) setTargetDate(nextMonth)
                  }} 
                  disabled={new Date(targetDate.getFullYear(), targetDate.getMonth() + 1) > new Date()}
                  className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-white hover:bg-slate-700 active:scale-90 transition shadow disabled:opacity-30"
                ><ChevronRight size={22}/></button>
              </div>
            </div>

            {loadingCalendar ? (
              <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-blue-500" size={48} strokeWidth={1.5}/></div>
            ) : (
              <div className="flex-1 overflow-y-auto scrollbar-hide pt-2">
                {renderCalendarGrid()}
                
                {/* Leyenda */}
                <div className="flex justify-center items-center gap-6 mt-10 bg-slate-900/60 border border-slate-800 p-4 rounded-2xl backdrop-blur-sm">
                  <div className="flex items-center gap-2.5"><div className="w-3.5 h-3.5 bg-emerald-500 rounded-full shadow-[0_0_10px_1px_#10B981]"></div><span className="text-slate-300 text-sm font-semibold">Puntual</span></div>
                  <div className="flex items-center gap-2.5"><div className="w-3.5 h-3.5 bg-red-500 rounded-full shadow-[0_0_10px_1px_#EF4444]"></div><span className="text-slate-300 text-sm font-semibold">Tardanza</span></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. MODAL DETALLE DEL DÍA SELECCIONADO */}
      {selectedDayInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-in fade-in zoom-in duration-200" onClick={() => setSelectedDayInfo(null)}>
          <div className="w-full max-w-sm bg-[#0c101a]/95 backdrop-blur-xl border border-slate-700/60 rounded-[32px] p-7 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className={`absolute top-0 left-0 w-full h-28 bg-gradient-to-b ${selectedDayInfo.estado_ingreso === 'PUNTUAL' ? 'from-emerald-500/20' : 'from-red-500/20'} to-transparent opacity-60`} />
            
            <div className="flex flex-col items-center relative z-10 pt-2">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-5 ${selectedDayInfo.estado_ingreso === 'PUNTUAL' ? 'bg-emerald-500/15 text-emerald-500 shadow-[0_0_30px_-5px_#10B981]' : 'bg-red-500/15 text-red-500 shadow-[0_0_30px_-5px_#EF4444]'}`}>
                {selectedDayInfo.estado_ingreso === 'PUNTUAL' ? <CheckCircle2 size={48} strokeWidth={1.5}/> : <AlertTriangle size={48} strokeWidth={1.5}/>}
              </div>
              
              <h3 className="text-3xl font-black text-white tracking-tight capitalize">{format(parseISO(selectedDayInfo.fecha || ''), "EEEE dd", {locale: es})}</h3>
              <p className="text-slate-400 font-bold text-base capitalize mt-1">{format(parseISO(selectedDayInfo.fecha || ''), "MMMM yyyy", {locale: es})}</p>

              <div className={`mt-3.5 px-4 py-1.5 rounded-lg border text-sm font-black tracking-wider uppercase ${selectedDayInfo.estado_ingreso === 'PUNTUAL' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-red-500/10 border-red-500/30 text-red-500'}`}>
                {selectedDayInfo.estado_ingreso}
              </div>

              <div className="w-full flex gap-4 mt-8">
                <div className="flex-1 bg-slate-950/80 border border-slate-800 rounded-2xl p-5 flex flex-col items-center shadow-inner">
                  <span className="text-[10px] text-slate-500 font-bold tracking-[0.2em] mb-1.5 uppercase">INGRESO</span>
                  <span className="text-white font-black text-xl tabular-nums">{format(new Date(selectedDayInfo.hora_ingreso), 'hh:mm a')}</span>
                </div>
                <div className="flex-1 bg-slate-950/80 border border-slate-800 rounded-2xl p-5 flex flex-col items-center shadow-inner">
                  <span className="text-[10px] text-slate-500 font-bold tracking-[0.2em] mb-1.5 uppercase">SALIDA</span>
                  <span className={`font-black text-xl tabular-nums ${selectedDayInfo.hora_salida ? 'text-white' : 'text-slate-600'}`}>{selectedDayInfo.hora_salida ? format(new Date(selectedDayInfo.hora_salida), 'hh:mm a') : '--:--'}</span>
                </div>
              </div>

              {selectedDayInfo.notas && (
                <div className="w-full mt-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-inner">
                  <div className="flex items-center gap-2.5 mb-3 pb-2.5 border-b border-slate-800">
                    <EditNoteIcon color="#60a5fa" />
                    <span className="text-sm font-bold text-slate-300 uppercase tracking-wider">Notas Registradas:</span>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-line font-medium text-center">{selectedDayInfo.notas}</p>
                </div>
              )}

              <button onClick={() => setSelectedDayInfo(null)} className="w-full mt-8 py-4 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 active:scale-95 transition-all text-lg shadow">
                Cerrar Detalles
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. BOTTOM SHEET LOGROS */}
      {mostrarLogros && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setMostrarLogros(false)}>
          <div className="w-full max-w-md h-[88vh] bg-[#0c101a] rounded-t-[36px] p-7 pb-0 flex flex-col border-t border-slate-800 animate-in slide-in-from-bottom duration-300 shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.7)]" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-1.5 bg-slate-700 rounded-full mx-auto mb-7 shrink-0" />
            
            <div className="flex items-center gap-5 mb-6 shrink-0">
              <div className="w-16 h-16 bg-yellow-400/10 rounded-2xl flex items-center justify-center border border-yellow-400/20 shadow-inner">
                <Trophy size={32} className="text-yellow-400" strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight">Tus Trofeos RUAG</h2>
                <p className="text-yellow-400/90 font-bold text-base bg-yellow-400/10 px-3 py-0.5 rounded-full inline-block mt-1">{unlockedLogros.length} de {TODOS_LOS_LOGROS.length} desbloqueados</p>
              </div>
            </div>
            
            <div className="w-full h-3 bg-slate-900 rounded-full mb-7 overflow-hidden border border-slate-800 shadow-inner shrink-0">
              <div className="h-full bg-gradient-to-r from-yellow-600 via-yellow-400 to-yellow-600 rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_1px_rgba(250,204,21,0.4)]" style={{ width: `${(unlockedLogros.length / TODOS_LOS_LOGROS.length) * 100}%` }} />
            </div>
            
            <div className="flex-1 overflow-y-auto pb-8 space-y-4 pr-1.5 scrollbar-hide">
              {TODOS_LOS_LOGROS.map(logro => {
                const unlocked = unlockedLogros.includes(logro.id);
                return (
                  <div key={logro.id} className={`flex items-center p-5 rounded-2xl border transition-all ${unlocked ? 'bg-gradient-to-r from-slate-900 to-slate-800/50 border-yellow-400/30 shadow-lg shadow-yellow-400/5' : 'bg-[#06080f] border-slate-900/50 opacity-60'}`}>
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shrink-0 border-2 shadow-inner ${unlocked ? 'bg-gradient-to-br from-yellow-400/20 to-yellow-600/5 border-yellow-400/40' : 'bg-slate-900 border-slate-800'}`}>
                      {unlocked ? logro.emoji : <Lock size={22} className="text-slate-700" />}
                    </div>
                    <div className={`ml-5 flex-1 ${unlocked ? 'opacity-100' : 'opacity-70'}`}>
                      <h4 className={`font-black text-lg tracking-tight ${unlocked ? 'text-yellow-400' : 'text-slate-400'}`}>{logro.titulo}</h4>
                      <p className="text-sm text-slate-300 leading-snug mt-1 font-medium">{logro.desc}</p>
                    </div>
                    {unlocked && <CheckCircle2 size={24} className="text-emerald-500 ml-3 shrink-0 shadow-[0_0_10px_#10B981]" strokeWidth={2.5}/>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 7. LOGRO DESBLOQUEADO (ANIMACIÓN) */}
      {achievementToAnimate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-in fade-in zoom-in duration-300" onClick={() => setAchievementToAnimate(null)}>
          <div className="flex flex-col items-center p-8 text-center" onClick={e => e.stopPropagation()}>
            <div className="relative w-48 h-48 flex items-center justify-center mb-10 transform scale-110">
              <div className="absolute inset-0 bg-yellow-400/40 rounded-full blur-3xl animate-pulse"/>
              <div className="absolute inset-0 bg-gradient-to-b from-yellow-300 to-yellow-600 rounded-full animate-spin [animation-duration:6s] opacity-20"/>
              <span className="text-[120px] relative z-10 animate-in zoom-in-50 duration-700 delay-100 bounce">{achievementToAnimate.emoji}</span>
            </div>
            
            <h3 className="text-yellow-400 font-black tracking-[0.2em] uppercase text-base mb-3.5 bg-yellow-400/10 px-4 py-1 rounded-full border border-yellow-400/20 animate-in slide-in-from-top-4 duration-500 delay-300">¡NUEVO TROFEO OBTENIDO!</h3>
            <h1 className="text-5xl font-black text-white mb-5 tracking-tighter animate-in slide-in-from-top-4 duration-500 delay-400">{achievementToAnimate.titulo}</h1>
            <p className="text-slate-300 text-xl max-w-sm mb-12 leading-relaxed font-medium animate-in slide-in-from-top-4 duration-500 delay-500">{achievementToAnimate.desc}</p>
            
            <button onClick={() => setAchievementToAnimate(null)} className="group relative bg-gradient-to-b from-yellow-300 to-yellow-600 text-slate-950 font-black text-xl py-4.5 px-16 rounded-2xl active:scale-95 transition-all shadow-[0_20px_50px_-10px_rgba(250,204,21,0.5)] animate-in slide-in-from-top-4 duration-500 delay-600 border-none">
              <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity rounded-2xl"/>
              ¡EXCELENTE!
            </button>
          </div>
        </div>
      )}

      {/* ESTILOS CSS GLOBALES */}
      <style dangerouslySetInnerHTML={{__html: `
        :root {
            --safe-area-inset-top: env(safe-area-inset-top);
            --safe-area-inset-bottom: env(safe-area-inset-bottom);
        }
        
        body {
            background-color: #020617; 
            overscroll-behavior-y: contain; 
        }

        @keyframes scan { 
            0% { top: 15%; opacity: 0.2; } 
            50% { opacity: 1; }
            100% { top: 85%; opacity: 0.2; } 
        } 
        
        .bounce { animation: bounce 1s infinite; }
        @keyframes bounce {
            0%, 100% { transform: translateY(-10%); animation-timing-function: cubic-bezier(0.8,0,1,1); }
            50% { transform: none; animation-timing-function: cubic-bezier(0,0,0.2,1); }
        }

        .scrollbar-hide::-webkit-scrollbar { display: none; } 
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        
        input[type="file"], textarea { font-size: 16px; -webkit-appearance: none; }
      `}} />
    </div>
  )
}

function EditNoteIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
      <path d="m15 5 4 4"/>
    </svg>
  )
}

function ClockIcon({ color }: { color: string }) {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
    )
}

function ShieldCheckIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
        </svg>
    )
}