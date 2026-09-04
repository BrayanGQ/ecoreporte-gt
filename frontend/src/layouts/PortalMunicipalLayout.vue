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
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <i class="bx bx-building"></i>
        <div class="brand-text">
          <span class="name">EcoReporte GT</span>
          <span class="tag">Panel Municipal</span>
        </div>
      </div>
      <nav>
        <router-link to="/municipal/panel"><i class="bx bx-grid-alt"></i> Reportes</router-link>
      </nav>
      <div class="footer">
        <span class="user" v-if="usuario"><i class="bx bx-user-circle"></i> {{ usuario.nombre_completo }}</span>
        <button class="enter" @click="cerrarSesion"><i class="bx bx-log-out"></i> Cerrar sesión</button>
      </div>
    </aside>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
}
.sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--forest-dark);
  color: #fff;
  display: flex;
  flex-direction: column;
  padding: 20px 0;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px 20px;
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, .12);
}
.brand i { font-size: 24px; color: var(--amber); }
.brand-text { display: flex; flex-direction: column; line-height: 1.3; }
.brand-text .name { font-weight: 700; font-size: 15px; }
.brand-text .tag { font-size: 11.5px; opacity: .7; }
.sidebar nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 12px;
  flex: 1;
}
.sidebar nav a {
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(255, 255, 255, .78);
  text-decoration: none;
  font-size: 14px;
  padding: 10px 12px;
  border-radius: 6px;
  transition: background .15s, color .15s;
}
.sidebar nav a i { font-size: 18px; }
.sidebar nav a:hover { background: rgba(255, 255, 255, .08); color: #fff; }
.sidebar nav a.router-link-exact-active { background: var(--moss); color: var(--forest-dark); font-weight: 600; }
.footer {
  padding: 16px 20px 0;
  margin-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, .12);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.user {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  opacity: .85;
}
.user i { font-size: 17px; }
.enter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--amber);
  color: var(--forest-dark);
  border: none;
  font-weight: 600;
  border-radius: 6px;
  padding: 9px 14px;
  font-size: 13px;
  transition: filter .15s;
}
.enter:hover { filter: brightness(.95); }
.content {
  flex: 1;
  min-width: 0;
}

@media (max-width: 768px) {
  .layout { flex-direction: column; }
  .sidebar {
    width: 100%;
    flex-direction: row;
    align-items: center;
    padding: 10px 16px;
    gap: 16px;
    flex-wrap: wrap;
  }
  .brand { border: none; margin: 0; padding: 0; }
  .sidebar nav { flex-direction: row; flex: none; padding: 0; }
  .footer {
    border: none;
    margin: 0;
    padding: 0;
    flex-direction: row;
    align-items: center;
    margin-left: auto;
  }
  .user { display: none; }
}
</style>
