<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
// Estado reactivo del usuario autenticado (leído de localStorage).
const usuario = ref(JSON.parse(localStorage.getItem('usuario') || 'null'));

// Actualiza el usuario cuando cambia el almacenamiento (login/logout).
window.addEventListener('storage-updated', () => {
  usuario.value = JSON.parse(localStorage.getItem('usuario') || 'null');
});

const esMunicipal = computed(() =>
  usuario.value && ['personal_municipal', 'administrador'].includes(usuario.value.rol)
);

function cerrarSesion() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  usuario.value = null;
  router.push('/login');
}
</script>

<template>
  <nav class="navbar">
    <div class="logo"></div>
    <span class="brand">EcoReporte GT</span>
    <div class="links">
      <router-link to="/">Reportar</router-link>
      <router-link to="/mapa">Mapa</router-link>
      <router-link to="/consultar">Consultar</router-link>
      <router-link v-if="esMunicipal" to="/panel">Panel municipal</router-link>
      <template v-if="usuario">
        <span class="user">{{ usuario.nombre_completo }}</span>
        <button class="enter" @click="cerrarSesion">Salir</button>
      </template>
      <router-link v-else to="/login" class="enter">Entrar</router-link>
    </div>
  </nav>
  <router-view />
</template>

<style scoped>
.navbar {
  background: var(--forest);
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 22px;
  gap: 10px;
}
.logo { width: 26px; height: 26px; border-radius: 50%; background: var(--moss); }
.brand { color: #fff; font-weight: 700; font-size: 17px; margin-right: auto; }
.links { display: flex; align-items: center; gap: 6px; }
.links a {
  color: #fff; text-decoration: none; font-size: 13px;
  padding: 7px 12px; border-radius: 6px; transition: .15s;
}
.links a:hover { background: rgba(255,255,255,.15); }
.links a.router-link-exact-active { background: var(--moss); color: var(--forest); font-weight: 700; }
.user { color: #fff; font-size: 12px; opacity: .85; }
.enter {
  background: var(--amber); color: var(--forest);
  border: none; font-weight: 700; border-radius: 14px;
  padding: 7px 16px; font-size: 13px; text-decoration: none;
}
</style>
