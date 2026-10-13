// Carga backend/.env.test en process.env (con prioridad sobre .env) y verifica que apunte a
// una base de PRUEBAS. Debe llamarse ANTES de importar src/config/db.js, que lee DB_* al cargarse.
// Lo usan scripts/preparar-bd-pruebas.js y la configuración de jest (tests/setup/entorno.js).
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ARCHIVO = path.join(__dirname, '..', '.env.test');

function cargarEntornoPruebas() {
  if (!fs.existsSync(ARCHIVO)) {
    throw new Error(
      'Falta backend/.env.test. Copiá backend/.env.test.example como .env.test y completá DB_PASSWORD.'
    );
  }
  dotenv.config({ path: ARCHIVO, override: true });

  // Protección de los datos reales: las pruebas borran y recrean esta base.
  const nombre = process.env.DB_NAME || '';
  if (!nombre.endsWith('_test')) {
    throw new Error(
      `DB_NAME="${nombre}" en .env.test no parece una base de pruebas (debe terminar en "_test"). ` +
      'Las pruebas no se ejecutan para no tocar la base de la aplicación.'
    );
  }
  return nombre;
}

module.exports = { cargarEntornoPruebas };
