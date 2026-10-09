// Controlador de catálogos: provee las listas para los formularios (tipos, estados, municipalidades).
const { query } = require('../config/db');
const { SIN_COBERTURA, leerCoordenadas, municipalidadEnPunto } = require('../utils/ubicacion');

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

// GET /api/catalogos/municipalidad-por-ubicacion?lat=&lng= — municipalidad cuyo límite
// contiene el punto. Público: el formulario de reporte lo consulta al mover el marcador.
// Responde 200 también cuando no hay cobertura (cubierta: false), con el motivo.
async function municipalidadPorUbicacion(req, res) {
  const coords = leerCoordenadas(req.query.lat, req.query.lng);
  if (!coords) {
    return res.status(400).json({ error: 'Indicá una ubicación válida con los parámetros lat y lng.' });
  }
  try {
    const muni = await municipalidadEnPunto(coords.lat, coords.lng);
    const cubierta = !!muni && muni.estado_activo;
    res.json({
      cubierta,
      municipalidad: muni, // { id_municipalidad, nombre, departamento, estado_activo } o null
      mensaje: cubierta ? `Este reporte será atendido por: ${muni.nombre}` : SIN_COBERTURA,
    });
  } catch (err) {
    console.error('Error al buscar municipalidad por ubicación:', err.message);
    res.status(500).json({ error: 'Error al determinar la municipalidad de la ubicación.' });
  }
}

// GET /api/catalogos/limites-activos — contornos de las municipalidades activas (GeoJSON),
// para dibujarlos en el mapa del formulario. Se simplifican (~10 m) para que pesen poco.
async function limitesActivos(req, res) {
  try {
    const r = await query(
      `SELECT id_municipalidad, nombre,
              ST_AsGeoJSON(ST_SimplifyPreserveTopology(limite, 0.0001), 6)::json AS geometry
       FROM municipalidad
       WHERE estado_activo = TRUE AND limite IS NOT NULL
       ORDER BY nombre`
    );
    res.json({
      type: 'FeatureCollection',
      features: r.rows.map(({ id_municipalidad, nombre, geometry }) => ({
        type: 'Feature',
        properties: { id_municipalidad, nombre },
        geometry,
      })),
    });
  } catch (err) {
    console.error('Error al obtener los límites municipales:', err.message);
    res.status(500).json({ error: 'Error al obtener los límites municipales.' });
  }
}

module.exports = { tiposIncidencia, estados, municipalidades, municipalidadPorUbicacion, limitesActivos };
