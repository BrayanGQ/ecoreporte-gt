<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const usuario = ref(JSON.parse(localStorage.getItem('usuario') || 'null'));

window.addEventListener('storage-updated', () => {
  usuario.value = JSON.parse(localStorage.getItem('usuario') || 'null');
});

function cerrarSesion() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  usuario.value = null;
  router.push('/portal');
}
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
</style>
