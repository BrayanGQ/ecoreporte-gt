<script setup>
import { ref, onMounted } from 'vue';
import { adminService } from '../services/api';

const tipos = ref([]);
const municipalidades = ref([]);

const cargando = ref(true);
const error = ref('');
const exito = ref('');

// Pestañas: tipos de incidencia / municipalidades.
const pestania = ref('tipos');

// --- Formulario de tipo de incidencia ---
const formTipo = ref({ id_tipo_incidencia: null, nombre_tipo: '', descripcion: '' });
const mostrarFormTipo = ref(false);
const guardandoTipo = ref(false);

// --- Formulario de municipalidad ---
const formMuni = ref({
  id_municipalidad: null,
  nombre: '',
  departamento: '',
  direccion: '',
  estado_activo: true,
});
const mostrarFormMuni = ref(false);
const guardandoMuni = ref(false);

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    const [resTipos, resMunis] = await Promise.all([
      adminService.tipos(),
      adminService.municipalidades(),
    ]);
    tipos.value = resTipos.data;
    municipalidades.value = resMunis.data;
  } catch (err) {
    error.value = err.response?.data?.error || 'No se pudieron cargar los catálogos.';
  } finally {
    cargando.value = false;
  }
}

// =========================================================================
// Tipos de incidencia
// =========================================================================

function nuevoTipo() {
  formTipo.value = { id_tipo_incidencia: null, nombre_tipo: '', descripcion: '' };
  error.value = '';
  exito.value = '';
  mostrarFormTipo.value = true;
}

function editarTipo(tipo) {
  formTipo.value = {
    id_tipo_incidencia: tipo.id_tipo_incidencia,
    nombre_tipo: tipo.nombre_tipo,
    descripcion: tipo.descripcion || '',
  };
  error.value = '';
  exito.value = '';
  mostrarFormTipo.value = true;
}

async function guardarTipo() {
  error.value = '';
  exito.value = '';
  if (!formTipo.value.nombre_tipo.trim()) {
    error.value = 'El nombre del tipo de incidencia es obligatorio.';
    return;
  }

  guardandoTipo.value = true;
  try {
    const datos = {
      nombre_tipo: formTipo.value.nombre_tipo,
      descripcion: formTipo.value.descripcion,
    };
    const { data } = formTipo.value.id_tipo_incidencia
      ? await adminService.editarTipo(formTipo.value.id_tipo_incidencia, datos)
      : await adminService.crearTipo(datos);
    exito.value = data.mensaje;
    mostrarFormTipo.value = false;
    await cargar();
  } catch (err) {
    error.value = err.response?.data?.error || 'No se pudo guardar el tipo de incidencia.';
  } finally {
    guardandoTipo.value = false;
  }
}

// =========================================================================
// Municipalidades
// =========================================================================

function nuevaMunicipalidad() {
  formMuni.value = {
    id_municipalidad: null,
    nombre: '',
    departamento: '',
    direccion: '',
    estado_activo: true,
  };
  error.value = '';
  exito.value = '';
  mostrarFormMuni.value = true;
}

function editarMunicipalidad(muni) {
  formMuni.value = {
    id_municipalidad: muni.id_municipalidad,
    nombre: muni.nombre,
    departamento: muni.departamento || '',
    direccion: muni.direccion || '',
    estado_activo: muni.estado_activo,
  };
  error.value = '';
  exito.value = '';
  mostrarFormMuni.value = true;
}

async function guardarMunicipalidad() {
  error.value = '';
  exito.value = '';
  if (!formMuni.value.nombre.trim()) {
    error.value = 'El nombre de la municipalidad es obligatorio.';
    return;
  }

  guardandoMuni.value = true;
  try {
    const datos = {
      nombre: formMuni.value.nombre,
      departamento: formMuni.value.departamento,
      direccion: formMuni.value.direccion,
      estado_activo: formMuni.value.estado_activo,
    };
    const { data } = formMuni.value.id_municipalidad
      ? await adminService.editarMunicipalidad(formMuni.value.id_municipalidad, datos)
      : await adminService.crearMunicipalidad(datos);
    exito.value = data.mensaje;
    mostrarFormMuni.value = false;
    await cargar();
  } catch (err) {
    error.value = err.response?.data?.error || 'No se pudo guardar la municipalidad.';
  } finally {
    guardandoMuni.value = false;
  }
}

onMounted(cargar);
</script>

<template>
  <div class="container">
    <h1 class="title"><i class="bx bx-cog"></i> Configuración de catálogos</h1>
    <p class="sub">Definí los tipos de incidencia y las municipalidades del sistema.</p>

    <div v-if="error" class="alert error"><i class="bx bx-error-circle"></i> {{ error }}</div>
    <div v-if="exito" class="alert ok"><i class="bx bx-check-circle"></i> {{ exito }}</div>

    <div class="tabs">
      <button :class="['tab', { activa: pestania === 'tipos' }]" @click="pestania = 'tipos'">
        <i class="bx bx-category"></i> Tipos de incidencia
      </button>
      <button :class="['tab', { activa: pestania === 'municipalidades' }]" @click="pestania = 'municipalidades'">
        <i class="bx bx-building-house"></i> Municipalidades
      </button>
    </div>

    <div v-if="cargando" class="alert ok"><i class="bx bx-loader-alt bx-spin"></i> Cargando catálogos...</div>

    <!-- ============ TIPOS DE INCIDENCIA ============ -->
    <template v-if="!cargando && pestania === 'tipos'">
      <div class="card form-card" v-if="mostrarFormTipo">
        <h2 class="section-title">
          <i class="bx bx-edit"></i>
          {{ formTipo.id_tipo_incidencia ? 'Editar tipo de incidencia' : 'Nuevo tipo de incidencia' }}
        </h2>

        <label>Nombre del tipo</label>
        <input v-model="formTipo.nombre_tipo" type="text" placeholder="Ej. Vertedero clandestino" />

        <label>Descripción</label>
        <textarea v-model="formTipo.descripcion" placeholder="Breve descripción del tipo de incidencia"></textarea>

        <div class="form-actions">
          <button class="btn" :disabled="guardandoTipo" @click="guardarTipo">
            <i class="bx bx-save"></i> {{ guardandoTipo ? 'Guardando...' : 'Guardar' }}
          </button>
          <button class="btn ghost" @click="mostrarFormTipo = false"><i class="bx bx-x"></i> Cancelar</button>
        </div>
      </div>

      <div class="toolbar" v-else>
        <button class="btn" @click="nuevoTipo"><i class="bx bx-plus"></i> Agregar tipo de incidencia</button>
      </div>

      <div class="card table-card">
        <div class="table-wrap">
          <table class="dash-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in tipos" :key="t.id_tipo_incidencia">
                <td><strong>{{ t.nombre_tipo }}</strong></td>
                <td>{{ t.descripcion || '—' }}</td>
                <td>
                  <button class="btn ghost btn-sm" @click="editarTipo(t)">
                    <i class="bx bx-edit"></i> Editar
                  </button>
                </td>
              </tr>
              <tr v-if="tipos.length === 0">
                <td colspan="3" class="empty">No hay tipos de incidencia registrados.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- ============ MUNICIPALIDADES ============ -->
    <template v-if="!cargando && pestania === 'municipalidades'">
      <div class="card form-card" v-if="mostrarFormMuni">
        <h2 class="section-title">
          <i class="bx bx-edit"></i>
          {{ formMuni.id_municipalidad ? 'Editar municipalidad' : 'Nueva municipalidad' }}
        </h2>

        <div class="grid-2">
          <div>
            <label>Nombre</label>
            <input v-model="formMuni.nombre" type="text" placeholder="Ej. Municipalidad de Mixco" />
          </div>
          <div>
            <label>Departamento</label>
            <input v-model="formMuni.departamento" type="text" placeholder="Guatemala" />
          </div>
        </div>

        <label>Dirección</label>
        <input v-model="formMuni.direccion" type="text" placeholder="Dirección de las oficinas municipales" />

        <label class="check-label">
          <input type="checkbox" v-model="formMuni.estado_activo" />
          Municipalidad activa (disponible en los formularios de reporte)
        </label>

        <div class="form-actions">
          <button class="btn" :disabled="guardandoMuni" @click="guardarMunicipalidad">
            <i class="bx bx-save"></i> {{ guardandoMuni ? 'Guardando...' : 'Guardar' }}
          </button>
          <button class="btn ghost" @click="mostrarFormMuni = false"><i class="bx bx-x"></i> Cancelar</button>
        </div>
      </div>

      <div class="toolbar" v-else>
        <button class="btn" @click="nuevaMunicipalidad"><i class="bx bx-plus"></i> Agregar municipalidad</button>
      </div>

      <div class="card table-card">
        <div class="table-wrap">
          <table class="dash-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Departamento</th>
                <th>Dirección</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in municipalidades" :key="m.id_municipalidad">
                <td><strong>{{ m.nombre }}</strong></td>
                <td>{{ m.departamento }}</td>
                <td>{{ m.direccion || '—' }}</td>
                <td>
                  <span class="badge" :class="m.estado_activo ? 'b-resuelto' : 'b-descartado'">
                    {{ m.estado_activo ? 'Activa' : 'Inactiva' }}
                  </span>
                </td>
                <td>
                  <button class="btn ghost btn-sm" @click="editarMunicipalidad(m)">
                    <i class="bx bx-edit"></i> Editar
                  </button>
                </td>
              </tr>
              <tr v-if="municipalidades.length === 0">
                <td colspan="5" class="empty">No hay municipalidades registradas.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border);
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  padding: 10px 14px;
  margin-bottom: -1px;
  transition: color .15s, border-color .15s;
}
.tab i { font-size: 17px; }
.tab:hover { color: var(--forest); }
.tab.activa { color: var(--forest); border-bottom-color: var(--forest); }

.toolbar { margin-bottom: 18px; }
.form-card { margin-bottom: 18px; }
.section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--forest-dark);
  display: flex;
  align-items: center;
  gap: 8px;
}
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
.form-actions { display: flex; gap: 10px; margin-top: 22px; }

.check-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  margin-top: 18px;
}
.check-label input { width: auto; }

.table-card { padding: 0; }
.btn-sm { padding: 7px 13px; font-size: 12.5px; }
.empty { text-align: center; padding: 28px; color: var(--text-secondary); }

@media (max-width: 768px) {
  .grid-2 { grid-template-columns: 1fr; }
}
</style>
