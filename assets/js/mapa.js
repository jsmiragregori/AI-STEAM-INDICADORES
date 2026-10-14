// Mapa del código: una barra horizontal por aplicación, proporcional a su código
// y partida en tramos (sus funciones), con el color de la aplicación en tonos.
// Cada fila se despliega para ver el detalle de sus funciones con barras propias.
// Selector líneas / ficheros. Sin dependencias.
// Todo el texto se inserta con textContent: ninguna cadena se interpreta como HTML.

const APLICACIONES = [
  ['site', 'comp.site'],
  ['panel', 'comp.panel'],
  ['publicacion', 'comp.publicacion'],
  ['herramientas', 'comp.herramientas'],
  ['tests', 'comp.tests'],
];
const TONOS = 7; // clases n1…n7: del color pleno de la aplicación a su tono más claro
const LENGUAJES = { Python: 'py', JavaScript: 'js', CSS: 'css', HTML: 'html' };

let UI = null;
let ctx = null;      // { t, num, tip } del panel
let modelo = null;   // datos normalizados del mapa
let filas = [];      // una entrada por aplicación con sus elementos
let metrica = 'lineas';
const abiertas = new Set();

const el = (etiqueta, clase, texto) => {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
};
const numero = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const porcentaje = (v, total) => (total > 0 ? (100 * v) / total : 0);

// --- Inicialización ---------------------------------------------------------------
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
  UI.metricas.setAttribute('aria-label', ctx.t('map.metrics.aria'));
  UI.lista.setAttribute('aria-label', ctx.t('chart.code.title'));
  for (const b of UI.botones) b.setAttribute('aria-pressed', String(b.dataset.metric === metrica));
  construir();
  actualizar();
  pintarLenguajes();
  pintarDocs();
  UI.meta.hidden = UI.langs.hidden && UI.docs.hidden;
  pintarTabla();
}

function iniciar() {
  if (UI) return true;
  const buscar = (id) => document.getElementById(id);
  const card = buscar('card-code');
  if (!card) return false;
  UI = {
    card,
    cuerpo: buscar('map-body'),
    total: buscar('map-total'),
    lista: buscar('map-code'),
    live: buscar('map-live'),
    vacio: buscar('map-empty'),
    metricas: buscar('map-metric'),
    botones: Array.from(document.querySelectorAll('#map-metric [data-metric]')),
    meta: buscar('map-meta'),
    langs: buscar('map-langs'),
    langbar: buscar('langbar'),
    legendaLangs: buscar('langbar-legend'),
    docs: buscar('docs-chip'),
    tabla: buscar('map-table-box'),
  };
  if (!UI.lista) return false;
  for (const b of UI.botones) b.addEventListener('click', () => cambiarMetrica(b.dataset.metric));
  UI.lista.addEventListener('mousemove', (ev) => {
    const seg = ev.target.closest('[data-tip]');
    if (!seg) { ctx.tip.ocultar(); return; }
    ctx.tip.mostrar(ev, seg.dataset.tip, seg.dataset.tipValor);
  });
  UI.lista.addEventListener('mouseleave', () => ctx && ctx.tip.ocultar());
  // Las barras crecen la primera vez que la lista entra en pantalla.
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reducido && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) { UI.lista.classList.add('ver'); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(UI.lista);
  } else {
    UI.lista.classList.add('ver');
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
    if (funciones.length) apps.push({ clave, claveTexto, lineas, ficheros, funciones });
  }
  if (!apps.length) return null;
  const totales = {
    lineas: apps.reduce((s, a) => s + a.lineas, 0),
    ficheros: apps.reduce((s, a) => s + a.ficheros, 0),
  };
  const codigo = json.codigo;
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
const etiquetaApp = (app) => ctx.t(app.claveTexto);
function etiquetaFn(claveApp, claveFn) {
  const clave = `fn.${claveApp}.${claveFn}`;
  const texto = ctx.t(clave);
  return texto === clave ? claveFn : texto;
}
const pluralFicheros = (n) => (n === 1 ? ctx.t('file.one') : ctx.t('files'));
const unidad = (valor) => (metrica === 'lineas' ? ctx.t('lines') : pluralFicheros(valor));
/** Porcentaje con un decimal; si algo positivo redondea a 0,0, se dice «< 0,1 %». */
function pctTexto(p) {
  if (p > 0 && p < 0.05) return ctx.t('map.pctLess');
  return ctx.t('map.pctFmt', { p: ctx.num(p, 1) });
}
const ordenadas = (app) => [...app.funciones].sort((a, b) => b[metrica] - a[metrica]);

// --- Construcción -------------------------------------------------------------------
function construir() {
  UI.lista.replaceChildren();
  filas = modelo.apps.map((app) => {
    const li = el('li', `cm-app app-${app.clave}`);
    const idFns = `cm-fns-${app.clave}`;
    const boton = el('button', 'cm-row');
    boton.type = 'button';
    boton.setAttribute('aria-controls', idFns);
    const cab = el('span', 'cm-cab');
    const punto = el('span', 'cm-dot');
    punto.setAttribute('aria-hidden', 'true');
    const nombre = el('span', 'cm-name');
    const pista = el('span', 'cm-hint');
    const textos = el('span', 'cm-textos');
    textos.append(nombre, pista);
    const valor = el('b', 'cm-val');
    const uni = el('span', 'cm-uni');
    const pct = el('span', 'cm-pct');
    const figs = el('span', 'cm-figs');
    figs.append(valor, uni, pct);
    cab.append(punto, textos, figs);
    const pista2 = el('span', 'cm-chev');
    pista2.setAttribute('aria-hidden', 'true');
    cab.append(pista2);
    const pista3 = el('span', 'cm-track');
    pista3.setAttribute('aria-hidden', 'true');
    const relleno = el('span', 'cm-fill');
    pista3.append(relleno);
    boton.append(cab, pista3);

    const panel = el('div', 'cm-fns');
    panel.id = idFns;
    const lista = el('ul', 'cm-fn-list');
    panel.append(lista);
    panel.hidden = !abiertas.has(app.clave);
    boton.setAttribute('aria-expanded', String(abiertas.has(app.clave)));
    li.classList.toggle('abierta', abiertas.has(app.clave));
    boton.addEventListener('click', () => alternar(app.clave));

    li.append(boton, panel);
    UI.lista.append(li);
    return { app, li, boton, nombre, pista, valor, uni, pct, relleno, panel, lista };
  });
}

function actualizar() {
  const total = modelo.totales[metrica];
  const maximo = Math.max(...modelo.apps.map((a) => a[metrica]), 1);
  UI.total.replaceChildren(
    el('b', 'cm-total-num', ctx.num(total)),
    el('span', null, ctx.t('map.total', { unidad: unidad(total), n: ctx.num(modelo.apps.length) })),
  );
  // Las aplicaciones se ordenan de mayor a menor con la métrica elegida.
  const orden = [...filas].sort((a, b) => b.app[metrica] - a.app[metrica]);
  for (const f of orden) UI.lista.append(f.li);
  for (const f of filas) {
    const app = f.app;
    const v = app[metrica];
    const n = app.funciones.length;
    f.nombre.textContent = etiquetaApp(app);
    f.pista.textContent = ctx.t(n === 1 ? 'map.fnCount.one' : 'map.fnCount', { n: ctx.num(n) });
    f.valor.textContent = ctx.num(v);
    f.uni.textContent = unidad(v);
    f.pct.textContent = pctTexto(porcentaje(v, total));
    f.boton.setAttribute('aria-label', ctx.t('map.aria.app', {
      app: etiquetaApp(app), v: ctx.num(v), unidad: unidad(v),
      pct: pctTexto(porcentaje(v, total)), n: ctx.num(n),
    }));
    f.relleno.style.setProperty('--w', `${porcentaje(v, maximo)}%`);
    f.relleno.replaceChildren();
    const fns = ordenadas(app);
    fns.forEach((fn, i) => {
      if (!fn[metrica]) return;
      const seg = el('span', `cm-seg n${Math.min(i + 1, TONOS)}`);
      seg.style.flexGrow = String(fn[metrica]);
      seg.dataset.tip = `${etiquetaApp(app)} · ${etiquetaFn(app.clave, fn.clave)}`;
      seg.dataset.tipValor = `${ctx.num(fn[metrica])} ${unidad(fn[metrica])} · ${pctTexto(porcentaje(fn[metrica], v))} ${ctx.t('map.ofApp')}`;
      f.relleno.append(seg);
    });
    pintarFunciones(f, fns);
  }
}

function pintarFunciones(f, fns) {
  const app = f.app;
  const maximo = Math.max(...fns.map((fn) => fn[metrica]), 1);
  f.lista.replaceChildren();
  fns.forEach((fn, i) => {
    const v = fn[metrica];
    const li = el('li', 'cm-fn');
    const nombre = el('span', 'cm-fn-name', etiquetaFn(app.clave, fn.clave));
    const pista = el('span', 'cm-fn-track');
    pista.setAttribute('aria-hidden', 'true');
    const barra = el('span', `cm-fn-bar n${Math.min(i + 1, TONOS)}`);
    barra.style.width = `${porcentaje(v, maximo)}%`;
    pista.append(barra);
    const cifras = el('span', 'cm-fn-figs');
    cifras.append(el('b', null, ctx.num(v)), document.createTextNode(` ${unidad(v)} · ${pctTexto(porcentaje(v, app[metrica]))}`));
    li.append(nombre, pista, cifras);
    if (fn.casos != null) li.append(el('span', 'cm-fn-casos', ctx.t('map.cases', { n: ctx.num(fn.casos) })));
    f.lista.append(li);
  });
}

// --- Interacción --------------------------------------------------------------------
function alternar(clave) {
  const f = filas.find((x) => x.app.clave === clave);
  if (!f) return;
  const abrir = !abiertas.has(clave);
  if (abrir) abiertas.add(clave); else abiertas.delete(clave);
  f.panel.hidden = !abrir;
  f.li.classList.toggle('abierta', abrir);
  f.boton.setAttribute('aria-expanded', String(abrir));
  UI.live.textContent = ctx.t(abrir ? 'map.live.open' : 'map.live.close', { app: etiquetaApp(f.app) });
}
function cambiarMetrica(nueva) {
  if (!modelo || !['lineas', 'ficheros'].includes(nueva) || nueva === metrica) return;
  metrica = nueva;
  for (const b of UI.botones) b.setAttribute('aria-pressed', String(b.dataset.metric === metrica));
  actualizar();
}

// --- Piezas estáticas de la tarjeta (lenguajes, documentación, tabla) --------------
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
  for (const [clave, clase] of [['map.table.appfn', null], ['map.table.files', 'num'], ['map.table.lines', 'num'], ['map.table.pct', 'num']]) {
    const th = el('th', clase, ctx.t(clave));
    th.setAttribute('scope', 'col');
    trh.append(th);
  }
  thead.append(trh);
  const tbody = el('tbody');
  const totalLineas = modelo.totales.lineas || 1;
  const fila = (clase, etiqueta, ficheros, lineas) => {
    const tr = el('tr', clase);
    const th = el('th', null, etiqueta);
    th.setAttribute('scope', 'row');
    tr.append(th, el('td', 'num', ctx.num(ficheros)), el('td', 'num', ctx.num(lineas)),
      el('td', 'num', pctTexto(porcentaje(lineas, totalLineas))));
    return tr;
  };
  for (const app of modelo.apps) {
    tbody.append(fila('aplicacion', etiquetaApp(app), app.ficheros, app.lineas));
    for (const fn of app.funciones) {
      tbody.append(fila('funcion', etiquetaFn(app.clave, fn.clave), fn.ficheros, fn.lineas));
    }
  }
  tbody.append(fila('total', ctx.t('map.table.total'), modelo.totales.ficheros, modelo.totales.lineas));
  tabla.append(thead, tbody);
  UI.tabla.append(tabla);
}
