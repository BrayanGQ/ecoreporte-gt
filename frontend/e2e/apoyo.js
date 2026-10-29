// Utilidades de las pruebas E2E: usuarios ficticios de la demostración, inicio de sesión por la
// interfaz, preparación de datos por la API del backend de pruebas y una foto de ejemplo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';

export const API = 'http://localhost:3100/api';
export const MARCA = '[PRUEBA AUTOMATIZADA]';

// Contraseña de los usuarios demo en la base de pruebas: la DEMO_PASSWORD de backend/.env.test
// o, si no la define, password123 (la misma regla que backend/scripts/entorno-pruebas.js).
function passwordDemo() {
  const archivo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend', '.env.test');
  const linea = fs.existsSync(archivo)
    ? fs.readFileSync(archivo, 'utf8').split(/\r?\n/).find((l) => /^\s*DEMO_PASSWORD\s*=/.test(l))
    : null;
  const valor = linea ? linea.split('=').slice(1).join('=').trim() : '';
  return valor || 'password123';
}
export const PASSWORD = passwordDemo();

export const USUARIOS = {
  ciudadana: 'maria.garcia@ecoreporte.gt',
  coordGuatemala: 'ana.morales@ecoreporte.gt',
  coordMixco: 'mario.castillo@ecoreporte.gt',
  cuadrilla: 'carlos.perez@ecoreporte.gt', // Carlos Enrique Pérez, Municipalidad de Guatemala
  admin: 'admin@ecoreporte.gt',
};

// Nombres de los ciudadanos de la demostración (backend/src/demo.js): no deben aparecer en los
// archivos exportados.
export const CIUDADANOS_DEMO = [
  'María José García', 'Juan Pablo Rodríguez', 'Sofía Alejandra Méndez', 'Diego Andrés Orellana',
  'Lucía Fernanda Cifuentes',
];

// Carpeta de resultados de QA (fuera del repositorio), la misma que usa playwright.config.js.
export const RESULTADOS_QA = process.env.QA_RESULTADOS
  || path.join(os.homedir(), 'Documents', 'QA-EcoReporte-resultados');

// Punto dentro del límite de la Municipalidad de Guatemala (zona 1).
export const GUATEMALA = { latitude: 14.6349, longitude: -90.5069 };
// Punto dentro del límite de la Municipalidad de Mixco (cabecera; el mismo de la demostración).
export const MIXCO = { latitude: 14.6311, longitude: -90.6072 };

// PNG de 1x1 válido, como archivo para los <input type="file">.
export const FOTO = {
  name: 'evidencia-e2e.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  ),
};

// Inicia sesión por el formulario del portal indicado ('ciudadano' o 'municipal').
export async function iniciarSesion(page, portal, correo, password = PASSWORD) {
  await page.goto(portal === 'municipal' ? '/municipal/login' : '/portal/login');
  await page.locator('input[type="email"]').fill(correo);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

// --- Preparación por la API del backend de pruebas ---
export async function token(request, correo) {
  const res = await request.post(`${API}/auth/login`, { data: { correo, password: PASSWORD } });
  expect(res.status(), `login de ${correo}`).toBe(200);
  return (await res.json()).token;
}

// Por defecto, reporte anónimo en Guatemala; con { punto, tokenCiudadano } se ubica en otro
// municipio y queda a nombre de esa cuenta.
export async function crearReporteApi(request, descripcion, { punto = GUATEMALA, tokenCiudadano } = {}) {
  const res = await request.post(`${API}/reportes`, {
    headers: tokenCiudadano ? { Authorization: `Bearer ${tokenCiudadano}` } : {},
    data: {
      id_tipo_incidencia: 1, latitud: punto.latitude, longitud: punto.longitude,
      descripcion: `${MARCA} ${descripcion}`,
    },
  });
  expect(res.status()).toBe(201);
  return res.json(); // { id_reporte, codigo_seguimiento, ... }
}

export async function consultarApi(request, codigo) {
  const res = await request.get(`${API}/reportes/consulta/${codigo}`);
  expect(res.status()).toBe(200);
  return res.json();
}
