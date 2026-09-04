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
    <div class="logo"></div>
    <span class="brand">EcoReporte GT</span>
    <div class="links">
      <router-link to="/portal">Reportar</router-link>
      <router-link to="/portal/mapa">Mapa</router-link>
      <router-link to="/portal/consultar">Consultar</router-link>
      <template v-if="usuario">
        <span class="user">{{ usuario.nombre_completo }}</span>
        <button class="enter" @click="cerrarSesion">Salir</button>
      </template>
      <router-link v-else to="/portal/login" class="login-link">
        ¿Sos ciudadano registrado? Iniciá sesión
      </router-link>
      <router-link to="/" class="volver">Volver al inicio</router-link>
    </div>
  </nav>
  <router-view />
</template>

<style scoped>
.navbar {
  background: var(--forest);
  min-height: 56px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 22px;
  gap: 10px;
}
.logo { width: 26px; height: 26px; border-radius: 50%; background: var(--moss); }
.brand { color: #fff; font-weight: 700; font-size: 17px; margin-right: auto; }
.links { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.links a {
  color: #fff; text-decoration: none; font-size: 13px;
  padding: 7px 12px; border-radius: 6px; transition: .15s;
  white-space: nowrap;
}
.links a:hover { background: rgba(255,255,255,.15); }
.links a.router-link-exact-active { background: var(--moss); color: var(--forest); font-weight: 700; }
.login-link { font-size: 12px !important; opacity: .9; }
.user { color: #fff; font-size: 12px; opacity: .85; }
.enter, .volver {
  background: var(--amber); color: var(--forest) !important;
  border: none; font-weight: 700; border-radius: 14px;
  padding: 7px 16px; font-size: 13px; text-decoration: none;
}
</style>
