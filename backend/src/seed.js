// Script que asigna contraseñas reales (hasheadas) a los usuarios de demostración.
// Ejecutar una sola vez después de cargar 02_datos_iniciales.sql:  npm run seed
// También lo reutiliza scripts/preparar-bd-pruebas.js (exporta asignarContrasenas).
const bcrypt = require('bcryptjs');
const { query, pool } = require('./config/db'); // también carga el .env
const { passwordDemo } = require('./utils/passwordDemo');

// Usuarios demo base. La contraseña sale de DEMO_PASSWORD o, si no está definida, es password123.
const USUARIOS_DEMO = [
  'admin@ecoreporte.gt',
  'municipal@ecoreporte.gt',
  'ciudadano@ecoreporte.gt',
  'cuadrilla@ecoreporte.gt', // requiere haber corrido database/04_rol_cuadrilla.sql
];

// Asigna las contraseñas de los usuarios demo base. No cierra el pool.
async function asignarContrasenas({ silencioso = false } = {}) {
  const hash = await bcrypt.hash(passwordDemo(), 10);
  for (const correo of USUARIOS_DEMO) {
    const res = await query(
      'UPDATE usuario SET password_hash = $1 WHERE correo = $2 RETURNING correo',
      [hash, correo]
    );
    if (silencioso) continue;
    if (res.rows.length > 0) {
      console.log(`Contraseña actualizada para ${correo}`);
    } else {
      console.log(`Usuario no encontrado: ${correo}`);
    }
  }
}

async function seed() {
  try {
    await asignarContrasenas();
    // Si la contraseña viene de DEMO_PASSWORD no se muestra: es un dato sensible.
    console.log(process.env.DEMO_PASSWORD
      ? '\nSeed completado. Usuarios demo listos con la contraseña de DEMO_PASSWORD.'
      : '\nSeed completado. Usuarios demo listos con la contraseña: password123');
  } catch (err) {
    console.error('Error en seed:', err.message);
  } finally {
    await pool.end();
  }
}

if (require.main === module) seed();

module.exports = { asignarContrasenas };
