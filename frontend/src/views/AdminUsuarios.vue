<script setup>
import { ref, computed, onMounted } from 'vue';
import { adminService } from '../services/api';

const usuarios = ref([]);
const municipalidades = ref([]);
const roles = ref([]);

const cargando = ref(true);
const guardando = ref(false);
const error = ref('');
const exito = ref('');

// Formulario de creación de cuenta.
const mostrarFormulario = ref(false);
const form = ref({
  nombre_completo: '',
  correo: '',
  password: '',
  id_municipalidad: '',
  id_rol: '',
});

// Usuario autenticado: se usa para no ofrecer desactivar la propia cuenta.
const usuarioActual = JSON.parse(localStorage.getItem('usuario') || 'null');

const totalActivos = computed(() => usuarios.value.filter((u) => u.estado).length);
const totalInactivos = computed(() => usuarios.value.filter((u) => !u.estado).length);

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    const [resUsuarios, resMunis, resRoles] = await Promise.all([
      adminService.usuarios(),
      adminService.municipalidades(),
      adminService.roles(),
    ]);
    usuarios.value = resUsuarios.data;
    municipalidades.value = resMunis.data;
    roles.value = resRoles.data;
  } catch (err) {
    error.value = err.response?.data?.error || 'No se pudieron cargar los usuarios.';
  } finally {
    cargando.value = false;
  }
}

function abrirFormulario() {
  form.value = {
    nombre_completo: '',
    correo: '',
    password: '',
    id_municipalidad: '',
    id_rol: '',
  };
  error.value = '';
  exito.value = '';
  mostrarFormulario.value = true;
}

function cerrarFormulario() {
  mostrarFormulario.value = false;
}

async function crearUsuario() {
  error.value = '';
  exito.value = '';

  if (!form.value.nombre_completo || !form.value.correo || !form.value.password) {
    error.value = 'Nombre, correo y contraseña son obligatorios.';
    return;
  }
  if (!form.value.id_municipalidad || !form.value.id_rol) {
    error.value = 'Seleccioná la municipalidad y el rol.';
    return;
  }
  if (form.value.password.length < 6) {
    error.value = 'La contraseña debe tener al menos 6 caracteres.';
    return;
  }

  guardando.value = true;
  try {
    const { data } = await adminService.crearUsuario({
      nombre_completo: form.value.nombre_completo,
      correo: form.value.correo,
      password: form.value.password,
      id_municipalidad: Number(form.value.id_municipalidad),
      id_rol: Number(form.value.id_rol),
    });
    exito.value = data.mensaje;
    mostrarFormulario.value = false;
    await cargar();
  } catch (err) {
    error.value = err.response?.data?.error || 'No se pudo crear la cuenta.';
  } finally {
    guardando.value = false;
  }
}

async function alternarEstado(usuario) {
  error.value = '';
  exito.value = '';
  try {
    const { data } = await adminService.cambiarEstadoUsuario(usuario.id_usuario, !usuario.estado);
    usuario.estado = data.usuario.estado;
    exito.value = data.mensaje;
  } catch (err) {
    error.value = err.response?.data?.error || 'No se pudo actualizar el estado de la cuenta.';
  }
}

// Muestra el nombre del rol en un formato legible.
function etiquetaRol(nombreRol) {
  return nombreRol === 'administrador' ? 'Administrador' : 'Personal municipal';
}

onMounted(cargar);
</script>

<template>
  <div class="container">
    <h1 class="title"><i class="bx bx-user"></i> Gestión de usuarios</h1>
    <p class="sub">Administrá las cuentas del personal municipal de la plataforma.</p>

    <div v-if="error" class="alert error"><i class="bx bx-error-circle"></i> {{ error }}</div>
    <div v-if="exito" class="alert ok"><i class="bx bx-check-circle"></i> {{ exito }}</div>

    <div class="stats">
      <div class="stat-card">
        <span class="stat-icon i-total"><i class="bx bx-group"></i></span>
        <div>
          <div class="stat-number">{{ usuarios.length }}</div>
          <div class="stat-label">Cuentas registradas</div>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon i-activo"><i class="bx bx-user-check"></i></span>
        <div>
          <div class="stat-number">{{ totalActivos }}</div>
          <div class="stat-label">Activas</div>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon i-inactivo"><i class="bx bx-user-x"></i></span>
        <div>
          <div class="stat-number">{{ totalInactivos }}</div>
          <div class="stat-label">Inactivas</div>
        </div>
      </div>
    </div>

    <!-- Formulario de nueva cuenta -->
    <div class="card form-card" v-if="mostrarFormulario">
      <h2 class="section-title"><i class="bx bx-user-plus"></i> Nueva cuenta de personal</h2>

      <div class="grid-2">
        <div>
          <label>Nombre completo</label>
          <input v-model="form.nombre_completo" type="text" placeholder="Nombre y apellido" />
        </div>
        <div>
          <label>Correo electrónico</label>
          <input v-model="form.correo" type="email" placeholder="correo@municipalidad.gt" />
        </div>
        <div>
          <label>Contraseña</label>
          <input v-model="form.password" type="password" placeholder="Mínimo 6 caracteres" />
        </div>
        <div>
          <label>Municipalidad</label>
          <select v-model="form.id_municipalidad">
            <option value="">Seleccioná una municipalidad</option>
            <option v-for="m in municipalidades" :key="m.id_municipalidad" :value="m.id_municipalidad">
              {{ m.nombre }}
            </option>
          </select>
        </div>
        <div>
          <label>Rol</label>
          <select v-model="form.id_rol">
            <option value="">Seleccioná un rol</option>
            <option v-for="r in roles" :key="r.id_rol" :value="r.id_rol">
              {{ etiquetaRol(r.nombre_rol) }}
            </option>
          </select>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn" :disabled="guardando" @click="crearUsuario">
          <i class="bx bx-save"></i> {{ guardando ? 'Guardando...' : 'Crear cuenta' }}
        </button>
        <button class="btn ghost" @click="cerrarFormulario"><i class="bx bx-x"></i> Cancelar</button>
      </div>
    </div>

    <div class="toolbar" v-else>
      <button class="btn" @click="abrirFormulario"><i class="bx bx-user-plus"></i> Nuevo usuario</button>
    </div>

    <div v-if="cargando" class="alert ok"><i class="bx bx-loader-alt bx-spin"></i> Cargando usuarios...</div>

    <div class="card table-card" v-if="!cargando">
      <div class="table-wrap">
        <table class="dash-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Municipalidad</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in usuarios" :key="u.id_usuario">
              <td><strong>{{ u.nombre_completo }}</strong></td>
              <td>{{ u.correo }}</td>
              <td>{{ u.nombre_municipalidad || '—' }}</td>
              <td><span class="badge b-asignado">{{ etiquetaRol(u.nombre_rol) }}</span></td>
              <td>
                <span class="badge" :class="u.estado ? 'b-resuelto' : 'b-descartado'">
                  {{ u.estado ? 'Activo' : 'Inactivo' }}
                </span>
              </td>
              <td>
                <button
                  class="btn ghost btn-sm"
                  :disabled="usuarioActual && u.id_usuario === usuarioActual.id_usuario && u.estado"
                  @click="alternarEstado(u)"
                >
                  <i :class="u.estado ? 'bx bx-user-x' : 'bx bx-user-check'"></i>
                  {{ u.estado ? 'Desactivar' : 'Activar' }}
                </button>
              </td>
            </tr>
            <tr v-if="usuarios.length === 0">
              <td colspan="6" class="empty">No hay cuentas de personal municipal registradas.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
.stat-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-sm);
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 14px;
}
.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}
.i-total { background: #EAF0FE; color: #3552CC; }
.i-activo { background: #E9F3E1; color: #2C5F2D; }
.i-inactivo { background: #F2F4F7; color: #667085; }
.stat-number { font-size: 24px; font-weight: 700; color: var(--slate); line-height: 1.2; }
.stat-label { font-size: 13px; color: var(--text-secondary); }

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

.table-card { padding: 0; }
.btn-sm { padding: 7px 13px; font-size: 12.5px; }
.empty { text-align: center; padding: 28px; color: var(--text-secondary); }

@media (max-width: 768px) {
  .stats { grid-template-columns: 1fr; }
  .grid-2 { grid-template-columns: 1fr; }
}
</style>
