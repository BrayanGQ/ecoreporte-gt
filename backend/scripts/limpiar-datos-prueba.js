// Borra de ecoreporte_test los datos que crean las pruebas (reportes con la marca
// [PRUEBA AUTOMATIZADA] y cuentas prueba.*@prueba.test), con la misma limpieza que usa Jest.
// Lo usan las pruebas de extremo a extremo del frontend antes y después de ejecutarse.
// Uso: node scripts/limpiar-datos-prueba.js
const { cargarEntornoPruebas } = require('./entorno-pruebas');

cargarEntornoPruebas();
process.env.BREVO_API_KEY = '';

const { pool } = require('../src/config/db');
const { limpiarDatosDePrueba } = require('../tests/helpers');

limpiarDatosDePrueba()
  .then(() => console.log('Datos de prueba borrados de la base de pruebas.'))
  .catch((err) => {
    console.error('No se pudieron borrar los datos de prueba:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
