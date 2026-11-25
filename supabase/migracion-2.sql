-- =========================================================
-- THE VOID — migración 2: perfil completo, fotos y pagos
-- Pegar en Supabase → SQL Editor → Run (después de schema.sql).
-- Se puede volver a correr sin perder datos.
-- =========================================================

-- ---------- Perfil ampliado ----------
alter table public.perfiles add column if not exists foto_path text;
alter table public.perfiles add column if not exists fecha_nacimiento date;
alter table public.perfiles add column if not exists emergencia_nombre text;
alter table public.perfiles add column if not exists emergencia_telefono text;
alter table public.perfiles add column if not exists emergencia_parentesco text;
alter table public.perfiles add column if not exists salud text;
alter table public.perfiles add column if not exists membresia_vence date;

-- El cliente puede editar sus propios datos personales (no la membresía).
grant update (nombre, telefono, foto_path, fecha_nacimiento,
              emergencia_nombre, emergencia_telefono, emergencia_parentesco, salud)
  on public.perfiles to authenticated;

-- El registro guarda también el contacto de emergencia.
create or replace function public.nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.perfiles (id, nombre, email, telefono, emergencia_nombre, emergencia_telefono, emergencia_parentesco)
  values (
    new.id,
    coalesce(nullif(trim(m ->> 'nombre'), ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(trim(m ->> 'telefono'), ''),
    nullif(trim(m ->> 'emergencia_nombre'), ''),
    nullif(trim(m ->> 'emergencia_telefono'), ''),
    nullif(trim(m ->> 'emergencia_parentesco'), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------- Reservar exige contacto de emergencia ----------
create or replace function public.reservar(
  p_fecha date, p_hora time, p_servicio text,
  p_personas int default 1, p_acompanante text default null, p_notas text default null)
returns public.citas
language plpgsql security definer set search_path = public as $$
declare
  a public.ajustes;
  v_ocupados int;
  v_cita public.citas;
  v_ahora_cr timestamp := now() at time zone 'America/Costa_Rica';
begin
  if auth.uid() is null then raise exception 'NO_SESION'; end if;
  if not exists (select 1 from public.perfiles where id = auth.uid()) then raise exception 'SIN_PERFIL'; end if;
  if exists (select 1 from public.perfiles where id = auth.uid()
             and (coalesce(trim(emergencia_nombre), '') = '' or coalesce(trim(emergencia_telefono), '') = '')) then
    raise exception 'SIN_EMERGENCIA';
  end if;
  select * into a from public.ajustes where id = 1;

  if p_personas not in (1, 2) then raise exception 'PERSONAS_INVALIDAS'; end if;
  if p_personas = 2 and coalesce(trim(p_acompanante), '') = '' then raise exception 'FALTA_ACOMPANANTE'; end if;
  if coalesce(trim(p_servicio), '') = '' then raise exception 'FALTA_SERVICIO'; end if;
  if extract(minute from p_hora) <> 0 or extract(second from p_hora) <> 0
     or extract(hour from p_hora) < a.hora_inicio or extract(hour from p_hora) >= a.hora_fin then
    raise exception 'HORA_INVALIDA';
  end if;
  if (p_fecha + p_hora) <= v_ahora_cr then raise exception 'HORA_PASADA'; end if;
  if p_fecha > v_ahora_cr::date + a.dias_adelante then raise exception 'MUY_ADELANTE'; end if;

  -- Bloquea este horario mientras se calcula el cupo (evita sobrecupo si dos reservan a la vez).
  perform pg_advisory_xact_lock(hashtext('slot:' || p_fecha::text || ' ' || p_hora::text));

  if exists (select 1 from public.citas where user_id = auth.uid() and fecha = p_fecha
             and hora = p_hora and estado = 'activa') then
    raise exception 'YA_RESERVADO';
  end if;

  select coalesce(sum(personas), 0) into v_ocupados
  from public.citas where fecha = p_fecha and hora = p_hora and estado = 'activa';
  if v_ocupados + p_personas > a.cupo_por_hora then raise exception 'CUPO_LLENO'; end if;

  loop
    begin
      insert into public.citas (codigo, user_id, fecha, hora, servicio, personas, acompanante, notas)
      values ('VOID-' || upper(substr(md5(gen_random_uuid()::text), 1, 5)), auth.uid(), p_fecha, p_hora,
              trim(p_servicio), p_personas,
              case when p_personas = 2 then nullif(trim(p_acompanante), '') end,
              nullif(trim(p_notas), ''))
      returning * into v_cita;
      exit;
    exception when unique_violation then
      -- código repetido: se genera otro
    end;
  end loop;
  return v_cita;
end $$;

-- ---------- Pagos ----------
create table if not exists public.pagos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.perfiles (id) on delete set null,
  monto       int  not null check (monto > 0),            -- colones
  fecha       date not null default ((now() at time zone 'America/Costa_Rica')::date),
  metodo      text not null check (metodo in ('sinpe', 'efectivo', 'tarjeta', 'transferencia')),
  concepto    text not null check (concepto in ('membresia', 'fisioterapia', 'evento', 'otro')),
  meses       int  not null default 0 check (meses between 0 and 24),
  nota        text,
  creado_por  uuid default auth.uid(),
  creado      timestamptz not null default now()
);
create index if not exists pagos_fecha_idx on public.pagos (fecha);
create index if not exists pagos_user_idx on public.pagos (user_id);
alter table public.pagos enable row level security;

drop policy if exists pagos_leer on public.pagos;
create policy pagos_leer on public.pagos for select
  using (user_id = auth.uid() or public.es_admin());
drop policy if exists pagos_borrar on public.pagos;
create policy pagos_borrar on public.pagos for delete using (public.es_admin());

revoke all on public.pagos from anon, authenticated;
grant select, delete on public.pagos to authenticated;

-- Registrar un pago (solo staff). Si es de membresía, la activa y extiende el vencimiento.
create or replace function public.admin_registrar_pago(
  p_user uuid, p_monto int, p_metodo text, p_concepto text,
  p_meses int default 0, p_fecha date default null, p_nota text default null)
returns public.pagos
language plpgsql security definer set search_path = public as $$
declare v public.pagos; base date;
begin
  if not public.es_admin() then raise exception 'NO_AUTORIZADO'; end if;
  insert into public.pagos (user_id, monto, metodo, concepto, meses, fecha, nota)
  values (p_user, p_monto, p_metodo, p_concepto,
          case when p_concepto = 'membresia' then greatest(coalesce(p_meses, 1), 1) else 0 end,
          coalesce(p_fecha, public.hoy_cr()), nullif(trim(p_nota), ''))
  returning * into v;
  if p_concepto = 'membresia' and p_user is not null then
    select greatest(coalesce(membresia_vence, public.hoy_cr()), public.hoy_cr()) into base
      from public.perfiles where id = p_user;
    update public.perfiles
      set membresia = 'activa',
          membresia_vence = (base + make_interval(months => v.meses))::date
      where id = p_user;
  end if;
  return v;
end $$;

-- Marca como vencidas las membresías cuya fecha ya pasó (lo llama el panel al abrir).
create or replace function public.actualizar_vencidas()
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.es_admin() then raise exception 'NO_AUTORIZADO'; end if;
  update public.perfiles set membresia = 'vencida'
  where membresia = 'activa' and membresia_vence is not null and membresia_vence < public.hoy_cr();
  get diagnostics n = row_count;
  return n;
end $$;

-- El staff puede fijar a mano la fecha de vencimiento.
create or replace function public.admin_vencimiento(p_user uuid, p_vence date)
returns public.perfiles
language plpgsql security definer set search_path = public as $$
declare v public.perfiles;
begin
  if not public.es_admin() then raise exception 'NO_AUTORIZADO'; end if;
  update public.perfiles set membresia_vence = p_vence,
    membresia = case when p_vence is not null and p_vence >= public.hoy_cr() then 'activa' else membresia end
  where id = p_user returning * into v;
  return v;
end $$;

revoke execute on function public.admin_registrar_pago(uuid, int, text, text, int, date, text),
  public.actualizar_vencidas(), public.admin_vencimiento(uuid, date) from public;
grant execute on function public.admin_registrar_pago(uuid, int, text, text, int, date, text),
  public.actualizar_vencidas(), public.admin_vencimiento(uuid, date) to authenticated;

-- ---------- Fotos de perfil (Storage, privado) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Cada persona maneja solo su carpeta (fotos/<su id>/...). El staff puede ver todas.
drop policy if exists fotos_leer on storage.objects;
create policy fotos_leer on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));
drop policy if exists fotos_subir on storage.objects;
create policy fotos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists fotos_cambiar on storage.objects;
create policy fotos_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists fotos_borrar on storage.objects;
create policy fotos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
