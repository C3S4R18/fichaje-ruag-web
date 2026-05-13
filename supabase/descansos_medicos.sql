-- Ejecutar una vez en Supabase SQL Editor.
-- Crea solicitudes de descanso medico y bucket publico para evidencias.

create table if not exists public.descansos_medicos_solicitudes (
  id uuid primary key default gen_random_uuid(),
  dni text not null,
  trabajador_nombre text not null,
  area text,
  fecha_inicio date not null,
  fecha_fin date not null,
  comentario text,
  evidencia_url text not null,
  evidencia_path text,
  estado text not null default 'solicitada'
    check (estado in ('solicitada', 'aprobada', 'rechazada')),
  created_at timestamp with time zone not null default now(),
  reviewed_at timestamp with time zone,
  constraint descansos_medicos_fecha_check check (fecha_fin >= fecha_inicio)
);

create index if not exists idx_descansos_medicos_estado_created
  on public.descansos_medicos_solicitudes (estado, created_at desc);

create index if not exists idx_descansos_medicos_dni_fechas
  on public.descansos_medicos_solicitudes (dni, fecha_inicio, fecha_fin);

alter table public.descansos_medicos_solicitudes
  add column if not exists evidencia_urls jsonb not null default '[]'::jsonb,
  add column if not exists evidencia_paths jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('descansos_medicos', 'descansos_medicos', true)
on conflict (id) do update set public = true;

alter table public.descansos_medicos_solicitudes enable row level security;

drop policy if exists "descansos medicos lectura anon" on public.descansos_medicos_solicitudes;
create policy "descansos medicos lectura anon"
on public.descansos_medicos_solicitudes
for select
to anon
using (true);

drop policy if exists "descansos medicos insercion anon" on public.descansos_medicos_solicitudes;
create policy "descansos medicos insercion anon"
on public.descansos_medicos_solicitudes
for insert
to anon
with check (true);

drop policy if exists "descansos medicos actualizacion anon" on public.descansos_medicos_solicitudes;
create policy "descansos medicos actualizacion anon"
on public.descansos_medicos_solicitudes
for update
to anon
using (true)
with check (true);

drop policy if exists "descansos medicos eliminacion anon" on public.descansos_medicos_solicitudes;
create policy "descansos medicos eliminacion anon"
on public.descansos_medicos_solicitudes
for delete
to anon
using (true);

drop policy if exists "descansos medicos storage lectura anon" on storage.objects;
create policy "descansos medicos storage lectura anon"
on storage.objects
for select
to anon
using (bucket_id = 'descansos_medicos');

drop policy if exists "descansos medicos storage subida anon" on storage.objects;
create policy "descansos medicos storage subida anon"
on storage.objects
for insert
to anon
with check (bucket_id = 'descansos_medicos');

drop policy if exists "descansos medicos storage actualizacion anon" on storage.objects;
create policy "descansos medicos storage actualizacion anon"
on storage.objects
for update
to anon
using (bucket_id = 'descansos_medicos')
with check (bucket_id = 'descansos_medicos');

drop policy if exists "descansos medicos storage eliminacion anon" on storage.objects;
create policy "descansos medicos storage eliminacion anon"
on storage.objects
for delete
to anon
using (bucket_id = 'descansos_medicos');
