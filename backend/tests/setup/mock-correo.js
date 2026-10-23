// jest (setupFilesAfterEnv, antes de cerrar-pool.js): reemplaza services/correo.js por un mock en
// TODAS las pruebas, para que ninguna mande correos reales. Tiene que registrarse aquí y no en el
// archivo de pruebas: cerrar-pool.js ya carga la app (y con ella el servicio de correo) antes de
// que corra el código de cada prueba. tests/correo.test.js revisa las llamadas a este mock.
jest.mock('../../src/services/correo', () => ({
  enviarCorreo: jest.fn().mockResolvedValue({ enviado: true, messageId: 'prueba' }),
  BREVO_URL: 'https://api.brevo.com/v3/smtp/email',
}));
