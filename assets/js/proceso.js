// Pulso semanal (V2) y crecimiento mensual (V3), en la sección «Proceso».
// Áreas apiladas SVG sin dependencias. Cruz de lectura con ratón, toque y
// teclado (flechas), animación de entrada al hacerse visibles y estado vacío
// si la serie falta o tiene menos de dos puntos. Los colores salen de los
// tokens --map-* que fijó F2 (ninguno nuevo) y los textos del panel.
// Todo el texto se inserta con textContent: ninguna cadena se interpreta como HTML.

const NS = 'http://www.w3.org/2000/svg';

// V2: repositorios con el color de marca que fijó F2 para cada uno.
const REPOS = [
  { clave: 'content', texto: 'pulse.repo.content', clase: 's-content' },
  { clave: 'vanilla', texto: 'pulse.repo.vanilla', clase: 's-vanilla' },
  { clave: 'diagrams', texto: 'pulse.repo.diagrams', clase: 's-diagrams' },
];
// V3: las aplicaciones del mapa del código (V1), con sus mismos colores.
const APPS = [
  { clave: 'site', texto: 'comp.site', clase: 's-site' },
  { clave: 'panel', texto: 'comp.panel', clase: 's-panel' },
  { clave: 'publicacion', texto: 'comp.publicacion', clase: 's-publicacion' },
  { clave: 'herramientas', texto: 'comp.herramientas', clase: 's-herramientas' },
  { clave: 'tests', texto: 'comp.tests', clase: 's-tests' },
];

let UI = null;
let ctx = null;     // { t, num, mes, mesCorto, anio, fecha, inicio, tip } del panel
let pulso = null;   // gráfico semanal
let crec = null;    // gráfico mensual
let activo = null;  // gráfico cuya cruz de lectura está visible (tooltip compartido)

const num2 = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const totalDe = (p, series) => series.reduce((s, x) => s + num2(p[x.clave]), 0);
const reducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
export function pintarProceso(json, contexto) {
  if (!iniciar()) return;
  ctx = contexto;
  activo = null;
  ctx.tip.ocultar();
  const proceso = (json && json.proceso) || {};
  pintarPulso(seriePulso(proceso.semanas));
  pintarCrecimiento(serieCrecimiento(proceso.crecimiento));
}

function iniciar() {
  if (UI) return true;
  const b = (id) => document.getElementById(id);
  const cardP = b('card-pulse');
  const cardC = b('card-growth');
  if (!cardP || !cardC || !b('pulse-chart') || !b('growth-chart')) return false;
  UI = {
    cardP, cardC,
    bodyP: b('pulse-body'), stats: b('pulse-stats'), legendP: b('pulse-legend'),
    liveP: b('pulse-live'), table: b('pulse-table'), emptyP: b('pulse-empty'),
    bodyC: b('growth-body'), legendC: b('growth-legend'), liveC: b('growth-live'),
    emptyC: b('growth-empty'), cases: b('growth-cases'),
  };
  pulso = crearGrafico(b('pulse-chart'), UI.liveP, {
    series: REPOS,
    alto: (chico) => (chico ? 200 : 268),
    unidad: () => ctx.t('pulse.unit'),
    aria: () => ctx.t('pulse.svg.aria'),
    total: (p) => totalDe(p, REPOS),
    ticksX: ticksSemanas,
    titulo: (p) => `${ctx.t('pulse.tip.week', { fecha: ctx.fecha(p.fecha) })} · ${ctx.t('pulse.tip.total', { n: ctx.num(totalDe(p, REPOS)) })}`,
  });
  crec = crearGrafico(b('growth-chart'), UI.liveC, {
    series: APPS,
    alto: (chico) => (chico ? 190 : 250),
    unidad: () => ctx.t('growth.unit'),
    aria: () => ctx.t('growth.svg.aria'),
    total: (p) => totalDe(p, APPS),
    ticksX: ticksMeses,
    titulo: (p) => `${ctx.mes(p.fecha, true)} · ${ctx.t('growth.tip.total', { n: ctx.num(totalDe(p, APPS)) })}`,
  });
  const miniHost = nodo('div', 'cases-host');
  UI.mini = crearMini(miniHost);
  return true;
}

// --- Datos --------------------------------------------------------------------------
function seriePulso(crudas) {
  if (!Array.isArray(crudas)) return null;
  const puntos = crudas
    .filter((p) => p && typeof p.semana === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.semana))
    .map((p) => ({
      fecha: p.semana,
      content: num2(p.content), vanilla: num2(p.vanilla), diagrams: num2(p.diagrams),
    }))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  if (puntos.length < 2) return null;
  return puntos.some((p) => totalDe(p, REPOS) > 0) ? puntos : null;
}
function serieCrecimiento(crudas) {
  if (!Array.isArray(crudas)) return null;
  const puntos = crudas
    .filter((p) => p && typeof p.mes === 'string' && /^\d{4}-\d{2}$/.test(p.mes))
    .map((p) => {
      const punto = { fecha: p.mes, casos: num2(p.casos) };
      for (const s of APPS) punto[s.clave] = num2(p[s.clave]);
      return punto;
    })
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  if (puntos.length < 2) return null;
  return puntos.some((p) => totalDe(p, APPS) > 0) ? puntos : null;
}

// --- Ejes ---------------------------------------------------------------------------
/** Paso «bonito» (1, 2 o 5 por potencia de diez) y tope redondeado, ≤ 4 saltos. */
function escalaY(max) {
  if (!(max > 0)) return { paso: 1, tope: 1 };
  let mag = 1;
  for (let exp = 0; exp < 12; exp++) {
    for (const p of [1, 2, 5]) {
      const paso = p * mag;
      if (max / paso <= 4) return { paso, tope: Math.ceil(max / paso) * paso };
    }
    mag *= 10;
  }
  return { paso: mag, tope: mag };
}
/** Un rótulo por mes (en la primera semana de cada mes). */
function ticksSemanas(puntos, chico) {
  const ticks = [];
  let mes = '';
  puntos.forEach((p, i) => {
    const m = p.fecha.slice(0, 7);
    if (m === mes) return;
    mes = m;
    const primero = ticks.length === 0;
    const conAnio = (primero && !chico) || m.endsWith('-01');
    ticks.push({
      i,
      anclaje: primero ? 'start' : 'middle',
      texto: conAnio ? `${ctx.mesCorto(m)} ${ctx.anio(m)}` : ctx.mesCorto(m),
    });
  });
  if (ticks.length) ticks[ticks.length - 1].anclaje = 'end';
  return ticks;
}
/** Un rótulo por mes, en el punto de cada mes. */
function ticksMeses(puntos, chico) {
  return puntos.map((p, i) => ({
    i,
    anclaje: i === 0 ? 'start' : (i === puntos.length - 1 ? 'end' : 'middle'),
    texto: ((i === 0 && !chico) || p.fecha.endsWith('-01'))
      ? `${ctx.mesCorto(p.fecha)} ${ctx.anio(p.fecha)}`
      : ctx.mesCorto(p.fecha),
  }));
}

// --- Gráfico de áreas apiladas -------------------------------------------------------
function crearGrafico(host, live, opciones) {
  const svg = svgEl('svg', 'pp-svg');
  svg.setAttribute('role', 'group');
  svg.setAttribute('tabindex', '0');
  host.append(svg);
  const g = {
    opciones, host, svg, live,
    puntos: null, indice: null, modo: null,
    W: 0, H: 0, m: null, ph: 0, pw: 0, escala: null,
    x: [], acum: [], marcas: [], yPx: null, cuadro: false, timer: 0,
  };
  conectar(g);
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      if (!g.puntos) return;
      const w = host.clientWidth;
      if (g.cuadro && Math.abs(w - g.W) < 1) return;
      clearTimeout(g.timer);
      g.timer = setTimeout(() => dibujar(g), 60);
    }).observe(host);
  }
  return g;
}

function dibujar(g) {
  const puntos = g.puntos;
  if (!puntos || !puntos.length) return;
  const W = Math.max(220, g.host.clientWidth || 600);
  const chico = W < 560;
  const H = g.opciones.alto(chico);
  const m = chico
    ? { top: 18, right: 8, bottom: 26, left: 44 }
    : { top: 20, right: 12, bottom: 30, left: 56 };
  const pw = Math.max(1, W - m.left - m.right);
  const ph = Math.max(1, H - m.top - m.bottom);
  const n = puntos.length;
  const esc = escalaY(Math.max(...puntos.map((p) => g.opciones.total(p))));
  const x = (i) => (n === 1 ? m.left + pw / 2 : m.left + (i / (n - 1)) * pw);
  const y = (v) => m.top + ph - (v / esc.tope) * ph;
  const acum = [];
  let acc = new Array(n).fill(0);
  for (const s of g.opciones.series) {
    acc = acc.map((v, i) => v + num2(puntos[i][s.clave]));
    acum.push(acc.slice());
  }
  Object.assign(g, {
    W, H, m, ph, pw, escala: esc, x: puntos.map((_, i) => x(i)), acum, yPx: y, cuadro: true,
  });
  g.svg.setAttribute('width', W);
  g.svg.setAttribute('height', H);
  g.svg.setAttribute('aria-label', g.opciones.aria());
  const plot = svgEl('g', 'pplot');
  // Rejilla y rótulos del eje vertical, con la unidad en la esquina.
  for (let k = 0; k * esc.paso <= esc.tope + 1e-9; k++) {
    const v = k * esc.paso;
    plot.append(svgEl('line', 'gridline', { x1: m.left, y1: y(v), x2: W - m.right, y2: y(v) }));
    const rotulo = svgEl('text', 'axis-label pp-num', { x: m.left - 7, y: y(v) + 4, 'text-anchor': 'end' });
    rotulo.textContent = ctx.num(v);
    plot.append(rotulo);
  }
  const unidad = svgEl('text', 'axis-label pp-unit', { x: m.left, y: m.top - 7 });
  unidad.textContent = g.opciones.unidad();
  plot.append(unidad);
  // Eje de meses.
  for (const tick of g.opciones.ticksX(puntos, chico)) {
    const rotulo = svgEl('text', 'axis-label', { x: g.x[tick.i], y: H - 7, 'text-anchor': tick.anclaje });
    rotulo.textContent = tick.texto;
    plot.append(rotulo);
  }
  // Áreas apiladas, en el orden de las series.
  for (let k = 0; k < g.opciones.series.length; k++) {
    const arriba = acum[k];
    const abajo = k ? acum[k - 1] : new Array(n).fill(0);
    const d = [];
    for (let i = 0; i < n; i++) d.push(`${i ? 'L' : 'M'}${g.x[i].toFixed(1)},${y(arriba[i]).toFixed(1)}`);
    for (let i = n - 1; i >= 0; i--) d.push(`L${g.x[i].toFixed(1)},${y(abajo[i]).toFixed(1)}`);
    plot.append(svgEl('path', `pp-area ${g.opciones.series[k].clase}`, { d: d.join('') + 'Z' }));
  }
  // Cruz de lectura.
  const cruz = svgEl('g', 'pp-cruz');
  cruz.setAttribute('hidden', '');
  g.guia = svgEl('line', 'pp-guia', { y1: m.top, y2: m.top + ph });
  cruz.append(g.guia);
  g.marcas = g.opciones.series.map((s) => {
    const marca = svgEl('circle', `pp-punto ${s.clase}`, { r: 4 });
    marca.classList.add('pp-oculto');
    cruz.append(marca);
    return marca;
  });
  g.cruz = cruz;
  g.svg.replaceChildren(plot, cruz);
  if (g.indice != null && g.indice < n) cruzar(g, g.indice, false);
}

function cruzar(g, i, conTip = true) {
  if (!g.puntos || !g.puntos.length) return;
  const n = g.puntos.length;
  i = Math.max(0, Math.min(n - 1, i));
  g.indice = i;
  activo = g;
  g.cruz.removeAttribute('hidden');
  const cx = g.x[i];
  g.guia.setAttribute('x1', cx);
  g.guia.setAttribute('x2', cx);
  g.acum.forEach((capa, k) => {
    const marca = g.marcas[k];
    marca.setAttribute('cx', cx);
    marca.setAttribute('cy', g.yPx(capa[i]));
    marca.classList.toggle('pp-oculto', num2(g.puntos[i][g.opciones.series[k].clave]) <= 0);
  });
  const p = g.puntos[i];
  const titulo = g.opciones.titulo(p);
  const filas = g.opciones.series.map((s) => ({
    clase: s.clase, etiqueta: ctx.t(s.texto), valor: ctx.num(num2(p[s.clave])),
  }));
  g.live.textContent = `${titulo}. ${filas.map((f) => `${f.etiqueta} ${f.valor}`).join(', ')}.`;
  if (conTip) {
    const r = g.svg.getBoundingClientRect();
    ctx.tip.detalle({ clientX: r.left + cx, clientY: r.top + g.m.top + 46 }, titulo, filas);
  }
}
function ocultar(g) {
  g.indice = null;
  if (g.cruz) g.cruz.setAttribute('hidden', '');
  g.live.textContent = '';
  if (activo === g) {
    activo = null;
    ctx.tip.ocultar();
  }
}

// --- Interacción: ratón, toque y teclado ---------------------------------------------
function indiceDesde(g, ev) {
  const r = g.svg.getBoundingClientRect();
  const px = ev.clientX - r.left;
  let mejor = 0;
  let dist = Infinity;
  g.x.forEach((xi, i) => { const d = Math.abs(xi - px); if (d < dist) { dist = d; mejor = i; } });
  cruzar(g, mejor);
}
function conectar(g) {
  const svg = g.svg;
  svg.addEventListener('pointerdown', (ev) => {
    if (!g.puntos) return;
    g.modo = ev.pointerType === 'mouse' ? 'raton' : 'toque';
    indiceDesde(g, ev);
    if (ev.pointerType !== 'mouse') {
      try { svg.setPointerCapture(ev.pointerId); } catch { /* sin captura */ }
    }
  });
  svg.addEventListener('pointermove', (ev) => {
    if (!g.puntos) return;
    if (ev.pointerType === 'mouse') { g.modo = 'raton'; indiceDesde(g, ev); }
    else if (g.modo === 'toque') indiceDesde(g, ev);
  });
  svg.addEventListener('pointerleave', (ev) => {
    if (g.puntos && ev.pointerType === 'mouse' && g.modo !== 'teclado') ocultar(g);
  });
  svg.addEventListener('focus', () => {
    if (!g.puntos) return;
    g.modo = 'teclado';
    cruzar(g, g.indice == null ? g.puntos.length - 1 : g.indice);
  });
  svg.addEventListener('blur', () => {
    if (g.modo === 'teclado') { g.modo = null; ocultar(g); }
  });
  svg.addEventListener('keydown', (ev) => {
    if (!g.puntos) return;
    const n = g.puntos.length;
    let i = g.indice == null ? n - 1 : g.indice;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') i = Math.min(n - 1, i + 1);
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') i = Math.max(0, i - 1);
    else if (ev.key === 'Home') i = 0;
    else if (ev.key === 'End') i = n - 1;
    else return;
    ev.preventDefault();
    g.modo = 'teclado';
    cruzar(g, i);
  });
  document.addEventListener('pointerdown', (ev) => {
    if (g.puntos && activo === g && !svg.contains(ev.target) && g.modo !== 'teclado') ocultar(g);
  });
}

// --- V2 · Pulso semanal ---------------------------------------------------------------
function pintarPulso(puntos) {
  pulso.puntos = puntos;
  pulso.indice = null;
  ctx.tip.ocultar();
  if (!puntos) {
    pulso.live.textContent = '';
    UI.bodyP.hidden = true;
    UI.emptyP.hidden = false;
    return;
  }
  UI.emptyP.hidden = true;
  UI.bodyP.hidden = false;
  pintarStats(puntos);
  dibujar(pulso);
  pintarLeyenda(UI.legendP, REPOS);
  pintarTablaPulso(puntos);
  observar(UI.cardP);
}

/** Tres cifras calculadas en cliente: semanas activas, media semanal y récord. */
function pintarStats(puntos) {
  const activas = puntos.filter((p) => totalDe(p, REPOS) > 0).length;
  const total = puntos.reduce((s, p) => s + totalDe(p, REPOS), 0);
  let rec = puntos[0];
  for (const p of puntos) if (totalDe(p, REPOS) > totalDe(rec, REPOS)) rec = p;
  const cifras = [
    {
      v: ctx.num(activas),
      n: ctx.t('pulse.stat.weeks'),
      s: ctx.t('pulse.stat.weeks.sub', { n: ctx.num(puntos.length) }),
    },
    {
      v: ctx.num(Math.round(total / puntos.length)),
      n: ctx.t('pulse.stat.avg'),
      s: ctx.t('pulse.stat.avg.sub', { inicio: ctx.inicio }),
    },
    {
      v: ctx.num(totalDe(rec, REPOS)),
      n: ctx.t('pulse.stat.rec'),
      s: ctx.t('pulse.stat.rec.sub', { fecha: ctx.fecha(rec.fecha) }),
    },
  ];
  UI.stats.replaceChildren(...cifras.map((c) => {
    const caja = nodo('div', 'pp-stat');
    caja.append(
      nodo('b', null, c.v),
      nodo('span', 'pp-nom', c.n),
      nodo('span', 'pp-sub', c.s),
    );
    return caja;
  }));
}

function pintarLeyenda(host, series, valorFinal) {
  host.replaceChildren();
  for (const s of series) {
    const li = nodo('li');
    li.append(nodo('i', `dot ${s.clase}`), nodo('span', null, ctx.t(s.texto)));
    if (valorFinal) {
      li.append(nodo('b', null, ctx.num(valorFinal(s))), nodo('span', null, ctx.t('lines')));
    }
    host.append(li);
  }
}

/** Desglose por mes y repositorio: otra dimensión que el gráfico semanal. */
function pintarTablaPulso(puntos) {
  const meses = [];
  const porMes = new Map();
  for (const p of puntos) {
    const m = p.fecha.slice(0, 7);
    if (!porMes.has(m)) {
      const fila = {};
      for (const s of REPOS) fila[s.clave] = 0;
      porMes.set(m, fila);
      meses.push(m);
    }
    const fila = porMes.get(m);
    for (const s of REPOS) fila[s.clave] += p[s.clave];
  }
  const tabla = nodo('table');
  const cap = nodo('caption', 'sr-only', ctx.t('pulse.table.caption'));
  tabla.append(cap);
  const thead = nodo('thead');
  const trh = nodo('tr');
  const thMes = nodo('th', null, ctx.t('pulse.table.month'));
  thMes.setAttribute('scope', 'col');
  trh.append(thMes);
  for (const s of REPOS) {
    const th = nodo('th', 'num', ctx.t(s.texto));
    th.setAttribute('scope', 'col');
    trh.append(th);
  }
  const thTot = nodo('th', 'num', ctx.t('pulse.table.total'));
  thTot.setAttribute('scope', 'col');
  trh.append(thTot);
  thead.append(trh);
  tabla.append(thead);
  const tbody = nodo('tbody');
  const totales = {};
  for (const s of REPOS) totales[s.clave] = 0;
  for (const m of meses) {
    const fila = porMes.get(m);
    const tr = nodo('tr');
    const th = nodo('th', null, `${ctx.mesCorto(m)} ${ctx.anio(m)}`);
    th.setAttribute('scope', 'row');
    tr.append(th);
    let tot = 0;
    for (const s of REPOS) {
      tot += fila[s.clave];
      totales[s.clave] += fila[s.clave];
      tr.append(celdaNum(ctx.num(fila[s.clave]), ctx.t(s.texto)));
    }
    tr.append(celdaNum(ctx.num(tot), ctx.t('pulse.table.total')));
    tbody.append(tr);
  }
  const trF = nodo('tr', 'total');
  const thF = nodo('th', null, ctx.t('pulse.table.total'));
  thF.setAttribute('scope', 'row');
  trF.append(thF);
  let gran = 0;
  for (const s of REPOS) {
    gran += totales[s.clave];
    trF.append(celdaNum(ctx.num(totales[s.clave]), ctx.t(s.texto)));
  }
  trF.append(celdaNum(ctx.num(gran), ctx.t('pulse.table.total')));
  tbody.append(trF);
  tabla.append(tbody);
  UI.table.replaceChildren(tabla);
}

/** Celda numérica con la etiqueta de su columna (se usa al apilar en móvil). */
function celdaNum(texto, columna) {
  const td = nodo('td', 'num', texto);
  td.dataset.col = columna;
  return td;
}

// --- V3 · Cómo ha crecido --------------------------------------------------------------
function pintarCrecimiento(puntos) {
  crec.puntos = puntos;
  crec.indice = null;
  ctx.tip.ocultar();
  if (!puntos) {
    crec.live.textContent = '';
    UI.bodyC.hidden = true;
    UI.emptyC.hidden = false;
    return;
  }
  UI.emptyC.hidden = true;
  UI.bodyC.hidden = false;
  const fin = puntos[puntos.length - 1];
  dibujar(crec);
  pintarLeyenda(UI.legendC, APPS, (s) => fin[s.clave]);
  pintarCasos(puntos);
  observar(UI.cardC);
}

/** Casos de prueba aparte, sin doble eje: cifra «de X a Y» y minigráfica. */
function pintarCasos(puntos) {
  UI.cases.replaceChildren();
  const casos = puntos.map((p) => p.casos);
  UI.mini.valores = casos.some((c) => c > 0) ? casos : null;
  if (!UI.mini.valores) return;
  const ini = puntos[0];
  const fin = puntos[puntos.length - 1];
  UI.mini.svg.setAttribute('aria-label', ctx.t('growth.cases.aria', {
    a: ctx.num(ini.casos), b: ctx.num(fin.casos),
    ini: ctx.mes(ini.fecha, true), fin: ctx.mes(fin.fecha, true),
  }));
  const bloque = nodo('div', 'cases-fig');
  bloque.append(
    nodo('p', 'cases-t', ctx.t('growth.cases.t')),
    nodo('p', 'cases-v', ctx.t('growth.cases.range', { a: ctx.num(ini.casos), b: ctx.num(fin.casos) })),
    nodo('p', 'cases-sub', ctx.t('growth.cases.sub', { ini: ctx.mes(ini.fecha, true), fin: ctx.mes(fin.fecha, true) })),
  );
  UI.cases.append(bloque, UI.mini.host);
  dibujarMini(UI.mini);
}

function crearMini(host) {
  const svg = svgEl('svg', 'pp-svg');
  svg.setAttribute('role', 'img');
  host.append(svg);
  const m = { host, svg, valores: null, W: 0 };
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      if (!m.valores) return;
      const w = host.clientWidth;
      if (m.W && Math.abs(w - m.W) < 1) return;
      dibujarMini(m);
    }).observe(host);
  }
  return m;
}
function dibujarMini(m) {
  const valores = m.valores;
  if (!valores || valores.length < 2) { m.svg.replaceChildren(); return; }
  const W = Math.max(120, m.host.clientWidth || 200);
  const H = 54;
  const n = valores.length;
  const max = Math.max(...valores, 1);
  const base = H - 3;
  const gx = (i) => 4 + (i / (n - 1)) * (W - 8);
  const gy = (v) => base - 5 - (v / max) * (H - 16);
  m.W = W;
  m.svg.setAttribute('width', W);
  m.svg.setAttribute('height', H);
  const plot = svgEl('g', 'pplot');
  const d = [`M${gx(0).toFixed(1)},${base}`];
  for (let i = 0; i < n; i++) d.push(`L${gx(i).toFixed(1)},${gy(valores[i]).toFixed(1)}`);
  d.push(`L${gx(n - 1).toFixed(1)},${base}Z`);
  plot.append(svgEl('path', 'pp-area s-tests', { d: d.join('') }));
  plot.append(svgEl('circle', 'pp-punto s-tests', { cx: gx(n - 1), cy: gy(valores[n - 1]), r: 3.5 }));
  m.svg.replaceChildren(plot);
}

// --- Animación de entrada --------------------------------------------------------------
function observar(card) {
  if (card.dataset.reveal) return;
  card.dataset.reveal = '1';
  if (reducido() || !('IntersectionObserver' in window)) {
    card.classList.add('ya');
    return;
  }
  card.classList.add('pre');
  const io = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (e.isIntersecting) {
        card.classList.add('ya');
        io.disconnect();
        return;
      }
    }
  }, { threshold: 0.2 });
  io.observe(card);
}
