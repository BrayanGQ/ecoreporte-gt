// Definición de todas las rutas de la API.
const express = require('express');
const router = express.Router();

const auth = require('../controllers/authController');
const reportes = require('../controllers/reporteController');
const catalogo = require('../controllers/catalogoController');
const notificaciones = require('../controllers/notificacionController');
const admin = require('../controllers/adminController');
const estadisticas = require('../controllers/estadisticaController');
const { verificarToken, tokenOpcional, permitirRoles } = require('../middleware/auth');

// Middleware reutilizado por todas las rutas de administración:
// exige token válido y rol 'administrador'.
const soloAdmin = [verificarToken, permitirRoles('administrador')];

// Middleware para rutas del personal: token válido y rol municipal o administrador.
const personalMunicipal = [verificarToken, permitirRoles('personal_municipal', 'administrador')];

// Acciones del flujo de estados: coordinador (personal_municipal) o encargado de cuadrilla.
const soloCoordinador = [verificarToken, permitirRoles('personal_municipal')];
const soloCuadrilla = [verificarToken, permitirRoles('encargado_cuadrilla')];

// ---------- Autenticación (públicas) ----------
router.post('/auth/registro', auth.registro);
router.post('/auth/login', auth.login);
router.post('/auth/recuperar', auth.recuperarPassword);
router.post('/auth/restablecer', auth.restablecerPassword);

// ---------- Catálogos (públicos, para los formularios) ----------
router.get('/catalogos/tipos', catalogo.tiposIncidencia);
router.get('/catalogos/estados', catalogo.estados);
router.get('/catalogos/municipalidades', catalogo.municipalidades);
// Municipalidad según la ubicación (PostGIS) y contornos de las activas, para el mapa del reporte.
router.get('/catalogos/municipalidad-por-ubicacion', catalogo.municipalidadPorUbicacion);
router.get('/catalogos/limites-activos', catalogo.limitesActivos);

// ---------- Reportes ----------
// Registro ciudadano y consulta pública: no requieren autenticación.
router.post('/reportes', reportes.crearReporte);
// Listado público (mapa); con token, se limita al alcance del rol (ver listarReportes).
router.get('/reportes', tokenOpcional, reportes.listarReportes);
router.get('/reportes/consulta/:codigo', reportes.consultarPorCodigo);

// Ciudadano autenticado: sus propios reportes.
router.get('/reportes/mis-reportes', verificarToken, reportes.misReportes);

// Gestión municipal: requieren autenticación y rol.
router.get('/reportes/:id/detalle', verificarToken, reportes.detalleReporte);
// Flujo de estados: una acción por transición, cada una con su rol.
// El administrador no interviene en la atención (recibe 403).
router.post('/reportes/:id/asignar', soloCoordinador, reportes.asignar);
router.post('/reportes/:id/descartar', soloCoordinador, reportes.descartar);
router.post('/reportes/:id/iniciar', soloCuadrilla, reportes.iniciar);
router.post('/reportes/:id/resolver', soloCuadrilla, reportes.resolver);
router.get('/reportes/:id/asignables', verificarToken,
  permitirRoles('personal_municipal', 'administrador'), reportes.empleadosAsignables);

// ---------- Notificaciones (usuario autenticado) ----------
router.get('/notificaciones', verificarToken, notificaciones.misNotificaciones);
router.put('/notificaciones/:id/leida', verificarToken, notificaciones.marcarLeida);

// ---------- Estadísticas (personal municipal y administrador) ----------
// Aceptan ?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD (opcionales, inclusivos).
router.get('/estadisticas/por-estado', personalMunicipal, estadisticas.porEstado);
router.get('/estadisticas/por-tipo', personalMunicipal, estadisticas.porTipo);
router.get('/estadisticas/resumen', personalMunicipal, estadisticas.resumen);

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
router.put('/admin/municipalidades/:id/estado', soloAdmin, admin.cambiarEstadoMunicipalidad);

module.exports = router;
