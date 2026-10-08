<script setup>
import { ref, computed, onMounted } from 'vue';
import { Doughnut, Bar } from 'vue-chartjs';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { estadisticaService, catalogoService } from '../services/api';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip);

// Presentación de cada estado: etiqueta legible, ícono, color de la gráfica y clase de la tarjeta.
const ESTADOS = {
  recibido:    { etiqueta: 'Recibidos',   icono: 'bx-archive-in',     color: '#E74C3C' },
  asignado:    { etiqueta: 'Asignados',   icono: 'bx-user-check',     color: '#5B8DEF' },
  en_atencion: { etiqueta: 'En atención', icono: 'bx-loader-circle',  color: '#E0A800' },
  resuelto:    { etiqueta: 'Resueltos',   icono: 'bx-check-circle',   color: '#97BC62' },
  descartado:  { etiqueta: 'Descartados', icono: 'bx-x-circle',       color: '#999999' },
};

const resumen = ref(null);
const porEstado = ref([]);
const porTipo = ref([]);
const error = ref('');
const cargando = ref(true);      // primera carga: oculta el contenido
const actualizando = ref(false); // recarga por filtro: atenúa el contenido sin ocultarlo

// El coordinador (personal_municipal) solo ve su municipalidad: el backend lo limita.
// El administrador ve todo y puede filtrar por municipalidad.
const esAdmin = JSON.parse(localStorage.getItem('usuario') || 'null')?.rol === 'administrador';
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

// Tarjetas: total + una por cada estado, en el orden que define el catálogo.
const tarjetas = computed(() => {
  if (!resumen.value) return [];
  const estados = porEstado.value.length
    ? porEstado.value.map((e) => e.nombre_estado)
    : Object.keys(resumen.value.por_estado);
  return [
    { clave: 'total', etiqueta: 'Total de reportes', icono: 'bx-grid-alt', valor: resumen.value.total },
    ...estados.map((nombre) => ({
      clave: nombre,
      etiqueta: ESTADOS[nombre]?.etiqueta || nombre,
      icono: ESTADOS[nombre]?.icono || 'bx-circle',
      valor: resumen.value.por_estado[nombre] ?? 0,
    })),
  ];
});

// ---------- Gráfica de dona: reportes por estado ----------
const totalGrafica = computed(() => porEstado.value.reduce((s, e) => s + e.cantidad, 0));

function porcentaje(cantidad) {
  if (!totalGrafica.value) return '0%';
  return `${Math.round((cantidad / totalGrafica.value) * 100)}%`;
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
    const [r, e, t] = await Promise.all([
      estadisticaService.resumen(filtros),
      estadisticaService.porEstado(filtros),
      estadisticaService.porTipo(filtros),
    ]);
    resumen.value = r.data;
    porEstado.value = e.data;
    porTipo.value = t.data;
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
  if (esAdmin) {
    try {
      const { data } = await catalogoService.municipalidades();
      municipalidades.value = data;
    } catch (err) {
      // Sin la lista, el administrador sigue viendo las estadísticas globales.
    }
  }
});
</script>

<template>
  <div class="container">
    <h1 class="title">Estadísticas</h1>
    <p class="sub">{{ esAdmin ? 'Estadísticas globales de la plataforma. Podés filtrar por municipalidad.' : 'Estadísticas de los reportes de tu municipalidad.' }}</p>

    <!-- Filtro por rango de fechas -->
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

    <div v-if="!cargando && resumen" class="results" :class="{ dimmed: actualizando }">
      <div class="stats">
        <div v-for="t in tarjetas" :key="t.clave" class="stat-card">
          <span class="stat-icon" :class="'i-' + t.clave"><i class="bx" :class="t.icono"></i></span>
          <div>
            <div class="stat-number">{{ t.valor }}</div>
            <div class="stat-label">{{ t.etiqueta }}</div>
          </div>
        </div>
      </div>

      <div class="card chart-card">
        <h2 class="card-title"><i class="bx bx-pie-chart-alt-2"></i> Distribución de reportes por estado</h2>

        <p v-if="totalGrafica === 0" class="empty">
          {{ filtroAplicado ? 'No hay reportes en el rango de fechas seleccionado.' : 'Todavía no hay reportes para graficar.' }}
        </p>

        <div v-else class="chart-body">
          <div class="chart-wrap">
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

        <div v-else class="bar-wrap" :style="{ height: alturaBarras }">
          <Bar :data="datosBarras" :options="opcionesBarras" />
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
  grid-template-columns: repeat(3, 1fr);
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
