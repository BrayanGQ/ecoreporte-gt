// Pruebas de compatibilidad en los navegadores instalados (Chrome y Edge, basados en Chromium,
// controlados por el protocolo de depuración remota). Firefox se verifica a mano (ver
// docs/VALIDACION.md) porque no usa este protocolo.
// Requisitos: backend corriendo con los datos demo y el frontend servido con
// `npm run build && npm run preview` (http://localhost:4173).
// Uso (desde frontend/):  node scripts/compatibilidad.mjs
//
// En cada navegador: carga Inicio, Reportar, Mapa y Consulta; verifica que el mapa muestre
// mosaicos y marcadores; inicia sesión por el formulario como ciudadano y como coordinador.
// Guarda capturas y docs/validacion/compatibilidad/resultados.json.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SALIDA = path.join(RAIZ, 'docs', 'validacion', 'compatibilidad');
const BASE = process.env.LH_BASE || 'http://localhost:4173';
const PUERTO = 9555;

const NAVEGADORES = [
  { id: 'chrome', nombre: 'Google Chrome', ruta: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
  { id: 'edge', nombre: 'Microsoft Edge', ruta: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' },
  { id: 'firefox', nombre: 'Mozilla Firefox', ruta: 'C:/Program Files/Mozilla Firefox/firefox.exe' },
];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function abrir(nav) {
  const perfil = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP || '/tmp'), `ecoreporte-${nav.id}-`));
  const proceso = spawn(nav.ruta, [
    '--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=1366,900', 'about:blank',
  ], { stdio: 'ignore' });
  let version;
  for (let i = 0; i < 40 && !version; i++) {
    await esperar(250);
    try { version = (await (await fetch(`http://127.0.0.1:${PUERTO}/json/version`)).json()).Browser; } catch (e) { /* arrancando */ }
  }
  if (!version) throw new Error(`${nav.nombre} no abrió el puerto de depuración.`);
  const pagina = (await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pendientes = {};
  const errores = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === 'Runtime.exceptionThrown') errores.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errores.push(`${d.params.entry.text} ${d.params.entry.url || ''}`.trim());
    pendientes[d.id]?.(d.result ?? d.error);
  };
  const enviar = (method, params = {}) => new Promise((r) => { pendientes[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
  await enviar('Runtime.enable');
  await enviar('Log.enable');
  await enviar('Page.enable');
  const evaluar = async (expr) => (await enviar('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
  const ir = async (ruta) => { await enviar('Page.navigate', { url: BASE + ruta }); await esperar(2500); };
  const captura = async (archivo) => {
    const { data } = await enviar('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
    fs.writeFileSync(path.join(SALIDA, archivo), Buffer.from(data, 'base64'));
    return path.relative(RAIZ, path.join(SALIDA, archivo)).replace(/\\/g, '/');
  };
  // Espera hasta que la expresión sea verdadera (máx. `ms`).
  const esperarQue = async (expr, ms = 8000) => {
    for (let t = 0; t < ms; t += 250) { if (await evaluar(expr)) return true; await esperar(250); }
    return false;
  };
  const cerrar = () => { ws.close(); proceso.kill(); };
  return { version, enviar, evaluar, ir, captura, esperarQue, errores, cerrar };
}

// Cada prueba devuelve { ok, detalle }.
const PRUEBAS = [
  {
    id: 'inicio', nombre: 'Inicio carga', async correr(b) {
      await b.ir('/');
      const ok = await b.esperarQue("document.body.innerText.includes('EcoReporte GT') && document.body.innerText.includes('Soy Municipalidad')");
      return { ok, detalle: ok ? 'Se muestran las dos entradas (ciudadano y municipalidad).' : 'No se encontró el contenido de inicio.' };
    },
  },
  {
    id: 'reportar', nombre: 'Reportar: formulario y mapa', async correr(b) {
      await b.ir('/portal');
      const mapa = await b.esperarQue("document.querySelectorAll('#map img.leaflet-tile-loaded').length > 0 && !!document.querySelector('#map .leaflet-marker-icon')");
      const cobertura = await b.esperarQue("document.body.innerText.includes('Este reporte será atendido por')");
      const mosaicos = await b.evaluar("document.querySelectorAll('#map img.leaflet-tile-loaded').length");
      return { ok: mapa && cobertura, detalle: `Mapa con ${mosaicos} mosaicos cargados y marcador; ${cobertura ? 'detecta la municipalidad' : 'NO detectó la municipalidad'}.` };
    },
  },
  {
    id: 'mapa', nombre: 'Mapa: mosaicos y marcadores', async correr(b) {
      await b.ir('/portal/mapa');
      const ok = await b.esperarQue("document.querySelectorAll('img.leaflet-tile-loaded').length > 0 && document.querySelectorAll('.leaflet-marker-icon').length > 0");
      const [mosaicos, marcadores] = await b.evaluar("[document.querySelectorAll('img.leaflet-tile-loaded').length, document.querySelectorAll('.leaflet-marker-icon').length]");
      const total = (await (await fetch(`${BASE}/api/reportes`)).json()).length;
      return { ok: ok && marcadores === total, detalle: `${mosaicos} mosaicos cargados; ${marcadores} marcadores de ${total} reportes.` };
    },
  },
  {
    id: 'consulta', nombre: 'Consulta por código', async correr(b) {
      await b.ir('/portal/consultar');
      const codigo = (await (await fetch(`${BASE}/api/reportes`)).json()).find((r) => r.nombre_estado === 'resuelto')?.codigo_seguimiento;
      await b.evaluar(`(() => { const i = document.querySelector('input'); i.value = '${codigo}'; i.dispatchEvent(new Event('input'));
        [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Consultar')).click(); })()`);
      const ok = await b.esperarQue("document.body.innerText.includes('Estado actual') && document.body.innerText.includes('resuelto')");
      return { ok, detalle: ok ? `Muestra el estado y el historial de ${codigo}.` : `No mostró el resultado de ${codigo}.` };
    },
  },
  {
    id: 'login-ciudadano', nombre: 'Inicio de sesión del ciudadano', async correr(b) {
      await b.ir('/portal/login');
      await b.evaluar(`(() => { const [c, p] = document.querySelectorAll('input');
        c.value = 'maria.garcia@ecoreporte.gt'; c.dispatchEvent(new Event('input'));
        p.value = 'password123'; p.dispatchEvent(new Event('input'));
        [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Ingresar')).click(); })()`);
      const ok = await b.esperarQue("location.pathname === '/portal' && document.body.innerText.includes('María José García')");
      return { ok, detalle: ok ? 'Redirige al portal y muestra el nombre de la ciudadana.' : `Quedó en ${await b.evaluar('location.pathname')}.` };
    },
  },
  {
    id: 'login-municipal', nombre: 'Inicio de sesión del coordinador', async correr(b) {
      await b.evaluar("localStorage.clear()");
      await b.ir('/municipal/login');
      await b.evaluar(`(() => { const [c, p] = document.querySelectorAll('input');
        c.value = 'ana.morales@ecoreporte.gt'; c.dispatchEvent(new Event('input'));
        p.value = 'password123'; p.dispatchEvent(new Event('input'));
        [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Ingresar')).click(); })()`);
      const ok = await b.esperarQue("location.pathname === '/municipal/panel' && document.querySelectorAll('table.dash-table tbody tr').length > 1");
      const filas = await b.evaluar("document.querySelectorAll('table.dash-table tbody tr').length");
      return { ok, detalle: ok ? `Entra al panel municipal con ${filas} reportes de su municipalidad.` : `Quedó en ${await b.evaluar('location.pathname')}.` };
    },
  },
];

async function main() {
  fs.mkdirSync(SALIDA, { recursive: true });
  const resultados = [];
  for (const nav of NAVEGADORES) {
    if (!fs.existsSync(nav.ruta)) {
      console.log(`\n${nav.nombre}: no está instalado (${nav.ruta}).`);
      resultados.push({ navegador: nav.id, nombre: nav.nombre, instalado: false });
      continue;
    }
    if (nav.id === 'firefox') {
      console.log(`\n${nav.nombre}: instalado, pero se verifica a mano (no usa el protocolo de Chromium).`);
      resultados.push({ navegador: nav.id, nombre: nav.nombre, instalado: true, automatizado: false });
      continue;
    }
    const b = await abrir(nav);
    console.log(`\n${nav.nombre} — ${b.version}`);
    const pruebas = [];
    try {
      for (const p of PRUEBAS) {
        const erroresAntes = b.errores.length;
        let r;
        try { r = await p.correr(b); } catch (e) { r = { ok: false, detalle: `Error: ${e.message}` }; }
        const captura = await b.captura(`${nav.id}-${p.id}.jpg`);
        const errores = b.errores.slice(erroresAntes);
        pruebas.push({ id: p.id, nombre: p.nombre, ...r, errores_consola: errores, captura });
        console.log(`  ${r.ok ? '✔' : '✘'} ${p.nombre}: ${r.detalle}${errores.length ? `  [consola: ${errores.join(' | ')}]` : ''}`);
      }
    } finally {
      b.cerrar();
    }
    resultados.push({ navegador: nav.id, nombre: nav.nombre, instalado: true, automatizado: true, version: b.version, modo: 'headless (--headless=new)', pruebas });
  }
  fs.writeFileSync(path.join(SALIDA, 'resultados.json'),
    JSON.stringify({ fecha: new Date().toISOString(), base: BASE, resultados }, null, 2) + '\n');
  console.log(`\nResultados en ${path.relative(RAIZ, SALIDA)}`);
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exitCode = 1;
});
