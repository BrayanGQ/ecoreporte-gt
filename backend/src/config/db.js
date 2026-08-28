// Configuración de la conexión a PostgreSQL mediante un pool de conexiones.
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'ecoreporte',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Pequeño helper para ejecutar consultas con parámetros.
async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

// Verifica la conexión al iniciar el servidor.
async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW() AS ahora');
    console.log('Conexión a PostgreSQL exitosa:', res.rows[0].ahora);
    return true;
  } catch (err) {
    console.error('Error al conectar con PostgreSQL:', err.message);
    return false;
  }
}

module.exports = { pool, query, testConnection };
