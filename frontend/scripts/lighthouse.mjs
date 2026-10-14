// Auditoría Lighthouse de las vistas principales de EcoReporte GT.
// Requisitos: backend corriendo (npm run dev en backend/, con los datos demo) y el frontend
// compilado y servido con `npm run build && npm run preview` (http://localhost:4173).
// Uso (desde frontend/):  node scripts/lighthouse.mjs [subcarpeta] [--sin-json]
//                         p. ej. node scripts/lighthouse.mjs despues --sin-json
//
// - Lanza un Chrome propio (headless) con depuración remota y corre `npx lighthouse --port`
//   contra él, con el preset de escritorio y con el de celular (configuración por defecto).
// - Para el dashboard del coordinador inyecta la sesión (token + usuario en localStorage) por
//   el protocolo de depuración de Chrome y corre Lighthouse con --disable-storage-reset, para
//   que no borre esa sesión antes de auditar.
// - Guarda los reportes HTML y JSON en docs/validacion/lighthouse/ y un resumen
//   (puntajes y problemas de accesibilidad) en docs/validacion/lighthouse/resumen.json.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Primer argumento opcional: subcarpeta de docs/validacion/lighthouse/ (p. ej. "despues").
// Con --sin-json se borran los JSON individuales al terminar (cada HTML ya trae el resultado
// completo incrustado) para que el repositorio pese menos.
const ARGS = process.argv.slice(2);
const SUBCARPETA = ARGS.find((a) => !a.startsWith('--')) || '';
const SIN_JSON = ARGS.includes('--sin-json');
const SALIDA = path.join(RAIZ, 'docs', 'validacion', 'lighthouse', SUBCARPETA);
const BASE = process.env.LH_BASE || 'http://localhost:4173';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PUERTO_DEPURACION = 9444;
const COORDINADOR = { correo: 'ana.morales@ecoreporte.gt', password: 'password123' };

const VISTAS = [
  { id: 'inicio', nombre: 'Inicio', ruta: '/' },
  { id: 'reportar', nombre: 'Portal ciudadano (Reportar)', ruta: '/portal' },
  { id: 'mapa', nombre: 'Mapa de reportes', ruta: '/portal/mapa' },
  { id: 'consulta', nombre: 'Consulta por código', ruta: '/portal/consultar' },
  { id: 'login-municipal', nombre: 'Login municipal', ruta: '/municipal/login' },
  { id: 'dashboard-coordinador', nombre: 'Dashboard del coordinador', ruta: '/municipal/panel', sesion: true },
];
const DISPOSITIVOS = [
  { id: 'escritorio', nombre: 'Escritorio', flags: ['--preset=desktop'] },
  { id: 'celular', nombre: 'Celular', flags: [] }, // configuración por defecto de Lighthouse: móvil
];
const CATEGORIAS = ['performance', 'accessibility', 'best-practices', 'seo'];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Chrome con depuración remota
// ---------------------------------------------------------------------------
async function lanzarChrome() {
  const perfil = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP || '/tmp'), 'ecoreporte-lh-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PUERTO_DEPURACION}`, `--user-data-dir=${perfil}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await esperar(250);
    try {
      const version = await (await fetch(`http://127.0.0.1:${PUERTO_DEPURACION}/json/version`)).json();
      return { chrome, version: version.Browser };
    } catch (e) { /* todavía arrancando */ }
  }
  throw new Error('Chrome no abrió el puerto de depuración.');
}

// Abre una pestaña en el origen de la app y guarda la sesión del coordinador en localStorage.
async function inyectarSesion() {
  const login = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(COORDINADOR),
  })).json();
  if (!login.token) throw new Error(`No se pudo iniciar sesión: ${JSON.stringify(login)}`);

  const pestana = await (await fetch(`http://127.0.0.1:${PUERTO_DEPURACION}/json/new?${BASE}/`, { method: 'PUT' })).json();
  const ws = new WebSocket(pestana.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pendientes = {};
  ws.onmessage = (m) => { const d = JSON.parse(m.data); pendientes[d.id]?.(d.result); };
  const enviar = (method, params = {}) => new Promise((r) => { pendientes[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
  await esperar(1500);
  await enviar('Runtime.evaluate', {
    expression: `localStorage.setItem('token', ${JSON.stringify(login.token)});
                 localStorage.setItem('usuario', ${JSON.stringify(JSON.stringify(login.usuario))}); 'ok'`,
  });
  ws.close();
  await fetch(`http://127.0.0.1:${PUERTO_DEPURACION}/json/close/${pestana.id}`);
  return login.usuario;
}

// ---------------------------------------------------------------------------
// Lighthouse
// ---------------------------------------------------------------------------
function lighthouse(url, archivo, flags) {
  execFileSync('npx', [
    '--yes', 'lighthouse', url,
    `--port=${PUERTO_DEPURACION}`,
    `--only-categories=${CATEGORIAS.join(',')}`,
    '--output=html', '--output=json', `--output-path=${archivo}`,
    '--quiet', ...flags,
  ], { stdio: 'inherit', shell: true });
  return JSON.parse(fs.readFileSync(`${archivo}.report.json`, 'utf8'));
}

async function main() {
  fs.mkdirSync(SALIDA, { recursive: true });
  const { chrome, version } = await lanzarChrome();
  console.log(`Chrome: ${version}. Auditando ${BASE}...`);
  const resultados = [];
  try {
    // Primero las vistas públicas (Lighthouse borra el almacenamiento antes de cada una);
    // al final el dashboard, con la sesión inyectada y sin borrar el almacenamiento.
    for (const vista of [...VISTAS.filter((v) => !v.sesion), ...VISTAS.filter((v) => v.sesion)]) {
      if (vista.sesion) {
        const usuario = await inyectarSesion();
        console.log(`Sesión inyectada: ${usuario.nombre_completo} (${usuario.rol}).`);
      }
      for (const disp of DISPOSITIVOS) {
        const archivo = path.join(SALIDA, `${vista.id}-${disp.id}`);
        const flags = [...disp.flags, ...(vista.sesion ? ['--disable-storage-reset'] : [])];
        console.log(`\n▶ ${vista.nombre} — ${disp.nombre}`);
        const lhr = lighthouse(BASE + vista.ruta, archivo, flags);
        const urlFinal = lhr.finalDisplayedUrl || lhr.finalUrl;
        if (vista.sesion && !new URL(urlFinal).pathname.startsWith('/municipal/panel')) {
          throw new Error(`El dashboard redirigió a ${urlFinal}: la sesión no se aplicó.`);
        }
        const puntaje = (c) => (lhr.categories[c].score === null ? null : Math.round(lhr.categories[c].score * 100));
        const fallas = lhr.categories.accessibility.auditRefs
          .map((ref) => lhr.audits[ref.id])
          .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'notApplicable' && a.scoreDisplayMode !== 'manual' && a.scoreDisplayMode !== 'informative')
          .map((a) => ({ id: a.id, titulo: a.title, elementos: a.details?.items?.length ?? 0 }));
        resultados.push({
          vista: vista.id, nombre_vista: vista.nombre, ruta: vista.ruta, url_final: urlFinal,
          dispositivo: disp.id, rendimiento: puntaje('performance'), accesibilidad: puntaje('accessibility'),
          buenas_practicas: puntaje('best-practices'), seo: puntaje('seo'),
          fallas_accesibilidad: fallas,
          lighthouse: lhr.lighthouseVersion, user_agent: lhr.environment?.hostUserAgent,
          reporte_html: path.relative(RAIZ, `${archivo}.report.html`).replace(/\\/g, '/'),
          reporte_json: SIN_JSON ? null : path.relative(RAIZ, `${archivo}.report.json`).replace(/\\/g, '/'),
        });
        console.log(`  Rendimiento ${puntaje('performance')} · Accesibilidad ${puntaje('accessibility')} · Buenas prácticas ${puntaje('best-practices')} · SEO ${puntaje('seo')}`);
      }
    }
  } finally {
    chrome.kill();
  }

  // Problemas de accesibilidad: en cuántas auditorías (vista × dispositivo) aparece cada uno.
  const conteo = {};
  for (const r of resultados) {
    for (const f of r.fallas_accesibilidad) {
      conteo[f.id] ??= { id: f.id, titulo: f.titulo, auditorias: 0, elementos: 0, vistas: new Set() };
      conteo[f.id].auditorias += 1;
      conteo[f.id].elementos += f.elementos;
      conteo[f.id].vistas.add(r.nombre_vista);
    }
  }
  const problemas = Object.values(conteo)
    .map((p) => ({ ...p, vistas: [...p.vistas] }))
    .sort((a, b) => b.auditorias - a.auditorias || b.elementos - a.elementos);

  const resumen = {
    fecha: new Date().toISOString(), base: BASE, chrome: version,
    lighthouse: resultados[0]?.lighthouse, resultados, problemas_accesibilidad: problemas,
  };
  if (SIN_JSON) {
    resumen.nota = 'Los JSON individuales se eliminaron para reducir el tamaño del repositorio; cada reporte HTML contiene el resultado completo de Lighthouse incrustado.';
    for (const archivo of fs.readdirSync(SALIDA).filter((a) => a.endsWith('.report.json'))) {
      fs.unlinkSync(path.join(SALIDA, archivo));
    }
  }
  fs.writeFileSync(path.join(SALIDA, 'resumen.json'), JSON.stringify(resumen, null, 2) + '\n');
  console.log(`\nListo: ${resultados.length} auditorías en ${path.relative(RAIZ, SALIDA)}`);
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exitCode = 1;
});
