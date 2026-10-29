// Pruebas de integración: reportería del módulo de Estadísticas (GET /api/estadisticas/reportes).
// Mismo alcance por rol y filtros que las demás estadísticas; sin datos personales del ciudadano.
const {
  api, bearer, puntos, crearReporte, query, idUsuario, idMunicipalidad, USUARIOS, FOTO,
} = require('./helpers');

const RUTA = '/api/estadisticas/reportes';
const CAMPOS = [
  'codigo_seguimiento', 'fecha_reporte', 'nombre_tipo', 'nombre_estado', 'municipalidad',
  'latitud', 'longitud', 'encargado_asignado', 'fecha_asignacion', 'fecha_resolucion',
].sort();

let P;
const listado = async (correo, filtros = {}) => api().get(RUTA).query(filtros).set(await bearer(correo));
const codigosEnBd = async (where, params) => (await query(
  `SELECT r.codigo_seguimiento FROM reporte r JOIN municipalidad m ON m.id_municipalidad = r.id_municipalidad
   WHERE ${where} ORDER BY r.fecha_reporte DESC, r.id_reporte DESC`, params
)).rows.map((r) => r.codigo_seguimiento);
const accion = async (id, nombre, correo, cuerpo = {}) =>
  api().post(`/api/reportes/${id}/${nombre}`).set(await bearer(correo)).send(cuerpo);

beforeAll(async () => {
  P = await puntos();
});

describe('Reportería: listado de reportes de Estadísticas', () => {
  test('CP-81 El coordinador solo ve los reportes de su municipalidad, ordenados del más reciente al más antiguo', async () => {
    const res = await listado(USUARIOS.coordGuatemala);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((r) => r.municipalidad === 'Municipalidad de Guatemala')).toBe(true);
    expect(res.body.map((r) => r.codigo_seguimiento))
      .toEqual(await codigosEnBd("m.nombre = 'Municipalidad de Guatemala'"));

    // Aunque mande id_municipalidad de otra, el coordinador sigue limitado a la suya.
    const otra = await listado(USUARIOS.coordGuatemala, { id_municipalidad: await idMunicipalidad('Municipalidad de Mixco') });
    expect(otra.body.every((r) => r.municipalidad === 'Municipalidad de Guatemala')).toBe(true);
  });

  test('CP-82 El administrador ve todas las municipalidades y puede filtrar por una', async () => {
    const todas = await listado(USUARIOS.admin);
    expect(todas.status).toBe(200);
    expect(todas.body.map((r) => r.codigo_seguimiento)).toEqual(await codigosEnBd('TRUE'));

    const idMixco = await idMunicipalidad('Municipalidad de Mixco');
    const mixco = await listado(USUARIOS.admin, { id_municipalidad: idMixco });
    expect(mixco.status).toBe(200);
    expect(mixco.body.length).toBeGreaterThan(0);
    expect(mixco.body.map((r) => r.codigo_seguimiento)).toEqual(await codigosEnBd('r.id_municipalidad = $1', [idMixco]));
  });

  test('CP-83 El filtro de fechas incluye ambos extremos y coincide con la base', async () => {
    const extremos = (await query(
      "SELECT to_char(min(fecha_reporte), 'YYYY-MM-DD') AS primero, to_char(max(fecha_reporte), 'YYYY-MM-DD') AS ultimo FROM reporte"
    )).rows[0];
    // Un día con reportes: el del reporte más antiguo.
    const dia = await listado(USUARIOS.admin, { fecha_inicio: extremos.primero, fecha_fin: extremos.primero });
    expect(dia.status).toBe(200);
    expect(dia.body.length).toBeGreaterThan(0);
    expect(dia.body.map((r) => r.codigo_seguimiento)).toEqual(
      await codigosEnBd('r.fecha_reporte >= $1::date AND r.fecha_reporte < ($1::date + 1)', [extremos.primero])
    );

    const desde = await listado(USUARIOS.admin, { fecha_inicio: extremos.ultimo });
    expect(desde.body.map((r) => r.codigo_seguimiento)).toEqual(await codigosEnBd('r.fecha_reporte >= $1::date', [extremos.ultimo]));

    const antes = await listado(USUARIOS.admin, { fecha_fin: '2000-01-01' });
    expect(antes.body).toEqual([]);
  });

  test('CP-84 Un ciudadano y un encargado de cuadrilla reciben 403; sin sesión, 401', async () => {
    expect((await listado(USUARIOS.ciudadano)).status).toBe(403);
    expect((await listado(USUARIOS.cuadrillaA)).status).toBe(403);
    expect((await api().get(RUTA)).status).toBe(401);
  });

  test('CP-85 Una fecha inválida devuelve 400', async () => {
    const casos = [
      [{ fecha_inicio: '29/10/2026' }, 'fecha_inicio debe tener el formato YYYY-MM-DD.'],
      [{ fecha_fin: '2026-02-30' }, 'fecha_fin debe tener el formato YYYY-MM-DD.'],
      [{ fecha_inicio: '2026-10-20', fecha_fin: '2026-10-01' }, 'fecha_inicio no puede ser posterior a fecha_fin.'],
    ];
    for (const [filtros, mensaje] of casos) {
      const res = await listado(USUARIOS.admin, filtros);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(mensaje);
    }
  });

  test('CP-86 La respuesta trae solo los campos del reporte, sin datos personales del ciudadano', async () => {
    // Reporte de una ciudadana con sesión, llevado hasta resuelto.
    const creado = await api().post('/api/reportes').set(await bearer(USUARIOS.ciudadano)).send({
      id_tipo_incidencia: 1, latitud: P.guatemala.lat, longitud: P.guatemala.lng,
      descripcion: '[PRUEBA AUTOMATIZADA] reportería sin datos personales',
    });
    const id = creado.body.id_reporte;
    const idCuadrilla = await idUsuario(USUARIOS.cuadrillaA);
    await accion(id, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: idCuadrilla });
    await accion(id, 'iniciar', USUARIOS.cuadrillaA);
    await accion(id, 'resolver', USUARIOS.cuadrillaA, { evidencias: [FOTO] });
    const recibido = (await crearReporte(P.guatemala, { descripcion: 'reportería recibido' })).body;

    const res = await listado(USUARIOS.admin);
    expect(res.status).toBe(200);
    for (const fila of res.body) expect(Object.keys(fila).sort()).toEqual(CAMPOS);

    const ciudadana = (await query('SELECT nombre_completo, correo FROM usuario WHERE correo = $1', [USUARIOS.ciudadano])).rows[0];
    const texto = JSON.stringify(res.body);
    expect(texto).not.toContain(ciudadana.correo);
    expect(texto).not.toContain(ciudadana.nombre_completo);
    expect(texto).not.toContain('reportería sin datos personales');

    const resuelto = res.body.find((r) => r.codigo_seguimiento === creado.body.codigo_seguimiento);
    expect(resuelto.nombre_estado).toBe('resuelto');
    expect(resuelto.encargado_asignado).toBe('Carlos Enrique Pérez');
    expect(resuelto.fecha_resolucion).not.toBeNull();
    expect(typeof resuelto.latitud).toBe('number');

    const sinAtender = res.body.find((r) => r.codigo_seguimiento === recibido.codigo_seguimiento);
    expect(sinAtender.encargado_asignado).toBeNull();
    expect(sinAtender.fecha_resolucion).toBeNull();
  });

  test('CP-116 fecha_asignacion: primera asignación del historial en un reporte asignado y null en uno recibido, sin datos personales', async () => {
    // Reporte de una ciudadana con sesión: asignado a una cuadrilla y reasignado a otra.
    const creado = await api().post('/api/reportes').set(await bearer(USUARIOS.ciudadano)).send({
      id_tipo_incidencia: 1, latitud: P.guatemala.lat, longitud: P.guatemala.lng,
      descripcion: '[PRUEBA AUTOMATIZADA] reportería fecha de asignación',
    });
    const id = creado.body.id_reporte;
    expect((await accion(id, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: await idUsuario(USUARIOS.cuadrillaA) })).status).toBe(200);
    expect((await accion(id, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: await idUsuario(USUARIOS.cuadrillaB) })).status).toBe(200);
    const recibido = (await crearReporte(P.guatemala, { descripcion: 'reportería sin asignar' })).body;

    const res = await listado(USUARIOS.coordGuatemala);
    expect(res.status).toBe(200);
    for (const fila of res.body) expect(Object.keys(fila).sort()).toEqual(CAMPOS);

    // La primera vez que pasó a 'asignado', según historial_estado.
    const primera = (await query(
      `SELECT MIN(h.fecha_cambio) AS fecha FROM historial_estado h
       JOIN estado_reporte e ON e.id_estado = h.id_estado
       WHERE h.id_reporte = $1 AND e.nombre_estado = 'asignado'`, [id]
    )).rows[0].fecha;
    expect(primera).not.toBeNull();
    const asignado = res.body.find((r) => r.codigo_seguimiento === creado.body.codigo_seguimiento);
    expect(asignado.nombre_estado).toBe('asignado');
    expect(new Date(asignado.fecha_asignacion).getTime()).toBe(new Date(primera).getTime());

    const sinAsignar = res.body.find((r) => r.codigo_seguimiento === recibido.codigo_seguimiento);
    expect(sinAsignar.nombre_estado).toBe('recibido');
    expect(sinAsignar.fecha_asignacion).toBeNull();

    const ciudadana = (await query('SELECT nombre_completo, correo FROM usuario WHERE correo = $1', [USUARIOS.ciudadano])).rows[0];
    const texto = JSON.stringify(res.body);
    expect(texto).not.toContain(ciudadana.correo);
    expect(texto).not.toContain(ciudadana.nombre_completo);
    expect(texto).not.toContain('reportería fecha de asignación');
  });
});
