/* =========================================================
   THE VOID — música de fondo y efectos de sonido
   ---------------------------------------------------------
   - La música arranca con la primera interacción (los navegadores
     no permiten audio automático) y se puede apagar con el botón ♪.
   - Los efectos se generan con Web Audio (sin archivos extra).
   - La preferencia (encendido/apagado) se recuerda en el navegador.
   ========================================================= */
(() => {
  const MUSICA = 'assets/audio/theseus.mp3';   // Theseus – The Athenian Hero
  const VOL_MUSICA = 0.10;      // música de fondo: 10 %
  const VOL_EFECTOS = 0.90;     // efectos de sonido: 90 % (0 a 1)
  const KEY = 'thevoid.sonido';

  let on = true;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch {}
  const fino = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- música ---------- */
  const musica = new Audio();
  musica.src = MUSICA; musica.loop = true; musica.preload = 'none'; musica.volume = 0;
  let fadeId = 0;
  function fade(to, ms = 1200, then) {
    const id = ++fadeId, from = musica.volume, t0 = performance.now();
    (function step(t) {
      if (id !== fadeId) return;
      const k = Math.min(1, (t - t0) / ms);
      musica.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k < 1) requestAnimationFrame(step); else if (then) then();
    })(t0);
  }
  function tocarMusica() {
    if (!on) return;
    const p = musica.play();
    if (p && p.catch) p.catch(() => {});
    fade(VOL_MUSICA, 1800);
  }
  function pararMusica() { fade(0, 600, () => musica.pause()); }
  // baja la música cuando la pestaña no está visible
  document.addEventListener('visibilitychange', () => {
    if (!on || musica.paused) return;
    fade(document.hidden ? 0 : VOL_MUSICA, 500);
  });

  /* ---------- efectos (Web Audio) ---------- */
  let ctx = null, master = null, rev = null;
  function audio() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = VOL_EFECTOS * 2; master.connect(ctx.destination);
    // eco suave para los acordes
    rev = ctx.createDelay(); rev.delayTime.value = 0.16;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    rev.connect(lp); lp.connect(fb); fb.connect(rev); lp.connect(master);
    return ctx;
  }
  function tono({ f = 880, f2, tipo = 'sine', t = 0, dur = 0.08, vol = 0.05, ataque = 0.004, eco = 0 }) {
    const c = audio(); if (!c) return;
    const t0 = c.currentTime + t, o = c.createOscillator(), g = c.createGain();
    o.type = tipo; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    if (eco) { const ge = c.createGain(); ge.gain.value = eco; g.connect(ge); ge.connect(rev); }
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function ruido({ t = 0, dur = 0.25, vol = 0.04, desde = 400, hasta = 3000, q = 0.8 }) {
    const c = audio(); if (!c) return;
    const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(), t0 = c.currentTime + t;
    s.buffer = buf; bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(desde, t0); bp.frequency.exponentialRampToValueAtTime(hasta, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(bp); bp.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur);
  }

  const SFX = {
    hover:   () => tono({ f: 2400, dur: 0.025, vol: 0.012 }),
    tick:    () => tono({ f: 1500, f2: 1100, dur: 0.05, vol: 0.035 }),
    select:  () => { tono({ f: 660, f2: 990, tipo: 'triangle', dur: 0.09, vol: 0.05 }); tono({ f: 1980, dur: 0.03, vol: 0.015 }); },
    tab:     () => { tono({ f: 520, dur: 0.06, vol: 0.03, tipo: 'triangle' }); tono({ f: 780, t: 0.05, dur: 0.07, vol: 0.03, tipo: 'triangle' }); },
    open:    () => { ruido({ dur: 0.28, vol: 0.035, desde: 300, hasta: 2600 }); tono({ f: 220, f2: 440, dur: 0.22, vol: 0.025, eco: 0.3 }); },
    close:   () => ruido({ dur: 0.2, vol: 0.025, desde: 2400, hasta: 300 }),
    success: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tono({ f, tipo: 'triangle', t: i * 0.07, dur: 0.5, vol: 0.045, ataque: 0.01, eco: 0.5 })),
    login:   () => {
      [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tono({ f, tipo: 'sine', t: i * 0.06, dur: 0.7, vol: 0.05, ataque: 0.01, eco: 0.6 }));
      tono({ f: 130.81, tipo: 'sine', dur: 0.9, vol: 0.06, ataque: 0.03 });
      ruido({ t: 0.02, dur: 0.5, vol: 0.02, desde: 2000, hasta: 8000, q: 0.5 });
    },
    error:   () => { tono({ f: 311, tipo: 'square', dur: 0.12, vol: 0.02 }); tono({ f: 233, tipo: 'square', t: 0.11, dur: 0.18, vol: 0.02 }); },
    boom:    () => { tono({ f: 90, f2: 32, dur: 1.1, vol: 0.12, ataque: 0.01 }); ruido({ dur: 0.9, vol: 0.05, desde: 120, hasta: 1800, q: 0.4 }); tono({ f: 1318, t: 0.15, dur: 1.2, vol: 0.02, eco: 0.7 }); },
    toggle:  () => tono({ f: on ? 880 : 440, f2: on ? 1320 : 330, dur: 0.12, vol: 0.04, tipo: 'triangle' }),
  };

  let ultimoHover = 0;
  function play(nombre) {
    if (!on || !SFX[nombre]) return;
    const c = audio(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    if (nombre === 'hover') { const n = performance.now(); if (n - ultimoHover < 70) return; ultimoHover = n; }
    try { SFX[nombre](); } catch {}
  }
  const listo = () => ctx && ctx.state === 'running';

  /* ---------- desbloqueo con la primera interacción ---------- */
  function desbloquear() {
    const c = audio(); if (c && c.state === 'suspended') c.resume();
    tocarMusica();
    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev => removeEventListener(ev, desbloquear, true));
  }
  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev => addEventListener(ev, desbloquear, { capture: true, passive: true }));

  /* ---------- botón ♪ ---------- */
  const btn = document.getElementById('snd');
  function pintar() {
    if (!btn) return;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Silenciar música y sonidos' : 'Activar música y sonidos');
    btn.title = on ? 'Sonido: activado' : 'Sonido: apagado';
  }
  if (btn) btn.addEventListener('click', e => {
    e.stopPropagation();
    on = !on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
    if (on) { tocarMusica(); play('toggle'); } else { SFX.toggle(); pararMusica(); }
    pintar();
  });
  pintar();
  musica.addEventListener('playing', () => btn && btn.classList.add('playing'));
  musica.addEventListener('pause', () => btn && btn.classList.remove('playing'));

  /* ---------- sonidos automáticos por interacción ---------- */
  const SEL_SELECT = '.dia, .hora, .seg button, #rol button';
  const SEL_TAB = '[role=tab]';
  const SEL_TICK = 'a, button, .btn, .btn-line, select';
  document.addEventListener('click', e => {
    const el = e.target.closest(`${SEL_SELECT}, ${SEL_TAB}, ${SEL_TICK}`);
    if (!el || el.disabled || el.id === 'snd' || el.closest('#snd')) return;
    if (el.type === 'submit') return;            // el resultado (éxito/error) suena después
    if (el.matches(SEL_SELECT)) play('select');
    else if (el.matches(SEL_TAB)) play('tab');
    else if (el.matches('[data-close], .modal-x')) play('close');
    else play('tick');
  });
  if (fino) document.addEventListener('pointerover', e => {
    const el = e.target.closest('.dia:not([disabled]), .hora:not([disabled]), .nav-acc, .nav-panel, nav ul a, .btn, .ev, .card .frame');
    if (el && !el.contains(e.relatedTarget)) play('hover');
  });

  // relincho del caballo
  const relinchoAudio = new Audio('assets/audio/relincho-2.mp3');
  relinchoAudio.preload = 'auto';
  function relincho() {
    if (!on) return;
    const c = audio(); if (c && c.state === 'suspended') c.resume();
    if (musica.volume > 0.04 && !musica.paused) { fade(0.04, 250); setTimeout(() => on && !musica.paused && fade(VOL_MUSICA, 900), 4700); }
    try { relinchoAudio.currentTime = 0; relinchoAudio.volume = Math.min(1, VOL_EFECTOS); const p = relinchoAudio.play(); if (p && p.catch) p.catch(() => {}); } catch {}
  }

  window.VOID_SFX = { play, listo, relincho };
})();
