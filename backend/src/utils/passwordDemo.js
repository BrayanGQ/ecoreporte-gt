// Contraseña de los usuarios de demostración (seed.js y demo.js).
// Se toma de DEMO_PASSWORD si está definida (por ejemplo, en producción, para que las cuentas
// demo no queden con una contraseña pública); si no, se usa password123.
// Debe llamarse después de cargar el .env (config/db.js lo carga al importarse).
const PASSWORD_DEMO_POR_DEFECTO = 'password123';
const LARGO_MINIMO = 6; // el mismo mínimo que exige la app al registrar o crear cuentas

function passwordDemo() {
  const valor = process.env.DEMO_PASSWORD;
  if (!valor) return PASSWORD_DEMO_POR_DEFECTO;
  if (valor.length < LARGO_MINIMO) {
    throw new Error(`DEMO_PASSWORD debe tener al menos ${LARGO_MINIMO} caracteres.`);
  }
  return valor;
}

module.exports = { passwordDemo, PASSWORD_DEMO_POR_DEFECTO };
