/* =========================================================
   THE VOID — estatuas con vida
   ---------------------------------------------------------
   - Brillo de mármol y polvo flotante en las estatuas de los pilares
   - Inclinación 3D y luz que sigue al mouse (solo computadora)
   - Respeta "reducir movimiento" del sistema
   ========================================================= */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  const fino = matchMedia('(hover: hover) and (pointer: fine)').matches;

  // polvo flotante: partículas finas que suben despacio delante de la estatua
  function polvo(frame) {
    const c = document.createElement('canvas');
    c.className = 'polvo'; c.setAttribute('aria-hidden', 'true');
    frame.appendChild(c);
    const ctx = c.getContext('2d');
    let W = 0, H = 0, DPR = 1, parts = [], visible = false;
    const nueva = (y) => ({ x: Math.random() * W, y: y ?? Math.random() * H, r: (0.4 + Math.random() * 1.3) * DPR,
      v: (0.08 + Math.random() * 0.25) * DPR, a: 0.15 + Math.random() * 0.45, f: Math.random() * Math.PI * 2 });
    function medir() {
      DPR = Math.min(devicePixelRatio || 1, 2);
      W = c.width = frame.clientWidth * DPR; H = c.height = frame.clientHeight * DPR;
      parts = Array.from({ length: 26 }, () => nueva());
    }
    new ResizeObserver(medir).observe(frame); medir();
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) requestAnimationFrame(paso); }).observe(frame);
    function paso(t) {
      if (!visible) return;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.y -= p.v; p.x += Math.sin(t / 1400 + p.f) * 0.15 * DPR;
        if (p.y < -4) Object.assign(p, nueva(H + 4));
        ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(t / 900 + p.f));
        ctx.fillStyle = '#f2f2f0';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      requestAnimationFrame(paso);
    }
  }

  document.querySelectorAll('.card .frame').forEach((frame, i) => {
    frame.style.setProperty('--delay', `${-i * 4.3}s`);
    const brillo = document.createElement('span');
    brillo.className = 'brillo'; brillo.setAttribute('aria-hidden', 'true');
    frame.appendChild(brillo);
    polvo(frame);

    if (!fino) return;
    const card = frame.closest('.card');
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0, dentro = false;
    const anima = () => {
      cx += (tx - cx) * 0.12; cy += (ty - cy) * 0.12;
      frame.style.setProperty('--tx', (cy * -7).toFixed(2) + 'deg');
      frame.style.setProperty('--ty', (cx * 9).toFixed(2) + 'deg');
      frame.style.setProperty('--lx', (50 + cx * 50).toFixed(1) + '%');
      frame.style.setProperty('--ly', (50 + cy * 50).toFixed(1) + '%');
      if (dentro || Math.abs(cx) > 0.002 || Math.abs(cy) > 0.002) raf = requestAnimationFrame(anima); else raf = 0;
    };
    card.addEventListener('pointermove', e => {
      const r = frame.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width * 2 - 1));
      ty = Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height * 2 - 1));
      dentro = true; frame.classList.add('luz');
      if (!raf) raf = requestAnimationFrame(anima);
    });
    card.addEventListener('pointerleave', () => { tx = 0; ty = 0; dentro = false; frame.classList.remove('luz'); if (!raf) raf = requestAnimationFrame(anima); });
  });
})();
