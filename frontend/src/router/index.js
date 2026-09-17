// Configuración de rutas de la aplicación con Vue Router.
import { createRouter, createWebHistory } from 'vue-router';

import Bienvenida from '../views/Bienvenida.vue';
import PortalCiudadanoLayout from '../layouts/PortalCiudadanoLayout.vue';
import PortalMunicipalLayout from '../layouts/PortalMunicipalLayout.vue';
import Reportar from '../views/Reportar.vue';
import Mapa from '../views/Mapa.vue';
import Consultar from '../views/Consultar.vue';
import Login from '../views/Login.vue';
import Registro from '../views/Registro.vue';
import RecuperarPassword from '../views/RecuperarPassword.vue';
import PanelMunicipal from '../views/PanelMunicipal.vue';
import DetalleReporte from '../views/DetalleReporte.vue';
import MisReportes from '../views/MisReportes.vue';

const routes = [
  // Pantalla de bienvenida: punto de entrada, sin navbar.
  { path: '/', name: 'bienvenida', component: Bienvenida },

  // Portal ciudadano: reportar, mapa y consultar no requieren login.
  {
    path: '/portal',
    component: PortalCiudadanoLayout,
    children: [
      { path: '', name: 'reportar', component: Reportar },
      { path: 'mapa', name: 'mapa', component: Mapa },
      { path: 'consultar', name: 'consultar', component: Consultar },
      { path: 'login', name: 'login-ciudadano', component: Login, meta: { portal: 'ciudadano' } },
      { path: 'registro', name: 'registro', component: Registro },
      { path: 'recuperar', name: 'recuperar', component: RecuperarPassword },
      {
        path: 'mis-reportes',
        name: 'mis-reportes',
        component: MisReportes,
        meta: { requiereAuthCiudadano: true },
      },
    ],
  },

  // Portal municipal: login público, panel protegido.
  {
    path: '/municipal/login',
    name: 'login-municipal',
    component: Login,
    meta: { portal: 'municipal' },
  },
  {
    path: '/municipal/panel',
    component: PortalMunicipalLayout,
    meta: { requiereAuth: true },
    children: [
      { path: '', name: 'panel', component: PanelMunicipal },
      { path: 'reporte/:id', name: 'detalle', component: DetalleReporte },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Guarda de navegación: protege las rutas del panel municipal.
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token');
  if (to.meta.requiereAuth && !token) {
    next({ name: 'login-municipal' });
  } else if (to.meta.requiereAuthCiudadano && !token) {
    next({ name: 'login-ciudadano' });
  } else {
    next();
  }
});

export default router;
