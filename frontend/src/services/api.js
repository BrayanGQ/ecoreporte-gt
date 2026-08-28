// Capa de servicios: centraliza todas las llamadas a la API del backend.
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Interceptor: adjunta automáticamente el token JWT si el usuario inició sesión.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
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
  listar: (filtros) => api.get('/reportes', { params: filtros }),
  consultar: (codigo) => api.get(`/reportes/consulta/${codigo}`),
  detalle: (id) => api.get(`/reportes/${id}/detalle`),
  actualizarEstado: (id, datos) => api.put(`/reportes/${id}/estado`, datos),
};

export default api;
