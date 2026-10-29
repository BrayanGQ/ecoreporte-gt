<script setup>
import { ref, computed, onMounted } from 'vue';
import { Doughnut, Bar } from 'vue-chartjs';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { estadisticaService, catalogoService } from '../services/api';
import {
  ESTADOS as PRESENTACION_ESTADOS, etiquetaEstado, fechaHora, formatoPorcentaje, formatoEntero, formatoDecimal,
  formatoDiferencia, calcularReporte, periodoAnterior, descargarArchivo,
} from '../utils/reporteria';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip);

// Presentación de cada estado en pantalla: etiqueta y color (los mismos del Excel y el PDF) e ícono.
const ICONOS = {
  recibido: 'bx-archive-in',
  asignado: 'bx-user-check',
  en_atencion: 'bx-loader-circle',
  resuelto: 'bx-check-circle',
  descartado: 'bx-x-circle',
};
const ESTADOS = Object.fromEntries(Object.entries(PRESENTACION_ESTADOS).map(([clave, e]) => [
  clave, { etiqueta: e.plural, icono: ICONOS[clave], color: e.color },
]));

const resumen = ref(null);
const porEstado = ref([]);
const porTipo = ref([]);
const listado = ref([]);
const listadoAnterior = ref(null); // listado del período anterior (solo si hay período comparable)
const error = ref('');
const cargando = ref(true);      // primera carga: oculta el contenido
const actualizando = ref(false); // recarga por filtro: atenúa el contenido sin ocultarlo

// El coordinador (personal_municipal) solo ve su municipalidad: el backend lo limita.
// El administrador ve todo y puede filtrar por municipalidad.
const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
const esAdmin = usuario?.rol === 'administrador';
const municipalidades = ref([]);
const idMunicipalidad = ref('');

// Filtro por rango de fechas (los inputs type="date" ya entregan YYYY-MM-DD).
const fechaInicio = ref('');
const fechaFin = ref('');
const filtroAplicado = ref(null); // { fecha_inicio?, fecha_fin?, id_municipalidad? } vigente, o null
const hayFiltroEnFormulario = computed(() => !!(fechaInicio.value || fechaFin.value || idMunicipalidad.value));

function fechaLegible(f) {
  const [a, m, d] = f.split('-');
  return `${d}/${m}/${a}`;
}

const descripcionFiltro = computed(() => {
  const f = filtroAplicado.value;
  if (!f) return '';
  const partes = [];
  if (f.id_municipalidad) {
    const m = municipalidades.value.find((x) => x.id_municipalidad === f.id_municipalidad);
    partes.push(`de ${m ? m.nombre : 'la municipalidad seleccionada'}`);
  }
  if (f.fecha_inicio && f.fecha_fin) partes.push(`del ${fechaLegible(f.fecha_inicio)} al ${fechaLegible(f.fecha_fin)}`);
  else if (f.fecha_inicio) partes.push(`desde el ${fechaLegible(f.fecha_inicio)}`);
  else if (f.fecha_fin) partes.push(`hasta el ${fechaLegible(f.fecha_fin)}`);
  return partes.join(' ');
});

// ---------- Reportería: Excel y PDF ----------
// Municipalidad del reporte: la filtrada por el administrador, todas, o la del coordinador.
const municipalidadReporte = computed(() => {
  const nombreDe = (id) => municipalidades.value.find((m) => m.id_municipalidad === Number(id))?.nombre;
  if (esAdmin) {
    const id = filtroAplicado.value?.id_municipalidad;
    return id ? nombreDe(id) || 'Municipalidad seleccionada' : 'Todas las municipalidades';
  }
  return nombreDe(usuario?.id_municipalidad) || listado.value[0]?.municipalidad || 'Municipalidad';
});

const generando = ref(''); // 'excel' | 'pdf' mientras se arma el archivo
const lienzoEstado = ref(null); // contenedores de las gráficas: el PDF toma la imagen de sus <canvas>
const lienzoTipo = ref(null);

// Los dos archivos salen del mismo cálculo, con los datos que muestra la pantalla.
function datosReporte() {
  return calcularReporte({
    resumen: resumen.value,
    porTipo: porTipo.value,
    listado: listado.value,
    listadoAnterior: listadoAnterior.value,
    municipalidad: municipalidadReporte.value,
    todas: esAdmin && !filtroAplicado.value?.id_municipalidad,
    filtro: filtroAplicado.value,
    usuario,
  });
}

// ExcelJS y jsPDF se cargan recién al descargar: no van en el paquete principal.
async function descargar(formato) {
  generando.value = formato;
  error.value = '';
  try {
    const rep = datosReporte();
    if (formato === 'excel') {
      const { generarExcel } = await import('../utils/reporte-excel.js');
      descargarArchivo(await generarExcel(rep), `${rep.nombreArchivo}.xlsx`);
    } else {
      const { generarPdf } = await import('../utils/reporte-pdf.js');
      const blob = await generarPdf(rep, {
        estado: lienzoEstado.value?.querySelector('canvas'),
        tipo: lienzoTipo.value?.querySelector('canvas'),
      });
      descargarArchivo(blob, `${rep.nombreArchivo}.pdf`);
    }
  } catch (err) {
    console.error('Error al generar el reporte:', err);
    error.value = `No se pudo generar el ${formato === 'excel' ? 'Excel' : 'PDF'}. Intentá de nuevo.`;
  } finally {
    generando.value = '';
  }
}

// Mismo cálculo que los archivos: indicadores y comparación con el período anterior.
const reportePantalla = computed(() => (resumen.value ? datosReporte() : null));

// "Período anterior: 6 (+3)" para la tarjeta del indicador, o la nota si no hay comparación.
function notaComparacion(indicador) {
  const comp = reportePantalla.value?.comparacion;
  if (!comp) return '';
  if (!comp.disponible) return indicador === 'Total de reportes' ? comp.nota : '';
  const fila = comp.filas.find((f) => f.indicador === indicador);
  return fila ? `Período anterior: ${formatoEntero(fila.anterior)} (${formatoDiferencia(fila.diferencia)})` : '';
}

// Tarjetas: total, una por cada estado (en el orden del catálogo) y los días hasta la asignación.
const tarjetas = computed(() => {
  if (!resumen.value) return [];
  const estados = porEstado.value.length
    ? porEstado.value.map((e) => e.nombre_estado)
    : Object.keys(resumen.value.por_estado);
  const diasAsignacion = reportePantalla.value?.indicadores.promedioDiasAsignacion;
  return [
    { clave: 'total', etiqueta: 'Total de reportes', icono: 'bx-grid-alt', valor: resumen.value.total, nota: notaComparacion('Total de reportes') },
    ...estados.map((nombre) => ({
      clave: nombre,
      etiqueta: ESTADOS[nombre]?.etiqueta || nombre,
      icono: ESTADOS[nombre]?.icono || 'bx-circle',
      valor: resumen.value.por_estado[nombre] ?? 0,
      nota: nombre === 'resuelto' ? notaComparacion('Resueltos') : '',
    })),
    {
      clave: 'asignacion',
      etiqueta: 'Días promedio hasta la asignación',
      icono: 'bx-time-five',
      valor: diasAsignacion == null ? '-' : formatoDecimal(diasAsignacion),
    },
  ];
});

// ---------- Gráfica de dona: reportes por estado ----------
const totalGrafica = computed(() => porEstado.value.reduce((s, e) => s + e.cantidad, 0));

function porcentaje(cantidad) {
  return formatoPorcentaje(totalGrafica.value ? cantidad / totalGrafica.value : 0);
}

const datosGrafica = computed(() => ({
  labels: porEstado.value.map((e) => ESTADOS[e.nombre_estado]?.etiqueta || e.nombre_estado),
  datasets: [{
    data: porEstado.value.map((e) => e.cantidad),
    backgroundColor: porEstado.value.map((e) => ESTADOS[e.nombre_estado]?.color || '#999999'),
    // Separación blanca entre segmentos para distinguir colores contiguos
    // (sin borde si hay un solo segmento, para no cortar el anillo).
    borderColor: '#FFFFFF',
    borderWidth: porEstado.value.filter((e) => e.cantidad > 0).length > 1 ? 2 : 0,
    hoverOffset: 6,
  }],
}));

const opcionesGrafica = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '62%',
  plugins: {
    // La leyenda se dibuja en HTML al lado de la gráfica.
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => ` ${ctx.label}: ${ctx.parsed} (${porcentaje(ctx.parsed)})`,
      },
    },
  },
};

// ---------- Gráfica de barras: reportes por tipo de incidencia ----------
// Parte un nombre largo en varias líneas para que no se corte en pantallas angostas.
function envolverEtiqueta(texto, max = 18) {
  const lineas = [];
  let actual = '';
  for (const palabra of String(texto).split(' ')) {
    if (actual && (actual + ' ' + palabra).length > max) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = actual ? `${actual} ${palabra}` : palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

const totalPorTipo = computed(() => porTipo.value.reduce((s, t) => s + t.cantidad, 0));

// Barras horizontales: los nombres de los tipos son largos y así se leen completos.
// La altura crece con la cantidad de tipos para que las barras no se aplasten.
const alturaBarras = computed(() => `${Math.max(porTipo.value.length * 52 + 48, 200)}px`);

const datosBarras = computed(() => ({
  labels: porTipo.value.map((t) => t.nombre_tipo),
  datasets: [{
    label: 'Reportes',
    data: porTipo.value.map((t) => t.cantidad),
    backgroundColor: '#2C5F2D',
    hoverBackgroundColor: '#243D20',
    borderRadius: 4,
    borderSkipped: 'start', // redondea solo el extremo del dato, no la base
    maxBarThickness: 28,
  }],
}));

const opcionesBarras = {
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => ` ${ctx.parsed.x} ${ctx.parsed.x === 1 ? 'reporte' : 'reportes'}`,
      },
    },
  },
  scales: {
    x: {
      beginAtZero: true,
      ticks: { precision: 0, color: '#667085' },
      grid: { color: '#EEF0F3' },
      border: { display: false },
    },
    y: {
      ticks: {
        color: '#3A3A3A',
        font: { size: 13 },
        callback(valor) {
          const etiqueta = this.getLabelForValue(valor);
          return window.innerWidth < 640 ? envolverEtiqueta(etiqueta) : etiqueta;
        },
      },
      grid: { display: false },
      border: { color: '#E4E7EC' },
    },
  },
};

// ---------- Carga de datos ----------
async function cargar(filtros = {}) {
  if (resumen.value) actualizando.value = true;
  else cargando.value = true;
  error.value = '';
  try {
    // Período anterior de la misma duración (mismo alcance y filtros), para la comparación.
    const anterior = periodoAnterior(filtros);
    const [r, e, t, l, a] = await Promise.all([
      estadisticaService.resumen(filtros),
      estadisticaService.porEstado(filtros),
      estadisticaService.porTipo(filtros),
      estadisticaService.reportes(filtros),
      anterior ? estadisticaService.reportes({ ...filtros, ...anterior }) : Promise.resolve(null),
    ]);
    resumen.value = r.data;
    porEstado.value = e.data;
    porTipo.value = t.data;
    listado.value = l.data;
    listadoAnterior.value = a ? a.data : null;
    filtroAplicado.value = Object.keys(filtros).length ? filtros : null;
  } catch (err) {
    if (err.response?.status === 403) error.value = 'No tenés permiso para ver las estadísticas.';
    else if (err.response?.status === 400) error.value = err.response.data?.error || 'El rango de fechas no es válido.';
    else error.value = 'No se pudieron cargar las estadísticas.';
  } finally {
    cargando.value = false;
    actualizando.value = false;
  }
}

function aplicarFiltro() {
  if (fechaInicio.value && fechaFin.value && fechaInicio.value > fechaFin.value) {
    error.value = 'La fecha de inicio no puede ser posterior a la fecha de fin.';
    return;
  }
  const filtros = {};
  if (fechaInicio.value) filtros.fecha_inicio = fechaInicio.value;
  if (fechaFin.value) filtros.fecha_fin = fechaFin.value;
  if (esAdmin && idMunicipalidad.value) filtros.id_municipalidad = idMunicipalidad.value;
  cargar(filtros);
}

function limpiarFiltro() {
  fechaInicio.value = '';
  fechaFin.value = '';
  idMunicipalidad.value = '';
  cargar();
}

onMounted(async () => {
  cargar();
  // El administrador la usa para el filtro; ambos roles, para el nombre en el reporte impreso.
  try {
    const { data } = await catalogoService.municipalidades();
    municipalidades.value = data;
  } catch (err) {
    // Sin la lista, las estadísticas se ven igual; el reporte usa un nombre genérico.
  }
});
</script>

<template>
  <div class="container">
    <h1 class="title">Estadísticas</h1>
    <p class="sub">{{ esAdmin ? 'Estadísticas globales de la plataforma. Podés filtrar por municipalidad.' : 'Estadísticas de los reportes de tu municipalidad.' }}</p>

    <!-- Filtros: municipalidad (solo administrador) y rango de fechas -->
    <form class="card filter-card" @submit.prevent="aplicarFiltro">
      <div class="filter-head">
        <i class="bx bx-calendar"></i>
        <span>{{ esAdmin ? 'Filtrar por municipalidad y fecha de reporte' : 'Filtrar por fecha de reporte' }}</span>
      </div>
      <div class="filter-row">
        <div v-if="esAdmin" class="field">
          <label for="municipalidad"><i class="bx bx-building"></i> Municipalidad</label>
          <select id="municipalidad" v-model="idMunicipalidad">
            <option value="">Todas las municipalidades</option>
            <option v-for="m in municipalidades" :key="m.id_municipalidad" :value="m.id_municipalidad">
              {{ m.nombre }}
            </option>
          </select>
        </div>
        <div class="field">
          <label for="fecha-inicio">Fecha inicio</label>
          <input id="fecha-inicio" type="date" v-model="fechaInicio" :max="fechaFin || undefined" />
        </div>
        <div class="field">
          <label for="fecha-fin">Fecha fin</label>
          <input id="fecha-fin" type="date" v-model="fechaFin" :min="fechaInicio || undefined" />
        </div>
        <div class="filter-actions">
          <button type="submit" class="btn" :disabled="!hayFiltroEnFormulario || actualizando">
            <i class="bx bx-filter-alt"></i> Aplicar
          </button>
          <button type="button" class="btn ghost" :disabled="(!filtroAplicado && !hayFiltroEnFormulario) || actualizando"
                  @click="limpiarFiltro">
            <i class="bx bx-x"></i> Limpiar
          </button>
        </div>
      </div>
      <p class="filter-status">
        <i class="bx" :class="filtroAplicado ? 'bx-calendar-check' : 'bx-infinite'"></i>
        <template v-if="filtroAplicado">Mostrando reportes <strong>{{ descripcionFiltro }}</strong></template>
        <template v-else>{{ esAdmin ? 'Mostrando todos los reportes de todas las municipalidades' : 'Mostrando todos los reportes, sin rango de fechas' }}</template>
      </p>
    </form>

    <div v-if="error" class="alert error"><i class="bx bx-error-circle"></i> {{ error }}</div>
    <div v-if="cargando" class="alert ok"><i class="bx bx-loader-alt bx-spin"></i> Cargando estadísticas...</div>

    <!-- Reportería: con el filtro aplicado -->
    <div v-if="!cargando && resumen" class="report-actions">
      <button type="button" class="btn" :disabled="actualizando || !!generando" @click="descargar('excel')">
        <i class="bx" :class="generando === 'excel' ? 'bx-loader-alt bx-spin' : 'bx-download'"></i>
        {{ generando === 'excel' ? 'Generando Excel...' : 'Descargar Excel' }}
      </button>
      <button type="button" class="btn ghost" :disabled="actualizando || !!generando" @click="descargar('pdf')">
        <i class="bx" :class="generando === 'pdf' ? 'bx-loader-alt bx-spin' : 'bx-file'"></i>
        {{ generando === 'pdf' ? 'Generando PDF...' : 'Descargar PDF' }}
      </button>
    </div>

    <div v-if="!cargando && resumen" class="results" :class="{ dimmed: actualizando }">
      <div class="stats">
        <div v-for="t in tarjetas" :key="t.clave" class="stat-card">
          <span class="stat-icon" :class="'i-' + t.clave"><i class="bx" :class="t.icono"></i></span>
          <div>
            <div class="stat-number">{{ t.valor }}</div>
            <div class="stat-label">{{ t.etiqueta }}</div>
            <div v-if="t.nota" class="stat-nota">{{ t.nota }}</div>
          </div>
        </div>
      </div>

      <div class="card chart-card">
        <h2 class="card-title"><i class="bx bx-pie-chart-alt-2"></i> Distribución de reportes por estado</h2>

        <p v-if="totalGrafica === 0" class="empty">
          {{ filtroAplicado ? 'No hay reportes en el rango de fechas seleccionado.' : 'Todavía no hay reportes para graficar.' }}
        </p>

        <div v-else class="chart-body">
          <div ref="lienzoEstado" class="chart-wrap">
            <Doughnut :data="datosGrafica" :options="opcionesGrafica" />
            <div class="chart-center">
              <span class="center-number">{{ totalGrafica }}</span>
              <span class="center-label">reportes</span>
            </div>
          </div>

          <ul class="legend">
            <li v-for="e in porEstado" :key="e.id_estado">
              <span class="swatch" :style="{ background: ESTADOS[e.nombre_estado]?.color || '#999999' }"></span>
              <span class="legend-label">{{ ESTADOS[e.nombre_estado]?.etiqueta || e.nombre_estado }}</span>
              <span class="legend-value">{{ e.cantidad }}</span>
              <span class="legend-pct">{{ porcentaje(e.cantidad) }}</span>
            </li>
          </ul>
        </div>
      </div>

      <div class="card chart-card">
        <h2 class="card-title"><i class="bx bx-bar-chart-alt-2"></i> Reportes por tipo de incidencia</h2>

        <p v-if="totalPorTipo === 0" class="empty">
          {{ filtroAplicado ? 'No hay reportes en el rango de fechas seleccionado.' : 'Todavía no hay reportes para graficar.' }}
        </p>

        <div v-else ref="lienzoTipo" class="bar-wrap" :style="{ height: alturaBarras }">
          <Bar :data="datosBarras" :options="opcionesBarras" />
        </div>
      </div>

      <div class="card chart-card">
        <h2 class="card-title"><i class="bx bx-table"></i> Listado de reportes ({{ listado.length }})</h2>

        <p v-if="!listado.length" class="empty">
          {{ filtroAplicado ? 'No hay reportes en el rango de fechas seleccionado.' : 'Todavía no hay reportes.' }}
        </p>

        <div v-else class="table-wrap">
          <table class="dash-table listado">
            <thead>
              <tr>
                <th>Código</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Municipalidad</th>
                <th>Ubicación</th>
                <th>Encargado</th>
                <th>Resuelto el</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in listado" :key="r.codigo_seguimiento">
                <td class="codigo">{{ r.codigo_seguimiento }}</td>
                <td class="nowrap">{{ fechaHora(r.fecha_reporte) }}</td>
                <td>{{ r.nombre_tipo }}</td>
                <td><span class="badge" :class="'b-' + r.nombre_estado">{{ etiquetaEstado(r.nombre_estado) }}</span></td>
                <td>{{ r.municipalidad }}</td>
                <td class="nowrap coords">{{ r.latitud.toFixed(5) }}, {{ r.longitud.toFixed(5) }}</td>
                <td>{{ r.encargado_asignado || '—' }}</td>
                <td class="nowrap">{{ fechaHora(r.fecha_resolucion) || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---------- Filtro ---------- */
.filter-card { padding: 20px 24px; margin-bottom: 24px; }
.filter-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--forest-dark);
}
.filter-head i { font-size: 20px; color: var(--forest); }
.filter-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}
.field { flex: 1 1 180px; }
.field label { margin-top: 12px; }
.field label i { color: var(--forest); font-size: 15px; vertical-align: -2px; }
.filter-actions { display: flex; gap: 10px; }
.filter-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  font-size: 13px;
  color: var(--text-secondary);
}
.filter-status i { font-size: 16px; color: var(--forest); }
.filter-status strong { color: var(--slate); }

.results { transition: opacity .15s; }
.results.dimmed { opacity: .55; pointer-events: none; }

/* ---------- Tarjetas ---------- */
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
.stat-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-sm);
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 14px;
}
.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}
/* Mismos tonos que los badges de estado. */
.i-total { background: #E9F3E1; color: var(--forest); }
.i-recibido { background: #FDECEA; color: #B42318; }
.i-asignado { background: #EAF0FE; color: #3552CC; }
.i-en_atencion { background: #FFF3D6; color: #93650A; }
.i-resuelto { background: #E9F3E1; color: #2C5F2D; }
.i-descartado { background: #F2F4F7; color: #667085; }
.stat-number { font-size: 28px; font-weight: 700; color: var(--slate); line-height: 1.15; }
.stat-label { font-size: 13px; color: var(--text-secondary); }
.stat-nota { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
.i-asignacion { background: #E9F3E1; color: var(--forest); }

/* ---------- Gráficas ---------- */
.chart-card { padding: 24px; margin-bottom: 24px; }
.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: var(--forest-dark);
  margin-bottom: 20px;
}
.card-title i { font-size: 20px; color: var(--forest); }

.chart-body {
  display: flex;
  align-items: center;
  gap: 40px;
}
.chart-wrap {
  position: relative;
  width: 280px;
  height: 280px;
  flex-shrink: 0;
}
.chart-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.center-number { font-size: 30px; font-weight: 700; color: var(--slate); line-height: 1.1; }
.center-label { font-size: 12.5px; color: var(--text-secondary); }

.legend {
  list-style: none;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.legend li {
  display: grid;
  grid-template-columns: 12px 1fr auto 48px;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 14px;
}
.legend li:nth-child(odd) { background: var(--bg); }
.swatch { width: 12px; height: 12px; border-radius: 3px; }
.legend-label { color: var(--slate); }
.legend-value { font-weight: 700; color: var(--slate); }
.legend-pct { text-align: right; color: var(--text-secondary); font-size: 13px; }

.bar-wrap { position: relative; width: 100%; }

.empty { text-align: center; padding: 28px; color: var(--text-secondary); }

/* ---------- Reportería ---------- */
.report-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.listado { font-size: 13px; }
.listado .codigo { font-weight: 600; color: var(--forest-dark); white-space: nowrap; }
.listado .nowrap { white-space: nowrap; }
.listado .coords { color: var(--text-secondary); font-size: 12.5px; }

@media (max-width: 1100px) {
  .stats { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 768px) {
  .stats { grid-template-columns: 1fr 1fr; }
  .chart-body { flex-direction: column; gap: 24px; }
  .chart-wrap { width: 240px; height: 240px; }
  .legend { width: 100%; }
}
@media (max-width: 480px) {
  .stats { grid-template-columns: 1fr; }
  .filter-actions { width: 100%; }
  .filter-actions .btn { flex: 1; }
}
</style>

