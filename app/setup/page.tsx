'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Edit2, ChevronDown, Loader2, RotateCcw, X, CheckCircle, Cake, User, IdCard, Building, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/utils/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { activateDeviceSession } from '@/utils/device-session'
import CalendarPicker from '@/components/CalendarPicker'

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
        .upsert({ dni, nombres_completos: nombres.trim(), area: selectedArea, foto_url: fotoUrl, fecha_cumpleanos: fechaCumple, empresa: selectedEmpresa }, { onConflict: 'dni' })
      if (dbError) throw dbError

      setUploadProgress(100)
      store.set('RUAG_DNI', dni)
      store.set('RUAG_NOMBRE', nombres.trim())
      store.set('RUAG_AREA', selectedArea)
      store.set('RUAG_EMPRESA', selectedEmpresa)
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
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'var(--blue)', boxShadow: 'var(--shadow-glow)' }}>
          <Loader2 className="animate-spin text-white" size={28} />
        </div>
        <p className="font-semibold" style={{ color: 'var(--text-2)' }}>Verificando tu perfil...</p>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center py-12 px-5 overflow-y-auto overflow-x-hidden" style={{ background: 'var(--bg)' }}>

      {/* ── Fondo animado (blobs) ───────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <motion.div
          className="absolute -top-24 -left-20 h-72 w-72 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.28), transparent 70%)' }}
          animate={{ x: [0, 30, 0], y: [0, 20, 0], scale: [1, 1.12, 1] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-1/3 -right-24 h-80 w-80 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.22), transparent 70%)' }}
          animate={{ x: [0, -26, 0], y: [0, 26, 0], scale: [1, 1.16, 1] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-24 left-1/4 h-72 w-72 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.20), transparent 70%)' }}
          animate={{ x: [0, 24, 0], y: [0, -20, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

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

              <h2 className="text-xl font-bold text-center mb-1" style={{ color: 'var(--text-1)', fontFamily: 'Sora, sans-serif' }}>
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
        className="relative z-10 w-full max-w-md flex flex-col items-center"
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.34, 1.2, 0.64, 1] }}
      >
        {/* Logo */}
        <motion.div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-glow)', overflow: 'hidden' }}
          initial={{ scale: 0, rotate: -12 }} animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18, delay: 0.1 }}
        >
          <img src="/ruag-logo.png" alt="RUAG" className="h-full w-full object-cover" />
        </motion.div>

        {/* Pill de paso */}
        <motion.div
          className="mb-4 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5"
          style={{ background: 'var(--blue-light)', border: '1px solid var(--border-2)' }}
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--blue)' }} />
          <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--blue)' }}>
            Registro · Modo iPhone
          </span>
        </motion.div>

        <h1 className="text-[32px] font-black text-center leading-tight tracking-tight mb-2"
          style={{
            fontFamily: 'Sora, sans-serif',
            backgroundImage: 'linear-gradient(120deg, #2563EB, #06B6D4, #22C55E)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>
          Crea tu Fotocheck
        </h1>
        <p className="text-sm text-center mb-8 max-w-xs" style={{ color: 'var(--text-3)' }}>
          Sube una foto clara de tu rostro para el registro.
        </p>

        {/* Avatar */}
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageChange} className="hidden" />

        <div className="relative mb-9">
          {/* Halo pulsante */}
          <motion.div
            className="absolute -inset-4 rounded-full blur-2xl"
            style={{ background: imagePreview
              ? 'radial-gradient(circle, rgba(34,197,94,0.35), transparent 70%)'
              : 'radial-gradient(circle, rgba(37,99,235,0.30), transparent 70%)' }}
            animate={{ opacity: [0.4, 0.75, 0.4], scale: [0.95, 1.08, 0.95] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Aro cónico animado */}
          <div
            className="absolute -inset-2 rounded-full opacity-80"
            style={{
              background: imagePreview
                ? 'conic-gradient(from 0deg, #2563EB, #22C55E, #06B6D4, #2563EB)'
                : 'conic-gradient(from 0deg, #2563EB, #06B6D4, #22C55E, #2563EB)',
              animation: 'spin-slow 5s linear infinite',
            }}
          />
          <motion.div
            onClick={() => fileInputRef.current?.click()}
            className="relative w-40 h-40 rounded-full cursor-pointer flex items-center justify-center overflow-hidden border-4 group"
            style={{ background: 'var(--surface)', borderColor: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
            animate={imagePreview ? {} : { y: [0, -4, 0] }}
            transition={imagePreview ? {} : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center">
                <img src="/icons-web/subir-foto.gif" alt="Subir foto" className="w-24 h-24 object-contain" />
                <span className="text-[13px] font-black -mt-1" style={{ color: 'var(--blue)' }}>Subir Foto</span>
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
              style={{ background: 'rgba(37,99,235,0.28)' }}>
              <Edit2 size={26} className="text-white" />
            </div>
          </motion.div>

          {imagePreview && (
            <motion.button
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-1 right-1 w-11 h-11 rounded-full flex items-center justify-center text-white border-4"
              style={{ background: 'var(--blue)', borderColor: 'var(--bg)', boxShadow: 'var(--shadow-md)' }}
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.9 }}
            >
              <Edit2 size={16} />
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
        <motion.div
          className="w-full space-y-3.5"
          initial="hidden" animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.2 } } }}
        >
          {[
            {
              type: 'text', value: nombres, placeholder: 'Nombres y Apellidos Completos', icon: <User size={18} />,
              onChange: (e: any) => setNombres(e.target.value.toUpperCase()),
            },
            {
              type: 'number', value: dni, placeholder: 'Número de DNI', icon: <IdCard size={18} />,
              onChange: (e: any) => { if (e.target.value.length <= 8) setDni(e.target.value) },
            },
          ].map((field, i) => (
            <motion.div
              key={i}
              variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
              className="group relative rounded-2xl transition-all focus-within:ring-2"
              style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', ['--tw-ring-color' as any]: 'rgba(37,99,235,0.35)' }}
            >
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center" style={{ color: 'var(--text-3)' }}>
                {field.icon}
              </span>
              <input
                type={field.type}
                value={field.value}
                onChange={field.onChange}
                placeholder={field.placeholder}
                className="w-full bg-transparent pl-12 pr-5 py-4 rounded-2xl outline-none font-medium"
                style={{ color: 'var(--text-1)' }}
              />
            </motion.div>
          ))}

          {/* Área select */}
          <motion.div className="relative rounded-2xl focus-within:ring-2"
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', ['--tw-ring-color' as any]: 'rgba(37,99,235,0.35)' }}>
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center" style={{ color: 'var(--text-3)' }}>
              <Building size={18} />
            </span>
            <select
              value={selectedArea}
              onChange={e => setSelectedArea(e.target.value)}
              className="w-full bg-transparent pl-12 pr-11 py-4 rounded-2xl appearance-none cursor-pointer outline-none font-medium"
              style={{ color: selectedArea ? 'var(--text-1)' : 'var(--text-3)' }}
            >
              <option value="" disabled>Selecciona tu Área</option>
              {AREAS_LIST.map(area => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none" style={{ color: 'var(--text-3)' }}>
              <ChevronDown size={20} />
            </div>
          </motion.div>

          {/* Empresa select */}
          <motion.div className="relative rounded-2xl focus-within:ring-2"
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', ['--tw-ring-color' as any]: 'rgba(37,99,235,0.35)' }}>
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center" style={{ color: 'var(--text-3)' }}>
              <Building2 size={18} />
            </span>
            <select
              value={selectedEmpresa}
              onChange={e => setSelectedEmpresa(e.target.value)}
              className="w-full bg-transparent pl-12 pr-11 py-4 rounded-2xl appearance-none cursor-pointer outline-none font-medium"
              style={{ color: selectedEmpresa ? 'var(--text-1)' : 'var(--text-3)' }}
            >
              <option value="" disabled>Selecciona tu Empresa</option>
              <option value="RUAG">RUAG</option>
              <option value="ARUG">ARUG</option>
              <option value="CG">CG</option>
            </select>
            {selectedEmpresa && (
              <span
                className="absolute inset-y-0 right-11 flex items-center text-[10px] font-black uppercase tracking-wider px-2 my-2.5 rounded-full text-white"
                style={{
                  background: selectedEmpresa === 'RUAG'
                    ? 'linear-gradient(90deg,#047857,#22C55E)'
                    : selectedEmpresa === 'ARUG'
                    ? 'linear-gradient(90deg,#1D4ED8,#38BDF8)'
                    : 'linear-gradient(90deg,#B45309,#FBBF24)',
                }}
              >
                {selectedEmpresa}
              </span>
            )}
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none" style={{ color: 'var(--text-3)' }}>
              <ChevronDown size={20} />
            </div>
          </motion.div>

          {/* Fecha de cumpleaños */}
          <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
            <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: 'var(--text-3)' }}>
              Fecha de cumpleaños
            </label>
            <button
              type="button"
              onClick={() => setShowCalPicker(true)}
              className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl outline-none transition-all font-medium text-left focus:ring-2"
              style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', color: fechaCumple ? 'var(--text-1)' : 'var(--text-3)', ['--tw-ring-color' as any]: 'rgba(236,72,153,0.35)' }}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'rgba(236,72,153,0.12)' }}>
                <Cake size={17} style={{ color: '#EC4899' }} />
              </span>
              {fechaCumple ? formatBirthdayLabel(fechaCumple) : 'Selecciona tu fecha'}
            </button>
            <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>
              La usaremos para avisar a tu equipo cuando se acerque tu cumpleaños 🎂
            </p>
          </motion.div>
        </motion.div>

        {showCalPicker && (
          <CalendarPicker value={fechaCumple} onClose={() => setShowCalPicker(false)} onSelect={setFechaCumple} />
        )}

        {/* Botón guardar */}
        <motion.button
          onClick={handleSave}
          disabled={isUploading}
          className="relative w-full mt-8 py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-2 overflow-hidden disabled:opacity-50"
          style={{ background: 'linear-gradient(120deg, #2563EB, #06B6D4, #22C55E)', boxShadow: '0 18px 44px rgba(37,99,235,0.32)', fontFamily: 'Sora, sans-serif' }}
          whileHover={{ scale: 1.02, boxShadow: '0 22px 54px rgba(37,99,235,0.4)' }}
          whileTap={{ scale: 0.98 }}
        >
          {/* Shimmer */}
          <motion.span
            className="pointer-events-none absolute inset-y-0 w-24 -skew-x-12"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }}
            animate={{ x: ['-140%', '260%'] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'linear', repeatDelay: 1 }}
          />
          {isUploading
            ? <Loader2 className="animate-spin" size={22} />
            : <><CheckCircle size={20} />GUARDAR Y CONTINUAR</>
          }
        </motion.button>

        <motion.button
          onClick={() => setShowRecuperar(true)}
          className="mt-5 inline-flex items-center gap-2 font-bold text-sm transition-colors"
          style={{ color: 'var(--blue)' }}
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
        >
          <RotateCcw size={15} />
          ¿Ya tienes cuenta? Recuperar datos
        </motion.button>
      </motion.div>
    </div>
  )
}

function isInactiveArea(area?: string | null) {
  return String(area ?? '').startsWith(INACTIVE_AREA_PREFIX)
}
