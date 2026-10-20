// Utilidades compartidas por las pruebas de integración.
// Requiere la base de pruebas preparada con `npm run test:bd` (usuarios y datos de demo.js).
const request = require('supertest');
const app = require('../src/app');
const { query } = require('../src/config/db');

// Contraseña de los usuarios demo en la base de pruebas (scripts/entorno-pruebas.js la fija).
const PASSWORD = process.env.DEMO_PASSWORD;

// Usuarios de demostración (backend/src/demo.js y usuarios base).
const USUARIOS = {
  admin: 'admin@ecoreporte.gt',
  coordGuatemala: 'ana.morales@ecoreporte.gt',
  cuadrillaA: 'carlos.perez@ecoreporte.gt',     // Guatemala
  cuadrillaB: 'jose.hernandez@ecoreporte.gt',   // Guatemala
  coordMixco: 'mario.castillo@ecoreporte.gt',
  ciudadano: 'maria.garcia@ecoreporte.gt',
};

// Todo lo que crean las pruebas lleva esta marca, para poder borrarlo al terminar.
const MARCA = '[PRUEBA AUTOMATIZADA]';
const CORREO_PRUEBA = (nombre) => `prueba.${nombre}.${Date.now()}@prueba.test`;

// PNG de 1x1 en base64 (data URL válida para las evidencias).
const FOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const SIN_COBERTURA = 'Esta zona aún no está cubierta por ninguna municipalidad registrada en la plataforma.';

const api = () => request(app);

// Inicia sesión y devuelve el token (se cachea por correo dentro de cada archivo de pruebas).
const tokens = {};
async function token(correo) {
  if (!tokens[correo]) {
    const res = await api().post('/api/auth/login').send({ correo, password: PASSWORD });
    if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con ${correo}: ${res.status} ${JSON.stringify(res.body)}`);
    tokens[correo] = res.body.token;
  }
  return tokens[correo];
}
const bearer = async (correo) => ({ Authorization: `Bearer ${await token(correo)}` });

async function uno(sql, params) {
  return (await query(sql, params)).rows[0];
}

const idUsuario = async (correo) => (await uno('SELECT id_usuario FROM usuario WHERE correo = $1', [correo])).id_usuario;
const idMunicipalidad = async (nombre) =>
  (await uno('SELECT id_municipalidad FROM municipalidad WHERE nombre = $1', [nombre])).id_municipalidad;

// Puntos de prueba calculados con PostGIS sobre los límites cargados (database/05):
// - guatemala: punto interior del límite de la Municipalidad de Guatemala (activa).
// - mixco: punto interior del límite de Mixco (activa en los datos de demo).
// - inactivo: punto interior de una municipalidad con límite pero inactiva.
// - fuera: punto al oeste de todos los límites (fuera del departamento).
async function puntos() {
  const dentro = async (where, params) => {
    const r = await uno(
      `SELECT ST_Y(p) AS lat, ST_X(p) AS lng, nombre FROM (
         SELECT ST_PointOnSurface(limite) AS p, nombre FROM municipalidad
         WHERE limite IS NOT NULL AND ${where} ORDER BY nombre LIMIT 1) x`,
      params
    );
    if (!r) throw new Error(`No hay municipalidad con límite que cumpla: ${where}`);
    return r;
  };
  const fuera = await uno(
    `SELECT ST_Y(ST_Centroid(ST_Collect(limite))) AS lat, ST_XMin(ST_Collect(limite)) - 0.5 AS lng
     FROM municipalidad WHERE limite IS NOT NULL`
  );
  const contenido = await uno(
    'SELECT count(*)::int AS n FROM municipalidad WHERE ST_Contains(limite, ST_SetSRID(ST_MakePoint($2, $1), 4326))',
    [fuera.lat, fuera.lng]
  );
  if (contenido.n !== 0) throw new Error('El punto "fuera" cae dentro de algún límite.');

  return {
    guatemala: await dentro('nombre = $1', ['Municipalidad de Guatemala']),
    mixco: await dentro('nombre = $1', ['Municipalidad de Mixco']),
    inactivo: await dentro('estado_activo = FALSE', []),
    fuera,
  };
}

// Crea un reporte por la API pública (con la marca de prueba en la descripción).
// `extra` puede sobrescribir campos; un campo en undefined se omite del cuerpo enviado.
async function crearReporte(punto, extra = {}) {
  const { descripcion = 'reporte de prueba', ...resto } = extra;
  return api().post('/api/reportes').send({
    id_tipo_incidencia: 1,
    latitud: punto.lat,
    longitud: punto.lng,
    ...resto,
    descripcion: `${MARCA} ${descripcion}`,
  });
}

const estadoDe = async (idReporte) => (await uno(
  `SELECT e.nombre_estado FROM reporte r JOIN estado_reporte e ON e.id_estado = r.id_estado_actual
   WHERE r.id_reporte = $1`, [idReporte]
)).nombre_estado;

// Borra todo lo creado por las pruebas (los reportes arrastran su historial,
// evidencias y notificaciones por ON DELETE CASCADE).
async function limpiarDatosDePrueba() {
  await query('DELETE FROM reporte WHERE descripcion LIKE $1', [`${MARCA}%`]);
  await query("DELETE FROM usuario WHERE correo LIKE 'prueba.%@prueba.test'");
  await query('DELETE FROM tipo_incidencia WHERE nombre_tipo LIKE $1', [`${MARCA}%`]);
}

module.exports = {
  api, token, bearer, query, uno, idUsuario, idMunicipalidad, puntos, crearReporte, estadoDe,
  limpiarDatosDePrueba, USUARIOS, PASSWORD, MARCA, FOTO, SIN_COBERTURA, CORREO_PRUEBA,
};
