// PDF de la reportería de Estadísticas, con jsPDF + jspdf-autotable. Se carga bajo demanda
// (import() dinámico desde la vista), así estas librerías no entran al paquete principal.
// Recibe el objeto de calcularReporte() (utils/reporteria.js) y los <canvas> de las dos gráficas
// de la pantalla; devuelve un Blob.
// Helvetica es una fuente estándar de PDF con codificación WinAnsi: cubre tildes, ñ, ü y "·".
//
// Estructura (A4 horizontal):
//   1. Encabezado, indicadores, comparación con el período anterior y las dos gráficas.
//   2. Atención por tipo de incidencia, Desempeño por cuadrilla y (en el de todas) Por municipalidad.
//   3. Pendientes por antigüedad y Pendientes más antiguos.
//   4. Listado de reportes y, al final, el bloque de elaboración y revisión.
// Sin reportes en el período, las secciones van seguidas, cada una con su línea "No hay…".
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { Chart } from 'chart.js';
import {
  coloresDocumento, fechaHora, formatoEntero, formatoDecimal, formatoPorcentaje, formatoDiferencia,
  SIN_REPORTES, ESTADOS,
} from './reporteria.js';

const ANCHO = 297; // A4 horizontal, en mm
const ALTO = 210;
const M = 15; // margen
const LIMITE = ALTO - M - 9; // donde termina el contenido: debajo va el pie
const ESCALA_IMAGEN = 3; // píxeles por punto CSS al exportar las gráficas
const PADDING_X = 2;

// Fondo blanco para la imagen exportada (el canvas de la pantalla es transparente).
const fondoBlanco = {
  id: 'fondoBlanco',
  beforeDraw(grafica) {
    const { ctx, width, height } = grafica;
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  },
};

// Vuelve a dibujar la gráfica de un <canvas> de la pantalla (mismo tipo, datos y opciones) en un
// lienzo fuera de la vista, a mayor resolución y sin animación, y la devuelve como PNG opaco con
// fondo #FFFFFF. relleno: margen interno de la gráfica (en px CSS).
// Así la gráfica en pantalla no cambia mientras se genera el PDF.
function imagenDeGrafica(canvas, ancho, alto, relleno) {
  const original = canvas ? Chart.getChart(canvas) : null;
  if (!original) return null;
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  lienzo.style.cssText = `position:fixed;left:-10000px;top:0;width:${ancho}px;height:${alto}px`;
  document.body.appendChild(lienzo);
  const opciones = original.config.options || {};
  const copia = new Chart(lienzo, {
    type: original.config.type,
    data: JSON.parse(JSON.stringify(original.config.data)),
    options: {
      ...opciones,
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      devicePixelRatio: ESCALA_IMAGEN,
      layout: { padding: relleno },
      plugins: { ...(opciones.plugins || {}), tooltip: { enabled: false } },
    },
    plugins: [fondoBlanco],
  });
  // Copia a un lienzo sin canal alfa: la imagen queda totalmente opaca.
  const opaco = document.createElement('canvas');
  opaco.width = lienzo.width;
  opaco.height = lienzo.height;
  const ctx = opaco.getContext('2d', { alpha: false });
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, opaco.width, opaco.height);
  ctx.drawImage(lienzo, 0, 0);
  const imagen = opaco.toDataURL('image/png');
  copia.destroy();
  lienzo.remove();
  return imagen;
}

const valorODash = (v, formato) => (v == null ? '-' : formato(v));

export async function generarPdf(rep, graficas = {}) {
  const c = coloresDocumento();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: `${rep.titulo} - ${rep.municipalidad}`, creator: 'EcoReporte GT' });
  doc.setFont('helvetica', 'normal');
  const ind = rep.indicadores;
  const hayReportes = rep.filas.length > 0;

  const texto = (contenido, x, y, { tamano = 10, estilo = 'normal', color = c.texto, alinear = 'left' } = {}) => {
    doc.setFont('helvetica', estilo);
    doc.setFontSize(tamano);
    doc.setTextColor(color);
    doc.text(String(contenido), x, y, { align: alinear });
  };
  const anchoTexto = (contenido, tamano, estilo = 'normal') => {
    doc.setFont('helvetica', estilo);
    doc.setFontSize(tamano);
    return doc.getTextWidth(String(contenido));
  };

  // Tabla con el estilo del documento: encabezado verde que se repite, filas alternas, fila de
  // totales opcional y ninguna fila partida entre páginas.
  const tabla = (y, { head, body, foot, columnStyles = {}, derecha = [], ancho, didParseCell, rellenoY = 1.7 }) => {
    autoTable(doc, {
      startY: y,
      margin: { top: M, right: ancho ? ANCHO - M - ancho : M, bottom: ALTO - LIMITE, left: M },
      theme: 'grid',
      showHead: 'everyPage',
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      head: [head],
      body,
      ...(foot ? { foot: [foot] } : {}),
      styles: {
        font: 'helvetica', fontSize: 8.5, textColor: c.texto, lineColor: c.borde, lineWidth: 0.1,
        cellPadding: { top: rellenoY, bottom: rellenoY, left: PADDING_X, right: PADDING_X }, valign: 'middle', overflow: 'linebreak',
      },
      headStyles: { fillColor: c.verdeOscuro, textColor: '#FFFFFF', fontStyle: 'bold', lineColor: c.verdeOscuro },
      bodyStyles: { fillColor: '#FFFFFF' },
      footStyles: { fillColor: '#FFFFFF', textColor: c.texto, fontStyle: 'bold', lineColor: c.borde },
      alternateRowStyles: { fillColor: c.filaAlterna },
      columnStyles,
      didParseCell(dato) {
        if (derecha.includes(dato.column.index)) dato.cell.styles.halign = 'right';
        if (dato.section === 'head') dato.cell.styles.fontSize = 8.5;
        didParseCell?.(dato);
      },
    });
    return doc.lastAutoTable.finalY;
  };

  // Ancho mínimo para que un encabezado (negrita, 8.5 pt) quepa en dos líneas como máximo,
  // cortando entre palabras.
  const anchoEncabezado = (titulo) => {
    const palabras = String(titulo).split(' ');
    let mejor = anchoTexto(titulo, 8.5, 'bold');
    for (let i = 1; i < palabras.length; i++) {
      mejor = Math.min(mejor, Math.max(
        anchoTexto(palabras.slice(0, i).join(' '), 8.5, 'bold'),
        anchoTexto(palabras.slice(i).join(' '), 8.5, 'bold'),
      ));
    }
    return mejor;
  };
  const HOLGURA = 1; // mm, para que el redondeo no agregue una línea
  const RELLENO_RESUMEN = 1.3; // relleno vertical de las tablas de resumen
  const LINEA = 3.45; // alto de una línea de 8.5 pt
  // Alto de una tabla de resumen (encabezado en dos líneas, filas de una línea), para empezarla en
  // otra página si no cabe entera.
  const altoResumen = (filas) => 2 * LINEA + 2 * RELLENO_RESUMEN + filas * (LINEA + 2 * RELLENO_RESUMEN) + 1;
  const ESPACIO_TITULO = 8;
  const SEPARACION = 6; // entre una tabla y el título siguiente

  // Tabla de resumen: la primera columna (tipo, encargado, municipalidad…) en una sola línea y las
  // numéricas, alineadas a la derecha, con el ancho de su encabezado en dos líneas como máximo (o
  // el de su contenido, si es mayor). La tabla ocupa solo la suma de esos anchos.
  const tablaResumen = (yInicio, { head, body, foot, didParseCell }) => {
    const filas = [...body, ...(foot ? [foot] : [])];
    const anchos = head.map((titulo, i) => {
      const contenido = Math.max(0, ...filas.map((f) => anchoTexto(f[i], 8.5, 'bold')));
      const encabezado = i === 0 ? anchoTexto(titulo, 8.5, 'bold') : anchoEncabezado(titulo);
      return Math.max(contenido, encabezado) + 2 * PADDING_X + HOLGURA;
    });
    return tabla(yInicio, {
      head, body, foot, didParseCell,
      rellenoY: RELLENO_RESUMEN,
      ancho: anchos.reduce((s, w) => s + w, 0),
      columnStyles: Object.fromEntries(anchos.map((w, i) => [i, { cellWidth: w }])),
      derecha: head.map((_, i) => i).filter((i) => i > 0),
    });
  };

  // Título de sección; si no queda lugar para el título y unas filas, pasa a una página nueva.
  let y = M;
  const seccion = (titulo, espacio = 30) => {
    if (y + espacio > LIMITE) {
      doc.addPage();
      y = M;
    }
    texto(titulo, M, y + 4, { tamano: 11, estilo: 'bold', color: c.verdeOscuro });
    y += ESPACIO_TITULO;
  };
  const lineaVacia = (contenido) => {
    texto(contenido, M, y + 3, { tamano: 9.5, color: c.gris });
    y += 12;
  };
  const nuevaPagina = () => {
    doc.addPage();
    y = M;
  };

  // ---------------- Página 1: encabezado ----------------
  texto('EcoReporte GT', M, M + 2, { tamano: 8, color: c.gris });
  texto(rep.generado, ANCHO - M, M + 2, { tamano: 8.5, color: c.gris, alinear: 'right' });
  texto(rep.titulo, M, M + 12, { tamano: 17, estilo: 'bold', color: c.verdeOscuro });
  texto(rep.municipalidad, M, M + 19.5, { tamano: 10.5, estilo: 'bold' });
  texto(`Período: ${rep.periodo}`, M, M + 25, { tamano: 10 });
  doc.setDrawColor(c.verde);
  doc.setLineWidth(0.35);
  doc.line(M, M + 30, ANCHO - M, M + 30);

  // ---------------- Indicadores ----------------
  const indicadores = [
    ['Total de reportes', formatoEntero(ind.total), ''],
    ['Resueltos', formatoEntero(ind.resueltos), ''],
    ['En proceso', formatoEntero(ind.enProceso), 'asignados y en atención'],
    ['Sin asignar', formatoEntero(ind.sinAsignar), 'recibidos'],
    ['Porcentaje resuelto', formatoPorcentaje(ind.porcentajeResuelto), 'sin contar descartados'],
    ['Días hasta la asignación', valorODash(ind.promedioDiasAsignacion, formatoDecimal), 'promedio'],
    ['Días hasta la resolución', valorODash(ind.promedioDias, formatoDecimal), 'promedio'],
  ];
  const anchoIndicador = (ANCHO - 2 * M) / indicadores.length;
  const yIndicadores = M + 39;
  indicadores.forEach(([etiqueta, valor, nota], i) => {
    const x = M + i * anchoIndicador;
    texto(etiqueta, x, yIndicadores, { tamano: 8.5, color: c.gris });
    texto(valor, x, yIndicadores + 8, { tamano: 16, estilo: 'bold' });
    if (nota) texto(nota, x, yIndicadores + 13, { tamano: 7.5, color: c.gris });
  });

  // ---------------- Comparación con el período anterior ----------------
  const yComparacion = M + 62;
  const tituloComparacion = 'Comparación con el período anterior';
  texto(tituloComparacion, M, yComparacion, { tamano: 10.5, estilo: 'bold', color: c.verdeOscuro });
  if (rep.comparacion.disponible) {
    const xPeriodo = M + anchoTexto(tituloComparacion, 10.5, 'bold') + 6;
    texto(`Período anterior: ${rep.comparacion.periodo}`, xPeriodo, yComparacion, { tamano: 9, color: c.gris });
    const formatoValor = (d, v) => valorODash(v, d.decimales ? formatoDecimal : formatoEntero);
    tablaResumen(yComparacion + 3, {
      head: ['Indicador', 'Período actual', 'Período anterior', 'Diferencia'],
      body: rep.comparacion.filas.map((d) => [
        d.indicador, formatoValor(d, d.actual), formatoValor(d, d.anterior),
        formatoDiferencia(d.diferencia, { decimales: d.decimales, unidad: d.unidad }),
      ]),
    });
  } else {
    texto(`${rep.comparacion.nota}.`, M, yComparacion + 6, { tamano: 9.5, color: c.gris });
  }

  // ---------------- Gráficas o período sin reportes ----------------
  // Debajo de la tabla de comparación; sin comparación, más arriba.
  const yGraficas = rep.comparacion.disponible ? M + 99 : M + 80;
  if (!hayReportes) {
    texto(SIN_REPORTES, M, yGraficas, { tamano: 10.5, color: c.gris });
    y = yGraficas + 10;
  } else {
    // Por estado: la dona a la izquierda y su leyenda con cantidades y porcentajes.
    texto('Reportes por estado', M, yGraficas, { tamano: 10.5, estilo: 'bold', color: c.verdeOscuro });
    const yImagen = yGraficas + 4;
    const lado = Math.min(68, LIMITE - yImagen);
    const dona = imagenDeGrafica(graficas.estado, 300, 300, 4);
    if (dona) {
      doc.addImage(dona, 'PNG', M, yImagen, lado, lado, undefined, 'FAST');
      texto(formatoEntero(ind.total), M + lado / 2, yImagen + lado / 2 + 1, { tamano: 14, estilo: 'bold', alinear: 'center' });
      texto(ind.total === 1 ? 'reporte' : 'reportes', M + lado / 2, yImagen + lado / 2 + 5.5, { tamano: 7.5, color: c.gris, alinear: 'center' });
    }
    const xLeyenda = M + lado + 10;
    let yFila = yImagen + (lado - rep.estados.length * 8) / 2 + 5;
    for (const e of rep.estados) {
      doc.setFillColor(e.color);
      doc.rect(xLeyenda, yFila - 2.8, 3, 3, 'F');
      texto(e.etiqueta, xLeyenda + 5.5, yFila, { tamano: 9.5 });
      texto(formatoEntero(e.cantidad), M + 112, yFila, { tamano: 9.5, estilo: 'bold', alinear: 'right' });
      texto(formatoPorcentaje(e.fraccion), M + 127, yFila, { tamano: 9, color: c.gris, alinear: 'right' });
      yFila += 8;
    }

    // Por tipo de incidencia: barras horizontales a la derecha. El margen interno a la derecha
    // evita que la barra más larga y el último número del eje toquen el borde de la imagen.
    const xTipos = M + 140;
    texto('Reportes por tipo de incidencia', xTipos, yGraficas, { tamano: 10.5, estilo: 'bold', color: c.verdeOscuro });
    const altoPx = Math.max(rep.atencionPorTipo.length * 44 + 40, 200);
    const barras = imagenDeGrafica(graficas.tipo, 640, altoPx, { top: 4, right: 28, bottom: 4, left: 4 });
    if (barras) {
      const maxAlto = LIMITE - yImagen;
      let w = ANCHO - M - xTipos;
      let h = (w * altoPx) / 640;
      if (h > maxAlto) {
        w = (w * maxAlto) / h;
        h = maxAlto;
      }
      doc.addImage(barras, 'PNG', xTipos, yImagen, w, h, undefined, 'FAST');
    }
    nuevaPagina();
  }

  // ---------------- Página 2: atención por tipo, cuadrillas y municipalidades ----------------
  const dias = (v) => valorODash(v, formatoDecimal);
  seccion('Atención por tipo de incidencia', hayReportes ? ESPACIO_TITULO + altoResumen(rep.atencionPorTipo.length + 1) : 30);
  if (hayReportes) {
    const fila = (d) => [
      d.tipo, formatoEntero(d.recibidosPeriodo), formatoEntero(d.resueltos), formatoEntero(d.enProceso),
      formatoEntero(d.sinAsignar), formatoEntero(d.descartados), dias(d.promedioAsignacion), dias(d.promedioResolucion),
    ];
    y = tablaResumen(y, {
      head: ['Tipo de incidencia', 'Recibidos en el período', 'Resueltos', 'En proceso', 'Pendientes de asignar',
        'Descartados', 'Días promedio hasta la asignación', 'Días promedio hasta la resolución'],
      body: rep.atencionPorTipo.map(fila),
      foot: fila(rep.totalPorTipo),
    }) + SEPARACION;
  } else {
    lineaVacia('No hay reportes en el período.');
  }

  seccion('Desempeño por cuadrilla', rep.cuadrillas.length ? ESPACIO_TITULO + altoResumen(rep.cuadrillas.length + 1) : 30);
  if (rep.cuadrillas.length) {
    // Por iniciar + En atención + Resueltos = Asignados (total).
    const fila = (d) => [
      d.encargado, formatoEntero(d.asignados), formatoEntero(d.porIniciar), formatoEntero(d.enAtencion),
      formatoEntero(d.resueltos), dias(d.promedioAsignacionResolucion),
    ];
    y = tablaResumen(y, {
      head: ['Encargado de cuadrilla', 'Asignados (total)', 'Por iniciar', 'En atención', 'Resueltos',
        'Días promedio de asignación a resolución'],
      body: rep.cuadrillas.map(fila),
      foot: fila(rep.totalCuadrillas),
    }) + SEPARACION;
  } else {
    lineaVacia('No hay reportes asignados a cuadrillas en el período.');
  }

  if (rep.todas) {
    seccion('Por municipalidad', rep.porMunicipalidad.length ? ESPACIO_TITULO + altoResumen(rep.porMunicipalidad.length + 1) : 30);
    if (rep.porMunicipalidad.length) {
      // Sin asignar + En proceso + Resueltos + Descartados = Recibidos en el período.
      const fila = (d) => [
        d.municipalidad, formatoEntero(d.recibidosPeriodo), formatoEntero(d.sinAsignar), formatoEntero(d.enProceso),
        formatoEntero(d.resueltos), formatoEntero(d.descartados), formatoPorcentaje(d.porcentajeResuelto),
        dias(d.promedioResolucion),
      ];
      y = tablaResumen(y, {
        head: ['Municipalidad', 'Recibidos en el período', 'Sin asignar', 'En proceso', 'Resueltos', 'Descartados',
          'Porcentaje resuelto', 'Días promedio hasta la resolución'],
        body: rep.porMunicipalidad.map(fila),
        foot: fila({ ...rep.totalPorTipo, municipalidad: 'Total' }),
      }) + SEPARACION;
    } else {
      lineaVacia('No hay reportes en el período.');
    }
  }

  // ---------------- Página 3: pendientes ----------------
  if (hayReportes) nuevaPagina();
  seccion('Pendientes por antigüedad');
  if (rep.pendientes.length) {
    texto('Recibidos, asignados o en atención; días desde el reporte hasta la fecha de generación.', M, y + 1, { tamano: 8.5, color: c.gris });
    y += 5;
    const fila = (d) => [d.rango, formatoEntero(d.recibidos), formatoEntero(d.asignados), formatoEntero(d.enAtencion), formatoEntero(d.total)];
    y = tablaResumen(y, {
      head: ['Antigüedad', 'Recibidos', 'Asignados', 'En atención', 'Total'],
      body: rep.antiguedad.map(fila),
      foot: fila(rep.totalAntiguedad),
    }) + 8;

    seccion('Pendientes más antiguos');
    y = tabla(y, {
      head: ['Código', 'Tipo de incidencia', 'Estado', ...(rep.todas ? ['Municipalidad'] : []), 'Días transcurridos', 'Encargado de cuadrilla'],
      body: rep.pendientesMasAntiguos.map((d) => [
        d.codigo, d.tipo, d.estado, ...(rep.todas ? [d.municipalidadCorta] : []), formatoEntero(d.antiguedad), d.encargado,
      ]),
      columnStyles: { 0: { fontStyle: 'bold' } },
      derecha: [rep.todas ? 4 : 3],
      didParseCell(dato) {
        if (dato.section === 'body' && dato.column.index === 2) {
          dato.cell.styles.textColor = ESTADOS[rep.pendientesMasAntiguos[dato.row.index].claveEstado]?.colorTexto || c.texto;
        }
      },
    }) + 8;
  } else {
    lineaVacia('No hay reportes pendientes en el período.');
    seccion('Pendientes más antiguos');
    lineaVacia('No hay reportes pendientes en el período.');
  }

  // ---------------- Listado de reportes ----------------
  if (hayReportes) nuevaPagina();
  seccion('Listado de reportes');
  if (hayReportes) {
    texto(`${formatoEntero(rep.filas.length)} ${rep.filas.length === 1 ? 'reporte' : 'reportes'}`, ANCHO - M, y - 4,
      { tamano: 8.5, color: c.gris, alinear: 'right' });
    // Ubicación (7.5 pt) y Municipalidad (solo en el de todas) en una sola línea: la columna toma
    // el ancho del texto más largo.
    const ubicacion = (f) => `${f.latitud.toFixed(5)}, ${f.longitud.toFixed(5)}`;
    const anchoUnaLinea = (textos, tamano) => Math.ceil(Math.max(...textos.map((t) => anchoTexto(t, tamano))) + 2 * PADDING_X + 1);
    const columnas = [
      { titulo: 'Código', valor: (f) => f.codigo, estilo: { fontStyle: 'bold', cellWidth: 24 } },
      { titulo: 'Fecha del reporte', valor: (f) => fechaHora(f.fechaReporte), estilo: { cellWidth: 27 } },
      { titulo: 'Tipo de incidencia', valor: (f) => f.tipo, estilo: {} },
      { titulo: 'Estado', valor: (f) => f.estado, estilo: { cellWidth: 22 }, esEstado: true },
      ...(rep.todas ? [{
        titulo: 'Municipalidad',
        valor: (f) => f.municipalidadCorta,
        estilo: { cellWidth: anchoUnaLinea(['Municipalidad', ...rep.filas.map((f) => f.municipalidadCorta)], 8.5), overflow: 'visible' },
      }] : []),
      { titulo: 'Encargado de cuadrilla', valor: (f) => f.encargado, estilo: {} },
      { titulo: 'Fecha de resolución', valor: (f) => fechaHora(f.fechaResolucion), estilo: { cellWidth: 27 } },
      {
        titulo: 'Días hasta la resolución',
        valor: (f) => (f.dias == null ? '' : formatoEntero(f.dias)),
        estilo: { cellWidth: anchoEncabezado('Días hasta la resolución') + 2 * PADDING_X + HOLGURA },
        derecha: true,
      },
      { titulo: 'Ubicación', valor: ubicacion, estilo: { cellWidth: anchoUnaLinea(rep.filas.map(ubicacion), 7.5), fontSize: 7.5, overflow: 'visible' } },
    ];
    y = tabla(y, {
      head: columnas.map((col) => col.titulo),
      body: rep.filas.map((f) => columnas.map((col) => col.valor(f))),
      columnStyles: Object.fromEntries(columnas.map((col, i) => [i, col.estilo])),
      derecha: columnas.map((col, i) => (col.derecha ? i : -1)).filter((i) => i >= 0),
      didParseCell(dato) {
        if (dato.section === 'body' && columnas[dato.column.index].esEstado) {
          // Versión oscura del color de la gráfica (contraste >= 4.5:1 sobre blanco y gris).
          const estado = ESTADOS[rep.filas[dato.row.index].claveEstado];
          if (estado) dato.cell.styles.textColor = estado.colorTexto;
        }
      },
    }) + 10;
  } else {
    lineaVacia(SIN_REPORTES);
  }

  // ---------------- Elaboración y revisión ----------------
  if (y + 24 > LIMITE) nuevaPagina();
  const fecha = fechaHora(rep.fechaGeneracion).slice(0, 10);
  texto(`Elaborado por: ${rep.elaboradoPor}  ·  Fecha: ${fecha}`, M, y + 4, { tamano: 9.5 });
  texto('Revisado por: ______________________  Firma: ______________________', M, y + 18, { tamano: 9.5 });

  // ---------------- Pie de cada página ----------------
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setDrawColor(c.borde);
    doc.setLineWidth(0.2);
    doc.line(M, ALTO - M - 4.5, ANCHO - M, ALTO - M - 4.5);
    texto(`EcoReporte GT · ${rep.titulo} · ${rep.municipalidad}`, M, ALTO - M, { tamano: 8, color: c.gris });
    texto(`Página ${p} de ${paginas}`, ANCHO - M, ALTO - M, { tamano: 8, color: c.gris, alinear: 'right' });
  }

  return doc.output('blob');
}
