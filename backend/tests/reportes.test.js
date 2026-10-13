// Pruebas de integración: registro ciudadano de reportes y consulta pública por código.
const {
  api, puntos, crearReporte, uno, idMunicipalidad, FOTO, SIN_COBERTURA,
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
