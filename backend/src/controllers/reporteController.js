// Controlador de reportes: registro ciudadano, consulta, listado y gestión municipal.
const { query, pool } = require('../config/db');
const { SIN_COBERTURA, leerCoordenadas, municipalidadEnPunto } = require('../utils/ubicacion');

// Genera un código de seguimiento legible, por ejemplo ER-2026-0001.
function generarCodigo(id) {
  const anio = new Date().getFullYear();
  return `ER-${anio}-${String(id).padStart(4, '0')}`;
}

// Alcance por rol sobre un reporte ({ id_municipalidad, id_usuario_asignado }):
// el administrador ve todos; personal_municipal (coordinador) solo los de su municipalidad;
// encargado_cuadrilla solo los asignados a él. Cualquier otro rol, ninguno.
function puedeVerReporte(usuario, reporte) {
  switch (usuario?.rol) {
    case 'administrador': return true;
    case 'personal_municipal': return reporte.id_municipalidad === usuario.id_municipalidad;
    case 'encargado_cuadrilla': return reporte.id_usuario_asignado === usuario.id_usuario;
    default: return false;
  }
}

const SIN_ACCESO = 'No tenés acceso a este reporte.';

// POST /api/reportes — registro de un reporte ciudadano (público, sin autenticación).
// La municipalidad se determina aquí por la ubicación (límites en PostGIS): cualquier
// id_municipalidad que envíe el cliente se ignora.
async function crearReporte(req, res) {
  const {
    id_tipo_incidencia, descripcion,
    latitud, longitud, id_usuario_reporta, evidencias,
  } = req.body;

  if (!id_tipo_incidencia || latitud == null || longitud == null) {
    return res.status(400).json({ error: 'Tipo de incidencia y ubicación son obligatorios.' });
  }
  const coords = leerCoordenadas(latitud, longitud);
  if (!coords) {
    return res.status(400).json({ error: 'La ubicación indicada no es válida.' });
  }

  // Evidencias: arreglo opcional de imágenes en base64 (data URL). Entre 0 y 5.
  const imagenes = Array.isArray(evidencias)
    ? evidencias.filter((img) => typeof img === 'string' && img.trim() !== '')
    : [];
  if (imagenes.length > 5) {
    return res.status(400).json({ error: 'Se permiten como máximo 5 fotografías por reporte.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Municipalidad responsable: la activa cuyo límite contiene el punto.
    const muni = await municipalidadEnPunto(coords.lat, coords.lng, (t, p) => client.query(t, p));
    if (!muni || !muni.estado_activo) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: SIN_COBERTURA });
    }
    const idMunicipalidad = muni.id_municipalidad;

    // Estado inicial: 'recibido'.
    const estadoRes = await client.query(
      "SELECT id_estado FROM estado_reporte WHERE nombre_estado = 'recibido'"
    );
    const idEstadoRecibido = estadoRes.rows[0].id_estado;

    // Inserta el reporte.
    const insert = await client.query(
      `INSERT INTO reporte
         (id_usuario_reporta, id_municipalidad, id_tipo_incidencia, id_estado_actual,
          descripcion, latitud, longitud)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id_reporte`,
      [id_usuario_reporta || null, idMunicipalidad, id_tipo_incidencia,
       idEstadoRecibido, descripcion || null, coords.lat, coords.lng]
    );
    const idReporte = insert.rows[0].id_reporte;

    // Asigna el código de seguimiento.
    const codigo = generarCodigo(idReporte);
    await client.query('UPDATE reporte SET codigo_seguimiento = $1 WHERE id_reporte = $2', [
      codigo, idReporte,
    ]);

    // Registra el primer estado en el historial.
    await client.query(
      `INSERT INTO historial_estado (id_reporte, id_estado, comentario)
       VALUES ($1, $2, 'Reporte recibido')`,
      [idReporte, idEstadoRecibido]
    );

    // Inserta las evidencias fotográficas ciudadanas asociadas al reporte.
    for (const imagen of imagenes) {
      await client.query(
        `INSERT INTO evidencia_fotografica (id_reporte, id_usuario, url_imagen, tipo_evidencia, fecha_carga)
         VALUES ($1, $2, $3, 'ciudadana', NOW())`,
        [idReporte, id_usuario_reporta || null, imagen]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      mensaje: 'Reporte registrado correctamente.',
      id_reporte: idReporte,
      codigo_seguimiento: codigo,
      municipalidad: { id_municipalidad: idMunicipalidad, nombre: muni.nombre },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al crear reporte:', err.message);
    res.status(500).json({ error: 'Error al registrar el reporte.' });
  } finally {
    client.release();
  }
}

// GET /api/reportes — listado de reportes con filtros. Para el mapa y el panel.
// Público (el mapa lo consulta sin token). Si viene un token, se limita el alcance:
// personal_municipal ve solo su municipalidad y encargado_cuadrilla solo lo asignado a él.
async function listarReportes(req, res) {
  const { estado, tipo, municipalidad } = req.query;
  const condiciones = [];
  const params = [];
  let i = 1;

  if (req.usuario?.rol === 'personal_municipal') {
    condiciones.push(`r.id_municipalidad = $${i++}`); params.push(req.usuario.id_municipalidad);
  } else if (req.usuario?.rol === 'encargado_cuadrilla') {
    condiciones.push(`r.id_usuario_asignado = $${i++}`); params.push(req.usuario.id_usuario);
  }

  if (estado) { condiciones.push(`e.nombre_estado = $${i++}`); params.push(estado); }
  if (tipo) { condiciones.push(`r.id_tipo_incidencia = $${i++}`); params.push(tipo); }
  if (municipalidad) { condiciones.push(`r.id_municipalidad = $${i++}`); params.push(municipalidad); }

  const where = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';

  try {
    const result = await query(
      `SELECT r.id_reporte, r.descripcion, r.latitud, r.longitud, r.fecha_reporte,
              r.codigo_seguimiento,
              t.nombre_tipo, e.nombre_estado, m.nombre AS municipalidad
       FROM reporte r
       JOIN tipo_incidencia t ON r.id_tipo_incidencia = t.id_tipo_incidencia
       JOIN estado_reporte e   ON r.id_estado_actual = e.id_estado
       JOIN municipalidad m    ON r.id_municipalidad = m.id_municipalidad
       ${where}
       ORDER BY r.fecha_reporte DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al listar reportes:', err.message);
    res.status(500).json({ error: 'Error al obtener los reportes.' });
  }
}

// GET /api/reportes/mis-reportes — reportes del ciudadano autenticado (requiere auth).
async function misReportes(req, res) {
  try {
    const result = await query(
      `SELECT r.id_reporte, r.codigo_seguimiento, r.descripcion, r.fecha_reporte,
              t.nombre_tipo, e.nombre_estado
       FROM reporte r
       JOIN tipo_incidencia t ON r.id_tipo_incidencia = t.id_tipo_incidencia
       JOIN estado_reporte e   ON r.id_estado_actual = e.id_estado
       WHERE r.id_usuario_reporta = $1
       ORDER BY r.fecha_reporte DESC`,
      [req.usuario.id_usuario]
    );

    // Evidencia de la limpieza (municipal) de los reportes resueltos, para que el
    // ciudadano vea el resultado.
    const resueltos = result.rows.filter((r) => r.nombre_estado === 'resuelto').map((r) => r.id_reporte);
    const evidencias = resueltos.length
      ? (await query(
          `SELECT id_reporte, id_evidencia, url_imagen, fecha_carga
           FROM evidencia_fotografica
           WHERE tipo_evidencia = 'municipal' AND id_reporte = ANY($1::int[])
           ORDER BY fecha_carga, id_evidencia`,
          [resueltos]
        )).rows
      : [];

    res.json(result.rows.map((r) => ({
      ...r,
      evidencias_municipales: evidencias
        .filter((ev) => ev.id_reporte === r.id_reporte)
        .map(({ id_evidencia, url_imagen, fecha_carga }) => ({ id_evidencia, url_imagen, fecha_carga })),
    })));
  } catch (err) {
    console.error('Error al obtener mis reportes:', err.message);
    res.status(500).json({ error: 'Error al obtener tus reportes.' });
  }
}

// GET /api/reportes/:codigo — consulta pública del estado de un reporte por su código.
async function consultarPorCodigo(req, res) {
  const { codigo } = req.params;
  try {
    const reporteRes = await query(
      `SELECT r.id_reporte, r.descripcion, r.fecha_reporte, r.codigo_seguimiento,
              t.nombre_tipo, e.nombre_estado, m.nombre AS municipalidad
       FROM reporte r
       JOIN tipo_incidencia t ON r.id_tipo_incidencia = t.id_tipo_incidencia
       JOIN estado_reporte e   ON r.id_estado_actual = e.id_estado
       JOIN municipalidad m    ON r.id_municipalidad = m.id_municipalidad
       WHERE r.codigo_seguimiento = $1`,
      [codigo]
    );
    if (reporteRes.rows.length === 0) {
      return res.status(404).json({ error: 'No se encontró un reporte con ese código.' });
    }

    const reporte = reporteRes.rows[0];

    // Trae el historial de estados.
    const historial = await query(
      `SELECT e.nombre_estado, h.comentario, h.fecha_cambio
       FROM historial_estado h
       JOIN estado_reporte e ON h.id_estado = e.id_estado
       WHERE h.id_reporte = $1
       ORDER BY h.fecha_cambio ASC`,
      [reporte.id_reporte]
    );

    res.json({ ...reporte, historial: historial.rows });
  } catch (err) {
    console.error('Error al consultar reporte:', err.message);
    res.status(500).json({ error: 'Error al consultar el reporte.' });
  }
}

// GET /api/reportes/:id/detalle — detalle completo (para el panel municipal, requiere auth).
async function detalleReporte(req, res) {
  const { id } = req.params;
  try {
    const reporteRes = await query(
      `SELECT r.*, t.nombre_tipo, e.nombre_estado, m.nombre AS municipalidad,
              ur.nombre_completo AS reportado_por,
              ua.nombre_completo AS asignado_a
       FROM reporte r
       JOIN tipo_incidencia t ON r.id_tipo_incidencia = t.id_tipo_incidencia
       JOIN estado_reporte e   ON r.id_estado_actual = e.id_estado
       JOIN municipalidad m    ON r.id_municipalidad = m.id_municipalidad
       LEFT JOIN usuario ur ON r.id_usuario_reporta = ur.id_usuario
       LEFT JOIN usuario ua ON r.id_usuario_asignado = ua.id_usuario
       WHERE r.id_reporte = $1`,
      [id]
    );
    if (reporteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Reporte no encontrado.' });
    }
    if (!puedeVerReporte(req.usuario, reporteRes.rows[0])) {
      return res.status(403).json({ error: SIN_ACCESO });
    }

    const evidencias = await query(
      // tipo_evidencia: 'ciudadana' (al reportar) o 'municipal' (limpieza, al resolver).
      `SELECT id_evidencia, url_imagen, tipo_evidencia, fecha_carga
       FROM evidencia_fotografica WHERE id_reporte = $1
       ORDER BY fecha_carga, id_evidencia`,
      [id]
    );
    const historial = await query(
      `SELECT e.nombre_estado, h.comentario, h.fecha_cambio, u.nombre_completo AS responsable
       FROM historial_estado h
       JOIN estado_reporte e ON h.id_estado = e.id_estado
       LEFT JOIN usuario u ON h.id_usuario_responsable = u.id_usuario
       WHERE h.id_reporte = $1 ORDER BY h.fecha_cambio ASC`,
      [id]
    );

    res.json({
      ...reporteRes.rows[0],
      evidencias: evidencias.rows,
      historial: historial.rows,
    });
  } catch (err) {
    console.error('Error al obtener detalle:', err.message);
    res.status(500).json({ error: 'Error al obtener el detalle del reporte.' });
  }
}

// Encargados de cuadrilla a los que se puede asignar un reporte: activos y de la
// municipalidad indicada ($1). Se reutiliza para validar una asignación.
const SQL_ASIGNABLES = `
  SELECT u.id_usuario, u.nombre_completo
  FROM usuario u
  JOIN rol r ON u.id_rol = r.id_rol
  WHERE r.nombre_rol = 'encargado_cuadrilla'
    AND u.estado = TRUE
    AND u.id_municipalidad = $1`;

// GET /api/reportes/:id/asignables — encargados de cuadrilla de la misma municipalidad del reporte.
async function empleadosAsignables(req, res) {
  const { id } = req.params;
  try {
    const reporteRes = await query(
      'SELECT id_municipalidad, id_usuario_asignado FROM reporte WHERE id_reporte = $1',
      [id]
    );
    if (reporteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Reporte no encontrado.' });
    }
    if (!puedeVerReporte(req.usuario, reporteRes.rows[0])) {
      return res.status(403).json({ error: SIN_ACCESO });
    }
    const r = await query(`${SQL_ASIGNABLES} ORDER BY u.nombre_completo`, [reporteRes.rows[0].id_municipalidad]);
    res.json(r.rows);
  } catch (err) {
    console.error('Error al obtener empleados asignables:', err.message);
    res.status(500).json({ error: 'Error al obtener los empleados asignables.' });
  }
}

// =========================================================================
// FLUJO DE ESTADOS — acciones explícitas por rol (validadas en el backend)
//   personal_municipal (coordinador), en reportes de su municipalidad:
//     recibido -> asignado (asignar)   ·   asignado -> asignado (reasignar)
//     recibido -> descartado (descartar, con motivo)
//   encargado_cuadrilla, en reportes asignados a él:
//     asignado -> en_atencion (iniciar)   ·   en_atencion -> resuelto (resolver)
//   El rol de cada acción se exige en las rutas (permitirRoles): el administrador recibe 403.
// =========================================================================

// Error controlado de una acción: se responde con su código HTTP y mensaje.
class ErrorAccion extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

const LARGO_MAX_COMENTARIO = 300; // historial_estado.comentario es VARCHAR(300)

// Exige que el reporte esté en uno de los estados permitidos para la acción.
function exigirEstado(reporte, permitidos, accion) {
  if (!permitidos.includes(reporte.estado_actual)) {
    const desde = permitidos.map((e) => `'${e}'`).join(' o ');
    throw new ErrorAccion(400,
      `No se puede ${accion} un reporte en estado '${reporte.estado_actual}'. Solo es posible desde ${desde}.`);
  }
}

// Texto opcional del body (comentario/motivo): recortado y con largo máximo.
function textoOpcional(valor, campo) {
  if (valor == null) return '';
  if (typeof valor !== 'string') throw new ErrorAccion(400, `El campo ${campo} debe ser texto.`);
  const texto = valor.trim();
  if (texto.length > LARGO_MAX_COMENTARIO) {
    throw new ErrorAccion(400, `El campo ${campo} admite como máximo ${LARGO_MAX_COMENTARIO} caracteres.`);
  }
  return texto;
}

// Ejecuta una acción del flujo en una transacción: bloquea el reporte, valida el alcance
// del usuario, deja que `decidir` valide la transición y devuelva el cambio, y luego
// actualiza el reporte, registra el historial y notifica al ciudadano.
// `decidir(reporte, client)` devuelve
// { estado, id_usuario_asignado?, comentario, mensaje_ciudadano, evidencias_municipales? }.
async function ejecutarAccion(req, res, decidir) {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(404).json({ error: 'Reporte no encontrado.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // FOR UPDATE: evita que dos acciones simultáneas partan del mismo estado.
    const actualRes = await client.query(
      `SELECT r.id_reporte, r.id_municipalidad, r.id_usuario_asignado, r.id_usuario_reporta,
              r.codigo_seguimiento, e.nombre_estado AS estado_actual,
              ua.nombre_completo AS asignado_a
       FROM reporte r
       JOIN estado_reporte e ON r.id_estado_actual = e.id_estado
       LEFT JOIN usuario ua ON r.id_usuario_asignado = ua.id_usuario
       WHERE r.id_reporte = $1
       FOR UPDATE OF r`,
      [id]
    );
    if (actualRes.rows.length === 0) throw new ErrorAccion(404, 'Reporte no encontrado.');
    const reporte = actualRes.rows[0];
    if (!puedeVerReporte(req.usuario, reporte)) throw new ErrorAccion(403, SIN_ACCESO);

    const cambio = await decidir(reporte, client);

    const estadoRes = await client.query(
      'SELECT id_estado FROM estado_reporte WHERE nombre_estado = $1',
      [cambio.estado]
    );
    const idEstado = estadoRes.rows[0].id_estado;

    await client.query(
      `UPDATE reporte
       SET id_estado_actual = $1,
           id_usuario_asignado = COALESCE($2::int, id_usuario_asignado)
       WHERE id_reporte = $3`,
      [idEstado, cambio.id_usuario_asignado ?? null, id]
    );

    // Historial, con el usuario autenticado como responsable del cambio.
    await client.query(
      `INSERT INTO historial_estado (id_reporte, id_estado, id_usuario_responsable, comentario)
       VALUES ($1, $2, $3, $4)`,
      [id, idEstado, req.usuario.id_usuario, cambio.comentario.slice(0, LARGO_MAX_COMENTARIO)]
    );

    // Evidencia de la atención (por ahora solo al resolver), cargada por el usuario del token.
    for (const imagen of cambio.evidencias_municipales || []) {
      await client.query(
        `INSERT INTO evidencia_fotografica (id_reporte, id_usuario, url_imagen, tipo_evidencia, fecha_carga)
         VALUES ($1, $2, $3, 'municipal', NOW())`,
        [id, req.usuario.id_usuario, imagen]
      );
    }

    // Si el reporte tiene un ciudadano registrado, se le genera una notificación.
    if (reporte.id_usuario_reporta) {
      await client.query(
        `INSERT INTO notificacion (id_usuario, id_reporte, mensaje)
         VALUES ($1, $2, $3)`,
        [reporte.id_usuario_reporta, id, cambio.mensaje_ciudadano]
      );
    }

    await client.query('COMMIT');
    res.json({ mensaje: 'Reporte actualizado correctamente.', estado: cambio.estado });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof ErrorAccion) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Error en acción sobre el reporte:', err.message);
    res.status(500).json({ error: 'Error al actualizar el reporte.' });
  } finally {
    client.release();
  }
}

const mensajeEstado = (reporte, estado) =>
  `Tu reporte ${reporte.codigo_seguimiento} cambió al estado: ${estado}.`;

// POST /api/reportes/:id/asignar — coordinador. Body: { id_usuario_asignado }.
// recibido -> asignado; si ya está asignado, reasigna a otro encargado (sigue en 'asignado').
function asignar(req, res) {
  return ejecutarAccion(req, res, async (reporte, client) => {
    const idAsignado = Number(req.body.id_usuario_asignado);
    if (!Number.isInteger(idAsignado) || idAsignado <= 0) {
      throw new ErrorAccion(400, 'Indicá el encargado de cuadrilla a asignar (id_usuario_asignado).');
    }
    exigirEstado(reporte, ['recibido', 'asignado'], 'asignar');

    const encargadoRes = await client.query(
      `${SQL_ASIGNABLES} AND u.id_usuario = $2`,
      [reporte.id_municipalidad, idAsignado]
    );
    if (encargadoRes.rows.length === 0) {
      throw new ErrorAccion(400,
        'Solo se puede asignar a un encargado de cuadrilla activo de la misma municipalidad del reporte.');
    }
    const nombre = encargadoRes.rows[0].nombre_completo;

    if (reporte.estado_actual === 'asignado') {
      if (idAsignado === reporte.id_usuario_asignado) {
        throw new ErrorAccion(400, `El reporte ya está asignado a ${nombre}.`);
      }
      return {
        estado: 'asignado',
        id_usuario_asignado: idAsignado,
        comentario: reporte.asignado_a ? `Reasignado de ${reporte.asignado_a} a ${nombre}` : `Reasignado a ${nombre}`,
        mensaje_ciudadano: `Tu reporte ${reporte.codigo_seguimiento} fue reasignado a otra cuadrilla.`,
      };
    }
    return {
      estado: 'asignado',
      id_usuario_asignado: idAsignado,
      comentario: `Asignado a ${nombre}`,
      mensaje_ciudadano: mensajeEstado(reporte, 'asignado'),
    };
  });
}

// POST /api/reportes/:id/descartar — coordinador. Body: { motivo } (obligatorio).
// recibido -> descartado.
function descartar(req, res) {
  return ejecutarAccion(req, res, async (reporte) => {
    const motivo = textoOpcional(req.body.motivo, 'motivo');
    if (!motivo) throw new ErrorAccion(400, 'El motivo del descarte es obligatorio.');
    exigirEstado(reporte, ['recibido'], 'descartar');
    return {
      estado: 'descartado',
      comentario: motivo,
      mensaje_ciudadano: mensajeEstado(reporte, 'descartado'),
    };
  });
}

// POST /api/reportes/:id/iniciar — encargado de cuadrilla. Body opcional: { comentario }.
// asignado -> en_atencion.
function iniciar(req, res) {
  return ejecutarAccion(req, res, async (reporte) => {
    const comentario = textoOpcional(req.body.comentario, 'comentario');
    exigirEstado(reporte, ['asignado'], 'iniciar la atención de');
    return {
      estado: 'en_atencion',
      comentario: comentario || 'Atención iniciada por la cuadrilla',
      mensaje_ciudadano: mensajeEstado(reporte, 'en_atencion'),
    };
  });
}

// Evidencia de la limpieza al resolver: entre 1 y 5 imágenes en base64 (data URL).
const MIN_EVIDENCIAS = 1;
const MAX_EVIDENCIAS = 5;
const MAX_CARACTERES_IMAGEN = 5 * 1024 * 1024; // ~3,7 MB de imagen por foto
const DATA_URL_IMAGEN = /^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/;

function validarEvidencias(evidencias) {
  if (evidencias == null || (Array.isArray(evidencias) && evidencias.length === 0)) {
    throw new ErrorAccion(400,
      'Para resolver el reporte es obligatorio adjuntar al menos una foto de la limpieza (campo evidencias).');
  }
  if (!Array.isArray(evidencias)) {
    throw new ErrorAccion(400, 'El campo evidencias debe ser un arreglo de imágenes en base64.');
  }
  if (evidencias.length < MIN_EVIDENCIAS || evidencias.length > MAX_EVIDENCIAS) {
    throw new ErrorAccion(400,
      `Se permiten entre ${MIN_EVIDENCIAS} y ${MAX_EVIDENCIAS} fotos de la limpieza; se recibieron ${evidencias.length}.`);
  }
  evidencias.forEach((img, i) => {
    if (typeof img !== 'string' || !DATA_URL_IMAGEN.test(img)) {
      throw new ErrorAccion(400, `La foto ${i + 1} no es una imagen válida en base64 (data:image/...;base64,...).`);
    }
    if (img.length > MAX_CARACTERES_IMAGEN) {
      throw new ErrorAccion(400, `La foto ${i + 1} es demasiado grande. Reducí su tamaño e intentá de nuevo.`);
    }
  });
  return evidencias;
}

// POST /api/reportes/:id/resolver — encargado de cuadrilla.
// Body: { evidencias: [dataUrl, ...] } (obligatorio, 1 a 5 fotos) y { comentario } (opcional).
// en_atencion -> resuelto. Las fotos se guardan como evidencia 'municipal'.
function resolver(req, res) {
  return ejecutarAccion(req, res, async (reporte) => {
    const comentario = textoOpcional(req.body.comentario, 'comentario');
    exigirEstado(reporte, ['en_atencion'], 'resolver');
    const evidencias = validarEvidencias(req.body.evidencias);
    return {
      estado: 'resuelto',
      comentario: comentario || 'Reporte resuelto',
      mensaje_ciudadano: mensajeEstado(reporte, 'resuelto'),
      evidencias_municipales: evidencias,
    };
  });
}

module.exports = {
  crearReporte, listarReportes, misReportes, consultarPorCodigo, detalleReporte,
  empleadosAsignables, asignar, descartar, iniciar, resolver,
};
