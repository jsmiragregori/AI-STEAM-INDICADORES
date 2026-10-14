// Mapa del código (V1): treemap interactivo de dos niveles, sin dependencias.
// Nivel 1: aplicaciones (cada una con su color categórico). Nivel 2: funciones,
// en tonos del color de su aplicación. Clic, Enter o Espacio amplía una
// aplicación (Esc o las migas vuelven). Selector líneas / ficheros.
// Todo el texto se inserta con textContent: ninguna cadena se interpreta como HTML.

const APLICACIONES = [
  ['site', 'comp.site'],
  ['panel', 'comp.panel'],
  ['publicacion', 'comp.publicacion'],
  ['herramientas', 'comp.herramientas'],
  ['tests', 'comp.tests'],
];
const TONOS = [50, 40, 32, 26, 20, 15, 11]; // % del color de la aplicación en cada tono
const ALTO_CABECERA = 30; // altura de la franja con el nombre de la aplicación (px)
const MARCO = 4;          // marco de color alrededor de las funciones (px)
const HUECO = 3;          // separación entre bloques y entre funciones (px)
const DURACION = 420;     // duración de las animaciones (coincide con --map-dur)
const LENGUAJES = { Python: 'py', JavaScript: 'js', CSS: 'css', HTML: 'html' };

let UI = null;
let ctx = null;      // { t, num, tip } del panel
let modelo = null;   // datos normalizados del mapa
let piezas = [];     // bloques, cabeceras y funciones ya creados
let estado = { nivel: 'todo', app: null, metrica: 'lineas' };
let ajusteId = 0;
let ultimoTam = { w: 0, h: 0 };
const porElemento = new Map();

const reducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const el = (etiqueta, clase, texto) => {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
};
const numero = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const porcentaje = (v, total) => (total > 0 ? (100 * v) / total : 0);
const valorDe = (obj, metrica) => numero(obj[metrica]);
const inset = (r, d) => ({
  x: r.x + d, y: r.y + d,
  w: Math.max(0, r.w - 2 * d), h: Math.max(0, r.h - 2 * d),
});

// --- Reparto de áreas (squarified) -----------------------------------------------
// Entradas: [{ id, valor }] con valor >= 0. Devuelve Map id → { x, y, w, h }.
function squarify(entradas, x, y, w, h) {
  const salida = new Map();
  const items = entradas.filter((e) => e.valor > 0).sort((a, b) => b.valor - a.valor);
  if (!items.length || w <= 0 || h <= 0) return salida;
  if (items.length === 1) { salida.set(items[0].id, { x, y, w, h }); return salida; }
  const total = items.reduce((s, e) => s + e.valor, 0);
  const escala = (w * h) / total;
  for (const it of items) it.area = it.valor * escala;
  let cx = x, cy = y, cw = w, ch = h, inicio = 0;
  while (inicio < items.length) {
    const horizontal = cw >= ch;
    const lado = horizontal ? ch : cw;
    let fin = inicio + 1;
    let area = items[inicio].area;
    let mejor = peorRatio(items, inicio, fin, lado, area);
    while (fin < items.length) {
      const areaNueva = area + items[fin].area;
      const ratio = peorRatio(items, inicio, fin + 1, lado, areaNueva);
      if (ratio <= mejor) { fin += 1; area = areaNueva; mejor = ratio; } else break;
    }
    if (horizontal) {
      const ancho = area / ch;
      let yy = cy;
      for (let i = inicio; i < fin; i++) {
        const alto = items[i].area / ancho;
        salida.set(items[i].id, { x: cx, y: yy, w: ancho, h: alto });
        yy += alto;
      }
      cx += ancho; cw -= ancho;
    } else {
      const alto = area / cw;
      let xx = cx;
      for (let i = inicio; i < fin; i++) {
        const ancho = items[i].area / alto;
        salida.set(items[i].id, { x: xx, y: cy, w: ancho, h: alto });
        xx += ancho;
      }
      cy += alto; ch -= alto;
    }
    inicio = fin;
  }
  return salida;
}
function peorRatio(items, i0, i1, lado, area) {
  let max = 0, min = Infinity;
  for (let i = i0; i < i1; i++) {
    if (items[i].area > max) max = items[i].area;
    if (items[i].area < min) min = items[i].area;
  }
  const a2 = area * area, s2 = lado * lado;
  return Math.max((s2 * max) / a2, a2 / (s2 * min));
}

// --- Inicialización y pintado -----------------------------------------------------
export function pintarMapa(json, contexto) {
  if (!iniciar()) return;
  ctx = contexto;
  modelo = normalizar(json);
  UI.live.textContent = '';
  if (!modelo) {
    UI.cuerpo.hidden = true;
    UI.vacio.hidden = false;
    return;
  }
  UI.vacio.hidden = true;
  UI.cuerpo.hidden = false;
  textosEstaticos();
  construir();
  pintarMigas();
  pintarExtras();
}

function iniciar() {
  if (UI) return true;
  const buscar = (id) => document.getElementById(id);
  const card = buscar('card-code');
  if (!card) return false;
  UI = {
    card,
    cuerpo: buscar('map-body'),
    crumbs: buscar('map-crumbs'),
    esc: buscar('map-esc'),
    mapa: buscar('map-code'),
    live: buscar('map-live'),
    vacio: buscar('map-empty'),
    metricas: buscar('map-metric'),
    botones: Array.from(document.querySelectorAll('#map-metric [data-metric]')),
    meta: buscar('map-meta'),
    langs: buscar('map-langs'),
    langbar: buscar('langbar'),
    legendaLangs: buscar('langbar-legend'),
    docs: buscar('docs-chip'),
    detalles: buscar('map-details'),
    tabla: buscar('map-table-box'),
  };
  if (!UI.mapa || !UI.crumbs) return false;
  for (const b of UI.botones) {
    b.addEventListener('click', () => cambiarMetrica(b.dataset.metric));
  }
  UI.card.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && estado.nivel === 'app') {
      ev.stopPropagation();
      volver();
    }
  });
  UI.mapa.addEventListener('click', (ev) => {
    if (!modelo || estado.nivel !== 'todo') return;
    const nodo = ev.target.closest('[data-app]');
    if (nodo) ampliar(nodo.dataset.app);
  });
  UI.mapa.addEventListener('mousemove', (ev) => {
    const nodo = ev.target.closest('.tm-tile, .tm-head');
    const datos2 = nodo && porElemento.get(nodo);
    if (!datos2) return;
    const { etiqueta, detalle } = tooltipDe(datos2);
    ctx.tip.mostrar(ev, etiqueta, detalle);
  });
  UI.mapa.addEventListener('mouseleave', () => ctx && ctx.tip.ocultar());
  UI.mapa.addEventListener('focusin', (ev) => {
    const nodo = ev.target.closest('.tm-tile, .tm-head');
    const datos2 = nodo && porElemento.get(nodo);
    if (!datos2) return;
    const { etiqueta, detalle } = tooltipDe(datos2);
    ctx.tip.mostrarEn(nodo, etiqueta, detalle);
  });
  UI.mapa.addEventListener('focusout', () => ctx && ctx.tip.ocultar());
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      if (!modelo) return;
      const w = UI.mapa.clientWidth, h = UI.mapa.clientHeight;
      if (w === ultimoTam.w && h === ultimoTam.h) return;
      calcular();
      programarAjuste(true);
    }).observe(UI.mapa);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (modelo) programarAjuste(false); });
  }
  return true;
}

// --- Datos ------------------------------------------------------------------------
function normalizar(json) {
  const mapa = json && json.codigo && json.codigo.mapa;
  if (!mapa || typeof mapa !== 'object') return null;
  const apps = [];
  for (const [clave, claveTexto] of APLICACIONES) {
    const crudas = Array.isArray(mapa[clave]) ? mapa[clave] : [];
    const funciones = crudas
      .filter((f) => f && typeof f.clave === 'string')
      .map((f) => ({
        clave: f.clave,
        lineas: numero(f.lineas),
        ficheros: numero(f.ficheros),
        casos: numero(f.casos) > 0 ? numero(f.casos) : null,
      }))
      .filter((f) => f.lineas > 0 || f.ficheros > 0);
    const lineas = funciones.reduce((s, f) => s + f.lineas, 0);
    const ficheros = funciones.reduce((s, f) => s + f.ficheros, 0);
    if (funciones.length && (lineas > 0 || ficheros > 0)) {
      apps.push({ clave, etiqueta: ctx.t(claveTexto), lineas, ficheros, funciones });
    }
  }
  if (!apps.length) return null;
  const totales = {
    lineas: apps.reduce((s, a) => s + a.lineas, 0),
    ficheros: apps.reduce((s, a) => s + a.ficheros, 0),
  };
  const codigo = (json && json.codigo) || {};
  const crudosDocs = codigo.componentes && codigo.componentes.docs;
  const docs = crudosDocs && numero(crudosDocs.lineas) > 0
    ? { lineas: numero(crudosDocs.lineas), ficheros: numero(crudosDocs.ficheros) }
    : null;
  const lenguajes = codigo.lenguajes && typeof codigo.lenguajes === 'object'
    ? Object.entries(codigo.lenguajes)
      .map(([clave, valor]) => ({ clave, valor: numero(valor) }))
      .filter((l) => l.valor > 0)
      .sort((a, b) => b.valor - a.valor)
    : [];
  return { apps, totales, docs, lenguajes };
}

// --- Textos de ayuda --------------------------------------------------------------
function etiquetaApp(clave) {
  const par = APLICACIONES.find(([c]) => c === clave);
  const etiqueta = par ? ctx.t(par[1]) : clave;
  return etiqueta === par?.[1] ? clave : etiqueta;
}
function etiquetaFn(claveApp, claveFn) {
  const clave = `fn.${claveApp}.${claveFn}`;
  const texto = ctx.t(clave);
  return texto === clave ? claveFn : texto;
}
function pluralFicheros(n) { return n === 1 ? ctx.t('file.one') : ctx.t('files'); }
function pctTexto(p) { return ctx.t('map.pctFmt', { p: ctx.num(p, 1) }); }
function unidadDe(metrica, valor) {
  return metrica === 'lineas' ? ctx.t('lines') : pluralFicheros(valor);
}
/** Detalle completo de una función: valor medido, % (nivel y total) y la otra cara. */
function detalleFn(app, fn) {
  const metrica = estado.metrica;
  const partes = [];
  if (estado.nivel === 'app') {
    partes.push(`${pctTexto(porcentaje(fn[metrica], app[metrica]))} ${ctx.t('map.ofApp')}`);
  }
  partes.push(`${pctTexto(porcentaje(fn[metrica], modelo.totales[metrica]))} ${ctx.t('map.ofTotal')}`);
  const otro = metrica === 'lineas'
    ? `${ctx.num(fn.ficheros)} ${pluralFicheros(fn.ficheros)}`
    : `${ctx.num(fn.lineas)} ${ctx.t('lines')}`;
  let texto = `${ctx.num(fn[metrica])} ${unidadDe(metrica, fn[metrica])} (${partes.join(' · ')}) · ${otro}`;
  if (fn.casos != null) texto += ` · ${ctx.t('map.cases', { n: ctx.num(fn.casos) })}`;
  return texto;
}
function tooltipDe(entrada) {
  if (entrada.tipo === 'app') {
    const app = entrada.pieza.app;
    const valor = valorDe(app, estado.metrica);
    const n = app.funciones.length;
    const detalle = `${ctx.num(valor)} ${unidadDe(estado.metrica, valor)} (${pctTexto(porcentaje(valor, modelo.totales[estado.metrica]))} ${ctx.t('map.ofTotal')}) · ${ctx.t(n === 1 ? 'map.fnCount.one' : 'map.fnCount', { n: ctx.num(n) })}`;
    return { etiqueta: app.etiqueta, detalle };
  }
  const f = entrada.pieza;
  return {
    etiqueta: `${entrada.app.etiqueta} · ${etiquetaFn(entrada.app.clave, f.fn.clave)}`,
    detalle: detalleFn(entrada.app, f.fn),
  };
}

// --- Construcción del DOM ----------------------------------------------------------
function construir() {
  porElemento.clear();
  piezas = [];
  UI.mapa.replaceChildren();
  for (const app of modelo.apps) {
    const pt = crearPieza(app);
    piezas.push(pt);
    UI.mapa.append(pt.bloque, pt.cabeza);
    for (const f of pt.funciones) UI.mapa.append(f.el);
  }
  for (const pt of piezas) actualizarPieza(pt);
  calcular();
  ajustarTexto();
}

function crearPieza(app) {
  const claseApp = `app-${app.clave}`;
  const bloque = el('div', `tm-app ${claseApp}`);
  bloque.dataset.app = app.clave;
  bloque.setAttribute('aria-hidden', 'true');

  const cabeza = document.createElement('button');
  cabeza.type = 'button';
  cabeza.className = `tm-head ${claseApp}`;
  cabeza.dataset.app = app.clave;
  const nombreCab = el('span', 'tm-name');
  const figsCab = el('span', 'tm-figs');
  const valCab = el('b', 'tm-val');
  const sepCab = el('span', 'tm-sep', '·');
  const pctCab = el('span', 'tm-pct');
  figsCab.append(valCab, sepCab, pctCab);
  cabeza.append(nombreCab, figsCab);

  const pt = {
    app, bloque, cabeza, nombreCab, figsCab, valCab, sepCab, pctCab, funciones: [],
  };
  porElemento.set(bloque, { tipo: 'app', pieza: pt });
  porElemento.set(cabeza, { tipo: 'app', pieza: pt });

  app.funciones.forEach((fn, i) => {
    const tile = el('div', `tm-tile ${claseApp}`);
    tile.dataset.app = app.clave;
    tile.tabIndex = 0;
    tile.classList.add(`n${Math.min(i + 1, TONOS.length)}`);
    const dentro = el('div', 'tm-in');
    const nombre = el('span', 'tm-name');
    const figs = el('span', 'tm-figs');
    const val = el('b', 'tm-val');
    const sep = el('span', 'tm-sep', '·');
    const pct = el('span', 'tm-pct');
    figs.append(val, sep, pct);
    dentro.append(nombre, figs);
    tile.append(dentro);
    const f = { el: tile, entrada: dentro, nombre, figs, val, sep, pct, fn };
    pt.funciones.push(f);
    porElemento.set(tile, { tipo: 'fn', pieza: f, app });
  });
  return pt;
}

function actualizarPieza(pt) {
  const app = pt.app;
  const valor = valorDe(app, estado.metrica);
  pt.nombreCab.textContent = app.etiqueta;
  pt.valCab.textContent = ctx.num(valor);
  pt.pctCab.textContent = pctTexto(porcentaje(valor, modelo.totales[estado.metrica]));
  const claveAria = app.funciones.length === 1 ? 'map.aria.app.one' : 'map.aria.app';
  pt.cabeza.setAttribute('aria-label', ctx.t(claveAria, {
    app: app.etiqueta,
    valor: `${ctx.num(valor)} ${unidadDe(estado.metrica, valor)}`,
    pct: pctTexto(porcentaje(valor, modelo.totales[estado.metrica])),
    n: ctx.num(app.funciones.length),
  }));
  for (const f of pt.funciones) {
    const v = valorDe(f.fn, estado.metrica);
    const totalNivel = estado.nivel === 'app' ? app[estado.metrica] : modelo.totales[estado.metrica];
    f.nombre.textContent = etiquetaFn(app.clave, f.fn.clave);
    f.val.textContent = ctx.num(v);
    f.pct.textContent = pctTexto(porcentaje(v, totalNivel));
    f.el.setAttribute('aria-label', ctx.t('map.aria.fn', {
      app: app.etiqueta,
      fn: etiquetaFn(app.clave, f.fn.clave),
      detalle: detalleFn(app, f.fn),
    }));
  }
}

// --- Reparto de áreas y estado ------------------------------------------------------
function calcular() {
  const w = UI.mapa.clientWidth, h = UI.mapa.clientHeight;
  if (!w || !h) return;
  ultimoTam = { w, h };
  const todo = estado.nivel === 'todo';
  const rects = squarify(modelo.apps.map((a) => ({ id: a.clave, valor: valorDe(a, estado.metrica) })), 0, 0, w, h);
  for (const pt of piezas) {
    const r = todo ? rects.get(pt.app.clave) : (pt.app.clave === estado.app ? { x: 0, y: 0, w, h } : null);
    const visible = !!r && r.w >= 1 && r.h >= 1;
    marcarOculto(pt, !visible);
    pt.cabeza.disabled = !todo;
    pt.cabeza.setAttribute('aria-expanded', String(!todo && pt.app.clave === estado.app));
    if (!visible) continue;
    const bloque = inset(r, HUECO / 2);
    aplicar(pt.bloque, bloque);
    aplicar(pt.cabeza, {
      x: bloque.x + 6,
      y: bloque.y + 2,
      w: Math.max(0, bloque.w - 12),
      h: Math.max(0, ALTO_CABECERA - 4),
    });
    const zona = {
      x: bloque.x + MARCO,
      y: bloque.y + ALTO_CABECERA,
      w: Math.max(0, bloque.w - MARCO * 2),
      h: Math.max(0, bloque.h - ALTO_CABECERA - MARCO),
    };
    const orden = pt.funciones
      .map((_, i) => i)
      .sort((a, b) => valorDe(pt.app.funciones[b], estado.metrica) - valorDe(pt.app.funciones[a], estado.metrica));
    const tonoDe = new Map(orden.map((i, pos) => [i, Math.min(pos, TONOS.length - 1)]));
    const rectsFn = squarify(
      pt.funciones.map((f, i) => ({ id: i, valor: valorDe(f.fn, estado.metrica) })),
      zona.x, zona.y, zona.w, zona.h,
    );
    pt.funciones.forEach((f, i) => {
      const rf = rectsFn.get(i);
      marcarOcultoTile(f, !rf || rf.w < 1 || rf.h < 1);
      if (!rf || rf.w < 1 || rf.h < 1) { aplicar(f.el, { x: zona.x, y: zona.y, w: 0, h: 0 }); return; }
      const tono = tonoDe.get(i) ?? 0;
      for (let k = 1; k <= TONOS.length; k++) f.el.classList.toggle(`n${k}`, k === tono + 1);
      aplicar(f.el, inset(rf, HUECO / 2));
    });
  }
}
function aplicar(e, r) {
  e.style.left = `${r.x}px`;
  e.style.top = `${r.y}px`;
  e.style.width = `${r.w}px`;
  e.style.height = `${r.h}px`;
}
function marcarOculto(pt, ocultar) {
  pt.bloque.classList.toggle('tm-oculto', ocultar);
  pt.cabeza.classList.toggle('tm-oculto', ocultar);
  for (const f of pt.funciones) marcarOcultoTile(f, ocultar);
}
function marcarOcultoTile(f, ocultar) {
  f.el.classList.toggle('tm-oculto', ocultar);
  f.el.tabIndex = ocultar ? -1 : 0;
}

// --- Ajuste del texto a cada rectángulo ---------------------------------------------
function programarAjuste(animar) {
  clearTimeout(ajusteId);
  const ms = animar && !reducido() ? DURACION + 90 : 40;
  ajusteId = setTimeout(ajustarTexto, ms);
}
function ajustarTexto() {
  if (!modelo) return;
  for (const pt of piezas) {
    if (pt.bloque.classList.contains('tm-oculto')) continue;
    const w = pt.cabeza.clientWidth;
    pt.figsCab.classList.remove('kt-oculto');
    const anchoNombre = pt.nombreCab.scrollWidth;
    const anchoFigs = pt.figsCab.scrollWidth;
    pt.figsCab.classList.toggle('kt-oculto', !w || anchoNombre + anchoFigs + 12 > w);
    for (const f of pt.funciones) {
      if (f.el.classList.contains('tm-oculto')) continue;
      ajustarTile(f);
    }
  }
}
function ajustarTile(f) {
  const w = f.entrada.clientWidth, h = f.entrada.clientHeight;
  if (!w || !h) {
    f.nombre.classList.add('kt-oculto');
    f.figs.classList.add('kt-oculto');
    return;
  }
  f.nombre.classList.remove('kt-oculto');
  f.figs.classList.remove('kt-oculto');
  f.pct.classList.remove('kt-oculto');
  f.sep.classList.remove('kt-oculto');
  const cabeNombre = f.nombre.scrollWidth <= w;
  const cabeVal = f.val.getBoundingClientRect().width <= w;
  const cabeTodo = f.figs.scrollWidth <= w;
  const dosLineas = h >= 36;
  const unaLinea = h >= 16;
  const verFigs = dosLineas && cabeVal;
  const verPct = verFigs && cabeTodo;
  f.figs.classList.toggle('kt-oculto', !verFigs);
  f.pct.classList.toggle('kt-oculto', !verPct);
  f.sep.classList.toggle('kt-oculto', !verPct);
  f.nombre.classList.toggle('kt-oculto', !(cabeNombre && (verFigs || unaLinea)));
}

// --- Zoom, migas y estado -----------------------------------------------------------
function ampliar(clave) {
  if (!modelo || estado.nivel !== 'todo') return;
  if (!modelo.apps.some((a) => a.clave === clave)) return;
  estado.nivel = 'app';
  estado.app = clave;
  UI.mapa.classList.add('zoom');
  pintarMigas();
  for (const pt of piezas) actualizarPieza(pt);
  calcular();
  programarAjuste(true);
  UI.live.textContent = ctx.t('map.live.zoom', { app: etiquetaApp(clave) });
  const atras = UI.crumbs.querySelector('button');
  if (atras) atras.focus();
}
function volver() {
  if (!modelo || estado.nivel === 'todo') return;
  const clave = estado.app;
  estado.nivel = 'todo';
  estado.app = null;
  UI.mapa.classList.remove('zoom');
  pintarMigas();
  for (const pt of piezas) actualizarPieza(pt);
  calcular();
  programarAjuste(true);
  UI.live.textContent = ctx.t('map.live.all');
  const pt = piezas.find((p) => p.app.clave === clave);
  if (pt && !pt.cabeza.disabled) pt.cabeza.focus();
}
function cambiarMetrica(metrica) {
  if (!modelo || !['lineas', 'ficheros'].includes(metrica) || metrica === estado.metrica) return;
  estado.metrica = metrica;
  for (const b of UI.botones) b.setAttribute('aria-pressed', String(b.dataset.metric === metrica));
  for (const pt of piezas) actualizarPieza(pt);
  calcular();
  programarAjuste(true);
}
function pintarMigas() {
  UI.crumbs.replaceChildren();
  if (estado.nivel === 'todo') {
    const actual = el('span', 'crumb-actual', ctx.t('map.todo'));
    actual.setAttribute('aria-current', 'true');
    UI.crumbs.append(actual);
    UI.esc.hidden = true;
  } else {
    const atras = el('button', 'crumb-btn', ctx.t('map.todo'));
    atras.type = 'button';
    atras.addEventListener('click', volver);
    const sep = el('span', 'crumb-sep', '›');
    sep.setAttribute('aria-hidden', 'true');
    const actual = el('span', 'crumb-actual', etiquetaApp(estado.app));
    actual.setAttribute('aria-current', 'true');
    UI.crumbs.append(atras, sep, actual);
    UI.esc.hidden = false;
  }
}

// --- Piezas estáticas de la tarjeta (selector, lenguajes, documentación, tabla) ------
function textosEstaticos() {
  UI.crumbs.setAttribute('aria-label', ctx.t('map.crumbs.aria'));
  UI.metricas.setAttribute('aria-label', ctx.t('map.metrics.aria'));
  UI.mapa.setAttribute('role', 'group');
  UI.mapa.setAttribute('aria-label', ctx.t('chart.code.title'));
  for (const b of UI.botones) b.setAttribute('aria-pressed', String(b.dataset.metric === estado.metrica));
}
function pintarExtras() {
  pintarLenguajes();
  pintarDocs();
  UI.meta.hidden = UI.langs.hidden && UI.docs.hidden;
  pintarTabla();
}
function pintarLenguajes() {
  UI.langbar.replaceChildren();
  UI.legendaLangs.replaceChildren();
  const lenguajes = modelo.lenguajes;
  UI.langs.hidden = !lenguajes.length;
  if (!lenguajes.length) { UI.langbar.removeAttribute('aria-label'); return; }
  const total = lenguajes.reduce((s, l) => s + l.valor, 0);
  const lista = [];
  for (const l of lenguajes) {
    const clase = `lg-${LENGUAJES[l.clave] || 'otro'}`;
    const pct = porcentaje(l.valor, total);
    const seg = el('span', clase);
    seg.style.flex = `${l.valor} 1 0`;
    UI.langbar.append(seg);
    const li = el('li');
    li.append(el('span', `dot ${clase}`), el('span', 'lg-nombre', l.clave),
      el('b', 'lg-valor', ctx.num(l.valor)), el('span', 'lg-resto', `${ctx.t('lines')} · ${pctTexto(pct)}`));
    UI.legendaLangs.append(li);
    lista.push(`${l.clave}: ${ctx.num(l.valor)} ${ctx.t('lines')} (${pctTexto(pct)})`);
  }
  UI.langbar.setAttribute('aria-label', ctx.t('map.langs.aria', { lista: lista.join('; ') }));
}
function pintarDocs() {
  UI.docs.replaceChildren();
  UI.docs.hidden = !modelo.docs;
  if (!modelo.docs) return;
  UI.docs.append(
    el('span', 'docs-titulo', ctx.t('map.docs.title')),
    el('span', 'docs-figura', ctx.num(modelo.docs.lineas)),
    el('span', 'docs-texto', ctx.t('map.docs.lines', { n: ctx.num(modelo.docs.ficheros) })),
    el('span', 'docs-nota', ctx.t('map.docs.note')),
  );
}
function pintarTabla() {
  UI.tabla.replaceChildren();
  const tabla = el('table');
  tabla.append(el('caption', 'sr-only', ctx.t('map.table.caption')));
  const thead = el('thead');
  const trh = el('tr');
  const th0 = el('th', null, ctx.t('map.table.appfn'));
  th0.setAttribute('scope', 'col');
  const th1 = el('th', 'num', ctx.t('map.table.files'));
  th1.setAttribute('scope', 'col');
  const th2 = el('th', 'num', ctx.t('map.table.lines'));
  th2.setAttribute('scope', 'col');
  const th3 = el('th', 'num', ctx.t('map.table.pct'));
  th3.setAttribute('scope', 'col');
  trh.append(th0, th1, th2, th3);
  thead.append(trh);
  const tbody = el('tbody');
  const totalLineas = modelo.totales.lineas || 1;
  const filaResumen = (clase, etiqueta, ficheros, lineas) => {
    const tr = el('tr', clase);
    const th = el('th', null, etiqueta);
    th.setAttribute('scope', 'row');
    tr.append(th, el('td', 'num', ctx.num(ficheros)), el('td', 'num', ctx.num(lineas)),
      el('td', 'num', pctTexto(porcentaje(lineas, totalLineas))));
    return tr;
  };
  for (const app of modelo.apps) {
    tbody.append(filaResumen('aplicacion', app.etiqueta, app.ficheros, app.lineas));
    for (const fn of app.funciones) {
      tbody.append(filaResumen('funcion', etiquetaFn(app.clave, fn.clave), fn.ficheros, fn.lineas));
    }
  }
  tbody.append(filaResumen('total', ctx.t('map.table.total'), modelo.totales.ficheros, modelo.totales.lineas));
  tabla.append(thead, tbody);
  UI.tabla.append(tabla);
}
