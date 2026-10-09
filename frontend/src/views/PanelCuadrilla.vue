<script setup>
// Panel del encargado de cuadrilla: sus reportes asignados, agrupados en
// pendientes (asignado), en atención y resueltos. Pensado para usarse en el celular.
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { reporteService } from '../services/api';
import { urlComoLlegar } from '../utils/mapas';

const router = useRouter();
const reportes = ref([]);
const error = ref('');
const cargando = ref(true);

const PESTANAS = [
  { estado: 'asignado', etiqueta: 'Pendientes', icono: 'bx-time-five', vacio: 'No tenés reportes pendientes. ¡Buen trabajo!' },
  { estado: 'en_atencion', etiqueta: 'En atención', icono: 'bx-loader-circle', vacio: 'No tenés reportes en atención.' },
  { estado: 'resuelto', etiqueta: 'Resueltos', icono: 'bx-check-circle', vacio: 'Todavía no resolviste reportes.' },
];
const pestana = ref('asignado');

const conteo = computed(() =>
  Object.fromEntries(PESTANAS.map((p) => [p.estado, reportes.value.filter((r) => r.nombre_estado === p.estado).length]))
);
const pestanaActual = computed(() => PESTANAS.find((p) => p.estado === pestana.value));
const visibles = computed(() => reportes.value.filter((r) => r.nombre_estado === pestana.value));

async function cargar() {
  cargando.value = true;
  try {
    // El backend devuelve solo los reportes asignados a este encargado.
    const { data } = await reporteService.listar({});
    reportes.value = data;
    // Si no hay pendientes pero sí trabajo en curso, abre directamente esa pestaña.
    if (!conteo.value.asignado && conteo.value.en_atencion) pestana.value = 'en_atencion';
  } catch (err) {
    error.value = 'No se pudieron cargar tus reportes.';
  } finally {
    cargando.value = false;
  }
}

function abrir(id) {
  router.push(`/municipal/panel/reporte/${id}`);
}

function fecha(f) {
  return new Date(f).toLocaleDateString('es-GT');
}

onMounted(cargar);
</script>

<template>
  <div class="container">
    <h1 class="title">Mis reportes asignados</h1>
    <p class="sub">Reportes asignados a tu cuadrilla para su atención.</p>

    <div v-if="error" class="alert error"><i class="bx bx-error-circle"></i> {{ error }}</div>

    <!-- Tarjetas de resumen: también funcionan como acceso directo a cada pestaña -->
    <div class="stats">
      <button
        v-for="p in PESTANAS"
        :key="p.estado"
        type="button"
        class="stat-card"
        :class="{ activa: pestana === p.estado }"
        @click="pestana = p.estado"
      >
        <span class="stat-icon" :class="'i-' + p.estado"><i class="bx" :class="p.icono"></i></span>
        <div>
          <div class="stat-number">{{ conteo[p.estado] }}</div>
          <div class="stat-label">{{ p.etiqueta }}</div>
        </div>
      </button>
    </div>

    <div class="tabs" role="tablist">
      <button
        v-for="p in PESTANAS"
        :key="p.estado"
        type="button"
        role="tab"
        class="tab"
        :class="{ activa: pestana === p.estado }"
        :aria-selected="pestana === p.estado"
        @click="pestana = p.estado"
      >
        {{ p.etiqueta }} <span class="tab-count">{{ conteo[p.estado] }}</span>
      </button>
    </div>

    <div v-if="cargando" class="alert ok"><i class="bx bx-loader-alt bx-spin"></i> Cargando tus reportes...</div>

    <template v-else>
      <div v-if="!visibles.length" class="card vacio">
        <i class="bx" :class="pestanaActual.icono"></i>
        <p>{{ pestanaActual.vacio }}</p>
      </div>

      <ul v-else class="lista">
        <li v-for="r in visibles" :key="r.id_reporte" class="card item">
          <div class="item-head">
            <strong>{{ r.codigo_seguimiento }}</strong>
            <span class="badge" :class="'b-' + r.nombre_estado">{{ r.nombre_estado }}</span>
          </div>
          <p class="tipo"><i class="bx bx-trash"></i> {{ r.nombre_tipo }}</p>
          <p v-if="r.descripcion" class="descripcion">{{ r.descripcion }}</p>
          <p class="meta"><i class="bx bx-calendar"></i> Reportado el {{ fecha(r.fecha_reporte) }}</p>

          <div class="item-acciones">
            <a
              v-if="r.nombre_estado !== 'resuelto'"
              class="btn ghost"
              :href="urlComoLlegar(r.latitud, r.longitud)"
              target="_blank"
              rel="noopener"
            >
              <i class="bx bx-map"></i> Cómo llegar
            </a>
            <button type="button" class="btn" @click="abrir(r.id_reporte)">
              <template v-if="r.nombre_estado === 'asignado'"><i class="bx bx-play-circle"></i> Atender</template>
              <template v-else-if="r.nombre_estado === 'en_atencion'"><i class="bx bx-check-circle"></i> Resolver</template>
              <template v-else><i class="bx bx-show"></i> Ver detalle</template>
            </button>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
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
  text-align: left;
  font: inherit;
  color: inherit;
  transition: border-color .15s, box-shadow .15s;
}
.stat-card:hover { border-color: var(--moss); }
.stat-card.activa { border-color: var(--forest); box-shadow: 0 0 0 3px rgba(44, 95, 45, .12); }
.stat-icon {
  width: 44px; height: 44px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; font-size: 20px;
}
.i-asignado { background: #EAF0FE; color: #3552CC; }
.i-en_atencion { background: #FFF3D6; color: #93650A; }
.i-resuelto { background: #E9F3E1; color: #2C5F2D; }
.stat-number { font-size: 24px; font-weight: 700; color: var(--slate); line-height: 1.2; }
.stat-label { font-size: 13px; color: var(--text-secondary); }

.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 16px;
}
.tab {
  display: inline-flex; align-items: center; gap: 8px;
  background: none; border: none; border-bottom: 2px solid transparent;
  padding: 12px 16px; margin-bottom: -1px;
  font-size: 14px; font-weight: 600; color: var(--text-secondary);
}
.tab:hover { color: var(--forest); }
.tab.activa { color: var(--forest); border-bottom-color: var(--forest); }
.tab-count {
  background: var(--lgray); color: var(--slate); border-radius: 20px;
  padding: 1px 8px; font-size: 12px;
}
.tab.activa .tab-count { background: var(--forest); color: #fff; }

.lista { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.item { padding: 20px; display: flex; flex-direction: column; gap: 8px; }
.item-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.item-head strong { font-size: 15px; color: var(--forest-dark); }
.tipo { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: var(--slate); }
.tipo i { color: var(--forest); font-size: 17px; }
.descripcion { font-size: 13.5px; color: var(--text-secondary); }
.meta { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-secondary); }
.item-acciones { display: flex; gap: 10px; margin-top: auto; padding-top: 8px; }
.item-acciones .btn { flex: 1; text-decoration: none; }

.vacio {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 40px 20px; color: var(--text-secondary); text-align: center;
}
.vacio i { font-size: 32px; color: var(--moss); }

@media (max-width: 768px) {
  .lista { grid-template-columns: 1fr; }
}
/* En el celular: tarjetas de resumen compactas y botones grandes, fáciles de tocar en el campo. */
@media (max-width: 480px) {
  .stats { gap: 8px; }
  .stat-card { flex-direction: column; align-items: flex-start; gap: 8px; padding: 12px; }
  .stat-icon { width: 36px; height: 36px; font-size: 18px; }
  .stat-number { font-size: 22px; }
  .stat-label { font-size: 12px; }
  .tab { flex: 1; justify-content: center; gap: 6px; padding: 12px 4px; font-size: 13px; white-space: nowrap; }
  .item-acciones .btn { min-height: 48px; }
}
</style>
