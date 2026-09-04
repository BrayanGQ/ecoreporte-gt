<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { reporteService } from '../services/api';

const router = useRouter();
const reportes = ref([]);
const error = ref('');
const cargando = ref(true);

const totalReportes = computed(() => reportes.value.length);
const totalRecibidos = computed(() => reportes.value.filter((r) => r.nombre_estado === 'recibido').length);
const totalEnAtencion = computed(() => reportes.value.filter((r) => r.nombre_estado === 'en_atencion').length);
const totalResueltos = computed(() => reportes.value.filter((r) => r.nombre_estado === 'resuelto').length);

async function cargar() {
  cargando.value = true;
  try {
    const { data } = await reporteService.listar({});
    reportes.value = data;
  } catch (err) {
    error.value = 'No se pudieron cargar los reportes.';
  } finally {
    cargando.value = false;
  }
}

function gestionar(id) {
  router.push(`/municipal/panel/reporte/${id}`);
}

function fecha(f) {
  return new Date(f).toLocaleDateString('es-GT');
}

onMounted(cargar);
</script>

<template>
  <div class="container">
    <h1 class="title">Reportes recibidos</h1>
    <p class="sub">Gestioná los reportes de tu municipalidad.</p>

    <div v-if="error" class="alert error"><i class="bx bx-error-circle"></i> {{ error }}</div>

    <div class="stats">
      <div class="stat-card">
        <span class="stat-icon i-total"><i class="bx bx-grid-alt"></i></span>
        <div>
          <div class="stat-number">{{ totalReportes }}</div>
          <div class="stat-label">Total de reportes</div>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon i-recibido"><i class="bx bx-inbox"></i></span>
        <div>
          <div class="stat-number">{{ totalRecibidos }}</div>
          <div class="stat-label">Recibidos</div>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon i-atencion"><i class="bx bx-loader-circle"></i></span>
        <div>
          <div class="stat-number">{{ totalEnAtencion }}</div>
          <div class="stat-label">En atención</div>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon i-resuelto"><i class="bx bx-check-circle"></i></span>
        <div>
          <div class="stat-number">{{ totalResueltos }}</div>
          <div class="stat-label">Resueltos</div>
        </div>
      </div>
    </div>

    <div v-if="cargando" class="alert ok"><i class="bx bx-loader-alt bx-spin"></i> Cargando reportes...</div>

    <div class="card table-card" v-if="!cargando">
      <div class="table-wrap">
        <table class="dash-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Tipo</th>
              <th>Descripción</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in reportes" :key="r.id_reporte">
              <td><strong>{{ r.codigo_seguimiento }}</strong></td>
              <td>{{ r.nombre_tipo }}</td>
              <td>{{ r.descripcion || '—' }}</td>
              <td>{{ fecha(r.fecha_reporte) }}</td>
              <td><span class="badge" :class="'b-' + r.nombre_estado">{{ r.nombre_estado }}</span></td>
              <td>
                <button class="btn ghost btn-sm" @click="gestionar(r.id_reporte)">
                  <i class="bx bx-cog"></i> Gestionar
                </button>
              </td>
            </tr>
            <tr v-if="reportes.length === 0">
              <td colspan="6" class="empty">No hay reportes registrados.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
.i-total { background: #EAF0FE; color: #3552CC; }
.i-recibido { background: #FDECEA; color: #B42318; }
.i-atencion { background: #FFF3D6; color: #93650A; }
.i-resuelto { background: #E9F3E1; color: #2C5F2D; }
.stat-number { font-size: 24px; font-weight: 700; color: var(--slate); line-height: 1.2; }
.stat-label { font-size: 13px; color: var(--text-secondary); }

.table-card { padding: 0; }
.btn-sm { padding: 7px 13px; font-size: 12.5px; }
.empty { text-align: center; padding: 28px; color: var(--text-secondary); }

@media (max-width: 768px) {
  .stats { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 480px) {
  .stats { grid-template-columns: 1fr; }
}
</style>
