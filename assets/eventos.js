/* =========================================================
   THE VOID — Próximos eventos
   ---------------------------------------------------------
   Los eventos se administran desde el PANEL DEL STAFF → pestaña Eventos.
   Esta lista solo se usa como respaldo si la base de datos no responde.
   Para publicar un evento de respaldo, copia el bloque de ejemplo de abajo,
   pégalo dentro de la lista EVENTOS y cambia los datos.
   Los eventos que ya pasaron se ocultan solos.

   Campos:
     fecha        'AAAA-MM-DD'          (obligatorio)
     hora         '6:00 a.m.'           (texto libre, opcional)
     titulo       'Void Run 5K'         (obligatorio)
     tipo         'Carrera' | 'Actividad' | 'Taller' | …  (opcional)
     lugar        'Parque La Sabana'    (opcional)
     descripcion  texto corto           (opcional)
     precio       '₡10.000' o 'Gratis'  (opcional)
     enlace       URL de inscripción externa (opcional; si no hay,
                  el botón abre WhatsApp con un mensaje listo)

   Ejemplo (bórrale las dos barras // del inicio de cada línea):
   // {
   //   fecha: '2026-12-06',
   //   hora: '6:00 a.m.',
   //   titulo: 'Void Run 5K',
   //   tipo: 'Carrera',
   //   lugar: 'Parque La Sabana',
   //   descripcion: 'Carrera de 5 km para todos los niveles. Recovery al terminar.',
   //   precio: '₡10.000',
   // },
   ========================================================= */
const EVENTOS = [

];

(() => {
  const WA = '50662002634';
  const box = document.getElementById('lista-eventos');
  if (!box) return;
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const now = new Date(), hoy = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  async function cargar() {
    const sb = window.VOID_SB;
    if (sb) {
      const { data, error } = await sb.from('eventos').select('*').eq('publicado', true).gte('fecha', hoy)
        .order('fecha', { ascending: true }).order('hora', { ascending: true });
      if (!error && data) return data;
    }
    return EVENTOS.filter(e => e && e.fecha && e.titulo && e.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }
  cargar().then(pintar);

  function pintar(lista) {

  if (!lista.length) {
    box.innerHTML = `
      <div class="ev-empty">
        <p>Pronto anunciaremos nuevas carreras y actividades.</p>
        <a href="https://www.instagram.com/thevoidclub.cr/" target="_blank" rel="noopener" class="btn-line">Síguenos en Instagram</a>
      </div>`;
    return;
  }

  box.innerHTML = lista.map((e, i) => {
    const [y, m, d] = e.fecha.split('-').map(Number);
    const dia = DIAS[new Date(y, m - 1, d).getDay()];
    const fechaTxt = `${dia} ${d} de ${MESES[m - 1]}`;
    const meta = [e.hora, e.lugar, e.precio].filter(Boolean).map(esc).join(' · ');
    const msg = encodeURIComponent(`Hola THE VOID, quiero inscribirme en "${e.titulo}" (${fechaTxt}).`);
    const href = e.enlace ? esc(e.enlace) : `https://wa.me/${WA}?text=${msg}`;
    return `
      <article class="ev reveal" style="transition-delay:${i * 0.08}s">
        <div class="ev-date"><b>${pad(d)}</b><span>${MESES[m - 1]}</span></div>
        <div class="ev-body">
          ${e.tipo ? `<span class="ev-tag">${esc(e.tipo)}</span>` : ''}
          <h3>${esc(e.titulo)}</h3>
          <p class="ev-meta">${esc(dia)}${meta ? ' · ' + meta : ''}</p>
          ${e.descripcion ? `<p class="ev-desc">${esc(e.descripcion)}</p>` : ''}
        </div>
        <a class="ev-go" href="${href}" target="_blank" rel="noopener" aria-label="Inscribirme en ${esc(e.titulo)}">
          <span>Inscribirme</span><i aria-hidden="true">→</i>
        </a>
      </article>`;
  }).join('');

  const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { threshold: .2 });
  box.querySelectorAll('.reveal').forEach(el => io.observe(el));
  }
})();
