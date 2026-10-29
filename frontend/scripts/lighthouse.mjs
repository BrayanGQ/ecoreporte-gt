// Auditoría Lighthouse de todas las vistas de EcoReporte GT (portal ciudadano y portal municipal),
// en escritorio y en celular.
// Requisitos:
//   1. Base de pruebas preparada (backend: npm run test:bd) y frontend compilado (npm run build).
//   2. Backend de pruebas corriendo, que también sirve frontend/dist:
//        node ../backend/scripts/servidor-pruebas.js        (http://localhost:3100, ecoreporte_test)
// Uso (desde frontend/):
//   node scripts/lighthouse.mjs --salida=<carpeta>           o   LH_SALIDA=<carpeta> node scripts/lighthouse.mjs
//   Opcional: LH_BASE (por defecto http://localhost:3100) y CHROME_PATH.
//
// - Lanza un Chrome propio (headless) con depuración remota y corre `npx lighthouse --port` contra él,
//   con el preset de escritorio y con el de celular (configuración por defecto de Lighthouse).
// - Vistas privadas: inicia sesión contra el backend con la cuenta demo de cada rol, guarda la sesión
//   (token + usuario) en localStorage por el protocolo de depuración y corre Lighthouse con
//   --disable-storage-reset para que no la borre. Verifica que la vista no haya redirigido al login.
// - Guarda en la carpeta de salida los reportes HTML y JSON de cada auditoría, resumen.json y resumen.csv.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARG_SALIDA = process.argv.slice(2).find((a) => a.startsWith('--salida='));
const SALIDA_ELEGIDA = ARG_SALIDA ? ARG_SALIDA.slice('--salida='.length) : process.env.LH_SALIDA;
if (!SALIDA_ELEGIDA) {
  console.error('Indicá la carpeta de salida: --salida=<carpeta> o la variable LH_SALIDA.');
  process.exit(1);
}
const SALIDA = path.resolve(SALIDA_ELEGIDA);
const BASE = process.env.LH_BASE || 'http://localhost:3100';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PUERTO_DEPURACION = 9444;

// Contraseña de las cuentas demo en la base de pruebas: DEMO_PASSWORD de backend/.env.test o password123.
function passwordDemo() {
  const archivo = path.join(RAIZ, 'backend', '.env.test');
  const linea = fs.existsSync(archivo)
    ? fs.readFileSync(archivo, 'utf8').split(/\r?\n/).find((l) => /^\s*DEMO_PASSWORD\s*=/.test(l))
    : null;
  return (linea ? linea.split('=').slice(1).join('=').trim() : '') || 'password123';
}
const PASSWORD = passwordDemo();

const CUENTAS = {
  ciudadano: 'maria.garcia@ecoreporte.gt',
  coordinador: 'ana.morales@ecoreporte.gt',
  cuadrilla: 'carlos.perez@ecoreporte.gt',
  administrador: 'admin@ecoreporte.gt',
};

// Vistas por grupo. `ruta` puede ser una función que recibe el contexto (ids de reportes reales).
const GRUPOS = [
  {
    id: 'publica', nombre: 'Pública', sesion: null,
    vistas: [
      { id: 'inicio', nombre: 'Inicio (portada ciudadana)', ruta: '/' },
      { id: 'reportar', nombre: 'Reportar', ruta: '/portal' },
      { id: 'mapa', nombre: 'Mapa de reportes', ruta: '/portal/mapa' },
      { id: 'consultar', nombre: 'Consultar', ruta: '/portal/consultar' },
      { id: 'consultar-codigo', nombre: 'Consultar con código', ruta: (c) => `/portal/consultar?codigo=${c.codigoPublico}` },
      { id: 'login-ciudadano', nombre: 'Login ciudadano', ruta: '/portal/login' },
      { id: 'registro', nombre: 'Registro', ruta: '/portal/registro' },
      { id: 'recuperar', nombre: 'Recuperar contraseña', ruta: '/portal/recuperar' },
      { id: 'login-municipal', nombre: 'Login municipal', ruta: '/municipal/login' },
    ],
  },
  {
    id: 'ciudadano', nombre: 'Ciudadano', sesion: 'ciudadano',
    vistas: [
      { id: 'mis-reportes', nombre: 'Mis reportes', ruta: '/portal/mis-reportes' },
      { id: 'cuenta-ciudadano', nombre: 'Mi cuenta (ciudadano)', ruta: '/portal/cuenta' },
    ],
  },
  {
    id: 'coordinador', nombre: 'Coordinador', sesion: 'coordinador',
    vistas: [
      { id: 'panel-coordinador', nombre: 'Panel de reportes', ruta: '/municipal/panel' },
      { id: 'detalle-coordinador', nombre: 'Detalle de reporte (gestión)', ruta: (c) => `/municipal/panel/reporte/${c.idCoordinador}` },
      { id: 'estadisticas-coordinador', nombre: 'Estadísticas y reportería', ruta: '/municipal/panel/estadisticas' },
      { id: 'cuenta-coordinador', nombre: 'Mi cuenta (coordinador)', ruta: '/municipal/panel/cuenta' },
    ],
  },
  {
    id: 'cuadrilla', nombre: 'Cuadrilla', sesion: 'cuadrilla',
    vistas: [
      { id: 'panel-cuadrilla', nombre: 'Mis reportes asignados', ruta: '/municipal/panel' },
      { id: 'detalle-cuadrilla', nombre: 'Detalle de reporte (atención)', ruta: (c) => `/municipal/panel/reporte/${c.idCuadrilla}` },
      { id: 'cuenta-cuadrilla', nombre: 'Mi cuenta (cuadrilla)', ruta: '/municipal/panel/cuenta' },
    ],
  },
  {
    id: 'administrador', nombre: 'Administrador', sesion: 'administrador',
    vistas: [
      { id: 'panel-admin', nombre: 'Panel (solo lectura)', ruta: '/municipal/panel' },
      { id: 'estadisticas-admin', nombre: 'Estadísticas y reportería (global)', ruta: '/municipal/panel/estadisticas' },
      { id: 'admin-usuarios', nombre: 'Administración: usuarios', ruta: '/municipal/panel/admin/usuarios' },
      { id: 'admin-catalogos', nombre: 'Administración: catálogos', ruta: '/municipal/panel/admin/catalogos' },
    ],
  },
];
const DISPOSITIVOS = [
  { id: 'escritorio', nombre: 'Escritorio', flags: ['--preset=desktop'] },
  { id: 'celular', nombre: 'Celular', flags: [] }, // configuración por defecto de Lighthouse: móvil
];
const CATEGORIAS = ['performance', 'accessibility', 'best-practices', 'seo'];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Backend: sesiones y datos reales para las rutas con id
// ---------------------------------------------------------------------------
async function login(correo) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo, password: PASSWORD }),
  });
  const datos = await res.json();
  if (!datos.token) throw new Error(`No se pudo iniciar sesión con ${correo}: ${res.status} ${JSON.stringify(datos)}`);
  return datos;
}

async function contexto(sesiones) {
  const listar = async (rol) => (await fetch(`${BASE}/api/reportes`, {
    headers: { Authorization: `Bearer ${sesiones[rol].token}` },
  })).json();
  const delCoordinador = await listar('coordinador');
  const deLaCuadrilla = await listar('cuadrilla');
  const enAtencion = deLaCuadrilla.find((r) => ['asignado', 'en_atencion'].includes(r.nombre_estado)) || deLaCuadrilla[0];
  if (!delCoordinador.length || !enAtencion) throw new Error('Faltan reportes de demostración en la base de pruebas.');
  return {
    codigoPublico: delCoordinador[0].codigo_seguimiento,
    idCoordinador: delCoordinador[0].id_reporte,
    idCuadrilla: enAtencion.id_reporte,
  };
}

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
    } catch { /* todavía arrancando */ }
  }
  throw new Error('Chrome no abrió el puerto de depuración.');
}

// Abre una pestaña en el origen de la app y guarda la sesión (token + usuario) en localStorage.
async function inyectarSesion(sesion) {
  const pestana = await (await fetch(`http://127.0.0.1:${PUERTO_DEPURACION}/json/new?${BASE}/`, { method: 'PUT' })).json();
  const ws = new WebSocket(pestana.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pendientes = {};
  ws.onmessage = (m) => { const d = JSON.parse(m.data); pendientes[d.id]?.(d.result); };
  const enviar = (method, params = {}) => new Promise((r) => { pendientes[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
  await esperar(1500);
  await enviar('Runtime.evaluate', {
    expression: `localStorage.clear();
                 localStorage.setItem('token', ${JSON.stringify(sesion.token)});
                 localStorage.setItem('usuario', ${JSON.stringify(JSON.stringify(sesion.usuario))}); 'ok'`,
  });
  ws.close();
  await fetch(`http://127.0.0.1:${PUERTO_DEPURACION}/json/close/${pestana.id}`);
}

// ---------------------------------------------------------------------------
// Lighthouse
// ---------------------------------------------------------------------------
function lighthouse(url, archivo, flags) {
  execFileSync('npx', [
    '--yes', 'lighthouse', `"${url}"`,
    `--port=${PUERTO_DEPURACION}`,
    `--only-categories=${CATEGORIAS.join(',')}`,
    '--output=html', '--output=json', `--output-path="${archivo}"`,
    '--quiet', ...flags,
  ], { stdio: 'inherit', shell: true });
  return JSON.parse(fs.readFileSync(`${archivo}.report.json`, 'utf8'));
}

// Auditorías con puntaje < 1 de una categoría (sin las manuales, informativas o no aplicables).
function fallas(lhr, categoria) {
  return lhr.categories[categoria].auditRefs
    .map((ref) => lhr.audits[ref.id])
    .filter((a) => a.score !== null && a.score < 1 && !['notApplicable', 'manual', 'informative'].includes(a.scoreDisplayMode))
    .map((a) => ({ id: a.id, titulo: a.title, elementos: a.details?.items?.length ?? 0 }));
}

async function main() {
  fs.mkdirSync(SALIDA, { recursive: true });
  const sesiones = {};
  for (const [rol, correo] of Object.entries(CUENTAS)) sesiones[rol] = await login(correo);
  const ctx = await contexto(sesiones);

  const { chrome, version } = await lanzarChrome();
  console.log(`Chrome: ${version}. Auditando ${BASE} → ${SALIDA}`);
  const resultados = [];
  try {
    // Primero las vistas públicas (Lighthouse borra el almacenamiento antes de cada una); después,
    // las de cada rol con su sesión inyectada y sin borrar el almacenamiento.
    for (const grupo of GRUPOS) {
      if (grupo.sesion) {
        await inyectarSesion(sesiones[grupo.sesion]);
        console.log(`\nSesión inyectada: ${sesiones[grupo.sesion].usuario.nombre_completo} (${sesiones[grupo.sesion].usuario.rol}).`);
      }
      for (const vista of grupo.vistas) {
        const ruta = typeof vista.ruta === 'function' ? vista.ruta(ctx) : vista.ruta;
        for (const disp of DISPOSITIVOS) {
          const archivo = path.join(SALIDA, `${grupo.id}-${vista.id}-${disp.id}`);
          const flags = [...disp.flags, ...(grupo.sesion ? ['--disable-storage-reset'] : [])];
          console.log(`\n▶ [${grupo.nombre}] ${vista.nombre} — ${disp.nombre} (${ruta})`);
          const lhr = lighthouse(BASE + ruta, archivo, flags);
          const urlFinal = lhr.finalDisplayedUrl || lhr.finalUrl;
          const rutaFinal = new URL(urlFinal).pathname;
          if (rutaFinal !== new URL(BASE + ruta).pathname) {
            throw new Error(`${vista.nombre}: redirigió a ${urlFinal} (¿la sesión no se aplicó?).`);
          }
          const puntaje = (c) => (lhr.categories[c].score === null ? null : Math.round(lhr.categories[c].score * 100));
          resultados.push({
            grupo: grupo.nombre, vista: vista.id, nombre_vista: vista.nombre, ruta, url_final: urlFinal,
            dispositivo: disp.id, rendimiento: puntaje('performance'), accesibilidad: puntaje('accessibility'),
            buenas_practicas: puntaje('best-practices'), seo: puntaje('seo'),
            fallas_accesibilidad: fallas(lhr, 'accessibility'),
            fallas_buenas_practicas: fallas(lhr, 'best-practices'),
            fallas_seo: fallas(lhr, 'seo'),
            lighthouse: lhr.lighthouseVersion,
            reporte_html: `${path.basename(archivo)}.report.html`,
          });
          console.log(`  Rendimiento ${puntaje('performance')} · Accesibilidad ${puntaje('accessibility')} · Buenas prácticas ${puntaje('best-practices')} · SEO ${puntaje('seo')}`);
        }
      }
    }
  } finally {
    chrome.kill();
  }

  fs.writeFileSync(path.join(SALIDA, 'resumen.json'), JSON.stringify({
    fecha: new Date().toISOString(), base: BASE, chrome: version, lighthouse: resultados[0]?.lighthouse, resultados,
  }, null, 2) + '\n');
  const csv = [
    'grupo,vista,ruta,dispositivo,accesibilidad,buenas_practicas,seo,rendimiento',
    ...resultados.map((r) => [r.grupo, r.nombre_vista, r.ruta, r.dispositivo, r.accesibilidad, r.buenas_practicas, r.seo, r.rendimiento]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
  ].join('\r\n');
  fs.writeFileSync(path.join(SALIDA, 'resumen.csv'), '\uFEFF' + csv + '\r\n');
  console.log(`\nListo: ${resultados.length} auditorías en ${SALIDA}`);
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exitCode = 1;
});
