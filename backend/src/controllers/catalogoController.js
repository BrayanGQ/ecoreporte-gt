// Controlador de catálogos: provee las listas para los formularios (tipos, estados, municipalidades).
const { query } = require('../config/db');

async function tiposIncidencia(req, res) {
  try {
    const r = await query('SELECT id_tipo_incidencia, nombre_tipo FROM tipo_incidencia ORDER BY nombre_tipo');
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener los tipos de incidencia.' });
  }
}

async function estados(req, res) {
  try {
    const r = await query('SELECT id_estado, nombre_estado, orden FROM estado_reporte ORDER BY orden');
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener los estados.' });
  }
}

async function municipalidades(req, res) {
  try {
    const r = await query(
      'SELECT id_municipalidad, nombre, departamento FROM municipalidad WHERE estado_activo = TRUE ORDER BY nombre'
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener las municipalidades.' });
  }
}

module.exports = { tiposIncidencia, estados, municipalidades };
