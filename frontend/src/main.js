import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { registrarRouter } from './services/api';
import { limpiarSesionSiVencida } from './utils/sesion';
import './styles.css';

// Si la sesión guardada ya venció, se borra antes de montar la app para que no se muestre
// al usuario como conectado.
limpiarSesionSiVencida();

// Permite que api.js lleve al login cuando una ruta protegida responde 401.
registrarRouter(router);

createApp(App).use(router).mount('#app');
