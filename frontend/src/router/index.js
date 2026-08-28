// Configuración de rutas de la aplicación con Vue Router.
import { createRouter, createWebHistory } from 'vue-router';

import Reportar from '../views/Reportar.vue';
import Mapa from '../views/Mapa.vue';
import Consultar from '../views/Consultar.vue';
import Login from '../views/Login.vue';
import Registro from '../views/Registro.vue';
import RecuperarPassword from '../views/RecuperarPassword.vue';
import PanelMunicipal from '../views/PanelMunicipal.vue';
import DetalleReporte from '../views/DetalleReporte.vue';

const routes = [
  { path: '/', name: 'reportar', component: Reportar },
  { path: '/mapa', name: 'mapa', component: Mapa },
  { path: '/consultar', name: 'consultar', component: Consultar },
  { path: '/login', name: 'login', component: Login },
  { path: '/registro', name: 'registro', component: Registro },
  { path: '/recuperar', name: 'recuperar', component: RecuperarPassword },
  {
    path: '/panel',
    name: 'panel',
    component: PanelMunicipal,
    meta: { requiereAuth: true },
  },
  {
    path: '/panel/reporte/:id',
    name: 'detalle',
    component: DetalleReporte,
    meta: { requiereAuth: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Guarda de navegación: protege las rutas que requieren autenticación.
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token');
  if (to.meta.requiereAuth && !token) {
    next({ name: 'login' });
  } else {
    next();
  }
});

export default router;
