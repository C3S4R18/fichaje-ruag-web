-- Ejecutar una vez en Supabase SQL Editor.
-- Guarda las suscripciones Web Push (PWA iPhone/Android) para enviar el aviso
-- automatico del cumpleanos propio desde la Edge Function "birthday-push".

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  dni text not null,
  endpoint text not null unique,
  subscription jsonb not null,
  platform text not null default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_dni
  on public.push_subscriptions (dni);

alter table public.push_subscriptions enable row level security;

-- La app usa la anon key, asi que permitimos a anon administrar su suscripcion.
drop policy if exists "push_subscriptions lectura anon" on public.push_subscriptions;
create policy "push_subscriptions lectura anon"
  on public.push_subscriptions for select to anon using (true);

drop policy if exists "push_subscriptions insercion anon" on public.push_subscriptions;
create policy "push_subscriptions insercion anon"
  on public.push_subscriptions for insert to anon with check (true);

drop policy if exists "push_subscriptions actualizacion anon" on public.push_subscriptions;
create policy "push_subscriptions actualizacion anon"
  on public.push_subscriptions for update to anon using (true) with check (true);

drop policy if exists "push_subscriptions eliminacion anon" on public.push_subscriptions;
create policy "push_subscriptions eliminacion anon"
  on public.push_subscriptions for delete to anon using (true);

-- ───────────────────────────────────────────────────────────────────────────
-- OPCIONAL: programar la Edge Function "birthday-push" una vez al dia (9:00 Lima = 14:00 UTC).
-- Requiere extensiones pg_cron y pg_net (Dashboard > Database > Extensions).
-- Reemplaza <PROJECT_REF> y <SERVICE_ROLE_KEY> por los de tu proyecto.
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--   'birthday-push-diario',
--   '0 14 * * *',
--   $$
--   select net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/birthday-push',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--     ),
--     body    := '{}'::jsonb
--   );
--   $$
-- );

-- OPCIONAL: programar tambien recordatorios de salida PWA/iPhone.
-- 17:30 Lima = 22:30 UTC, 18:00 Lima = 23:00 UTC.
--
-- select cron.schedule(
--   'departure-push-1730',
--   '30 22 * * *',
--   $$
--   select net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/departure-push',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--     ),
--     body    := '{"slot":"1730"}'::jsonb
--   );
--   $$
-- );
--
-- select cron.schedule(
--   'departure-push-1800',
--   '0 23 * * *',
--   $$
--   select net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/departure-push',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--     ),
--     body    := '{"slot":"1800"}'::jsonb
--   );
--   $$
-- );
