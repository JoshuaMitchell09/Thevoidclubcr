/* =========================================================
   THE VOID — Cuentas, membresía y citas
   ---------------------------------------------------------
   CONFIGURACIÓN: correo, conexión a la base de datos (Supabase),
   precio, servicios y horario. El cupo por hora y el horario
   también se validan en la base de datos (tabla "ajustes").
   ========================================================= */
window.VOID_CONFIG = {
  // Correo donde THE VOID recibe avisos de citas, cancelaciones y solicitudes.
  email: 'tvoidclub@gmail.com',

  // Supabase → Project Settings → API: "Project URL" y la clave "anon public".
  // (Esta clave es pública por diseño; la seguridad la dan las reglas de la base de datos.)
  supabaseUrl: 'https://pqsjtfmzlgjqoxjwgkrn.supabase.co',
  supabaseKey: 'sb_publishable_WUhRscTL1Q3oTtBJNfwa7g_EK7Pwp0A',

  precio: 30000,          // en colones
  periodo: 'mes',         // se muestra "₡30.000 / mes"

  servicios: ['Entrenamiento', 'Fisioterapia · Dra. Karina Lizano'],
  serviciosProximos: ['Nuevo servicio'],   // se muestran en la agenda como "Próximamente" (no se pueden elegir)

  // Debe coincidir con la tabla "ajustes" de la base de datos.
  cupoPorHora: 6,          // se actualiza solo con el valor de la base de datos (Panel → Facturación → Datos del negocio)
  individual: { inicio: 8, fin: 14, cupo: 1 },   // sesiones individuales (mañana): 8:00 a.m. – 2:00 p.m., 1 persona por hora
  horario: { inicio: 14, fin: 20 },   // 2:00 p.m. – 8:00 p.m., todos los días
  diasAdelante: 14,

  // Pagos: SINPE Móvil (con comprobante) o efectivo en el club. El staff verifica cada pago en el panel.
  pagos: {
    sinpeNumero: '',      // número que recibe SINPE Móvil, ej. '8888-8888'
    sinpeTitular: '',     // nombre del titular que el cliente verá al enviar
  },

  instagram: 'https://www.instagram.com/thevoidclub.cr/',
  whatsapp: '50662002634',  // 6200-2634

  // El staff puede ingresar con usuario (sin @). Se convierte en un correo
  // que llega al Gmail del club: Tatianavoid -> tvoidclub+tatianavoid@gmail.com
  staffEmail: usuario => `tvoidclub+${usuario.trim().toLowerCase()}@gmail.com`,
};
// Acepta "usuario" o "correo" y devuelve el correo para iniciar sesión.
window.VOID_LOGIN_EMAIL = v => (v || '').includes('@') ? v.trim() : window.VOID_CONFIG.staffEmail(v || '');
