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
const imagenAmpliada = ref(null);

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

      <!-- Evidencia fotográfica -->
      <div class="card" style="margin-top:20px">
        <h3><i class="bx bx-camera"></i> Evidencia fotográfica</h3>
        <div v-if="reporte.evidencias && reporte.evidencias.length" class="evidencias">
          <button
            v-for="ev in reporte.evidencias"
            :key="ev.id_evidencia"
            type="button"
            class="evidencia"
            @click="imagenAmpliada = ev.url_imagen"
          >
            <img :src="ev.url_imagen" :alt="'Evidencia ' + ev.id_evidencia" />
          </button>
        </div>
        <p v-else class="sin-evidencia">Este reporte no tiene fotografías de evidencia.</p>
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

    <!-- Lightbox de evidencia -->
    <div v-if="imagenAmpliada" class="lightbox" @click="imagenAmpliada = null">
      <button type="button" class="cerrar" title="Cerrar"><i class="bx bx-x"></i></button>
      <img :src="imagenAmpliada" alt="Evidencia ampliada" @click.stop />
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

.evidencias { display: flex; flex-wrap: wrap; gap: 10px; }
.evidencia {
  width: 110px; height: 110px; padding: 0; border: 1px solid var(--border);
  border-radius: var(--radius-input); overflow: hidden; background: none;
  transition: border-color .15s, transform .15s;
}
.evidencia:hover { border-color: var(--moss); transform: translateY(-2px); }
.evidencia img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sin-evidencia { font-size: 13px; color: var(--text-secondary); }

.lightbox {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(16, 24, 40, .8);
  display: flex; align-items: center; justify-content: center;
  padding: 32px;
}
.lightbox img {
  max-width: 90vw; max-height: 88vh; border-radius: var(--radius-card);
  box-shadow: 0 8px 32px rgba(0, 0, 0, .4);
}
.lightbox .cerrar {
  position: absolute; top: 20px; right: 24px;
  width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
  background: rgba(255, 255, 255, .15); color: #fff; border: none; border-radius: 50%;
  font-size: 24px;
}
.lightbox .cerrar:hover { background: rgba(255, 255, 255, .3); }
</style>
