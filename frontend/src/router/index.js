// Configuración de rutas de la aplicación con Vue Router.
import { createRouter, createWebHistory } from 'vue-router';
import {
  limpiarSesionSiVencida, tomarExpiracionPendiente, obtenerToken, obtenerUsuario,
} from '../utils/sesion';

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
import AdminUsuarios from '../views/AdminUsuarios.vue';
import AdminCatalogos from '../views/AdminCatalogos.vue';
import Estadisticas from '../views/Estadisticas.vue';

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
      {
        path: 'estadisticas',
        name: 'estadisticas',
        component: Estadisticas,
        // El encargado de cuadrilla no tiene acceso a estadísticas.
        meta: { roles: ['personal_municipal', 'administrador'] },
      },
      // Administración: solo accesible con el rol 'administrador'.
      {
        path: 'admin/usuarios',
        name: 'admin-usuarios',
        component: AdminUsuarios,
        meta: { requiereAdmin: true },
      },
      {
        path: 'admin/catalogos',
        name: 'admin-catalogos',
        component: AdminCatalogos,
        meta: { requiereAdmin: true },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Guarda de navegación: protege las rutas del panel municipal.
router.beforeEach((to, from, next) => {
  // Una sesión vencida se borra antes de decidir; si la ruta la requería, el login muestra
  // el aviso de sesión expirada. También cuenta la que se borró al cargar la app (main.js).
  limpiarSesionSiVencida();
  const vencida = tomarExpiracionPendiente();
  const aviso = vencida ? { query: { sesion: 'expirada' } } : {};
  const token = obtenerToken();
  const usuario = obtenerUsuario();

  if (to.meta.requiereAuth && !token) {
    next({ name: 'login-municipal', ...aviso });
  } else if (to.meta.requiereAuthCiudadano && !token) {
    next({ name: 'login-ciudadano', ...aviso });
  } else if (to.meta.requiereAdmin && (!usuario || usuario.rol !== 'administrador')) {
    // El personal municipal normal no puede entrar a las vistas de administración.
    next({ name: 'panel' });
  } else if (to.meta.roles && (!usuario || !to.meta.roles.includes(usuario.rol))) {
    // Vistas restringidas a ciertos roles: el resto vuelve a la lista de reportes.
    next({ name: 'panel' });
  } else {
    next();
  }
});

export default router;
