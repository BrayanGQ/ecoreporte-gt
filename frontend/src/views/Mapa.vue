<script setup>
import { ref, onMounted } from 'vue';
import L from 'leaflet';
import { catalogoService, reporteService } from '../services/api';

const tipos = ref([]);
const filtros = ref({ estado: '', tipo: '' });
const error = ref('');
let map = null;
let capaMarcadores = null;

// Colores por estado (coherentes con la leyenda del mockup).
const colores = {
  recibido: '#E74C3C',
  asignado: '#5B8DEF',
  en_atencion: '#E0A800',
  resuelto: '#97BC62',
  descartado: '#999999',
};

function iconoColor(color) {
  return L.divIcon({
    className: '',
    html: `<i class="bx bxs-map" style="color:${color};font-size:24px;line-height:1;
           -webkit-text-stroke:1px #fff;text-shadow:0 2px 4px rgba(0,0,0,.4)"></i>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  });
}

async function cargarReportes() {
  error.value = '';
  try {
    const params = {};
    if (filtros.value.estado) params.estado = filtros.value.estado;
    if (filtros.value.tipo) params.tipo = filtros.value.tipo;
    const { data } = await reporteService.listar(params);

    capaMarcadores.clearLayers();
    data.forEach((r) => {
      const color = colores[r.nombre_estado] || '#666';
      const m = L.marker([r.latitud, r.longitud], { icon: iconoColor(color) });
      m.bindPopup(
        `<strong>${r.nombre_tipo}</strong><br>${r.descripcion || 'Sin descripción'}<br>` +
        `<span style="color:${color};font-weight:700">${r.nombre_estado}</span><br>` +
        `<small>${r.codigo_seguimiento}</small>`
      );
      capaMarcadores.addLayer(m);
    });
  } catch (e) {
    error.value = 'No se pudieron cargar los reportes. ¿Está encendido el backend?';
  }
}

onMounted(async () => {
  try {
    const t = await catalogoService.tipos();
    tipos.value = t.data;
  } catch (e) { /* noop */ }

  map = L.map('mapaFull').setView([14.6349, -90.5133], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
  }).addTo(map);
  capaMarcadores = L.layerGroup().addTo(map);

  await cargarReportes();
});
</script>

<template>
  <div class="container">
    <h1 class="title"><i class="bx bx-map-alt"></i> Mapa de reportes</h1>
    <p class="sub">Cada marcador representa un reporte ciudadano georreferenciado.</p>

    <div v-if="error" class="alert error"><i class="bx bx-error-circle"></i> {{ error }}</div>

    <div class="filtros">
      <select v-model="filtros.estado" @change="cargarReportes">
        <option value="">Estado: Todos</option>
        <option value="recibido">Recibido</option>
        <option value="asignado">Asignado</option>
        <option value="en_atencion">En atención</option>
        <option value="resuelto">Resuelto</option>
        <option value="descartado">Descartado</option>
      </select>
      <select v-model="filtros.tipo" @change="cargarReportes">
        <option value="">Tipo: Todos</option>
        <option v-for="t in tipos" :key="t.id_tipo_incidencia" :value="t.id_tipo_incidencia">
          {{ t.nombre_tipo }}
        </option>
      </select>
    </div>

    <div id="mapaFull" class="mapa-box"></div>

    <div class="leyenda">
      <span><i class="bx bxs-map" style="color:#E74C3C"></i>Recibido</span>
      <span><i class="bx bxs-map" style="color:#5B8DEF"></i>Asignado</span>
      <span><i class="bx bxs-map" style="color:#E0A800"></i>En atención</span>
      <span><i class="bx bxs-map" style="color:#97BC62"></i>Resuelto</span>
      <span><i class="bx bxs-map" style="color:#999"></i>Descartado</span>
    </div>
  </div>
</template>

<style scoped>
.title { display: flex; align-items: center; gap: 10px; }
.filtros { display: flex; gap: 10px; flex-wrap: wrap; }
.filtros select { width: auto; flex: 1; min-width: 160px; }
.mapa-box { height: 460px; border-radius: var(--radius-card); margin-top: 14px; border: 1px solid var(--border); overflow: hidden; }
.leyenda {
  display: flex; gap: 18px; flex-wrap: wrap; margin-top: 14px; padding: 12px 16px;
  background: #fff; border: 1px solid var(--border); border-radius: var(--radius-card); font-size: 13px;
}
.leyenda span { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); }
.leyenda .bxs-map { font-size: 15px; line-height: 1; }
</style>
