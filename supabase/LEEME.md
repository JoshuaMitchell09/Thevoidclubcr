# Configurar la base de datos (Supabase)

La página usa Supabase (gratis) para:

- cuentas de clientes (registro, ingreso y recuperación de contraseña),
- citas con **cupo de 3 personas por hora** (una reserva "con pareja" ocupa 2),
- la lista de personas registradas y sus membresías,
- el panel del staff en `admin.html`.

## 1. Crear el proyecto

1. Entra a <https://supabase.com> y crea una cuenta (puede ser con el correo del club).
2. **New project** → nombre `thevoid` → región **East US (North Virginia)** → crea una contraseña para la base de datos y guárdala.

## 2. Crear las tablas

1. En el proyecto: **SQL Editor** → **New query**.
2. Pega todo el contenido de [`schema.sql`](schema.sql) y dale **Run**.
   Se puede volver a correr sin perder datos.

## 3. Direcciones de la página

**Authentication → URL Configuration**

- **Site URL:** `https://joshuamitchell09.github.io/Thevoidclubcr/`
- **Redirect URLs:** agrega la misma dirección.

## 4. Confirmación de correo

**Authentication → Sign In / Providers → Email**

Supabase manda un correo para confirmar cada cuenta nueva, pero su servicio de correo
gratuito solo envía unos pocos por hora. Dos opciones:

- **Para empezar:** desactiva **Confirm email**. Las personas entran apenas se registran.
- **Más adelante:** configura un SMTP propio (**Project Settings → Authentication → SMTP**,
  por ejemplo Gmail con una "contraseña de aplicación") y vuelve a activar la confirmación.

## 5. Conectar la página

**Project Settings → API** → copia:

- **Project URL** (algo como `https://abcd1234.supabase.co`)
- la clave **anon public**

y pégalas en `assets/club-config.js` (`supabaseUrl` y `supabaseKey`).
La clave *anon* es pública por diseño: la seguridad la dan las reglas de la base de datos.
**Nunca** pongas la clave `service_role` en la página.

## 6. Staff

- Crea una cuenta en la página con **tvoidclub@gmail.com** (ya está marcado como administrador).
- El panel está en `admin.html`: citas por día con cupos, cancelaciones, personas registradas,
  cambio de membresía y exportar a CSV (se abre en Excel o Google Sheets).
- Para agregar más staff: **Table Editor → admins → Insert row** con el correo de la persona.

## Cambiar cupo u horario

**Table Editor → ajustes**: `cupo_por_hora`, `hora_inicio`, `hora_fin`, `dias_adelante`.
Si los cambias, actualiza también `cupoPorHora` y `horario` en `assets/club-config.js`.
