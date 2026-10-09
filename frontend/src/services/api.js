// Capa de servicios: centraliza todas las llamadas a la API del backend.
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Interceptor: adjunta automáticamente el token JWT si el usuario inició sesión.
// Las consultas marcadas con { publico: true } se envían siempre sin token.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && !config.publico) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
  resolver: (id, comentario) => api.post(`/reportes/${id}/resolver`, { comentario }),
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
};

// --- Notificaciones ---
export const notificacionService = {
  listar: () => api.get('/notificaciones'),
  marcarLeida: (id) => api.put(`/notificaciones/${id}/leida`),
};

export default api;
