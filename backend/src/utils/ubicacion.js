// Detección de la municipalidad a partir de una ubicación (PostGIS).
// La usan el catálogo público (vista previa en el mapa) y el registro de reportes,
// para que ambos decidan exactamente con la misma consulta.
const { query } = require('../config/db');

const SIN_COBERTURA = 'Esta zona aún no está cubierta por ninguna municipalidad registrada en la plataforma.';

// Convierte lat/lng a números y valida su rango. Devuelve { lat, lng } o null.
function leerCoordenadas(latitud, longitud) {
  if (latitud === '' || longitud === '' || latitud == null || longitud == null) return null;
  const lat = Number(latitud);
  const lng = Number(longitud);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// Municipalidad cuyo límite contiene el punto, activa o no; null si ninguna lo contiene.
// `ejecutar` permite usarla dentro de una transacción (client.query).
async function municipalidadEnPunto(lat, lng, ejecutar = query) {
  const r = await ejecutar(
    `SELECT id_municipalidad, nombre, departamento, estado_activo
     FROM municipalidad
     WHERE limite IS NOT NULL
       AND ST_Contains(limite, ST_SetSRID(ST_MakePoint($2, $1), 4326))
     ORDER BY estado_activo DESC, id_municipalidad
     LIMIT 1`,
    [lat, lng]
  );
  return r.rows[0] || null;
}

module.exports = { SIN_COBERTURA, leerCoordenadas, municipalidadEnPunto };
