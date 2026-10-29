// Arranca el backend contra la base de PRUEBAS (ecoreporte_test, configurada en .env.test).
// Lo usan las pruebas de extremo a extremo (frontend: npm run test:e2e) y la auditoría Lighthouse.
// Uso: node scripts/servidor-pruebas.js   (puerto: variable PORT, por defecto 3100)
//
// - cargarEntornoPruebas() aplica .env.test con prioridad y exige que DB_NAME termine en _test.
// - BREVO_API_KEY queda vacía ANTES de que la app cargue backend/.env (dotenv no pisa variables ya
//   definidas): así nunca se envían correos reales desde estas pruebas.
const { cargarEntornoPruebas } = require('./entorno-pruebas');

// El puerto se toma antes de cargar .env.test, que también define PORT y tiene prioridad.
const puerto = process.env.PORT || '3100';
const base = cargarEntornoPruebas();
process.env.BREVO_API_KEY = '';
process.env.PORT = puerto;
console.log(`Servidor de pruebas: base ${base}, puerto ${process.env.PORT}, sin envío de correos.`);

require('../src/index');
