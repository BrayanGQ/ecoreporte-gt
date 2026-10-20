// Carga los scripts database/01 a 05 en la base configurada (DATABASE_URL o DB_* del .env),
// sin necesitar psql. Pensado para inicializar una base nueva, por ejemplo la de Neon.
// Uso (desde backend/):  npm run bd:esquema
//
// Si la base ya tiene las tablas de EcoReporte GT, no hace nada (el script 01 fallaría al
// intentar crearlas de nuevo y no se quiere tocar una base con datos).
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

const CARPETA_SQL = path.join(__dirname, '..', '..', 'database');
const SCRIPTS_SQL = [
  '01_esquema.sql',
  '02_datos_iniciales.sql',
  '03_evidencia_base64.sql',
  '04_rol_cuadrilla.sql',
  '05_limites_municipales.sql',
];

async function main() {
  const destino = process.env.DATABASE_URL ? 'DATABASE_URL' : `${process.env.DB_NAME || 'ecoreporte'} (DB_*)`;
  const existe = (await pool.query("SELECT to_regclass('public.reporte') IS NOT NULL AS hay")).rows[0].hay;
  if (existe) {
    console.log(`La base (${destino}) ya tiene las tablas de EcoReporte GT: no se ejecuta nada.`);
    return;
  }
  console.log(`Cargando el esquema en la base de ${destino}:`);
  for (const archivo of SCRIPTS_SQL) {
    await pool.query(fs.readFileSync(path.join(CARPETA_SQL, archivo), 'utf8'));
    console.log(`  ✓ ${archivo}`);
  }
  console.log('\nListo. Siguientes pasos: npm run seed (contraseñas de los usuarios base) y, si querés, npm run demo.');
}

main()
  .catch((err) => {
    console.error('\nNo se pudo cargar el esquema:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
