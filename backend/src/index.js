// Punto de entrada del servidor Express — API REST de EcoReporte GT.
// La aplicación (middlewares y rutas) se construye en app.js.
require('dotenv').config();

const app = require('./app');
const { testConnection } = require('./config/db');

const PORT = process.env.PORT || 3000;

// Inicia el servidor tras verificar la conexión a la base de datos.
async function iniciar() {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
  });
}

iniciar();
