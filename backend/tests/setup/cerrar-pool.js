// jest (setupFilesAfterEnv): ciclo de la base de pruebas en cada archivo de pruebas.
// - Antes: borra restos de corridas anteriores (por si alguna se interrumpió).
// - Después: borra lo que crearon las pruebas y recién entonces cierra el pool de PostgreSQL,
//   para que jest no quede esperando conexiones abiertas.
// Va en un solo afterAll porque jest ejecuta primero los hooks de este archivo y luego los de
// la prueba: si el pool se cerrara aquí, una limpieza posterior ya no tendría conexión.
const { pool } = require('../../src/config/db');
const { limpiarDatosDePrueba } = require('../helpers');

beforeAll(limpiarDatosDePrueba);

afterAll(async () => {
  try {
    await limpiarDatosDePrueba();
  } finally {
    await pool.end();
  }
});
