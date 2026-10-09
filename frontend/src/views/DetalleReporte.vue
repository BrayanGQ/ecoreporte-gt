<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { reporteService } from '../services/api';

const route = useRoute();
const router = useRouter();
const reporte = ref(null);
const error = ref('');
const ok = ref('');
const guardando = ref(false);
const imagenAmpliada = ref(null);

// Encargados de cuadrilla de la misma municipalidad del reporte.
const cuadrillas = ref(null); // null mientras carga
const errorCuadrillas = ref('');
const cuadrillaElegida = ref('');

// Descarte: el motivo es obligatorio.
const descartando = ref(false);
const motivo = ref('');

// Solo el coordinador (personal_municipal) gestiona el reporte. El administrador lo ve
// en modo solo lectura; el encargado de cuadrilla, por ahora también (su panel es la fase 3).
const rol = JSON.parse(localStorage.getItem('usuario') || 'null')?.rol;
const puedeGestionar = rol === 'personal_municipal';

// Aviso de solo lectura para los estados en los que el coordinador ya no actúa.
const AVISOS_ESTADO = {
  en_atencion: { icono: 'bx-loader-circle', texto: 'La cuadrilla asignada está atendiendo este reporte.' },
  resuelto: { icono: 'bx-check-circle', texto: 'Este reporte ya fue resuelto por la cuadrilla.' },
  descartado: { icono: 'bx-x-circle', texto: 'Este reporte fue descartado.' },
};

// Cuadrillas disponibles para reasignar: todas menos la actual.
const cuadrillasParaReasignar = computed(() =>
  (cuadrillas.value || []).filter((c) => c.id_usuario !== reporte.value?.id_usuario_asignado)
);

async function cargar() {
  try {
    const { data } = await reporteService.detalle(route.params.id);
    reporte.value = data;
    cuadrillaElegida.value = '';
    descartando.value = false;
    motivo.value = '';
  } catch (err) {
    error.value = err.response?.status === 403
      ? err.response.data?.error || 'No tenés acceso a este reporte.'
      : 'No se pudo cargar el detalle del reporte.';
  }
}

async function cargarCuadrillas() {
  try {
    const { data } = await reporteService.asignables(route.params.id);
    cuadrillas.value = data;
  } catch (err) {
    errorCuadrillas.value = 'No se pudo cargar la lista de encargados de cuadrilla.';
  }
}

// Ejecuta una acción del flujo y refresca el detalle (estado, responsable e historial).
async function ejecutar(accion, mensajeOk) {
  error.value = '';
  ok.value = '';
  guardando.value = true;
  try {
    await accion();
    ok.value = mensajeOk;
    await cargar();
  } catch (err) {
    error.value = err.response?.data?.error || 'No se pudo actualizar el reporte.';
  } finally {
    guardando.value = false;
  }
}

function asignar() {
  const reasignando = reporte.value.nombre_estado === 'asignado';
  ejecutar(
    () => reporteService.asignar(route.params.id, cuadrillaElegida.value),
    reasignando ? 'Reporte reasignado correctamente.' : 'Reporte asignado correctamente.'
  );
}

function descartar() {
  if (!motivo.value.trim()) {
    error.value = 'Escribí el motivo del descarte.';
    return;
  }
  ejecutar(() => reporteService.descartar(route.params.id, motivo.value.trim()), 'Reporte descartado.');
}

function fecha(f) {
  return new Date(f).toLocaleString('es-GT');
}

onMounted(() => {
  cargar();
  if (puedeGestionar) cargarCuadrillas();
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

        <!-- Gestión del reporte (solo coordinador): solo las acciones válidas según el estado -->
        <div v-if="puedeGestionar" class="card">
          <h3><i class="bx bx-cog"></i> Gestionar reporte</h3>

          <!-- recibido / asignado: asignar o reasignar una cuadrilla -->
          <template v-if="['recibido', 'asignado'].includes(reporte.nombre_estado) && !descartando">
            <div v-if="reporte.nombre_estado === 'asignado'" class="actual">
              <span class="actual-label">Cuadrilla actual</span>
              <span class="responsable"><i class="bx bx-user-check"></i> {{ reporte.asignado_a || 'Sin asignar' }}</span>
            </div>

            <label for="cuadrilla">
              <i class="bx bx-user-check"></i>
              {{ reporte.nombre_estado === 'asignado' ? 'Reasignar a otra cuadrilla' : 'Encargado de cuadrilla' }}
            </label>
            <select id="cuadrilla" v-model="cuadrillaElegida" :disabled="!!errorCuadrillas || guardando">
              <option value="">Seleccioná un encargado</option>
              <option
                v-for="c in (reporte.nombre_estado === 'asignado' ? cuadrillasParaReasignar : cuadrillas)"
                :key="c.id_usuario"
                :value="c.id_usuario"
              >
                {{ c.nombre_completo }}
              </option>
            </select>
            <small v-if="errorCuadrillas" class="nota error-nota">{{ errorCuadrillas }}</small>
            <small v-else-if="cuadrillas && !cuadrillas.length" class="nota">
              No hay encargados de cuadrilla activos en la municipalidad de este reporte.
            </small>
            <small v-else-if="reporte.nombre_estado === 'asignado' && cuadrillas && !cuadrillasParaReasignar.length" class="nota">
              No hay otros encargados de cuadrilla disponibles para reasignar.
            </small>

            <button class="btn block accion" :disabled="!cuadrillaElegida || guardando" @click="asignar">
              <i :class="reporte.nombre_estado === 'asignado' ? 'bx bx-transfer' : 'bx bx-user-check'"></i>
              {{ guardando ? 'Guardando...' : (reporte.nombre_estado === 'asignado' ? 'Reasignar' : 'Asignar') }}
            </button>

            <button
              v-if="reporte.nombre_estado === 'recibido'"
              class="btn ghost block descartar"
              :disabled="guardando"
              @click="descartando = true"
            >
              <i class="bx bx-block"></i> Descartar reporte
            </button>
          </template>

          <!-- recibido: descarte con motivo obligatorio -->
          <template v-else-if="reporte.nombre_estado === 'recibido' && descartando">
            <p class="aviso-descarte">
              <i class="bx bx-error"></i> El reporte quedará descartado y no podrá atenderse. Indicá el motivo.
            </p>
            <label for="motivo">Motivo del descarte</label>
            <textarea id="motivo" v-model="motivo" maxlength="300"
                      placeholder="Ej.: reporte duplicado, ubicación fuera de la municipalidad..."></textarea>
            <div class="acciones-descarte">
              <button class="btn btn-peligro" :disabled="!motivo.trim() || guardando" @click="descartar">
                <i class="bx bx-block"></i> {{ guardando ? 'Guardando...' : 'Confirmar descarte' }}
              </button>
              <button class="btn ghost" :disabled="guardando" @click="descartando = false; motivo = ''">
                <i class="bx bx-x"></i> Cancelar
              </button>
            </div>
          </template>

          <!-- en_atencion, resuelto o descartado: solo lectura -->
          <div v-else class="aviso-estado" :class="'aviso-' + reporte.nombre_estado">
            <i class="bx" :class="AVISOS_ESTADO[reporte.nombre_estado]?.icono || 'bx-info-circle'"></i>
            <div>
              <strong>Sin acciones disponibles</strong>
              <p>{{ AVISOS_ESTADO[reporte.nombre_estado]?.texto || 'Este reporte no admite cambios en su estado actual.' }}</p>
            </div>
          </div>
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
.actual {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  background: var(--bg); border-radius: var(--radius-input); padding: 10px 12px; margin-bottom: 4px;
}
.actual-label { font-size: 13px; color: var(--text-secondary); }
.accion { margin-top: 16px; }
.descartar { margin-top: 10px; color: #B42318; }
.descartar:hover { border-color: #FECDCA; background: #FEF3F2; }
.aviso-descarte {
  display: flex; align-items: flex-start; gap: 8px; font-size: 13px !important;
  background: #FEF3F2; color: #B42318; border: 1px solid #FECDCA;
  border-radius: var(--radius-input); padding: 10px 12px; margin: 0 0 4px !important;
}
.aviso-descarte i { font-size: 17px; margin-top: 1px; }
.acciones-descarte { display: flex; gap: 10px; margin-top: 14px; }
.acciones-descarte .btn { flex: 1; }
.btn-peligro { background: #B42318; }
.btn-peligro:hover { background: #912018; }
.aviso-estado {
  display: flex; align-items: flex-start; gap: 12px;
  border-radius: var(--radius-input); padding: 14px; border: 1px solid var(--border); background: var(--bg);
}
.aviso-estado i { font-size: 22px; flex-shrink: 0; }
.aviso-estado strong { font-size: 14px; color: var(--slate); }
.aviso-estado p { margin: 2px 0 0 !important; font-size: 13px !important; color: var(--text-secondary); }
.aviso-en_atencion i { color: #93650A; }
.aviso-resuelto i { color: var(--forest); }
.aviso-descartado i { color: #667085; }
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
