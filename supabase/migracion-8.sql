-- =========================================================
-- THE VOID — migración 8: cada registro nuevo queda "pendiente de aprobar"
-- Pegar en Supabase → SQL Editor → Run (después de la 6 y 7). Se puede volver a correr.
-- =========================================================

-- Motivo visible para el cliente si el staff deniega su membresía.
alter table public.perfiles add column if not exists membresia_nota text;

-- Al registrarse: membresía "solicitada" (pendiente de aprobar), salvo cuentas de staff.
create or replace function public.nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.perfiles (id, nombre, email, telefono, emergencia_nombre, emergencia_telefono, emergencia_parentesco, membresia)
  values (
    new.id,
    coalesce(nullif(trim(m ->> 'nombre'), ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(trim(m ->> 'telefono'), ''),
    nullif(trim(m ->> 'emergencia_nombre'), ''),
    nullif(trim(m ->> 'emergencia_telefono'), ''),
    nullif(trim(m ->> 'emergencia_parentesco'), ''),
    case when exists (select 1 from public.admins a where lower(a.email) = lower(new.email)) then 'ninguna' else 'solicitada' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Al activarse o volver a solicitarse (p. ej. al reportar un pago), se borra el motivo de rechazo anterior.
create or replace function public.limpiar_nota_membresia() returns trigger language plpgsql as $$
begin
  if new.membresia in ('activa', 'solicitada') and new.membresia is distinct from old.membresia then new.membresia_nota := null; end if;
  return new;
end $$;
drop trigger if exists perfiles_limpiar_nota on public.perfiles;
create trigger perfiles_limpiar_nota before update of membresia on public.perfiles
  for each row execute function public.limpiar_nota_membresia();

-- El staff deniega una membresía pendiente (y rechaza sus pagos reportados, si había).
create or replace function public.admin_denegar_membresia(p_user uuid, p_motivo text)
returns public.perfiles
language plpgsql security definer set search_path = public as $$
declare v public.perfiles;
begin
  if not public.es_admin() then raise exception 'NO_AUTORIZADO'; end if;
  update public.pagos_pendientes set estado = 'rechazado', motivo = nullif(trim(p_motivo), ''), revisado = now(), revisado_por = auth.uid()
  where user_id = p_user and estado = 'pendiente';
  update public.perfiles set membresia = 'ninguna', membresia_nota = nullif(trim(p_motivo), '')
  where id = p_user returning * into v;
  return v;
end $$;

-- Al volver a pagar, la persona vuelve a quedar pendiente y se limpia el motivo.
create or replace function public.solicitar_membresia()
returns public.perfiles
language plpgsql security definer set search_path = public as $$
declare v public.perfiles;
begin
  if auth.uid() is null then raise exception 'NO_SESION'; end if;
  update public.perfiles set membresia = 'solicitada', membresia_nota = null
  where id = auth.uid() and membresia in ('ninguna', 'vencida')
  returning * into v;
  if v.id is null then select * into v from public.perfiles where id = auth.uid(); end if;
  return v;
end $$;

revoke execute on function public.admin_denegar_membresia(uuid, text) from public;
grant execute on function public.admin_denegar_membresia(uuid, text) to authenticated;
