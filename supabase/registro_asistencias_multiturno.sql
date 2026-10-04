-- Ingresos ilimitados por día (multi-turno) + fecha correcta del día local.
--
-- Problema 1: una restricción UNIQUE sobre (dni, fecha) rechazaba cualquier
--   segundo ingreso del mismo día ("duplicate key" -> "Solo se permite uno por día"),
--   aunque las apps ya permiten reingresar después de marcar salida.
--
-- Problema 2: fecha tenía DEFAULT CURRENT_DATE, que en Supabase corre en UTC.
--   La app Android no envía fecha, así que todo lo marcado después de las 7 pm
--   de Lima, y toda cola offline subida al día siguiente, quedaba con la fecha
--   del día siguiente. Ese registro "adelantado" bloqueaba el ingreso real del
--   día siguiente por la restricción del problema 1.
--
-- Ejecutar completo en Supabase > SQL Editor. Es idempotente: se puede correr
-- más de una vez sin efectos secundarios.

-- 1) Quitar toda restricción / índice UNIQUE que involucre dni (no toca la PK).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel     ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'registro_asistencias'
      AND con.contype = 'u'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = rel.oid AND a.attnum = ANY (con.conkey) AND a.attname = 'dni'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.registro_asistencias DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Restricción UNIQUE eliminada: %', r.conname;
  END LOOP;

  -- Índices UNIQUE creados a mano (CREATE UNIQUE INDEX), que no figuran como constraint.
  FOR r IN
    SELECT idx.relname AS indexname
    FROM pg_index x
    JOIN pg_class idx     ON idx.oid = x.indexrelid
    JOIN pg_class tbl     ON tbl.oid = x.indrelid
    JOIN pg_namespace nsp ON nsp.oid = tbl.relnamespace
    WHERE nsp.nspname = 'public'
      AND tbl.relname = 'registro_asistencias'
      AND x.indisunique
      AND NOT x.indisprimary
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid)
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = tbl.oid AND a.attnum = ANY (x.indkey) AND a.attname = 'dni'
      )
  LOOP
    EXECUTE format('DROP INDEX public.%I', r.indexname);
    RAISE NOTICE 'Índice UNIQUE eliminado: %', r.indexname;
  END LOOP;
END $$;

-- Índices normales (no únicos) para que las consultas por trabajador + día sigan
-- siendo rápidas sin el índice UNIQUE.
CREATE INDEX IF NOT EXISTS idx_registro_asistencias_dni_fecha
  ON public.registro_asistencias(dni, fecha);

CREATE INDEX IF NOT EXISTS idx_registro_asistencias_dni_hora_ingreso
  ON public.registro_asistencias(dni, hora_ingreso);

-- 2) fecha = día LOCAL del país en el momento del ingreso (no la fecha UTC del servidor).
--    Solo actúa cuando el cliente no envía fecha: versiones viejas de la app Android
--    y colas offline. La PWA y la app nueva ya mandan su fecha y no se tocan.
--    Se calcula desde hora_ingreso, así una cola offline subida mañana conserva
--    el día en que realmente se marcó.
CREATE OR REPLACE FUNCTION public.registro_asistencias_fecha_local()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  tz TEXT;
BEGIN
  IF NEW.fecha IS NULL THEN
    tz := CASE upper(coalesce(NEW.pais, 'PE'))
      WHEN 'ES' THEN 'Europe/Madrid'
      WHEN 'CL' THEN 'America/Santiago'
      WHEN 'CO' THEN 'America/Bogota'
      WHEN 'MX' THEN 'America/Mexico_City'
      WHEN 'AR' THEN 'America/Argentina/Buenos_Aires'
      WHEN 'EC' THEN 'America/Guayaquil'
      WHEN 'BO' THEN 'America/La_Paz'
      WHEN 'US' THEN 'America/New_York'
      ELSE 'America/Lima'
    END;
    NEW.fecha := (coalesce(NEW.hora_ingreso, now()) AT TIME ZONE tz)::date;
  END IF;
  RETURN NEW;
END $$;

-- Sin DEFAULT: si el cliente omite fecha llega NULL y el trigger la calcula.
-- (Con DEFAULT CURRENT_DATE el trigger recibiría la fecha UTC ya puesta.)
ALTER TABLE public.registro_asistencias
  ALTER COLUMN fecha DROP DEFAULT;

DROP TRIGGER IF EXISTS trg_registro_asistencias_fecha_local ON public.registro_asistencias;
CREATE TRIGGER trg_registro_asistencias_fecha_local
  BEFORE INSERT ON public.registro_asistencias
  FOR EACH ROW EXECUTE FUNCTION public.registro_asistencias_fecha_local();

-- 3) Verificación: no debe quedar ninguna fila (salvo la PK, que no aparece aquí).
SELECT idx.relname AS indice_unico_restante
FROM pg_index x
JOIN pg_class idx ON idx.oid = x.indexrelid
JOIN pg_class tbl ON tbl.oid = x.indrelid
WHERE tbl.relname = 'registro_asistencias'
  AND x.indisunique
  AND NOT x.indisprimary;
