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

  // Las pruebas usan una base local definida con DB_*. Si backend/.env tiene DATABASE_URL
  // (p. ej. la de Neon en producción), config/db.js la preferiría: se anula con un valor vacío,
  // que dotenv no sobrescribe y que config/db.js trata como "no definida".
  if (process.env.DATABASE_URL && dotenv.parse(fs.readFileSync(ARCHIVO)).DATABASE_URL) {
    throw new Error(
      '.env.test no debe definir DATABASE_URL: las pruebas usan una base local configurada con DB_* ' +
      '(la base se borra y se recrea en cada npm run test:bd).'
    );
  }
  process.env.DATABASE_URL = '';

  // Contraseña de los usuarios demo en la base de pruebas: la de .env.test o password123, nunca la
  // DEMO_PASSWORD de backend/.env (que puede ser la de producción). La usan test:bd (seed y demo),
  // las pruebas y la medición de rendimiento para iniciar sesión.
  process.env.DEMO_PASSWORD = dotenv.parse(fs.readFileSync(ARCHIVO)).DEMO_PASSWORD || 'password123';

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
