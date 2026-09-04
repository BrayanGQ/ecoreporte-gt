<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { reporteService } from '../services/api';

const router = useRouter();
const reportes = ref([]);
const error = ref('');
const cargando = ref(true);

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

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="cargando" class="alert ok">Cargando reportes...</div>

    <div class="card" style="padding:0;overflow:hidden" v-if="!cargando">
      <table>
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
            <td>{{ r.codigo_seguimiento }}</td>
            <td>{{ r.nombre_tipo }}</td>
            <td>{{ r.descripcion || '—' }}</td>
            <td>{{ fecha(r.fecha_reporte) }}</td>
            <td><span class="badge" :class="'b-' + r.nombre_estado">{{ r.nombre_estado }}</span></td>
            <td><button class="btn ghost" style="padding:6px 12px;font-size:12px" @click="gestionar(r.id_reporte)">Gestionar</button></td>
          </tr>
          <tr v-if="reportes.length === 0">
            <td colspan="6" style="text-align:center;padding:24px;color:#999">No hay reportes registrados.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead { background: var(--moss); }
th { color: var(--forest); text-align: left; padding: 12px; font-size: 12px; }
td { padding: 12px; border-bottom: 1px solid var(--lgray); }
tr:nth-child(even) td { background: var(--lgray); }
</style>
