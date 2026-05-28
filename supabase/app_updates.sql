-- Ejecutar una vez en Supabase SQL Editor.
-- Cada vez que publiques una nueva version en Play Store, inserta aqui una fila
-- con el versionCode/versionName que coincida y la lista de cambios.
-- La app Android mostrara un modal personalizado con ese contenido cuando detecte
-- la actualizacion disponible.

create table if not exists public.app_updates (
  id uuid primary key default gen_random_uuid(),
  version_code int not null,
  version_name text not null,
  changes text[] not null default '{}',
  is_critical boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_app_updates_version_code
  on public.app_updates (version_code);

alter table public.app_updates enable row level security;

drop policy if exists "app_updates lectura anon" on public.app_updates;
create policy "app_updates lectura anon"
  on public.app_updates for select to anon using (true);

drop policy if exists "app_updates insercion anon" on public.app_updates;
create policy "app_updates insercion anon"
  on public.app_updates for insert to anon with check (true);

drop policy if exists "app_updates actualizacion anon" on public.app_updates;
create policy "app_updates actualizacion anon"
  on public.app_updates for update to anon using (true) with check (true);

-- Ejemplo de fila (descomenta y ajusta cuando publiques):
-- insert into public.app_updates (version_code, version_name, changes, is_critical) values
-- (27, '3.8.8', array[
--   'Calendario mejorado y mas animado',
--   'Pantalla de cumpleanos con confeti',
--   'Recordatorios automaticos de salida',
--   'Aviso push del cumpleanos propio'
-- ], false);
