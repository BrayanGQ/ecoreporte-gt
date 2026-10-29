// Pruebas de integración: comportamiento ante fallas de la base de datos.
// Se simulan con jest.spyOn sobre src/config/db.js:
//   - db.pool.query: el helper query() la llama en cada consulta (los controladores importan
//     { query } desestructurado, así que se espía el pool y no el helper).
//   - db.pool.connect: entrega un cliente que delega en una conexión real pero falla en la
//     sentencia indicada, a mitad de la transacción; así el ROLLBACK se ejecuta de verdad.
// El error simulado trae SQL y nombres de tablas y columnas para verificar que no lleguen al cliente.
const jwt = require('jsonwebtoken');
const db = require('../src/config/db');
const {
  api, bearer, puntos, crearReporte, estadoDe, uno, idUsuario, USUARIOS, MARCA, FOTO, CORREO_PRUEBA,
} = require('./helpers');

const ERROR_SQL = 'error: insert or update on table "reporte" violates foreign key constraint '
  + '"reporte_id_tipo_incidencia_fkey" — SELECT password_hash FROM usuario WHERE correo = $1';
const RASTROS = [/password_hash/, /reporte_id_tipo/, /SELECT|INSERT|UPDATE/, /\bat \S+\.js/, /usuario WHERE/];

// Algunas fallas dejaban la petición sin respuesta: se corta a los 5 s con un mensaje claro.
const LIMITE_MS = 5000;
function conLimite(peticion) {
  let temporizador;
  return Promise.race([
    peticion,
    new Promise((_, rechazar) => {
      temporizador = setTimeout(() => rechazar(new Error(`La API no respondió en ${LIMITE_MS / 1000} s`)), LIMITE_MS);
    }),
  ]).finally(() => clearTimeout(temporizador));
}

const textoDe = (sql) => (typeof sql === 'string' ? sql : sql.text);

// pool.query falla en las consultas que coinciden con `patron`; las demás llegan a la base.
function fallarConsultas(patron) {
  const original = db.pool.query.bind(db.pool);
  return jest.spyOn(db.pool, 'query').mockImplementation((sql, params) => (
    patron.test(textoDe(sql)) ? Promise.reject(new Error(ERROR_SQL)) : original(sql, params)
  ));
}

// La próxima llamada a pool.connect() entrega un cliente que falla en la sentencia `patron`.
// Devuelve las sentencias ejecutadas y el espía de release().
async function clienteQueFallaEn(patron) {
  const real = await db.pool.connect();
  const sentencias = [];
  const cliente = {
    query: jest.fn((sql, params) => {
      sentencias.push(textoDe(sql).trim().split(/\s+/).slice(0, 3).join(' '));
      return patron.test(textoDe(sql)) ? Promise.reject(new Error(ERROR_SQL)) : real.query(sql, params);
    }),
    release: jest.fn((...args) => real.release(...args)),
  };
  jest.spyOn(db.pool, 'connect').mockResolvedValueOnce(cliente);
  return { cliente, sentencias };
}

function esperarErrorGenerico(res, status, mensaje) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: mensaje });
  for (const rastro of RASTROS) expect(res.text).not.toMatch(rastro);
}

let P;
let sesiones;
let entornoOriginal;

beforeAll(async () => {
  P = await puntos();
  // Las sesiones se piden antes de simular fallas (el login también consulta la base).
  sesiones = {
    ciudadano: await bearer(USUARIOS.ciudadano),
    coordinador: await bearer(USUARIOS.coordGuatemala),
    cuadrilla: await bearer(USUARIOS.cuadrillaA),
    admin: await bearer(USUARIOS.admin),
  };
});

beforeEach(() => {
  entornoOriginal = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  process.env.NODE_ENV = entornoOriginal;
});

const cuerpoReporte = (descripcion, extra = {}) => ({
  id_tipo_incidencia: 1, latitud: P.guatemala.lat, longitud: P.guatemala.lng,
  descripcion: `${MARCA} ${descripcion}`, ...extra,
});
const cuantos = async (descripcion) =>
  (await uno('SELECT count(*)::int AS n FROM reporte WHERE descripcion = $1', [`${MARCA} ${descripcion}`])).n;

describe('Transacciones: falla a mitad de la transacción', () => {
  test('CP-87 Registrar un reporte: si falla el INSERT del reporte responde 500 genérico, hace ROLLBACK y libera el cliente', async () => {
    const { cliente, sentencias } = await clienteQueFallaEn(/INSERT INTO reporte/);

    const res = await conLimite(api().post('/api/reportes').send(cuerpoReporte('falla insert reporte')));

    esperarErrorGenerico(res, 500, 'Error al registrar el reporte.');
    expect(sentencias[0]).toBe('BEGIN');
    expect(sentencias).toContain('ROLLBACK');
    expect(sentencias).not.toContain('COMMIT');
    expect(cliente.release).toHaveBeenCalledTimes(1);
    expect(await cuantos('falla insert reporte')).toBe(0);
  });

  test('CP-88 Registrar un reporte con foto: si falla el INSERT de la evidencia, el reporte ya insertado se deshace', async () => {
    const { cliente, sentencias } = await clienteQueFallaEn(/INSERT INTO evidencia_fotografica/);

    const res = await conLimite(api().post('/api/reportes').set(sesiones.ciudadano)
      .send(cuerpoReporte('falla insert evidencia', { evidencias: [FOTO] })));

    esperarErrorGenerico(res, 500, 'Error al registrar el reporte.');
    expect(sentencias).toEqual(expect.arrayContaining(['INSERT INTO reporte', 'ROLLBACK']));
    expect(cliente.release).toHaveBeenCalledTimes(1);
    expect(await cuantos('falla insert evidencia')).toBe(0);
  });

  test('CP-89 Acción del flujo (asignar): si falla el INSERT del historial responde 500 genérico, hace ROLLBACK, libera el cliente y el estado no cambia', async () => {
    const id = (await crearReporte(P.guatemala, { descripcion: 'falla historial al asignar' })).body.id_reporte;
    const idCuadrilla = await idUsuario(USUARIOS.cuadrillaA);
    const { cliente, sentencias } = await clienteQueFallaEn(/INSERT INTO historial_estado/);

    const res = await conLimite(api().post(`/api/reportes/${id}/asignar`).set(sesiones.coordinador)
      .send({ id_usuario_asignado: idCuadrilla }));

    esperarErrorGenerico(res, 500, 'Error al actualizar el reporte.');
    expect(sentencias).toEqual(expect.arrayContaining(['BEGIN', 'UPDATE reporte SET', 'ROLLBACK']));
    expect(sentencias).not.toContain('COMMIT');
    expect(cliente.release).toHaveBeenCalledTimes(1);
    expect(await estadoDe(id)).toBe('recibido');
    expect((await uno('SELECT id_usuario_asignado FROM reporte WHERE id_reporte = $1', [id])).id_usuario_asignado).toBeNull();
  });

  test('CP-90 Resolver: si falla el INSERT de la foto de la limpieza, el reporte sigue en atención y sin evidencia municipal', async () => {
    const id = (await crearReporte(P.guatemala, { descripcion: 'falla foto al resolver' })).body.id_reporte;
    await api().post(`/api/reportes/${id}/asignar`).set(sesiones.coordinador)
      .send({ id_usuario_asignado: await idUsuario(USUARIOS.cuadrillaA) });
    await api().post(`/api/reportes/${id}/iniciar`).set(sesiones.cuadrilla).send({});
    const { cliente, sentencias } = await clienteQueFallaEn(/INSERT INTO evidencia_fotografica/);

    const res = await conLimite(api().post(`/api/reportes/${id}/resolver`).set(sesiones.cuadrilla)
      .send({ evidencias: [FOTO] }));

    esperarErrorGenerico(res, 500, 'Error al actualizar el reporte.');
    expect(sentencias).toContain('ROLLBACK');
    expect(cliente.release).toHaveBeenCalledTimes(1);
    expect(await estadoDe(id)).toBe('en_atencion');
    expect((await uno("SELECT count(*)::int AS n FROM evidencia_fotografica WHERE id_reporte = $1 AND tipo_evidencia = 'municipal'", [id])).n).toBe(0);
  });

  test('CP-91 Sin conexión disponible (pool.connect rechaza): registrar y actuar sobre un reporte responden 500 genérico', async () => {
    const id = (await crearReporte(P.guatemala, { descripcion: 'sin conexión al asignar' })).body.id_reporte;
    const idCuadrilla = await idUsuario(USUARIOS.cuadrillaA);
    // Una vez por petición: pool.query() también usa pool.connect() por dentro (con callback).
    const sinConexion = new Error('timeout exceeded when trying to connect');
    jest.spyOn(db.pool, 'connect').mockRejectedValueOnce(sinConexion).mockRejectedValueOnce(sinConexion);

    const registrar = await conLimite(api().post('/api/reportes').send(cuerpoReporte('sin conexión al registrar')));
    esperarErrorGenerico(registrar, 500, 'Error al registrar el reporte.');

    const asignar = await conLimite(api().post(`/api/reportes/${id}/asignar`).set(sesiones.coordinador)
      .send({ id_usuario_asignado: idCuadrilla }));
    esperarErrorGenerico(asignar, 500, 'Error al actualizar el reporte.');
    expect(await estadoDe(id)).toBe('recibido');
  });

  test('CP-97 Conexión perdida a mitad de la transacción (también falla el ROLLBACK): 500 genérico y el cliente se libera descartando la conexión', async () => {
    const id = (await crearReporte(P.guatemala, { descripcion: 'conexión perdida al asignar' })).body.id_reporte;
    const idCuadrilla = await idUsuario(USUARIOS.cuadrillaA);

    const registro = await clienteQueFallaEn(/INSERT INTO reporte|ROLLBACK/);
    const registrar = await conLimite(api().post('/api/reportes').send(cuerpoReporte('conexión perdida al registrar')));
    esperarErrorGenerico(registrar, 500, 'Error al registrar el reporte.');
    // release(error): el pool descarta la conexión en lugar de reutilizarla con la transacción abierta.
    expect(registro.cliente.release).toHaveBeenCalledTimes(1);
    expect(registro.cliente.release.mock.calls[0][0]).toBeInstanceOf(Error);

    const accion = await clienteQueFallaEn(/INSERT INTO historial_estado|ROLLBACK/);
    const asignar = await conLimite(api().post(`/api/reportes/${id}/asignar`).set(sesiones.coordinador)
      .send({ id_usuario_asignado: idCuadrilla }));
    esperarErrorGenerico(asignar, 500, 'Error al actualizar el reporte.');
    expect(accion.cliente.release).toHaveBeenCalledTimes(1);
    expect(accion.cliente.release.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(await estadoDe(id)).toBe('recibido');
  });
});

describe('Consultas: falla de la base en los demás endpoints críticos', () => {
  test('CP-92 Reportes: listado, mis reportes, consulta por código, detalle y asignables responden 500 genérico', async () => {
    const id = (await crearReporte(P.guatemala, { descripcion: 'consultas con falla' })).body;
    fallarConsultas(/FROM reporte|FROM usuario u\s+JOIN rol/);

    esperarErrorGenerico(await api().get('/api/reportes'), 500, 'Error al obtener los reportes.');
    esperarErrorGenerico(await api().get('/api/reportes/mis-reportes').set(sesiones.ciudadano), 500, 'Error al obtener tus reportes.');
    esperarErrorGenerico(await api().get(`/api/reportes/consulta/${id.codigo_seguimiento}`), 500, 'Error al consultar el reporte.');
    esperarErrorGenerico(await api().get(`/api/reportes/${id.id_reporte}/detalle`).set(sesiones.admin), 500, 'Error al obtener el detalle del reporte.');
    esperarErrorGenerico(await api().get(`/api/reportes/${id.id_reporte}/asignables`).set(sesiones.coordinador), 500, 'Error al obtener los empleados asignables.');
  });

  test('CP-93 Autenticación: registro, login, recuperación y cambio de contraseña responden 500 genérico', async () => {
    fallarConsultas(/FROM usuario|INTO usuario/);

    esperarErrorGenerico(
      await api().post('/api/auth/registro').send({ nombre_completo: 'Prueba falla', correo: CORREO_PRUEBA('falla'), password: 'clave123' }),
      500, 'Error al crear la cuenta.'
    );
    esperarErrorGenerico(
      await api().post('/api/auth/login').send({ correo: USUARIOS.ciudadano, password: 'clave123' }),
      500, 'Error al iniciar sesión.'
    );
    esperarErrorGenerico(
      await api().put('/api/cuenta/password').set(sesiones.ciudadano).send({ password_actual: 'clave123', password_nueva: 'nueva123' }),
      500, 'Error al cambiar la contraseña.'
    );
    // La recuperación consulta la base solo fuera de producción.
    process.env.NODE_ENV = 'development';
    esperarErrorGenerico(
      await api().post('/api/auth/recuperar').send({ correo: USUARIOS.ciudadano }),
      500, 'Error al procesar la solicitud.'
    );
  });

  test('CP-106 Restablecer con un token de recuperación válido: una falla de la base responde 500, no "enlace inválido"; un token inválido sigue dando 400', async () => {
    const { JWT_SECRET } = require('../src/middleware/auth');
    const idCiudadana = await idUsuario(USUARIOS.ciudadano);
    const valido = jwt.sign({ id_usuario: idCiudadana, tipo: 'recuperacion' }, JWT_SECRET, { expiresIn: '15m' });
    fallarConsultas(/UPDATE usuario SET password_hash/);

    const res = await conLimite(api().post('/api/auth/restablecer').send({ token: valido, nueva_password: 'nueva456' }));
    esperarErrorGenerico(res, 500, 'Error al restablecer la contraseña.');

    const invalido = await api().post('/api/auth/restablecer').send({ token: 'no-es-un-jwt', nueva_password: 'nueva456' });
    expect(invalido.status).toBe(400);
    expect(invalido.body).toEqual({ error: 'El enlace de recuperación es inválido o expiró.' });

    // Una contraseña que no es texto sigue siendo un error de datos (400), no de servidor.
    const numerica = await api().post('/api/auth/restablecer').send({ token: valido, nueva_password: 12345678 });
    expect(numerica.status).toBe(400);
  });
});

describe('Ramas de control de acceso y validación sin cubrir', () => {
  test('CP-94 Detalle con sesión de ciudadano: 403 (rol sin alcance sobre reportes)', async () => {
    const id = (await crearReporte(P.guatemala, { descripcion: 'detalle ciudadano' })).body.id_reporte;
    const res = await api().get(`/api/reportes/${id}/detalle`).set(sesiones.ciudadano);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'No tenés acceso a este reporte.' });
  });

  test('CP-95 Cambiar la contraseña con una sesión de una cuenta desactivada: 403', async () => {
    const correo = CORREO_PRUEBA('desactivada');
    await api().post('/api/auth/registro').send({ nombre_completo: 'Prueba desactivada', correo, password: 'clave123' });
    const login = await api().post('/api/auth/login').send({ correo, password: 'clave123' });
    await db.query('UPDATE usuario SET estado = FALSE WHERE correo = $1', [correo]);

    const res = await api().put('/api/cuenta/password').set('Authorization', `Bearer ${login.body.token}`)
      .send({ password_actual: 'clave123', password_nueva: 'nueva123' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'La cuenta no existe o está desactivada.' });
  });

  test('CP-96 Resolver con una foto de más de 5 millones de caracteres: 400 y el reporte sigue en atención', async () => {
    const id = (await crearReporte(P.guatemala, { descripcion: 'foto demasiado grande' })).body.id_reporte;
    await api().post(`/api/reportes/${id}/asignar`).set(sesiones.coordinador)
      .send({ id_usuario_asignado: await idUsuario(USUARIOS.cuadrillaA) });
    await api().post(`/api/reportes/${id}/iniciar`).set(sesiones.cuadrilla).send({});

    const grande = `data:image/png;base64,${'A'.repeat(5 * 1024 * 1024)}`;
    const res = await api().post(`/api/reportes/${id}/resolver`).set(sesiones.cuadrilla).send({ evidencias: [grande] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('La foto 1 es demasiado grande. Reducí su tamaño e intentá de nuevo.');
    expect(await estadoDe(id)).toBe('en_atencion');
  });
});
