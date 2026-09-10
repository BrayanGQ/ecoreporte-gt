<script setup>
import { ref, onMounted } from 'vue';
import L from 'leaflet';
import { catalogoService, reporteService } from '../services/api';

const tipos = ref([]);
const municipalidades = ref([]);
const form = ref({
  id_tipo_incidencia: '',
  id_municipalidad: '',
  descripcion: '',
  latitud: 14.6349,
  longitud: -90.5133,
});
const codigoGenerado = ref('');
const error = ref('');
const cargando = ref(false);
let marcador = null;

// Evidencia fotográfica: hasta 5 imágenes convertidas a base64.
const MAX_IMAGENES = 5;
const MAX_MB = 5;
const imagenes = ref([]); // [{ nombre, dataUrl }]
const inputArchivo = ref(null);

function abrirSelector() {
  inputArchivo.value?.click();
}

function leerComoBase64(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    lector.readAsDataURL(archivo);
  });
}

async function onArchivosSeleccionados(evento) {
  error.value = '';
  const archivos = Array.from(evento.target.files || []);
  evento.target.value = ''; // permite volver a elegir el mismo archivo

  for (const archivo of archivos) {
    if (imagenes.value.length >= MAX_IMAGENES) {
      error.value = `Solo se pueden adjuntar hasta ${MAX_IMAGENES} fotografías.`;
      break;
    }
    if (!archivo.type.startsWith('image/')) {
      error.value = 'Solo se permiten archivos de imagen.';
      continue;
    }
    if (archivo.size > MAX_MB * 1024 * 1024) {
      error.value = `Cada imagen debe pesar menos de ${MAX_MB} MB.`;
      continue;
    }
    try {
      const dataUrl = await leerComoBase64(archivo);
      imagenes.value.push({ nombre: archivo.name, dataUrl });
    } catch (e) {
      error.value = 'No se pudo procesar una de las imágenes.';
    }
  }
}

function quitarImagen(indice) {
  imagenes.value.splice(indice, 1);
}

onMounted(async () => {
  // Carga catálogos.
  try {
    const [t, m] = await Promise.all([catalogoService.tipos(), catalogoService.municipalidades()]);
    tipos.value = t.data;
    municipalidades.value = m.data;
    if (m.data.length) form.value.id_municipalidad = m.data[0].id_municipalidad;
  } catch (e) {
    error.value = 'No se pudieron cargar los catálogos. ¿Está encendido el backend?';
  }

  // Inicializa el mapa Leaflet centrado en Ciudad de Guatemala.
  const map = L.map('map').setView([form.value.latitud, form.value.longitud], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
  }).addTo(map);

  marcador = L.marker([form.value.latitud, form.value.longitud], { draggable: true }).addTo(map);

  // Actualiza las coordenadas al arrastrar el marcador o hacer clic en el mapa.
  marcador.on('dragend', () => {
    const { lat, lng } = marcador.getLatLng();
    form.value.latitud = lat;
    form.value.longitud = lng;
  });
  map.on('click', (e) => {
    marcador.setLatLng(e.latlng);
    form.value.latitud = e.latlng.lat;
    form.value.longitud = e.latlng.lng;
  });

  // Intenta usar la geolocalización real del navegador.
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      form.value.latitud = latitude;
      form.value.longitud = longitude;
      map.setView([latitude, longitude], 15);
      marcador.setLatLng([latitude, longitude]);
    });
  }
});

async function enviar() {
  error.value = '';
  codigoGenerado.value = '';
  if (!form.value.id_tipo_incidencia) {
    error.value = 'Seleccioná el tipo de incidencia.';
    return;
  }
  if (imagenes.value.length > MAX_IMAGENES) {
    error.value = `Solo se pueden adjuntar hasta ${MAX_IMAGENES} fotografías.`;
    return;
  }
  cargando.value = true;
  try {
    // Si hay usuario logueado, se asocia el reporte.
    const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
    const payload = { ...form.value };
    if (usuario) payload.id_usuario_reporta = usuario.id_usuario;
    payload.evidencias = imagenes.value.map((img) => img.dataUrl);

    const { data } = await reporteService.crear(payload);
    codigoGenerado.value = data.codigo_seguimiento;
    form.value.descripcion = '';
    imagenes.value = [];
  } catch (err) {
    error.value = err.response?.data?.error || 'Error al registrar el reporte.';
  } finally {
    cargando.value = false;
  }
}
</script>

<template>
  <div class="container">
    <div class="card">
      <h1 class="title"><i class="bx bx-trash"></i> Reportar un vertedero clandestino</h1>
      <p class="sub">Completá el formulario. No necesitás crear una cuenta.</p>

      <div v-if="error" class="alert error"><i class="bx bx-error-circle"></i> {{ error }}</div>
      <div v-if="codigoGenerado" class="alert ok">
        <i class="bx bx-check-circle"></i>
        <span>¡Reporte enviado! Tu código de seguimiento es <strong>{{ codigoGenerado }}</strong>.
        Guardalo para consultar el estado.</span>
      </div>

      <label>Tipo de incidencia</label>
      <select v-model="form.id_tipo_incidencia">
        <option value="">Selecciona una opción</option>
        <option v-for="t in tipos" :key="t.id_tipo_incidencia" :value="t.id_tipo_incidencia">
          {{ t.nombre_tipo }}
        </option>
      </select>

      <label>Municipalidad</label>
      <select v-model="form.id_municipalidad">
        <option v-for="m in municipalidades" :key="m.id_municipalidad" :value="m.id_municipalidad">
          {{ m.nombre }}
        </option>
      </select>

      <label>Descripción</label>
      <textarea v-model="form.descripcion" placeholder="Describí lo que observaste..."></textarea>

      <label><i class="bx bx-camera"></i> Evidencia fotográfica (opcional, hasta 5)</label>
      <input
        ref="inputArchivo"
        type="file"
        accept="image/*"
        multiple
        class="input-oculto"
        @change="onArchivosSeleccionados"
      />
      <button
        type="button"
        class="dropzone"
        :class="{ disabled: imagenes.length >= 5 }"
        :disabled="imagenes.length >= 5"
        @click="abrirSelector"
      >
        <i class="bx bx-camera"></i>
        <span>{{ imagenes.length >= 5 ? 'Límite de 5 imágenes alcanzado' : 'Agregar fotografías' }}</span>
        <small v-if="imagenes.length < 5">JPG o PNG · máx. 5 MB c/u</small>
      </button>

      <div v-if="imagenes.length" class="miniaturas">
        <div v-for="(img, i) in imagenes" :key="i" class="miniatura">
          <img :src="img.dataUrl" :alt="img.nombre" />
          <button type="button" class="quitar" title="Quitar" @click="quitarImagen(i)">
            <i class="bx bx-x"></i>
          </button>
        </div>
      </div>

      <label><i class="bx bx-current-location"></i> Ubicación en el mapa (arrastrá el marcador o hacé clic)</label>
      <div id="map" class="map-box"></div>
      <p class="coords">Coordenadas: {{ form.latitud.toFixed(5) }}, {{ form.longitud.toFixed(5) }}</p>

      <button class="btn block" style="margin-top:24px" :disabled="cargando" @click="enviar">
        <i class="bx bx-send"></i> {{ cargando ? 'Enviando...' : 'Enviar reporte' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.title { display: flex; align-items: center; gap: 10px; }
.map-box { height: 280px; border-radius: var(--radius-card); margin-top: 8px; border: 1px solid var(--border); overflow: hidden; }
.coords { font-size: 12.5px; color: var(--text-secondary); margin-top: 8px; }

.input-oculto { display: none; }
.dropzone {
  width: 100%;
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 22px 16px;
  background: var(--cream);
  border: 1.5px dashed var(--moss);
  border-radius: var(--radius-card);
  color: var(--forest);
  font-size: 14px;
  font-weight: 600;
  transition: background .15s, border-color .15s;
}
.dropzone:hover:not(.disabled) { background: #EDF2E3; border-color: var(--forest); }
.dropzone i { font-size: 24px; }
.dropzone small { font-weight: 400; font-size: 12px; color: var(--text-secondary); }
.dropzone.disabled { opacity: .6; cursor: not-allowed; border-color: var(--border); background: var(--bg); color: var(--text-secondary); }

.miniaturas {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}
.miniatura {
  position: relative;
  width: 96px;
  height: 96px;
  border-radius: var(--radius-input);
  overflow: hidden;
  border: 1px solid var(--border);
}
.miniatura img { width: 100%; height: 100%; object-fit: cover; display: block; }
.quitar {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(16, 24, 40, .65);
  color: #fff;
  border: none;
  border-radius: 50%;
  font-size: 15px;
  line-height: 1;
}
.quitar:hover { background: var(--red); }
</style>
