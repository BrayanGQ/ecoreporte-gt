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

// Responsable asignado: empleados de la misma municipalidad del reporte.
const empleados = ref(null); // null mientras carga
const errorEmpleados = ref('');
const nuevoResponsable = ref(null); // id_usuario, o null = sin asignar

// Solo el coordinador (personal_municipal) gestiona el reporte. El administrador lo ve
// en modo solo lectura; el encargado de cuadrilla, por ahora también (su panel es la fase 3).
const rol = JSON.parse(localStorage.getItem('usuario') || 'null')?.rol;
const puedeGestionar = rol === 'personal_municipal';

const estadosPosibles = ['recibido', 'asignado', 'en_atencion', 'resuelto', 'descartado'];

async function cargar() {
  try {
    const { data } = await reporteService.detalle(route.params.id);
    reporte.value = data;
    nuevoEstado.value = data.nombre_estado;
    nuevoResponsable.value = data.id_usuario_asignado;
  } catch (err) {
    error.value = err.response?.status === 403
      ? err.response.data?.error || 'No tenés acceso a este reporte.'
      : 'No se pudo cargar el detalle del reporte.';
  }
}

async function cargarEmpleados() {
  try {
    const { data } = await reporteService.asignables(route.params.id);
    empleados.value = data;
  } catch (err) {
    errorEmpleados.value = 'No se pudo cargar la lista de empleados.';
  }
}

async function guardarEstado() {
  error.value = '';
  ok.value = '';
  guardando.value = true;
  try {
    const datos = {
      nombre_estado: nuevoEstado.value,
      comentario: comentario.value,
    };
    // El responsable solo se envía si cambió, para no tocarlo al actualizar solo el estado.
    if (nuevoResponsable.value !== reporte.value.id_usuario_asignado) {
      datos.id_usuario_asignado = nuevoResponsable.value;
    }
    await reporteService.actualizarEstado(route.params.id, datos);
    ok.value = 'Cambios guardados correctamente.';
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

onMounted(() => {
  cargar();
  if (puedeGestionar) cargarEmpleados();
});
</script>

<template>
  <div class="container">
    <a class="volver" @click="router.push('/municipal/panel')"><i class="bx bx-arrow-back"></i> Volver a reportes</a>

    <div v-if="error" class="alert error"><i class="bx bx-error-circle"></i> {{ error }}</div>
    <div v-if="ok" class="alert ok"><i class="bx bx-check-circle"></i> {{ ok }}</div>

    <div v-if="reporte">
      <h1 class="title"><i class="bx bx-file"></i> Reporte {{ reporte.codigo_seguimiento }}</h1>

      <div v-if="rol === 'administrador'" class="solo-lectura">
        <i class="bx bx-lock-alt"></i> Modo solo lectura: la atención de reportes la gestiona el personal municipal.
      </div>

      <div class="grid" :class="{ unica: !puedeGestionar }">
        <!-- Datos -->
        <div class="card">
          <h3><i class="bx bx-info-circle"></i> Datos del reporte</h3>
          <p><strong>Tipo:</strong> {{ reporte.nombre_tipo }}</p>
          <p><strong>Descripción:</strong> {{ reporte.descripcion || '—' }}</p>
          <p><strong>Ubicación:</strong> {{ Number(reporte.latitud).toFixed(5) }}, {{ Number(reporte.longitud).toFixed(5) }}</p>
          <p><strong>Municipalidad:</strong> {{ reporte.municipalidad }}</p>
          <p><strong>Fecha:</strong> {{ fecha(reporte.fecha_reporte) }}</p>
          <p><strong>Reportado por:</strong> {{ reporte.reportado_por || 'Anónimo' }}</p>
          <p class="fila"><strong>Estado actual:</strong>
            <span class="badge" :class="'b-' + reporte.nombre_estado">{{ reporte.nombre_estado }}</span>
          </p>
          <p class="fila"><strong>Responsable:</strong>
            <span v-if="reporte.asignado_a" class="responsable"><i class="bx bx-user-check"></i> {{ reporte.asignado_a }}</span>
            <span v-else class="sin-asignar">Sin asignar</span>
          </p>
        </div>

        <!-- Gestión de estado (solo coordinador) -->
        <div v-if="puedeGestionar" class="card">
          <h3><i class="bx bx-cog"></i> Gestionar reporte</h3>
          <label for="responsable"><i class="bx bx-user-check"></i> Responsable asignado</label>
          <select id="responsable" v-model="nuevoResponsable" :disabled="!!errorEmpleados">
            <option :value="null">Sin asignar</option>
            <option v-for="emp in empleados" :key="emp.id_usuario" :value="emp.id_usuario">
              {{ emp.nombre_completo }}
            </option>
          </select>
          <small v-if="errorEmpleados" class="nota error-nota">{{ errorEmpleados }}</small>
          <small v-else-if="empleados && !empleados.length" class="nota">No hay personal activo en la municipalidad de este reporte.</small>
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
.responsable {
  display: inline-flex; align-items: center; gap: 5px;
  background: #E9F3E1; color: var(--forest); font-weight: 600; font-size: 13px;
  padding: 3px 10px; border-radius: 20px;
}
.responsable i { font-size: 15px; }
.sin-asignar { color: var(--text-secondary); font-style: italic; }
label i { color: var(--forest); font-size: 15px; vertical-align: -2px; }
.nota { display: block; margin-top: 6px; font-size: 12px; color: var(--text-secondary); }
.error-nota { color: #B42318; }
.timeline { list-style: none; }
.timeline li { padding: 8px 0 8px 18px; position: relative; font-size: 13px; border-left: 2px solid var(--moss); margin-left: 4px; }
.timeline li:before {
  content: ''; position: absolute; left: -6px; top: 12px;
  width: 10px; height: 10px; border-radius: 50%; background: var(--moss);
}
.grid.unica { grid-template-columns: 1fr; }
@media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }
.solo-lectura {
  display: flex; align-items: center; gap: 8px;
  background: var(--cream); border: 1px solid #DCE6CC; color: var(--forest);
  border-radius: var(--radius-input); padding: 10px 14px; font-size: 13px; margin-bottom: 16px;
}
.solo-lectura i { font-size: 17px; }

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
