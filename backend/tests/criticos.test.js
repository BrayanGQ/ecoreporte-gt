// Pruebas de integración complementarias sobre los módulos críticos (apartado 1.4 del PAQ):
//   - Autenticación y control de acceso por roles  (authController.js, middleware/auth.js)
//   - Registro de reportes y detección de municipalidad (reporteController.js, utils/ubicacion.js)
// Diseñadas a partir de la primera medición de cobertura (M-01), para cubrir las ramas que la
// suite original no ejercitaba: validaciones de entrada, recuperación de contraseña en desarrollo,
// listado con alcance por rol, detalle, asignables y validaciones del flujo de estados.
const jwt = require('jsonwebtoken');
const {
  api, bearer, puntos, crearReporte, estadoDe, uno, idUsuario, USUARIOS, PASSWORD, FOTO, CORREO_PRUEBA, MARCA,
} = require('./helpers');

let P;
let idCuadrillaA;
let idCuadrillaB;

const accion = async (idReporte, nombre, correo, cuerpo = {}) =>
  api().post(`/api/reportes/${idReporte}/${nombre}`).set(await bearer(correo)).send(cuerpo);

beforeAll(async () => {
  P = await puntos();
  idCuadrillaA = await idUsuario(USUARIOS.cuadrillaA);
  idCuadrillaB = await idUsuario(USUARIOS.cuadrillaB);
});

// ------------------------------------------------------------------ Autenticación
describe('Autenticación: validaciones y recuperación', () => {
  test('CP-55 Registro con campos faltantes, contraseña corta o correo duplicado es rechazado', async () => {
    const registro = (cuerpo) => api().post('/api/auth/registro').send(cuerpo);

    const faltan = await registro({ correo: CORREO_PRUEBA('faltan'), password: 'clave123' });
    expect(faltan.status).toBe(400);
    expect(faltan.body.error).toBe('Todos los campos son obligatorios.');

    const corta = await registro({ nombre_completo: 'Prueba', correo: CORREO_PRUEBA('corta'), password: '123' });
    expect(corta.status).toBe(400);
    expect(corta.body.error).toBe('La contraseña debe tener al menos 6 caracteres.');

    const duplicado = await registro({ nombre_completo: 'Prueba', correo: USUARIOS.ciudadano, password: 'clave123' });
    expect(duplicado.status).toBe(409);
    expect(duplicado.body.error).toBe('El correo ya está registrado.');
  });

  test('CP-56 Login sin datos o con un correo no registrado es rechazado sin revelar cuál falló', async () => {
    const sinDatos = await api().post('/api/auth/login').send({ correo: USUARIOS.admin });
    expect(sinDatos.status).toBe(400);
    expect(sinDatos.body.error).toBe('Correo y contraseña son obligatorios.');

    const noExiste = await api().post('/api/auth/login').send({ correo: 'no.existe@prueba.test', password: PASSWORD });
    expect(noExiste.status).toBe(401);
    expect(noExiste.body.error).toBe('Correo o contraseña incorrectos.');
    expect(noExiste.body).not.toHaveProperty('token');
  });

  test('CP-57 Recuperación en desarrollo: correo obligatorio, respuesta genérica y restablecimiento con el token', async () => {
    const recuperar = (correo) => api().post('/api/auth/recuperar').send({ correo });

    const sinCorreo = await recuperar(undefined);
    expect(sinCorreo.status).toBe(400);

    const noExiste = await recuperar('no.existe@prueba.test');
    expect(noExiste.status).toBe(200);
    expect(noExiste.body).not.toHaveProperty('token_recuperacion');

    const correo = CORREO_PRUEBA('recuperar');
    await api().post('/api/auth/registro').send({ nombre_completo: 'Prueba recuperación', correo, password: 'clave123' });
    const existe = await recuperar(correo);
    expect(existe.status).toBe(200);
    expect(existe.body.mensaje).toBe(noExiste.body.mensaje); // misma respuesta exista o no
    expect(typeof existe.body.token_recuperacion).toBe('string');

    const restablecer = await api().post('/api/auth/restablecer')
      .send({ token: existe.body.token_recuperacion, nueva_password: 'nueva456' });
    expect(restablecer.status).toBe(200);

    expect((await api().post('/api/auth/login').send({ correo, password: 'nueva456' })).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ correo, password: 'clave123' })).status).toBe(401);
  });

  test('CP-58 Restablecer rechaza datos incompletos, contraseña corta, token inválido y token de sesión', async () => {
    const restablecer = (cuerpo) => api().post('/api/auth/restablecer').send(cuerpo);

    expect((await restablecer({ nueva_password: 'nueva456' })).status).toBe(400);
    expect((await restablecer({ token: 'x', nueva_password: '123' })).body.error)
      .toBe('La contraseña debe tener al menos 6 caracteres.');

    const invalido = await restablecer({ token: 'no-es-un-jwt', nueva_password: 'nueva456' });
    expect(invalido.status).toBe(400);
    expect(invalido.body.error).toBe('El enlace de recuperación es inválido o expiró.');

    // Un token de inicio de sesión válido no sirve para restablecer contraseñas.
    const login = await api().post('/api/auth/login').send({ correo: USUARIOS.ciudadano, password: PASSWORD });
    const deSesion = await restablecer({ token: login.body.token, nueva_password: 'nueva456' });
    expect(deSesion.status).toBe(400);
    expect(deSesion.body.error).toBe('Token no válido para esta operación.');
  });

  test('CP-59 Un token firmado con otra clave o vencido es rechazado en las rutas protegidas', async () => {
    const ajeno = jwt.sign({ id_usuario: 1, rol: 'administrador' }, 'otra-clave');
    const r1 = await api().get('/api/admin/usuarios').set('Authorization', `Bearer ${ajeno}`);
    expect(r1.status).toBe(401);

    const { JWT_SECRET } = require('../src/middleware/auth');
    const vencido = jwt.sign({ id_usuario: 1, rol: 'administrador', exp: Math.floor(Date.now() / 1000) - 60 }, JWT_SECRET);
    const r2 = await api().get('/api/admin/usuarios').set('Authorization', `Bearer ${vencido}`);
    expect(r2.status).toBe(401);
    expect(r2.body.error).toBe('Token inválido o expirado.');
  });
});

// ------------------------------------------------------------------ Registro y consulta
describe('Registro de reportes: validación de ubicación y evidencias', () => {
  test('CP-60 Coordenadas no numéricas o fuera de rango: 400 ubicación no válida', async () => {
    for (const [lat, lng] of [['abc', P.guatemala.lng], [95, P.guatemala.lng], [P.guatemala.lat, -200], ['', '']]) {
      const res = await crearReporte({ lat, lng }, { descripcion: 'coordenadas inválidas' });
      expect(res.status).toBe(400);
      expect(['La ubicación indicada no es válida.', 'Tipo de incidencia y ubicación son obligatorios.'])
        .toContain(res.body.error);
    }
  });

  test('CP-61 Reporte con fotografía ciudadana: la evidencia queda registrada como ciudadana', async () => {
    const res = await crearReporte(P.guatemala, { descripcion: 'con foto ciudadana', evidencias: [FOTO, '  '] });
    expect(res.status).toBe(201);
    const ev = await uno(
      `SELECT count(*)::int AS n, min(tipo_evidencia) AS tipo FROM evidencia_fotografica WHERE id_reporte = $1`,
      [res.body.id_reporte]
    );
    expect(ev).toEqual({ n: 1, tipo: 'ciudadana' }); // la cadena vacía se descarta
  });
});

describe('Listado y consulta con alcance por rol', () => {
  let idGuatemala;
  let idMixco;

  beforeAll(async () => {
    idGuatemala = (await crearReporte(P.guatemala, { descripcion: 'listado guatemala' })).body.id_reporte;
    idMixco = (await crearReporte(P.mixco, { descripcion: 'listado mixco' })).body.id_reporte;
    await accion(idGuatemala, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: idCuadrillaA });
  });

  test('CP-62 Listado público sin sesión con filtros por estado, tipo y municipalidad', async () => {
    const todos = await api().get('/api/reportes');
    expect(todos.status).toBe(200);
    const ids = todos.body.map((r) => r.id_reporte);
    expect(ids).toEqual(expect.arrayContaining([idGuatemala, idMixco]));

    const asignados = await api().get('/api/reportes').query({ estado: 'asignado', tipo: 1 });
    expect(asignados.body.every((r) => r.nombre_estado === 'asignado')).toBe(true);
    expect(asignados.body.map((r) => r.id_reporte)).toContain(idGuatemala);

    const muni = await uno('SELECT id_municipalidad FROM reporte WHERE id_reporte = $1', [idMixco]);
    const deMixco = await api().get('/api/reportes').query({ municipalidad: muni.id_municipalidad });
    expect(deMixco.body.every((r) => r.municipalidad === 'Municipalidad de Mixco')).toBe(true);
  });

  test('CP-63 Con sesión, el coordinador solo lista su municipalidad y la cuadrilla solo lo asignado a ella', async () => {
    const coord = await api().get('/api/reportes').set(await bearer(USUARIOS.coordMixco));
    expect(coord.status).toBe(200);
    expect(coord.body.length).toBeGreaterThan(0);
    expect(coord.body.every((r) => r.municipalidad === 'Municipalidad de Mixco')).toBe(true);

    const cuadrillaA = await api().get('/api/reportes').set(await bearer(USUARIOS.cuadrillaA));
    expect(cuadrillaA.body.map((r) => r.id_reporte)).toContain(idGuatemala);
    const cuadrillaB = await api().get('/api/reportes').set(await bearer(USUARIOS.cuadrillaB));
    expect(cuadrillaB.body.map((r) => r.id_reporte)).not.toContain(idGuatemala);
  });

  test('CP-64 Detalle: 404 si no existe, completo para el admin y 403 para una cuadrilla ajena', async () => {
    const noExiste = await api().get('/api/reportes/99999999/detalle').set(await bearer(USUARIOS.admin));
    expect(noExiste.status).toBe(404);

    const admin = await api().get(`/api/reportes/${idGuatemala}/detalle`).set(await bearer(USUARIOS.admin));
    expect(admin.status).toBe(200);
    expect(admin.body).toHaveProperty('historial');
    expect(admin.body).toHaveProperty('evidencias');
    expect(admin.body.asignado_a).toBeTruthy();

    const ajena = await api().get(`/api/reportes/${idGuatemala}/detalle`).set(await bearer(USUARIOS.cuadrillaB));
    expect(ajena.status).toBe(403);
  });

  test('CP-65 Asignables: solo encargados de la municipalidad del reporte y sin acceso a reportes ajenos', async () => {
    const propios = await api().get(`/api/reportes/${idGuatemala}/asignables`).set(await bearer(USUARIOS.coordGuatemala));
    expect(propios.status).toBe(200);
    expect(propios.body.map((u) => u.id_usuario)).toEqual(expect.arrayContaining([idCuadrillaA, idCuadrillaB]));

    const ajeno = await api().get(`/api/reportes/${idGuatemala}/asignables`).set(await bearer(USUARIOS.coordMixco));
    expect(ajeno.status).toBe(403);

    const noExiste = await api().get('/api/reportes/99999999/asignables').set(await bearer(USUARIOS.admin));
    expect(noExiste.status).toBe(404);
  });

  test('CP-66 Mis reportes: el ciudadano ve la evidencia municipal de sus reportes resueltos', async () => {
    const res = await api().post('/api/reportes').set(await bearer(USUARIOS.ciudadano)).send({
      id_tipo_incidencia: 1, latitud: P.guatemala.lat, longitud: P.guatemala.lng,
      descripcion: `${MARCA} mis reportes resuelto`,
    });
    const id = res.body.id_reporte;
    await accion(id, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: idCuadrillaA });
    await accion(id, 'iniciar', USUARIOS.cuadrillaA);
    await accion(id, 'resolver', USUARIOS.cuadrillaA, { evidencias: [FOTO] });

    const mios = await api().get('/api/reportes/mis-reportes').set(await bearer(USUARIOS.ciudadano));
    expect(mios.status).toBe(200);
    const este = mios.body.find((r) => r.id_reporte === id);
    expect(este.nombre_estado).toBe('resuelto');
    expect(este.evidencias_municipales).toHaveLength(1);
  });
});

// ------------------------------------------------------------------ Validaciones del flujo
describe('Flujo de estados: validaciones de entrada', () => {
  test('CP-67 Acción sobre un identificador no numérico o inexistente: 404', async () => {
    expect((await accion('abc', 'iniciar', USUARIOS.cuadrillaA)).status).toBe(404);
    expect((await accion(99999999, 'iniciar', USUARIOS.cuadrillaA)).status).toBe(404);
  });

  test('CP-68 Asignar: encargado inválido, de otra municipalidad o el mismo ya asignado es rechazado; reasignar a otro funciona', async () => {
    const id = (await crearReporte(P.guatemala, { descripcion: 'reasignación' })).body.id_reporte;

    const sinEncargado = await accion(id, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: 'x' });
    expect(sinEncargado.status).toBe(400);

    const deMixco = await accion(id, 'asignar', USUARIOS.coordGuatemala,
      { id_usuario_asignado: await idUsuario('luis.ramirez@ecoreporte.gt') });
    expect(deMixco.status).toBe(400);

    expect((await accion(id, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: idCuadrillaA })).status).toBe(200);
    const mismo = await accion(id, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: idCuadrillaA });
    expect(mismo.status).toBe(400);

    const reasignar = await accion(id, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: idCuadrillaB });
    expect(reasignar.status).toBe(200);
    const r = await uno('SELECT id_usuario_asignado FROM reporte WHERE id_reporte = $1', [id]);
    expect(r.id_usuario_asignado).toBe(idCuadrillaB);
    const h = await uno(
      'SELECT comentario FROM historial_estado WHERE id_reporte = $1 ORDER BY id_historial DESC LIMIT 1', [id]
    );
    expect(h.comentario).toMatch(/^Reasignado de /);
    expect(await estadoDe(id)).toBe('asignado');
  });

  test('CP-69 Descartar: motivo no textual o de más de 300 caracteres es rechazado', async () => {
    const id = (await crearReporte(P.guatemala, { descripcion: 'descarte inválido' })).body.id_reporte;

    expect((await accion(id, 'descartar', USUARIOS.coordGuatemala, { motivo: 123 })).status).toBe(400);
    const largo = await accion(id, 'descartar', USUARIOS.coordGuatemala, { motivo: 'x'.repeat(301) });
    expect(largo.status).toBe(400);
    expect(await estadoDe(id)).toBe('recibido');
  });

  test('CP-70 Resolver: evidencias que no son arreglo, más de cinco o con formato inválido son rechazadas', async () => {
    const id = (await crearReporte(P.guatemala, { descripcion: 'evidencias inválidas' })).body.id_reporte;
    await accion(id, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: idCuadrillaA });
    await accion(id, 'iniciar', USUARIOS.cuadrillaA);

    const casos = [FOTO, Array(6).fill(FOTO), ['no-es-imagen']];
    for (const evidencias of casos) {
      const res = await accion(id, 'resolver', USUARIOS.cuadrillaA, { evidencias });
      expect(res.status).toBe(400);
    }
    expect(await estadoDe(id)).toBe('en_atencion');
  });
});
