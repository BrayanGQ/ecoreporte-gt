// Avisos por correo del flujo de reportes: qué correo se manda, a quién y cuándo.
//   - Reporte nuevo: al ciudadano con cuenta (código y enlace de consulta) y a los coordinadores
//     (personal_municipal activo) de la municipalidad del reporte (enlace al reporte).
//   - Cambio de estado (asignado, en atención, resuelto, descartado con su motivo): al ciudadano
//     con cuenta. Los reportes anónimos no tienen a quién avisar.
//   - Asignación o reasignación: al encargado de cuadrilla asignado (datos, "Cómo llegar" y
//     enlace al reporte en el panel).
//
// Los controladores preparan los correos DENTRO de la transacción (prepararSinRiesgo: un error
// ahí no afecta al reporte) y los despachan DESPUÉS del COMMIT sin esperarlos (despachar): la
// respuesta de la API nunca depende de Brevo.
const { enviarCorreo } = require('./correo');
const { armarCorreo, urlApp } = require('./plantillaCorreo');

const ETIQUETAS_ESTADO = {
  recibido: 'Recibido',
  asignado: 'Asignado',
  en_atencion: 'En atención',
  resuelto: 'Resuelto',
  descartado: 'Descartado',
};

const EXPLICACION_ESTADO = {
  asignado: 'La municipalidad asignó tu reporte a una cuadrilla de limpieza.',
  en_atencion: 'La cuadrilla ya está atendiendo el lugar que reportaste.',
  resuelto: 'La cuadrilla terminó la limpieza y subió fotos del resultado. Podés verlas en "Mis reportes" o consultando el código.',
  descartado: 'La municipalidad revisó tu reporte y lo descartó.',
};

// Datos del reporte que usan los correos. El ciudadano solo aparece si tiene cuenta activa.
const SQL_REPORTE = `
  SELECT r.id_reporte, r.codigo_seguimiento, r.descripcion, r.latitud, r.longitud,
         r.id_municipalidad, r.id_usuario_reporta, t.nombre_tipo, m.nombre AS municipalidad,
         uc.correo AS correo_ciudadano, uc.nombre_completo AS nombre_ciudadano
  FROM reporte r
  JOIN tipo_incidencia t ON t.id_tipo_incidencia = r.id_tipo_incidencia
  JOIN municipalidad m ON m.id_municipalidad = r.id_municipalidad
  LEFT JOIN usuario uc ON uc.id_usuario = r.id_usuario_reporta AND uc.estado = TRUE
  WHERE r.id_reporte = $1`;

const enlaceConsulta = (r) => urlApp(`/portal/consultar?codigo=${encodeURIComponent(r.codigo_seguimiento)}`);
const enlacePanel = (r) => urlApp(`/municipal/panel/reporte/${r.id_reporte}`);
const enlaceComoLlegar = (r) =>
  `https://www.google.com/maps/dir/?api=1&destination=${Number(r.latitud)},${Number(r.longitud)}`;
const ubicacion = (r) => `${Number(r.latitud).toFixed(5)}, ${Number(r.longitud).toFixed(5)}`;

function correo(para, nombre, asunto, contenido) {
  return { para, nombre, asunto, ...armarCorreo(contenido) };
}

// --- Plantillas de cada aviso ---

function nuevoReporteCiudadano(r) {
  return correo(r.correo_ciudadano, r.nombre_ciudadano, `Recibimos tu reporte ${r.codigo_seguimiento}`, {
    titulo: 'Recibimos tu reporte',
    saludo: `Hola, ${r.nombre_ciudadano}:`,
    parrafos: [
      'Gracias por reportar. Tu reporte quedó registrado y la municipalidad responsable ya puede verlo.',
      'Guardá el código de seguimiento para consultar el estado cuando quieras.',
    ],
    datos: [
      ['Código de seguimiento', r.codigo_seguimiento],
      ['Tipo', r.nombre_tipo],
      ['Municipalidad', r.municipalidad],
      ['Estado', ETIQUETAS_ESTADO.recibido],
    ],
    botones: [{ texto: 'Consultar el estado', url: enlaceConsulta(r) }],
    nota: 'Te vamos a escribir cada vez que tu reporte cambie de estado.',
  });
}

function nuevoReporteCoordinador(r, coordinador) {
  return correo(coordinador.correo, coordinador.nombre_completo,
    `Nuevo reporte ${r.codigo_seguimiento} en ${r.municipalidad}`, {
      titulo: 'Entró un reporte nuevo',
      saludo: `Hola, ${coordinador.nombre_completo}:`,
      parrafos: [`Se registró un reporte en la zona de ${r.municipalidad}. Está en estado Recibido: podés asignarlo a una cuadrilla o descartarlo.`],
      datos: [
        ['Código', r.codigo_seguimiento],
        ['Tipo', r.nombre_tipo],
        ['Descripción', r.descripcion || 'Sin descripción'],
        ['Reportado por', r.id_usuario_reporta ? 'Ciudadano registrado' : 'Reporte anónimo'],
        ['Ubicación', ubicacion(r)],
      ],
      botones: [
        { texto: 'Ver el reporte', url: enlacePanel(r) },
        { texto: 'Cómo llegar', url: enlaceComoLlegar(r), secundario: true },
      ],
    });
}

function cambioEstadoCiudadano(r, estado, motivo) {
  const etiqueta = ETIQUETAS_ESTADO[estado] || estado;
  return correo(r.correo_ciudadano, r.nombre_ciudadano,
    `Tu reporte ${r.codigo_seguimiento} cambió a: ${etiqueta}`, {
      titulo: `Tu reporte está: ${etiqueta}`,
      saludo: `Hola, ${r.nombre_ciudadano}:`,
      parrafos: [EXPLICACION_ESTADO[estado] || `Tu reporte cambió al estado ${etiqueta}.`],
      datos: [
        ['Código de seguimiento', r.codigo_seguimiento],
        ['Tipo', r.nombre_tipo],
        ['Municipalidad', r.municipalidad],
        ['Estado nuevo', etiqueta],
        ...(estado === 'descartado' ? [['Motivo', motivo]] : []),
      ],
      botones: [{ texto: 'Consultar el reporte', url: enlaceConsulta(r) }],
    });
}

function asignacionCuadrilla(r, encargado, reasignado) {
  return correo(encargado.correo, encargado.nombre_completo,
    `${reasignado ? 'Te reasignaron' : 'Te asignaron'} el reporte ${r.codigo_seguimiento}`, {
      titulo: reasignado ? 'Te reasignaron un reporte' : 'Te asignaron un reporte',
      saludo: `Hola, ${encargado.nombre_completo}:`,
      parrafos: ['Tu cuadrilla tiene un reporte nuevo para atender.'],
      datos: [
        ['Código', r.codigo_seguimiento],
        ['Tipo', r.nombre_tipo],
        ['Descripción', r.descripcion || 'Sin descripción'],
        ['Municipalidad', r.municipalidad],
        ['Ubicación', ubicacion(r)],
      ],
      botones: [
        { texto: 'Cómo llegar', url: enlaceComoLlegar(r) },
        { texto: 'Ver el reporte', url: enlacePanel(r), secundario: true },
      ],
      nota: 'Al llegar al lugar, marcá "Iniciar atención" en el panel. Para resolverlo vas a necesitar al menos una foto de la limpieza.',
    });
}

// --- Preparación (dentro de la transacción) ---

// `ejecutar(texto, params)` corre la consulta con el cliente de la transacción.
async function datosReporte(ejecutar, idReporte) {
  return (await ejecutar(SQL_REPORTE, [idReporte])).rows[0];
}

// Reporte recién registrado: ciudadano con cuenta + coordinadores activos de la municipalidad.
async function avisosNuevoReporte(ejecutar, idReporte) {
  const r = await datosReporte(ejecutar, idReporte);
  if (!r) return [];
  const coordinadores = (await ejecutar(
    `SELECT u.correo, u.nombre_completo
     FROM usuario u JOIN rol ro ON ro.id_rol = u.id_rol
     WHERE ro.nombre_rol = 'personal_municipal' AND u.estado = TRUE AND u.id_municipalidad = $1
     ORDER BY u.id_usuario`,
    [r.id_municipalidad]
  )).rows;

  return [
    ...(r.correo_ciudadano ? [nuevoReporteCiudadano(r)] : []),
    ...coordinadores.map((c) => nuevoReporteCoordinador(r, c)),
  ];
}

// Acción del flujo ya aplicada (antes del COMMIT).
//   estadoAnterior, estado: estados antes y después de la acción.
//   motivo: comentario de la acción (se muestra solo en el descarte).
//   idEncargado: encargado asignado por esta acción (asignar o reasignar), si lo hay.
async function avisosCambio(ejecutar, idReporte, { estadoAnterior, estado, motivo, idEncargado }) {
  const r = await datosReporte(ejecutar, idReporte);
  if (!r) return [];
  const correos = [];

  // La reasignación no cambia el estado: el ciudadano solo recibe correo si el estado cambió.
  if (r.correo_ciudadano && estado !== estadoAnterior) {
    correos.push(cambioEstadoCiudadano(r, estado, motivo));
  }
  if (idEncargado) {
    const encargado = (await ejecutar(
      'SELECT correo, nombre_completo FROM usuario WHERE id_usuario = $1 AND estado = TRUE',
      [idEncargado]
    )).rows[0];
    if (encargado) correos.push(asignacionCuadrilla(r, encargado, estadoAnterior === 'asignado'));
  }
  return correos;
}

// Corre `preparar()` dentro de un SAVEPOINT de la transacción del cliente: si falla, se deshace
// solo lo suyo, se registra el error y no se manda ningún correo (el reporte sigue su curso).
async function prepararSinRiesgo(client, preparar) {
  await client.query('SAVEPOINT avisos_correo');
  try {
    const correos = await preparar((texto, params) => client.query(texto, params));
    await client.query('RELEASE SAVEPOINT avisos_correo');
    return correos;
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT avisos_correo');
    console.error('[correo] No se pudieron preparar los avisos:', err.message);
    return [];
  }
}

// Envía los correos en segundo plano, sin esperarlos. Un error de Brevo (o de la red) solo
// se registra: nunca llega a la respuesta de la API.
function despachar(correos) {
  for (const c of correos) {
    const registrarError = (err) =>
      console.error(`[correo] Falló el envío "${c.asunto}" para ${c.para}:`, err?.message || err);
    try {
      Promise.resolve(enviarCorreo(c)).catch(registrarError);
    } catch (err) {
      registrarError(err);
    }
  }
}

module.exports = {
  avisosNuevoReporte, avisosCambio, prepararSinRiesgo, despachar, ETIQUETAS_ESTADO,
};
