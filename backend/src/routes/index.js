// Definición de todas las rutas de la API.
const express = require('express');
const router = express.Router();

const auth = require('../controllers/authController');
const reportes = require('../controllers/reporteController');
const catalogo = require('../controllers/catalogoController');
const notificaciones = require('../controllers/notificacionController');
const admin = require('../controllers/adminController');
const { verificarToken, permitirRoles } = require('../middleware/auth');

// Middleware reutilizado por todas las rutas de administración:
// exige token válido y rol 'administrador'.
const soloAdmin = [verificarToken, permitirRoles('administrador')];

// ---------- Autenticación (públicas) ----------
router.post('/auth/registro', auth.registro);
router.post('/auth/login', auth.login);
router.post('/auth/recuperar', auth.recuperarPassword);
router.post('/auth/restablecer', auth.restablecerPassword);

// ---------- Catálogos (públicos, para los formularios) ----------
router.get('/catalogos/tipos', catalogo.tiposIncidencia);
router.get('/catalogos/estados', catalogo.estados);
router.get('/catalogos/municipalidades', catalogo.municipalidades);

// ---------- Reportes ----------
// Registro ciudadano y consulta pública: no requieren autenticación.
router.post('/reportes', reportes.crearReporte);
router.get('/reportes', reportes.listarReportes);
router.get('/reportes/consulta/:codigo', reportes.consultarPorCodigo);

// Ciudadano autenticado: sus propios reportes.
router.get('/reportes/mis-reportes', verificarToken, reportes.misReportes);

// Gestión municipal: requieren autenticación y rol.
router.get('/reportes/:id/detalle', verificarToken, reportes.detalleReporte);
router.put('/reportes/:id/estado', verificarToken,
  permitirRoles('personal_municipal', 'administrador'), reportes.actualizarEstado);

// ---------- Notificaciones (usuario autenticado) ----------
router.get('/notificaciones', verificarToken, notificaciones.misNotificaciones);
router.put('/notificaciones/:id/leida', verificarToken, notificaciones.marcarLeida);

// ---------- Administración (solo rol 'administrador') ----------
// Gestión de cuentas de personal municipal.
router.get('/admin/usuarios', soloAdmin, admin.listarUsuarios);
router.post('/admin/usuarios', soloAdmin, admin.crearUsuario);
router.put('/admin/usuarios/:id/estado', soloAdmin, admin.cambiarEstadoUsuario);
router.get('/admin/roles', soloAdmin, admin.listarRoles);

// Configuración de catálogos.
router.get('/admin/tipos-incidencia', soloAdmin, admin.listarTiposIncidencia);
router.post('/admin/tipos-incidencia', soloAdmin, admin.crearTipoIncidencia);
router.put('/admin/tipos-incidencia/:id', soloAdmin, admin.editarTipoIncidencia);

router.get('/admin/municipalidades', soloAdmin, admin.listarMunicipalidades);
router.post('/admin/municipalidades', soloAdmin, admin.crearMunicipalidad);
router.put('/admin/municipalidades/:id', soloAdmin, admin.editarMunicipalidad);

module.exports = router;
