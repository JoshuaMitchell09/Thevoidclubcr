-- =========================================================
-- THE VOID — migración 7: rutinas por imagen para cada cliente
-- Pegar en Supabase → SQL Editor → Run. Se puede volver a correr.
-- =========================================================

create table if not exists public.rutinas (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.perfiles (id) on delete cascade,
  titulo          text not null check (length(trim(titulo)) > 0),
  nota            text,
  imagen_path     text not null,
  creado_por      uuid default auth.uid(),
  creado          timestamptz not null default now(),
  correo_enviado  timestamptz
);
create index if not exists rutinas_user_idx on public.rutinas (user_id, creado desc);

alter table public.rutinas enable row level security;
drop policy if exists rutinas_leer on public.rutinas;
create policy rutinas_leer on public.rutinas for select using (user_id = auth.uid() or public.es_admin());
drop policy if exists rutinas_crear on public.rutinas;
create policy rutinas_crear on public.rutinas for insert to authenticated with check (public.es_admin());
drop policy if exists rutinas_editar on public.rutinas;
create policy rutinas_editar on public.rutinas for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists rutinas_borrar on public.rutinas;
create policy rutinas_borrar on public.rutinas for delete to authenticated using (public.es_admin());

revoke all on public.rutinas from anon, authenticated;
grant select, insert, update, delete on public.rutinas to authenticated;

-- Imágenes de rutinas (Storage, privado): rutinas/<id del cliente>/<archivo>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rutinas', 'rutinas', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

drop policy if exists rut_leer on storage.objects;
create policy rut_leer on storage.objects for select to authenticated
  using (bucket_id = 'rutinas' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));
drop policy if exists rut_subir on storage.objects;
create policy rut_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'rutinas' and public.es_admin());
drop policy if exists rut_borrar on storage.objects;
create policy rut_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'rutinas' and public.es_admin());
