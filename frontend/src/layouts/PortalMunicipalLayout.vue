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
  router.push('/municipal/login');
}
</script>

<template>
  <nav class="navbar">
    <div class="logo"></div>
    <span class="brand">EcoReporte GT <small>· Panel Municipal</small></span>
    <div class="links">
      <router-link to="/municipal/panel">Reportes</router-link>
      <span class="user" v-if="usuario">{{ usuario.nombre_completo }}</span>
      <button class="enter" @click="cerrarSesion">Cerrar sesión</button>
    </div>
  </nav>
  <router-view />
</template>

<style scoped>
.navbar {
  background: var(--forest-dark);
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 22px;
  gap: 10px;
}
.logo { width: 26px; height: 26px; border-radius: 50%; background: var(--amber); }
.brand { color: #fff; font-weight: 700; font-size: 17px; margin-right: auto; }
.brand small { font-weight: 400; opacity: .75; font-size: 12px; }
.links { display: flex; align-items: center; gap: 12px; }
.links a {
  color: #fff; text-decoration: none; font-size: 13px;
  padding: 7px 12px; border-radius: 6px; transition: .15s;
}
.links a:hover { background: rgba(255,255,255,.15); }
.links a.router-link-exact-active { background: var(--moss); color: var(--forest); font-weight: 700; }
.user { color: #fff; font-size: 12px; opacity: .85; }
.enter {
  background: var(--amber); color: var(--forest-dark);
  border: none; font-weight: 700; border-radius: 14px;
  padding: 7px 16px; font-size: 13px;
}
</style>
