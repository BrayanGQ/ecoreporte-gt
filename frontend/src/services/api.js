// Capa de servicios: centraliza todas las llamadas a la API del backend.
import axios from 'axios';
import {
  obtenerToken, obtenerUsuario, limpiarSesionSiVencida, cerrarSesionLocal, loginDelPortal,
} from '../utils/sesion';

const api = axios.create({
  baseURL: '/api',
});

// Interceptor de petición: adjunta automáticamente el token JWT si el usuario inició sesión.
// Si el token guardado ya venció, borra la sesión y la petición sale sin token (las rutas
// públicas siguen funcionando; las protegidas responden 401 y las maneja el interceptor de
// respuesta). Las consultas marcadas con { publico: true } se envían siempre sin token.
api.interceptors.request.use((config) => {
  const usuarioVencido = limpiarSesionSiVencida();
  if (usuarioVencido) config.sesionVencida = usuarioVencido;

  const token = obtenerToken();
  if (token && !config.publico) {
    config.headers.Authorization = `Bearer ${token}`;
    config.usuarioSesion = obtenerUsuario();
  }
  return config;
});

// Interceptor de respuesta: si una ruta que requiere sesión responde 401 (token vencido o
// inválido), cierra la sesión y lleva al usuario al login de su portal con un aviso.
// No aplica a /auth/* (un login con contraseña incorrecta también responde 401) ni a las
// peticiones que salieron sin sesión.
// El router se registra desde main.js (registrarRouter): importarlo aquí crearía una
// dependencia circular (el router importa las vistas, que importan este módulo).
let router = null;
export function registrarRouter(instancia) {
  router = instancia;
}

let redirigiendo = false;
api.interceptors.response.use(
  (respuesta) => respuesta,
  async (error) => {
    const { config, response } = error;
    const usuario = config?.usuarioSesion || config?.sesionVencida;
    if (response?.status === 401 && usuario && !config.url.startsWith('/auth/') && router && !redirigiendo) {
      redirigiendo = true;
      cerrarSesionLocal();
      try {
        await router.push({ name: loginDelPortal(usuario), query: { sesion: 'expirada' } });
      } finally {
        redirigiendo = false;
      }
    }
    return Promise.reject(error);
  }
);

// --- Autenticación ---
export const authService = {
  registro: (datos) => api.post('/auth/registro', datos),
  login: (datos) => api.post('/auth/login', datos),
  recuperar: (correo) => api.post('/auth/recuperar', { correo }),
  restablecer: (token, nueva_password) => api.post('/auth/restablecer', { token, nueva_password }),
};

// --- Catálogos ---
export const catalogoService = {
  tipos: () => api.get('/catalogos/tipos'),
  estados: () => api.get('/catalogos/estados'),
  municipalidades: () => api.get('/catalogos/municipalidades'),
  // Municipalidad cuyo límite contiene el punto (y si está activa).
  municipalidadPorUbicacion: (lat, lng) =>
    api.get('/catalogos/municipalidad-por-ubicacion', { params: { lat, lng } }),
  // Contornos (GeoJSON) de las municipalidades activas, para dibujarlos en el mapa.
  limitesActivos: () => api.get('/catalogos/limites-activos'),
};

// --- Reportes ---
export const reporteService = {
  crear: (datos) => api.post('/reportes', datos),
  // Con sesión iniciada, el backend limita el listado al alcance del rol (panel municipal).
  listar: (filtros) => api.get('/reportes', { params: filtros }),
  // Listado público del mapa: sin token, siempre muestra todos los reportes.
  listarPublico: (filtros) => api.get('/reportes', { params: filtros, publico: true }),
  consultar: (codigo) => api.get(`/reportes/consulta/${codigo}`),
  misReportes: () => api.get('/reportes/mis-reportes'),
  detalle: (id) => api.get(`/reportes/${id}/detalle`),
  // Flujo de estados: una acción por transición (el backend valida rol y estado).
  asignar: (id, id_usuario_asignado) => api.post(`/reportes/${id}/asignar`, { id_usuario_asignado }),
  descartar: (id, motivo) => api.post(`/reportes/${id}/descartar`, { motivo }),
  iniciar: (id, comentario) => api.post(`/reportes/${id}/iniciar`, { comentario }),
  // evidencias: arreglo de 1 a 5 fotos de la limpieza en base64 (obligatorio).
  resolver: (id, comentario, evidencias) => api.post(`/reportes/${id}/resolver`, { comentario, evidencias }),
  asignables: (id) => api.get(`/reportes/${id}/asignables`),
};

// --- Estadísticas (personal municipal y administrador) ---
export const estadisticaService = {
  resumen: (filtros) => api.get('/estadisticas/resumen', { params: filtros }),
  porEstado: (filtros) => api.get('/estadisticas/por-estado', { params: filtros }),
  porTipo: (filtros) => api.get('/estadisticas/por-tipo', { params: filtros }),
};

// --- Administración (solo rol administrador) ---
export const adminService = {
  // Usuarios de personal municipal
  usuarios: () => api.get('/admin/usuarios'),
  roles: () => api.get('/admin/roles'),
  crearUsuario: (datos) => api.post('/admin/usuarios', datos),
  cambiarEstadoUsuario: (id, estado) => api.put(`/admin/usuarios/${id}/estado`, { estado }),

  // Catálogo de tipos de incidencia
  tipos: () => api.get('/admin/tipos-incidencia'),
  crearTipo: (datos) => api.post('/admin/tipos-incidencia', datos),
  editarTipo: (id, datos) => api.put(`/admin/tipos-incidencia/${id}`, datos),

  // Catálogo de municipalidades
  municipalidades: () => api.get('/admin/municipalidades'),
  crearMunicipalidad: (datos) => api.post('/admin/municipalidades', datos),
  editarMunicipalidad: (id, datos) => api.put(`/admin/municipalidades/${id}`, datos),
  cambiarEstadoMunicipalidad: (id, estado_activo) =>
    api.put(`/admin/municipalidades/${id}/estado`, { estado_activo }),
};

// --- Notificaciones ---
export const notificacionService = {
  listar: () => api.get('/notificaciones'),
  marcarLeida: (id) => api.put(`/notificaciones/${id}/leida`),
};

export default api;
