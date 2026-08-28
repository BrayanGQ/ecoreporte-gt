// Script que asigna contraseñas reales (hasheadas) a los usuarios de demostración.
// Ejecutar una sola vez después de cargar 02_datos_iniciales.sql:  npm run seed
const bcrypt = require('bcryptjs');
const { query, pool } = require('./config/db');

async function seed() {
  const usuariosDemo = [
    { correo: 'admin@ecoreporte.gt',     password: 'password123' },
    { correo: 'municipal@ecoreporte.gt', password: 'password123' },
    { correo: 'ciudadano@ecoreporte.gt', password: 'password123' },
  ];

  try {
    for (const u of usuariosDemo) {
      const hash = await bcrypt.hash(u.password, 10);
      const res = await query(
        'UPDATE usuario SET password_hash = $1 WHERE correo = $2 RETURNING correo',
        [hash, u.correo]
      );
      if (res.rows.length > 0) {
        console.log(`Contraseña actualizada para ${u.correo}`);
      } else {
        console.log(`Usuario no encontrado: ${u.correo}`);
      }
    }
    console.log('\nSeed completado. Usuarios demo listos con la contraseña: password123');
  } catch (err) {
    console.error('Error en seed:', err.message);
  } finally {
    await pool.end();
  }
}

seed();
