// Punto de entrada del servidor Express — API REST de EcoReporte GT.
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const routes = require('./routes');
const { testConnection } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares globales.
app.use(cors());               // permite peticiones desde el frontend (Vue)
app.use(express.json());       // parsea cuerpos JSON

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

// Inicia el servidor tras verificar la conexión a la base de datos.
async function iniciar() {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
  });
}

iniciar();
