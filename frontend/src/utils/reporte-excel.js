// Excel (.xlsx) de la reportería de Estadísticas, con ExcelJS. Se carga bajo demanda (import()
// dinámico desde la vista), así ExcelJS no entra al paquete principal.
// Recibe el objeto de calcularReporte() (utils/reporteria.js) y devuelve un Blob.
// Hojas: Resumen, Por tipo, Por cuadrilla, Pendientes, Por municipalidad (solo en el de todas)
// y Reportes.
import ExcelJS from 'exceljs';
import {
  coloresDocumento, ESTADOS, fechaHora, formatoEntero, formatoDecimal, formatoPorcentaje, formatoDiferencia,
} from './reporteria.js';

const argb = (hex) => `FF${hex.replace('#', '').toUpperCase()}`;
const FUENTE = 'Calibri';

// Formatos numéricos de Excel.
const ENTERO = '#,##0';
const DECIMAL = '0.0';
const PORCENTAJE = '0.0%';
const FECHA = 'dd/mm/yyyy hh:mm';
const DIFERENCIA_ENTERO = '+#,##0;-#,##0;0';
const DIFERENCIA_DIAS = '+0.0" días";-0.0" días";0.0" días"';

// Texto visible de un valor, para calcular el ancho de su columna.
const TEXTO_FORMATO = {
  [ENTERO]: (v) => formatoEntero(v),
  [DECIMAL]: (v) => formatoDecimal(v),
  [PORCENTAJE]: (v) => formatoPorcentaje(v),
  [FECHA]: () => '00/00/0000 00:00',
  [DIFERENCIA_ENTERO]: (v) => formatoDiferencia(v),
  [DIFERENCIA_DIAS]: (v) => formatoDiferencia(v, { decimales: 1, unidad: 'días' }),
};

// ExcelJS guarda las fechas en UTC: se pasa la hora local como si fuera UTC para que Excel
// muestre la misma hora que la pantalla.
const fechaExcel = (d) => (d
  ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()))
  : null);

// Ancho de columna: el texto más largo (encabezado o datos) más un margen para la flecha del
// autofiltro, entre 12 y 40 caracteres.
const ANCHO_MIN = 12;
const ANCHO_MAX = 40;
const anchoPara = (textos) => Math.min(Math.max(Math.max(0, ...textos.map((t) => String(t ?? '').length)) + 3, ANCHO_MIN), ANCHO_MAX);

// ExcelJS junta las columnas contiguas con el mismo ancho en un solo rango (<col min="5" max="6">).
// Excel lo interpreta bien, pero otros lectores aplican el ancho solo a la primera columna y la
// siguiente queda sin ancho. Para que cada columna lleve su propio <col>, un ancho igual al de la
// columna anterior se corre 0.01 (imperceptible).
function fijarAnchos(hoja, anchos) {
  const finales = [];
  anchos.forEach((ancho, i) => {
    let w = ancho;
    if (i > 0 && w === finales[i - 1]) w = w < ANCHO_MAX ? w + 0.01 : w - 0.01;
    finales.push(w);
  });
  hoja.columns = finales.map((width) => ({ width }));
}

function prepararImpresion(hoja, filaTitulos) {
  hoja.pageSetup = {
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    ...(filaTitulos ? { printTitlesRow: `${filaTitulos}:${filaTitulos}` } : {}),
  };
  hoja.headerFooter = { oddFooter: '&R&"Calibri"&9Página &P de &N' };
}

export async function generarExcel(rep) {
  const c = coloresDocumento();
  const borde = { style: 'thin', color: { argb: argb(c.borde) } };
  const bordes = { top: borde, left: borde, bottom: borde, right: borde };
  const fuente = (extra = {}) => ({ name: FUENTE, size: 11, color: { argb: argb(c.texto) }, ...extra });

  const libro = new ExcelJS.Workbook();
  libro.creator = 'EcoReporte GT';
  libro.created = rep.fechaGeneracion;
  libro.title = `${rep.titulo} - ${rep.municipalidad}`;

  // Hoja con registro del texto de cada columna, para calcular los anchos al final.
  function nuevaHoja(nombre) {
    const hoja = libro.addWorksheet(nombre, { views: [{ showGridLines: false }] });
    const textos = [];
    const anotar = (col, texto) => { (textos[col - 1] ||= []).push(texto); };
    // Toda columna usada (también las de encabezados combinados o notas) lleva su ancho; las que
    // no tienen texto de tabla quedan con el mínimo.
    const cerrar = () => fijarAnchos(hoja, Array.from(
      { length: Math.max(textos.length, hoja.actualColumnCount) },
      (_, i) => anchoPara(textos[i] || [''])
    ));
    return { hoja, anotar, cerrar };
  }

  // Escribe un valor con su formato (null → '-' en las tablas de indicadores, vacío en el resto).
  function escribir(celda, valor, { formato, guion } = {}) {
    if (valor == null) {
      celda.value = guion ? '-' : null;
    } else {
      celda.value = valor;
      if (formato) celda.numFmt = formato;
    }
  }

  // Tabla con encabezado verde, filas alternas y bordes finos.
  //   columnas: [{ titulo, valor(d), formato? (o función de la fila), derecha?, texto?(d), color?(d), enlace? }]
  //   total: fila de totales (mismo formato que los datos) o null
  //   Devuelve la fila del último dato (sin contar la de totales).
  function tabla({ hoja, anotar }, filaInicio, columnas, datos, { total = null, guion = false } = {}) {
    columnas.forEach((col, j) => {
      const celda = hoja.getCell(filaInicio, j + 1);
      celda.value = col.titulo;
      celda.font = fuente({ bold: true, color: { argb: 'FFFFFFFF' } });
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.verdeOscuro) } };
      celda.border = bordes;
      celda.alignment = { vertical: 'middle', wrapText: false, ...(col.derecha ? { horizontal: 'right' } : {}) };
      anotar(j + 1, col.titulo);
    });
    hoja.getRow(filaInicio).height = 20;

    const filas = total ? [...datos, total] : datos;
    filas.forEach((d, i) => {
      const fila = filaInicio + 1 + i;
      const esTotal = total && i === datos.length;
      columnas.forEach((col, j) => {
        const celda = hoja.getCell(fila, j + 1);
        const valor = col.valor(d);
        const formato = typeof col.formato === 'function' ? col.formato(d) : col.formato;
        escribir(celda, valor, { formato, guion });
        const texto = col.texto ? col.texto(d)
          : valor == null ? (guion ? '-' : '')
            : formato && TEXTO_FORMATO[formato] ? TEXTO_FORMATO[formato](valor) : String(valor);
        anotar(j + 1, texto);
        let color = c.texto;
        if (col.color && !esTotal) color = col.color(d) || c.texto;
        if (col.enlace) color = c.verde;
        celda.font = fuente({ bold: Boolean(esTotal), color: { argb: argb(color) }, ...(col.enlace ? { underline: true } : {}) });
        celda.border = esTotal ? { ...bordes, top: { style: 'thin', color: { argb: argb(c.texto) } } } : bordes;
        celda.alignment = { vertical: 'middle', ...((col.derecha || (valor == null && guion)) ? { horizontal: 'right' } : {}) };
        if (!esTotal && i % 2 === 1) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.filaAlterna) } };
      });
    });
    return filaInicio + datos.length;
  }

  // Fila inmovilizada y autofiltro sobre la tabla (sin la fila de totales).
  function filtrar(hoja, filaEncabezado, ultimaFila, columnas) {
    hoja.views = [{ state: 'frozen', ySplit: filaEncabezado, showGridLines: false }];
    hoja.autoFilter = { from: { row: filaEncabezado, column: 1 }, to: { row: Math.max(ultimaFila, filaEncabezado), column: columnas } };
  }

  const nota = (hoja, fila, texto) => {
    const celda = hoja.getCell(fila, 1);
    celda.value = texto;
    celda.font = fuente({ color: { argb: argb(c.gris) } });
  };
  const estadoColor = (d) => ESTADOS[d.claveEstado]?.colorTexto;

  // ---------------- Hoja "Resumen": indicadores y comparación ----------------
  const resumen = nuevaHoja('Resumen');
  const ind = rep.indicadores;
  [
    [rep.titulo, fuente({ bold: true, size: 14, color: { argb: argb(c.verdeOscuro) } })],
    [rep.municipalidad, fuente({ bold: true })],
    [`Período: ${rep.periodo}`, fuente()],
    [rep.generado, fuente({ color: { argb: argb(c.gris) } })],
  ].forEach(([texto, estilo], i) => {
    resumen.hoja.mergeCells(i + 1, 1, i + 1, 4);
    const celda = resumen.hoja.getCell(i + 1, 1);
    celda.value = texto;
    celda.font = estilo;
  });
  resumen.hoja.getRow(1).height = 22;

  tabla(resumen, 6, [
    { titulo: 'Indicador', valor: (d) => d[0] },
    { titulo: 'Valor', valor: (d) => d[1], formato: (d) => d[2], derecha: true },
  ], [
    ['Total de reportes', ind.total, ENTERO],
    ['Resueltos', ind.resueltos, ENTERO],
    ['En atención', ind.enAtencion, ENTERO],
    ['Asignados', ind.asignados, ENTERO],
    ['Recibidos (sin asignar)', ind.recibidos, ENTERO],
    ['Descartados', ind.descartados, ENTERO],
    ['Porcentaje resuelto, sin descartados', ind.porcentajeResuelto, PORCENTAJE],
    ['Días promedio hasta la asignación', ind.promedioDiasAsignacion, DECIMAL],
    ['Días promedio hasta la resolución', ind.promedioDias, DECIMAL],
  ], { guion: true });

  const titulo = (hoja, fila, texto) => {
    const celda = hoja.getCell(fila, 1);
    celda.value = texto;
    celda.font = fuente({ bold: true, color: { argb: argb(c.verdeOscuro) } });
  };
  titulo(resumen.hoja, 17, 'Comparación con el período anterior');
  if (rep.comparacion.disponible) {
    nota(resumen.hoja, 18, `Período anterior: ${rep.comparacion.periodo}`);
    const formatoValor = (d) => (d.decimales ? DECIMAL : ENTERO);
    tabla(resumen, 19, [
      { titulo: 'Indicador', valor: (d) => d.indicador },
      { titulo: 'Período actual', valor: (d) => d.actual, formato: formatoValor, derecha: true },
      { titulo: 'Período anterior', valor: (d) => d.anterior, formato: formatoValor, derecha: true },
      { titulo: 'Diferencia', valor: (d) => d.diferencia, formato: (d) => (d.decimales ? DIFERENCIA_DIAS : DIFERENCIA_ENTERO), derecha: true },
    ], rep.comparacion.filas, { guion: true });
  } else {
    nota(resumen.hoja, 18, rep.comparacion.nota);
  }
  resumen.cerrar();
  prepararImpresion(resumen.hoja);

  // ---------------- Hoja "Por tipo": atención por tipo de incidencia ----------------
  const porTipo = nuevaHoja('Por tipo');
  const columnasTipo = [
    { titulo: 'Tipo de incidencia', valor: (d) => d.tipo },
    { titulo: 'Recibidos en el período', valor: (d) => d.recibidosPeriodo, formato: ENTERO, derecha: true },
    { titulo: 'Resueltos', valor: (d) => d.resueltos, formato: ENTERO, derecha: true },
    { titulo: 'En proceso', valor: (d) => d.enProceso, formato: ENTERO, derecha: true },
    { titulo: 'Pendientes de asignar', valor: (d) => d.sinAsignar, formato: ENTERO, derecha: true },
    { titulo: 'Descartados', valor: (d) => d.descartados, formato: ENTERO, derecha: true },
    { titulo: 'Días promedio hasta la asignación', valor: (d) => d.promedioAsignacion, formato: DECIMAL, derecha: true },
    { titulo: 'Días promedio hasta la resolución', valor: (d) => d.promedioResolucion, formato: DECIMAL, derecha: true },
  ];
  if (rep.filas.length) {
    const ultima = tabla(porTipo, 1, columnasTipo, rep.atencionPorTipo, { total: rep.totalPorTipo, guion: true });
    filtrar(porTipo.hoja, 1, ultima, columnasTipo.length);
  } else {
    tabla(porTipo, 1, columnasTipo, []);
    nota(porTipo.hoja, 2, 'No hay reportes en el período.');
    filtrar(porTipo.hoja, 1, 1, columnasTipo.length);
  }
  porTipo.cerrar();
  prepararImpresion(porTipo.hoja, 1);

  // ---------------- Hoja "Por cuadrilla": desempeño por encargado ----------------
  const porCuadrilla = nuevaHoja('Por cuadrilla');
  // Por iniciar + En atención + Resueltos = Asignados (total).
  const columnasCuadrilla = [
    { titulo: 'Encargado de cuadrilla', valor: (d) => d.encargado },
    { titulo: 'Asignados (total)', valor: (d) => d.asignados, formato: ENTERO, derecha: true },
    { titulo: 'Por iniciar', valor: (d) => d.porIniciar, formato: ENTERO, derecha: true },
    { titulo: 'En atención', valor: (d) => d.enAtencion, formato: ENTERO, derecha: true },
    { titulo: 'Resueltos', valor: (d) => d.resueltos, formato: ENTERO, derecha: true },
    { titulo: 'Días promedio de asignación a resolución', valor: (d) => d.promedioAsignacionResolucion, formato: DECIMAL, derecha: true },
  ];
  const ultimaCuadrilla = tabla(porCuadrilla, 1, columnasCuadrilla, rep.cuadrillas, {
    total: rep.cuadrillas.length ? rep.totalCuadrillas : null, guion: true,
  });
  if (!rep.cuadrillas.length) nota(porCuadrilla.hoja, 2, 'No hay reportes asignados a cuadrillas en el período.');
  filtrar(porCuadrilla.hoja, 1, ultimaCuadrilla, columnasCuadrilla.length);
  porCuadrilla.cerrar();
  prepararImpresion(porCuadrilla.hoja, 1);

  // ---------------- Hoja "Pendientes": antigüedad y lista completa ----------------
  const pendientes = nuevaHoja('Pendientes');
  if (rep.pendientes.length) {
    tabla(pendientes, 1, [
      { titulo: 'Antigüedad', valor: (d) => d.rango },
      { titulo: 'Recibidos', valor: (d) => d.recibidos, formato: ENTERO, derecha: true },
      { titulo: 'Asignados', valor: (d) => d.asignados, formato: ENTERO, derecha: true },
      { titulo: 'En atención', valor: (d) => d.enAtencion, formato: ENTERO, derecha: true },
      { titulo: 'Total', valor: (d) => d.total, formato: ENTERO, derecha: true },
    ], rep.antiguedad, { total: rep.totalAntiguedad });
    const filaLista = rep.antiguedad.length + 4; // tabla de antigüedad + totales + una fila libre
    const columnasPendientes = [
      { titulo: 'Código', valor: (d) => d.codigo },
      { titulo: 'Fecha del reporte', valor: (d) => fechaExcel(d.fechaReporte), formato: FECHA },
      { titulo: 'Tipo de incidencia', valor: (d) => d.tipo },
      { titulo: 'Estado', valor: (d) => d.estado, color: estadoColor },
      ...(rep.todas ? [{ titulo: 'Municipalidad', valor: (d) => d.municipalidadCorta }] : []),
      { titulo: 'Encargado de cuadrilla', valor: (d) => d.encargado || null },
      { titulo: 'Días transcurridos', valor: (d) => d.antiguedad, formato: '0', derecha: true },
    ];
    const ultima = tabla(pendientes, filaLista, columnasPendientes, rep.pendientes);
    filtrar(pendientes.hoja, filaLista, ultima, columnasPendientes.length);
    prepararImpresion(pendientes.hoja, filaLista);
  } else {
    nota(pendientes.hoja, 1, 'No hay reportes pendientes en el período.');
    prepararImpresion(pendientes.hoja);
  }
  pendientes.cerrar();

  // ---------------- Hoja "Por municipalidad" (solo en el de todas) ----------------
  if (rep.todas) {
    const porMunicipalidad = nuevaHoja('Por municipalidad');
    // Sin asignar + En proceso + Resueltos + Descartados = Recibidos en el período.
    const columnasMunicipalidad = [
      { titulo: 'Municipalidad', valor: (d) => d.municipalidad },
      { titulo: 'Recibidos en el período', valor: (d) => d.recibidosPeriodo, formato: ENTERO, derecha: true },
      { titulo: 'Sin asignar', valor: (d) => d.sinAsignar, formato: ENTERO, derecha: true },
      { titulo: 'En proceso', valor: (d) => d.enProceso, formato: ENTERO, derecha: true },
      { titulo: 'Resueltos', valor: (d) => d.resueltos, formato: ENTERO, derecha: true },
      { titulo: 'Descartados', valor: (d) => d.descartados, formato: ENTERO, derecha: true },
      { titulo: 'Porcentaje resuelto', valor: (d) => d.porcentajeResuelto, formato: PORCENTAJE, derecha: true },
      { titulo: 'Días promedio hasta la resolución', valor: (d) => d.promedioResolucion, formato: DECIMAL, derecha: true },
    ];
    const ultima = tabla(porMunicipalidad, 1, columnasMunicipalidad, rep.porMunicipalidad, {
      total: rep.porMunicipalidad.length ? { ...rep.totalPorTipo, municipalidad: 'Total' } : null, guion: true,
    });
    if (!rep.porMunicipalidad.length) nota(porMunicipalidad.hoja, 2, 'No hay reportes en el período.');
    filtrar(porMunicipalidad.hoja, 1, ultima, columnasMunicipalidad.length);
    porMunicipalidad.cerrar();
    prepararImpresion(porMunicipalidad.hoja, 1);
  }

  // ---------------- Hoja "Reportes": listado completo ----------------
  // "Municipalidad" solo va en el reporte de todas las municipalidades.
  const reportes = nuevaHoja('Reportes');
  const columnasReportes = [
    { titulo: 'Código', valor: (f) => f.codigo },
    { titulo: 'Fecha del reporte', valor: (f) => fechaExcel(f.fechaReporte), formato: FECHA, texto: (f) => fechaHora(f.fechaReporte) },
    { titulo: 'Tipo de incidencia', valor: (f) => f.tipo },
    { titulo: 'Estado', valor: (f) => f.estado, color: estadoColor },
    ...(rep.todas ? [{ titulo: 'Municipalidad', valor: (f) => f.municipalidadCorta }] : []),
    { titulo: 'Encargado de cuadrilla', valor: (f) => f.encargado || null },
    { titulo: 'Fecha de asignación', valor: (f) => fechaExcel(f.fechaAsignacion), formato: FECHA, texto: (f) => fechaHora(f.fechaAsignacion) },
    { titulo: 'Días hasta la asignación', valor: (f) => f.diasAsignacion, formato: '0', derecha: true },
    { titulo: 'Fecha de resolución', valor: (f) => fechaExcel(f.fechaResolucion), formato: FECHA, texto: (f) => fechaHora(f.fechaResolucion) },
    { titulo: 'Días hasta la resolución', valor: (f) => f.dias, formato: '0', derecha: true },
    { titulo: 'Ubicación', valor: (f) => ({ text: 'Ver en el mapa', hyperlink: f.enlaceMapa }), texto: () => 'Ver en el mapa', enlace: true },
  ];
  const ultimaReporte = tabla(reportes, 1, columnasReportes, rep.filas);
  filtrar(reportes.hoja, 1, ultimaReporte, columnasReportes.length);
  reportes.cerrar();
  prepararImpresion(reportes.hoja, 1);

  const buffer = await libro.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
