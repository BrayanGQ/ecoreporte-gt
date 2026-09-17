// Controlador de notificaciones del usuario autenticado.
const { query } = require('../config/db');

// GET /api/notificaciones — notificaciones del usuario autenticado, de la más reciente a la más antigua.
async function misNotificaciones(req, res) {
  try {
    const result = await query(
      `SELECT id_notificacion, id_reporte, mensaje, leida, fecha_envio
       FROM notificacion
       WHERE id_usuario = $1
       ORDER BY fecha_envio DESC`,
      [req.usuario.id_usuario]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener notificaciones:', err.message);
    res.status(500).json({ error: 'Error al obtener las notificaciones.' });
  }
}

// PUT /api/notificaciones/:id/leida — marca como leída una notificación propia del usuario autenticado.
async function marcarLeida(req, res) {
  const { id } = req.params;
  try {
    const result = await query(
      `UPDATE notificacion SET leida = TRUE
       WHERE id_notificacion = $1 AND id_usuario = $2
       RETURNING id_notificacion`,
      [id, req.usuario.id_usuario]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada.' });
    }
    res.json({ mensaje: 'Notificación marcada como leída.' });
  } catch (err) {
    console.error('Error al marcar notificación como leída:', err.message);
    res.status(500).json({ error: 'Error al actualizar la notificación.' });
  }
}

module.exports = { misNotificaciones, marcarLeida };
