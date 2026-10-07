<script setup>
import { ref, computed, onMounted } from 'vue';
import { Doughnut } from 'vue-chartjs';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { estadisticaService } from '../services/api';

ChartJS.register(ArcElement, Tooltip);

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
const error = ref('');
const cargando = ref(true);

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

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    const [r, e] = await Promise.all([estadisticaService.resumen(), estadisticaService.porEstado()]);
    resumen.value = r.data;
    porEstado.value = e.data;
  } catch (err) {
    error.value = err.response?.status === 403
      ? 'No tenés permiso para ver las estadísticas.'
      : 'No se pudieron cargar las estadísticas.';
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <div class="container">
    <h1 class="title">Estadísticas</h1>
    <p class="sub">Resumen general de los reportes registrados en la plataforma.</p>

    <div v-if="error" class="alert error"><i class="bx bx-error-circle"></i> {{ error }}</div>
    <div v-if="cargando" class="alert ok"><i class="bx bx-loader-alt bx-spin"></i> Cargando estadísticas...</div>

    <template v-if="!cargando && resumen">
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

        <p v-if="totalGrafica === 0" class="empty">Todavía no hay reportes para graficar.</p>

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
    </template>
  </div>
</template>

<style scoped>
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

.chart-card { padding: 24px; }
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

.empty { text-align: center; padding: 28px; color: var(--text-secondary); }

@media (max-width: 768px) {
  .stats { grid-template-columns: 1fr 1fr; }
  .chart-body { flex-direction: column; gap: 24px; }
  .chart-wrap { width: 240px; height: 240px; }
  .legend { width: 100%; }
}
@media (max-width: 480px) {
  .stats { grid-template-columns: 1fr; }
}
</style>
