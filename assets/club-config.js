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
  supabaseUrl: '',
  supabaseKey: '',

  precio: 30000,          // en colones
  periodo: 'mes',         // se muestra "₡30.000 / mes"

  servicios: ['Entrenamiento', 'Recovery', 'Fisioterapia', 'Evaluación inicial'],

  // Debe coincidir con la tabla "ajustes" de la base de datos.
  cupoPorHora: 3,
  horario: { inicio: 14, fin: 20 },   // 2:00 p.m. – 8:00 p.m., todos los días
  diasAdelante: 14,

  instagram: 'https://www.instagram.com/thevoidclub.cr/',
  whatsapp: '50662002634',  // 6200-2634
};
