-- =========================================================
-- THE VOID — migración 9: facturación interna (recibos), gastos y datos del negocio
-- Pegar en Supabase → SQL Editor → Run. Se puede volver a correr.
-- Nota: estos recibos son comprobantes internos; no sustituyen la factura
-- electrónica de Hacienda (eso requiere una integración aparte).
-- =========================================================

-- ---------- Datos de facturación ----------
alter table public.perfiles add column if not exists cedula text;
grant update (nombre, telefono, cedula, foto_path, fecha_nacimiento,
              emergencia_nombre, emergencia_telefono, emergencia_parentesco, salud)
  on public.perfiles to authenticated;

alter table public.ajustes add column if not exists negocio_nombre    text not null default 'THE VOID · Performance & Recovery Club';
alter table public.ajustes add column if not exists negocio_cedula    text;
alter table public.ajustes add column if not exists negocio_telefono  text not null default '6200-2634';
alter table public.ajustes add column if not exists negocio_correo    text not null default 'tvoidclub@gmail.com';
alter table public.ajustes add column if not exists negocio_direccion text;
alter table public.ajustes add column if not exists iva_porcentaje    numeric(5,2) not null default 0;   -- 0 = no se desglosa impuesto
alter table public.ajustes add column if not exists recibo_pie        text not null default 'Gracias por ser parte del cambio.';

drop policy if exists ajustes_editar on public.ajustes;
create policy ajustes_editar on public.ajustes for update to authenticated using (public.es_admin()) with check (public.es_admin());
grant update on public.ajustes to authenticated;

-- El staff puede corregir nombre, teléfono y cédula de un cliente (para los recibos).
create or replace function public.admin_editar_cliente(p_user uuid, p_nombre text, p_telefono text, p_cedula text)
returns public.perfiles
language plpgsql security definer set search_path = public as $$
declare v public.perfiles;
begin
  if not public.es_admin() then raise exception 'NO_AUTORIZADO'; end if;
  update public.perfiles set nombre = coalesce(nullif(trim(p_nombre), ''), nombre),
         telefono = nullif(trim(p_telefono), ''), cedula = nullif(trim(p_cedula), '')
  where id = p_user returning * into v;
  return v;
end $$;

-- ---------- Recibos ----------
create sequence if not exists public.recibo_seq;
create table if not exists public.recibos (
  id               uuid primary key default gen_random_uuid(),
  numero           int  not null unique default nextval('public.recibo_seq'),
  pago_id          uuid unique references public.pagos (id) on delete set null,
  user_id          uuid references public.perfiles (id) on delete set null,
  cliente_nombre   text,
  cliente_cedula   text,
  cliente_email    text,
  cliente_telefono text,
  fecha            date not null,
  concepto         text not null,
  detalle          text,
  meses            int not null default 0,
  periodo_desde    date,
  periodo_hasta    date,
  metodo           text not null,
  subtotal         numeric(12,2) not null,
  iva              numeric(12,2) not null default 0,
  iva_porcentaje   numeric(5,2) not null default 0,
  total            int not null,
  estado           text not null default 'emitido' check (estado in ('emitido', 'anulado')),
  anulado_motivo   text,
  anulado_en       timestamptz,
  correo_enviado   timestamptz,
  creado           timestamptz not null default now(),
  creado_por       uuid default auth.uid()
);
create index if not exists recibos_fecha_idx on public.recibos (fecha);
create index if not exists recibos_user_idx on public.recibos (user_id, fecha desc);

alter table public.recibos enable row level security;
drop policy if exists recibos_leer on public.recibos;
create policy recibos_leer on public.recibos for select using (user_id = auth.uid() or public.es_admin());
drop policy if exists recibos_marcar on public.recibos;
create policy recibos_marcar on public.recibos for update to authenticated using (public.es_admin()) with check (public.es_admin());
revoke all on public.recibos from anon, authenticated;
grant select on public.recibos to authenticated;
grant update (correo_enviado) on public.recibos to authenticated;

-- Cada pago genera su recibo automáticamente (con copia de los datos del cliente).
create or replace function public.crear_recibo() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.perfiles; a public.ajustes; desde date; hasta date; sub numeric; imp numeric;
        conceptos jsonb := '{"membresia":"Membresía","fisioterapia":"Fisioterapia","evento":"Evento","otro":"Otro"}';
begin
  select * into p from public.perfiles where id = new.user_id;
  select * into a from public.ajustes where id = 1;
  if new.concepto = 'membresia' and new.meses > 0 then
    -- mismo cálculo que admin_registrar_pago (se ejecuta antes de que se actualice el vencimiento)
    desde := greatest(coalesce(p.membresia_vence, new.fecha), new.fecha);
    hasta := (desde + make_interval(months => new.meses))::date;
  end if;
  if coalesce(a.iva_porcentaje, 0) > 0 then
    sub := round(new.monto / (1 + a.iva_porcentaje / 100), 2); imp := new.monto - sub;
  else
    sub := new.monto; imp := 0;
  end if;
  insert into public.recibos (pago_id, user_id, cliente_nombre, cliente_cedula, cliente_email, cliente_telefono,
    fecha, concepto, detalle, meses, periodo_desde, periodo_hasta, metodo, subtotal, iva, iva_porcentaje, total, creado_por)
  values (new.id, new.user_id, p.nombre, p.cedula, p.email, p.telefono,
    new.fecha, coalesce(conceptos ->> new.concepto, new.concepto),
    case when new.concepto = 'membresia' and new.meses > 0
         then 'Membresía ' || new.meses || case when new.meses = 1 then ' mes' else ' meses' end else null end
         || coalesce(' · ' || nullif(new.nota, ''), ''),
    new.meses, desde, hasta, new.metodo, sub, imp, coalesce(a.iva_porcentaje, 0), new.monto, new.creado_por)
  on conflict (pago_id) do nothing;
  return new;
end $$;
drop trigger if exists pagos_crear_recibo on public.pagos;
create trigger pagos_crear_recibo after insert on public.pagos for each row execute function public.crear_recibo();

-- Si se borra un pago, su recibo queda anulado (no desaparece).
create or replace function public.anular_recibo_de_pago() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.recibos set estado = 'anulado', anulado_motivo = coalesce(anulado_motivo, 'Pago eliminado'), anulado_en = now()
  where pago_id = old.id and estado = 'emitido';
  return old;
end $$;
drop trigger if exists pagos_anular_recibo on public.pagos;
create trigger pagos_anular_recibo before delete on public.pagos for each row execute function public.anular_recibo_de_pago();

-- Anular un recibo manualmente (queda en el registro con su motivo).
create or replace function public.admin_anular_recibo(p_id uuid, p_motivo text)
returns public.recibos
language plpgsql security definer set search_path = public as $$
declare v public.recibos;
begin
  if not public.es_admin() then raise exception 'NO_AUTORIZADO'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'FALTA_MOTIVO'; end if;
  update public.recibos set estado = 'anulado', anulado_motivo = trim(p_motivo), anulado_en = now()
  where id = p_id and estado = 'emitido' returning * into v;
  if v.id is null then raise exception 'NO_ENCONTRADO'; end if;
  return v;
end $$;

-- Recibos para los pagos que ya existían (en orden de fecha).
do $$ declare r record; begin
  for r in select * from public.pagos pg where not exists (select 1 from public.recibos x where x.pago_id = pg.id) order by fecha, creado loop
    perform 1;
    insert into public.recibos (pago_id, user_id, cliente_nombre, cliente_cedula, cliente_email, cliente_telefono, fecha, concepto,
      detalle, meses, metodo, subtotal, iva, total, creado_por)
    select r.id, r.user_id, p.nombre, p.cedula, p.email, p.telefono, r.fecha,
      case r.concepto when 'membresia' then 'Membresía' when 'fisioterapia' then 'Fisioterapia' when 'evento' then 'Evento' else 'Otro' end,
      case when r.concepto = 'membresia' and r.meses > 0 then 'Membresía ' || r.meses || case when r.meses = 1 then ' mes' else ' meses' end end,
      r.meses, r.metodo, r.monto, 0, r.monto, r.creado_por
    from (select 1) x left join public.perfiles p on p.id = r.user_id;
  end loop;
end $$;

-- ---------- Gastos ----------
create table if not exists public.gastos (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null default ((now() at time zone 'America/Costa_Rica')::date),
  categoria    text not null,
  descripcion  text,
  proveedor    text,
  metodo       text not null default 'efectivo' check (metodo in ('efectivo', 'sinpe', 'transferencia', 'tarjeta')),
  monto        int  not null check (monto > 0),
  creado_por   uuid default auth.uid(),
  creado       timestamptz not null default now()
);
create index if not exists gastos_fecha_idx on public.gastos (fecha);
alter table public.gastos enable row level security;
drop policy if exists gastos_staff on public.gastos;
create policy gastos_staff on public.gastos for all to authenticated using (public.es_admin()) with check (public.es_admin());
revoke all on public.gastos from anon, authenticated;
grant select, insert, update, delete on public.gastos to authenticated;

revoke execute on function public.admin_editar_cliente(uuid, text, text, text), public.admin_anular_recibo(uuid, text) from public;
grant execute on function public.admin_editar_cliente(uuid, text, text, text), public.admin_anular_recibo(uuid, text) to authenticated;
