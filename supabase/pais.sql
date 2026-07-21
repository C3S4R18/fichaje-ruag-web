-- Sistema de país / zona horaria por trabajador.
-- La puntualidad y el día de asistencia se calculan con el reloj LOCAL del país elegido.
-- Perú queda como valor por defecto (la mayoría del equipo está en Perú).

-- 1) País en el perfil (el que el trabajador elige/confirma).
ALTER TABLE public.fotocheck_perfiles
  ADD COLUMN IF NOT EXISTS pais TEXT DEFAULT 'PE';

ALTER TABLE public.fotocheck_perfiles
  DROP CONSTRAINT IF EXISTS fotocheck_perfiles_pais_check;

ALTER TABLE public.fotocheck_perfiles
  ADD CONSTRAINT fotocheck_perfiles_pais_check
  CHECK (pais IS NULL OR pais IN ('PE','ES','CL','CO','MX','AR','EC','BO','US'));

-- Perfiles existentes -> Perú
UPDATE public.fotocheck_perfiles SET pais = 'PE' WHERE pais IS NULL;

CREATE INDEX IF NOT EXISTS idx_fotocheck_perfiles_pais
  ON public.fotocheck_perfiles(pais);

-- 2) País capturado EN EL MOMENTO de marcar, para que los registros históricos
--    se sigan mostrando con la hora del país donde realmente se marcó,
--    aunque el trabajador cambie de país después.
ALTER TABLE public.registro_asistencias
  ADD COLUMN IF NOT EXISTS pais TEXT;

ALTER TABLE public.registro_asistencias
  DROP CONSTRAINT IF EXISTS registro_asistencias_pais_check;

ALTER TABLE public.registro_asistencias
  ADD CONSTRAINT registro_asistencias_pais_check
  CHECK (pais IS NULL OR pais IN ('PE','ES','CL','CO','MX','AR','EC','BO','US'));

CREATE INDEX IF NOT EXISTS idx_registro_asistencias_pais
  ON public.registro_asistencias(pais);
