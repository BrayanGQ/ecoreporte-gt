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
    html: `<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:${color};
           border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.4);transform:rotate(-45deg)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
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
    <h1 class="title">Mapa de reportes</h1>
    <p class="sub">Cada marcador representa un reporte ciudadano georreferenciado.</p>

    <div v-if="error" class="alert error">{{ error }}</div>

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

    <div id="mapaFull" style="height:460px; border-radius:10px; margin-top:12px;"></div>

    <div class="leyenda">
      <span><i style="background:#E74C3C"></i>Recibido</span>
      <span><i style="background:#5B8DEF"></i>Asignado</span>
      <span><i style="background:#E0A800"></i>En atención</span>
      <span><i style="background:#97BC62"></i>Resuelto</span>
      <span><i style="background:#999"></i>Descartado</span>
    </div>
  </div>
</template>

<style scoped>
.filtros { display: flex; gap: 10px; flex-wrap: wrap; }
.filtros select { width: auto; flex: 1; min-width: 160px; border-radius: 16px; }
.leyenda { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px; font-size: 13px; }
.leyenda span { display: flex; align-items: center; gap: 6px; }
.leyenda i { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
</style>
