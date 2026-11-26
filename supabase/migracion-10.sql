-- =========================================================
-- THE VOID — migración 10: sesiones individuales (mañana) aparte de las citas grupales
-- Pegar en Supabase → SQL Editor → Run. Se puede volver a correr.
-- =========================================================

alter table public.citas add column if not exists tipo text not null default 'grupal';
alter table public.citas drop constraint if exists citas_tipo_check;
alter table public.citas add constraint citas_tipo_check check (tipo in ('grupal', 'individual'));
create index if not exists citas_slot_tipo_idx on public.citas (fecha, hora, tipo) where estado = 'activa';

alter table public.ajustes add column if not exists individual_inicio int not null default 8;   -- primera sesión 8:00 a.m.
alter table public.ajustes add column if not exists individual_fin    int not null default 14;  -- termina a las 2:00 p.m. (última 1:00 p.m.)
alter table public.ajustes add column if not exists individual_cupo   int not null default 1;   -- personas por hora

-- Disponibilidad por tipo
drop function if exists public.disponibilidad(date);
create or replace function public.disponibilidad(p_fecha date, p_tipo text default 'grupal')
returns table (hora time, ocupados int)
language sql stable security definer set search_path = public as $$
  select c.hora, sum(c.personas)::int
  from public.citas c
  where c.fecha = p_fecha and c.estado = 'activa' and c.tipo = coalesce(p_tipo, 'grupal')
  group by c.hora;
$$;

-- Reservar (grupal o individual)
drop function if exists public.reservar(date, time, text, int, text, text);
create or replace function public.reservar(
  p_fecha date, p_hora time, p_servicio text,
  p_personas int default 1, p_acompanante text default null, p_notas text default null,
  p_tipo text default 'grupal')
returns public.citas
language plpgsql security definer set search_path = public as $$
declare
  a public.ajustes;
  v_ocupados int; v_cupo int; v_ini int; v_fin int;
  v_tipo text := coalesce(p_tipo, 'grupal');
  v_cita public.citas;
  v_ahora_cr timestamp := now() at time zone 'America/Costa_Rica';
begin
  if auth.uid() is null then raise exception 'NO_SESION'; end if;
  if not exists (select 1 from public.perfiles where id = auth.uid()) then raise exception 'SIN_PERFIL'; end if;
  if exists (select 1 from public.perfiles where id = auth.uid()
             and (coalesce(trim(emergencia_nombre), '') = '' or coalesce(trim(emergencia_telefono), '') = '')) then
    raise exception 'SIN_EMERGENCIA';
  end if;
  if not public.es_admin() and not exists (
       select 1 from public.perfiles where id = auth.uid() and membresia = 'activa'
         and (membresia_vence is null or membresia_vence >= public.hoy_cr())) then
    raise exception 'SIN_MEMBRESIA';
  end if;
  if v_tipo not in ('grupal', 'individual') then raise exception 'TIPO_INVALIDO'; end if;
  select * into a from public.ajustes where id = 1;
  if v_tipo = 'individual' then
    v_ini := a.individual_inicio; v_fin := a.individual_fin; v_cupo := a.individual_cupo;
    if p_personas <> 1 then raise exception 'INDIVIDUAL_UNA_PERSONA'; end if;
  else
    v_ini := a.hora_inicio; v_fin := a.hora_fin; v_cupo := a.cupo_por_hora;
  end if;

  if p_personas not in (1, 2) then raise exception 'PERSONAS_INVALIDAS'; end if;
  if p_personas = 2 and coalesce(trim(p_acompanante), '') = '' then raise exception 'FALTA_ACOMPANANTE'; end if;
  if coalesce(trim(p_servicio), '') = '' then raise exception 'FALTA_SERVICIO'; end if;
  if extract(minute from p_hora) <> 0 or extract(second from p_hora) <> 0
     or extract(hour from p_hora) < v_ini or extract(hour from p_hora) >= v_fin then
    raise exception 'HORA_INVALIDA';
  end if;
  if (p_fecha + p_hora) <= v_ahora_cr then raise exception 'HORA_PASADA'; end if;
  if p_fecha > v_ahora_cr::date + a.dias_adelante then raise exception 'MUY_ADELANTE'; end if;

  perform pg_advisory_xact_lock(hashtext('slot:' || v_tipo || ':' || p_fecha::text || ' ' || p_hora::text));

  if exists (select 1 from public.citas where user_id = auth.uid() and fecha = p_fecha
             and hora = p_hora and estado = 'activa') then
    raise exception 'YA_RESERVADO';
  end if;

  select coalesce(sum(personas), 0) into v_ocupados
  from public.citas where fecha = p_fecha and hora = p_hora and estado = 'activa' and tipo = v_tipo;
  if v_ocupados + p_personas > v_cupo then raise exception 'CUPO_LLENO'; end if;

  loop
    begin
      insert into public.citas (codigo, user_id, fecha, hora, servicio, personas, acompanante, notas, tipo)
      values ('VOID-' || upper(substr(md5(gen_random_uuid()::text), 1, 5)), auth.uid(), p_fecha, p_hora,
              trim(p_servicio), p_personas,
              case when p_personas = 2 then nullif(trim(p_acompanante), '') end,
              nullif(trim(p_notas), ''), v_tipo)
      returning * into v_cita;
      exit;
    exception when unique_violation then
    end;
  end loop;
  return v_cita;
end $$;

revoke execute on function public.disponibilidad(date, text), public.reservar(date, time, text, int, text, text, text) from public;
grant execute on function public.disponibilidad(date, text) to anon, authenticated;
grant execute on function public.reservar(date, time, text, int, text, text, text) to authenticated;
