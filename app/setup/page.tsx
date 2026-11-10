'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Edit2, ChevronDown, Loader2, RotateCcw, X, Cake, User, IdCard, Building, Building2, Camera, Search, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/utils/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { activateDeviceSession } from '@/utils/device-session'
import CalendarPicker from '@/components/CalendarPicker'
import { COUNTRIES, DEFAULT_COUNTRY, countryOf, detectCountryFromDevice, localHourMinute } from '@/utils/countries'

const MESES_LABEL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const formatBirthdayLabel = (v: string) => {
  const [y, m, d] = v.split('-').map(Number)
  return `${d} de ${MESES_LABEL[m - 1] ?? ''} de ${y}`
}

const INACTIVE_AREA_PREFIX = '__INACTIVO__|'

const AREAS_LIST = [
  "Operaciones/Proyectos", "Presupuesto", "Contabilidad",
  "Ssoma", "Rrhh", "Logística", "Finanzas", "Área comercial",
  "Software", "Mantenimiento", "Almacén"
]

// FIX: localStorage con manejo de errores (Safari modo privado lanza excepciones)
function safeLocalStorage() {
  try {
    return {
      get: (k: string) => localStorage.getItem(k),
      set: (k: string, v: string) => localStorage.setItem(k, v),
      remove: (k: string) => localStorage.removeItem(k),
    }
  } catch {
    return { get: () => null, set: () => {}, remove: () => {} }
  }
}

export default function SetupProfileWeb() {
  const router = useRouter()
  const store = safeLocalStorage()

  const [isChecking, setIsChecking]   = useState(true)
  const [nombres, setNombres]         = useState('')
  const [dni, setDni]                 = useState('')
  const [selectedArea, setSelectedArea] = useState('')
  const [selectedEmpresa, setSelectedEmpresa] = useState('')
  // País: autodetectado por zona horaria del navegador; Perú si no se reconoce.
  const [selectedPais, setSelectedPais] = useState<string>(() => detectCountryFromDevice() ?? DEFAULT_COUNTRY)
  const [fechaCumple, setFechaCumple] = useState('')
  const [showCalPicker, setShowCalPicker] = useState(false)
  const [imageFile, setImageFile]     = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [showRecuperar, setShowRecuperar] = useState(false)
  const [dniRecuperar, setDniRecuperar] = useState('')
  const [isRecuperando, setIsRecuperando] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const dniGuardado  = store.get('RUAG_DNI')
    const nombreGuardado = store.get('RUAG_NOMBRE')
    if (dniGuardado && nombreGuardado) {
      router.push('/escaner')
    } else {
      setIsChecking(false)
    }
  }, [router])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no puede superar 5 MB')
      return
    }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    if (!nombres.trim() || dni.length !== 8 || !selectedArea || !selectedEmpresa || !fechaCumple || !imageFile) {
      toast.error('Completa todos los campos y sube tu foto')
      return
    }
    setIsUploading(true)
    setUploadProgress(10)

    try {
      const ext      = imageFile.name.split('.').pop()
      const fileName = `${dni}_${Date.now()}.${ext}`

      setUploadProgress(30)
      const { error: uploadError } = await supabase.storage
        .from('fotos_perfil')
        .upload(fileName, imageFile, { upsert: true })
      if (uploadError) throw uploadError

      setUploadProgress(60)
      const { data: urlData } = supabase.storage.from('fotos_perfil').getPublicUrl(fileName)
      const fotoUrl = urlData.publicUrl

      setUploadProgress(80)
      const { error: dbError } = await supabase
        .from('fotocheck_perfiles')
        .upsert({ dni, nombres_completos: nombres.trim(), area: selectedArea, foto_url: fotoUrl, fecha_cumpleanos: fechaCumple, empresa: selectedEmpresa, pais: selectedPais }, { onConflict: 'dni' })
      if (dbError) throw dbError

      setUploadProgress(100)
      store.set('RUAG_DNI', dni)
      store.set('RUAG_NOMBRE', nombres.trim())
      store.set('RUAG_AREA', selectedArea)
      store.set('RUAG_EMPRESA', selectedEmpresa)
      store.set('RUAG_PAIS', selectedPais)
      store.set('RUAG_FOTO', fotoUrl)
      await activateDeviceSession(dni, nombres.trim(), 'web-pwa')

      toast.success('¡Fotocheck creado exitosamente!')
      setTimeout(() => router.push('/escaner'), 800)
    } catch (error: any) {
      toast.error(`Error al guardar: ${error.message}`)
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const handleRecuperar = async () => {
    if (dniRecuperar.length !== 8) {
      toast.warning('Ingresa un DNI válido de 8 dígitos')
      return
    }
    setIsRecuperando(true)
    try {
      const { data, error } = await supabase
        .from('fotocheck_perfiles')
        .select('*')
        .eq('dni', dniRecuperar)
        .single()

      if (error || !data) {
        toast.error('No se encontró ningún Fotocheck con ese DNI')
        setIsRecuperando(false)
        return
      }

      if (isInactiveArea(data.area)) {
        toast.error('Este trabajador fue dado de baja y ya no puede ingresar.')
        setIsRecuperando(false)
        return
      }

      store.set('RUAG_DNI', data.dni)
      store.set('RUAG_NOMBRE', data.nombres_completos)
      store.set('RUAG_AREA', data.area)
      store.set('RUAG_FOTO', data.foto_url)
      await activateDeviceSession(data.dni, data.nombres_completos, 'web-pwa')

      toast.success(`¡Bienvenido de nuevo, ${data.nombres_completos}!`)
      router.push('/escaner')
    } catch (error: any) {
      toast.error(`Error al buscar: ${error.message}`)
      setIsRecuperando(false)
    }
  }

  if (isChecking) {
    return (
      <div className="worker-theme min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'var(--blue)', boxShadow: 'var(--shadow-glow)' }}>
          <Loader2 className="animate-spin text-white" size={28} />
        </div>
        <p className="font-semibold" style={{ color: 'var(--text-2)' }}>Verificando tu perfil...</p>
      </div>
    )
  }

  const fieldBox = 'relative rounded-[14px] border bg-white focus-within:ring-2 focus-within:ring-blue-600/30'
  const fieldStyle = { borderColor: 'var(--border)' }

  return (
    <div
      className="worker-theme min-h-screen overflow-x-hidden"
      style={{ background: 'var(--bg)', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* ── Modal Recuperar ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showRecuperar && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-5"
            style={{ background: 'rgba(15,23,42,0.45)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { if (!isRecuperando) setShowRecuperar(false) }}
          >
            <motion.div
              className="w-full max-w-sm rounded-3xl border bg-white p-6 relative"
              style={{ borderColor: 'var(--border)', boxShadow: '0 24px 60px rgba(15,23,42,0.18)' }}
              initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => { if (!isRecuperando) setShowRecuperar(false) }}
                aria-label="Cerrar"
                className="absolute top-3 right-3 w-11 h-11 rounded-full flex items-center justify-center"
                style={{ color: 'var(--text-3)' }}
              >
                <X size={20} />
              </button>

              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--blue-light)' }}>
                <RotateCcw size={26} style={{ color: 'var(--blue)' }} />
              </div>
              <h2 className="text-xl font-semibold" style={{ color: 'var(--text-1)' }}>Recuperar fotocheck</h2>
              <p className="text-sm mt-1 mb-5" style={{ color: 'var(--text-2)' }}>
                Ingresa tu DNI para traer tus datos guardados.
              </p>

              <input
                type="number"
                inputMode="numeric"
                value={dniRecuperar}
                onChange={e => { if (e.target.value.length <= 8) setDniRecuperar(e.target.value) }}
                placeholder="Número de DNI"
                className="w-full px-4 py-3.5 rounded-[14px] border text-center text-lg font-semibold tracking-widest outline-none focus:ring-2 focus:ring-blue-600/30 mb-4"
                style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
              />

              <button
                onClick={handleRecuperar}
                disabled={isRecuperando || dniRecuperar.length !== 8}
                className="w-full h-[52px] rounded-2xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-transform"
                style={{ background: 'var(--blue)' }}
              >
                {isRecuperando ? <Loader2 className="animate-spin" size={22} /> : <><Search size={18} />Buscar</>}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Contenido ───────────────────────────────────────────────────── */}
      <motion.div
        className="mx-auto w-full max-w-md px-6 pt-5 pb-8 flex flex-col items-center"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        {/* Cabecera */}
        <div className="w-full mb-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-3)' }}>RUAG Jornada</p>
          <h1 className="text-[26px] font-bold leading-tight mt-1" style={{ color: 'var(--text-1)' }}>Crea tu fotocheck</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>Completa tus datos y sube una foto clara de tu rostro.</p>
        </div>

        {/* Foto */}
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageChange} className="hidden" />
        <div className="relative mb-8">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label={imagePreview ? 'Cambiar foto' : 'Subir foto'}
            className="w-[132px] h-[132px] rounded-full bg-white overflow-hidden flex items-center justify-center border-2 active:scale-[0.97] transition-transform"
            style={{ borderColor: imagePreview ? 'var(--blue)' : 'var(--border-2)' }}
          >
            {imagePreview ? (
              <img src={imagePreview} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="flex flex-col items-center" style={{ color: 'var(--blue)' }}>
                <Camera size={32} />
                <span className="text-[13px] font-semibold mt-1.5">Subir foto</span>
              </span>
            )}
          </button>
          {imagePreview && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Cambiar foto"
              className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-white border flex items-center justify-center"
              style={{ borderColor: 'var(--border)', color: 'var(--blue)', boxShadow: 'var(--shadow-sm)' }}
            >
              <Edit2 size={16} />
            </button>
          )}
        </div>

        {/* Progreso de subida */}
        <AnimatePresence>
          {isUploading && uploadProgress > 0 && (
            <motion.div className="w-full mb-6" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--blue-light)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'var(--blue)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
              <p className="text-xs mt-2 text-center font-medium" style={{ color: 'var(--text-3)' }}>
                {uploadProgress < 100 ? 'Subiendo datos...' : 'Listo'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Campos */}
        <div className="w-full space-y-3">
          {[
            {
              type: 'text', value: nombres, placeholder: 'Nombres y apellidos completos', icon: <User size={18} />,
              onChange: (e: any) => setNombres(e.target.value.toUpperCase()),
            },
            {
              type: 'number', value: dni, placeholder: 'Número de DNI', icon: <IdCard size={18} />,
              onChange: (e: any) => { if (e.target.value.length <= 8) setDni(e.target.value) },
            },
          ].map((field, i) => (
            <div key={i} className={fieldBox} style={fieldStyle}>
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center" style={{ color: 'var(--text-3)' }}>
                {field.icon}
              </span>
              <input
                type={field.type}
                inputMode={field.type === 'number' ? 'numeric' : undefined}
                value={field.value}
                onChange={field.onChange}
                placeholder={field.placeholder}
                aria-label={field.placeholder}
                className="w-full bg-transparent pl-12 pr-4 py-4 rounded-[14px] outline-none font-medium"
                style={{ color: 'var(--text-1)' }}
              />
            </div>
          ))}

          {/* Área */}
          <div className={fieldBox} style={fieldStyle}>
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center" style={{ color: 'var(--text-3)' }}>
              <Building size={18} />
            </span>
            <select
              value={selectedArea}
              onChange={e => setSelectedArea(e.target.value)}
              aria-label="Área"
              className="w-full bg-transparent pl-12 pr-11 py-4 rounded-[14px] appearance-none cursor-pointer outline-none font-medium"
              style={{ color: selectedArea ? 'var(--text-1)' : 'var(--text-3)' }}
            >
              <option value="" disabled>Selecciona tu área</option>
              {AREAS_LIST.map(area => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
            <ChevronDown size={20} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
          </div>

          {/* Empresa */}
          <div className={fieldBox} style={fieldStyle}>
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center" style={{ color: 'var(--text-3)' }}>
              <Building2 size={18} />
            </span>
            <select
              value={selectedEmpresa}
              onChange={e => setSelectedEmpresa(e.target.value)}
              aria-label="Empresa"
              className="w-full bg-transparent pl-12 pr-11 py-4 rounded-[14px] appearance-none cursor-pointer outline-none font-medium"
              style={{ color: selectedEmpresa ? 'var(--text-1)' : 'var(--text-3)' }}
            >
              <option value="" disabled>Selecciona tu empresa</option>
              <option value="RUAG">RUAG</option>
              <option value="ARUG">ARUG</option>
              <option value="CG">CG</option>
            </select>
            <ChevronDown size={20} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
          </div>

          {/* País: define el reloj de tu horario */}
          <div className={fieldBox} style={fieldStyle}>
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[18px]">
              {countryOf(selectedPais).flag}
            </span>
            <select
              value={selectedPais}
              onChange={e => setSelectedPais(e.target.value)}
              aria-label="País"
              className="w-full bg-transparent pl-12 pr-11 py-4 rounded-[14px] appearance-none cursor-pointer outline-none font-medium"
              style={{ color: 'var(--text-1)' }}
            >
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code}>{c.name} · {c.hint}</option>
              ))}
            </select>
            <ChevronDown size={20} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
          </div>
          <p className="-mt-1 px-1 text-xs" style={{ color: 'var(--text-3)' }}>
            Tu puntualidad se calcula con la hora de este país
            {' · '}
            {String(localHourMinute(selectedPais).hour).padStart(2, '0')}:
            {String(localHourMinute(selectedPais).minute).padStart(2, '0')} ahora
          </p>

          {/* Cumpleaños */}
          <div className="pt-1">
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-3)' }}>
              Fecha de cumpleaños
            </label>
            <button
              type="button"
              onClick={() => setShowCalPicker(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-[14px] border bg-white outline-none font-medium text-left focus:ring-2 focus:ring-blue-600/30"
              style={{ borderColor: 'var(--border)', color: fechaCumple ? 'var(--text-1)' : 'var(--text-3)' }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-[10px]" style={{ background: 'var(--blue-light)', color: 'var(--blue)' }}>
                <Cake size={18} />
              </span>
              {fechaCumple ? formatBirthdayLabel(fechaCumple) : 'Selecciona tu fecha'}
            </button>
            <p className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>
              La usamos para avisar a tu equipo cuando se acerque tu cumpleaños.
            </p>
          </div>
        </div>

        {showCalPicker && (
          <CalendarPicker value={fechaCumple} onClose={() => setShowCalPicker(false)} onSelect={setFechaCumple} />
        )}

        {/* Guardar */}
        <button
          onClick={handleSave}
          disabled={isUploading}
          className="w-full mt-8 h-14 rounded-2xl font-semibold text-white text-base flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
          style={{ background: 'var(--blue)' }}
        >
          {isUploading
            ? <Loader2 className="animate-spin" size={22} />
            : <>Guardar y continuar<ArrowRight size={20} /></>
          }
        </button>

        <button
          onClick={() => setShowRecuperar(true)}
          className="mt-3 min-h-11 inline-flex items-center gap-2 font-semibold text-sm"
          style={{ color: 'var(--blue)' }}
        >
          <RotateCcw size={16} />
          ¿Ya tienes cuenta? Recuperar datos
        </button>
      </motion.div>
    </div>
  )
}

function isInactiveArea(area?: string | null) {
  return String(area ?? '').startsWith(INACTIVE_AREA_PREFIX)
}
