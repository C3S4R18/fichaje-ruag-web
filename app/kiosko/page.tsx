'use client'

import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Activity } from 'lucide-react'
import { format } from 'date-fns'

export default function KioskoQR() {
  const [qrValue, setQrValue] = useState("RUAG_INGRESO")
  const [time, setTime] = useState(new Date())
  
  // ¡LA SOLUCIÓN! Agregamos el estado para saber cuándo ya estamos en el navegador
  const [mounted, setMounted] = useState(false)

  // Le decimos a React que ya estamos en el navegador
  useEffect(() => {
    setMounted(true)
  }, [])

  // 1. Reloj en tiempo real
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // 2. Lógica del QR Dinámico (Cambia cada 10 segundos)
  useEffect(() => {
    const actualizarQR = () => {
      const ventanaTiempo = Math.floor(Date.now() / 10000);
      setQrValue(`RUAG_INGRESO_${ventanaTiempo}`);
    };
    actualizarQR();
    const intervalo = setInterval(actualizarQR, 1000);
    return () => clearInterval(intervalo);
  }, []);

  // Si aún no está montado en el navegador, no dibujamos nada para evitar el error
  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col p-4 md:p-8 select-none">
      
      <div className="w-full flex flex-col sm:flex-row justify-between items-center gap-4 sm:gap-0 shrink-0">
        
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.5)] text-white shrink-0">
            <Activity className="w-6 h-6 md:w-9 md:h-9" />
          </div>
          <div className="text-center sm:text-left">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white leading-none">RUAG</h1>
            <p className="text-xs md:text-sm font-bold text-blue-400 uppercase tracking-[0.2em] mt-1">Ingreso Seguro</p>
          </div>
        </div>

        <div className="text-center sm:text-right">
          <p className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter tabular-nums drop-shadow-lg">
            {format(time, 'HH:mm:ss')}
          </p>
          <p className="text-emerald-400 font-bold tracking-widest uppercase text-xs md:text-sm mt-1 md:mt-2">
            Hora Oficial
          </p>
        </div>
        
      </div>

      <div className="flex-1 w-full flex flex-col items-center justify-center mt-8 sm:mt-0 py-4">
        
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white mb-2 md:mb-4 tracking-tight text-center">
          CÓDIGO DE INGRESO
        </h2>
        <p className="text-blue-400 font-bold tracking-widest uppercase text-xs sm:text-sm md:text-xl mb-6 md:mb-12 animate-pulse text-center">
          Apunta con la App de Ruag
        </p>
        
        <div className="bg-white p-4 sm:p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-[0_0_50px_rgba(59,130,246,0.3)] border-4 md:border-8 border-slate-800">
          <div className="w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 lg:w-96 lg:h-96">
            <QRCodeSVG 
              value={qrValue} 
              style={{ width: "100%", height: "100%" }} 
              level="H" 
              includeMargin={false} 
            />
          </div>
        </div>
        
        <div className="mt-8 md:mt-12 flex items-center gap-2 md:gap-3 text-slate-400 bg-slate-900 px-4 md:px-6 py-2 md:py-3 rounded-full border border-slate-800">
          <Activity size={20} className="text-blue-500 animate-spin md:w-6 md:h-6" style={{ animationDuration: '3s' }}/>
          <p className="font-mono text-[10px] sm:text-xs md:text-lg uppercase tracking-wider text-center">
            Sistema Antifraude Dinámico Activo
          </p>
        </div>

      </div>

    </div>
  )
}