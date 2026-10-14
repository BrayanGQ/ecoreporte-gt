// Manejo de la sesión guardada en localStorage (token JWT + datos del usuario).
// El backend emite tokens con vencimiento (campo `exp`, 8 h por defecto). Si el token
// venció, la sesión se borra para que la app no muestre al usuario como conectado
// cuando el backend ya lo trata como anónimo.

export const MENSAJE_SESION_EXPIRADA = 'Tu sesión expiró, iniciá sesión de nuevo.';

export function obtenerToken() {
  return localStorage.getItem('token');
}

export function obtenerUsuario() {
  try {
    return JSON.parse(localStorage.getItem('usuario') || 'null');
  } catch (e) {
    return null;
  }
}

// Lee el campo `exp` (segundos desde 1970) de un JWT sin librerías: la carga útil es el
// segundo segmento, en base64url. Devuelve null si el token no tiene un formato válido.
export function expiracionToken(token) {
  try {
    const carga = token.split('.')[1];
    const base64 = carga.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(carga.length / 4) * 4, '=');
    const { exp } = JSON.parse(atob(base64));
    return typeof exp === 'number' ? exp : null;
  } catch (e) {
    return null;
  }
}

// Un token ilegible o sin `exp` se considera vencido: el backend tampoco lo aceptaría.
export function tokenVencido(token) {
  const exp = expiracionToken(token);
  return exp === null || exp * 1000 <= Date.now();
}

// Borra la sesión y avisa a los layouts (escuchan 'storage-updated') para que actualicen
// el nombre del usuario, las notificaciones y los menús.
export function cerrarSesionLocal() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.dispatchEvent(new Event('storage-updated'));
}

// Usuario de la última sesión vencida que todavía no se le avisó a nadie (p. ej. se borró al
// cargar la app, antes de la primera navegación del router).
let expiracionPendiente = null;

// Si hay un token guardado y ya venció, borra la sesión y emite 'sesion-expirada' (con el
// usuario en `detail`) para que las vistas que lo necesiten avisen. Devuelve el usuario que
// tenía la sesión vencida (para saber a qué portal mandarlo) o null si no había nada que borrar.
export function limpiarSesionSiVencida() {
  const token = obtenerToken();
  if (!token || !tokenVencido(token)) return null;
  const usuario = obtenerUsuario() || {};
  cerrarSesionLocal();
  expiracionPendiente = usuario;
  window.dispatchEvent(new CustomEvent('sesion-expirada', { detail: usuario }));
  return usuario;
}

// Devuelve (y descarta) la sesión vencida pendiente de aviso, o null si no hay.
export function tomarExpiracionPendiente() {
  const usuario = expiracionPendiente;
  expiracionPendiente = null;
  return usuario;
}

// Ruta de login del portal que corresponde al rol: el personal municipal, la cuadrilla y el
// administrador entran por el portal municipal; el ciudadano (o un rol desconocido), por el
// portal ciudadano.
export function loginDelPortal(usuario) {
  return usuario?.rol && usuario.rol !== 'ciudadano' ? 'login-municipal' : 'login-ciudadano';
}
