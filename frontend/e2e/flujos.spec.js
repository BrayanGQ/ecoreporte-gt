// Pruebas de extremo a extremo de los flujos principales (portal ciudadano y portal municipal).
import { test, expect } from '@playwright/test';
import {
  API, MARCA, USUARIOS, GUATEMALA, FOTO, iniciarSesion, token, crearReporteApi, consultarApi,
} from './apoyo.js';

test.describe('Portal ciudadano', () => {
  test.use({ geolocation: GUATEMALA, permissions: ['geolocation'] });

  test('CP-107 El ciudadano reporta en el mapa con una foto y obtiene su código de seguimiento', async ({ page, request }) => {
    await iniciarSesion(page, 'ciudadano', USUARIOS.ciudadana);
    await expect(page).toHaveURL(/\/portal$/);

    const descripcion = `${MARCA} E2E basura en la banqueta`;
    await page.locator('#tipo-incidencia').selectOption({ index: 1 });
    await page.getByPlaceholder('Describí lo que observaste...').fill(descripcion);
    await page.locator('input[type="file"]').setInputFiles(FOTO);
    await expect(page.locator('.miniatura img')).toHaveCount(1);

    // Ubicación: clic en el mapa (centrado en la geolocalización, dentro de la Ciudad de Guatemala).
    await page.locator('#map').click();
    await expect(page.locator('.cobertura')).toContainText('Municipalidad de Guatemala');

    await page.getByRole('button', { name: 'Enviar reporte' }).click();
    const aviso = page.locator('.alert.ok');
    await expect(aviso).toContainText('Tu código de seguimiento es');
    const codigo = (await aviso.locator('strong').innerText()).trim();
    expect(codigo).toMatch(/^ER-\d{4}-\d{4,}$/);

    // El reporte quedó registrado con la foto como evidencia ciudadana, a nombre de la ciudadana.
    const admin = await token(request, 'admin@ecoreporte.gt');
    const consulta = await consultarApi(request, codigo);
    const detalle = await (await request.get(`${API}/reportes/${consulta.id_reporte}/detalle`, {
      headers: { Authorization: `Bearer ${admin}` },
    })).json();
    expect(detalle.descripcion).toBe(descripcion);
    expect(detalle.municipalidad).toBe('Municipalidad de Guatemala');
    expect(detalle.evidencias.map((e) => e.tipo_evidencia)).toEqual(['ciudadana']);
    expect(detalle.reportado_por).toBe('María José García');
  });

  test('CP-108 Consulta pública por código, sin sesión: muestra estado, municipalidad e historial', async ({ page, request }) => {
    const reporte = await crearReporteApi(request, 'E2E consulta pública');

    await page.goto('/portal/consultar');
    await expect(page.getByRole('link', { name: /Mis reportes/ })).toHaveCount(0); // sin sesión
    await page.getByPlaceholder('ER-2026-0001').fill(reporte.codigo_seguimiento);
    await page.getByRole('button', { name: 'Consultar' }).click();

    const resultado = page.locator('.resultado');
    await expect(resultado.locator('.badge')).toHaveText('recibido');
    await expect(resultado).toContainText('Municipalidad de Guatemala');
    await expect(resultado.locator('.timeline li')).toHaveCount(1);
    await expect(resultado.locator('.timeline li')).toContainText('Reporte recibido');
  });
});

test.describe('Portal municipal', () => {
  test('CP-109 El coordinador de Mixco solo ve los reportes de su municipalidad', async ({ page, request }) => {
    const municipalidades = await (await request.get(`${API}/catalogos/municipalidades`)).json();
    const idDe = (nombre) => municipalidades.find((m) => m.nombre === nombre).id_municipalidad;
    const codigosDe = async (nombre) => (await (await request.get(`${API}/reportes`, {
      params: { municipalidad: idDe(nombre) },
    })).json()).map((r) => r.codigo_seguimiento).sort();
    const deMixco = await codigosDe('Municipalidad de Mixco');
    const deGuatemala = await codigosDe('Municipalidad de Guatemala');

    await iniciarSesion(page, 'municipal', USUARIOS.coordMixco);
    await expect(page).toHaveURL(/\/municipal\/panel$/);
    const filas = page.locator('table.dash-table tbody tr');
    await expect(filas.first()).toBeVisible();

    const visibles = (await filas.locator('td:first-child').allInnerTexts()).map((t) => t.trim()).sort();
    expect(visibles).toEqual(deMixco);
    expect(visibles.filter((c) => deGuatemala.includes(c))).toEqual([]);
  });

  test('CP-110 La cuadrilla inicia la atención y resuelve con foto; sin foto no puede resolver', async ({ page, request }) => {
    // Preparación por la API: reporte en Guatemala asignado a la cuadrilla de Carlos Pérez.
    const reporte = await crearReporteApi(request, 'E2E atención de la cuadrilla');
    const coordinadora = { Authorization: `Bearer ${await token(request, USUARIOS.coordGuatemala)}` };
    const asignables = await (await request.get(`${API}/reportes/${reporte.id_reporte}/asignables`, { headers: coordinadora })).json();
    const carlos = asignables.find((u) => u.nombre_completo === 'Carlos Enrique Pérez');
    const asignar = await request.post(`${API}/reportes/${reporte.id_reporte}/asignar`, {
      headers: coordinadora, data: { id_usuario_asignado: carlos.id_usuario },
    });
    expect(asignar.status()).toBe(200);

    await iniciarSesion(page, 'municipal', USUARIOS.cuadrilla);
    const tarjeta = page.locator('li.item', { hasText: reporte.codigo_seguimiento });
    await tarjeta.getByRole('button', { name: /Atender/ }).click();
    await expect(page).toHaveURL(new RegExp(`/municipal/panel/reporte/${reporte.id_reporte}$`));

    await page.getByRole('button', { name: 'Iniciar atención' }).click();
    await expect(page.locator('.alert.ok')).toContainText('Atención iniciada');
    expect((await consultarApi(request, reporte.codigo_seguimiento)).nombre_estado).toBe('en_atencion');

    // Sin foto: el botón de resolver está deshabilitado y el reporte sigue en atención.
    const resolver = page.getByRole('button', { name: 'Marcar como resuelto' });
    await expect(resolver).toBeDisabled();
    await expect(page.getByText('Necesitás al menos una foto para resolver.')).toBeVisible();
    expect((await consultarApi(request, reporte.codigo_seguimiento)).nombre_estado).toBe('en_atencion');

    // Con foto: se resuelve.
    await page.locator('input[type="file"][multiple]').setInputFiles(FOTO);
    await expect(resolver).toBeEnabled();
    await resolver.click();
    await expect(page.locator('.alert.ok')).toContainText('Reporte marcado como resuelto');
    expect((await consultarApi(request, reporte.codigo_seguimiento)).nombre_estado).toBe('resuelto');
  });

  test('CP-111 Un login con contraseña incorrecta muestra el error y no inicia sesión', async ({ page }) => {
    for (const portal of ['municipal', 'ciudadano']) {
      await iniciarSesion(page, portal, USUARIOS.coordGuatemala, 'contraseña-incorrecta');
      await expect(page.locator('.alert.error')).toContainText('Correo o contraseña incorrectos.');
      await expect(page).toHaveURL(portal === 'municipal' ? /\/municipal\/login$/ : /\/portal\/login$/);
      expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
    }
  });
});
