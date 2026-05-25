'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const Lottie = dynamic(() => import('lottie-react'), { ssr: false })

type Props = {
  src: string
  loop?: boolean
  autoplay?: boolean
  className?: string
  style?: React.CSSProperties
}

// Carga el JSON de Lottie por URL (desde /public) y lo reproduce.
// El fetch evita meter animaciones pesadas (ej. confetti ~600KB) en el bundle.
export default function LottiePlayer({ src, loop = true, autoplay = true, className, style }: Props) {
  const [data, setData] = useState<unknown>(null)

  useEffect(() => {
    let active = true
    fetch(src)
      .then((r) => r.json())
      .then((json) => { if (active) setData(json) })
      .catch(() => {})
    return () => { active = false }
  }, [src])

  if (!data) return null
  return <Lottie animationData={data} loop={loop} autoplay={autoplay} className={className} style={style} />
}
