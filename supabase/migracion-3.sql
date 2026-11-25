-- =========================================================
-- THE VOID — migración 3: pagos en línea (SINPE / tarjeta) con verificación
-- Pegar en Supabase → SQL Editor → Run (después de migracion-2.sql).
-- Se puede volver a correr sin perder datos.
-- =========================================================

-- Precio oficial: la base de datos calcula el monto (no la página).
alter table public.ajustes add column if not exists precio_membresia int not null default 30000;

-- ---------- Pagos reportados por clientes, esperando verificación ----------
create table if not exists public.pagos_pendientes (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique,             -- código que el cliente pone en la descripción del SINPE
  user_id          uuid not null references public.perfiles (id) on delete cascade,
  concepto         text not null default 'membresia' check (concepto in ('membresia')),
  meses            int  not null check (meses between 1 and 12),
  monto            int  not null check (monto > 0),
  metodo           text not null check (metodo in ('sinpe', 'tarjeta')),
  referencia       text not null,                    -- n.º de comprobante SINPE o de transacción
  comprobante_path text,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  motivo           text,
  pago_id          uuid references public.pagos (id) on delete set null,
  creado           timestamptz not null default now(),
  revisado         timestamptz,
  revisado_por     uuid
);
create index if not exists pp_estado_idx on public.pagos_pendientes (estado, creado);
create index if not exists pp_user_idx on public.pagos_pendientes (user_id, creado);
-- El mismo comprobante no se puede usar dos veces (salvo que haya sido rechazado).
create unique index if not exists pp_ref_unica on public.pagos_pendientes (metodo, referencia) where estado <> 'rechazado';

alter table public.pagos_pendientes enable row level security;
drop policy if exists pp_leer on public.pagos_pendientes;
create policy pp_leer on public.pagos_pendientes for select using (user_id = auth.uid() or public.es_admin());
revoke all on public.pagos_pendientes from anon, authenticated;
grant select on public.pagos_pendientes to authenticated;

-- El cliente reporta su pago.
create or replace function public.reportar_pago(
  p_codigo text, p_meses int, p_metodo text, p_referencia text, p_comprobante_path text default null)
returns public.pagos_pendientes
language plpgsql security definer set search_path = public as $$
declare v public.pagos_pendientes; precio int; ref text := upper(regexp_replace(coalesce(p_referencia, ''), '\s', '', 'g'));
begin
  if auth.uid() is null then raise exception 'NO_SESION'; end if;
  if p_meses not in (1, 2, 3, 6, 12) then raise exception 'MESES_INVALIDOS'; end if;
  if p_metodo not in ('sinpe', 'tarjeta') then raise exception 'METODO_INVALIDO'; end if;
  if length(ref) < 4 then raise exception 'FALTA_REFERENCIA'; end if;
  if p_codigo !~ '^VOID-P-[A-Z0-9]{5}$' then raise exception 'CODIGO_INVALIDO'; end if;
  if p_comprobante_path is not null and split_part(p_comprobante_path, '/', 1) <> auth.uid()::text then raise exception 'COMPROBANTE_INVALIDO'; end if;
  if p_metodo = 'sinpe' and p_comprobante_path is null then raise exception 'FALTA_COMPROBANTE'; end if;
  if (select count(*) from public.pagos_pendientes where user_id = auth.uid() and estado = 'pendiente') >= 2 then
    raise exception 'DEMASIADOS_PENDIENTES';
  end if;
  if exists (select 1 from public.pagos_pendientes where metodo = p_metodo and referencia = ref and estado <> 'rechazado') then
    raise exception 'REFERENCIA_USADA';
  end if;
  select precio_membresia into precio from public.ajustes where id = 1;
  insert into public.pagos_pendientes (codigo, user_id, meses, monto, metodo, referencia, comprobante_path)
  values (p_codigo, auth.uid(), p_meses, precio * p_meses, p_metodo, ref, p_comprobante_path)
  returning * into v;
  -- Marca la membresía como "solicitada" si no está activa.
  update public.perfiles set membresia = 'solicitada' where id = auth.uid() and membresia in ('ninguna', 'vencida');
  return v;
end $$;

-- El staff aprueba: registra el pago real y activa/extiende la membresía.
create or replace function public.admin_aprobar_pago(p_id uuid)
returns public.pagos_pendientes
language plpgsql security definer set search_path = public as $$
declare pp public.pagos_pendientes; pg public.pagos;
begin
  if not public.es_admin() then raise exception 'NO_AUTORIZADO'; end if;
  select * into pp from public.pagos_pendientes where id = p_id for update;
  if pp.id is null or pp.estado <> 'pendiente' then raise exception 'NO_PENDIENTE'; end if;
  pg := public.admin_registrar_pago(pp.user_id, pp.monto, pp.metodo, 'membresia', pp.meses, public.hoy_cr(),
          (case pp.metodo when 'sinpe' then 'SINPE' else 'Tarjeta' end) || ' ref. ' || pp.referencia || ' · ' || pp.codigo);
  update public.pagos_pendientes set estado = 'aprobado', pago_id = pg.id, revisado = now(), revisado_por = auth.uid()
  where id = p_id returning * into pp;
  return pp;
end $$;

-- El staff rechaza (comprobante ilegible, monto incorrecto, no llegó, etc.).
create or replace function public.admin_rechazar_pago(p_id uuid, p_motivo text)
returns public.pagos_pendientes
language plpgsql security definer set search_path = public as $$
declare pp public.pagos_pendientes;
begin
  if not public.es_admin() then raise exception 'NO_AUTORIZADO'; end if;
  update public.pagos_pendientes set estado = 'rechazado', motivo = nullif(trim(p_motivo), ''), revisado = now(), revisado_por = auth.uid()
  where id = p_id and estado = 'pendiente' returning * into pp;
  if pp.id is null then raise exception 'NO_PENDIENTE'; end if;
  -- Si no le queda otro pago pendiente ni membresía activa, vuelve a "ninguna".
  update public.perfiles set membresia = 'ninguna'
  where id = pp.user_id and membresia = 'solicitada'
    and not exists (select 1 from public.pagos_pendientes where user_id = pp.user_id and estado = 'pendiente');
  return pp;
end $$;

revoke execute on function public.reportar_pago(text, int, text, text, text),
  public.admin_aprobar_pago(uuid), public.admin_rechazar_pago(uuid, text) from public;
grant execute on function public.reportar_pago(text, int, text, text, text),
  public.admin_aprobar_pago(uuid), public.admin_rechazar_pago(uuid, text) to authenticated;

-- ---------- Comprobantes (Storage, privado) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

drop policy if exists comp_leer on storage.objects;
create policy comp_leer on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));
drop policy if exists comp_subir on storage.objects;
create policy comp_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text);
