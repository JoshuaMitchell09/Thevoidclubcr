/* THE VOID — cuentas, membresía y citas. La configuración está en assets/club-config.js */
(() => {
  const C = window.VOID_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const crc = n => '₡' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fmtFecha = s => { const [y, m, d] = s.split('-').map(Number); return `${DIAS[new Date(y, m - 1, d).getDay()]} ${d} ${MESES[m - 1]}`; };
  const fmtHora = h => { const [H, M] = h.split(':').map(Number); return `${((H + 11) % 12) + 1}:${pad(M)} ${H < 12 ? 'a.m.' : 'p.m.'}`; };
  const hhmm = h => h.slice(0, 5);
  const wa = `<a href="https://wa.me/${C.whatsapp}" target="_blank" rel="noopener">WhatsApp 6200-2634</a>`;
  const sfx = n => window.VOID_SFX && window.VOID_SFX.play(n);
  function estado(el, tipo, msg) {
    if (el) { el.className = 'status ' + tipo; el.innerHTML = msg; }
    if (msg && tipo === 'ok') sfx('success'); else if (msg && tipo === 'err') sfx('error');
  }

  /* ---------- avisos por correo a THE VOID (FormSubmit) ---------- */
  function avisar(asunto, datos) {
    if (!C.email) return Promise.resolve();
    return fetch('https://formsubmit.co/ajax/' + encodeURIComponent(C.email), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ _subject: asunto, _template: 'table', _captcha: 'false', ...datos }),
    }).catch(() => {});   // el registro ya quedó en la base de datos; el correo es solo un aviso
  }

  /* ---------- mensajes de error legibles ---------- */
  const ERRORES = {
    CUPO_LLENO: 'Ese horario se acaba de llenar. Elige otra hora.',
    YA_RESERVADO: 'Ya tienes una cita a esa hora.',
    HORA_PASADA: 'Esa hora ya pasó. Elige otra.',
    HORA_INVALIDA: 'Esa hora no está disponible.',
    MUY_ADELANTE: `Solo se puede agendar con ${C.diasAdelante} días de anticipación.`,
    FALTA_ACOMPANANTE: 'Escribe el nombre de tu pareja.',
    NO_SESION: 'Tu sesión se cerró. Ingresa de nuevo.',
    NO_ENCONTRADA: 'Esa cita ya no está activa.',
    SIN_EMERGENCIA: 'Antes de agendar, agrega tu contacto de emergencia en Mi cuenta.',
    SIN_MEMBRESIA: 'Para agendar necesitas una membresía activa. Paga tu membresía y, cuando se confirme el pago, se desbloquea la agenda.',
    FALTA_COMPROBANTE: 'Sube la captura del comprobante del SINPE.',
    FALTA_REFERENCIA: 'Escribe el número de referencia del pago.',
    REFERENCIA_USADA: 'Ese número de referencia ya fue reportado. Revisa el comprobante.',
    DEMASIADOS_PENDIENTES: 'Ya tienes pagos esperando verificación. Espera a que el staff los revise.',
    'mime type': 'Ese tipo de archivo no se acepta. Sube una imagen (JPG, PNG) o un PDF.',
    'exceeded the maximum allowed size': 'La foto es muy pesada. Prueba con otra.',
    'Invalid login credentials': 'Correo o contraseña incorrectos.',
    'Email not confirmed': 'Primero confirma tu cuenta con el enlace que te enviamos por correo.',
    'User already registered': 'Ya existe una cuenta con ese correo. Ingresa o recupera tu contraseña.',
    'Password should be at least': 'La contraseña debe tener al menos 8 caracteres.',
    'rate limit': 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
  };
  const traducir = err => {
    const m = (err && (err.message || err.error_description || err.msg)) || String(err || '');
    for (const k in ERRORES) if (m.includes(k)) return ERRORES[k];
    return `Algo salió mal. Intenta de nuevo o escríbenos por ${wa}.`;
  };

  /* ---------- conexión ---------- */
  const listo = !!(C.supabaseUrl && C.supabaseKey && window.supabase);
  const sb = listo ? window.supabase.createClient(C.supabaseUrl, C.supabaseKey) : null;
  window.VOID_SB = sb;   // conexión compartida (la usa assets/eventos.js)
  const S = { user: null, perfil: null, admin: false, citas: [] };
  const pagina = location.origin + location.pathname;

  /* ---------- precio ---------- */
  $('#precio').textContent = crc(C.precio);
  if (C.periodo) $('#periodo').textContent = '/ ' + C.periodo;

  /* =========================================================
     MODAL DE CUENTA
     ========================================================= */
  const modal = $('#auth');
  const vistas = ['ingresar', 'registro', 'olvido', 'nueva', 'cuenta', 'pagar'];
  let intent = null;
  try { intent = localStorage.getItem('thevoid.intent'); } catch {}
  const setIntent = v => { intent = v; try { v ? localStorage.setItem('thevoid.intent', v) : localStorage.removeItem('thevoid.intent'); } catch {} };

  let cierreId = 0;
  function abrir(vista = 'ingresar', aviso = '') {
    clearTimeout(cierreId);
    if (!listo) { alert('Las cuentas se activarán muy pronto. Mientras tanto, escríbenos por WhatsApp al 6200-2634.'); return; }
    vistas.forEach(v => { const f = $(`[data-view="${v}"]`, modal); if (f) f.hidden = v !== vista; });
    $$('.auth-tabs [data-go]', modal).forEach(t => t.setAttribute('aria-selected', String(t.dataset.go === vista)));
    $('.auth-tabs', modal).hidden = !['ingresar', 'registro'].includes(vista);
    estado($('#auth-status'), aviso ? 'ok' : '', aviso);
    if (vista === 'cuenta') pintarCuenta();
    if (vista === 'pagar') prepararPago();
    $('.modal-card', modal).classList.toggle('wide', vista === 'cuenta');
    if (modal.hidden) sfx('open');
    modal.hidden = false; document.body.classList.add('modal-open');
    requestAnimationFrame(() => { modal.classList.add('on'); const i = $(`[data-view="${vista}"] input`, modal); if (i) i.focus(); });
  }
  function cerrar() {
    modal.classList.remove('on'); document.body.classList.remove('modal-open');
    cierreId = setTimeout(() => { modal.hidden = true; }, 350);
  }
  modal.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) cerrar();
    const go = e.target.closest('[data-go]'); if (go) { e.preventDefault(); abrir(go.dataset.go); }
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) cerrar(); });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-auth]'); if (!b) return;
    e.preventDefault();
    if (b.dataset.intent) setIntent(b.dataset.intent);
    abrir(S.user ? 'cuenta' : b.dataset.auth);
  });

  const enviando = (form, on) => { const b = $('button[type=submit]', form); if (b) b.disabled = on; };

  let rol = 'cliente';
  $('#rol').addEventListener('click', e => {
    const b = e.target.closest('[data-rol]'); if (!b) return;
    rol = b.dataset.rol;
    $$('#rol [data-rol]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    $('#f-login').classList.toggle('staff', rol === 'staff');
    $('#rol-ayuda').textContent = rol === 'staff'
      ? 'Acceso para dueños y entrenadores: citas, personas, pagos e ingresos.'
      : 'Agenda tus citas, revisa tu membresía y tu perfil.';
    $('.auth-tabs [data-go="registro"]', modal).hidden = rol === 'staff';
    $('#login-lbl').textContent = rol === 'staff' ? 'Usuario o correo' : 'Correo';
  });

  $('#f-login').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f)), st = $('#auth-status');
    if (rol === 'cliente' && !d.email.includes('@')) return estado(st, 'err', 'Escribe el correo con el que creaste tu cuenta.');
    enviando(f, true); estado(st, 'wait', 'Ingresando…');
    const { error } = await sb.auth.signInWithPassword({ email: window.VOID_LOGIN_EMAIL(d.email), password: d.password });
    if (error) { enviando(f, false); return estado(st, 'err', rol === 'staff' && error.message.includes('Invalid') ? 'Usuario o contraseña incorrectos.' : traducir(error)); }
    if (rol === 'staff') {
      const { data: esAdmin } = await sb.rpc('es_admin');
      if (esAdmin) { st.className = 'status ok'; st.textContent = 'Abriendo el panel…'; sfx('login'); setTimeout(() => { location.href = 'admin.html'; }, 900); return; }
      enviando(f, false); f.reset();
      return estado(st, 'err', 'Esta cuenta no tiene acceso de staff. Ingresaste como cliente.');
    }
    enviando(f, false); f.reset(); estado(st, '', ''); sfx('login'); cerrar();
  });

  $('#f-registro').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f)), st = $('#auth-status');
    if (d.password.length < 8) return estado(st, 'err', ERRORES['Password should be at least']);
    enviando(f, true); estado(st, 'wait', 'Creando tu cuenta…');
    const { data, error } = await sb.auth.signUp({
      email: d.email.trim(), password: d.password,
      options: { data: { nombre: d.nombre.trim(), telefono: d.telefono.trim(), emergencia_nombre: d.emergencia_nombre.trim(),
        emergencia_telefono: d.emergencia_telefono.trim(), emergencia_parentesco: d.emergencia_parentesco || '' }, emailRedirectTo: pagina },
    });
    enviando(f, false);
    if (error) return estado(st, 'err', traducir(error));
    f.reset();
    if (!data.session) estado(st, 'ok', 'Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego ingresa aquí.');
    else { estado(st, '', ''); sfx('login'); cerrar(); }
  });

  $('#f-olvido').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f)), st = $('#auth-status');
    enviando(f, true); estado(st, 'wait', 'Enviando…');
    const { error } = await sb.auth.resetPasswordForEmail(d.email.trim(), { redirectTo: pagina });
    enviando(f, false);
    if (error) return estado(st, 'err', traducir(error));
    estado(st, 'ok', 'Si existe una cuenta con ese correo, te llegará un enlace para crear una nueva contraseña.');
  });

  $('#f-nueva').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f)), st = $('#auth-status');
    if (d.password.length < 8) return estado(st, 'err', ERRORES['Password should be at least']);
    enviando(f, true);
    const { error } = await sb.auth.updateUser({ password: d.password });
    enviando(f, false);
    if (error) return estado(st, 'err', traducir(error));
    f.reset(); history.replaceState(null, '', pagina); abrir('cuenta', 'Contraseña actualizada.');
  });

  $('#f-cuenta').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f)), st = $('#auth-status');
    const t = v => (v || '').trim() || null;
    if (t(d.emergencia_nombre) && !t(d.emergencia_telefono)) return estado(st, 'err', 'Falta el teléfono de tu contacto de emergencia.');
    enviando(f, true); estado(st, 'wait', 'Guardando…');
    const { error } = await sb.from('perfiles').update({
      nombre: d.nombre.trim(), telefono: t(d.telefono), fecha_nacimiento: d.fecha_nacimiento || null,
      emergencia_nombre: t(d.emergencia_nombre), emergencia_telefono: t(d.emergencia_telefono),
      emergencia_parentesco: t(d.emergencia_parentesco), salud: t(d.salud),
    }).eq('id', S.user.id);
    enviando(f, false);
    if (error) return estado(st, 'err', traducir(error));
    await cargarPerfil(); pintarTodo(); pintarCuenta(); estado(st, 'ok', 'Perfil guardado.');
  });
  $('#btn-salir').addEventListener('click', async () => { await sb.auth.signOut(); cerrar(); });

  const MEMB = { ninguna: 'Sin membresía', solicitada: 'Solicitud en revisión', activa: 'Membresía activa', vencida: 'Membresía vencida' };
  const METODO = { sinpe: 'SINPE Móvil', efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
  const CONCEPTO = { membresia: 'Membresía', fisioterapia: 'Fisioterapia', evento: 'Evento', otro: 'Otro' };
  const fmtDia = s => { const [y, m, d] = s.split('-').map(Number); return `${d} ${MESES[m - 1]} ${y}`; };
  const iniciales = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const tieneEmergencia = p => !!(p && (p.emergencia_nombre || '').trim() && (p.emergencia_telefono || '').trim());

  function pintarCuenta() {
    const p = S.perfil || {}, f = $('#f-cuenta');
    ['nombre', 'telefono', 'fecha_nacimiento', 'emergencia_nombre', 'emergencia_telefono', 'emergencia_parentesco', 'salud']
      .forEach(k => { if (f[k]) f[k].value = p[k] || ''; });
    $('#cuenta-nombre').textContent = p.nombre || '';
    $('#cuenta-email').textContent = p.email || S.user?.email || '';
    const pill = $('#cuenta-memb');
    pill.className = 'memb-pill ' + (p.membresia || '');
    pill.textContent = (MEMB[p.membresia] || '—') + (p.membresia === 'activa' && p.membresia_vence ? ` · vence ${fmtDia(p.membresia_vence)}` : '');
    $('#cuenta-aviso').hidden = tieneEmergencia(p);
    $('#cuenta-admin').hidden = !S.admin;
    pintarAvatar();
    cargarMisPagos();
  }

  /* ---------- foto de perfil ---------- */
  async function urlFoto(path) {
    if (!path) return null;
    const { data } = await sb.storage.from('fotos').createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  }
  async function pintarAvatar() {
    const p = S.perfil || {}, img = $('#avatar-img');
    $('#avatar-ini').textContent = iniciales(p.nombre);
    S.fotoUrl = S.fotoUrl || await urlFoto(p.foto_path);
    img.hidden = !S.fotoUrl; if (S.fotoUrl) img.src = S.fotoUrl;
    $('#avatar-ini').hidden = !!S.fotoUrl;
    pintarNav();
  }
  function recortar(file, lado = 512) {
    return new Promise((res, rej) => {
      const im = new Image(), url = URL.createObjectURL(file);
      im.onload = () => {
        const s = Math.min(im.width, im.height), c = document.createElement('canvas');
        c.width = c.height = lado;
        c.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, lado, lado);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? res(b) : rej(new Error('imagen')), 'image/jpeg', 0.86);
      };
      im.onerror = () => rej(new Error('imagen'));
      im.src = url;
    });
  }
  $('#avatar-file').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    const st = $('#auth-status'), box = $('#avatar');
    if (!/^image\//.test(file.type)) return estado(st, 'err', 'Elige una imagen (JPG, PNG o WebP).');
    box.classList.add('busy'); estado(st, 'wait', 'Subiendo foto…');
    try {
      const blob = await recortar(file);
      const path = `${S.user.id}/avatar.jpg`;
      const up = await sb.storage.from('fotos').upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '60' });
      if (up.error) throw up.error;
      const { error } = await sb.from('perfiles').update({ foto_path: path }).eq('id', S.user.id);
      if (error) throw error;
      S.perfil.foto_path = path; S.fotoUrl = null;
      const u = await urlFoto(path); S.fotoUrl = u ? u + (u.includes('?') ? '&' : '?') + 'v=' + Date.now() : null;
      await pintarAvatar(); estado(st, 'ok', 'Foto actualizada.');
    } catch (err) { estado(st, 'err', err.message === 'imagen' ? 'No se pudo leer esa imagen. Prueba con otra.' : traducir(err)); }
    box.classList.remove('busy');
  });

  /* ---------- mis pagos ---------- */
  async function cargarMisPagos() {
    const [{ data }, { data: rep }] = await Promise.all([
      sb.from('pagos').select('*').eq('user_id', S.user.id).order('fecha', { ascending: false }),
      sb.from('pagos_pendientes').select('*').eq('user_id', S.user.id).neq('estado', 'aprobado').order('creado', { ascending: false }),
    ]);
    S.pendientes = (rep || []).filter(r => r.estado === 'pendiente');
    const filas = [
      ...(rep || []).map(r => `<div class="pago-row"><div>Membresía · ${r.meses} ${r.meses === 1 ? 'mes' : 'meses'}<span class="est ${r.estado}">${r.estado === 'pendiente' ? 'Verificando' : 'Rechazado'}</span>
        <small>${fmtDia(r.creado.slice(0, 10))} · ${METODO[r.metodo] || r.metodo} · ref. ${esc(r.referencia)}${r.motivo ? ' · ' + esc(r.motivo) : ''}</small></div><b>${crc(r.monto)}</b></div>`),
      ...(data || []).slice(0, 12).map(x => `<div class="pago-row"><div>${CONCEPTO[x.concepto] || x.concepto}${x.meses ? ` · ${x.meses} ${x.meses === 1 ? 'mes' : 'meses'}` : ''}<span class="est aprobado">Pagado</span><small>${fmtDia(x.fecha)} · ${METODO[x.metodo] || x.metodo}</small></div><b>${crc(x.monto)}</b></div>`),
    ];
    $('#cuenta-pagos-lista').innerHTML = filas.join('') || '<p class="muted small" style="margin:0">Todavía no tienes pagos.</p>';
    pintarMembresia();
  }

  /* ---------- pagar en línea ---------- */
  const PG = C.pagos || {};
  const pg = { meses: 1, metodo: 'sinpe', codigo: '' };
  const nuevoCodigo = () => 'VOID-P-' + Array.from(crypto.getRandomValues(new Uint8Array(5)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  function prepararPago() {
    if (!pg.codigo) pg.codigo = nuevoCodigo();
    pintarPago();
  }
  function pintarPago() {
    const total = C.precio * pg.meses;
    $('#pg-total').textContent = crc(total);
    $$('#pg-meses [data-n]').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.n) === pg.meses)));
    $$('#pg-metodo [data-m]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.m === pg.metodo)));
    const copia = (v, l) => `<button type="button" class="copy" data-copy="${esc(v)}">${esc(v)} <small>${l}</small></button>`;
    const f = $('#f-pagar'), btn = $('button[type=submit]', f);
    let pasos = '', disponible = true;
    if (pg.metodo === 'sinpe') {
      disponible = !!PG.sinpeNumero;
      pasos = disponible ? `
        <li><div>Desde la app de tu banco, envía <b>${crc(total)}</b> por SINPE Móvil al número:<br>${copia(PG.sinpeNumero, 'Copiar')}${PG.sinpeTitular ? `<br><small class="muted">A nombre de ${esc(PG.sinpeTitular)}</small>` : ''}</div></li>
        <li><div>En la <b>descripción</b> del SINPE escribe este código:<br>${copia(pg.codigo, 'Copiar')}</div></li>
        <li><div>Sube la <b>captura del comprobante</b> y escribe el <b>número de referencia</b> que te da el banco.</div></li>`
        : `<li><div>El pago por SINPE Móvil desde la página estará disponible muy pronto.</div></li>
          <li><div>Mientras tanto, <b>paga en el club</b> (efectivo o tarjeta) o escríbenos por ${wa} para coordinar.</div></li>
          <li><div>Cuando el staff registre tu pago, tu membresía se activa y <b>se desbloquea la agenda</b>.</div></li>`;
      $('#pg-ref-lbl').textContent = 'Número de referencia del SINPE';
      f.referencia.placeholder = 'Ej.: 2025112512345678'; f.referencia.inputMode = 'numeric';
      $('#pg-file-l').hidden = false; $('#pg-file').required = true;
      btn.textContent = 'Enviar comprobante';
    } else {
      disponible = !!(PG.tarjetaLink || PG.paypalLink);
      const ppUrl = PG.paypalLink ? PG.paypalLink.replace(/\/$/, '') + (/paypal\.me\//i.test(PG.paypalLink) ? `/${total}CRC` : '') : '';
      pasos = disponible ? `
        <li><div>Paga <b>${crc(total)}</b> en la página segura del procesador:<br>
          ${PG.tarjetaLink ? `<a class="copy" href="${esc(PG.tarjetaLink)}" target="_blank" rel="noopener">Pagar con tarjeta ↗</a> ` : ''}${ppUrl ? `<a class="copy" href="${esc(ppUrl)}" target="_blank" rel="noopener">Pagar con PayPal ↗</a>` : ''}</div></li>
        <li><div>Si te lo pide, escribe este código en la nota o descripción:<br>${copia(pg.codigo, 'Copiar')}</div></li>
        <li><div>Al terminar, escribe aquí el <b>número de transacción o autorización</b> que te muestra el comprobante.</div></li>`
        : `<li><div>El pago con tarjeta desde la página estará disponible muy pronto.</div></li>
          <li><div>Puedes <b>pagar con tarjeta en el club</b> (datáfono) o escribirnos por ${wa}.</div></li>
          <li><div>Cuando el staff registre tu pago, se <b>desbloquea la agenda</b>.</div></li>`;
      $('#pg-ref-lbl').textContent = 'Número de transacción o autorización (PayPal: ID de transacción)';
      f.referencia.placeholder = 'Ej.: 123456'; f.referencia.inputMode = 'text';
      $('#pg-file-l').hidden = false; $('#pg-file').required = false;
      $('#pg-file-l span').textContent = 'Comprobante (opcional)';
      btn.textContent = 'Enviar datos del pago';
    }
    if (pg.metodo === 'sinpe') $('#pg-file-l span').textContent = 'Captura del comprobante';
    $('#pg-pasos').innerHTML = pasos;
    f.hidden = !disponible;
  }
  $('#pg-meses').addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (b) { pg.meses = Number(b.dataset.n); pintarPago(); } });
  $('#pg-metodo').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { pg.metodo = b.dataset.m; pintarPago(); } });
  modal.addEventListener('click', async e => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); } catch {}
    const s = $('small', b); if (s) { s.textContent = 'Copiado'; setTimeout(() => { s.textContent = 'Copiar'; }, 1500); }
    sfx('tick');
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pagar]'); if (!b) return;
    e.preventDefault();
    if (!S.user) { setIntent('membresia'); abrir('registro'); return; }
    abrir('pagar');
  });
  async function comprimir(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.2e6) return file;
    return new Promise(res => {
      const im = new Image(), url = URL.createObjectURL(file);
      im.onload = () => {
        const k = Math.min(1, 1800 / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(b => res(b || file), 'image/jpeg', 0.85);
      };
      im.onerror = () => res(file); im.src = url;
    });
  }
  $('#f-pagar').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, st = $('#auth-status'), ref = f.referencia.value.trim(), file = $('#pg-file').files[0];
    if (ref.replace(/\s/g, '').length < 4) return estado(st, 'err', ERRORES.FALTA_REFERENCIA);
    if (pg.metodo === 'sinpe' && !file) return estado(st, 'err', ERRORES.FALTA_COMPROBANTE);
    if (file && file.size > 5 * 1024 * 1024 && !/^image\//.test(file.type)) return estado(st, 'err', 'El archivo pesa más de 5 MB.');
    enviando(f, true); estado(st, 'wait', 'Enviando…');
    try {
      let path = null;
      if (file) {
        const blob = await comprimir(file);
        const ext = blob.type === 'application/pdf' ? 'pdf' : blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
        path = `${S.user.id}/${pg.codigo}.${ext}`;
        const up = await sb.storage.from('comprobantes').upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
        if (up.error) throw up.error;
      }
      const { data, error } = await sb.rpc('reportar_pago', { p_codigo: pg.codigo, p_meses: pg.meses, p_metodo: pg.metodo, p_referencia: ref, p_comprobante_path: path });
      if (error) throw error;
      const p = S.perfil || {};
      avisar(`Pago por verificar ${data.codigo} — ${crc(data.monto)} (${METODO[data.metodo]})`, {
        Tipo: 'PAGO POR VERIFICAR', Código: data.codigo, Método: METODO[data.metodo], Monto: crc(data.monto),
        Meses: String(data.meses), Referencia: data.referencia, Nombre: p.nombre, email: p.email, Teléfono: p.telefono || '—',
        Verificar: 'Panel del staff → Pagos → Por verificar',
      });
      f.reset(); pg.codigo = '';
      await cargarPerfil(); await cargarPendientes(); pintarTodo();
      abrir('cuenta', `Recibimos tu pago de ${crc(data.monto)}. El staff lo verificará pronto y tu membresía se activará sola.`);
    } catch (err) { estado(st, 'err', traducir(err)); }
    enviando(f, false);
  });

  /* =========================================================
     MEMBRESÍA
     ========================================================= */
  function pintarMembresia() {
    const box = $('#join-box');
    if (!S.user) {
      box.innerHTML = `
        <p class="join-lead">Crea tu cuenta para unirte al club y agendar tus citas en línea.</p>
        <button class="btn" type="button" data-auth="registro" data-intent="membresia">Crear cuenta y unirme</button>
        <p class="muted">¿Ya tienes cuenta? <a href="#" data-auth="ingresar" data-intent="membresia" class="ul">Ingresa</a></p>`;
      return;
    }
    const p = S.perfil || {}, nombre = esc((p.nombre || '').split(' ')[0]);
    const m = p.membresia || 'ninguna';
    const pend = (S.pendientes || []).length;
    const vence = p.membresia_vence ? ` hasta el <b>${fmtDia(p.membresia_vence)}</b>` : '';
    if (pend) box.innerHTML = `<p class="join-lead">Hola, ${nombre}. Estamos <b>verificando tu pago</b>.</p><p class="muted">Cuando el staff lo apruebe, tu membresía se activa sola. Puedes ver el estado en <a href="#" class="ul" data-auth="cuenta">Mi cuenta</a>.</p>`;
    else if (m === 'activa') box.innerHTML = `<p class="join-lead">Hola, ${nombre}. Tu membresía está <b>activa</b>${vence}.</p>
        <div class="who-btns"><a class="btn" href="#citas">Agendar una cita</a><button class="btn-line" type="button" data-pagar>Adelantar pago</button></div>`;
    else box.innerHTML = `<p class="join-lead">Hola, ${nombre}.${m === 'vencida' ? ' Tu membresía venció.' : ''}</p>
        <button class="btn" type="button" data-pagar>${m === 'vencida' ? 'Renovar membresía' : 'Pagar membresía'}</button>
        <p class="muted">SINPE Móvil o tarjeta · ${crc(C.precio)}${C.periodo ? ' / ' + C.periodo : ''}</p>`;
  }
  async function solicitarMembresia(st) {
    const { data, error } = await sb.rpc('solicitar_membresia');
    if (error) { estado(st, 'err', traducir(error)); return; }
    const p = S.perfil || {};
    if (data && data.membresia === 'solicitada' && p.membresia !== 'solicitada') {
      avisar(`Nueva solicitud de membresía — ${p.nombre}`, {
        Tipo: 'Solicitud de membresía', Nombre: p.nombre, email: p.email, Teléfono: p.telefono || '—',
        Membresía: crc(C.precio) + (C.periodo ? ' / ' + C.periodo : ''),
      });
    }
    S.perfil = data || S.perfil; pintarMembresia();
  }
  $('#join-box').addEventListener('click', async e => {
    const b = e.target.closest('#btn-solicitar'); if (!b) return;
    b.disabled = true; await solicitarMembresia($('#join-box .status'));
  });

  /* =========================================================
     AGENDA
     ========================================================= */
  const sel = { fecha: null, hora: null, personas: 1 };
  const ocupacion = {};               // fecha -> { 'HH:MM': ocupados }
  const fc = $('#form-cita');
  const servSel = $('select[name=servicio]', fc);
  C.servicios.forEach(s => servSel.add(new Option(s, s)));
  (C.serviciosProximos || []).forEach(s => { const o = new Option(`${s} · Próximamente`, ''); o.disabled = true; servSel.add(o); });
  // Botones "Agendar con…" de la sección Equipo: llevan a la agenda con el servicio ya elegido.
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-servicio]'); if (!a) return;
    e.preventDefault();
    servSel.value = a.dataset.servicio;
    irTab('tab-agendar');
    document.getElementById('citas').scrollIntoView({ behavior: 'smooth', block: 'start' });
    servSel.classList.add('flash'); setTimeout(() => servSel.classList.remove('flash'), 1600);
  });

  function slotsDe(fecha) {
    const [y, m, d] = fecha.split('-').map(Number), out = [], ahora = new Date();
    for (let h = C.horario.inicio; h < C.horario.fin; h++) {
      out.push({ hora: `${pad(h)}:00`, pasada: new Date(y, m - 1, d, h) <= ahora });
    }
    return out;
  }
  function pintarDias() {
    const box = $('#dias'); box.innerHTML = '';
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    for (let i = 0; i <= C.diasAdelante; i++) {
      const d = new Date(hoy); d.setDate(hoy.getDate() + i);
      const f = ymd(d), libre = slotsDe(f).some(s => !s.pasada);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'dia'; b.disabled = !libre; b.dataset.f = f;
      b.innerHTML = `<small>${DIAS[d.getDay()]}</small><b>${d.getDate()}</b><small>${MESES[d.getMonth()]}</small>`;
      if (!sel.fecha && libre) sel.fecha = f;
      box.append(b);
    }
    marcarDia();
  }
  async function cargarOcupacion(fecha) {
    if (!listo) return;
    const { data, error } = await sb.rpc('disponibilidad', { p_fecha: fecha });
    if (error) return;
    ocupacion[fecha] = Object.fromEntries((data || []).map(r => [hhmm(r.hora), r.ocupados]));
    if (fecha === sel.fecha) pintarHoras();
  }
  function marcarDia() {
    $$('#dias .dia').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === sel.fecha)));
    pintarHoras(); if (sel.fecha) cargarOcupacion(sel.fecha);
  }
  function pintarHoras() {
    const box = $('#horas'); box.innerHTML = '';
    if (!sel.fecha) return;
    const occ = ocupacion[sel.fecha] || {};
    const mias = S.citas.filter(c => c.estado === 'activa' && c.fecha === sel.fecha).map(c => hhmm(c.hora));
    slotsDe(sel.fecha).forEach(s => {
      const libres = Math.max(0, C.cupoPorHora - (occ[s.hora] || 0));
      const mia = mias.includes(s.hora);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hora'; b.dataset.h = s.hora;
      const cupoTxt = mia ? 'Tu cita' : s.pasada ? '—' : libres === 0 ? 'Lleno' : `${libres} ${libres === 1 ? 'cupo' : 'cupos'}`;
      b.innerHTML = `<span>${fmtHora(s.hora)}</span><small>${cupoTxt}</small>${ocupacion[sel.fecha] && !s.pasada ? `<i class="dots" aria-hidden="true">${'<b></b>'.repeat(C.cupoPorHora - libres)}${'<em></em>'.repeat(libres)}</i>` : ''}`;
      b.disabled = s.pasada || mia || libres < sel.personas;
      if (b.disabled && sel.hora === s.hora) sel.hora = null;
      b.setAttribute('aria-pressed', String(sel.hora === s.hora));
      b.setAttribute('aria-label', `${fmtHora(s.hora)}, ${cupoTxt}`);
      box.append(b);
    });
  }
  $('#dias').addEventListener('click', e => { const b = e.target.closest('.dia'); if (!b || b.disabled) return; sel.fecha = b.dataset.f; sel.hora = null; marcarDia(); });
  $('#horas').addEventListener('click', e => { const b = e.target.closest('.hora'); if (!b || b.disabled) return; sel.hora = b.dataset.h; pintarHoras(); });
  $('#personas').addEventListener('click', e => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    sel.personas = Number(b.dataset.p);
    $$('#personas [data-p]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    $('#acomp').hidden = sel.personas !== 2;
    $('#acomp input').required = sel.personas === 2;
    pintarHoras();
  });

  const membresiaActiva = () => {
    if (S.admin) return true;
    const p = S.perfil || {};
    return p.membresia === 'activa' && (!p.membresia_vence || p.membresia_vence >= ymd(new Date()));
  };
  async function cargarPendientes() {
    if (!S.user || !listo) { S.pendientes = []; return; }
    const { data } = await sb.from('pagos_pendientes').select('id,estado,monto,meses').eq('user_id', S.user.id).eq('estado', 'pendiente');
    S.pendientes = data || [];
  }
  function pintarCandado() {
    const lock = $('#citas-lock');
    const abierta = listo && S.user && membresiaActiva();
    fc.classList.toggle('locked', !abierta);
    fc.setAttribute('aria-hidden', String(!abierta));
    lock.hidden = !!abierta;
    if (abierta) return;
    const pend = (S.pendientes || []).length > 0;
    const vencida = S.user && (S.perfil || {}).membresia === 'vencida';
    const paso1 = S.user ? 'done' : 'now';
    const paso2 = !S.user ? 'todo' : pend ? 'wait' : 'now';
    const precio = `${crc(C.precio)}${C.periodo ? ' / ' + C.periodo : ''}`;
    lock.innerHTML = `
      <h3>${vencida ? 'Tu membresía venció. Renuévala para seguir agendando.' : 'Para agendar citas necesitas una membresía activa.'}</h3>
      <p>Son tres pasos. Cuando el staff confirme tu pago, esta sección se desbloquea sola.</p>
      <ol class="lock-steps">
        <li class="${paso1}"><span class="n">${paso1 === 'done' ? '✓' : '1'}</span><b>Crea tu cuenta</b>
          ${S.user ? '<small>Listo. Ya tienes tu cuenta.</small>' : `<small>Con tu nombre, correo, teléfono y un contacto de emergencia.</small>
          <button type="button" class="btn" data-auth="registro" data-intent="membresia">Crear cuenta</button>
          <small>¿Ya tienes cuenta? <a href="#" class="ul" data-auth="ingresar">Ingresa aquí</a></small>`}</li>
        <li class="${paso2}"><span class="n">2</span><b>Paga tu membresía</b>
          ${pend ? '<small>Recibimos tu pago. El staff lo está verificando; normalmente es el mismo día.</small><a href="#" class="btn-line" data-auth="cuenta">Ver estado del pago</a>'
                 : `<small>${precio}. Por SINPE Móvil, tarjeta, PayPal o en el club. Al confirmarse tu pago, se desbloquea la agenda.</small>${S.user ? `<button type="button" class="btn" data-pagar>${vencida ? 'Renovar membresía' : 'Pagar membresía'}</button>` : ''}`}</li>
        <li class="todo"><span class="n">3</span><b>Agenda tus citas</b><small>Elige día, hora y servicio. Se desbloquea al confirmar tu pago.</small></li>
      </ol>`;
  }

  function pintarQuien() {
    pintarCandado();
    const who = $('#who'), btn = $('button[type=submit]', fc);
    if (!listo) { who.innerHTML = `<p class="muted">Las reservas en línea se activarán muy pronto. Mientras tanto, escríbenos por ${wa}.</p>`; btn.disabled = true; return; }
    if (!S.user) {
      who.innerHTML = `<p class="muted">Para agendar necesitas una cuenta. Así puedes ver y cancelar tus citas desde cualquier dispositivo.</p>
        <div class="who-btns"><button type="button" class="btn-line" data-auth="ingresar">Ingresar</button><button type="button" class="btn-line" data-auth="registro">Crear cuenta</button></div>`;
      btn.textContent = 'Ingresar para agendar';
    } else {
      const p = S.perfil || {};
      who.innerHTML = `<p class="who-me"><span>Agendando como</span><b>${esc(p.nombre || S.user.email)}</b><small>${esc(p.email || S.user.email)}${p.telefono ? ' · ' + esc(p.telefono) : ''}</small></p>`
        + (tieneEmergencia(p) ? '' : `<p class="who-warn">Falta tu contacto de emergencia. <a href="#" class="ul" data-auth="cuenta">Completar perfil</a></p>`);
      btn.textContent = 'Agendar cita';
    }
    btn.disabled = false;
  }

  fc.addEventListener('submit', async e => {
    e.preventDefault();
    const st = $('.status', fc), btn = $('button[type=submit]', fc);
    if (!S.user) { abrir('ingresar'); return; }
    if (!membresiaActiva()) { abrir('pagar'); return; }
    if (!tieneEmergencia(S.perfil)) { abrir('cuenta'); estado($('#auth-status'), 'err', ERRORES.SIN_EMERGENCIA); return; }
    if (!sel.fecha || !sel.hora) return estado(st, 'err', 'Elige un día y una hora.');
    const d = Object.fromEntries(new FormData(fc));
    if (sel.personas === 2 && !(d.acompanante || '').trim()) return estado(st, 'err', ERRORES.FALTA_ACOMPANANTE);
    btn.disabled = true; estado(st, 'wait', 'Agendando…');
    const { data: c, error } = await sb.rpc('reservar', {
      p_fecha: sel.fecha, p_hora: sel.hora, p_servicio: d.servicio,
      p_personas: sel.personas, p_acompanante: d.acompanante || null, p_notas: d.notas || null,
    });
    btn.disabled = false;
    if (error) { estado(st, 'err', traducir(error)); cargarOcupacion(sel.fecha); return; }
    const p = S.perfil || {};
    avisar(`Nueva cita ${c.codigo} — ${fmtFecha(c.fecha)} ${fmtHora(c.hora)}${c.personas === 2 ? ' (pareja)' : ''}`, {
      Tipo: 'NUEVA CITA', Código: c.codigo, Servicio: c.servicio, Fecha: fmtFecha(c.fecha), Hora: fmtHora(c.hora),
      Personas: c.personas === 2 ? `2 (con ${c.acompanante})` : '1', Nombre: p.nombre, email: p.email,
      Teléfono: p.telefono || '—', Notas: c.notas || '—',
    });
    $('textarea[name=notas]', fc).value = ''; $('#acomp input').value = '';
    sel.hora = null;
    await Promise.all([cargarCitas(), cargarOcupacion(sel.fecha)]);
    estado(st, 'ok', `Cita agendada: <b>${fmtFecha(c.fecha)}, ${fmtHora(c.hora)}</b>${c.personas === 2 ? ' para 2 personas' : ''} — código <b>${c.codigo}</b>. La puedes ver y cancelar en <a href="#" class="ul" data-tab="tab-mias">Mis citas</a>.`);
  });

  /* ---------- mis citas ---------- */
  async function cargarCitas() {
    if (!S.user) { S.citas = []; pintarMias(); return; }
    const { data } = await sb.from('citas').select('*').eq('user_id', S.user.id)
      .gte('fecha', ymd(new Date())).order('fecha', { ascending: true }).order('hora', { ascending: true });
    S.citas = data || []; pintarMias(); pintarHoras();
  }
  function pintarMias() {
    const box = $('#mis-citas');
    const activas = S.citas.filter(c => c.estado === 'activa');
    $('#tab-mias .n').textContent = activas.length || '';
    if (!S.user) {
      box.innerHTML = `<div class="cita"><p class="muted">Ingresa para ver tus citas.</p><button type="button" class="btn-line" data-auth="ingresar">Ingresar</button></div>`;
      return;
    }
    if (!S.citas.length) { box.innerHTML = '<p class="muted" style="padding:20px 0">No tienes citas próximas.</p>'; return; }
    box.innerHTML = S.citas.map(c => `
      <div class="cita ${c.estado}">
        <div><b>${fmtFecha(c.fecha)} · ${fmtHora(c.hora)}</b>
        <small>${esc(c.servicio)} · ${c.personas === 2 ? `2 personas (con ${esc(c.acompanante)})` : '1 persona'} · ${esc(c.codigo)}</small></div>
        ${c.estado === 'activa' ? `<button type="button" class="btn-line" data-cancel="${c.id}">Cancelar</button>` : '<span class="tag">Cancelada</span>'}
      </div>`).join('');
  }
  $('#mis-citas').addEventListener('click', async e => {
    const b = e.target.closest('[data-cancel]'); if (!b) return;
    const c = S.citas.find(x => x.id === b.dataset.cancel); if (!c) return;
    if (!confirm(`¿Cancelar tu cita del ${fmtFecha(c.fecha)} a las ${fmtHora(c.hora)}?`)) return;
    const st = $('#status-mias'); b.disabled = true; estado(st, 'wait', 'Cancelando…');
    const { error } = await sb.rpc('cancelar_cita', { p_id: c.id });
    if (error) { b.disabled = false; return estado(st, 'err', traducir(error)); }
    const p = S.perfil || {};
    avisar(`CANCELACIÓN de cita ${c.codigo} — ${fmtFecha(c.fecha)} ${fmtHora(c.hora)}`, {
      Tipo: 'CANCELACIÓN DE CITA', Código: c.codigo, Fecha: fmtFecha(c.fecha), Hora: fmtHora(c.hora),
      Servicio: c.servicio, Personas: String(c.personas), Nombre: p.nombre, email: p.email,
    });
    await Promise.all([cargarCitas(), cargarOcupacion(c.fecha)]);
    estado(st, 'ok', 'Cita cancelada. El cupo quedó libre para otra persona.');
  });

  /* ---------- pestañas ---------- */
  function irTab(id) {
    const t = document.getElementById(id); if (!t) return;
    $$('.booking .tabs [role=tab]').forEach(x => x.setAttribute('aria-selected', String(x === t)));
    $$('.booking .panel').forEach(p => p.hidden = p.id !== t.getAttribute('aria-controls'));
  }
  $$('.booking .tabs [role=tab]').forEach(t => t.addEventListener('click', () => irTab(t.id)));
  document.addEventListener('click', e => { const a = e.target.closest('[data-tab]'); if (a) { e.preventDefault(); irTab(a.dataset.tab); } });

  /* =========================================================
     SESIÓN
     ========================================================= */
  async function cargarPerfil() {
    if (!S.user) { S.perfil = null; S.admin = false; S.fotoUrl = null; return; }
    const [{ data: p }, { data: adm }] = await Promise.all([
      sb.from('perfiles').select('*').eq('id', S.user.id).maybeSingle(),
      sb.rpc('es_admin'),
    ]);
    S.perfil = p || { nombre: S.user.user_metadata?.nombre || '', email: S.user.email, membresia: 'ninguna' };
    S.admin = !!adm;
    S.fotoUrl = await urlFoto(S.perfil.foto_path);
  }
  function pintarNav() {
    const b = $('#nav-acc');
    const nombre = S.user ? esc((S.perfil?.nombre || 'Mi cuenta').split(' ')[0]) : 'Ingresar';
    b.innerHTML = (S.user && S.fotoUrl ? `<img src="${esc(S.fotoUrl)}" alt="">` : '') + nombre;
    b.classList.toggle('in', !!S.user);
    $('#nav-panel').hidden = !(S.user && S.admin);
  }
  function pintarTodo() { pintarNav(); pintarMembresia(); pintarQuien(); pintarMias(); pintarHoras(); }

  async function alCambiarSesion(session) {
    const antes = S.user?.id;
    S.user = session?.user || null;
    if (S.user?.id === antes && S.perfil) return;
    await cargarPerfil(); await cargarPendientes(); pintarTodo(); await cargarCitas();
    if (S.user && intent === 'membresia') { setIntent(null); if (!membresiaActiva()) abrir('pagar'); }
  }

  pintarDias(); pintarTodo();
  if (listo) {
    sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'PASSWORD_RECOVERY') { S.user = session?.user || null; abrir('nueva', 'Escribe tu nueva contraseña.'); return; }
      setTimeout(() => alCambiarSesion(session), 0);
    });
    sb.auth.getSession().then(({ data }) => alCambiarSesion(data.session));
  }
})();
