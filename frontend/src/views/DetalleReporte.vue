<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { reporteService } from '../services/api';
import { prepararFoto } from '../utils/imagenes';
import { urlComoLlegar } from '../utils/mapas';
import GaleriaEvidencia from '../components/GaleriaEvidencia.vue';

const route = useRoute();
const router = useRouter();
const reporte = ref(null);
const error = ref('');
const ok = ref('');
const guardando = ref(false);

// Quién gestiona: el coordinador (personal_municipal) asigna, reasigna o descarta;
// el encargado de cuadrilla inicia y resuelve. El administrador solo lee.
const rol = JSON.parse(localStorage.getItem('usuario') || 'null')?.rol;
const esCoordinador = rol === 'personal_municipal';
const esCuadrilla = rol === 'encargado_cuadrilla';
const tieneAcciones = esCoordinador || esCuadrilla;

// ---------- Coordinador ----------
// Encargados de cuadrilla de la misma municipalidad del reporte.
const cuadrillas = ref(null); // null mientras carga
const errorCuadrillas = ref('');
const cuadrillaElegida = ref('');

// Descarte: el motivo es obligatorio.
const descartando = ref(false);
const motivo = ref('');

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

// ---------- Encargado de cuadrilla ----------
const MAX_FOTOS = 5;
const MAX_CARACTERES_FOTO = 5 * 1024 * 1024; // mismo límite que el backend
const comentarioInicio = ref('');
const comentarioResolucion = ref('');
const fotos = ref([]); // [{ dataUrl }]
const procesandoFotos = ref(false);
const inputCamara = ref(null);
const inputGaleria = ref(null);

// ---------- Evidencia: antes (ciudadano) y después (limpieza) ----------
const evidenciaCiudadana = computed(() =>
  (reporte.value?.evidencias || []).filter((ev) => ev.tipo_evidencia !== 'municipal')
);
const evidenciaLimpieza = computed(() =>
  (reporte.value?.evidencias || []).filter((ev) => ev.tipo_evidencia === 'municipal')
);

async function cargar() {
  try {
    const { data } = await reporteService.detalle(route.params.id);
    reporte.value = data;
    cuadrillaElegida.value = '';
    descartando.value = false;
    motivo.value = '';
    comentarioInicio.value = '';
    comentarioResolucion.value = '';
    fotos.value = [];
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
    window.scrollTo({ top: 0, behavior: 'smooth' }); // en el celular, el aviso queda arriba
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

function iniciar() {
  ejecutar(
    () => reporteService.iniciar(route.params.id, comentarioInicio.value.trim()),
    'Atención iniciada. Cuando termines la limpieza, marcá el reporte como resuelto.'
  );
}

async function agregarFotos(evento) {
  error.value = '';
  const archivos = Array.from(evento.target.files || []);
  evento.target.value = ''; // permite volver a elegir la misma foto
  procesandoFotos.value = true;
  try {
    for (const archivo of archivos) {
      if (fotos.value.length >= MAX_FOTOS) {
        error.value = `Se permiten como máximo ${MAX_FOTOS} fotos.`;
        break;
      }
      if (!archivo.type.startsWith('image/')) {
        error.value = 'Solo se permiten archivos de imagen.';
        continue;
      }
      const dataUrl = await prepararFoto(archivo);
      if (dataUrl.length > MAX_CARACTERES_FOTO) {
        error.value = 'Una de las fotos es demasiado grande. Probá con otra.';
        continue;
      }
      fotos.value.push({ dataUrl });
    }
  } catch (e) {
    error.value = 'No se pudo procesar una de las fotos.';
  } finally {
    procesandoFotos.value = false;
  }
}

function quitarFoto(indice) {
  fotos.value.splice(indice, 1);
}

function resolver() {
  if (!fotos.value.length) {
    error.value = 'Agregá al menos una foto de la limpieza para resolver el reporte.';
    return;
  }
  ejecutar(
    () => reporteService.resolver(
      route.params.id,
      comentarioResolucion.value.trim(),
      fotos.value.map((f) => f.dataUrl)
    ),
    'Reporte marcado como resuelto. ¡Gracias por tu trabajo!'
  );
}

function fecha(f) {
  return new Date(f).toLocaleString('es-GT');
}

onMounted(() => {
  cargar();
  if (esCoordinador) cargarCuadrillas();
});
</script>

<template>
  <div class="container">
    <a class="volver" @click="router.push('/municipal/panel')">
      <i class="bx bx-arrow-back"></i> {{ esCuadrilla ? 'Volver a mis reportes' : 'Volver a reportes' }}
    </a>

    <div v-if="error" class="alert error"><i class="bx bx-error-circle"></i> {{ error }}</div>
    <div v-if="ok" class="alert ok"><i class="bx bx-check-circle"></i> {{ ok }}</div>

    <div v-if="reporte">
      <h1 class="title"><i class="bx bx-file"></i> Reporte {{ reporte.codigo_seguimiento }}</h1>

      <div v-if="rol === 'administrador'" class="solo-lectura">
        <i class="bx bx-lock-alt"></i> Modo solo lectura: la atención de reportes la gestiona el personal municipal.
      </div>

      <div class="grid" :class="{ unica: !tieneAcciones, 'grid-cuadrilla': esCuadrilla }">
        <!-- Datos -->
        <div class="card">
          <h3><i class="bx bx-info-circle"></i> Datos del reporte</h3>
          <p><strong>Tipo:</strong> {{ reporte.nombre_tipo }}</p>
          <p><strong>Descripción:</strong> {{ reporte.descripcion || '—' }}</p>
          <p><strong>Ubicación:</strong> {{ Number(reporte.latitud).toFixed(5) }}, {{ Number(reporte.longitud).toFixed(5) }}</p>
          <a class="btn ghost como-llegar" :href="urlComoLlegar(reporte.latitud, reporte.longitud)" target="_blank" rel="noopener">
            <i class="bx bx-map"></i> Cómo llegar
          </a>
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

        <!-- Gestión del reporte (coordinador): solo las acciones válidas según el estado -->
        <div v-if="esCoordinador" class="card">
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

        <!-- Atención del reporte (encargado de cuadrilla) -->
        <div v-if="esCuadrilla" class="card card-acciones">
          <h3><i class="bx bx-wrench"></i> Atención del reporte</h3>

          <!-- asignado: iniciar la atención -->
          <template v-if="reporte.nombre_estado === 'asignado'">
            <p class="ayuda">Cuando la cuadrilla llegue al lugar y empiece la limpieza, iniciá la atención.</p>
            <label for="comentario-inicio">Comentario (opcional)</label>
            <textarea id="comentario-inicio" v-model="comentarioInicio" maxlength="300"
                      placeholder="Ej.: cuadrilla en el lugar, se requiere camión..."></textarea>
            <button class="btn block btn-grande accion" :disabled="guardando" @click="iniciar">
              <i class="bx bx-play-circle"></i> {{ guardando ? 'Guardando...' : 'Iniciar atención' }}
            </button>
          </template>

          <!-- en_atencion: resolver con fotos obligatorias -->
          <template v-else-if="reporte.nombre_estado === 'en_atencion'">
            <p class="ayuda">Tomá al menos una foto del lugar ya limpio para marcar el reporte como resuelto.</p>

            <label><i class="bx bx-camera"></i> Fotos de la limpieza <span class="contador">{{ fotos.length }} de {{ MAX_FOTOS }}</span></label>
            <input ref="inputCamara" type="file" accept="image/*" capture="environment" class="input-oculto" @change="agregarFotos" />
            <input ref="inputGaleria" type="file" accept="image/*" multiple class="input-oculto" @change="agregarFotos" />
            <div class="botones-foto">
              <button type="button" class="btn btn-grande" :disabled="fotos.length >= MAX_FOTOS || procesandoFotos || guardando"
                      @click="inputCamara.click()">
                <i class="bx bx-camera"></i> Tomar foto
              </button>
              <button type="button" class="btn ghost btn-grande" :disabled="fotos.length >= MAX_FOTOS || procesandoFotos || guardando"
                      @click="inputGaleria.click()">
                <i class="bx bx-image-add"></i> Elegir de la galería
              </button>
            </div>
            <small v-if="procesandoFotos" class="nota"><i class="bx bx-loader-alt bx-spin"></i> Procesando fotos...</small>
            <small v-else-if="fotos.length >= MAX_FOTOS" class="nota">Llegaste al máximo de {{ MAX_FOTOS }} fotos.</small>

            <div v-if="fotos.length" class="miniaturas">
              <div v-for="(f, i) in fotos" :key="i" class="miniatura">
                <img :src="f.dataUrl" :alt="'Foto de la limpieza ' + (i + 1)" />
                <button type="button" class="quitar" title="Quitar foto" @click="quitarFoto(i)">
                  <i class="bx bx-x"></i>
                </button>
              </div>
            </div>

            <label for="comentario-resolucion">Comentario (opcional)</label>
            <textarea id="comentario-resolucion" v-model="comentarioResolucion" maxlength="300"
                      placeholder="Ej.: se retiraron 3 m³ de desechos..."></textarea>

            <button class="btn block btn-grande accion" :disabled="!fotos.length || procesandoFotos || guardando" @click="resolver">
              <i class="bx bx-check-circle"></i> {{ guardando ? 'Enviando...' : 'Marcar como resuelto' }}
            </button>
            <small v-if="!fotos.length" class="nota centrada">Necesitás al menos una foto para resolver.</small>
          </template>

          <!-- resuelto: solo lectura -->
          <div v-else class="aviso-estado" :class="'aviso-' + reporte.nombre_estado">
            <i class="bx" :class="AVISOS_ESTADO[reporte.nombre_estado]?.icono || 'bx-info-circle'"></i>
            <div>
              <strong>Sin acciones pendientes</strong>
              <p>{{ reporte.nombre_estado === 'resuelto' ? 'Resolviste este reporte. Las fotos quedaron como evidencia de la limpieza.' : 'Este reporte no admite cambios en su estado actual.' }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Evidencia fotográfica: antes (ciudadano) y después (limpieza) -->
      <div class="evidencia-grid">
        <div class="card">
          <h3><i class="bx bx-user"></i> Evidencia del ciudadano <span class="etiqueta">Antes</span></h3>
          <GaleriaEvidencia :imagenes="evidenciaCiudadana" vacio="El ciudadano no adjuntó fotografías." />
        </div>
        <div class="card">
          <h3><i class="bx bx-badge-check"></i> Evidencia de la limpieza <span class="etiqueta despues">Después</span></h3>
          <GaleriaEvidencia
            :imagenes="evidenciaLimpieza"
            :vacio="reporte.nombre_estado === 'resuelto' ? 'No hay fotografías de la limpieza.' : 'Las fotos se agregan cuando la cuadrilla resuelve el reporte.'"
          />
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
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
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
.como-llegar { padding: 7px 14px; font-size: 13px; text-decoration: none; margin: 2px 0 6px; }
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
.nota { display: flex; align-items: center; gap: 4px; margin-top: 6px; font-size: 12px; color: var(--text-secondary); }
.nota.centrada { justify-content: center; }
.error-nota { color: #B42318; }

/* ---------- Encargado de cuadrilla ---------- */
.ayuda { font-size: 13px !important; color: var(--text-secondary); margin-top: 0 !important; }
.contador {
  float: right; font-weight: 600; font-size: 12px; color: var(--forest);
  background: #E9F3E1; border-radius: 20px; padding: 1px 8px;
}
.input-oculto { display: none; }
.botones-foto { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.miniaturas { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 12px; }
.miniatura {
  position: relative; aspect-ratio: 1; border-radius: var(--radius-input);
  overflow: hidden; border: 1px solid var(--border);
}
.miniatura img { width: 100%; height: 100%; object-fit: cover; display: block; }
.quitar {
  position: absolute; top: 4px; right: 4px; width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(16, 24, 40, .7); color: #fff; border: none; border-radius: 50%; font-size: 17px;
}
.quitar:hover { background: #B42318; }

/* ---------- Evidencia antes / después ---------- */
.evidencia-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
.etiqueta {
  margin-left: auto; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
  background: #FDECEA; color: #B42318; border-radius: 20px; padding: 2px 10px;
}
.etiqueta.despues { background: #E9F3E1; color: var(--forest); }

.timeline { list-style: none; }
.timeline li { padding: 8px 0 8px 18px; position: relative; font-size: 13px; border-left: 2px solid var(--moss); margin-left: 4px; }
.timeline li:before {
  content: ''; position: absolute; left: -6px; top: 12px;
  width: 10px; height: 10px; border-radius: 50%; background: var(--moss);
}
.grid.unica { grid-template-columns: 1fr; }
.solo-lectura {
  display: flex; align-items: center; gap: 8px;
  background: var(--cream); border: 1px solid #DCE6CC; color: var(--forest);
  border-radius: var(--radius-input); padding: 10px 14px; font-size: 13px; margin-bottom: 16px;
}
.solo-lectura i { font-size: 17px; }

@media (max-width: 700px) {
  .grid, .evidencia-grid { grid-template-columns: 1fr; }
  /* En el campo, la cuadrilla ve primero lo que tiene que hacer. */
  .grid-cuadrilla .card-acciones { order: -1; }
  .btn-grande { min-height: 48px; font-size: 15px; }
  .como-llegar { min-height: 44px; width: 100%; }
  .miniaturas { grid-template-columns: repeat(3, 1fr); }
  .quitar { width: 30px; height: 30px; }
}
@media (max-width: 380px) {
  .botones-foto { grid-template-columns: 1fr; }
}
</style>
