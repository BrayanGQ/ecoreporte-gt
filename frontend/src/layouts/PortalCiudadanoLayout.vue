<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { notificacionService } from '../services/api';

const router = useRouter();
const usuario = ref(JSON.parse(localStorage.getItem('usuario') || 'null'));
const notificaciones = ref([]);
const panelAbierto = ref(false);

const noLeidas = computed(() => notificaciones.value.filter((n) => !n.leida).length);

async function cargarNotificaciones() {
  if (!usuario.value) {
    notificaciones.value = [];
    return;
  }
  try {
    const { data } = await notificacionService.listar();
    notificaciones.value = data;
  } catch (e) {
    // Silencioso: la campana simplemente queda sin novedades.
  }
}

function alternarPanel() {
  panelAbierto.value = !panelAbierto.value;
}

async function marcarLeida(n) {
  if (n.leida) return;
  n.leida = true; // optimista
  try {
    await notificacionService.marcarLeida(n.id_notificacion);
  } catch (e) {
    n.leida = false;
  }
}

function cerrarSiEsExterno(e) {
  if (!e.target.closest('.notificaciones')) panelAbierto.value = false;
}

window.addEventListener('storage-updated', () => {
  usuario.value = JSON.parse(localStorage.getItem('usuario') || 'null');
  cargarNotificaciones();
});

function cerrarSesion() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  usuario.value = null;
  notificaciones.value = [];
  panelAbierto.value = false;
  router.push('/portal');
}

function fechaHora(f) {
  return new Date(f).toLocaleString('es-GT');
}

onMounted(() => {
  cargarNotificaciones();
  document.addEventListener('click', cerrarSiEsExterno);
});
onUnmounted(() => document.removeEventListener('click', cerrarSiEsExterno));
</script>

<template>
  <nav class="navbar">
    <div class="brand">
      <i class="bx bx-leaf logo"></i>
      <span>EcoReporte GT</span>
    </div>
    <div class="links">
      <router-link to="/portal"><i class="bx bx-trash"></i> Reportar</router-link>
      <router-link to="/portal/mapa"><i class="bx bx-map-alt"></i> Mapa</router-link>
      <router-link to="/portal/consultar"><i class="bx bx-search"></i> Consultar</router-link>

      <template v-if="usuario">
        <router-link to="/portal/mis-reportes"><i class="bx bx-list-ul"></i> Mis reportes</router-link>

        <div class="notificaciones">
          <button type="button" class="bell" @click="alternarPanel">
            <i class="bx bx-bell"></i>
            <span v-if="noLeidas" class="contador">{{ noLeidas > 9 ? '9+' : noLeidas }}</span>
          </button>
          <div v-if="panelAbierto" class="panel">
            <div class="panel-header">Notificaciones</div>
            <ul v-if="notificaciones.length" class="panel-lista">
              <li
                v-for="n in notificaciones"
                :key="n.id_notificacion"
                :class="{ leida: n.leida }"
                @click="marcarLeida(n)"
              >
                <i class="bx" :class="n.leida ? 'bx-check' : 'bxs-circle'"></i>
                <div>
                  <p>{{ n.mensaje }}</p>
                  <small>{{ fechaHora(n.fecha_envio) }}</small>
                </div>
              </li>
            </ul>
            <p v-else class="panel-vacio">No tenés notificaciones.</p>
          </div>
        </div>

        <span class="user"><i class="bx bx-user-circle"></i> {{ usuario.nombre_completo }}</span>
        <button class="enter" @click="cerrarSesion"><i class="bx bx-log-out"></i> Salir</button>
      </template>
      <router-link v-else to="/portal/login" class="login-link">
        <i class="bx bx-user"></i> ¿Sos ciudadano registrado? Iniciá sesión
      </router-link>
      <router-link to="/" class="volver"><i class="bx bx-home-alt"></i> Volver al inicio</router-link>
    </div>
  </nav>
  <router-view />
</template>

<style scoped>
.navbar {
  background: var(--forest);
  min-height: 60px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 24px;
  gap: 12px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  font-weight: 700;
  font-size: 17px;
  margin-right: auto;
}
.brand .logo {
  font-size: 20px;
  color: var(--moss);
}
.links { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.links a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #fff;
  text-decoration: none;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 6px;
  transition: background .15s;
  white-space: nowrap;
}
.links a i { font-size: 15px; }
.links a:hover { background: rgba(255, 255, 255, .15); }
.links a.router-link-exact-active { background: var(--moss); color: var(--forest-dark); font-weight: 600; }
.login-link { font-size: 12px !important; opacity: .9; }
.user {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #fff;
  font-size: 12.5px;
  opacity: .9;
}
.user i { font-size: 16px; }
.enter, .volver {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--amber);
  color: var(--forest-dark) !important;
  border: none;
  font-weight: 600;
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 13px;
  text-decoration: none;
  transition: filter .15s;
}
.enter:hover, .volver:hover { filter: brightness(.95); }

/* Notificaciones */
.notificaciones { position: relative; }
.bell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  background: rgba(255, 255, 255, .12);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 17px;
  transition: background .15s;
}
.bell:hover { background: rgba(255, 255, 255, .22); }
.contador {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: 8px;
  background: var(--red);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 320px;
  max-height: 380px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 20;
}
.panel-header {
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 700;
  color: var(--forest-dark);
  border-bottom: 1px solid var(--border);
}
.panel-lista { list-style: none; overflow-y: auto; }
.panel-lista li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background .1s;
}
.panel-lista li:last-child { border-bottom: none; }
.panel-lista li:hover { background: #FAFBFC; }
.panel-lista li i { font-size: 15px; color: var(--forest); margin-top: 2px; flex-shrink: 0; }
.panel-lista li i.bxs-circle { font-size: 8px; margin-top: 6px; }
.panel-lista li.leida i { color: var(--text-secondary); }
.panel-lista li.leida p { color: var(--text-secondary); }
.panel-lista p { font-size: 13px; color: var(--slate); line-height: 1.4; }
.panel-lista small { font-size: 11.5px; color: var(--text-secondary); }
.panel-vacio { padding: 24px 16px; text-align: center; font-size: 13px; color: var(--text-secondary); }

@media (max-width: 480px) {
  .panel { width: 280px; right: -40px; }
}
</style>
