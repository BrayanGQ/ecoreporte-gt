// Pruebas de integración: contenido de las respuestas.
// Ninguna respuesta expone password_hash, tokens que no le corresponden al usuario ni datos
// personales del ciudadano; los errores no muestran SQL, stack ni nombres de tablas o columnas.
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { JWT_SECRET } = require('../src/middleware/auth');
const {
  api, bearer, puntos, query, uno, USUARIOS, PASSWORD, MARCA, CORREO_PRUEBA,
} = require('./helpers');

// Rastros de detalles internos que nunca deben llegar al cliente.
const RASTROS_INTERNOS = [
  /password_hash/i, /\bat \S+ \(/, /node_modules/, /\.js:\d+/, /SyntaxError|TypeError|ReferenceError/,
  /\b(SELECT|INSERT INTO|UPDATE \w+ SET|DELETE FROM)\b/, /\bFROM (usuario|reporte|rol|municipalidad)\b/,
  /constraint|relation "|column "/i,
];
const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/;

function sinRastrosInternos(res) {
  for (const rastro of RASTROS_INTERNOS) expect(res.text).not.toMatch(rastro);
}
const sinToken = (res) => expect(res.text).not.toMatch(JWT);

let P;
let ciudadana; // { id_usuario, nombre_completo, correo }
let reporteCiudadana; // reporte registrado con la sesión de la ciudadana
let entornoOriginal;

beforeAll(async () => {
  P = await puntos();
  ciudadana = await uno('SELECT id_usuario, nombre_completo, correo FROM usuario WHERE correo = $1', [USUARIOS.ciudadano]);
  const res = await api().post('/api/reportes').set(await bearer(USUARIOS.ciudadano)).send({
    id_tipo_incidencia: 1, latitud: P.guatemala.lat, longitud: P.guatemala.lng,
    descripcion: `${MARCA} contenido de respuestas`,
  });
  reporteCiudadana = res.body;
});

beforeEach(() => {
  entornoOriginal = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
});
afterEach(() => {
  process.env.NODE_ENV = entornoOriginal;
  jest.restoreAllMocks();
});

// Ningún dato de la ciudadana (id, nombre, correo) aparece en el texto de la respuesta.
function sinDatosDeLaCiudadana(res) {
  expect(res.text).not.toContain(ciudadana.correo);
  expect(res.text).not.toContain(ciudadana.nombre_completo);
  expect(res.text).not.toContain('id_usuario_reporta');
  expect(res.text).not.toContain('reportado_por');
}

describe('Respuestas sin datos sensibles', () => {
  test('CP-98 Listado público y consulta por código: solo datos del reporte, sin datos del ciudadano ni tokens', async () => {
    const listado = await api().get('/api/reportes');
    expect(listado.status).toBe(200);
    for (const r of listado.body) {
      expect(Object.keys(r).sort()).toEqual([
        'codigo_seguimiento', 'descripcion', 'fecha_reporte', 'id_reporte', 'latitud', 'longitud',
        'municipalidad', 'nombre_estado', 'nombre_tipo',
      ]);
    }
    sinDatosDeLaCiudadana(listado);
    sinToken(listado);

    const consulta = await api().get(`/api/reportes/consulta/${reporteCiudadana.codigo_seguimiento}`);
    expect(consulta.status).toBe(200);
    expect(Object.keys(consulta.body).sort()).toEqual([
      'codigo_seguimiento', 'descripcion', 'fecha_reporte', 'historial', 'id_reporte', 'municipalidad',
      'nombre_estado', 'nombre_tipo',
    ]);
    for (const h of consulta.body.historial) expect(Object.keys(h).sort()).toEqual(['comentario', 'fecha_cambio', 'nombre_estado']);
    sinDatosDeLaCiudadana(consulta);
    sinToken(consulta);
  });

  test('CP-99 Detalle para el personal: sin password_hash, correo del ciudadano ni tokens; fuera de su alcance, 403 sin datos', async () => {
    const detalle = await api().get(`/api/reportes/${reporteCiudadana.id_reporte}/detalle`).set(await bearer(USUARIOS.coordGuatemala));
    expect(detalle.status).toBe(200);
    expect(detalle.text).not.toMatch(/password_hash/);
    expect(detalle.text).not.toContain(ciudadana.correo);
    sinToken(detalle);
    // El personal ve el nombre de quien reportó (pantalla de detalle), pero no su correo.
    expect(detalle.body.reportado_por).toBe(ciudadana.nombre_completo);

    const ajeno = await api().get(`/api/reportes/${reporteCiudadana.id_reporte}/detalle`).set(await bearer(USUARIOS.coordMixco));
    expect(ajeno.status).toBe(403);
    expect(ajeno.body).toEqual({ error: 'No tenés acceso a este reporte.' });
  });

  test('CP-100 Mis reportes y notificaciones: solo los del usuario de la sesión, sin password_hash ni tokens', async () => {
    const otraCuenta = CORREO_PRUEBA('otra.ciudadana');
    await api().post('/api/auth/registro').send({ nombre_completo: 'Otra ciudadana de prueba', correo: otraCuenta, password: 'clave123' });
    const login = await api().post('/api/auth/login').send({ correo: otraCuenta, password: 'clave123' });
    const otra = { Authorization: `Bearer ${login.body.token}` };

    const propios = await api().get('/api/reportes/mis-reportes').set(otra);
    expect(propios.status).toBe(200);
    expect(propios.body).toEqual([]); // no ve los de la ciudadana demo
    const deLaCiudadana = await api().get('/api/reportes/mis-reportes').set(await bearer(USUARIOS.ciudadano));
    const esperados = (await query('SELECT id_reporte FROM reporte WHERE id_usuario_reporta = $1', [ciudadana.id_usuario])).rows;
    expect(deLaCiudadana.body.map((r) => r.id_reporte).sort()).toEqual(esperados.map((r) => r.id_reporte).sort());
    expect(deLaCiudadana.text).not.toMatch(/password_hash/);
    sinToken(deLaCiudadana);

    const notificaciones = await api().get('/api/notificaciones').set(await bearer(USUARIOS.ciudadano));
    const propias = (await query('SELECT id_notificacion FROM notificacion WHERE id_usuario = $1', [ciudadana.id_usuario])).rows;
    expect(notificaciones.body.map((n) => n.id_notificacion).sort()).toEqual(propias.map((n) => n.id_notificacion).sort());
    expect((await api().get('/api/notificaciones').set(otra)).body).toEqual([]);
  });

  test('CP-101 Administración de usuarios: listar, crear y restablecer no devuelven password_hash ni datos de ciudadanos', async () => {
    const admin = await bearer(USUARIOS.admin);
    const lista = await api().get('/api/admin/usuarios').set(admin);
    expect(lista.status).toBe(200);
    expect(lista.text).not.toMatch(/password_hash/);
    expect(lista.body.every((u) => u.nombre_rol !== 'ciudadano')).toBe(true);
    expect(lista.text).not.toContain(ciudadana.correo);

    const idGuatemala = (await uno("SELECT id_municipalidad FROM municipalidad WHERE nombre = 'Municipalidad de Guatemala'")).id_municipalidad;
    const idRol = (await uno("SELECT id_rol FROM rol WHERE nombre_rol = 'encargado_cuadrilla'")).id_rol;
    const creada = await api().post('/api/admin/usuarios').set(admin).send({
      nombre_completo: 'Cuadrilla de prueba', correo: CORREO_PRUEBA('cuadrilla.respuesta'), password: 'clave123',
      id_municipalidad: idGuatemala, id_rol: idRol,
    });
    expect(creada.status).toBe(201);
    expect(creada.text).not.toMatch(/password_hash|clave123/);
    sinToken(creada);

    const restablecida = await api().post('/api/admin/usuarios/restablecer-password').set(admin)
      .send({ correo: creada.body.usuario.correo, password: 'otra4567' });
    expect(restablecida.status).toBe(200);
    expect(restablecida.text).not.toMatch(/password_hash|otra4567/);
    sinToken(restablecida);
  });

  test('CP-102 Autenticación: el login entrega solo el token del propio usuario; registro y recuperación (producción) no entregan tokens', async () => {
    const login = await api().post('/api/auth/login').send({ correo: USUARIOS.ciudadano, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.text).not.toMatch(/password_hash/);
    const carga = jwt.verify(login.body.token, JWT_SECRET);
    expect(carga.id_usuario).toBe(ciudadana.id_usuario);
    expect(carga.id_usuario).toBe(login.body.usuario.id_usuario);
    expect(carga).not.toHaveProperty('password_hash');

    const registro = await api().post('/api/auth/registro').send({
      nombre_completo: 'Prueba registro', correo: CORREO_PRUEBA('registro.respuesta'), password: 'clave123',
    });
    expect(registro.status).toBe(201);
    expect(registro.text).not.toMatch(/password_hash|clave123/);
    sinToken(registro);

    const recuperar = await api().post('/api/auth/recuperar').send({ correo: USUARIOS.admin });
    expect(recuperar.status).toBe(200);
    sinToken(recuperar);
    expect(recuperar.body).not.toHaveProperty('token_recuperacion');
  });

  test('CP-103 Reportería: sin password_hash, correos ni tokens', async () => {
    const res = await api().get('/api/estadisticas/reportes').set(await bearer(USUARIOS.admin));
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/password_hash|@/);
    sinDatosDeLaCiudadana(res);
    sinToken(res);
  });
});

describe('Errores sin detalles internos (NODE_ENV=production)', () => {
  test('CP-104 Errores 400, 401, 403 y 404: solo { error } en JSON, sin SQL, stack ni nombres de tablas o columnas', async () => {
    const vencido = jwt.sign({ id_usuario: 1, rol: 'administrador', exp: Math.floor(Date.now() / 1000) - 60 }, JWT_SECRET);
    const casos = [
      [400, () => api().post('/api/auth/registro').send({ nombre_completo: 'x', correo: 'sin-formato', password: 'clave123' })],
      [400, () => api().post('/api/reportes').send({ id_tipo_incidencia: 'abc', latitud: 14.6, longitud: -90.5 })],
      [400, async () => api().get('/api/estadisticas/reportes').query({ fecha_inicio: "2026-01-01' OR 1=1 --" }).set(await bearer(USUARIOS.admin))],
      [401, () => api().get('/api/reportes/mis-reportes')],
      [401, () => api().get('/api/admin/usuarios').set('Authorization', `Bearer ${vencido}`)],
      [401, () => api().post('/api/auth/login').send({ correo: USUARIOS.admin, password: 'incorrecta' })],
      [403, async () => api().get('/api/admin/usuarios').set(await bearer(USUARIOS.ciudadano))],
      [404, () => api().get('/api/reportes/consulta/ER-0000-0000')],
      [404, () => api().get('/api/no-existe')],
      [404, async () => api().get('/api/reportes/99999999/detalle').set(await bearer(USUARIOS.admin))],
    ];
    for (const [status, peticion] of casos) {
      const res = await peticion();
      expect(res.status).toBe(status);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(Object.keys(res.body)).toEqual(['error']);
      expect(typeof res.body.error).toBe('string');
      sinRastrosInternos(res);
    }
  });

  test('CP-105 Cuerpo JSON mal formado o demasiado grande: error en JSON, sin stack, en producción y fuera de ella', async () => {
    const entornoExpress = app.get('env');
    try {
      for (const entorno of ['production', 'development']) {
        app.set('env', entorno);
        process.env.NODE_ENV = entorno;

        const malFormado = await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{"correo": "a@b.c",');
        expect({ entorno, status: malFormado.status }).toEqual({ entorno, status: 400 });
        expect(malFormado.headers['content-type']).toMatch(/application\/json/);
        expect(Object.keys(malFormado.body)).toEqual(['error']);
        sinRastrosInternos(malFormado);

        const enorme = await api().post('/api/reportes').set('Content-Type', 'application/json')
          .send(JSON.stringify({ descripcion: 'x'.repeat(31 * 1024 * 1024) }));
        expect({ entorno, status: enorme.status }).toEqual({ entorno, status: 413 });
        expect(enorme.headers['content-type']).toMatch(/application\/json/);
        expect(Object.keys(enorme.body)).toEqual(['error']);
        sinRastrosInternos(enorme);
      }
    } finally {
      app.set('env', entornoExpress);
    }
  });
});
