// Pruebas de integración: permisos por rol y alcance por municipalidad.
const {
  api, bearer, puntos, crearReporte, estadoDe, uno, idUsuario, idMunicipalidad,
  USUARIOS, FOTO,
} = require('./helpers');

let P;
let idCuadrillaA;
let idRecibido;      // reporte de Guatemala en estado recibido
let idEnAtencion;    // reporte de Guatemala en atención, asignado a la cuadrilla A

const accion = async (idReporte, nombre, correo, cuerpo = {}) =>
  api().post(`/api/reportes/${idReporte}/${nombre}`).set(await bearer(correo)).send(cuerpo);

beforeAll(async () => {
  P = await puntos();
  idCuadrillaA = await idUsuario(USUARIOS.cuadrillaA);

  idRecibido = (await crearReporte(P.guatemala, { descripcion: 'permisos (recibido)' })).body.id_reporte;

  idEnAtencion = (await crearReporte(P.guatemala, { descripcion: 'permisos (en atención)' })).body.id_reporte;
  await accion(idEnAtencion, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: idCuadrillaA });
  await accion(idEnAtencion, 'iniciar', USUARIOS.cuadrillaA);
  expect(await estadoDe(idEnAtencion)).toBe('en_atencion');
});

describe('Permisos por rol', () => {
  test('CP-24 El ciudadano no puede asignar, descartar, iniciar ni resolver', async () => {
    const intentos = [
      await accion(idRecibido, 'asignar', USUARIOS.ciudadano, { id_usuario_asignado: idCuadrillaA }),
      await accion(idRecibido, 'descartar', USUARIOS.ciudadano, { motivo: 'no me gusta' }),
      await accion(idEnAtencion, 'iniciar', USUARIOS.ciudadano),
      await accion(idEnAtencion, 'resolver', USUARIOS.ciudadano, { evidencias: [FOTO] }),
    ];
    for (const res of intentos) expect(res.status).toBe(403);
    expect(await estadoDe(idRecibido)).toBe('recibido');
    expect(await estadoDe(idEnAtencion)).toBe('en_atencion');
  });

  test('CP-25 El coordinador de Mixco no puede asignar un reporte de Guatemala', async () => {
    const idCuadrillaMixco = await idUsuario('luis.ramirez@ecoreporte.gt');
    const res = await accion(idRecibido, 'asignar', USUARIOS.coordMixco, { id_usuario_asignado: idCuadrillaMixco });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('No tenés acceso a este reporte.');
    expect(await estadoDe(idRecibido)).toBe('recibido');
  });

  test('CP-26 El coordinador de Mixco no puede ver el detalle de un reporte de Guatemala', async () => {
    const res = await api().get(`/api/reportes/${idRecibido}/detalle`).set(await bearer(USUARIOS.coordMixco));

    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('descripcion');
  });

  test('CP-27 Una cuadrilla no puede iniciar un reporte asignado a otra', async () => {
    // Se usa un reporte recién asignado a la cuadrilla A (estado asignado).
    const id = (await crearReporte(P.guatemala, { descripcion: 'permisos (asignado a A)' })).body.id_reporte;
    await accion(id, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: idCuadrillaA });

    const res = await accion(id, 'iniciar', USUARIOS.cuadrillaB);
    expect(res.status).toBe(403);
    expect(await estadoDe(id)).toBe('asignado');
  });

  test('CP-28 Una cuadrilla no puede resolver un reporte asignado a otra', async () => {
    const res = await accion(idEnAtencion, 'resolver', USUARIOS.cuadrillaB, { evidencias: [FOTO] });

    expect(res.status).toBe(403);
    expect(await estadoDe(idEnAtencion)).toBe('en_atencion');
  });

  test('CP-29 El administrador no puede asignar reportes', async () => {
    const res = await accion(idRecibido, 'asignar', USUARIOS.admin, { id_usuario_asignado: idCuadrillaA });

    expect(res.status).toBe(403);
    expect(await estadoDe(idRecibido)).toBe('recibido');
  });

  test('CP-30 El administrador no puede resolver reportes', async () => {
    const res = await accion(idEnAtencion, 'resolver', USUARIOS.admin, { evidencias: [FOTO] });

    expect(res.status).toBe(403);
    expect(await estadoDe(idEnAtencion)).toBe('en_atencion');
  });
});

describe('Alcance de las estadísticas', () => {
  test('CP-31 Las estadísticas del coordinador solo cuentan reportes de su municipalidad', async () => {
    const contar = async (nombreMuni) => (await uno(
      'SELECT count(*)::int AS n FROM reporte WHERE id_municipalidad = $1', [await idMunicipalidad(nombreMuni)]
    )).n;
    const total = (await uno('SELECT count(*)::int AS n FROM reporte')).n;

    const guatemala = await api().get('/api/estadisticas/resumen').set(await bearer(USUARIOS.coordGuatemala));
    const mixco = await api().get('/api/estadisticas/resumen').set(await bearer(USUARIOS.coordMixco));
    // Aunque pida otra municipalidad, el coordinador sigue viendo solo la suya.
    const mixcoPideGuatemala = await api()
      .get(`/api/estadisticas/resumen?id_municipalidad=${await idMunicipalidad('Municipalidad de Guatemala')}`)
      .set(await bearer(USUARIOS.coordMixco));
    const admin = await api().get('/api/estadisticas/resumen').set(await bearer(USUARIOS.admin));

    expect(guatemala.status).toBe(200);
    expect(guatemala.body.total).toBe(await contar('Municipalidad de Guatemala'));
    expect(mixco.body.total).toBe(await contar('Municipalidad de Mixco'));
    expect(mixcoPideGuatemala.body.total).toBe(await contar('Municipalidad de Mixco'));
    expect(admin.body.total).toBe(total);
    expect(guatemala.body.total).toBeLessThan(total);
  });
});
