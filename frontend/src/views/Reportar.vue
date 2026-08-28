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
  cargando.value = true;
  try {
    // Si hay usuario logueado, se asocia el reporte.
    const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
    const payload = { ...form.value };
    if (usuario) payload.id_usuario_reporta = usuario.id_usuario;

    const { data } = await reporteService.crear(payload);
    codigoGenerado.value = data.codigo_seguimiento;
    form.value.descripcion = '';
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
      <h1 class="title">Reportar un vertedero clandestino</h1>
      <p class="sub">Completá el formulario. No necesitás crear una cuenta.</p>

      <div v-if="error" class="alert error">{{ error }}</div>
      <div v-if="codigoGenerado" class="alert ok">
        ¡Reporte enviado! Tu código de seguimiento es <strong>{{ codigoGenerado }}</strong>.
        Guardalo para consultar el estado.
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

      <label>Ubicación en el mapa (arrastrá el marcador o hacé clic)</label>
      <div id="map" style="height:280px; border-radius:8px; margin-top:6px;"></div>
      <p style="font-size:12px; color:#888; margin-top:6px;">
        Coordenadas: {{ form.latitud.toFixed(5) }}, {{ form.longitud.toFixed(5) }}
      </p>

      <button class="btn block" style="margin-top:20px" :disabled="cargando" @click="enviar">
        {{ cargando ? 'Enviando...' : 'Enviar reporte' }}
      </button>
    </div>
  </div>
</template>
