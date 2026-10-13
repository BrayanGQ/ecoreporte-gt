// Pruebas de integración: flujo completo de estados de un reporte.
//   recibido -> asignado (coordinador) -> en_atencion (cuadrilla) -> resuelto (cuadrilla, con fotos)
//   recibido -> descartado (coordinador, con motivo)
// Las pruebas de cada `describe` se ejecutan en orden y comparten el reporte creado.
const {
  api, bearer, puntos, crearReporte, estadoDe, uno, query, idUsuario, USUARIOS, FOTO,
} = require('./helpers');

let P;
let idCuadrillaA;

beforeAll(async () => {
  P = await puntos();
  idCuadrillaA = await idUsuario(USUARIOS.cuadrillaA);
});

const accion = async (idReporte, nombre, correo, cuerpo = {}) =>
  api().post(`/api/reportes/${idReporte}/${nombre}`).set(await bearer(correo)).send(cuerpo);

const historial = async (idReporte) => (await query(
  `SELECT e.nombre_estado, u.correo AS responsable, h.comentario
   FROM historial_estado h
   JOIN estado_reporte e ON e.id_estado = h.id_estado
   LEFT JOIN usuario u ON u.id_usuario = h.id_usuario_responsable
   WHERE h.id_reporte = $1 ORDER BY h.id_historial`, [idReporte]
)).rows;

// Reporte nuevo en Guatemala; con `hasta` lo lleva por el flujo hasta ese estado.
async function reporteEn(hasta = 'recibido') {
  const creado = await crearReporte(P.guatemala, { descripcion: `flujo hasta ${hasta}` });
  const id = creado.body.id_reporte;
  if (['asignado', 'en_atencion', 'resuelto'].includes(hasta)) {
    await accion(id, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: idCuadrillaA });
  }
  if (['en_atencion', 'resuelto'].includes(hasta)) await accion(id, 'iniciar', USUARIOS.cuadrillaA);
  if (hasta === 'resuelto') await accion(id, 'resolver', USUARIOS.cuadrillaA, { evidencias: [FOTO] });
  expect(await estadoDe(id)).toBe(hasta);
  return id;
}

describe('Flujo completo: recibido → asignado → en atención → resuelto', () => {
  let id;

  test('CP-14 El coordinador asigna un reporte recibido a una cuadrilla de su municipalidad', async () => {
    id = await reporteEn('recibido');
    const res = await accion(id, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: idCuadrillaA });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('asignado');
    const r = await uno('SELECT id_usuario_asignado FROM reporte WHERE id_reporte = $1', [id]);
    expect(r.id_usuario_asignado).toBe(idCuadrillaA);
  });

  test('CP-15 La cuadrilla asignada inicia la atención', async () => {
    const res = await accion(id, 'iniciar', USUARIOS.cuadrillaA, { comentario: 'Cuadrilla en el lugar' });

    expect(res.status).toBe(200);
    expect(await estadoDe(id)).toBe('en_atencion');
  });

  test('CP-16 Resolver SIN fotos es rechazado', async () => {
    const sinCampo = await accion(id, 'resolver', USUARIOS.cuadrillaA, { comentario: 'sin fotos' });
    const vacio = await accion(id, 'resolver', USUARIOS.cuadrillaA, { evidencias: [] });

    for (const res of [sinCampo, vacio]) {
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/obligatorio adjuntar al menos una foto/);
    }
    expect(await estadoDe(id)).toBe('en_atencion');
  });

  test('CP-17 Resolver con 1 foto: pasa a resuelto, evidencia municipal e historial completo', async () => {
    const res = await accion(id, 'resolver', USUARIOS.cuadrillaA, {
      comentario: 'Área limpia', evidencias: [FOTO],
    });

    expect(res.status).toBe(200);
    expect(await estadoDe(id)).toBe('resuelto');

    const evidencias = (await query(
      'SELECT tipo_evidencia, id_usuario FROM evidencia_fotografica WHERE id_reporte = $1', [id]
    )).rows;
    expect(evidencias).toEqual([{ tipo_evidencia: 'municipal', id_usuario: idCuadrillaA }]);

    const h = await historial(id);
    expect(h.map((x) => x.nombre_estado)).toEqual(['recibido', 'asignado', 'en_atencion', 'resuelto']);
    expect(h.map((x) => x.responsable)).toEqual([
      null, USUARIOS.coordGuatemala, USUARIOS.cuadrillaA, USUARIOS.cuadrillaA,
    ]);
    expect(h[3].comentario).toBe('Área limpia');

    // El detalle devuelve la evidencia con su tipo.
    const detalle = await api().get(`/api/reportes/${id}/detalle`).set(await bearer(USUARIOS.coordGuatemala));
    expect(detalle.status).toBe(200);
    expect(detalle.body.evidencias.map((e) => e.tipo_evidencia)).toEqual(['municipal']);
  });
});

describe('Descarte', () => {
  let id;

  test('CP-18 Descartar sin motivo es rechazado', async () => {
    id = await reporteEn('recibido');
    const sinMotivo = await accion(id, 'descartar', USUARIOS.coordGuatemala);
    const enBlanco = await accion(id, 'descartar', USUARIOS.coordGuatemala, { motivo: '   ' });

    for (const res of [sinMotivo, enBlanco]) {
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('El motivo del descarte es obligatorio.');
    }
    expect(await estadoDe(id)).toBe('recibido');
  });

  test('CP-19 Descartar con motivo pasa a descartado y registra el motivo', async () => {
    const res = await accion(id, 'descartar', USUARIOS.coordGuatemala, { motivo: 'Reporte duplicado' });

    expect(res.status).toBe(200);
    expect(await estadoDe(id)).toBe('descartado');
    const h = await historial(id);
    expect(h.at(-1)).toEqual({ nombre_estado: 'descartado', responsable: USUARIOS.coordGuatemala, comentario: 'Reporte duplicado' });
  });
});

describe('Transiciones inválidas', () => {
  test('CP-20 Resolver un reporte recibido es rechazado', async () => {
    const id = await reporteEn('recibido');
    // Sin cuadrilla asignada, ninguna cuadrilla tiene acceso al reporte.
    const res = await accion(id, 'resolver', USUARIOS.cuadrillaA, { evidencias: [FOTO] });

    expect(res.status).toBe(403);
    expect(await estadoDe(id)).toBe('recibido');
  });

  test('CP-21 Resolver un reporte asignado sin iniciar la atención es rechazado', async () => {
    const id = await reporteEn('asignado');
    const res = await accion(id, 'resolver', USUARIOS.cuadrillaA, { evidencias: [FOTO] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No se puede resolver un reporte en estado 'asignado'/);
    expect(await estadoDe(id)).toBe('asignado');
  });

  test('CP-22 Iniciar un reporte que no está asignado (ya resuelto) es rechazado', async () => {
    const id = await reporteEn('resuelto');
    const res = await accion(id, 'iniciar', USUARIOS.cuadrillaA);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No se puede iniciar la atención de un reporte en estado 'resuelto'/);
    expect(await estadoDe(id)).toBe('resuelto');
  });

  test('CP-23 Asignar un reporte ya resuelto es rechazado', async () => {
    const id = await reporteEn('resuelto');
    const res = await accion(id, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: idCuadrillaA });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No se puede asignar un reporte en estado 'resuelto'/);
    expect(await estadoDe(id)).toBe('resuelto');
  });
});
