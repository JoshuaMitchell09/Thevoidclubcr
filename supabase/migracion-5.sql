-- =========================================================
-- THE VOID — migración 5: solo se agenda con membresía activa
-- Pegar en Supabase → SQL Editor → Run (después de migracion-2.sql).
-- Se puede volver a correr.
-- =========================================================

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
  -- Solo con membresía activa (el staff siempre puede agendar).
  if not public.es_admin() and not exists (
       select 1 from public.perfiles where id = auth.uid() and membresia = 'activa'
         and (membresia_vence is null or membresia_vence >= public.hoy_cr())) then
    raise exception 'SIN_MEMBRESIA';
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
