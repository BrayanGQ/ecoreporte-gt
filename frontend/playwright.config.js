// Pruebas de extremo a extremo (Playwright, solo Chromium): npm run test:e2e
// - Levanta su propio backend contra la base de PRUEBAS (backend/scripts/servidor-pruebas.js,
//   ecoreporte_test, sin envío de correos) en el puerto 3100 y el frontend local (Vite) en el 5180,
//   con el proxy /api apuntando a ese backend. Requiere la base preparada con `npm run test:bd`.
// - Usa los datos ficticios de la demostración; lo que crean las pruebas lleva la marca
//   [PRUEBA AUTOMATIZADA] y se borra antes y después de la ejecución (e2e/limpieza.js).
// - Reportes, capturas y trazas se guardan FUERA del repositorio: en la carpeta de la variable
//   QA_RESULTADOS o, si no está, en Documentos/QA-EcoReporte-resultados/e2e del usuario.
import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

const RESULTADOS = path.join(
  process.env.QA_RESULTADOS || path.join(os.homedir(), 'Documents', 'QA-EcoReporte-resultados'),
  'e2e'
);
const PUERTO_API = 3100;
const PUERTO_WEB = 5180;

export default defineConfig({
  testDir: './e2e',
  // Comparten la base de pruebas: un caso a la vez.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: path.join(RESULTADOS, 'artefactos'),
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(RESULTADOS, 'reporte-html'), open: 'never' }],
    ['json', { outputFile: path.join(RESULTADOS, 'resultados.json') }],
  ],
  globalSetup: './e2e/limpieza.js',
  globalTeardown: './e2e/limpieza.js',
  use: {
    baseURL: `http://localhost:${PUERTO_WEB}`,
    screenshot: 'on',
    trace: 'retain-on-failure',
    locale: 'es-GT',
    timezoneId: 'America/Guatemala',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'node ../backend/scripts/servidor-pruebas.js',
      url: `http://localhost:${PUERTO_API}/api/salud`,
      env: { PORT: String(PUERTO_API) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${PUERTO_WEB} --strictPort`,
      url: `http://localhost:${PUERTO_WEB}`,
      env: { API_URL: `http://localhost:${PUERTO_API}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
