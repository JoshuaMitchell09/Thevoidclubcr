-- =========================================================
-- THE VOID — migración 6: pagos solo por SINPE Móvil o efectivo
-- Pegar en Supabase → SQL Editor → Run. Se puede volver a correr.
-- =========================================================

-- Acepta "efectivo" como forma de pago reportada (se paga en el club y el staff lo confirma).
alter table public.pagos_pendientes drop constraint if exists pagos_pendientes_metodo_check;
alter table public.pagos_pendientes add constraint pagos_pendientes_metodo_check
  check (metodo in ('sinpe', 'efectivo', 'tarjeta'));

create or replace function public.reportar_pago(
  p_codigo text, p_meses int, p_metodo text, p_referencia text, p_comprobante_path text default null)
returns public.pagos_pendientes
language plpgsql security definer set search_path = public as $$
declare v public.pagos_pendientes; precio int; ref text := upper(regexp_replace(coalesce(p_referencia, ''), '\s', '', 'g'));
begin
  if auth.uid() is null then raise exception 'NO_SESION'; end if;
  if p_meses not in (1, 2, 3, 6, 12) then raise exception 'MESES_INVALIDOS'; end if;
  if p_metodo not in ('sinpe', 'efectivo') then raise exception 'METODO_INVALIDO'; end if;
  if p_codigo !~ '^VOID-P-[A-Z0-9]{5}$' then raise exception 'CODIGO_INVALIDO'; end if;
  if p_metodo = 'efectivo' then
    ref := p_codigo;                 -- en efectivo la referencia es el código que muestra el cliente en el club
  else
    if length(ref) < 4 then raise exception 'FALTA_REFERENCIA'; end if;
    if p_comprobante_path is null then raise exception 'FALTA_COMPROBANTE'; end if;
  end if;
  if p_comprobante_path is not null and split_part(p_comprobante_path, '/', 1) <> auth.uid()::text then raise exception 'COMPROBANTE_INVALIDO'; end if;
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
  update public.perfiles set membresia = 'solicitada' where id = auth.uid() and membresia in ('ninguna', 'vencida');
  return v;
end $$;

create or replace function public.admin_aprobar_pago(p_id uuid)
returns public.pagos_pendientes
language plpgsql security definer set search_path = public as $$
declare pp public.pagos_pendientes; pg public.pagos;
begin
  if not public.es_admin() then raise exception 'NO_AUTORIZADO'; end if;
  select * into pp from public.pagos_pendientes where id = p_id for update;
  if pp.id is null or pp.estado <> 'pendiente' then raise exception 'NO_PENDIENTE'; end if;
  pg := public.admin_registrar_pago(pp.user_id, pp.monto, pp.metodo, 'membresia', pp.meses, public.hoy_cr(),
          case pp.metodo when 'sinpe' then 'SINPE ref. ' || pp.referencia || ' · ' || pp.codigo
                         when 'efectivo' then 'Efectivo en el club · ' || pp.codigo
                         else 'Tarjeta ref. ' || pp.referencia || ' · ' || pp.codigo end);
  update public.pagos_pendientes set estado = 'aprobado', pago_id = pg.id, revisado = now(), revisado_por = auth.uid()
  where id = p_id returning * into pp;
  return pp;
end $$;
