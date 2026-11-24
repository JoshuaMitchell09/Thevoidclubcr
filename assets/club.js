/* =========================================================
   THE VOID — Membresía y citas
   ---------------------------------------------------------
   CONFIGURACIÓN: cambia aquí el correo, el precio,
   los servicios y los horarios. No hace falta tocar nada más.
   ========================================================= */
const VOID_CONFIG = {
  // Correo donde THE VOID recibe las solicitudes y citas.
  // La primera vez que alguien envíe un formulario, FormSubmit manda
  // un correo de activación a esta dirección: hay que confirmarlo una vez.
  email: 'tvoidclub@gmail.com',

  precio: 30000,          // en colones
  periodo: 'mes',         // se muestra "₡30.000 / mes"

  servicios: ['Entrenamiento', 'Recovery', 'Fisioterapia', 'Evaluación inicial'],

  // Horario por día de la semana (0 = domingo … 6 = sábado).
  // [hora de inicio, hora de cierre] en formato 24 h; null = cerrado.
  horario: {
    0: [14, 20],
    1: [14, 20], 2: [14, 20], 3: [14, 20], 4: [14, 20], 5: [14, 20],
    6: [14, 20],
  },
  duracionMin: 60,        // duración de cada cita
  diasAdelante: 14,       // cuántos días se pueden reservar por adelantado
  instagram: 'https://www.instagram.com/thevoidclub.cr/',
  whatsapp: '50662002634',  // 6200-2634
};

(() => {
  const C = VOID_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const crc = n => '₡' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fmtFecha = s => { const [y, m, d] = s.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${DIAS[dt.getDay()]} ${d} ${MESES[m - 1]}`; };
  const fmtHora = h => { const [H, M] = h.split(':').map(Number); return `${((H + 11) % 12) + 1}:${pad(M)} ${H < 12 ? 'a.m.' : 'p.m.'}`; };

  /* ---------- envío de correos ---------- */
  async function enviar(asunto, datos) {
    if (!C.email) throw new Error('sin-correo');
    const res = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(C.email), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ _subject: asunto, _template: 'table', _captcha: 'false', ...datos }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || String(j.success) !== 'true') throw new Error(j.message || 'error');
    return j;
  }
  function estado(el, tipo, msg) { el.className = 'status ' + tipo; el.innerHTML = msg; }
  const msgError = e => e.message === 'sin-correo'
    ? `Las reservas en línea se activarán muy pronto. Mientras tanto, escríbenos por <a href="https://wa.me/${C.whatsapp}" target="_blank" rel="noopener">WhatsApp 6200-2634</a>.`
    : `No se pudo enviar. Intenta de nuevo o escríbenos por <a href="https://wa.me/${C.whatsapp}" target="_blank" rel="noopener">WhatsApp 6200-2634</a>.`;

  /* ---------- citas guardadas en este navegador ---------- */
  const KEY = 'thevoid.citas';
  const leer = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const guardar = l => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch {} };
  const codigo = () => 'VOID-' + Array.from(crypto.getRandomValues(new Uint8Array(4)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');

  /* ---------- membresía ---------- */
  $('#precio').textContent = crc(C.precio);
  if (C.periodo) $('#periodo').textContent = '/ ' + C.periodo;

  const fm = $('#form-membresia');
  fm.addEventListener('submit', async e => {
    e.preventDefault();
    const st = $('.status', fm), btn = $('button[type=submit]', fm);
    const d = Object.fromEntries(new FormData(fm));
    btn.disabled = true; estado(st, 'wait', 'Enviando…');
    try {
      await enviar(`Nueva solicitud de membresía — ${d.nombre}`, {
        Tipo: 'Solicitud de membresía', Nombre: d.nombre, email: d.email, Teléfono: d.telefono,
        Membresía: crc(C.precio) + (C.periodo ? ' / ' + C.periodo : ''), Mensaje: d.mensaje || '—',
      });
      fm.reset();
      estado(st, 'ok', '¡Gracias! Recibimos tu solicitud. Te contactaremos pronto para completar tu ingreso al club.');
    } catch (err) { estado(st, 'err', msgError(err)); }
    btn.disabled = false;
  });

  /* ---------- agenda ---------- */
  const fc = $('#form-cita');
  const sel = { fecha: null, hora: null };
  const servSel = $('select[name=servicio]', fc);
  C.servicios.forEach(s => servSel.add(new Option(s, s)));

  function slotsDe(fecha) {
    const [y, m, d] = fecha.split('-').map(Number);
    const h = C.horario[new Date(y, m - 1, d).getDay()];
    if (!h) return [];
    const out = [], ahora = new Date();
    for (let t = h[0] * 60; t + C.duracionMin <= h[1] * 60; t += C.duracionMin) {
      const dt = new Date(y, m - 1, d, Math.floor(t / 60), t % 60);
      out.push({ hora: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`, pasada: dt <= ahora });
    }
    return out;
  }
  function pintarDias() {
    const box = $('#dias'); box.innerHTML = '';
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    for (let i = 0; i < C.diasAdelante; i++) {
      const d = new Date(hoy); d.setDate(hoy.getDate() + i);
      const f = ymd(d), libre = slotsDe(f).some(s => !s.pasada);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'dia'; b.disabled = !libre; b.dataset.f = f;
      b.innerHTML = `<small>${DIAS[d.getDay()]}</small><b>${d.getDate()}</b><small>${MESES[d.getMonth()]}</small>`;
      b.setAttribute('aria-pressed', 'false');
      if (!sel.fecha && libre) sel.fecha = f;
      box.append(b);
    }
    marcarDia();
  }
  function marcarDia() {
    $$('#dias .dia').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === sel.fecha)));
    pintarHoras();
  }
  function pintarHoras() {
    const box = $('#horas'); box.innerHTML = '';
    const mias = leer().filter(c => c.estado === 'activa' && c.fecha === sel.fecha).map(c => c.hora);
    const slots = sel.fecha ? slotsDe(sel.fecha) : [];
    if (!slots.length) { box.innerHTML = '<p class="muted">Cerrado este día.</p>'; return; }
    slots.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hora'; b.dataset.h = s.hora; b.textContent = fmtHora(s.hora);
      b.disabled = s.pasada || mias.includes(s.hora);
      b.setAttribute('aria-pressed', String(sel.hora === s.hora));
      box.append(b);
    });
  }
  $('#dias').addEventListener('click', e => { const b = e.target.closest('.dia'); if (!b || b.disabled) return; sel.fecha = b.dataset.f; sel.hora = null; marcarDia(); });
  $('#horas').addEventListener('click', e => { const b = e.target.closest('.hora'); if (!b || b.disabled) return; sel.hora = b.dataset.h; pintarHoras(); });

  fc.addEventListener('submit', async e => {
    e.preventDefault();
    const st = $('.status', fc), btn = $('button[type=submit]', fc);
    if (!sel.fecha || !sel.hora) { estado(st, 'err', 'Elige un día y una hora.'); return; }
    const d = Object.fromEntries(new FormData(fc));
    const cita = { codigo: codigo(), fecha: sel.fecha, hora: sel.hora, servicio: d.servicio, nombre: d.nombre, email: d.email, telefono: d.telefono, estado: 'activa' };
    btn.disabled = true; estado(st, 'wait', 'Agendando…');
    try {
      await enviar(`Nueva cita ${cita.codigo} — ${fmtFecha(cita.fecha)} ${fmtHora(cita.hora)}`, {
        Tipo: 'NUEVA CITA', Código: cita.codigo, Servicio: cita.servicio,
        Fecha: fmtFecha(cita.fecha), Hora: fmtHora(cita.hora),
        Nombre: cita.nombre, email: cita.email, Teléfono: cita.telefono, Notas: d.notas || '—',
      });
      guardar([...leer(), cita]);
      fc.reset(); sel.hora = null; pintarHoras(); pintarMias();
      estado(st, 'ok', `Cita agendada: <b>${fmtFecha(cita.fecha)}, ${fmtHora(cita.hora)}</b> — tu código es <b>${cita.codigo}</b>, guárdalo para cancelar desde otro dispositivo.`);
    } catch (err) { estado(st, 'err', msgError(err)); }
    btn.disabled = false;
  });

  /* ---------- mis citas / cancelar ---------- */
  function pintarMias() {
    const box = $('#mis-citas');
    const hoy = ymd(new Date());
    const l = leer().filter(c => c.fecha >= hoy).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    $('#tab-mias .n').textContent = l.filter(c => c.estado === 'activa').length || '';
    if (!l.length) { box.innerHTML = '<p class="muted">No tienes citas agendadas desde este dispositivo.</p>'; return; }
    box.innerHTML = l.map(c => `
      <div class="cita ${c.estado}">
        <div><b>${fmtFecha(c.fecha)} · ${fmtHora(c.hora)}</b><small>${c.servicio} · ${c.codigo}</small></div>
        ${c.estado === 'activa' ? `<button type="button" class="btn-line" data-cancel="${c.codigo}">Cancelar</button>` : '<span class="tag">Cancelada</span>'}
      </div>`).join('');
  }
  async function cancelar(datos, st) {
    estado(st, 'wait', 'Cancelando…');
    await enviar(`CANCELACIÓN de cita ${datos.codigo}`, {
      Tipo: 'CANCELACIÓN DE CITA', Código: datos.codigo,
      ...(datos.fecha ? { Fecha: fmtFecha(datos.fecha), Hora: fmtHora(datos.hora), Servicio: datos.servicio } : {}),
      Nombre: datos.nombre || '—', email: datos.email, Motivo: datos.motivo || '—',
    });
    guardar(leer().map(c => c.codigo === datos.codigo ? { ...c, estado: 'cancelada' } : c));
    pintarMias(); pintarHoras();
  }
  $('#mis-citas').addEventListener('click', async e => {
    const b = e.target.closest('[data-cancel]'); if (!b) return;
    const c = leer().find(x => x.codigo === b.dataset.cancel); if (!c) return;
    if (!confirm(`¿Cancelar tu cita del ${fmtFecha(c.fecha)} a las ${fmtHora(c.hora)}?`)) return;
    const st = $('#status-mias'); b.disabled = true;
    try { await cancelar(c, st); estado(st, 'ok', 'Cita cancelada. Le avisamos a THE VOID por correo.'); }
    catch (err) { estado(st, 'err', msgError(err)); b.disabled = false; }
  });
  const fx = $('#form-cancelar');
  fx.addEventListener('submit', async e => {
    e.preventDefault();
    const st = $('.status', fx), btn = $('button[type=submit]', fx);
    const d = Object.fromEntries(new FormData(fx));
    d.codigo = d.codigo.trim().toUpperCase();
    const local = leer().find(c => c.codigo === d.codigo);
    btn.disabled = true;
    try { await cancelar({ ...(local || {}), ...d }, st); fx.reset(); estado(st, 'ok', 'Solicitud de cancelación enviada a THE VOID.'); }
    catch (err) { estado(st, 'err', msgError(err)); }
    btn.disabled = false;
  });

  /* ---------- pestañas ---------- */
  $$('.tabs [role=tab]').forEach(t => t.addEventListener('click', () => {
    $$('.tabs [role=tab]').forEach(x => x.setAttribute('aria-selected', String(x === t)));
    $$('.panel').forEach(p => p.hidden = p.id !== t.getAttribute('aria-controls'));
    if (t.id === 'tab-mias') pintarMias();
  }));

  pintarDias(); pintarMias();
})();
