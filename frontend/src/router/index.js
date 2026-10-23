// Configuración de rutas de la aplicación con Vue Router.
import { createRouter, createWebHistory } from 'vue-router';
import {
  limpiarSesionSiVencida, tomarExpiracionPendiente, obtenerToken, obtenerUsuario,
} from '../utils/sesion';

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
import MiCuenta from '../views/MiCuenta.vue';
import Inicio from '../views/Inicio.vue';

const routes = [
  // Portal ciudadano (enlace público): "/" es su portada; reportar, mapa y consultar no
  // requieren login. Las rutas /portal/... siguen siendo las mismas de siempre.
  // El portal ciudadano no enlaza al municipal: el panel se comparte aparte (/municipal).
  {
    path: '/',
    component: PortalCiudadanoLayout,
    children: [
      { path: '', name: 'inicio', component: Inicio },
      { path: 'portal', name: 'reportar', component: Reportar },
      { path: 'portal/mapa', name: 'mapa', component: Mapa },
      { path: 'portal/consultar', name: 'consultar', component: Consultar },
      { path: 'portal/login', name: 'login-ciudadano', component: Login, meta: { portal: 'ciudadano' } },
      { path: 'portal/registro', name: 'registro', component: Registro },
      { path: 'portal/recuperar', name: 'recuperar', component: RecuperarPassword },
      {
        path: 'portal/mis-reportes',
        name: 'mis-reportes',
        component: MisReportes,
        meta: { requiereAuthCiudadano: true },
      },
      {
        path: 'portal/cuenta',
        name: 'cuenta-ciudadano',
        component: MiCuenta,
        meta: { requiereAuthCiudadano: true },
      },
    ],
  },

  // Portal municipal (enlace privado, no indexado): login público, panel protegido.
  { path: '/municipal', redirect: '/municipal/login' },
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
      { path: 'cuenta', name: 'cuenta-municipal', component: MiCuenta },
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

  // Cualquier otra ruta lleva a la portada ciudadana.
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Guarda de navegación: protege las rutas del panel municipal.
// Ruta a la que se vuelve después de iniciar sesión (Login.vue la valida antes de usarla):
// p. ej. el enlace a un reporte que llega por correo a la cuadrilla.
const volverA = (to) => (to.fullPath && to.fullPath !== '/' ? { redirect: to.fullPath } : {});

router.beforeEach((to, from, next) => {
  // Una sesión vencida se borra antes de decidir; si la ruta la requería, el login muestra
  // el aviso de sesión expirada. También cuenta la que se borró al cargar la app (main.js).
  limpiarSesionSiVencida();
  const vencida = tomarExpiracionPendiente();
  const aviso = vencida ? { sesion: 'expirada' } : {};
  const token = obtenerToken();
  const usuario = obtenerUsuario();

  if (to.meta.requiereAuth && !token) {
    next({ name: 'login-municipal', query: { ...aviso, ...volverA(to) } });
  } else if (to.meta.requiereAuthCiudadano && !token) {
    next({ name: 'login-ciudadano', query: { ...aviso, ...volverA(to) } });
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

// Las pantallas municipales no se indexan: meta robots noindex mientras se está en /municipal
// (además de robots.txt y del encabezado X-Robots-Tag que pone el backend).
router.afterEach((to) => {
  let meta = document.querySelector('meta[name="robots"]');
  if (to.path.startsWith('/municipal')) {
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    meta.content = 'noindex, nofollow';
  } else if (meta) {
    meta.remove();
  }
});

export default router;
