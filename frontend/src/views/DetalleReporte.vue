<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { reporteService } from '../services/api';

const route = useRoute();
const router = useRouter();
const reporte = ref(null);
const error = ref('');
const ok = ref('');
const nuevoEstado = ref('');
const comentario = ref('');
const guardando = ref(false);

const estadosPosibles = ['recibido', 'asignado', 'en_atencion', 'resuelto', 'descartado'];

async function cargar() {
  try {
    const { data } = await reporteService.detalle(route.params.id);
    reporte.value = data;
    nuevoEstado.value = data.nombre_estado;
  } catch (err) {
    error.value = 'No se pudo cargar el detalle del reporte.';
  }
}

async function guardarEstado() {
  error.value = '';
  ok.value = '';
  guardando.value = true;
  try {
    await reporteService.actualizarEstado(route.params.id, {
      nombre_estado: nuevoEstado.value,
      comentario: comentario.value,
    });
    ok.value = 'Estado actualizado correctamente.';
    comentario.value = '';
    await cargar();
  } catch (err) {
    error.value = err.response?.data?.error || 'Error al actualizar el estado.';
  } finally {
    guardando.value = false;
  }
}

function fecha(f) {
  return new Date(f).toLocaleString('es-GT');
}

onMounted(cargar);
</script>

<template>
  <div class="container">
    <a class="volver" @click="router.push('/municipal/panel')"><i class="bx bx-arrow-back"></i> Volver a reportes</a>

    <div v-if="error" class="alert error"><i class="bx bx-error-circle"></i> {{ error }}</div>
    <div v-if="ok" class="alert ok"><i class="bx bx-check-circle"></i> {{ ok }}</div>

    <div v-if="reporte">
      <h1 class="title"><i class="bx bx-file"></i> Reporte {{ reporte.codigo_seguimiento }}</h1>

      <div class="grid">
        <!-- Datos -->
        <div class="card">
          <h3><i class="bx bx-info-circle"></i> Datos del reporte</h3>
          <p><strong>Tipo:</strong> {{ reporte.nombre_tipo }}</p>
          <p><strong>Descripción:</strong> {{ reporte.descripcion || '—' }}</p>
          <p><strong>Ubicación:</strong> {{ Number(reporte.latitud).toFixed(5) }}, {{ Number(reporte.longitud).toFixed(5) }}</p>
          <p><strong>Fecha:</strong> {{ fecha(reporte.fecha_reporte) }}</p>
          <p><strong>Reportado por:</strong> {{ reporte.reportado_por || 'Anónimo' }}</p>
          <p class="fila"><strong>Estado actual:</strong>
            <span class="badge" :class="'b-' + reporte.nombre_estado">{{ reporte.nombre_estado }}</span>
          </p>
        </div>

        <!-- Gestión de estado -->
        <div class="card">
          <h3><i class="bx bx-cog"></i> Actualizar estado</h3>
          <label>Nuevo estado</label>
          <select v-model="nuevoEstado">
            <option v-for="e in estadosPosibles" :key="e" :value="e">{{ e }}</option>
          </select>
          <label>Comentario (opcional)</label>
          <textarea v-model="comentario" placeholder="Detalle del cambio..."></textarea>
          <button class="btn block" style="margin-top:14px" :disabled="guardando" @click="guardarEstado">
            <i class="bx bx-save"></i> {{ guardando ? 'Guardando...' : 'Guardar cambios' }}
          </button>
        </div>
      </div>

      <!-- Historial -->
      <div class="card" style="margin-top:20px">
        <h3><i class="bx bx-history"></i> Historial de estados</h3>
        <ul class="timeline">
          <li v-for="(h, i) in reporte.historial" :key="i">
            <strong>{{ h.nombre_estado }}</strong>
            <span v-if="h.comentario"> — {{ h.comentario }}</span>
            <span v-if="h.responsable"> · {{ h.responsable }}</span>
            <br /><small>{{ fecha(h.fecha_cambio) }}</small>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title { display: flex; align-items: center; gap: 10px; }
.volver {
  color: var(--forest); cursor: pointer; font-size: 13px; font-weight: 600;
  display: inline-flex; align-items: center; gap: 6px; margin-bottom: 16px;
}
.volver:hover { text-decoration: underline; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.card h3 {
  color: var(--forest-dark); font-size: 15px; font-weight: 700; margin-bottom: 14px;
  display: flex; align-items: center; gap: 8px;
}
.card p { margin: 8px 0; font-size: 14px; }
.fila { display: flex; align-items: center; gap: 8px; }
.timeline { list-style: none; }
.timeline li { padding: 8px 0 8px 18px; position: relative; font-size: 13px; border-left: 2px solid var(--moss); margin-left: 4px; }
.timeline li:before {
  content: ''; position: absolute; left: -6px; top: 12px;
  width: 10px; height: 10px; border-radius: 50%; background: var(--moss);
}
@media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }
</style>
