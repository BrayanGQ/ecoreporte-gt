// Prepara la base de datos de pruebas (ecoreporte_test) desde cero.
// Uso (desde backend/):  npm run test:bd
//
// 1. Se conecta a la base "postgres" y (re)crea la base de pruebas: si ya existe la borra,
//    para que cada preparación parta del mismo estado.
// 2. Ejecuta con `pg` (sin psql) los scripts database/01 a 05, en orden.
// 3. Corre la misma lógica que `npm run seed` (contraseñas de los usuarios base) y
//    `npm run demo` (usuarios, municipalidades activas y reportes de demostración).
//
// Nunca toca la base de la aplicación: el nombre sale de .env.test y debe terminar en "_test".
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { cargarEntornoPruebas } = require('./entorno-pruebas');

const CARPETA_SQL = path.join(__dirname, '..', '..', 'database');
const SCRIPTS_SQL = [
  '01_esquema.sql',
  '02_datos_iniciales.sql',
  '03_evidencia_base64.sql',
  '04_rol_cuadrilla.sql',
  '05_limites_municipales.sql',
];

function conexion(database) {
  return new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database,
  });
}

async function recrearBase(nombre) {
  const admin = conexion('postgres');
  await admin.connect();
  try {
    const existe = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombre]);
    if (existe.rowCount) {
      // WITH (FORCE) cierra conexiones abiertas a la base (PostgreSQL 13+).
      await admin.query(`DROP DATABASE "${nombre}" WITH (FORCE)`);
      console.log(`Base "${nombre}" existente eliminada.`);
    }
    await admin.query(`CREATE DATABASE "${nombre}" ENCODING 'UTF8' TEMPLATE template0`);
    console.log(`Base "${nombre}" creada.`);
  } finally {
    await admin.end();
  }
}

async function ejecutarScripts(nombre) {
  const db = conexion(nombre);
  await db.connect();
  try {
    for (const archivo of SCRIPTS_SQL) {
      const sql = fs.readFileSync(path.join(CARPETA_SQL, archivo), 'utf8');
      await db.query(sql); // protocolo simple: admite varias sentencias por archivo
      console.log(`  ✓ ${archivo}`);
    }
  } finally {
    await db.end();
  }
}

async function main() {
  const nombre = cargarEntornoPruebas();
  console.log(`Preparando la base de pruebas "${nombre}"...`);
  await recrearBase(nombre);

  console.log('Ejecutando scripts de database/:');
  await ejecutarScripts(nombre);

  // Recién ahora se importa config/db.js: ya apunta a la base de pruebas.
  const { pool } = require('../src/config/db');
  const { asignarContrasenas } = require('../src/seed');
  const { cargarDatosDemo, resumen } = require('../src/demo');
  try {
    await asignarContrasenas({ silencioso: true });
    console.log('  ✓ contraseñas de los usuarios base (seed)');
    await cargarDatosDemo();
    console.log('  ✓ datos de demostración (demo)');
    await resumen();
    console.log(`\nBase "${nombre}" lista. Corré las pruebas con: npm test`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\nNo se pudo preparar la base de pruebas:', err.message);
  process.exitCode = 1;
});
