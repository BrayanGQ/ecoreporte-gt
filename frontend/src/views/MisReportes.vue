<script setup>
import { ref, onMounted } from 'vue';
import { reporteService } from '../services/api';

const reportes = ref([]);
const error = ref('');
const cargando = ref(true);
const abierto = ref(null); // id_reporte cuyo historial está expandido
const historiales = ref({}); // { [id_reporte]: [...] }
const cargandoHistorial = ref(false);

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    const { data } = await reporteService.misReportes();
    reportes.value = data;
  } catch (err) {
    error.value = 'No se pudieron cargar tus reportes.';
  } finally {
    cargando.value = false;
  }
}

async function alternarHistorial(r) {
  if (abierto.value === r.id_reporte) {
    abierto.value = null;
    return;
  }
  abierto.value = r.id_reporte;
  if (!historiales.value[r.id_reporte]) {
    cargandoHistorial.value = true;
    try {
      const { data } = await reporteService.consultar(r.codigo_seguimiento);
      historiales.value = { ...historiales.value, [r.id_reporte]: data.historial };
    } catch (err) {
      historiales.value = { ...historiales.value, [r.id_reporte]: [] };
    } finally {
      cargandoHistorial.value = false;
    }
  }
}

function fecha(f) {
  return new Date(f).toLocaleDateString('es-GT');
}
function fechaHora(f) {
  return new Date(f).toLocaleString('es-GT');
}

onMounted(cargar);
</script>

<template>
  <div class="container">
    <h1 class="title"><i class="bx bx-list-ul"></i> Mis reportes</h1>
    <p class="sub">Reportes que registraste con tu cuenta. Hacé clic en uno para ver su historial.</p>

    <div v-if="error" class="alert error"><i class="bx bx-error-circle"></i> {{ error }}</div>
    <div v-if="cargando" class="alert ok"><i class="bx bx-loader-alt bx-spin"></i> Cargando tus reportes...</div>

    <div class="card lista-card" v-if="!cargando">
      <div v-if="reportes.length === 0" class="vacio">
        <i class="bx bx-archive-in"></i>
        <p>Todavía no registraste ningún reporte con tu cuenta.</p>
      </div>

      <ul v-else class="lista">
        <li v-for="r in reportes" :key="r.id_reporte" class="item">
          <button type="button" class="fila" @click="alternarHistorial(r)">
            <div class="col-principal">
              <strong>{{ r.codigo_seguimiento }}</strong>
              <span class="tipo">{{ r.nombre_tipo }}</span>
            </div>
            <span class="badge" :class="'b-' + r.nombre_estado">{{ r.nombre_estado }}</span>
            <span class="fecha">{{ fecha(r.fecha_reporte) }}</span>
            <i class="bx chevron" :class="abierto === r.id_reporte ? 'bx-chevron-up' : 'bx-chevron-down'"></i>
          </button>

          <div v-if="abierto === r.id_reporte" class="detalle">
            <p v-if="r.descripcion" class="descripcion">{{ r.descripcion }}</p>
            <div v-if="cargandoHistorial && !historiales[r.id_reporte]" class="cargando-historial">
              <i class="bx bx-loader-alt bx-spin"></i> Cargando historial...
            </div>
            <ul v-else class="timeline">
              <li v-for="(h, i) in historiales[r.id_reporte]" :key="i">
                <strong>{{ h.nombre_estado }}</strong>
                <span v-if="h.comentario"> — {{ h.comentario }}</span>
                <br /><small>{{ fechaHora(h.fecha_cambio) }}</small>
              </li>
            </ul>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.title { display: flex; align-items: center; gap: 10px; }
.lista-card { padding: 0; }
.vacio {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 48px 20px; color: var(--text-secondary); text-align: center;
}
.vacio i { font-size: 32px; color: var(--moss); }
.lista { list-style: none; }
.item { border-bottom: 1px solid var(--border); }
.item:last-child { border-bottom: none; }
.fila {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: none;
  border: none;
  text-align: left;
  font-size: 13.5px;
  color: var(--slate);
  transition: background .1s;
}
.fila:hover { background: #FAFBFC; }
.col-principal { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.col-principal .tipo { font-size: 12.5px; color: var(--text-secondary); }
.fecha { font-size: 12.5px; color: var(--text-secondary); white-space: nowrap; }
.chevron { font-size: 18px; color: var(--text-secondary); }
.detalle { padding: 0 20px 20px 20px; }
.descripcion { font-size: 13.5px; color: var(--text-secondary); margin-bottom: 12px; }
.cargando-historial { font-size: 13px; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; }
.timeline { list-style: none; }
.timeline li { padding: 8px 0 8px 18px; position: relative; font-size: 13px; border-left: 2px solid var(--moss); margin-left: 4px; }
.timeline li:before {
  content: ''; position: absolute; left: -6px; top: 12px;
  width: 10px; height: 10px; border-radius: 50%; background: var(--moss);
}

@media (max-width: 600px) {
  .fila { flex-wrap: wrap; }
}
</style>
