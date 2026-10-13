// Pruebas de integración: registro ciudadano de reportes y consulta pública por código.
const {
  api, bearer, puntos, crearReporte, uno, idUsuario, idMunicipalidad, USUARIOS, MARCA, FOTO, SIN_COBERTURA,
} = require('./helpers');

let P; // puntos de prueba (PostGIS)

beforeAll(async () => {
  P = await puntos();
});

describe('Registro de reportes', () => {
  test('CP-05 Crear reporte en zona cubierta: 201, código de seguimiento y municipalidad detectada por PostGIS', async () => {
    const res = await crearReporte(P.guatemala, { descripcion: 'zona cubierta' });

    expect(res.status).toBe(201);
    expect(res.body.codigo_seguimiento).toMatch(/^ER-\d{4}-\d{4,}$/);
    expect(res.body.municipalidad.nombre).toBe('Municipalidad de Guatemala');

    const enBd = await uno(
      `SELECT r.id_municipalidad, e.nombre_estado, r.codigo_seguimiento
       FROM reporte r JOIN estado_reporte e ON e.id_estado = r.id_estado_actual WHERE r.id_reporte = $1`,
      [res.body.id_reporte]
    );
    expect(enBd.id_municipalidad).toBe(await idMunicipalidad('Municipalidad de Guatemala'));
    expect(enBd.nombre_estado).toBe('recibido');
    expect(enBd.codigo_seguimiento).toBe(res.body.codigo_seguimiento);
  });

  test('CP-06 La municipalidad enviada por el cliente se ignora', async () => {
    const idMixco = await idMunicipalidad('Municipalidad de Mixco');
    const res = await crearReporte(P.guatemala, { id_municipalidad: idMixco, descripcion: 'cliente manda otra muni' });

    expect(res.status).toBe(201);
    expect(res.body.municipalidad.nombre).toBe('Municipalidad de Guatemala');
  });

  test('CP-07 Crear reporte fuera de cobertura: 400 con el mensaje de zona no cubierta', async () => {
    const res = await crearReporte(P.fuera, { descripcion: 'fuera de cobertura' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(SIN_COBERTURA);
  });

  test('CP-08 Crear reporte en un municipio inactivo: 400 con el mensaje de zona no cubierta', async () => {
    const res = await crearReporte(P.inactivo, { descripcion: `municipio inactivo (${P.inactivo.nombre})` });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(SIN_COBERTURA);
  });

  test('CP-09 Crear reporte sin tipo de incidencia: 400', async () => {
    const res = await crearReporte(P.guatemala, { id_tipo_incidencia: undefined, descripcion: 'sin tipo' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Tipo de incidencia y ubicación son obligatorios.');
  });

  test('CP-10 Crear reporte sin ubicación: 400', async () => {
    const res = await crearReporte(P.guatemala, { latitud: undefined, longitud: undefined, descripcion: 'sin ubicación' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Tipo de incidencia y ubicación son obligatorios.');
  });

  test('CP-11 Crear reporte con más de 5 fotografías: 400', async () => {
    const res = await crearReporte(P.guatemala, { evidencias: Array(6).fill(FOTO), descripcion: '6 fotos' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Se permiten como máximo 5 fotografías por reporte.');
  });
});

describe('Consulta pública por código', () => {
  test('CP-12 Consulta de un código existente: 200 con estado e historial', async () => {
    const creado = await crearReporte(P.guatemala, { descripcion: 'para consultar' });
    const res = await api().get(`/api/reportes/consulta/${creado.body.codigo_seguimiento}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      codigo_seguimiento: creado.body.codigo_seguimiento,
      nombre_estado: 'recibido',
      municipalidad: 'Municipalidad de Guatemala',
    });
    expect(res.body.historial.map((h) => h.nombre_estado)).toEqual(['recibido']);
  });

  test('CP-13 Consulta de un código inexistente: 404', async () => {
    const res = await api().get('/api/reportes/consulta/ER-1999-9999');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No se encontró un reporte con ese código.');
  });
});

describe('Autor del reporte (D-01)', () => {
  const autorDe = async (idReporte) =>
    (await uno('SELECT id_usuario_reporta FROM reporte WHERE id_reporte = $1', [idReporte])).id_usuario_reporta;

  test('CP-36 Sin sesión, enviar id_usuario_reporta de otro usuario no lo asocia: el reporte queda anónimo', async () => {
    const idOtro = await idUsuario(USUARIOS.ciudadano);
    const res = await crearReporte(P.guatemala, { id_usuario_reporta: idOtro, descripcion: 'suplantación sin sesión' });

    expect(res.status).toBe(201);
    expect(await autorDe(res.body.id_reporte)).toBeNull();
  });

  test('CP-37 Con sesión de ciudadano, enviar otro id en el cuerpo no cambia el autor: queda el del token', async () => {
    const idCiudadano = await idUsuario(USUARIOS.ciudadano);
    const idOtro = await idUsuario('juan.rodriguez@ecoreporte.gt');
    const res = await api().post('/api/reportes').set(await bearer(USUARIOS.ciudadano)).send({
      id_tipo_incidencia: 1,
      latitud: P.guatemala.lat,
      longitud: P.guatemala.lng,
      descripcion: `${MARCA} suplantación con sesión`,
      id_usuario_reporta: idOtro,
      evidencias: [FOTO],
    });

    expect(res.status).toBe(201);
    expect(await autorDe(res.body.id_reporte)).toBe(idCiudadano);

    // La foto del ciudadano también queda a su nombre.
    const evidencia = await uno(
      'SELECT id_usuario, tipo_evidencia FROM evidencia_fotografica WHERE id_reporte = $1', [res.body.id_reporte]
    );
    expect(evidencia).toEqual({ id_usuario: idCiudadano, tipo_evidencia: 'ciudadana' });

    // Y aparece en "Mis reportes" del ciudadano del token, no en los del otro.
    const mios = await api().get('/api/reportes/mis-reportes').set(await bearer(USUARIOS.ciudadano));
    expect(mios.body.map((r) => r.id_reporte)).toContain(res.body.id_reporte);
    const ajenos = await api().get('/api/reportes/mis-reportes').set(await bearer('juan.rodriguez@ecoreporte.gt'));
    expect(ajenos.body.map((r) => r.id_reporte)).not.toContain(res.body.id_reporte);
  });
});
