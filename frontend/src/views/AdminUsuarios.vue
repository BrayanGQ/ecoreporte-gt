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
  mostrarRestablecer.value = false;
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

// --- Restablecer contraseña (cualquier cuenta, buscada por correo) ---
// Es la vía de recuperación en producción: la pantalla "Recuperar contraseña" no entrega el token
// y le indica al usuario que se lo pida al administrador.
const mostrarRestablecer = ref(false);
const restableciendo = ref(false);
const formRestablecer = ref({ correo: '', password: '' });

// Contraseña temporal aleatoria, sin caracteres que se confunden al dictarla (0/O, 1/l/I).
function generarPassword() {
  const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const valores = crypto.getRandomValues(new Uint32Array(10));
  formRestablecer.value.password = Array.from(valores, (v) => caracteres[v % caracteres.length]).join('');
}

function abrirRestablecer(correo = '') {
  formRestablecer.value = { correo, password: '' };
  generarPassword();
  error.value = '';
  exito.value = '';
  mostrarFormulario.value = false;
  mostrarRestablecer.value = true;
}

async function restablecerPassword() {
  error.value = '';
  exito.value = '';
  const { correo, password } = formRestablecer.value;
  if (!correo.trim() || !password) {
    error.value = 'Indicá el correo de la cuenta y la contraseña nueva.';
    return;
  }
  if (password.length < 6) {
    error.value = 'La contraseña debe tener al menos 6 caracteres.';
    return;
  }
  restableciendo.value = true;
  try {
    const { data } = await adminService.restablecerPassword(correo.trim(), password);
    exito.value = `${data.mensaje} Comunicale la contraseña nueva por un medio seguro y pedile que la cambie desde "Mi cuenta".`;
    mostrarRestablecer.value = false;
  } catch (err) {
    error.value = err.response?.data?.error || 'No se pudo restablecer la contraseña.';
  } finally {
    restableciendo.value = false;
  }
}

// Muestra el nombre del rol en un formato legible.
const ETIQUETAS_ROL = {
  administrador: 'Administrador',
  personal_municipal: 'Personal municipal (coordinador)',
  encargado_cuadrilla: 'Encargado de cuadrilla',
};
function etiquetaRol(nombreRol) {
  return ETIQUETAS_ROL[nombreRol] || nombreRol;
}

// Color del badge de rol en la tabla.
function claseRol(nombreRol) {
  return nombreRol === 'encargado_cuadrilla' ? 'b-en_atencion' : 'b-asignado';
}

onMounted(cargar);
</script>

<template>
  <div class="container">
    <h1 class="title"><i class="bx bx-user"></i> Gestión de usuarios</h1>
    <p class="sub">Administrá las cuentas del personal municipal y de los encargados de cuadrilla. Toda cuenta pertenece a una municipalidad.</p>

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

    <!-- Restablecer contraseña de cualquier cuenta (personal o ciudadano) -->
    <div class="card form-card" v-else-if="mostrarRestablecer">
      <h2 class="section-title"><i class="bx bx-key"></i> Restablecer contraseña</h2>
      <p class="ayuda">
        Sirve para cualquier cuenta, también las de ciudadanos. Asigná una contraseña temporal y
        comunicásela a la persona por un medio seguro.
      </p>
      <div class="grid-2">
        <div>
          <label for="rest-correo">Correo de la cuenta</label>
          <input id="rest-correo" v-model="formRestablecer.correo" type="email" placeholder="correo@ejemplo.com" />
        </div>
        <div>
          <label for="rest-password">Contraseña nueva</label>
          <div class="campo-password">
            <input id="rest-password" v-model="formRestablecer.password" type="text" autocomplete="off" />
            <button type="button" class="btn ghost" title="Generar una contraseña aleatoria" @click="generarPassword">
              <i class="bx bx-refresh"></i> Generar
            </button>
          </div>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn" :disabled="restableciendo" @click="restablecerPassword">
          <i class="bx bx-key"></i> {{ restableciendo ? 'Guardando...' : 'Restablecer contraseña' }}
        </button>
        <button class="btn ghost" @click="mostrarRestablecer = false"><i class="bx bx-x"></i> Cancelar</button>
      </div>
    </div>

    <div class="toolbar" v-else>
      <button class="btn" @click="abrirFormulario"><i class="bx bx-user-plus"></i> Nuevo usuario</button>
      <button class="btn ghost" @click="abrirRestablecer()"><i class="bx bx-key"></i> Restablecer contraseña</button>
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
              <td><span class="badge" :class="claseRol(u.nombre_rol)">{{ etiquetaRol(u.nombre_rol) }}</span></td>
              <td>
                <span class="badge" :class="u.estado ? 'b-resuelto' : 'b-descartado'">
                  {{ u.estado ? 'Activo' : 'Inactivo' }}
                </span>
              </td>
              <td>
                <div class="acciones">
                  <button
                    class="btn ghost btn-sm"
                    :disabled="usuarioActual && u.id_usuario === usuarioActual.id_usuario && u.estado"
                    @click="alternarEstado(u)"
                  >
                    <i :class="u.estado ? 'bx bx-user-x' : 'bx bx-user-check'"></i>
                    {{ u.estado ? 'Desactivar' : 'Activar' }}
                  </button>
                  <button
                    class="btn ghost btn-sm"
                    :title="`Restablecer la contraseña de ${u.nombre_completo}`"
                    :aria-label="`Restablecer la contraseña de ${u.nombre_completo}`"
                    @click="abrirRestablecer(u.correo)"
                  >
                    <i class="bx bx-key"></i>
                  </button>
                </div>
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

.toolbar { margin-bottom: 18px; display: flex; flex-wrap: wrap; gap: 10px; }
.ayuda { font-size: 13px; color: var(--text-secondary); margin: -6px 0 4px; }
.campo-password { display: flex; gap: 8px; }
.campo-password input { flex: 1; font-family: ui-monospace, Consolas, monospace; letter-spacing: .03em; }
.campo-password .btn { white-space: nowrap; }
/* Rol largo ("Personal municipal (coordinador)"): puede partirse para que la tabla no desborde. */
.dash-table .badge { white-space: normal; }
/* Si no hay espacio, el botón de la llave pasa debajo en vez de desbordar la tabla. */
.acciones { display: flex; flex-wrap: wrap; gap: 6px; }
.acciones .btn { white-space: nowrap; }
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
