-- =========================================================
-- THE VOID — migración 4: eventos administrables desde el panel
-- Pegar en Supabase → SQL Editor → Run. Se puede volver a correr.
-- =========================================================

create table if not exists public.eventos (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  hora         text,
  titulo       text not null check (length(trim(titulo)) > 0),
  tipo         text,
  lugar        text,
  descripcion  text,
  precio       text,
  enlace       text,
  publicado    boolean not null default true,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);
create index if not exists eventos_fecha_idx on public.eventos (fecha);

alter table public.eventos enable row level security;

-- es_admin() responde "no" a visitantes sin cuenta; se permite llamarla para evaluar las reglas.
grant execute on function public.es_admin() to anon;

drop policy if exists eventos_leer on public.eventos;
create policy eventos_leer on public.eventos for select using (publicado or public.es_admin());
drop policy if exists eventos_crear on public.eventos;
create policy eventos_crear on public.eventos for insert to authenticated with check (public.es_admin());
drop policy if exists eventos_editar on public.eventos;
create policy eventos_editar on public.eventos for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists eventos_borrar on public.eventos;
create policy eventos_borrar on public.eventos for delete to authenticated using (public.es_admin());

revoke all on public.eventos from anon, authenticated;
grant select on public.eventos to anon, authenticated;
grant insert, update, delete on public.eventos to authenticated;

create or replace function public.eventos_actualizado() returns trigger language plpgsql as $$
begin new.actualizado := now(); return new; end $$;
drop trigger if exists eventos_set_actualizado on public.eventos;
create trigger eventos_set_actualizado before update on public.eventos
  for each row execute function public.eventos_actualizado();
