'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { Camera, Edit2, ChevronDown, Loader2, RotateCcw, X } from 'lucide-react'

// Configuración Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

const AREAS_LIST = [
  "Operaciones/Proyectos", "Presupuesto", "Contabilidad",
  "Ssoma", "Rrhh", "Logística", "Finanzas", "Área comercial", "Software"
]

export default function SetupProfileWeb() {
  const router = useRouter()
  
  // --- Estado para verificar la memoria antes de mostrar el formulario ---
  const [isChecking, setIsChecking] = useState(true)

  // Estados del formulario
  const [nombres, setNombres] = useState('')
  const [dni, setDni] = useState('')
  const [selectedArea, setSelectedArea] = useState('')
  
  // Estados de la imagen
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Estado de carga del botón principal
  const [isUploading, setIsUploading] = useState(false)

  // --- ESTADOS PARA RECUPERACIÓN DE CUENTA ---
  const [mostrarModalRecuperar, setMostrarModalRecuperar] = useState(false)
  const [dniRecuperar, setDniRecuperar] = useState('')
  const [isRecuperando, setIsRecuperando] = useState(false)

  // Verificar si ya tiene cuenta apenas entra a la página
  useEffect(() => {
    const dniGuardado = localStorage.getItem('RUAG_DNI')
    const nombreGuardado = localStorage.getItem('RUAG_NOMBRE')
    
    if (dniGuardado && nombreGuardado) {
      // Si ya tiene datos guardados, lo mandamos directo al escáner sin pedir nada
      router.push('/escaner')
    } else {
      // Si es nuevo o borró sus datos, mostramos el formulario
      setIsChecking(false)
    }
  }, [router])

  // Manejar la selección de imagen
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const objectUrl = URL.createObjectURL(file)
      setImagePreview(objectUrl)
    }
  }

  // Guardar en Supabase y continuar
  const handleSave = async () => {
    if (!nombres || dni.length !== 8 || !selectedArea || !imageFile) {
      alert("Por favor completa todos los campos correctamente y sube tu foto.")
      return
    }

    setIsUploading(true)

    try {
      const fileExt = imageFile.name.split('.').pop()
      const fileName = `${dni}_${Date.now()}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('fotos_perfil')
        .upload(filePath, imageFile, { upsert: true })

      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage
        .from('fotos_perfil')
        .getPublicUrl(filePath)
      
      const fotoUrl = publicUrlData.publicUrl

      const { error: dbError } = await supabase
        .from('fotocheck_perfiles')
        .upsert({
          dni: dni,
          nombres_completos: nombres,
          area: selectedArea,
          foto_url: fotoUrl
        }, { onConflict: 'dni' }) 

      if (dbError) throw dbError

      localStorage.setItem('RUAG_DNI', dni)
      localStorage.setItem('RUAG_NOMBRE', nombres)
      localStorage.setItem('RUAG_AREA', selectedArea)
      localStorage.setItem('RUAG_FOTO', fotoUrl)

      router.push('/escaner')

    } catch (error: any) {
      alert(`Error al guardar: ${error.message}`)
      setIsUploading(false)
    }
  }

  // --- FUNCIÓN PARA RECUPERAR DATOS DESDE SUPABASE ---
  const handleRecuperar = async () => {
    if (dniRecuperar.length !== 8) {
      alert("Ingresa un DNI válido de 8 dígitos.")
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
        alert("No se encontró ningún Fotocheck con ese DNI.")
        setIsRecuperando(false)
        return
      }

      // Se encontraron los datos, guardarlos localmente
      localStorage.setItem('RUAG_DNI', data.dni)
      localStorage.setItem('RUAG_NOMBRE', data.nombres_completos)
      localStorage.setItem('RUAG_AREA', data.area)
      localStorage.setItem('RUAG_FOTO', data.foto_url)

      alert(`¡Bienvenido de nuevo, ${data.nombres_completos}!`)
      router.push('/escaner')
      
    } catch (error: any) {
      alert(`Error al buscar: ${error.message}`)
      setIsRecuperando(false)
    }
  }

  // Pantalla de carga mientras revisa la memoria
  if (isChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <p className="text-white font-medium">Cargando tu perfil...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center py-12 px-6 overflow-y-auto relative">
      
      {/* --- MODAL RECUPERAR CUENTA --- */}
      {mostrarModalRecuperar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 w-full max-w-sm rounded-3xl border border-slate-800 p-8 flex flex-col relative shadow-2xl animate-in zoom-in-95">
            <button 
              onClick={() => { if (!isRecuperando) setMostrarModalRecuperar(false) }} 
              className="absolute top-5 right-5 text-slate-500 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
            
            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6 self-center">
              <RotateCcw size={32} className="text-blue-500" />
            </div>
            
            <h2 className="text-2xl font-bold text-white text-center mb-2">Recuperar Fotocheck</h2>
            <p className="text-slate-400 text-sm text-center mb-8">Ingresa tu DNI para buscar tus datos en la nube.</p>

            <input 
              type="number" 
              value={dniRecuperar}
              onChange={(e) => { if (e.target.value.length <= 8) setDniRecuperar(e.target.value) }}
              placeholder="Número de DNI"
              className="w-full bg-slate-950 border border-slate-800 text-white px-5 py-4 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all placeholder-slate-500 mb-6 text-center text-lg tracking-widest"
            />

            <button
              onClick={handleRecuperar}
              disabled={isRecuperando || dniRecuperar.length !== 8}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-4 rounded-xl transition-all flex justify-center items-center"
            >
              {isRecuperando ? <Loader2 className="animate-spin" size={24} /> : "Buscar y Recuperar"}
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-md flex flex-col items-center">
        <h1 className="text-white text-2xl md:text-3xl font-black tracking-widest text-center">
          CREA TU FOTOCHECK
        </h1>
        <p className="text-slate-400 text-sm text-center mt-2 mb-10">
          Sube una foto clara de tu rostro para el registro.
        </p>

        <input 
          type="file" 
          accept="image/*" 
          ref={fileInputRef}
          onChange={handleImageChange}
          className="hidden"
        />

        <div className="relative mb-12">
          <div className={`absolute -inset-2 rounded-full bg-gradient-to-tr from-blue-600 via-emerald-500 to-blue-400 ${!imagePreview ? 'animate-pulse' : 'animate-[spin_4s_linear_infinite]'}`} />
          
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="relative w-40 h-40 bg-slate-900 rounded-full cursor-pointer flex items-center justify-center overflow-hidden border-4 border-slate-950 z-10 group"
          >
            {imagePreview ? (
              <img 
                src={imagePreview} 
                alt="Vista previa" 
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
              />
            ) : (
              <div className="flex flex-col items-center text-blue-400">
                <Camera size={40} strokeWidth={1.5} />
                <span className="text-xs font-bold mt-2">Subir Foto</span>
              </div>
            )}
          </div>

          {imagePreview && (
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 z-20 w-10 h-10 bg-blue-600 rounded-full border-4 border-slate-950 flex items-center justify-center text-white hover:bg-blue-500 transition-colors"
            >
              <Edit2 size={16} />
            </button>
          )}
        </div>

        <div className="w-full space-y-5">
          <div className="relative">
            <input 
              type="text" 
              value={nombres}
              onChange={(e) => setNombres(e.target.value.toUpperCase())}
              placeholder="Nombres y Apellidos Completos"
              className="w-full bg-slate-900 border border-slate-800 text-white px-5 py-4 rounded-2xl focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all placeholder-slate-500"
            />
          </div>

          <div className="relative">
            <input 
              type="number" 
              value={dni}
              onChange={(e) => {
                if (e.target.value.length <= 8) setDni(e.target.value)
              }}
              placeholder="Número de DNI"
              className="w-full bg-slate-900 border border-slate-800 text-white px-5 py-4 rounded-2xl focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all placeholder-slate-500"
            />
          </div>

          <div className="relative">
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className={`w-full bg-slate-900 border border-slate-800 px-5 py-4 rounded-2xl focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all appearance-none cursor-pointer ${selectedArea ? 'text-white' : 'text-slate-500'}`}
            >
              <option value="" disabled>Selecciona tu Área</option>
              {AREAS_LIST.map((area) => (
                <option key={area} value={area} className="text-black bg-white">
                  {area}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-5 flex items-center pointer-events-none text-slate-400">
              <ChevronDown size={20} />
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={isUploading}
          className="w-full mt-10 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-black tracking-widest py-4 rounded-2xl transition-all shadow-[0_0_30px_rgba(37,99,235,0.3)] disabled:opacity-50 flex justify-center items-center"
        >
          {isUploading ? (
            <Loader2 className="animate-spin text-white" size={24} />
          ) : (
            "GUARDAR Y CONTINUAR"
          )}
        </button>

        {/* BOTÓN PARA RECUPERAR CUENTA */}
        <button 
          onClick={() => setMostrarModalRecuperar(true)}
          className="mt-6 text-blue-400 font-semibold hover:text-blue-300 transition-colors"
        >
          ¿Ya tienes cuenta? Recuperar datos
        </button>

      </div>
    </div>
  )
}