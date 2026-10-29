// Aplicación Express de EcoReporte GT: middlewares, rutas, frontend compilado y manejo de 404.
// Se exporta sin arrancar el servidor para poder probarla (supertest) sin abrir un puerto;
// el arranque está en index.js.
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const routes = require('./routes');

const app = express();

// Frontend compilado (npm run build en frontend/). En producción un solo servicio sirve la
// API y la app; en desarrollo el frontend lo sirve Vite y esta carpeta puede no existir.
const FRONTEND_DIST = path.join(__dirname, '../../frontend/dist');
const INDEX_HTML = path.join(FRONTEND_DIST, 'index.html');
const hayFrontend = fs.existsSync(INDEX_HTML);

// La versión sale de backend/package.json (npm version la actualiza ahí).
const { version } = require('../package.json');

const SALUD = { mensaje: 'API de EcoReporte GT en funcionamiento.', version };

// Middlewares globales.
app.use(cors());               // permite peticiones desde el frontend (Vue)
app.use(express.json({ limit: '30mb' }));  // parsea cuerpos JSON (amplio: evidencias en base64)

// Ruta de salud, para verificar que la API está en línea (p. ej. el health check de Render).
app.get('/api/salud', (req, res) => {
  res.json(SALUD);
});

if (hayFrontend) {
  // Archivos estáticos de la app (index.html, assets, favicon, robots.txt).
  app.use(express.static(FRONTEND_DIST));
} else {
  // Sin frontend compilado, la raíz responde con el estado de la API, como antes.
  app.get('/', (req, res) => {
    res.json(SALUD);
  });
}

// Todas las rutas de la API bajo el prefijo /api.
app.use('/api', routes);

// El router de Vue usa createWebHistory: rutas como /portal/mapa no existen como archivos,
// así que cualquier GET que no sea de la API devuelve index.html y la app resuelve la ruta.
if (hayFrontend) {
  app.get(/^(?!\/api(\/|$)).*/, (req, res) => {
    // El portal municipal es un enlace privado: que los buscadores no lo indexen
    // (también lo excluyen robots.txt y la meta robots que pone el router).
    if (/^\/municipal(\/|$)/.test(req.path)) res.set('X-Robots-Tag', 'noindex, nofollow');
    res.sendFile(INDEX_HTML);
  });
}

// Manejo de rutas no encontradas (incluidas las /api que no existen): 404 en JSON.
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

module.exports = app;
