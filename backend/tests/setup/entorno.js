// jest (setupFiles): carga .env.test ANTES de que cualquier prueba importe src/config/db.js,
// para que el pool se conecte a la base de pruebas (ecoreporte_test) y nunca a la de la app.
const { cargarEntornoPruebas } = require('../../scripts/entorno-pruebas');

cargarEntornoPruebas();
