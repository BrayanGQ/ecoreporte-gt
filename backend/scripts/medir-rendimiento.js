// Medición de rendimiento de la API de EcoReporte GT.
// Uso (desde backend/):  npm run test:bd   (una vez, prepara ecoreporte_test)
//                         npm run medir
//
// Levanta el backend como un proceso aparte (node src/index.js) contra la base de PRUEBAS
// (ecoreporte_test, de .env.test) en el puerto PORT_MEDICION (3100 por defecto), para no tocar
// la base de la aplicación ni el servidor de desarrollo. Luego, para cada endpoint, hace
// 5 peticiones de calentamiento (no cuentan) y 50 peticiones secuenciales medidas por HTTP,
// y calcula mínimo, promedio, mediana, percentil 95 y máximo en milisegundos.
//
// Resultados: docs/validacion/rendimiento.json (valores sin redondear) y
//             docs/validacion/rendimiento.md (tabla, con 2 decimales).
// Los reportes que crea la medición llevan la marca [MEDICION] y se borran al terminar.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { performance } = require('perf_hooks');
const { cargarEntornoPruebas } = require('./entorno-pruebas');

const CALENTAMIENTO = 5;
const MEDIDAS = 50;
const PUERTO = Number(process.env.PORT_MEDICION || 3100);
const BASE = `http://127.0.0.1:${PUERTO}/api`;
const MARCA = '[MEDICION]';
const PASSWORD = 'password123';
const COORDINADOR = 'ana.morales@ecoreporte.gt';   // Guatemala (datos de demo.js)
const CUADRILLA = 'carlos.perez@ecoreporte.gt';    // Guatemala
const CARPETA_SALIDA = path.join(__dirname, '..', '..', 'docs', 'validacion');
// Foto real de limpieza (database/demo_fotos) para "resolver con 1 foto".
const FOTO_RESOLVER = path.join(__dirname, '..', '..', 'database', 'demo_fotos', 'despues_1.jpg');

const nombreBd = cargarEntornoPruebas(); // antes de importar config/db.js
const { pool } = require('../src/config/db');

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function estadisticas(muestras) {
  const ordenadas = [...muestras].sort((a, b) => a - b);
  const n = ordenadas.length;
  const mitad = Math.floor(n / 2);
  return {
    n,
    min: ordenadas[0],
    promedio: ordenadas.reduce((s, x) => s + x, 0) / n,
    mediana: n % 2 ? ordenadas[mitad] : (ordenadas[mitad - 1] + ordenadas[mitad]) / 2,
    // Percentil 95 por rango más cercano: el valor en la posición ceil(0.95·n).
    p95: ordenadas[Math.ceil(0.95 * n) - 1],
    max: ordenadas[n - 1],
  };
}

// Petición HTTP cronometrada: incluye el envío, la respuesta completa y la lectura del cuerpo.
async function peticion(metodo, ruta, { token, cuerpo } = {}) {
  const opciones = { method: metodo, headers: {} };
  if (token) opciones.headers.Authorization = `Bearer ${token}`;
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  const inicio = performance.now();
  const res = await fetch(BASE + ruta, opciones);
  const texto = await res.text();
  const ms = performance.now() - inicio;
  let datos = null;
  try { datos = JSON.parse(texto); } catch (e) { datos = texto; }
  return { ms, status: res.status, datos };
}

function esperado(res, status, que) {
  if (res.status !== status) {
    throw new Error(`${que}: se esperaba ${status} y se obtuvo ${res.status} ${JSON.stringify(res.datos).slice(0, 200)}`);
  }
  return res;
}

async function login(correo) {
  return esperado(await peticion('POST', '/auth/login', { cuerpo: { correo, password: PASSWORD } }), 200, `login ${correo}`)
    .datos.token;
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------
function levantarBackend() {
  return new Promise((resolve, reject) => {
    const hijo = spawn(process.execPath, ['src/index.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(PUERTO) }, // DB_* ya vienen de .env.test
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let salida = '';
    const tiempoLimite = setTimeout(() => reject(new Error(`El backend no arrancó:\n${salida}`)), 20000);
    const leer = (dato) => {
      salida += dato;
      if (salida.includes('Servidor escuchando')) {
        clearTimeout(tiempoLimite);
        resolve(hijo);
      }
    };
    hijo.stdout.on('data', leer);
    hijo.stderr.on('data', leer);
    hijo.on('exit', (codigo) => reject(new Error(`El backend terminó (código ${codigo}):\n${salida}`)));
  });
}

// ---------------------------------------------------------------------------
// Equipo
// ---------------------------------------------------------------------------
function powershell(comando) {
  try {
    return execSync(`powershell -NoProfile -Command "${comando}"`, { encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
}

async function equipo() {
  const cpus = os.cpus();
  const info = {
    procesador: cpus[0]?.model.trim(),
    nucleos_logicos: cpus.length,
    ram_visible_gib: Number((os.totalmem() / 1024 ** 3).toFixed(2)), // memoria que reporta el SO
    sistema_operativo: `${os.version()} (${os.release()}, ${os.arch()})`,
    node: process.version,
    postgresql: (await pool.query('SHOW server_version')).rows[0].server_version,
    postgis: (await pool.query('SELECT postgis_lib_version() AS v')).rows[0].v,
    base_de_datos: nombreBd,
  };
  if (process.platform === 'win32') {
    const nucleos = powershell('(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum');
    if (nucleos) info.nucleos_fisicos = Number(nucleos);
    const caption = powershell('(Get-CimInstance Win32_OperatingSystem).Caption');
    if (caption) info.sistema_operativo = `${caption} (${os.release()}, ${os.arch()})`;
    const ram = powershell('(Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum');
    if (ram) info.ram_instalada_gib = Number(ram) / 1024 ** 3;
    const modulos = powershell("(Get-CimInstance Win32_PhysicalMemory | ForEach-Object { $_.Speed }) -join ','");
    if (modulos) info.ram_modulos_mts = modulos.split(',').map(Number);
    const fabricante = powershell('(Get-CimInstance Win32_ComputerSystem).Manufacturer');
    const modelo = powershell('(Get-CimInstance Win32_ComputerSystem).Model');
    if (modelo) info.equipo = fabricante && !modelo.startsWith(fabricante) ? `${fabricante} ${modelo}` : modelo;
  }
  return info;
}

// ---------------------------------------------------------------------------
// Medición
// ---------------------------------------------------------------------------
async function medir(nombre, detalle, fn) {
  // Cantidad de reportes en la base al empezar a medir este endpoint (incluye los que creó la
  // propia medición en los pasos anteriores): afecta sobre todo al listado.
  const reportesEnBd = (await pool.query('SELECT count(*)::int AS n FROM reporte')).rows[0].n;
  for (let i = 0; i < CALENTAMIENTO; i++) await fn(i, true);
  const muestras = [];
  for (let i = 0; i < MEDIDAS; i++) muestras.push((await fn(i, false)).ms);
  const r = { endpoint: nombre, detalle, reportes_en_bd: reportesEnBd, ...estadisticas(muestras), muestras_ms: muestras };
  console.log(`  ${nombre.padEnd(42)} mediana ${r.mediana.toFixed(2).padStart(8)} ms   p95 ${r.p95.toFixed(2).padStart(8)} ms`);
  return r;
}

async function main() {
  console.log(`Base de pruebas: ${nombreBd}. Levantando el backend en el puerto ${PUERTO}...`);
  const backend = await levantarBackend();
  const total = CALENTAMIENTO + MEDIDAS;
  const resultados = [];
  try {
    // Restos de una medición interrumpida.
    await pool.query('DELETE FROM reporte WHERE descripcion LIKE $1', [`${MARCA}%`]);

    const punto = (await pool.query(
      `SELECT ST_Y(p) AS lat, ST_X(p) AS lng FROM (
         SELECT ST_PointOnSurface(limite) AS p FROM municipalidad WHERE nombre = 'Municipalidad de Guatemala') x`
    )).rows[0];
    const idCuadrilla = (await pool.query('SELECT id_usuario FROM usuario WHERE correo = $1', [CUADRILLA])).rows[0].id_usuario;
    const tokenCoord = await login(COORDINADOR);
    const tokenCuadrilla = await login(CUADRILLA);
    const foto = `data:image/jpeg;base64,${fs.readFileSync(FOTO_RESOLVER).toString('base64')}`;

    const nuevoReporte = async (sufijo) => esperado(await peticion('POST', '/reportes', {
      cuerpo: { id_tipo_incidencia: 1, latitud: punto.lat, longitud: punto.lng, descripcion: `${MARCA} ${sufijo}` },
    }), 201, 'crear reporte').datos;

    // Reportes preparados (fuera de la medición) para las acciones que cambian de estado.
    console.log('Preparando reportes para asignar y resolver...');
    const paraAsignar = [];
    for (let i = 0; i < total; i++) paraAsignar.push((await nuevoReporte(`para asignar ${i}`)).id_reporte);
    const paraResolver = [];
    for (let i = 0; i < total; i++) {
      const { id_reporte: id } = await nuevoReporte(`para resolver ${i}`);
      esperado(await peticion('POST', `/reportes/${id}/asignar`, { token: tokenCoord, cuerpo: { id_usuario_asignado: idCuadrilla } }), 200, 'asignar (preparación)');
      esperado(await peticion('POST', `/reportes/${id}/iniciar`, { token: tokenCuadrilla, cuerpo: {} }), 200, 'iniciar (preparación)');
      paraResolver.push(id);
    }
    const consultado = await nuevoReporte('para consultar y ver el detalle');

    console.log(`\nMidiendo (${CALENTAMIENTO} de calentamiento + ${MEDIDAS} medidas por endpoint):`);
    resultados.push(await medir('POST /api/auth/login', 'Inicio de sesión del coordinador (incluye bcrypt).',
      async () => esperado(await peticion('POST', '/auth/login', { cuerpo: { correo: COORDINADOR, password: PASSWORD } }), 200, 'login')));

    resultados.push(await medir('POST /api/reportes', 'Reporte anónimo sin fotos; incluye la detección de municipalidad con PostGIS.',
      async (i, cal) => esperado(await peticion('POST', '/reportes', {
        cuerpo: { id_tipo_incidencia: 1, latitud: punto.lat, longitud: punto.lng, descripcion: `${MARCA} crear ${cal ? 'c' : 'm'}${i}` },
      }), 201, 'crear reporte')));

    resultados.push(await medir('GET /api/reportes', 'Listado público completo (el que usa el mapa).',
      async () => esperado(await peticion('GET', '/reportes'), 200, 'listar')));

    resultados.push(await medir('GET /api/reportes/consulta/:codigo', 'Consulta pública por código de seguimiento.',
      async () => esperado(await peticion('GET', `/reportes/consulta/${consultado.codigo_seguimiento}`), 200, 'consulta')));

    resultados.push(await medir('GET /api/reportes/:id/detalle', 'Detalle del reporte como coordinador.',
      async () => esperado(await peticion('GET', `/reportes/${consultado.id_reporte}/detalle`, { token: tokenCoord }), 200, 'detalle')));

    let iAsignar = 0;
    resultados.push(await medir('POST /api/reportes/:id/asignar', 'Coordinador asigna un reporte recibido a una cuadrilla (transacción).',
      async () => esperado(await peticion('POST', `/reportes/${paraAsignar[iAsignar++]}/asignar`, {
        token: tokenCoord, cuerpo: { id_usuario_asignado: idCuadrilla },
      }), 200, 'asignar')));

    let iResolver = 0;
    resultados.push(await medir('POST /api/reportes/:id/resolver', `Cuadrilla resuelve con 1 foto JPEG real (${path.basename(FOTO_RESOLVER)}, ${fs.statSync(FOTO_RESOLVER).size} bytes; ${foto.length} caracteres en base64).`,
      async () => esperado(await peticion('POST', `/reportes/${paraResolver[iResolver++]}/resolver`, {
        token: tokenCuadrilla, cuerpo: { comentario: 'Medición de rendimiento', evidencias: [foto] },
      }), 200, 'resolver')));

    resultados.push(await medir('GET /api/estadisticas/resumen', 'Resumen de estadísticas del coordinador (su municipalidad).',
      async () => esperado(await peticion('GET', '/estadisticas/resumen', { token: tokenCoord }), 200, 'estadísticas')));

    resultados.push(await medir('GET /api/catalogos/municipalidad-por-ubicacion', 'Consulta PostGIS (ST_Contains) para un punto dentro de Guatemala.',
      async () => esperado(await peticion('GET', `/catalogos/municipalidad-por-ubicacion?lat=${punto.lat}&lng=${punto.lng}`), 200, 'municipalidad por ubicación')));

    const datosBd = (await pool.query(
      "SELECT (SELECT count(*)::int FROM reporte WHERE descripcion NOT LIKE $1) AS reportes_base, (SELECT count(*)::int FROM reporte) AS reportes_durante_medicion",
      [`${MARCA}%`]
    )).rows[0];

    const salida = {
      fecha: new Date().toISOString(),
      equipo: await equipo(),
      metodologia: {
        peticiones_calentamiento: CALENTAMIENTO,
        peticiones_medidas: MEDIDAS,
        modo: 'secuencial (una petición a la vez)',
        cliente: `fetch de Node.js ${process.version} contra http://127.0.0.1:${PUERTO} (mismo equipo)`,
        servidor: 'backend de EcoReporte GT (node src/index.js) como proceso aparte',
        percentil_95: 'rango más cercano: valor en la posición ceil(0.95·n) de las muestras ordenadas',
        tiempo_medido: 'desde que se envía la petición hasta que se termina de leer la respuesta',
        datos: `${datosBd.reportes_base} reportes de demostración (npm run test:bd) más los creados por la medición`,
      },
      resultados,
    };

    fs.mkdirSync(CARPETA_SALIDA, { recursive: true });
    fs.writeFileSync(path.join(CARPETA_SALIDA, 'rendimiento.json'), JSON.stringify(salida, null, 2) + '\n');
    fs.writeFileSync(path.join(CARPETA_SALIDA, 'rendimiento.md'), tablaMarkdown(salida));
    console.log(`\nResultados en docs/validacion/rendimiento.json y docs/validacion/rendimiento.md`);
  } finally {
    await pool.query('DELETE FROM reporte WHERE descripcion LIKE $1', [`${MARCA}%`]);
    backend.kill();
    await pool.end();
  }
}

function tablaMarkdown({ fecha, equipo: eq, metodologia: m, resultados }) {
  const f = (x) => x.toFixed(2);
  const filas = resultados.map((r) =>
    `| \`${r.endpoint}\` | ${r.reportes_en_bd} | ${f(r.min)} | ${f(r.promedio)} | ${f(r.mediana)} | ${f(r.p95)} | ${f(r.max)} |`);
  return `# Rendimiento de la API

Fecha de ejecución: ${fecha}

## Equipo

| Componente | Valor |
|---|---|
${eq.equipo ? `| Equipo | ${eq.equipo} |\n` : ''}| Procesador | ${eq.procesador} |
| Núcleos | ${eq.nucleos_fisicos ? `${eq.nucleos_fisicos} físicos, ` : ''}${eq.nucleos_logicos} lógicos |
| RAM | ${eq.ram_instalada_gib ? `${eq.ram_instalada_gib} GiB instalados${eq.ram_modulos_mts ? ` (${eq.ram_modulos_mts.length} módulos, ${eq.ram_modulos_mts.join('/')} MT/s)` : ''}; ` : ''}${eq.ram_visible_gib} GiB visibles para el sistema |
| Sistema operativo | ${eq.sistema_operativo} |
| Node.js | ${eq.node} |
| PostgreSQL | ${eq.postgresql} (PostGIS ${eq.postgis}) |
| Base de datos | ${eq.base_de_datos} |

## Metodología

- ${m.peticiones_calentamiento} peticiones de calentamiento (no cuentan) y ${m.peticiones_medidas} peticiones medidas por endpoint, ${m.modo}.
- Cliente: ${m.cliente}. Servidor: ${m.servidor}.
- Tiempo medido: ${m.tiempo_medido}.
- Percentil 95: ${m.percentil_95}.
- Datos: ${m.datos}.

## Resultados (milisegundos)

Valores mostrados con 2 decimales; los valores completos y las ${m.peticiones_medidas} muestras de cada endpoint están en \`rendimiento.json\`.

| Endpoint | Reportes en la base | Mínimo | Promedio | Mediana | P95 | Máximo |
|---|---|---|---|---|---|---|
${filas.join('\n')}

${resultados.map((r) => `- \`${r.endpoint}\`: ${r.detalle}`).join('\n')}
`;
}

main().catch(async (err) => {
  console.error('\nError en la medición:', err.message);
  process.exitCode = 1;
});
