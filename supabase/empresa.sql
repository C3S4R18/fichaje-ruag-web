-- Agrega columna empresa a fotocheck_perfiles
-- Valores permitidos: 'RUAG', 'ARUG', 'CG'
-- Nullable para no romper filas existentes; se llenan via modal on-update.

ALTER TABLE public.fotocheck_perfiles
  ADD COLUMN IF NOT EXISTS empresa TEXT;

ALTER TABLE public.fotocheck_perfiles
  DROP CONSTRAINT IF EXISTS fotocheck_perfiles_empresa_check;

ALTER TABLE public.fotocheck_perfiles
  ADD CONSTRAINT fotocheck_perfiles_empresa_check
  CHECK (empresa IS NULL OR empresa IN ('RUAG','ARUG','CG'));

CREATE INDEX IF NOT EXISTS idx_fotocheck_perfiles_empresa
  ON public.fotocheck_perfiles(empresa);
