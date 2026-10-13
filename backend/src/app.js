// Aplicación Express de EcoReporte GT: middlewares, rutas y manejo de 404.
// Se exporta sin arrancar el servidor para poder probarla (supertest) sin abrir un puerto;
// el arranque está en index.js.
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const routes = require('./routes');

const app = express();

// Middlewares globales.
app.use(cors());               // permite peticiones desde el frontend (Vue)
app.use(express.json({ limit: '30mb' }));  // parsea cuerpos JSON (amplio: evidencias en base64)

// Ruta de salud, para verificar que la API está en línea.
app.get('/', (req, res) => {
  res.json({ mensaje: 'API de EcoReporte GT en funcionamiento.', version: '1.0.0' });
});

// Todas las rutas de la API bajo el prefijo /api.
app.use('/api', routes);

// Manejo de rutas no encontradas.
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

module.exports = app;
