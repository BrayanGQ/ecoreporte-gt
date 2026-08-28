// Definición de todas las rutas de la API.
const express = require('express');
const router = express.Router();

const auth = require('../controllers/authController');
const reportes = require('../controllers/reporteController');
const catalogo = require('../controllers/catalogoController');
const { verificarToken, permitirRoles } = require('../middleware/auth');

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

// Gestión municipal: requieren autenticación y rol.
router.get('/reportes/:id/detalle', verificarToken, reportes.detalleReporte);
router.put('/reportes/:id/estado', verificarToken,
  permitirRoles('personal_municipal', 'administrador'), reportes.actualizarEstado);

module.exports = router;
