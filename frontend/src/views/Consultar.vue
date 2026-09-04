<script setup>
import { ref } from 'vue';
import { reporteService } from '../services/api';

const codigo = ref('');
const reporte = ref(null);
const error = ref('');
const cargando = ref(false);

async function consultar() {
  error.value = '';
  reporte.value = null;
  if (!codigo.value.trim()) {
    error.value = 'Ingresá un código de seguimiento.';
    return;
  }
  cargando.value = true;
  try {
    const { data } = await reporteService.consultar(codigo.value.trim());
    reporte.value = data;
  } catch (err) {
    error.value = err.response?.data?.error || 'No se encontró el reporte.';
  } finally {
    cargando.value = false;
  }
}

function fecha(f) {
  return new Date(f).toLocaleString('es-GT');
}
</script>

<template>
  <div class="container-narrow">
    <div class="card">
      <h1 class="title"><i class="bx bx-search"></i> Consultar un reporte</h1>
      <p class="sub">Ingresá el código de seguimiento que recibiste al reportar.</p>

      <div v-if="error" class="alert error"><i class="bx bx-error-circle"></i> {{ error }}</div>

      <label>Código de seguimiento</label>
      <input v-model="codigo" type="text" placeholder="ER-2026-0001" @keyup.enter="consultar" />

      <button class="btn block" style="margin-top:16px" :disabled="cargando" @click="consultar">
        <i class="bx bx-search"></i> {{ cargando ? 'Consultando...' : 'Consultar' }}
      </button>

      <!-- Resultado -->
      <div v-if="reporte" class="resultado">
        <p><strong>Tipo:</strong> {{ reporte.nombre_tipo }}</p>
        <p class="fila"><strong>Estado actual:</strong>
          <span class="badge" :class="'b-' + reporte.nombre_estado">{{ reporte.nombre_estado }}</span>
        </p>
        <p><strong>Municipalidad:</strong> {{ reporte.municipalidad }}</p>
        <p v-if="reporte.descripcion" class="descripcion"><strong>Descripción:</strong> {{ reporte.descripcion }}</p>

        <h3 class="subtitulo"><i class="bx bx-history"></i> Historial de seguimiento</h3>
        <ul class="timeline">
          <li v-for="(h, i) in reporte.historial" :key="i">
            <strong>{{ h.nombre_estado }}</strong>
            <span v-if="h.comentario"> — {{ h.comentario }}</span>
            <br /><small>{{ fecha(h.fecha_cambio) }}</small>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title { display: flex; align-items: center; gap: 10px; }
.resultado { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border); font-size: 14px; }
.resultado p { margin: 8px 0; }
.fila { display: flex; align-items: center; gap: 8px; }
.descripcion { margin-top: 8px; }
.subtitulo { display: flex; align-items: center; gap: 6px; margin: 20px 0 10px; color: var(--forest-dark); font-size: 15px; font-weight: 700; }
.timeline { list-style: none; }
.timeline li { padding: 8px 0 8px 18px; position: relative; font-size: 13px; border-left: 2px solid var(--moss); margin-left: 4px; }
.timeline li:before {
  content: ''; position: absolute; left: -6px; top: 12px;
  width: 10px; height: 10px; border-radius: 50%; background: var(--moss);
}
</style>
