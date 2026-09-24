// Panel de indicadores AI-STEAM Network.
// Lee data/indicadores.json (lo genera `npm run indicadores` en el repo de
// gestión) y pinta textos, cifras y gráficos en el idioma elegido.
// Todo se inserta con textContent: ninguna cadena se interpreta como HTML.

import { TEXTOS } from './textos.js';

const IDIOMAS = ['es', 'en'];
const CLAVE_IDIOMA = 'indicadores-idioma';
let datos = null;
let idioma = idiomaInicial();

function idiomaInicial() {
  const url = new URLSearchParams(location.search).get('lang');
  if (IDIOMAS.includes(url)) return url;
  try {
    const guardado = localStorage.getItem(CLAVE_IDIOMA);
    if (IDIOMAS.includes(guardado)) return guardado;
  } catch { /* almacenamiento bloqueado: se usa el del navegador */ }
  return (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
}

const leer = (obj, ruta) => ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const num = (n, dec = 0) => new Intl.NumberFormat(idioma === 'es' ? 'es-ES' : 'en-GB', {
  minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: 'always',
}).format(n);

function fecha(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(idioma === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(a, m - 1, d));
}
function mes(yyyymm, largo = false) {
  const [a, m] = yyyymm.split('-').map(Number);
  return new Intl.DateTimeFormat(idioma === 'es' ? 'es-ES' : 'en-GB', { month: largo ? 'long' : 'short', year: 'numeric' })
    .format(new Date(a, m - 1, 1));
}

function t(clave, vars = {}) {
  const texto = TEXTOS[idioma][clave] ?? TEXTOS.es[clave] ?? clave;
  return texto.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

/** Valores derivados que el panel muestra y el JSON no trae hechos. */
function calculados(d) {
  const c = d.codigo.componentes;
  const codigo = c.site.lineas + c.panel.lineas + c.tooling.lineas;
  return {
    codigo,
    textosTraducidos: d.contenido.cadenasTraducidas * d.contenido.idiomas,
    ratioPruebas: c.tests.lineas / codigo,
  };
}

function variables(d, calc) {
  return {
    fecha: fecha(d.generado),
    langs: num(d.contenido.idiomas),
    total: '',
    panel: num(d.plataforma.seccionesPanel),
    loaders: num(d.plataforma.cargadores),
    libs: num(d.plataforma.bibliotecasAutoalojadas),
    ratio: num(calc.ratioPruebas, 2),
    py: num(d.codigo.lenguajes.Python || 0),
    js: num(d.codigo.lenguajes.JavaScript || 0),
    inicio: mes(d.proceso.inicio, true),
  };
}

// --- Tooltip -------------------------------------------------------------------
const tip = document.getElementById('tooltip');
function mostrarTip(ev, etiqueta, valor) {
  tip.replaceChildren();
  const b = document.createElement('strong');
  b.textContent = valor;
  tip.append(document.createTextNode(etiqueta + ' · '), b);
  const x = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
  tip.style.left = `${x}px`;
  tip.style.top = `${ev.clientY - 40}px`;
  tip.classList.add('on');
}
const ocultarTip = () => tip.classList.remove('on');

// --- Gráficos (HTML, para que se adapten a cualquier ancho) ----------------------
function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
}

function tablaDatos(filas, cabecera) {
  const det = el('details', 'table-view');
  det.append(el('summary', null, t('table.show')));
  const tabla = el('table');
  const thead = el('thead');
  const tr = el('tr');
  tr.append(el('th', null, cabecera), el('th', 'num', t('table.value')));
  thead.append(tr);
  const tbody = el('tbody');
  for (const f of filas) {
    const fila = el('tr');
    fila.append(el('td', null, f.etiqueta), el('td', 'num', num(f.valor)));
    tbody.append(fila);
  }
  tabla.append(thead, tbody);
  det.append(tabla);
  return det;
}

/** Barras horizontales: una fila por elemento, valor rotulado al final. */
function barrasH(contenedor, filas, unidad = '') {
  const max = Math.max(...filas.map(f => f.valor));
  const lista = el('div', 'hbars');
  lista.setAttribute('role', 'list');
  for (const f of filas) {
    const fila = el('div', 'hbar-row');
    fila.setAttribute('role', 'listitem');
    const valorTexto = num(f.valor) + (unidad ? ` ${unidad}` : '');
    fila.setAttribute('aria-label', `${f.etiqueta}: ${valorTexto}`);
    const pista = el('div', 'hbar-track');
    const barra = el('div', `hbar${f.otro ? ' other' : ''}`);
    barra.style.width = `${Math.max(0.6, (f.valor / max) * 100)}%`;
    pista.append(barra);
    fila.append(el('span', 'hbar-label', f.etiqueta), pista, el('span', 'hbar-value', valorTexto));
    fila.addEventListener('mousemove', ev => mostrarTip(ev, f.etiqueta, valorTexto));
    fila.addEventListener('mouseleave', ocultarTip);
    lista.append(fila);
  }
  contenedor.replaceChildren(lista, tablaDatos(filas, t('table.item')));
}

/** Columnas verticales para una serie temporal corta. */
function columnas(contenedor, filas) {
  const max = Math.max(...filas.map(f => f.valor));
  const zona = el('div', 'cols');
  zona.setAttribute('role', 'list');
  for (const f of filas) {
    const col = el('div', 'col');
    col.setAttribute('role', 'listitem');
    col.setAttribute('aria-label', `${f.etiqueta}: ${num(f.valor)}`);
    const pista = el('div', 'col-track');
    const barra = el('div', 'col-bar');
    barra.style.height = `${Math.max(1, (f.valor / max) * 100)}%`;
    const valor = el('span', 'col-value', num(f.valor));
    pista.append(valor, barra);
    col.append(pista, el('span', 'col-label', f.etiqueta));
    col.addEventListener('mousemove', ev => mostrarTip(ev, f.largo, num(f.valor)));
    col.addEventListener('mouseleave', ocultarTip);
    zona.append(col);
  }
  contenedor.replaceChildren(zona, tablaDatos(filas.map(f => ({ ...f, etiqueta: f.largo })), t('table.month')));
}

// --- Pintado -----------------------------------------------------------------------
function pintar() {
  document.documentElement.lang = idioma;
  document.title = t('meta.title');
  for (const b of document.querySelectorAll('[data-lang]')) {
    b.setAttribute('aria-pressed', String(b.dataset.lang === idioma));
  }
  if (!datos) {
    for (const e of document.querySelectorAll('[data-t]')) e.textContent = t(e.dataset.t);
    return;
  }

  const calc = calculados(datos);
  const vars = variables(datos, calc);
  const porClave = {
    'chart.act.sub': { total: num(datos.proceso.commits) },
    'b.strings.p': { total: num(calc.textosTraducidos) },
  };
  for (const e of document.querySelectorAll('[data-t]')) {
    e.textContent = t(e.dataset.t, { ...vars, ...(porClave[e.dataset.t] || {}) });
  }
  for (const e of document.querySelectorAll('[data-n]')) {
    const ruta = e.dataset.n;
    const valor = ruta.startsWith('calc.') ? calc[ruta.slice(5)] : leer(datos, ruta);
    e.textContent = typeof valor === 'number' ? num(valor) : '–';
  }

  const c = datos.codigo.componentes;
  const orden = [['site', false], ['panel', false], ['tooling', false], ['tests', false],
    ['docs', true]];
  barrasH(document.getElementById('chart-code'),
    orden.filter(([k]) => c[k]).map(([k, otro]) => ({ etiqueta: t(`comp.${k}`), valor: c[k].lineas, otro })),
    t('lines'));

  columnas(document.getElementById('chart-act'), datos.proceso.actividad.map(a => ({
    etiqueta: mes(a.mes),
    largo: mes(a.mes, true),
    valor: (a.content || 0) + (a.vanilla || 0) + (a.diagrams || 0),
  })));
}

function cambiarIdioma(nuevo) {
  if (!IDIOMAS.includes(nuevo) || nuevo === idioma) return;
  idioma = nuevo;
  try { localStorage.setItem(CLAVE_IDIOMA, idioma); } catch { /* sin persistencia */ }
  const url = new URL(location.href);
  url.searchParams.set('lang', idioma);
  history.replaceState(null, '', url);
  pintar();
}

for (const b of document.querySelectorAll('[data-lang]')) {
  b.addEventListener('click', () => cambiarIdioma(b.dataset.lang));
}

pintar();
try {
  const r = await fetch('./data/indicadores.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(String(r.status));
  datos = await r.json();
  pintar();
} catch {
  document.getElementById('error').hidden = false;
}
