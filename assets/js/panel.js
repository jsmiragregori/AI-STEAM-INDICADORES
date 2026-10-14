// Panel de indicadores AI-STEAM Network.
// Lee data/indicadores.json (lo genera `npm run indicadores` en el repo de
// gestión) y pinta textos, cifras y gráficos en el idioma elegido.
// Todo se inserta con textContent: ninguna cadena se interpreta como HTML.

import { TEXTOS } from './textos.js';
import { pintarMapa } from './mapa.js';
import { pintarPruebas } from './pruebas.js';
import { pintarProceso } from './proceso.js';

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
function mesCorto(yyyymm) {
  const [a, m] = yyyymm.split('-').map(Number);
  return new Intl.DateTimeFormat(idioma === 'es' ? 'es-ES' : 'en-GB', { month: 'short' })
    .format(new Date(a, m - 1, 1));
}
const anio = (yyyymm) => yyyymm.slice(0, 4);

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
/** Muestra la ficha en el borde del elemento (uso con teclado). */
function mostrarTipEn(e, etiqueta, valor) {
  const r = e.getBoundingClientRect();
  mostrarTip({ clientX: r.left + r.width / 2, clientY: r.top + 10 }, etiqueta, valor);
}
/** Ficha ampliada: título, desglose por series (con su color) y total. */
function mostrarTipDetalle(ev, titulo, filas) {
  tip.replaceChildren();
  const cab = document.createElement('span');
  cab.className = 'tip-t';
  cab.textContent = titulo;
  const lista = document.createElement('span');
  lista.className = 'tip-lista';
  for (const f of filas) {
    const fila = document.createElement('span');
    fila.className = 'tip-fila';
    const punto = document.createElement('i');
    punto.className = `dot ${f.clase}`;
    const nombre = document.createElement('span');
    nombre.className = 'tip-nom';
    nombre.textContent = f.etiqueta;
    const valor = document.createElement('b');
    valor.className = 'tip-val';
    valor.textContent = f.valor;
    fila.append(punto, nombre, valor);
    lista.append(fila);
  }
  tip.append(cab, lista);
  const x = Math.max(8, Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8));
  tip.style.left = `${x}px`;
  tip.style.top = `${ev.clientY - 40}px`;
  tip.classList.add('on');
}
const TIP = { mostrar: mostrarTip, mostrarEn: mostrarTipEn, detalle: mostrarTipDetalle, ocultar: ocultarTip };

// --- V5 · Conteo animado de las cifras ---------------------------------------------
// Cada [data-n] cuenta desde cero la primera vez que aparece en pantalla; si
// ya no hay que animar (prefers-reduced-motion o sin IntersectionObserver),
// se deja el valor final formateado igual que hoy. El valor final es siempre
// el del JSON: al terminar, el texto se fija con num().
const DUR_CIFRA = 900;
const cifras = new WeakSet();   // ya animadas o en animación
const cifrasEnEspera = new Set(); // observando, aún sin entrar en pantalla
let observadorCifras = null;

const reducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function contar(e, objetivo) {
  const inicio = performance.now();
  const paso = (t) => {
    const avance = Math.min(1, (t - inicio) / DUR_CIFRA);
    const suave = 1 - Math.pow(1 - avance, 3);
    e.textContent = num(Math.round(objetivo * suave));
    if (avance < 1) requestAnimationFrame(paso);
    else e.textContent = num(objetivo);
  };
  requestAnimationFrame(paso);
}
function animarCifras() {
  if (!datos) return;
  const animable = !reducido() && 'IntersectionObserver' in window;
  if (animable && !observadorCifras) {
    observadorCifras = new IntersectionObserver((entradas) => {
      for (const en of entradas) {
        if (!en.isIntersecting) continue;
        const e = en.target;
        observadorCifras.unobserve(e);
        cifrasEnEspera.delete(e);
        cifras.add(e);
        const objetivo = Number(e.dataset.v);
        if (reducido() || !Number.isFinite(objetivo)) e.textContent = num(objetivo);
        else contar(e, objetivo);
      }
    }, { threshold: 0.5 });
  }
  for (const e of document.querySelectorAll('[data-n]')) {
    if (cifras.has(e)) continue;
    const objetivo = Number(e.dataset.v);
    if (!animable || !Number.isFinite(objetivo)) continue;
    e.textContent = num(0);
    cifrasEnEspera.add(e);
    observadorCifras.observe(e);
  }
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
    'b.strings.p': { total: num(calc.textosTraducidos) },
  };
  for (const e of document.querySelectorAll('[data-t]')) {
    e.textContent = t(e.dataset.t, { ...vars, ...(porClave[e.dataset.t] || {}) });
  }
  for (const e of document.querySelectorAll('[data-n]')) {
    const ruta = e.dataset.n;
    const valor = ruta.startsWith('calc.') ? calc[ruta.slice(5)] : leer(datos, ruta);
    if (typeof valor === 'number') {
      e.dataset.v = String(valor);
      e.textContent = num(valor);
    } else {
      e.textContent = '–';
    }
  }
  animarCifras();

  pintarMapa(datos, { t, num, tip: TIP });
  pintarPruebas(datos, { t, num, tip: TIP });
  pintarProceso(datos, {
    t, num, mes, mesCorto, anio, fecha,
    inicio: vars.inicio,
    tip: TIP,
  });
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
