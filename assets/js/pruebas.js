// Dónde vigilan las pruebas (V4): casos de prueba por área funcional —la
// aplicación «tests» de codigo.mapa— en anillo radial; por debajo de cierto
// ancho cambia a un lollipop ordenado, que se lee sin problemas en móvil.
// Reutiliza el tooltip y los textos de F2/F3; los segmentos usan los mismos
// tonos de la familia --map-tests que el nivel 2 del mapa (sin colores
// nuevos). Todo el texto se inserta con textContent: ninguna cadena se
// interpreta como HTML.

const NS = 'http://www.w3.org/2000/svg';
const ANCHO_MIN = 600;   // contenedor más estrecho → lollipop
const ALTO_ANILLO = 400;
const RADIO_MAX = 150;
const HUECO_ARCO = 2;    // separación entre segmentos del anillo (px)
const LINEA = 14;        // altura de línea de los rótulos (px)

let UI = null;
let ctx = null;      // { t, num, tip } del panel
let modelo = null;   // { areas: [{ clave, casos }], total }
let ultimo = { w: 0 };
let medidor = null;  // span oculto para medir texto con la misma tipografía

const numero = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
function svgEl(tag, clase, attrs) {
  const e = document.createElementNS(NS, tag);
  if (clase) e.setAttribute('class', clase);
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}
function nodo(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
}

// --- Entrada ------------------------------------------------------------------------
export function pintarPruebas(json, contexto) {
  if (!iniciar()) return;
  ctx = contexto;
  modelo = normalizar(json);
  UI.host.replaceChildren();
  if (!modelo) {
    UI.cuerpo.hidden = true;
    UI.vacio.hidden = false;
    return;
  }
  UI.vacio.hidden = true;
  UI.cuerpo.hidden = false;
  dibujar();
}

function iniciar() {
  if (UI) return true;
  const b = (id) => document.getElementById(id);
  const card = b('card-tests');
  if (!card) return false;
  UI = { card, cuerpo: b('ring-body'), host: b('ring-chart'), vacio: b('ring-empty') };
  if (!UI.cuerpo || !UI.host) return false;
  conectarTooltips();
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      if (!modelo) return;
      const w = Math.max(320, UI.host.clientWidth);
      if (Math.abs(w - ultimo.w) < 1) return;
      dibujar();
    }).observe(UI.host);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (modelo) dibujar(); });
  }
  return true;
}

function normalizar(json) {
  const tests = json && json.codigo && json.codigo.mapa && json.codigo.mapa.tests;
  if (!Array.isArray(tests)) return null;
  const areas = tests
    .filter((f) => f && typeof f.clave === 'string')
    .map((f) => ({ clave: f.clave, casos: numero(f.casos) }))
    .filter((a) => a.casos > 0)
    .sort((a, b) => b.casos - a.casos);
  if (!areas.length) return null;
  const total = areas.reduce((s, a) => s + a.casos, 0);
  return { areas, total };
}

// --- Textos -------------------------------------------------------------------------
function etiquetaArea(clave) {
  const k = `fn.tests.${clave}`;
  const texto = ctx.t(k);
  return texto === k ? clave : texto;
}
function pctTexto(p) {
  if (p > 0 && p < 0.05) return ctx.t('map.pctLess');
  return ctx.t('map.pctFmt', { p: ctx.num(p, 1) });
}
function pctDe(casos) { return pctTexto((100 * casos) / modelo.total); }
function casosTexto(n) {
  return n === 1 ? ctx.t('ring.cases.one') : ctx.t('map.cases', { n: ctx.num(n) });
}
function unidadCorta(n) {
  return n === 1 ? ctx.t('ring.unit.one') : ctx.t('ring.unit');
}
function ariaDe(area) {
  return ctx.t('ring.aria', {
    area: etiquetaArea(area.clave),
    casos: casosTexto(area.casos),
    pct: pctDe(area.casos),
  });
}
function fichaDe(area) {
  return {
    etiqueta: `${etiquetaArea(area.clave)} · ${pctDe(area.casos)} ${ctx.t('map.ofTotal')}`,
    valor: casosTexto(area.casos),
  };
}
function anchoTexto(texto, clase) {
  if (!medidor) {
    medidor = nodo('span', 'rp-medir');
    document.body.append(medidor);
  }
  medidor.className = `rp-medir ${clase}`;
  medidor.textContent = texto;
  return medidor.getBoundingClientRect().width;
}
/** Reparte el nombre en líneas (la última palabra sola, si cabe) según el ancho. */
function envolver(texto, maxW, clase) {
  const lineas = [];
  let actual = '';
  for (const palabra of texto.split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (!actual || anchoTexto(prueba, clase) <= maxW) actual = prueba;
    else { lineas.push(actual); actual = palabra; }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

// --- Dibujo -------------------------------------------------------------------------
function dibujar() {
  if (!modelo || !UI.host) return;
  const w = Math.max(320, UI.host.clientWidth || 640);
  ultimo = { w };
  UI.host.replaceChildren(w < ANCHO_MIN ? crearLollipop() : crearAnillo(w));
}

function crearAnillo(w) {
  const H = ALTO_ANILLO;
  const R = Math.max(96, Math.min(RADIO_MAX, w / 2 - 206));
  const cx = w / 2;
  const cy = H / 2;
  const rInt = R * 0.6;
  const rm = (R + rInt) / 2;
  const circ = 2 * Math.PI * rm;
  const svg = svgEl('svg', 'rp-svg', {
    width: w, height: H, viewBox: `0 0 ${w} ${H}`,
    role: 'group', 'aria-label': ctx.t('ring.svg.aria'),
  });
  // Segmentos: círculo con trazo discontinuo, uno por área y en orden de valor.
  const anillo = svgEl('g', 'rp-ring');
  let acc = 0;
  modelo.areas.forEach((area, i) => {
    const frac = area.casos / modelo.total;
    const len = Math.max(0.5, circ * frac - HUECO_ARCO);
    const seg = svgEl('circle', `rp-seg rt-${i + 1}`, {
      cx, cy, r: rm, fill: 'none', 'stroke-width': R - rInt,
      'stroke-dasharray': `${len} ${circ}`,
      'stroke-dashoffset': -(circ * acc + HUECO_ARCO / 2),
      transform: `rotate(-90 ${cx} ${cy})`,
      tabindex: '0', role: 'img', 'aria-label': ariaDe(area),
    });
    seg.dataset.i = i;
    anillo.append(seg);
    acc += frac;
  });
  // Cifra central: total con su rótulo.
  const centro = svgEl('g', 'rp-centro');
  const total = svgEl('text', 'rp-total', { x: cx, y: cy + 5, 'text-anchor': 'middle' });
  total.textContent = ctx.num(modelo.total);
  const rotulo = svgEl('text', 'rp-centro-t', { x: cx, y: cy + 27, 'text-anchor': 'middle' });
  rotulo.textContent = ctx.t('ring.center');
  centro.append(total, rotulo);
  svg.append(anillo, centro);
  // Rótulos con guía, en dos o tres líneas, sin solaparse.
  const maxW = Math.max(120, w / 2 - R - 36);
  const bloques = { der: [], izq: [] };
  acc = 0;
  modelo.areas.forEach((area) => {
    const frac = area.casos / modelo.total;
    const rad = ((-90 + 360 * (acc + frac / 2)) * Math.PI) / 180;
    acc += frac;
    const nombre = etiquetaArea(area.clave);
    const lineas = envolver(nombre, maxW, 'rp-nom');
    const h = lineas.length * LINEA + LINEA + 3;
    bloques[Math.cos(rad) >= 0 ? 'der' : 'izq'].push({
      area, rad, lineas, h, y: cy + Math.sin(rad) * (R + 22) - h / 2,
    });
  });
  for (const lado of ['der', 'izq']) {
    repartir(bloques[lado], 10, H - 10);
    for (const l of bloques[lado]) {
      const xBase = lado === 'der' ? cx + R + 26 : cx - R - 26;
      const anclaje = lado === 'der' ? 'start' : 'end';
      const g = svgEl('g', 'rp-lbl');
      const borde = punto(cx, cy, R + 3, l.rad);
      const codo = punto(cx, cy, R + 16, l.rad);
      g.append(svgEl('polyline', 'rp-lead', {
        points: `${borde.x},${borde.y} ${codo.x},${codo.y} ${xBase + (lado === 'der' ? -6 : 6)},${l.y + 7}`,
      }));
      const nom = svgEl('text', 'rp-nom', { x: xBase, y: l.y + 11, 'text-anchor': anclaje });
      l.lineas.forEach((linea, i) => {
        const ts = svgEl('tspan', null, { x: xBase, dy: i === 0 ? 0 : LINEA });
        ts.textContent = linea;
        nom.append(ts);
      });
      const val = svgEl('text', 'rp-val', {
        x: xBase, y: l.y + 11 + l.lineas.length * LINEA + 1, 'text-anchor': anclaje,
      });
      val.textContent = `${ctx.num(l.area.casos)} ${unidadCorta(l.area.casos)} · ${pctDe(l.area.casos)}`;
      g.append(nom, val);
      svg.append(g);
    }
  }
  return svg;
}
function punto(cx, cy, r, rad) {
  return { x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r };
}
/** Separa verticalmente los rótulos de un lado, sin salirse del lienzo. */
function repartir(lista, minY, maxY) {
  if (!lista.length) return;
  lista.sort((a, b) => a.y - b.y);
  let prev = -Infinity;
  for (const b of lista) {
    b.y = Math.max(b.y, prev + 4);
    prev = b.y + b.h;
  }
  const ult = lista[lista.length - 1];
  const sobra = ult.y + ult.h - maxY;
  if (sobra > 0) for (const b of lista) b.y -= sobra;
  const falta = minY - lista[0].y;
  if (falta > 0) for (const b of lista) b.y += falta;
}

function crearLollipop() {
  const total = nodo('p', 'rp-lp-total');
  total.append(nodo('b', null, ctx.num(modelo.total)), nodo('span', null, ` ${ctx.t('ring.center')}`));
  const ol = nodo('ol', 'rp-lp');
  const max = modelo.areas[0].casos;
  modelo.areas.forEach((area, i) => {
    const li = nodo('li', `rp-row rt-${i + 1}`);
    li.tabIndex = 0;
    li.dataset.i = i;
    li.setAttribute('aria-label', ariaDe(area));
    const cab = nodo('span', 'rp-lp-cab');
    cab.append(nodo('span', 'rp-lp-nom', etiquetaArea(area.clave)));
    const fig = nodo('span', 'rp-lp-fig');
    fig.append(nodo('b', null, ctx.num(area.casos)), nodo('span', 'rp-lp-pct', pctDe(area.casos)));
    cab.append(fig);
    const barra = (area.casos / max) * 100;
    const track = nodo('span', 'rp-lp-track');
    track.setAttribute('aria-hidden', 'true');
    const linea = nodo('i', 'rp-lp-bar');
    linea.style.width = `${barra.toFixed(2)}%`;
    const punto2 = nodo('i', 'rp-lp-dot');
    punto2.style.left = `${barra.toFixed(2)}%`;
    track.append(linea, punto2);
    li.append(cab, track);
    ol.append(li);
  });
  const caja = nodo('div', 'rp-lp-caja');
  caja.append(total, ol);
  return caja;
}

// --- Interacción ----------------------------------------------------------------------
function conectarTooltips() {
  const host = UI.host;
  const areaDe = (ev, selector) => {
    const el = ev.target.closest(selector);
    return el && el.dataset.i != null ? modelo.areas[Number(el.dataset.i)] : null;
  };
  host.addEventListener('mousemove', (ev) => {
    const area = areaDe(ev, '.rp-seg, .rp-row');
    if (!area) return;
    const f = fichaDe(area);
    ctx.tip.mostrar(ev, f.etiqueta, f.valor);
  });
  host.addEventListener('mouseleave', () => ctx.tip.ocultar());
  host.addEventListener('focusin', (ev) => {
    const el = ev.target.closest('.rp-seg, .rp-row');
    const area = areaDe(ev, '.rp-seg, .rp-row');
    if (!area) return;
    const f = fichaDe(area);
    ctx.tip.mostrarEn(el, f.etiqueta, f.valor);
  });
  host.addEventListener('focusout', () => ctx.tip.ocultar());
}
