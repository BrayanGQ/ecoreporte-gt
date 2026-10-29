// Pruebas de extremo a extremo de la reportería de Estadísticas: descarga del Excel y del PDF.
// Los archivos del coordinador de Mixco y del administrador (sin filtro) se guardan como ejemplo en
// <QA_RESULTADOS>/reporteria; los demás, en <QA_RESULTADOS>/e2e/descargas.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { test, expect } from '@playwright/test';
// Paquete autocontenido de ExcelJS (el mismo que usa el navegador): la entrada de Node carga
// dependencias que el cargador de módulos de Playwright no resuelve.
import ExcelJS from 'exceljs/dist/exceljs.min.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  API, USUARIOS, MIXCO, CIUDADANOS_DEMO, RESULTADOS_QA, iniciarSesion, token, crearReporteApi,
} from './apoyo.js';

const EJEMPLOS = path.join(RESULTADOS_QA, 'reporteria');
const DESCARGAS = path.join(RESULTADOS_QA, 'e2e', 'descargas');
const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const SIN_REPORTES = 'No se registraron reportes en el período seleccionado.';
const CODIGO = /^ER-\d{4}-\d{4,}$/;
const UBICACION = /^-?\d+\.\d{5}, -?\d+\.\d{5}$/;
const SECCIONES = [
  'Comparación con el período anterior', 'Atención por tipo de incidencia', 'Desempeño por cuadrilla',
  'Pendientes por antigüedad', 'Pendientes más antiguos', 'Listado de reportes',
];

// Hoy en Guatemala, AAAA-MM-DD (la zona horaria del navegador de las pruebas).
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());
const sumarDias = (iso, n) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};

async function abrirEstadisticas(page, correo) {
  await iniciarSesion(page, 'municipal', correo);
  await expect(page).toHaveURL(/\/municipal\/panel$/);
  await page.goto('/municipal/panel/estadisticas');
  await expect(page.getByRole('button', { name: 'Descargar Excel' })).toBeEnabled();
}

async function aplicarFechas(page, desde, hasta) {
  await page.locator('#fecha-inicio').fill(desde);
  await page.locator('#fecha-fin').fill(hasta);
  await page.getByRole('button', { name: 'Aplicar' }).click();
  const legible = (iso) => iso.split('-').reverse().join('/');
  await expect(page.locator('.filter-status')).toContainText(`del ${legible(desde)} al ${legible(hasta)}`);
  await expect(page.getByRole('button', { name: 'Descargar Excel' })).toBeEnabled();
}

// Descarga con el botón indicado y guarda el archivo en la carpeta, con el nombre sugerido.
async function descargar(page, boton, carpeta) {
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: boton }).click(),
  ]);
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, descarga.suggestedFilename());
  await descarga.saveAs(archivo);
  return { nombre: descarga.suggestedFilename(), archivo };
}

async function leerExcel(archivo) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(fs.readFileSync(archivo));
  return libro;
}

// Lee un .xlsx (zip) y devuelve el XML de un archivo interno, sin librerías: recorre el
// directorio central del zip y descomprime la entrada pedida.
function xmlDelXlsx(archivo, nombreInterno) {
  const zip = fs.readFileSync(archivo);
  const fin = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = zip.readUInt32LE(fin + 16);
  for (let i = 0; i < zip.readUInt16LE(fin + 10); i++) {
    const largoNombre = zip.readUInt16LE(p + 28);
    const nombre = zip.toString('utf8', p + 46, p + 46 + largoNombre);
    if (nombre === nombreInterno) {
      const local = zip.readUInt32LE(p + 42);
      const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const datos = zip.subarray(inicio, inicio + zip.readUInt32LE(p + 20));
      return (zip.readUInt16LE(p + 10) === 8 ? zlib.inflateRawSync(datos) : datos).toString('utf8');
    }
    p += 46 + largoNombre + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  throw new Error(`${nombreInterno} no está en ${archivo}`);
}

// Contraste WCAG entre dos colores 'RRGGBB'.
function contraste(a, b) {
  const luminancia = (hex) => {
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

// Texto de cada página del PDF.
async function leerPdf(archivo) {
  const carga = getDocument({ data: new Uint8Array(fs.readFileSync(archivo)), verbosity: 0 });
  const pdf = await carga.promise;
  const paginas = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const contenido = await (await pdf.getPage(i)).getTextContent();
    paginas.push(contenido.items.map((it) => it.str).join('\n'));
  }
  await carga.destroy();
  return paginas;
}
const lineas = (pagina) => pagina.split('\n').map((t) => t.trim());

// Valor de la tarjeta "Total de reportes" y filas del listado en pantalla.
async function datosPantalla(page) {
  const tarjeta = page.locator('.stat-card', { hasText: 'Total de reportes' });
  const total = Number((await tarjeta.locator('.stat-number').innerText()).replace(/\D/g, ''));
  const filas = page.locator('table.listado tbody tr');
  const codigos = (await filas.locator('td:first-child').allInnerTexts()).map((t) => t.trim());
  const fechas = (await filas.locator('td:nth-child(2)').allInnerTexts()).map((t) => t.trim());
  return { total, codigos, fechas };
}

// Las fechas de Excel guardan la hora local como UTC.
const dos = (n) => String(n).padStart(2, '0');
const fechaCelda = (d) => `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
// Días por fecha de calendario entre dos fechas de Excel (o una fecha y un 'AAAA-MM-DD').
const diaUtc = (d) => (typeof d === 'string'
  ? Date.UTC(...d.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0)))
  : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const diasEntre = (a, b) => Math.round((diaUtc(b) - diaUtc(a)) / 86400000);
const promedioDe = (valores) => (valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null);
const suma = (filas, campo) => filas.reduce((s, f) => s + f[campo], 0);
const numero = (v) => (v === '-' || v === undefined ? null : v);

// Todo el texto de las celdas de un libro, para buscar datos que no deben estar.
function textoDelLibro(libro) {
  const textos = [];
  libro.eachSheet((hoja) => hoja.eachRow((fila) => fila.eachCell((celda) => textos.push(String(celda.text ?? '')))));
  return textos.join('\n');
}

// Lee una tabla de una hoja: encabezado en filaEncabezado y filas hasta la primera vacía.
// La fila "Total" se devuelve aparte. Los hipervínculos se leen como su texto y '-' como null.
function leerTabla(hoja, filaEncabezado) {
  const encabezados = hoja.getRow(filaEncabezado).values.slice(1);
  const filas = [];
  let total = null;
  for (let r = filaEncabezado + 1; r <= hoja.rowCount; r++) {
    const fila = hoja.getRow(r);
    const primera = fila.getCell(1).value;
    if (primera === null || primera === undefined || primera === '') break;
    const objeto = {};
    encabezados.forEach((titulo, i) => {
      let v = fila.getCell(i + 1).value;
      if (v && typeof v === 'object' && !(v instanceof Date) && 'text' in v) v = v.text;
      objeto[titulo] = numero(v ?? null);
    });
    if (primera === 'Total') total = objeto;
    else filas.push(objeto);
  }
  return { encabezados, filas, total };
}

// Indicadores de la hoja Resumen (tabla Indicador | Valor desde la fila 6).
const indicadoresResumen = (libro) => Object.fromEntries(
  leerTabla(libro.getWorksheet('Resumen'), 6).filas.map((f) => [f.Indicador, f.Valor])
);

// Columnas de la hoja Reportes: "Municipalidad" solo en el reporte de todas las municipalidades.
const columnasReportes = (conMunicipalidad) => [
  'Código', 'Fecha del reporte', 'Tipo de incidencia', 'Estado', ...(conMunicipalidad ? ['Municipalidad'] : []),
  'Encargado de cuadrilla', 'Fecha de asignación', 'Días hasta la asignación', 'Fecha de resolución',
  'Días hasta la resolución', 'Ubicación',
];
const hojasEsperadas = (todas) => ['Resumen', 'Por tipo', 'Por cuadrilla', 'Pendientes',
  ...(todas ? ['Por municipalidad'] : []), 'Reportes'];

function verificarExcel(libro, pantalla, { conMunicipalidad }) {
  expect(libro.worksheets.map((h) => h.name)).toEqual(hojasEsperadas(conMunicipalidad));

  const resumen = libro.getWorksheet('Resumen');
  expect(resumen.getCell('A1').value).toBe('Reporte de incidencias ambientales');
  expect(resumen.getCell('A7').value).toBe('Total de reportes');
  expect(resumen.getCell('B7').value).toBe(pantalla.total);

  const hoja = libro.getWorksheet('Reportes');
  const encabezados = hoja.getRow(1).values.slice(1);
  expect(encabezados).toEqual(columnasReportes(conMunicipalidad));
  const col = (titulo) => encabezados.indexOf(titulo) + 1;
  expect(hoja.actualRowCount - 1).toBe(pantalla.codigos.length);

  for (let i = 0; i < pantalla.codigos.length; i++) {
    const fila = hoja.getRow(i + 2);
    expect(fila.getCell(col('Código')).value).toBe(pantalla.codigos[i]);
    const fecha = fila.getCell(col('Fecha del reporte'));
    expect(fecha.value).toBeInstanceOf(Date);
    expect(fecha.numFmt).toBe('dd/mm/yyyy hh:mm');
    expect(fechaCelda(fecha.value)).toBe(pantalla.fechas[i]);

    // Estado legible, con un color de texto de contraste >= 4.5:1 sobre blanco y sobre el gris
    // de las filas alternas.
    const estado = fila.getCell(col('Estado'));
    expect(estado.value).not.toMatch(/_/);
    const colorEstado = estado.font.color.argb.slice(2);
    expect(contraste(colorEstado, 'FFFFFF'), `contraste de ${estado.value} sobre blanco`).toBeGreaterThanOrEqual(4.5);
    expect(contraste(colorEstado, 'F2F4F7'), `contraste de ${estado.value} sobre gris`).toBeGreaterThanOrEqual(4.5);

    // Fechas reales (o vacías) y días enteros calculados de esas fechas.
    for (const [titulo, tituloDias] of [['Fecha de asignación', 'Días hasta la asignación'], ['Fecha de resolución', 'Días hasta la resolución']]) {
      const valor = fila.getCell(col(titulo)).value;
      const dias = fila.getCell(col(tituloDias)).value;
      if (valor !== null) {
        expect(valor).toBeInstanceOf(Date);
        expect(fila.getCell(col(titulo)).numFmt).toBe('dd/mm/yyyy hh:mm');
        expect(Number.isInteger(dias)).toBe(true);
        expect(dias).toBe(diasEntre(fecha.value, valor));
      } else {
        expect(dias).toBeNull();
      }
    }
    expect(fila.getCell(col('Ubicación')).value).toMatchObject({
      text: 'Ver en el mapa', hyperlink: expect.stringMatching(/^https:\/\/www\.google\.com\/maps\?q=-?\d+(\.\d+)?,-?\d+(\.\d+)?$/),
    });
  }
}

// Cada columna de cada hoja tiene su propio <col> con ancho entre 12 y 40 (sin rangos que
// agrupen columnas: hay lectores que aplican el ancho solo a la primera del rango).
function verificarAnchos(archivo, libro) {
  libro.worksheets.forEach((hoja, i) => {
    const xml = xmlDelXlsx(archivo, `xl/worksheets/sheet${i + 1}.xml`);
    const cols = [...xml.matchAll(/<col [^>]*min="(\d+)"[^>]*max="(\d+)"[^>]*width="([\d.]+)"/g)]
      .map(([, min, max, ancho]) => ({ min: Number(min), max: Number(max), ancho: Number(ancho) }));
    for (let c = 1; c <= hoja.actualColumnCount; c++) {
      const propia = cols.find((x) => x.min === c && x.max === c);
      expect(propia, `${hoja.name}: la columna ${c} no tiene ancho propio`).toBeTruthy();
      expect(propia.ancho).toBeGreaterThanOrEqual(12);
      expect(propia.ancho).toBeLessThanOrEqual(40);
    }
  });
}

// Las tablas Por tipo, Por cuadrilla, Pendientes y Por municipalidad suman lo mismo que el período,
// y sus días promedio coinciden con un cálculo independiente sobre la hoja Reportes.
function verificarTablas(libro, { todas }) {
  const ind = indicadoresResumen(libro);
  const reportes = leerTabla(libro.getWorksheet('Reportes'), 1).filas;
  expect(reportes).toHaveLength(ind['Total de reportes']);
  const cuantos = (estado, filas = reportes) => filas.filter((f) => f.Estado === estado).length;
  const promedioCol = (filas, campo) => promedioDe(filas.map((f) => f[campo]).filter((v) => v !== null));
  const cerca = (real, esperado) => {
    if (esperado === null) expect(real).toBeNull();
    else expect(real).toBeCloseTo(esperado, 9);
  };
  // Las columnas de estado de cada fila suman su total, y la fila "Total" suma las filas.
  const sumanPorFila = (tabla, columnaTotal, columnasEstado) => {
    for (const f of [...tabla.filas, tabla.total]) {
      expect(columnasEstado.reduce((s, c) => s + f[c], 0), `${Object.values(f)[0]}: estados vs ${columnaTotal}`).toBe(f[columnaTotal]);
    }
    for (const c of [columnaTotal, ...columnasEstado]) {
      expect(tabla.total[c], `fila Total, ${c}`).toBe(suma(tabla.filas, c));
    }
  };

  // Resumen: conteos por estado y promedios del período.
  expect(ind.Resueltos).toBe(cuantos('Resuelto'));
  expect(ind['En atención']).toBe(cuantos('En atención'));
  expect(ind.Asignados).toBe(cuantos('Asignado'));
  expect(ind['Recibidos (sin asignar)']).toBe(cuantos('Recibido'));
  expect(ind.Descartados).toBe(cuantos('Descartado'));
  cerca(ind['Días promedio hasta la asignación'], promedioCol(reportes, 'Días hasta la asignación'));
  cerca(ind['Días promedio hasta la resolución'], promedioCol(reportes, 'Días hasta la resolución'));

  // Por tipo: cada fila sale de los reportes de ese tipo; las columnas suman el total del período.
  const porTipo = leerTabla(libro.getWorksheet('Por tipo'), 1);
  expect(suma(porTipo.filas, 'Recibidos en el período')).toBe(ind['Total de reportes']);
  expect(suma(porTipo.filas, 'Resueltos') + suma(porTipo.filas, 'En proceso')
    + suma(porTipo.filas, 'Pendientes de asignar') + suma(porTipo.filas, 'Descartados')).toBe(ind['Total de reportes']);
  for (const f of porTipo.filas) {
    const delTipo = reportes.filter((r) => r['Tipo de incidencia'] === f['Tipo de incidencia']);
    expect(f['Recibidos en el período']).toBe(delTipo.length);
    expect(f.Resueltos).toBe(cuantos('Resuelto', delTipo));
    expect(f['En proceso']).toBe(cuantos('Asignado', delTipo) + cuantos('En atención', delTipo));
    expect(f['Pendientes de asignar']).toBe(cuantos('Recibido', delTipo));
    expect(f.Descartados).toBe(cuantos('Descartado', delTipo));
    cerca(f['Días promedio hasta la asignación'], promedioCol(delTipo, 'Días hasta la asignación'));
    cerca(f['Días promedio hasta la resolución'], promedioCol(delTipo, 'Días hasta la resolución'));
  }
  expect(porTipo.total['Recibidos en el período']).toBe(ind['Total de reportes']);
  sumanPorFila(porTipo, 'Recibidos en el período', ['Resueltos', 'En proceso', 'Pendientes de asignar', 'Descartados']);
  cerca(porTipo.total['Días promedio hasta la asignación'], ind['Días promedio hasta la asignación']);

  // Por cuadrilla: Por iniciar + En atención + Resueltos = Asignados (total); suma de asignados =
  // reportes con encargado; días de asignación a resolución calculados de las fechas de Reportes.
  const tablaCuadrillas = leerTabla(libro.getWorksheet('Por cuadrilla'), 1);
  const cuadrillas = tablaCuadrillas.filas;
  expect(tablaCuadrillas.encabezados).toEqual(['Encargado de cuadrilla', 'Asignados (total)', 'Por iniciar', 'En atención',
    'Resueltos', 'Días promedio de asignación a resolución']);
  const conEncargado = reportes.filter((r) => r['Encargado de cuadrilla']);
  sumanPorFila(tablaCuadrillas, 'Asignados (total)', ['Por iniciar', 'En atención', 'Resueltos']);
  expect(tablaCuadrillas.total['Asignados (total)']).toBe(conEncargado.length);
  const asignados = cuadrillas.map((f) => f['Asignados (total)']);
  expect(asignados).toEqual([...asignados].sort((a, b) => b - a));
  const diasAsignacionResolucion = (filas) => filas.filter((r) => r.Estado === 'Resuelto' && r['Fecha de asignación'])
    .map((r) => diasEntre(r['Fecha de asignación'], r['Fecha de resolución']));
  for (const f of cuadrillas) {
    const suyos = conEncargado.filter((r) => r['Encargado de cuadrilla'] === f['Encargado de cuadrilla']);
    expect(f['Asignados (total)']).toBe(suyos.length);
    expect(f['Por iniciar']).toBe(cuantos('Asignado', suyos));
    expect(f['En atención']).toBe(cuantos('En atención', suyos));
    expect(f.Resueltos).toBe(cuantos('Resuelto', suyos));
    cerca(f['Días promedio de asignación a resolución'], promedioDe(diasAsignacionResolucion(suyos)));
  }
  cerca(tablaCuadrillas.total['Días promedio de asignación a resolución'], promedioDe(diasAsignacionResolucion(conEncargado)));

  // Pendientes: los rangos suman los recibidos + asignados + en atención; la lista los trae todos
  // con sus días desde el reporte hasta hoy.
  const hojaPendientes = libro.getWorksheet('Pendientes');
  const rangos = leerTabla(hojaPendientes, 1);
  const pendientes = ind['Recibidos (sin asignar)'] + ind.Asignados + ind['En atención'];
  expect(rangos.filas.map((f) => f['Antigüedad'])).toEqual(['0 a 7 días', '8 a 15 días', '16 a 30 días', 'Más de 30 días']);
  expect(suma(rangos.filas, 'Total')).toBe(pendientes);
  expect(rangos.total.Total).toBe(pendientes);
  expect(suma(rangos.filas, 'Recibidos')).toBe(ind['Recibidos (sin asignar)']);
  expect(suma(rangos.filas, 'Asignados')).toBe(ind.Asignados);
  expect(suma(rangos.filas, 'En atención')).toBe(ind['En atención']);
  const lista = leerTabla(hojaPendientes, rangos.filas.length + 4).filas;
  expect(lista).toHaveLength(pendientes);
  const enRango = (dias, etiqueta) => ({
    '0 a 7 días': dias <= 7, '8 a 15 días': dias >= 8 && dias <= 15, '16 a 30 días': dias >= 16 && dias <= 30, 'Más de 30 días': dias > 30,
  })[etiqueta];
  for (const p of lista) expect(p['Días transcurridos']).toBe(diasEntre(p['Fecha del reporte'], hoy()));
  for (const r of rangos.filas) {
    expect(lista.filter((p) => enRango(p['Días transcurridos'], r['Antigüedad'])).length).toBe(r.Total);
  }

  // Por municipalidad (solo en el de todas): suma el total; nombres sin "Municipalidad de".
  if (todas) {
    const porMunicipalidad = leerTabla(libro.getWorksheet('Por municipalidad'), 1);
    expect(porMunicipalidad.encabezados).toEqual(['Municipalidad', 'Recibidos en el período', 'Sin asignar', 'En proceso',
      'Resueltos', 'Descartados', 'Porcentaje resuelto', 'Días promedio hasta la resolución']);
    // Sin asignar + En proceso + Resueltos + Descartados = Recibidos en el período.
    sumanPorFila(porMunicipalidad, 'Recibidos en el período', ['Sin asignar', 'En proceso', 'Resueltos', 'Descartados']);
    expect(porMunicipalidad.total['Recibidos en el período']).toBe(ind['Total de reportes']);
    for (const f of porMunicipalidad.filas) {
      expect(f.Municipalidad).not.toMatch(/^Municipalidad de/i);
      const suyos = reportes.filter((r) => r.Municipalidad === f.Municipalidad);
      expect(f['Recibidos en el período']).toBe(suyos.length);
      expect(f['Sin asignar']).toBe(cuantos('Recibido', suyos));
      expect(f['En proceso']).toBe(cuantos('Asignado', suyos) + cuantos('En atención', suyos));
      expect(f.Resueltos).toBe(cuantos('Resuelto', suyos));
      expect(f.Descartados).toBe(cuantos('Descartado', suyos));
      cerca(f['Días promedio hasta la resolución'], promedioCol(suyos, 'Días hasta la resolución'));
    }
    for (const r of reportes) expect(r.Municipalidad).not.toMatch(/Municipalidad de/i);
  }
}

// PDF: cada fila del listado entera en una página (su código y su ubicación en la misma página).
function verificarListadoPdf(paginas, codigosEsperados) {
  const inicio = paginas.findIndex((p) => lineas(p).includes('Listado de reportes'));
  expect(inicio).toBeGreaterThan(0);
  const codigos = [];
  for (const pagina of paginas.slice(inicio)) {
    const ls = lineas(pagina);
    const deLaPagina = ls.filter((t) => CODIGO.test(t));
    expect(ls.filter((t) => UBICACION.test(t)), 'filas partidas entre páginas').toHaveLength(deLaPagina.length);
    codigos.push(...deLaPagina);
  }
  expect(codigos).toEqual(codigosEsperados);
  return paginas.slice(inicio).flatMap(lineas);
}

test.describe('Reportería de Estadísticas', () => {
  // Un reporte de una ciudadana con sesión en Mixco: su nombre y correo no deben salir en los archivos.
  test.beforeAll(async ({ request }) => {
    await crearReporteApi(request, 'E2E reportería Mixco', {
      punto: MIXCO, tokenCiudadano: await token(request, USUARIOS.ciudadana),
    });
  });

  test('CP-112 El coordinador descarga el Excel: hojas del informe, mismas filas y total que la pantalla, fechas reales y anchos', async ({ page }) => {
    await abrirEstadisticas(page, USUARIOS.coordMixco);
    const pantalla = await datosPantalla(page);
    expect(pantalla.codigos.length).toBeGreaterThan(0);
    // Sin filtro de fechas no hay período anterior comparable.
    await expect(page.locator('.stat-card', { hasText: 'Total de reportes' })).toContainText('Sin período anterior comparable');

    const { nombre, archivo } = await descargar(page, 'Descargar Excel', EJEMPLOS);
    expect(nombre).toMatch(new RegExp(`^reporte_mixco_\\d{4}-\\d{2}-\\d{2}_a_${hoy()}\\.xlsx$`));

    const libro = await leerExcel(archivo);
    // Una sola municipalidad: sin columna ni hoja "Municipalidad" (ya está en el encabezado).
    verificarExcel(libro, pantalla, { conMunicipalidad: false });
    verificarAnchos(archivo, libro);
    verificarTablas(libro, { todas: false });
    const resumen = libro.getWorksheet('Resumen');
    expect(resumen.getCell('A2').value).toBe('Municipalidad de Mixco');
    expect(resumen.getCell('A4').value).toMatch(/^Generado el \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} por Mario/);
    expect(resumen.getCell('A18').value).toBe('Sin período anterior comparable');

    const texto = textoDelLibro(libro);
    expect(texto).not.toMatch(CORREO);
    for (const nombreCiudadano of CIUDADANOS_DEMO) expect(texto).not.toContain(nombreCiudadano);
  });

  test('CP-113 El coordinador descarga el PDF: título, municipalidad, secciones, listado completo y sin datos de ciudadanos', async ({ page }) => {
    await abrirEstadisticas(page, USUARIOS.coordMixco);
    const pantalla = await datosPantalla(page);

    const { nombre, archivo } = await descargar(page, 'Descargar PDF', EJEMPLOS);
    expect(nombre).toMatch(new RegExp(`^reporte_mixco_\\d{4}-\\d{2}-\\d{2}_a_${hoy()}\\.pdf$`));
    expect(fs.statSync(archivo).size).toBeGreaterThan(0);

    const paginas = await leerPdf(archivo);
    const texto = paginas.join('\n');
    expect(paginas.length).toBeGreaterThan(3);
    expect(texto).toContain('Reporte de incidencias ambientales');
    expect(texto).toContain('Municipalidad de Mixco');
    expect(texto).toContain('Período: del '); // tildes legibles en el texto del PDF
    expect(texto).toContain('Sin período anterior comparable.');
    for (const seccion of SECCIONES) expect(lineas(texto)).toContain(seccion);
    expect(lineas(texto)).not.toContain('Por municipalidad');
    paginas.forEach((p, i) => expect(p).toContain(`Página ${i + 1} de ${paginas.length}`));
    expect(texto).not.toMatch(CORREO);
    for (const nombreCiudadano of CIUDADANOS_DEMO) expect(texto).not.toContain(nombreCiudadano);

    // Listado: completo, sin columna "Municipalidad", sin filas partidas y la ubicación en una línea.
    const listado = verificarListadoPdf(paginas, pantalla.codigos);
    expect(listado).toContain('Ubicación');
    expect(listado).not.toContain('Municipalidad');
  });

  test('CP-114 Con un período sin reportes se generan los dos archivos con las secciones vacías indicadas', async ({ page }) => {
    await abrirEstadisticas(page, USUARIOS.coordMixco);
    await aplicarFechas(page, '2000-01-01', '2000-01-31');
    await expect(page.locator('.stat-card', { hasText: 'Total de reportes' }).locator('.stat-number')).toHaveText('0');

    const excel = await descargar(page, 'Descargar Excel', DESCARGAS);
    expect(excel.nombre).toBe('reporte_mixco_2000-01-01_a_2000-01-31.xlsx');
    const libro = await leerExcel(excel.archivo);
    verificarExcel(libro, { total: 0, codigos: [], fechas: [] }, { conMunicipalidad: false });
    verificarAnchos(excel.archivo, libro);
    const resumen = libro.getWorksheet('Resumen');
    expect(resumen.getCell('A3').value).toBe('Período: del 1 de enero al 31 de enero de 2000');
    expect(resumen.getCell('A18').value).toBe('Período anterior: del 1 de diciembre al 31 de diciembre de 1999');
    expect(libro.getWorksheet('Por tipo').getCell('A2').value).toBe('No hay reportes en el período.');
    expect(libro.getWorksheet('Por cuadrilla').getCell('A2').value).toBe('No hay reportes asignados a cuadrillas en el período.');
    expect(libro.getWorksheet('Pendientes').getCell('A1').value).toBe('No hay reportes pendientes en el período.');

    const pdf = await descargar(page, 'Descargar PDF', DESCARGAS);
    expect(pdf.nombre).toBe('reporte_mixco_2000-01-01_a_2000-01-31.pdf');
    expect(fs.statSync(pdf.archivo).size).toBeGreaterThan(0);
    const paginas = await leerPdf(pdf.archivo);
    const texto = lineas(paginas.join('\n'));
    for (const seccion of SECCIONES) expect(texto).toContain(seccion);
    expect(texto).toContain(SIN_REPORTES);
    expect(texto).toContain('No hay reportes en el período.');
    expect(texto).toContain('No hay reportes asignados a cuadrillas en el período.');
    expect(texto.filter((t) => t === 'No hay reportes pendientes en el período.')).toHaveLength(2);
    expect(texto.some((t) => t.startsWith('Revisado por:'))).toBe(true);
    expect(texto.filter((t) => CODIGO.test(t))).toHaveLength(0); // ninguna tabla con datos
    paginas.forEach((p, i) => expect(p).toContain(`Página ${i + 1} de ${paginas.length}`));
  });

  test('CP-115 El administrador sin filtro descarga el Excel y el PDF de todas las municipalidades', async ({ page }) => {
    await abrirEstadisticas(page, USUARIOS.admin);
    const pantalla = await datosPantalla(page);

    const excel = await descargar(page, 'Descargar Excel', EJEMPLOS);
    expect(excel.nombre).toMatch(new RegExp(`^reporte_todas_\\d{4}-\\d{2}-\\d{2}_a_${hoy()}\\.xlsx$`));
    const libro = await leerExcel(excel.archivo);
    // Todas las municipalidades: la columna "Municipalidad" sí aparece, con el nombre corto.
    verificarExcel(libro, pantalla, { conMunicipalidad: true });
    verificarAnchos(excel.archivo, libro);
    const hoja = libro.getWorksheet('Reportes');
    const colMunicipalidad = hoja.getRow(1).values.indexOf('Municipalidad');
    expect(colMunicipalidad).toBeGreaterThan(0);
    const nombres = new Set();
    for (let i = 2; i <= hoja.actualRowCount; i++) {
      const valor = hoja.getRow(i).getCell(colMunicipalidad).value;
      expect(valor).toMatch(/^[A-ZÁÉÍÓÚÑ][\p{L} ]+$/u);
      expect(valor).not.toMatch(/Municipalidad de/i);
      nombres.add(valor);
    }
    expect([...nombres]).toEqual(expect.arrayContaining(['Guatemala', 'Mixco', 'Villa Nueva']));
    expect(libro.getWorksheet('Resumen').getCell('A2').value).toBe('Todas las municipalidades');
    expect(textoDelLibro(libro)).not.toMatch(CORREO);

    const pdf = await descargar(page, 'Descargar PDF', EJEMPLOS);
    expect(pdf.nombre).toBe(excel.nombre.replace(/\.xlsx$/, '.pdf'));
    const paginas = await leerPdf(pdf.archivo);
    const texto = paginas.join('\n');
    expect(texto).toContain('Todas las municipalidades');
    expect(texto).not.toMatch(CORREO);
    for (const nombreCiudadano of CIUDADANOS_DEMO) expect(texto).not.toContain(nombreCiudadano);
    const listado = verificarListadoPdf(paginas, pantalla.codigos);
    expect(listado).toContain('Municipalidad');
  });

  test('CP-117 Excel de todas: las tablas por tipo, cuadrilla, antigüedad y municipalidad suman el total y sus promedios coinciden con la hoja Reportes', async ({ page }) => {
    await abrirEstadisticas(page, USUARIOS.admin);
    const pantalla = await datosPantalla(page);
    const { archivo } = await descargar(page, 'Descargar Excel', DESCARGAS);
    const libro = await leerExcel(archivo);
    expect(indicadoresResumen(libro)['Total de reportes']).toBe(pantalla.total);
    verificarTablas(libro, { todas: true });

    // La tarjeta de días hasta la asignación muestra el mismo valor que el Excel (1 decimal).
    const dias = indicadoresResumen(libro)['Días promedio hasta la asignación'];
    await expect(page.locator('.stat-card', { hasText: 'Días promedio hasta la asignación' }).locator('.stat-number'))
      .toHaveText(dias === null ? '-' : dias.toFixed(1));
  });

  test('CP-118 PDF de todas: secciones, Por municipalidad, Elaborado y Revisado por, filas enteras, municipalidad corta y gráficas PNG', async ({ page }) => {
    await abrirEstadisticas(page, USUARIOS.admin);
    const pantalla = await datosPantalla(page);
    const { archivo } = await descargar(page, 'Descargar PDF', DESCARGAS);
    const paginas = await leerPdf(archivo);
    const texto = lineas(paginas.join('\n'));

    for (const seccion of [...SECCIONES, 'Por municipalidad']) expect(texto).toContain(seccion);
    // Página 2: tablas de atención (enteras, con su fila de totales); página 3: pendientes; después, el listado.
    expect(lineas(paginas[1])).toEqual(expect.arrayContaining(['Atención por tipo de incidencia', 'Desempeño por cuadrilla', 'Por municipalidad']));
    expect(lineas(paginas[1]).filter((t) => t === 'Total')).toHaveLength(3);
    expect(lineas(paginas[2])).toEqual(expect.arrayContaining(['Pendientes por antigüedad', 'Pendientes más antiguos']));
    // (pdf.js reduce a uno los espacios dobles al extraer el texto)
    expect(texto.some((t) => /^Elaborado por: Administrador General\s+·\s+Fecha: \d{2}\/\d{2}\/\d{4}$/.test(t))).toBe(true);
    expect(texto.some((t) => /^Revisado por: _{10,}\s+Firma: _{10,}$/.test(t))).toBe(true);
    // El bloque de revisión va al final del documento.
    expect(lineas(paginas.at(-1)).some((t) => t.startsWith('Revisado por:'))).toBe(true);

    // Listado: ninguna fila partida entre páginas y la municipalidad sin "Municipalidad de".
    const listado = verificarListadoPdf(paginas, pantalla.codigos);
    expect(listado).toEqual(expect.arrayContaining(['Guatemala', 'Mixco', 'Villa Nueva']));
    expect(listado.filter((t) => /^Municipalidad de /.test(t))).toEqual([]);

    // Mismo nombre para el mismo dato: "Días hasta la resolución", nunca "Días de atención".
    expect(paginas.join('\n')).not.toMatch(/Días de\s+atención/);
    expect(texto).not.toContain('Días de');
    // Tablas de resumen: la primera columna en una sola línea (el tipo más largo no se parte).
    expect(lineas(paginas[1])).toContain('Desechos junto a fuente de agua');

    // Las gráficas van como PNG (sin compresión JPEG).
    const bytes = fs.readFileSync(archivo).toString('latin1');
    expect(bytes).not.toContain('/DCTDecode');
    expect((bytes.match(/\/Subtype \/Image/g) || []).length).toBe(2);
  });

  test('CP-119 Comparación con el período anterior de la misma duración: pantalla, Excel y PDF coinciden con la API', async ({ page, request }) => {
    const hasta = hoy();
    const desde = sumarDias(hasta, -29); // 30 días
    const anteriorDesde = sumarDias(desde, -30);
    const anteriorHasta = sumarDias(desde, -1);

    // Cálculo independiente: el listado del período anterior pedido directo a la API.
    const encabezado = { Authorization: `Bearer ${await token(request, USUARIOS.coordMixco)}` };
    const previo = await (await request.get(`${API}/estadisticas/reportes`, {
      headers: encabezado, params: { fecha_inicio: anteriorDesde, fecha_fin: anteriorHasta },
    })).json();
    const previoResueltos = previo.filter((r) => r.nombre_estado === 'resuelto').length;
    expect(previo.length).toBeGreaterThan(0);

    await abrirEstadisticas(page, USUARIOS.coordMixco);
    await aplicarFechas(page, desde, hasta);
    const pantalla = await datosPantalla(page);
    const diferencia = (n) => (n > 0 ? `+${n}` : String(n));
    await expect(page.locator('.stat-card', { hasText: 'Total de reportes' }))
      .toContainText(`Período anterior: ${previo.length} (${diferencia(pantalla.total - previo.length)})`);

    const { archivo } = await descargar(page, 'Descargar Excel', DESCARGAS);
    const libro = await leerExcel(archivo);
    const resumen = libro.getWorksheet('Resumen');
    expect(resumen.getCell('A17').value).toBe('Comparación con el período anterior');
    expect(resumen.getCell('A18').value).toMatch(/^Período anterior: del /);
    const comparacion = Object.fromEntries(leerTabla(resumen, 19).filas.map((f) => [f.Indicador, f]));
    const ind = indicadoresResumen(libro);
    expect(comparacion['Total de reportes']).toMatchObject({
      'Período actual': pantalla.total, 'Período anterior': previo.length, Diferencia: pantalla.total - previo.length,
    });
    expect(comparacion.Resueltos).toMatchObject({
      'Período actual': ind.Resueltos, 'Período anterior': previoResueltos, Diferencia: ind.Resueltos - previoResueltos,
    });
    await expect(page.locator('.stat-card', { hasText: 'Resueltos' }))
      .toContainText(`Período anterior: ${previoResueltos} (${diferencia(ind.Resueltos - previoResueltos)})`);
    // Días hasta la resolución del período anterior, por fecha de calendario (hora de Guatemala).
    const diaLocal = (v) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date(v));
    const diasPrevios = previo.filter((r) => r.nombre_estado === 'resuelto' && r.fecha_resolucion)
      .map((r) => diasEntre(diaLocal(r.fecha_reporte), diaLocal(r.fecha_resolucion)));
    const filaDias = comparacion['Días promedio hasta la resolución'];
    if (promedioDe(diasPrevios) === null) expect(filaDias['Período anterior']).toBeNull();
    else expect(filaDias['Período anterior']).toBeCloseTo(promedioDe(diasPrevios), 9);

    const pdf = await descargar(page, 'Descargar PDF', DESCARGAS);
    const primera = lineas((await leerPdf(pdf.archivo))[0]);
    expect(primera.some((t) => t.startsWith('Período anterior: del '))).toBe(true);
    // Los encabezados numéricos pueden ir en dos líneas: se comparan con el texto unido.
    const unido = primera.filter(Boolean).join(' ');
    for (const encabezado of ['Período actual', 'Período anterior', 'Diferencia']) expect(unido).toContain(encabezado);
  });
});
