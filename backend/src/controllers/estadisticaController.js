// Controlador de estadísticas: conteos agregados de reportes para el panel municipal.
// Todas estas funciones están restringidas a 'personal_municipal' y 'administrador' desde las rutas.
const { query } = require('../config/db');

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Valida una fecha 'YYYY-MM-DD' y que corresponda a un día real del calendario.
function fechaValida(valor) {
  if (!FORMATO_FECHA.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === valor;
}

// Construye las condiciones sobre los reportes a partir de:
// - el alcance del rol: personal_municipal solo ve su municipalidad; el administrador ve
//   todo y puede filtrar con ?id_municipalidad= (opcional).
// - los parámetros opcionales fecha_inicio y fecha_fin (ambos inclusivos, formato YYYY-MM-DD).
// Devuelve { condicion, params } o { error } si los parámetros no son válidos.
function filtroEstadisticas(req) {
  const { fecha_inicio, fecha_fin, id_municipalidad } = req.query;
  const condiciones = [];
  const params = [];

  if (req.usuario.rol === 'personal_municipal') {
    params.push(req.usuario.id_municipalidad);
    condiciones.push(`r.id_municipalidad = $${params.length}`);
  } else if (id_municipalidad !== undefined && id_municipalidad !== '') {
    if (!/^\d+$/.test(id_municipalidad)) {
      return { error: 'id_municipalidad debe ser un número entero.' };
    }
    params.push(Number(id_municipalidad));
    condiciones.push(`r.id_municipalidad = $${params.length}`);
  }

  if (fecha_inicio !== undefined && fecha_inicio !== '') {
    if (!fechaValida(fecha_inicio)) {
      return { error: 'fecha_inicio debe tener el formato YYYY-MM-DD.' };
    }
    params.push(fecha_inicio);
    condiciones.push(`r.fecha_reporte >= $${params.length}::date`);
  }

  if (fecha_fin !== undefined && fecha_fin !== '') {
    if (!fechaValida(fecha_fin)) {
      return { error: 'fecha_fin debe tener el formato YYYY-MM-DD.' };
    }
    params.push(fecha_fin);
    // Incluye el día completo de fecha_fin.
    condiciones.push(`r.fecha_reporte < ($${params.length}::date + 1)`);
  }

  if (fecha_inicio && fecha_fin && fecha_inicio > fecha_fin) {
    return { error: 'fecha_inicio no puede ser posterior a fecha_fin.' };
  }

  return { condicion: condiciones.join(' AND '), params };
}

// Conteo de reportes por estado. Incluye todos los estados, aun con cantidad 0.
async function conteoPorEstado(condicion, params) {
  const r = await query(
    `SELECT e.id_estado, e.nombre_estado, COUNT(r.id_reporte)::int AS cantidad
     FROM estado_reporte e
     LEFT JOIN reporte r
       ON r.id_estado_actual = e.id_estado
       ${condicion ? `AND ${condicion}` : ''}
     GROUP BY e.id_estado, e.nombre_estado, e.orden
     ORDER BY e.orden`,
    params
  );
  return r.rows;
}

// GET /api/estadisticas/por-estado
async function porEstado(req, res) {
  const filtro = filtroEstadisticas(req);
  if (filtro.error) return res.status(400).json({ error: filtro.error });

  try {
    res.json(await conteoPorEstado(filtro.condicion, filtro.params));
  } catch (err) {
    console.error('Error en estadísticas por estado:', err.message);
    res.status(500).json({ error: 'Error al obtener las estadísticas por estado.' });
  }
}

// GET /api/estadisticas/por-tipo — incluye todos los tipos de incidencia, aun con cantidad 0.
async function porTipo(req, res) {
  const filtro = filtroEstadisticas(req);
  if (filtro.error) return res.status(400).json({ error: filtro.error });

  try {
    const r = await query(
      `SELECT t.id_tipo_incidencia, t.nombre_tipo, COUNT(r.id_reporte)::int AS cantidad
       FROM tipo_incidencia t
       LEFT JOIN reporte r
         ON r.id_tipo_incidencia = t.id_tipo_incidencia
         ${filtro.condicion ? `AND ${filtro.condicion}` : ''}
       GROUP BY t.id_tipo_incidencia, t.nombre_tipo
       ORDER BY cantidad DESC, t.nombre_tipo`,
      filtro.params
    );
    res.json(r.rows);
  } catch (err) {
    console.error('Error en estadísticas por tipo:', err.message);
    res.status(500).json({ error: 'Error al obtener las estadísticas por tipo.' });
  }
}

// GET /api/estadisticas/resumen — total de reportes y conteo por estado, para tarjetas de resumen.
async function resumen(req, res) {
  const filtro = filtroEstadisticas(req);
  if (filtro.error) return res.status(400).json({ error: filtro.error });

  try {
    const estados = await conteoPorEstado(filtro.condicion, filtro.params);
    const por_estado = {};
    let total = 0;
    for (const e of estados) {
      por_estado[e.nombre_estado] = e.cantidad;
      total += e.cantidad;
    }

    res.json({
      total,
      por_estado,
      fecha_inicio: req.query.fecha_inicio || null,
      fecha_fin: req.query.fecha_fin || null,
    });
  } catch (err) {
    console.error('Error en resumen de estadísticas:', err.message);
    res.status(500).json({ error: 'Error al obtener el resumen de estadísticas.' });
  }
}

module.exports = { porEstado, porTipo, resumen };
