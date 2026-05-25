-- Ejecutar una vez en Supabase SQL Editor.
-- Agrega la fecha de cumpleanos al perfil del trabajador (no se crea tabla nueva,
-- se reutiliza fotocheck_perfiles que ya tiene una fila por persona).

alter table public.fotocheck_perfiles
  add column if not exists fecha_cumpleanos date;

-- Indice para listar/ordenar cumpleanos proximos por mes y dia.
create index if not exists idx_fotocheck_perfiles_cumpleanos
  on public.fotocheck_perfiles (fecha_cumpleanos);

comment on column public.fotocheck_perfiles.fecha_cumpleanos
  is 'Fecha de nacimiento del trabajador. Se usa para el modulo de cumpleanos (proximos cumpleanos y dia que cumplen).';
