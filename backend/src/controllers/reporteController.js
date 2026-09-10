// Controlador de reportes: registro ciudadano, consulta, listado y gestión municipal.
const { query, pool } = require('../config/db');

// Genera un código de seguimiento legible, por ejemplo ER-2026-0001.
function generarCodigo(id) {
  const anio = new Date().getFullYear();
  return `ER-${anio}-${String(id).padStart(4, '0')}`;
}

// POST /api/reportes — registro de un reporte ciudadano (público, sin autenticación).
async function crearReporte(req, res) {
  const {
    id_tipo_incidencia, id_municipalidad, descripcion,
    latitud, longitud, id_usuario_reporta, evidencias,
  } = req.body;

  if (!id_tipo_incidencia || !id_municipalidad || latitud == null || longitud == null) {
    return res.status(400).json({ error: 'Tipo de incidencia, municipalidad y ubicación son obligatorios.' });
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
      [id_usuario_reporta || null, id_municipalidad, id_tipo_incidencia,
       idEstadoRecibido, descripcion || null, latitud, longitud]
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
async function listarReportes(req, res) {
  const { estado, tipo, municipalidad } = req.query;
  const condiciones = [];
  const params = [];
  let i = 1;

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

    const evidencias = await query(
      'SELECT id_evidencia, url_imagen, tipo_evidencia, fecha_carga FROM evidencia_fotografica WHERE id_reporte = $1',
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

// PUT /api/reportes/:id/estado — actualiza el estado (personal municipal / admin).
async function actualizarEstado(req, res) {
  const { id } = req.params;
  const { nombre_estado, comentario, id_usuario_asignado } = req.body;
  if (!nombre_estado) {
    return res.status(400).json({ error: 'El nuevo estado es obligatorio.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const estadoRes = await client.query(
      'SELECT id_estado FROM estado_reporte WHERE nombre_estado = $1',
      [nombre_estado]
    );
    if (estadoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Estado no válido.' });
    }
    const idEstado = estadoRes.rows[0].id_estado;

    // Actualiza el reporte (estado y, opcionalmente, el responsable asignado).
    await client.query(
      `UPDATE reporte
       SET id_estado_actual = $1,
           id_usuario_asignado = COALESCE($2, id_usuario_asignado)
       WHERE id_reporte = $3`,
      [idEstado, id_usuario_asignado || null, id]
    );

    // Registra el cambio en el historial, con el usuario responsable autenticado.
    await client.query(
      `INSERT INTO historial_estado (id_reporte, id_estado, id_usuario_responsable, comentario)
       VALUES ($1, $2, $3, $4)`,
      [id, idEstado, req.usuario.id_usuario, comentario || null]
    );

    // Si el reporte tiene un ciudadano registrado, se le genera una notificación.
    const reporteRes = await client.query(
      'SELECT id_usuario_reporta, codigo_seguimiento FROM reporte WHERE id_reporte = $1',
      [id]
    );
    const { id_usuario_reporta, codigo_seguimiento } = reporteRes.rows[0];
    if (id_usuario_reporta) {
      await client.query(
        `INSERT INTO notificacion (id_usuario, id_reporte, mensaje)
         VALUES ($1, $2, $3)`,
        [id_usuario_reporta, id,
         `Tu reporte ${codigo_seguimiento} cambió al estado: ${nombre_estado}.`]
      );
    }

    await client.query('COMMIT');
    res.json({ mensaje: 'Estado actualizado correctamente.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar estado:', err.message);
    res.status(500).json({ error: 'Error al actualizar el estado.' });
  } finally {
    client.release();
  }
}

module.exports = {
  crearReporte, listarReportes, consultarPorCodigo, detalleReporte, actualizarEstado,
};
