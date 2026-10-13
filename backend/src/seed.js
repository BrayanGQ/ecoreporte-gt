// Script que asigna contraseñas reales (hasheadas) a los usuarios de demostración.
// Ejecutar una sola vez después de cargar 02_datos_iniciales.sql:  npm run seed
// También lo reutiliza scripts/preparar-bd-pruebas.js (exporta asignarContrasenas).
const bcrypt = require('bcryptjs');
const { query, pool } = require('./config/db');

const USUARIOS_DEMO = [
  { correo: 'admin@ecoreporte.gt',     password: 'password123' },
  { correo: 'municipal@ecoreporte.gt', password: 'password123' },
  { correo: 'ciudadano@ecoreporte.gt', password: 'password123' },
  // Requiere haber corrido database/04_rol_cuadrilla.sql.
  { correo: 'cuadrilla@ecoreporte.gt', password: 'password123' },
];

// Asigna las contraseñas de los usuarios demo base. No cierra el pool.
async function asignarContrasenas({ silencioso = false } = {}) {
  for (const u of USUARIOS_DEMO) {
    const hash = await bcrypt.hash(u.password, 10);
    const res = await query(
      'UPDATE usuario SET password_hash = $1 WHERE correo = $2 RETURNING correo',
      [hash, u.correo]
    );
    if (silencioso) continue;
    if (res.rows.length > 0) {
      console.log(`Contraseña actualizada para ${u.correo}`);
    } else {
      console.log(`Usuario no encontrado: ${u.correo}`);
    }
  }
}

async function seed() {
  try {
    await asignarContrasenas();
    console.log('\nSeed completado. Usuarios demo listos con la contraseña: password123');
  } catch (err) {
    console.error('Error en seed:', err.message);
  } finally {
    await pool.end();
  }
}

if (require.main === module) seed();

module.exports = { asignarContrasenas };
