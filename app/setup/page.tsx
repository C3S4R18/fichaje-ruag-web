'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { Camera, Edit2, ChevronDown, Loader2 } from 'lucide-react'

// Configuración Supabase (Asegúrate de tener tus variables de entorno en .env.local)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

// Lista de áreas igual a la de tu app de Android
const AREAS_LIST = [
  "Operaciones/Proyectos", "Presupuesto", "Contabilidad",
  "Ssoma", "Rrhh", "Logística", "Finanzas", "Área comercial", "Software"
]

export default function SetupProfileWeb() {
  const router = useRouter()
  
  // Estados del formulario
  const [nombres, setNombres] = useState('')
  const [dni, setDni] = useState('')
  const [selectedArea, setSelectedArea] = useState('')
  
  // Estados de la imagen
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Estado de carga
  const [isUploading, setIsUploading] = useState(false)

  // Manejar la selección de imagen desde el iPhone/Celular
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
      // 1. Subir imagen a Supabase Storage
      const fileExt = imageFile.name.split('.').pop()
      const fileName = `${dni}_${Date.now()}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('fotos_perfil')
        .upload(filePath, imageFile, { upsert: true })

      if (uploadError) throw uploadError

      // 2. Obtener URL pública de la foto
      const { data: publicUrlData } = supabase.storage
        .from('fotos_perfil')
        .getPublicUrl(filePath)
      
      const fotoUrl = publicUrlData.publicUrl

      // 3. Guardar en la tabla 'fotocheck_perfiles'
      const { error: dbError } = await supabase
        .from('fotocheck_perfiles')
        .upsert({
          dni: dni,
          nombres_completos: nombres,
          area: selectedArea,
          foto_url: fotoUrl
        }, { onConflict: 'dni' }) 

      if (dbError) throw dbError

      // 4. Guardar en la memoria del navegador (localStorage)
      localStorage.setItem('RUAG_DNI', dni)
      localStorage.setItem('RUAG_NOMBRE', nombres)
      localStorage.setItem('RUAG_AREA', selectedArea)
      localStorage.setItem('RUAG_FOTO', fotoUrl)

      // 5. Redirigir mágicamente a la cámara escáner
      router.push('/escaner')

    } catch (error: any) {
      alert(`Error al guardar: ${error.message}`)
      setIsUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center py-12 px-6 overflow-y-auto">
      
      <div className="w-full max-w-md flex flex-col items-center">
        
        {/* Cabecera */}
        <h1 className="text-white text-2xl md:text-3xl font-black tracking-widest text-center">
          CREA TU FOTOCHECK
        </h1>
        <p className="text-slate-400 text-sm text-center mt-2 mb-10">
          Sube una foto clara de tu rostro para el registro.
        </p>

        {/* Input de archivo oculto */}
        <input 
          type="file" 
          accept="image/*" 
          ref={fileInputRef}
          onChange={handleImageChange}
          className="hidden"
        />

        {/* Avatar Circular Animado */}
        <div className="relative mb-12">
          {/* Aro de colores giratorio */}
          <div className={`absolute -inset-2 rounded-full bg-gradient-to-tr from-blue-600 via-emerald-500 to-blue-400 ${!imagePreview ? 'animate-pulse' : 'animate-[spin_4s_linear_infinite]'}`} />
          
          {/* Contenedor de la foto */}
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

          {/* Botón flotante para editar foto */}
          {imagePreview && (
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 z-20 w-10 h-10 bg-blue-600 rounded-full border-4 border-slate-950 flex items-center justify-center text-white hover:bg-blue-500 transition-colors"
            >
              <Edit2 size={16} />
            </button>
          )}
        </div>

        {/* Formulario de Datos */}
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

          {/* Selector de Área */}
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

        {/* Botón de Guardado */}
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

      </div>
    </div>
  )
}