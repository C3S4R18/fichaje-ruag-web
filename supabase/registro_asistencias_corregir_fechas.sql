-- OPCIONAL — corrige registros históricos guardados con la fecha del día siguiente.
--
-- Correr DESPUÉS de registro_asistencias_multiturno.sql (sin la restricción UNIQUE
-- el UPDATE podría chocar con el registro real de ese día).
--
-- Afecta marcaciones hechas después de las 7 pm de Lima y colas offline subidas
-- otro día: se les asigna el día local en que realmente se marcó (según hora_ingreso
-- y el país del registro). No toca registros cuya fecha ya coincide.

-- 1) Vista previa: revisar antes de corregir.
SELECT
  id,
  nombres_completos,
  fecha AS fecha_actual,
  (hora_ingreso AT TIME ZONE CASE upper(coalesce(pais, 'PE'))
    WHEN 'ES' THEN 'Europe/Madrid'
    WHEN 'CL' THEN 'America/Santiago'
    WHEN 'CO' THEN 'America/Bogota'
    WHEN 'MX' THEN 'America/Mexico_City'
    WHEN 'AR' THEN 'America/Argentina/Buenos_Aires'
    WHEN 'EC' THEN 'America/Guayaquil'
    WHEN 'BO' THEN 'America/La_Paz'
    WHEN 'US' THEN 'America/New_York'
    ELSE 'America/Lima'
  END)::date AS fecha_correcta,
  to_char(hora_ingreso AT TIME ZONE 'America/Lima', 'DD/MM HH24:MI') AS ingreso_hora_lima,
  estado_ingreso,
  left(notas, 50) AS notas
FROM public.registro_asistencias
WHERE hora_ingreso IS NOT NULL
  AND fecha <> (hora_ingreso AT TIME ZONE CASE upper(coalesce(pais, 'PE'))
    WHEN 'ES' THEN 'Europe/Madrid'
    WHEN 'CL' THEN 'America/Santiago'
    WHEN 'CO' THEN 'America/Bogota'
    WHEN 'MX' THEN 'America/Mexico_City'
    WHEN 'AR' THEN 'America/Argentina/Buenos_Aires'
    WHEN 'EC' THEN 'America/Guayaquil'
    WHEN 'BO' THEN 'America/La_Paz'
    WHEN 'US' THEN 'America/New_York'
    ELSE 'America/Lima'
  END)::date
ORDER BY hora_ingreso;

-- 2) Corrección. Quitar los "--" de las líneas siguientes y ejecutar solo este bloque.
-- UPDATE public.registro_asistencias
-- SET fecha = (hora_ingreso AT TIME ZONE CASE upper(coalesce(pais, 'PE'))
--     WHEN 'ES' THEN 'Europe/Madrid'
--     WHEN 'CL' THEN 'America/Santiago'
--     WHEN 'CO' THEN 'America/Bogota'
--     WHEN 'MX' THEN 'America/Mexico_City'
--     WHEN 'AR' THEN 'America/Argentina/Buenos_Aires'
--     WHEN 'EC' THEN 'America/Guayaquil'
--     WHEN 'BO' THEN 'America/La_Paz'
--     WHEN 'US' THEN 'America/New_York'
--     ELSE 'America/Lima'
--   END)::date
-- WHERE hora_ingreso IS NOT NULL
--   AND fecha <> (hora_ingreso AT TIME ZONE CASE upper(coalesce(pais, 'PE'))
--     WHEN 'ES' THEN 'Europe/Madrid'
--     WHEN 'CL' THEN 'America/Santiago'
--     WHEN 'CO' THEN 'America/Bogota'
--     WHEN 'MX' THEN 'America/Mexico_City'
--     WHEN 'AR' THEN 'America/Argentina/Buenos_Aires'
--     WHEN 'EC' THEN 'America/Guayaquil'
--     WHEN 'BO' THEN 'America/La_Paz'
--     WHEN 'US' THEN 'America/New_York'
--     ELSE 'America/Lima'
--   END)::date;
