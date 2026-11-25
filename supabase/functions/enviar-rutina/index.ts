// =========================================================
// THE VOID — Edge Function "enviar-rutina"
// Envía por correo (desde el Gmail del club) la rutina que el staff subió a un cliente.
//
// Secretos necesarios (Supabase → Edge Functions → Secrets):
//   GMAIL_USER          = tvoidclub@gmail.com
//   GMAIL_APP_PASSWORD  = contraseña de aplicación de Google (16 letras)
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY ya existen por defecto.
// =========================================================
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.16';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const gUser = Deno.env.get('GMAIL_USER');
    const gPass = Deno.env.get('GMAIL_APP_PASSWORD');
    if (!gUser || !gPass) return json({ error: 'FALTA_CONFIGURAR_CORREO' }, 500);

    // 1) Solo el staff puede enviar rutinas.
    const auth = req.headers.get('Authorization') ?? '';
    const yo = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: esAdmin, error: eAdm } = await yo.rpc('es_admin');
    if (eAdm || !esAdmin) return json({ error: 'NO_AUTORIZADO' }, 403);

    const { rutina_id } = await req.json();
    if (!rutina_id) return json({ error: 'FALTA_RUTINA' }, 400);

    // 2) Datos de la rutina y del cliente.
    const db = createClient(url, service);
    const { data: r, error: eR } = await db.from('rutinas')
      .select('id, titulo, nota, imagen_path, perfiles(nombre, email)').eq('id', rutina_id).single();
    if (eR || !r) return json({ error: 'NO_ENCONTRADA' }, 404);
    const p = (r as any).perfiles as { nombre: string; email: string };
    if (!p?.email) return json({ error: 'SIN_CORREO' }, 400);

    // 3) Imagen adjunta.
    const { data: file, error: eF } = await db.storage.from('rutinas').download(r.imagen_path);
    if (eF || !file) return json({ error: 'SIN_IMAGEN' }, 404);
    const contenido = new Uint8Array(await file.arrayBuffer());
    const ext = (r.imagen_path.split('.').pop() || 'jpg').toLowerCase();
    const esPdf = ext === 'pdf';
    const nombreArchivo = `rutina-${r.titulo.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-').replace(/^-|-$/g, '') || 'thevoid'}.${ext}`;

    // 4) Correo.
    const primer = (p.nombre || '').split(' ')[0] || 'hola';
    const html = `
      <div style="background:#050505;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#f2f2f0">
        <div style="max-width:560px;margin:0 auto">
          <p style="letter-spacing:.3em;font-size:12px;color:#b0b0ab;margin:0 0 24px">THE VOID · PERFORMANCE &amp; RECOVERY CLUB</p>
          <h1 style="font-weight:300;font-size:26px;margin:0 0 12px">Hola ${esc(primer)}, aquí está tu rutina</h1>
          <p style="font-size:17px;margin:0 0 8px"><b style="font-weight:500">${esc(r.titulo)}</b></p>
          ${r.nota ? `<p style="font-size:16px;line-height:1.6;color:#d6d6d2;margin:0 0 20px;white-space:pre-line">${esc(r.nota)}</p>` : ''}
          ${esPdf ? '<p style="font-size:16px;color:#d6d6d2">La rutina va adjunta en PDF.</p>'
                  : '<img src="cid:rutina" alt="Rutina" style="width:100%;max-width:560px;border:1px solid #333;display:block;margin:12px 0 20px">'}
          <p style="font-size:15px;color:#b0b0ab;line-height:1.6">También puedes verla en la página, en <b>Mi cuenta → Mis rutinas</b>.<br>Si tienes dudas, escríbenos por WhatsApp al 6200-2634.</p>
          <p style="font-size:13px;color:#7a7a77;margin-top:28px">THE VOID · Costa Rica</p>
        </div>
      </div>`;

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: gUser, pass: gPass.replace(/\s/g, '') },
    });
    await transporter.sendMail({
      from: `"THE VOID" <${gUser}>`,
      to: p.email,
      replyTo: gUser,
      subject: `Tu rutina en THE VOID: ${r.titulo}`,
      text: `Hola ${primer}, aquí está tu rutina "${r.titulo}".${r.nota ? '\n\n' + r.nota : ''}\n\nTambién puedes verla en la página, en Mi cuenta → Mis rutinas.`,
      html,
      attachments: [{ filename: nombreArchivo, content: contenido, ...(esPdf ? {} : { cid: 'rutina' }) }],
    });

    await db.from('rutinas').update({ correo_enviado: new Date().toISOString() }).eq('id', r.id);
    return json({ ok: true, enviado_a: p.email });
  } catch (e) {
    console.error(e);
    return json({ error: 'ERROR_ENVIO', detalle: String((e as Error)?.message || e) }, 500);
  }
});
