'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Edit2, ChevronDown, Loader2, RotateCcw, X, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/utils/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'

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
    if (!nombres.trim() || dni.length !== 8 || !selectedArea || !imageFile) {
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
        .upsert({ dni, nombres_completos: nombres.trim(), area: selectedArea, foto_url: fotoUrl }, { onConflict: 'dni' })
      if (dbError) throw dbError

      setUploadProgress(100)
      store.set('RUAG_DNI', dni)
      store.set('RUAG_NOMBRE', nombres.trim())
      store.set('RUAG_AREA', selectedArea)
      store.set('RUAG_FOTO', fotoUrl)

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

      toast.success(`¡Bienvenido de nuevo, ${data.nombres_completos}!`)
      router.push('/escaner')
    } catch (error: any) {
      toast.error(`Error al buscar: ${error.message}`)
      setIsRecuperando(false)
    }
  }

  if (isChecking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'var(--blue)', boxShadow: 'var(--shadow-glow)' }}>
          <Loader2 className="animate-spin text-white" size={28} />
        </div>
        <p className="font-semibold" style={{ color: 'var(--text-2)' }}>Verificando tu perfil...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-5 overflow-y-auto" style={{ background: 'var(--bg)' }}>

      {/* ── Modal Recuperar ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showRecuperar && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-5"
            style={{ background: 'rgba(30,27,75,0.5)', backdropFilter: 'blur(12px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { if (!isRecuperando) setShowRecuperar(false) }}
          >
            <motion.div
              className="w-full max-w-sm rounded-3xl p-8 relative"
              style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', border: '1.5px solid var(--border)' }}
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => { if (!isRecuperando) setShowRecuperar(false) }}
                className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
              >
                <X size={16} />
              </button>

              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ background: 'var(--blue-light)', border: '1.5px solid var(--border-2)' }}>
                <RotateCcw size={28} style={{ color: 'var(--blue)' }} />
              </div>

              <h2 className="text-xl font-bold text-center mb-1" style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>
                Recuperar Fotocheck
              </h2>
              <p className="text-sm text-center mb-7" style={{ color: 'var(--text-3)' }}>
                Ingresa tu DNI para buscar tus datos en la nube.
              </p>

              <input
                type="number"
                value={dniRecuperar}
                onChange={e => { if (e.target.value.length <= 8) setDniRecuperar(e.target.value) }}
                placeholder="Número de DNI"
                className="w-full px-5 py-4 rounded-2xl text-center text-lg font-bold tracking-widest outline-none transition-all mb-5"
                style={{
                  background: 'var(--surface-2)', border: '1.5px solid var(--border-2)',
                  color: 'var(--text-1)',
                }}
              />

              <motion.button
                onClick={handleRecuperar}
                disabled={isRecuperando || dniRecuperar.length !== 8}
                className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center transition-all disabled:opacity-40"
                style={{ background: 'var(--blue)', boxShadow: isRecuperando ? 'none' : 'var(--shadow-md)' }}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              >
                {isRecuperando ? <Loader2 className="animate-spin" size={22} /> : 'Buscar y Recuperar'}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Contenido ───────────────────────────────────────────────────── */}
      <motion.div
        className="w-full max-w-md flex flex-col items-center"
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.34, 1.2, 0.64, 1] }}
      >
        {/* Logo */}
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-8"
          style={{ background: 'var(--blue)', boxShadow: 'var(--shadow-glow)' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>

        <h1 className="text-3xl font-black text-center tracking-tight mb-2"
          style={{ color: 'var(--text-1)', fontFamily: 'Syne, sans-serif' }}>
          Crea tu Fotocheck
        </h1>
        <p className="text-sm text-center mb-10" style={{ color: 'var(--text-3)' }}>
          Sube una foto clara de tu rostro para el registro.
        </p>

        <div
          className="w-full mb-8 rounded-3xl p-5"
          style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.18em] mb-3" style={{ color: 'var(--blue)' }}>
            Modo iPhone
          </p>
          <p className="text-sm font-semibold leading-relaxed" style={{ color: 'var(--text-2)' }}>
            Despues del registro tendras el mismo flujo web del trabajador: escaneo, historial, logros, vacaciones y soporte.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {['Escaner', 'Historial', 'Logros', 'Vacaciones', 'Soporte'].map((item) => (
              <span
                key={item}
                className="rounded-full px-3 py-1.5 text-[11px] font-black"
                style={{ background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid var(--border-2)' }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* Avatar */}
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageChange} className="hidden" />

        <div className="relative mb-10">
          {/* Aro animado */}
          <div
            className="absolute -inset-2 rounded-full opacity-70"
            style={{
              background: imagePreview
                ? 'conic-gradient(from 0deg, var(--blue), var(--green), var(--blue))'
                : 'conic-gradient(from 0deg, var(--blue), var(--border-2), var(--blue))',
              animation: 'spin-slow 4s linear infinite',
            }}
          />
          <motion.div
            onClick={() => fileInputRef.current?.click()}
            className="relative w-36 h-36 rounded-full cursor-pointer flex items-center justify-center overflow-hidden border-4 group"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center" style={{ color: 'var(--blue)' }}>
                <Camera size={32} strokeWidth={1.5} />
                <span className="text-xs font-bold mt-2">Subir Foto</span>
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
              style={{ background: 'rgba(79,70,229,0.25)' }}>
              <Edit2 size={24} className="text-white" />
            </div>
          </motion.div>

          {imagePreview && (
            <motion.button
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-10 h-10 rounded-full flex items-center justify-center text-white border-4"
              style={{ background: 'var(--blue)', borderColor: 'var(--bg)', boxShadow: 'var(--shadow-md)' }}
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            >
              <Edit2 size={15} />
            </motion.button>
          )}
        </div>

        {/* Upload Progress */}
        <AnimatePresence>
          {isUploading && uploadProgress > 0 && (
            <motion.div className="w-full mb-6" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'var(--blue)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
              <p className="text-xs mt-2 text-center font-medium" style={{ color: 'var(--text-3)' }}>
                {uploadProgress < 100 ? 'Subiendo datos...' : '¡Listo!'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Campos */}
        <div className="w-full space-y-4">
          {[
            {
              type: 'text', value: nombres, placeholder: 'Nombres y Apellidos Completos',
              onChange: (e: any) => setNombres(e.target.value.toUpperCase()),
            },
            {
              type: 'number', value: dni, placeholder: 'Número de DNI',
              onChange: (e: any) => { if (e.target.value.length <= 8) setDni(e.target.value) },
            },
          ].map((field, i) => (
            <motion.input
              key={i}
              type={field.type}
              value={field.value}
              onChange={field.onChange}
              placeholder={field.placeholder}
              className="w-full px-5 py-4 rounded-2xl outline-none transition-all font-medium"
              style={{
                background: 'var(--surface)', border: '1.5px solid var(--border)',
                color: 'var(--text-1)',
              }}
              whileFocus={{ scale: 1.01 }}
            />
          ))}

          {/* Área select */}
          <div className="relative">
            <select
              value={selectedArea}
              onChange={e => setSelectedArea(e.target.value)}
              className="w-full px-5 py-4 rounded-2xl appearance-none cursor-pointer outline-none font-medium transition-all"
              style={{
                background: 'var(--surface)', border: '1.5px solid var(--border)',
                color: selectedArea ? 'var(--text-1)' : 'var(--text-3)',
              }}
            >
              <option value="" disabled>Selecciona tu Área</option>
              {AREAS_LIST.map(area => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-5 flex items-center pointer-events-none" style={{ color: 'var(--text-3)' }}>
              <ChevronDown size={20} />
            </div>
          </div>
        </div>

        {/* Botón guardar */}
        <motion.button
          onClick={handleSave}
          disabled={isUploading}
          className="w-full mt-8 py-4 rounded-2xl font-bold text-white text-base flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'var(--blue)', boxShadow: 'var(--shadow-lg), var(--shadow-glow)', fontFamily: 'Syne, sans-serif' }}
          whileHover={{ scale: 1.02, boxShadow: '0 20px 50px rgba(79,70,229,0.35)' }}
          whileTap={{ scale: 0.98 }}
        >
          {isUploading
            ? <Loader2 className="animate-spin" size={22} />
            : <><CheckCircle size={20} />GUARDAR Y CONTINUAR</>
          }
        </motion.button>

        <motion.button
          onClick={() => setShowRecuperar(true)}
          className="mt-5 font-semibold text-sm transition-colors"
          style={{ color: 'var(--blue)' }}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
        >
          ¿Ya tienes cuenta? Recuperar datos
        </motion.button>
      </motion.div>
    </div>
  )
}

function isInactiveArea(area?: string | null) {
  return String(area ?? '').startsWith(INACTIVE_AREA_PREFIX)
}
