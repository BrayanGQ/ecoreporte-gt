// Reportería de Estadísticas: un solo cálculo para la pantalla, el Excel y el PDF.
// Los generadores (reporte-excel.js y reporte-pdf.js) se cargan bajo demanda desde la vista
// y reciben el objeto que arma calcularReporte(); no vuelven a calcular nada.
// Los archivos no llevan datos del ciudadano: el listado del backend no los incluye.

// Presentación de cada estado: etiqueta en plural (tarjetas, gráfica), en singular (tablas),
// el color de la gráfica y una versión más oscura para el texto del estado en el Excel y el PDF.
// colorTexto tiene contraste de al menos 4.5:1 sobre blanco y sobre el gris de las filas alternas
// (#F2F4F7): recibido 5.97, asignado 5.90, en atención 5.38, resuelto 5.72, descartado 5.26.
export const ESTADOS = {
  recibido:    { plural: 'Recibidos',   singular: 'Recibido',    color: '#E74C3C', colorTexto: '#B42318' },
  asignado:    { plural: 'Asignados',   singular: 'Asignado',    color: '#5B8DEF', colorTexto: '#3552CC' },
  en_atencion: { plural: 'En atención', singular: 'En atención', color: '#E0A800', colorTexto: '#8A5A00' },
  resuelto:    { plural: 'Resueltos',   singular: 'Resuelto',    color: '#97BC62', colorTexto: '#3F6B1E' },
  descartado:  { plural: 'Descartados', singular: 'Descartado',  color: '#999999', colorTexto: '#5F6670' },
};
export const ORDEN_ESTADOS = ['recibido', 'asignado', 'en_atencion', 'resuelto', 'descartado'];

export const etiquetaEstado = (nombre) => ESTADOS[nombre]?.singular || nombre;

export const TITULO_REPORTE = 'Reporte de incidencias ambientales';
export const SIN_REPORTES = 'No se registraron reportes en el período seleccionado.';

// Colores de los documentos: los de las variables CSS de la app (styles.css), con respaldo
// por si la hoja de estilos no está disponible.
const RESPALDO = {
  '--forest': '#2C5F2D',
  '--forest-dark': '#243D20',
  '--slate': '#3A3A3A',
  '--text-secondary': '#667085',
  '--border': '#E4E7EC',
};
function variableCss(nombre) {
  try {
    const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
    if (/^#[0-9a-f]{6}$/i.test(valor)) return valor.toUpperCase();
  } catch {
    // sin DOM: se usa el respaldo
  }
  return RESPALDO[nombre];
}
export function coloresDocumento() {
  return {
    verde: variableCss('--forest'),
    verdeOscuro: variableCss('--forest-dark'),
    texto: variableCss('--slate'),
    gris: variableCss('--text-secondary'),
    borde: variableCss('--border'),
    filaAlterna: '#F2F4F7',
  };
}

// ---------- Formatos (español de Guatemala) ----------
const enteros = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 });
const unDecimal = new Intl.NumberFormat('es-GT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

const dos = (n) => String(n).padStart(2, '0');

export const formatoEntero = (n) => enteros.format(n);
export const formatoDecimal = (n) => unDecimal.format(n);
// fraccion: 0..1 (o null) → "45.5%"
export const formatoPorcentaje = (fraccion) => (fraccion == null ? '-' : `${unDecimal.format(fraccion * 100)}%`);

// dd/mm/aaaa hh:mm en la hora local, o '' si no hay fecha.
export function fechaHora(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

// AAAA-MM-DD de una fecha local.
function fechaIso(d) {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

// 'AAAA-MM-DD' → { a, m, d } numéricos.
function partes(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return { a, m, d };
}

// "del 1 de octubre al 29 de octubre de 2026"; con años distintos, el año va en las dos fechas.
export function periodoEnTexto(desde, hasta) {
  const i = partes(desde);
  const f = partes(hasta);
  const inicio = `${i.d} de ${MESES[i.m - 1]}${i.a !== f.a ? ` de ${i.a}` : ''}`;
  return `del ${inicio} al ${f.d} de ${MESES[f.m - 1]} de ${f.a}`;
}

// "Municipalidad de San José Pinula" → "san-jose-pinula".
function nombreParaArchivo(municipalidad) {
  return municipalidad
    .replace(/^municipalidad de\s+/i, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'municipalidad';
}

// "Municipalidad de Villa Nueva" → "Villa Nueva" (columna Municipalidad de los archivos).
export const nombreCortoMunicipalidad = (nombre) => String(nombre || '').replace(/^municipalidad de\s+/i, '');

// Días entre dos fechas contados por fecha de calendario (hora local): un reporte del 28/10 a
// las 23:00 resuelto el 29/10 a las 08:00 lleva 1 día. Así los días coinciden con las fechas
// dd/mm/aaaa que muestran los archivos.
export function diasCalendario(desde, hasta) {
  const a = new Date(desde);
  const b = new Date(hasta);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
    - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

// Promedio de una lista de números, o null si está vacía.
export function promedio(valores) {
  return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null;
}

// Diferencia con el período anterior: "+3", "-1", "0"; con decimales: "+1.2 días", "-1.2 días".
export function formatoDiferencia(diferencia, { decimales = 0, unidad = '' } = {}) {
  if (diferencia == null) return '-';
  const valor = Number(diferencia.toFixed(decimales));
  const signo = valor > 0 ? '+' : valor < 0 ? '-' : '';
  const numero = decimales ? formatoDecimal(Math.abs(valor)) : formatoEntero(Math.abs(valor));
  return `${signo}${numero}${unidad ? ` ${unidad}` : ''}`;
}

const sumarDias = (iso, n) => {
  const { a, m, d } = partes(iso);
  const f = new Date(Date.UTC(a, m - 1, d + n));
  return f.toISOString().slice(0, 10);
};
const diasEntreIso = (desde, hasta) => {
  const i = partes(desde);
  const f = partes(hasta);
  return Math.round((Date.UTC(f.a, f.m - 1, f.d) - Date.UTC(i.a, i.m - 1, i.d)) / 86400000);
};

// Período anterior de la misma duración, para la comparación. Solo hay período comparable cuando
// el filtro fija la fecha de inicio (el fin es la fecha fin del filtro o hoy). Del 1 al 29 de
// octubre (29 días) → del 2 al 30 de septiembre. Devuelve { fecha_inicio, fecha_fin } o null.
export function periodoAnterior(filtro, ahora = new Date()) {
  if (!filtro?.fecha_inicio) return null;
  const desde = filtro.fecha_inicio;
  const hasta = filtro.fecha_fin || fechaIso(ahora);
  const duracion = diasEntreIso(desde, hasta) + 1;
  if (duracion < 1) return null;
  return { fecha_inicio: sumarDias(desde, -duracion), fecha_fin: sumarDias(desde, -1) };
}

const ESTADOS_PENDIENTES = ['recibido', 'asignado', 'en_atencion'];
// Rangos de antigüedad de los pendientes (días desde el reporte hasta la fecha de generación).
export const RANGOS_ANTIGUEDAD = [
  { etiqueta: '0 a 7 días', min: 0, max: 7 },
  { etiqueta: '8 a 15 días', min: 8, max: 15 },
  { etiqueta: '16 a 30 días', min: 16, max: 30 },
  { etiqueta: 'Más de 30 días', min: 31, max: Infinity },
];

// Convierte una fila del endpoint en la fila de los archivos, con sus días calculados.
function filaReporte(r, ahora) {
  const fechaReporte = new Date(r.fecha_reporte);
  const fechaAsignacion = r.fecha_asignacion ? new Date(r.fecha_asignacion) : null;
  const fechaResolucion = r.nombre_estado === 'resuelto' && r.fecha_resolucion ? new Date(r.fecha_resolucion) : null;
  const pendiente = ESTADOS_PENDIENTES.includes(r.nombre_estado);
  return {
    codigo: r.codigo_seguimiento,
    fechaReporte,
    tipo: r.nombre_tipo,
    claveEstado: r.nombre_estado,
    estado: etiquetaEstado(r.nombre_estado),
    municipalidad: r.municipalidad,
    municipalidadCorta: nombreCortoMunicipalidad(r.municipalidad),
    encargado: r.encargado_asignado || '',
    fechaAsignacion,
    // Días del reporte a la primera asignación (solo los asignados alguna vez).
    diasAsignacion: fechaAsignacion ? Math.max(0, diasCalendario(fechaReporte, fechaAsignacion)) : null,
    fechaResolucion,
    // Días del reporte a la resolución (solo los resueltos).
    dias: fechaResolucion ? Math.max(0, diasCalendario(fechaReporte, fechaResolucion)) : null,
    // Días de la asignación a la resolución (resueltos con fecha de asignación).
    diasAsignacionResolucion: fechaResolucion && fechaAsignacion
      ? Math.max(0, diasCalendario(fechaAsignacion, fechaResolucion)) : null,
    // Antigüedad de un pendiente: días desde el reporte hasta la generación del informe.
    antiguedad: pendiente ? Math.max(0, diasCalendario(fechaReporte, ahora)) : null,
    latitud: Number(r.latitud),
    longitud: Number(r.longitud),
    enlaceMapa: `https://www.google.com/maps?q=${Number(r.latitud)},${Number(r.longitud)}`,
  };
}

const valores = (filas, campo) => filas.map((f) => f[campo]).filter((v) => v !== null);
const contar = (filas, ...estados) => filas.filter((f) => estados.includes(f.claveEstado)).length;

// Conteos y promedios de un grupo de reportes (una fila de "Atención por tipo", "Por municipalidad"
// o la fila de totales).
function resumenGrupo(filas) {
  const descartados = contar(filas, 'descartado');
  const resueltos = contar(filas, 'resuelto');
  return {
    recibidosPeriodo: filas.length,
    resueltos,
    enProceso: contar(filas, 'asignado', 'en_atencion'),
    sinAsignar: contar(filas, 'recibido'),
    descartados,
    porcentajeResuelto: filas.length - descartados > 0 ? resueltos / (filas.length - descartados) : null,
    promedioAsignacion: promedio(valores(filas, 'diasAsignacion')),
    promedioResolucion: promedio(valores(filas, 'dias')),
  };
}

function agrupar(filas, clave) {
  const grupos = new Map();
  for (const f of filas) {
    const k = clave(f);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(f);
  }
  return grupos;
}

// Arma todo lo que muestran la pantalla y los archivos a partir de lo que cargó la vista.
//   resumen, porTipo, listado: respuestas de /api/estadisticas/* del período
//   listadoAnterior: /api/estadisticas/reportes del período anterior (o null si no es comparable)
//   municipalidad: nombre que encabeza el reporte; todas: administrador sin filtro de municipalidad
//   filtro: { fecha_inicio?, fecha_fin? } aplicado (o null); usuario: el de la sesión
export function calcularReporte({
  resumen, porTipo, listado, listadoAnterior = null, municipalidad, todas, filtro, usuario, ahora = new Date(),
}) {
  const cuenta = (estado) => resumen?.por_estado?.[estado] ?? 0;
  const total = resumen?.total ?? 0;
  const resueltos = cuenta('resuelto');
  const descartados = cuenta('descartado');
  const sinDescartados = total - descartados;

  const filas = listado.map((r) => filaReporte(r, ahora));

  // Período: el del filtro; lo que falte, desde el primer reporte y hasta hoy.
  const hoy = fechaIso(ahora);
  const primerReporte = filas.length
    ? fechaIso(new Date(filas.reduce((min, f) => Math.min(min, f.fechaReporte.getTime()), Infinity)))
    : hoy;
  const desde = filtro?.fecha_inicio || primerReporte;
  const hasta = filtro?.fecha_fin || hoy;

  // Por estado, en el orden del flujo: mismas cantidades y colores que la gráfica de dona.
  const estados = ORDEN_ESTADOS.map((clave) => ({
    clave,
    etiqueta: ESTADOS[clave].plural,
    color: ESTADOS[clave].color,
    cantidad: cuenta(clave),
    fraccion: total ? cuenta(clave) / total : 0,
  }));

  const indicadores = {
    total,
    resueltos,
    enAtencion: cuenta('en_atencion'),
    asignados: cuenta('asignado'),
    recibidos: cuenta('recibido'),
    descartados,
    enProceso: cuenta('asignado') + cuenta('en_atencion'),
    sinAsignar: cuenta('recibido'),
    pendientes: cuenta('recibido') + cuenta('asignado') + cuenta('en_atencion'),
    porcentajeResuelto: sinDescartados > 0 ? resueltos / sinDescartados : null,
    promedioDiasAsignacion: promedio(valores(filas, 'diasAsignacion')),
    promedioDias: promedio(valores(filas, 'dias')),
  };

  // Comparación con el período anterior de la misma duración (mismo alcance y filtros).
  const anterior = periodoAnterior(filtro, ahora);
  let comparacion = { disponible: false, nota: 'Sin período anterior comparable' };
  if (anterior && listadoAnterior) {
    const filasAnteriores = listadoAnterior.map((r) => filaReporte(r, ahora));
    const previo = {
      total: filasAnteriores.length,
      resueltos: contar(filasAnteriores, 'resuelto'),
      promedioDias: promedio(valores(filasAnteriores, 'dias')),
    };
    const diferenciaDias = indicadores.promedioDias != null && previo.promedioDias != null
      ? indicadores.promedioDias - previo.promedioDias : null;
    comparacion = {
      disponible: true,
      desde: anterior.fecha_inicio,
      hasta: anterior.fecha_fin,
      periodo: periodoEnTexto(anterior.fecha_inicio, anterior.fecha_fin),
      filas: [
        { indicador: 'Total de reportes', actual: total, anterior: previo.total, diferencia: total - previo.total, decimales: 0 },
        { indicador: 'Resueltos', actual: resueltos, anterior: previo.resueltos, diferencia: resueltos - previo.resueltos, decimales: 0 },
        { indicador: 'Días promedio hasta la resolución', actual: indicadores.promedioDias, anterior: previo.promedioDias, diferencia: diferenciaDias, decimales: 1, unidad: 'días' },
      ],
    };
  }

  // Atención por tipo de incidencia: todos los tipos del catálogo (en el orden de la gráfica).
  const porTipoFilas = agrupar(filas, (f) => f.tipo);
  const nombresTipos = [...porTipo.map((t) => t.nombre_tipo), ...[...porTipoFilas.keys()].filter((t) => !porTipo.some((p) => p.nombre_tipo === t))];
  const atencionPorTipo = nombresTipos.map((tipo) => ({ tipo, ...resumenGrupo(porTipoFilas.get(tipo) || []) }));

  // Desempeño por cuadrilla: solo reportes con encargado, ordenados por cantidad asignada.
  // Un reporte con encargado está asignado (por iniciar), en atención o resuelto (el flujo solo
  // permite descartar reportes recibidos), así que esas tres columnas suman el total asignado.
  const desempeno = (encargado, grupo) => ({
    encargado,
    asignados: grupo.length,
    porIniciar: contar(grupo, 'asignado'),
    enAtencion: contar(grupo, 'en_atencion'),
    resueltos: contar(grupo, 'resuelto'),
    promedioAsignacionResolucion: promedio(valores(grupo, 'diasAsignacionResolucion')),
  });
  const conEncargado = filas.filter((f) => f.encargado);
  const cuadrillas = [...agrupar(conEncargado, (f) => f.encargado)]
    .map(([encargado, grupo]) => desempeno(encargado, grupo))
    .sort((a, b) => b.asignados - a.asignados || a.encargado.localeCompare(b.encargado, 'es'));

  // Pendientes (recibidos, asignados o en atención) por antigüedad.
  const pendientes = filas
    .filter((f) => f.antiguedad !== null)
    .sort((a, b) => b.antiguedad - a.antiguedad || a.fechaReporte - b.fechaReporte);
  const antiguedad = RANGOS_ANTIGUEDAD.map((rango) => {
    const grupo = pendientes.filter((f) => f.antiguedad >= rango.min && f.antiguedad <= rango.max);
    return {
      rango: rango.etiqueta,
      recibidos: contar(grupo, 'recibido'),
      asignados: contar(grupo, 'asignado'),
      enAtencion: contar(grupo, 'en_atencion'),
      total: grupo.length,
    };
  });

  // Por municipalidad: solo en el reporte de todas.
  const porMunicipalidad = todas
    ? [...agrupar(filas, (f) => f.municipalidadCorta)]
      .map(([nombre, grupo]) => ({ municipalidad: nombre, ...resumenGrupo(grupo) }))
      .sort((a, b) => b.recibidosPeriodo - a.recibidosPeriodo || a.municipalidad.localeCompare(b.municipalidad, 'es'))
    : null;

  const nombreUsuario = usuario?.nombre_completo || 'usuario del sistema';
  return {
    titulo: TITULO_REPORTE,
    municipalidad,
    // Con una sola municipalidad (coordinador, o administrador con filtro) la columna
    // "Municipalidad" se omite en los archivos: ya está en el encabezado.
    todas: Boolean(todas),
    desde,
    hasta,
    periodo: periodoEnTexto(desde, hasta),
    fechaGeneracion: ahora,
    elaboradoPor: nombreUsuario,
    generado: `Generado el ${fechaHora(ahora)} por ${nombreUsuario}`,
    nombreArchivo: `reporte_${todas ? 'todas' : nombreParaArchivo(municipalidad)}_${desde}_a_${hasta}`,
    indicadores,
    comparacion,
    estados,
    atencionPorTipo,
    totalPorTipo: { tipo: 'Total', ...resumenGrupo(filas) },
    cuadrillas,
    totalCuadrillas: desempeno('Total', conEncargado),
    antiguedad,
    totalAntiguedad: {
      rango: 'Total',
      recibidos: contar(pendientes, 'recibido'),
      asignados: contar(pendientes, 'asignado'),
      enAtencion: contar(pendientes, 'en_atencion'),
      total: pendientes.length,
    },
    pendientes,
    pendientesMasAntiguos: pendientes.slice(0, 10),
    porMunicipalidad,
    filas,
  };
}

// Descarga un Blob con el nombre indicado.
export function descargarArchivo(blob, nombre) {
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}
