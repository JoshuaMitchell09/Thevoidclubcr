-- =========================================================
-- THE VOID — base de datos (Supabase / Postgres)
-- Pegar completo en Supabase → SQL Editor → Run.
-- Se puede volver a correr: no borra datos existentes.
-- =========================================================

-- ---------- Ajustes de negocio ----------
-- Cupo por hora, horario y días de anticipación viven aquí para
-- que la base de datos los haga cumplir aunque alguien manipule la página.
create table if not exists public.ajustes (
  id            int primary key default 1 check (id = 1),
  cupo_por_hora int  not null default 3,
  hora_inicio   int  not null default 14,   -- primera cita 2:00 p.m.
  hora_fin      int  not null default 20,   -- cierre 8:00 p.m. (última cita 7:00 p.m.)
  dias_adelante int  not null default 14
);
insert into public.ajustes (id) values (1) on conflict (id) do nothing;

-- ---------- Personas registradas ----------
create table if not exists public.perfiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null,
  email      text not null,
  telefono   text,
  membresia  text not null default 'ninguna'
             check (membresia in ('ninguna', 'solicitada', 'activa', 'vencida')),
  creado     timestamptz not null default now()
);

-- ---------- Administradores (correos del staff) ----------
create table if not exists public.admins (
  email text primary key
);
insert into public.admins (email) values ('tvoidclub@gmail.com') on conflict do nothing;

-- ---------- Citas ----------
create table if not exists public.citas (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,
  user_id     uuid not null references public.perfiles (id) on delete cascade,
  fecha       date not null,
  hora        time not null,
  servicio    text not null,
  personas    int  not null check (personas between 1 and 2),
  acompanante text,
  notas       text,
  estado      text not null default 'activa' check (estado in ('activa', 'cancelada')),
  creado      timestamptz not null default now(),
  cancelado   timestamptz
);
create index if not exists citas_slot_idx on public.citas (fecha, hora) where estado = 'activa';
create index if not exists citas_user_idx on public.citas (user_id, fecha);

-- ---------- Helpers ----------
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where lower(a.email) = lower(auth.jwt() ->> 'email'));
$$;

create or replace function public.hoy_cr() returns date
language sql stable as $$ select (now() at time zone 'America/Costa_Rica')::date $$;

-- Crea el perfil automáticamente cuando alguien se registra.
create or replace function public.nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, email, telefono)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'telefono'), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_registrarse on auth.users;
create trigger al_registrarse after insert on auth.users
  for each row execute function public.nuevo_usuario();

-- ---------- Seguridad (Row Level Security) ----------
alter table public.ajustes  enable row level security;
alter table public.perfiles enable row level security;
alter table public.admins   enable row level security;
alter table public.citas    enable row level security;

drop policy if exists ajustes_leer on public.ajustes;
create policy ajustes_leer on public.ajustes for select using (true);

drop policy if exists perfiles_leer on public.perfiles;
create policy perfiles_leer on public.perfiles for select
  using (id = auth.uid() or public.es_admin());

drop policy if exists perfiles_editar on public.perfiles;
create policy perfiles_editar on public.perfiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists admins_leer on public.admins;
create policy admins_leer on public.admins for select using (public.es_admin());

drop policy if exists citas_leer on public.citas;
create policy citas_leer on public.citas for select
  using (user_id = auth.uid() or public.es_admin());

-- Los clientes solo pueden cambiar su nombre y teléfono; la membresía la cambia el staff.
revoke all on public.perfiles, public.citas, public.admins, public.ajustes from anon, authenticated;
grant select on public.ajustes to anon, authenticated;
grant select on public.perfiles, public.citas, public.admins to authenticated;
grant update (nombre, telefono) on public.perfiles to authenticated;

-- ---------- Funciones que usa la página ----------

-- Cupos ocupados por hora en un día (sin datos personales; visible para todos).
create or replace function public.disponibilidad(p_fecha date)
returns table (hora time, ocupados int)
language sql stable security definer set search_path = public as $$
  select c.hora, sum(c.personas)::int
  from public.citas c
  where c.fecha = p_fecha and c.estado = 'activa'
  group by c.hora;
$$;

-- Reservar: valida horario, cupo (3 por hora) y evita reservas duplicadas.
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

-- Cancelar una cita propia (o cualquiera, si es staff).
create or replace function public.cancelar_cita(p_id uuid)
returns public.citas
language plpgsql security definer set search_path = public as $$
declare v_cita public.citas;
begin
  if auth.uid() is null then raise exception 'NO_SESION'; end if;
  update public.citas set estado = 'cancelada', cancelado = now()
  where id = p_id and estado = 'activa'
    and (user_id = auth.uid() or public.es_admin())
  returning * into v_cita;
  if v_cita.id is null then raise exception 'NO_ENCONTRADA'; end if;
  return v_cita;
end $$;

-- El cliente pide unirse al club.
create or replace function public.solicitar_membresia()
returns public.perfiles
language plpgsql security definer set search_path = public as $$
declare v public.perfiles;
begin
  if auth.uid() is null then raise exception 'NO_SESION'; end if;
  update public.perfiles set membresia = 'solicitada'
  where id = auth.uid() and membresia in ('ninguna', 'vencida')
  returning * into v;
  if v.id is null then select * into v from public.perfiles where id = auth.uid(); end if;
  return v;
end $$;

-- El staff cambia el estado de la membresía.
create or replace function public.admin_membresia(p_user uuid, p_estado text)
returns public.perfiles
language plpgsql security definer set search_path = public as $$
declare v public.perfiles;
begin
  if not public.es_admin() then raise exception 'NO_AUTORIZADO'; end if;
  update public.perfiles set membresia = p_estado where id = p_user returning * into v;
  return v;
end $$;

revoke execute on function public.disponibilidad(date), public.reservar(date, time, text, int, text, text),
  public.cancelar_cita(uuid), public.solicitar_membresia(), public.admin_membresia(uuid, text),
  public.es_admin(), public.nuevo_usuario() from public;
grant execute on function public.disponibilidad(date) to anon, authenticated;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.reservar(date, time, text, int, text, text),
  public.cancelar_cita(uuid), public.solicitar_membresia(), public.admin_membresia(uuid, text)
  to authenticated;
