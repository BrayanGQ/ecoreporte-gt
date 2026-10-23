// Pruebas de integración: avisos por correo del flujo de reportes.
// services/correo.js está mockeado en todas las pruebas (tests/setup/mock-correo.js): aquí se
// verifica a quién y con qué contenido se llamaría a enviarCorreo, sin tocar Brevo. Al final,
// pruebas unitarias del servicio real (con fetch mockeado).
const { enviarCorreo } = require('../src/services/correo');
const {
  api, bearer, puntos, uno, query, idUsuario, idMunicipalidad, estadoDe, USUARIOS, MARCA, FOTO, CORREO_PRUEBA,
} = require('./helpers');

let P;
let idGuatemala;
let idCuadrillaA;
let idCuadrillaB;
let coordinadoresGuatemala; // correos del personal_municipal activo de Guatemala

beforeAll(async () => {
  P = await puntos();
  idGuatemala = await idMunicipalidad('Municipalidad de Guatemala');
  idCuadrillaA = await idUsuario(USUARIOS.cuadrillaA);
  idCuadrillaB = await idUsuario(USUARIOS.cuadrillaB);

  // Un coordinador INACTIVO de Guatemala: no debe recibir avisos.
  await query(
    `INSERT INTO usuario (nombre_completo, correo, password_hash, estado, id_rol, id_municipalidad)
     SELECT 'Coordinador inactivo de prueba', $1, 'sin-acceso', FALSE, id_rol, $2
     FROM rol WHERE nombre_rol = 'personal_municipal'`,
    [CORREO_PRUEBA('coordinador.inactivo'), idGuatemala]
  );
  coordinadoresGuatemala = (await query(
    `SELECT u.correo FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
     WHERE r.nombre_rol = 'personal_municipal' AND u.estado = TRUE AND u.id_municipalidad = $1
     ORDER BY u.id_usuario`, [idGuatemala]
  )).rows.map((r) => r.correo);
});

beforeEach(() => {
  enviarCorreo.mockReset();
  enviarCorreo.mockResolvedValue({ enviado: true, messageId: 'prueba' });
});

// Reporte en Guatemala; con `ciudadano` lo registra con su sesión, sin él es anónimo.
async function reportar(descripcion, ciudadano) {
  const peticion = api().post('/api/reportes');
  if (ciudadano) peticion.set(await bearer(ciudadano));
  return peticion.send({
    id_tipo_incidencia: 1,
    latitud: P.guatemala.lat,
    longitud: P.guatemala.lng,
    descripcion: `${MARCA} ${descripcion}`,
  });
}

const accion = async (idReporte, nombre, correo, cuerpo = {}) =>
  api().post(`/api/reportes/${idReporte}/${nombre}`).set(await bearer(correo)).send(cuerpo);

const correos = () => enviarCorreo.mock.calls.map(([c]) => c);
const para = (correo) => correos().filter((c) => c.para === correo);

// Un aviso debe traer asunto, HTML y texto plano.
function esperarCorreoCompleto(c) {
  expect(c.asunto).toEqual(expect.any(String));
  expect(c.html).toMatch(/^<!DOCTYPE html>/);
  expect(c.texto).toEqual(expect.any(String));
}

describe('Correos al registrar un reporte', () => {
  test('CP-43 Ciudadano con cuenta: le llega su código con el enlace de consulta y a los coordinadores activos, el enlace al reporte', async () => {
    const res = await reportar('aviso al registrar', USUARIOS.ciudadano);
    expect(res.status).toBe(201);
    const { codigo_seguimiento: codigo, id_reporte: id } = res.body;

    expect(correos().map((c) => c.para).sort()).toEqual([USUARIOS.ciudadano, ...coordinadoresGuatemala].sort());

    const [alCiudadano] = para(USUARIOS.ciudadano);
    esperarCorreoCompleto(alCiudadano);
    expect(alCiudadano.asunto).toContain(codigo);
    expect(alCiudadano.html).toContain(`/portal/consultar?codigo=${codigo}`);
    expect(alCiudadano.texto).toContain(`/portal/consultar?codigo=${codigo}`);

    for (const coordinador of coordinadoresGuatemala) {
      const [aviso] = para(coordinador);
      esperarCorreoCompleto(aviso);
      expect(aviso.asunto).toBe(`Nuevo reporte ${codigo} en Municipalidad de Guatemala`);
      expect(aviso.html).toContain(`/municipal/panel/reporte/${id}`);
    }
  });

  test('CP-44 Reporte anónimo: no hay correo para ningún ciudadano, solo para los coordinadores', async () => {
    const res = await reportar('anónimo sin aviso al ciudadano');
    expect(res.status).toBe(201);

    expect(correos().map((c) => c.para).sort()).toEqual([...coordinadoresGuatemala].sort());
    expect(correos().every((c) => c.html.includes('Reporte anónimo'))).toBe(true);
  });

  test('CP-45 El texto que escribe el usuario se escapa en el HTML', async () => {
    const res = await reportar('<script>alert("x")</script> & <b>basura</b>', USUARIOS.ciudadano);
    expect(res.status).toBe(201);

    const [aviso] = para(coordinadoresGuatemala[0]);
    expect(aviso.html).not.toContain('<script>');
    expect(aviso.html).not.toContain('<b>basura</b>');
    expect(aviso.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;basura&lt;/b&gt;');
    // El texto plano conserva lo que escribió el usuario.
    expect(aviso.texto).toContain('<script>alert("x")</script> & <b>basura</b>');
  });
});

describe('Correos en el flujo de estados', () => {
  let id;
  let codigo;

  test('CP-46 Asignar: la cuadrilla recibe tipo, descripción, municipalidad, "Cómo llegar" y el enlace al reporte; el ciudadano, el estado nuevo', async () => {
    const creado = await reportar('flujo con correos', USUARIOS.ciudadano);
    ({ id_reporte: id, codigo_seguimiento: codigo } = creado.body);
    const r = await uno('SELECT latitud, longitud FROM reporte WHERE id_reporte = $1', [id]);
    enviarCorreo.mockClear();

    const res = await accion(id, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: idCuadrillaA });
    expect(res.status).toBe(200);
    expect(correos().map((c) => c.para).sort()).toEqual([USUARIOS.ciudadano, USUARIOS.cuadrillaA].sort());

    const [aCuadrilla] = para(USUARIOS.cuadrillaA);
    esperarCorreoCompleto(aCuadrilla);
    expect(aCuadrilla.asunto).toBe(`Te asignaron el reporte ${codigo}`);
    expect(aCuadrilla.html).toContain('flujo con correos');
    expect(aCuadrilla.html).toContain('Municipalidad de Guatemala');
    expect(aCuadrilla.html).toContain(
      `https://www.google.com/maps/dir/?api=1&amp;destination=${Number(r.latitud)},${Number(r.longitud)}`
    );
    expect(aCuadrilla.html).toContain(`/municipal/panel/reporte/${id}`);
    expect(aCuadrilla.texto).toContain(`https://www.google.com/maps/dir/?api=1&destination=${Number(r.latitud)},${Number(r.longitud)}`);

    const [alCiudadano] = para(USUARIOS.ciudadano);
    expect(alCiudadano.asunto).toBe(`Tu reporte ${codigo} cambió a: Asignado`);
    expect(alCiudadano.html).toContain(`/portal/consultar?codigo=${codigo}`);
  });

  test('CP-47 Reasignar: el encargado nuevo recibe el aviso; el ciudadano no (el estado no cambia)', async () => {
    const res = await accion(id, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: idCuadrillaB });
    expect(res.status).toBe(200);

    expect(correos().map((c) => c.para)).toEqual([USUARIOS.cuadrillaB]);
    expect(correos()[0].asunto).toBe(`Te reasignaron el reporte ${codigo}`);
  });

  test('CP-48 Iniciar y resolver: el ciudadano recibe "En atención" y "Resuelto"', async () => {
    expect((await accion(id, 'iniciar', USUARIOS.cuadrillaB)).status).toBe(200);
    expect((await accion(id, 'resolver', USUARIOS.cuadrillaB, { evidencias: [FOTO] })).status).toBe(200);

    expect(correos().map((c) => [c.para, c.asunto])).toEqual([
      [USUARIOS.ciudadano, `Tu reporte ${codigo} cambió a: En atención`],
      [USUARIOS.ciudadano, `Tu reporte ${codigo} cambió a: Resuelto`],
    ]);
    correos().forEach(esperarCorreoCompleto);
  });

  test('CP-49 Descartar: el ciudadano recibe el estado nuevo con el motivo (escapado)', async () => {
    const creado = await reportar('para descartar con correo', USUARIOS.ciudadano);
    const { id_reporte: idD, codigo_seguimiento: codigoD } = creado.body;
    enviarCorreo.mockClear();

    const res = await accion(idD, 'descartar', USUARIOS.coordGuatemala, { motivo: 'Duplicado de <ER-2026-0001>' });
    expect(res.status).toBe(200);

    expect(correos().map((c) => c.para)).toEqual([USUARIOS.ciudadano]);
    const [aviso] = correos();
    expect(aviso.asunto).toBe(`Tu reporte ${codigoD} cambió a: Descartado`);
    expect(aviso.html).toContain('Duplicado de &lt;ER-2026-0001&gt;');
    expect(aviso.texto).toContain('Motivo: Duplicado de <ER-2026-0001>');
  });

  test('CP-50 Reporte anónimo en el flujo: solo la cuadrilla recibe correo; descartar uno anónimo no envía nada', async () => {
    const asignado = (await reportar('anónimo asignado')).body.id_reporte;
    const descartado = (await reportar('anónimo descartado')).body.id_reporte;
    enviarCorreo.mockClear();

    expect((await accion(asignado, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: idCuadrillaA })).status).toBe(200);
    expect(correos().map((c) => c.para)).toEqual([USUARIOS.cuadrillaA]);

    enviarCorreo.mockClear();
    expect((await accion(asignado, 'iniciar', USUARIOS.cuadrillaA)).status).toBe(200);
    expect((await accion(descartado, 'descartar', USUARIOS.coordGuatemala, { motivo: 'Fuera de lugar' })).status).toBe(200);
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  test('CP-51 Una acción rechazada no envía correos', async () => {
    const idR = (await reportar('acción rechazada', USUARIOS.ciudadano)).body.id_reporte;
    enviarCorreo.mockClear();

    const res = await accion(idR, 'descartar', USUARIOS.coordGuatemala, { motivo: '' });
    expect(res.status).toBe(400);
    expect(enviarCorreo).not.toHaveBeenCalled();
  });
});

describe('Fallas de Brevo', () => {
  test('CP-52 Un error de Brevo no cambia la respuesta de la API: se registra y el reporte sigue su curso', async () => {
    const consola = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      enviarCorreo.mockRejectedValue(new Error('Brevo respondió 500: error simulado'));

      const res = await reportar('brevo falla al registrar', USUARIOS.ciudadano);
      expect(res.status).toBe(201);
      expect(Object.keys(res.body).sort()).toEqual(['codigo_seguimiento', 'id_reporte', 'mensaje', 'municipalidad']);
      expect(res.body.mensaje).toBe('Reporte registrado correctamente.');

      // También si enviarCorreo falla de forma síncrona.
      enviarCorreo.mockImplementation(() => { throw new Error('falla síncrona simulada'); });
      const asignado = await accion(res.body.id_reporte, 'asignar', USUARIOS.coordGuatemala, { id_usuario_asignado: idCuadrillaA });
      expect(asignado.status).toBe(200);
      expect(asignado.body).toEqual({ mensaje: 'Reporte actualizado correctamente.', estado: 'asignado' });
      expect(await estadoDe(res.body.id_reporte)).toBe('asignado');

      // Las promesas rechazadas se registran en un tick posterior.
      await new Promise((r) => setImmediate(r));
      const registrados = consola.mock.calls.map((args) => args.join(' '));
      expect(registrados.some((l) => l.includes('Falló el envío') && l.includes('error simulado'))).toBe(true);
      expect(registrados.some((l) => l.includes('Falló el envío') && l.includes('falla síncrona simulada'))).toBe(true);
    } finally {
      consola.mockRestore();
    }
  });
});

// Servicio real (services/correo.js) con fetch mockeado: nunca sale una petición a Brevo.
describe('Servicio de correo (Brevo)', () => {
  const { enviarCorreo: enviarReal, BREVO_URL } = jest.requireActual('../src/services/correo');
  const MENSAJE = { para: 'destino@ejemplo.com', nombre: 'Destino', asunto: 'Asunto', html: '<p>Hola</p>', texto: 'Hola' };
  const VARIABLES = ['NODE_ENV', 'BREVO_API_KEY', 'CORREO_REMITENTE', 'CORREO_REMITENTE_NOMBRE'];
  let original;
  let fetchOriginal;

  beforeEach(() => {
    original = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));
    fetchOriginal = global.fetch;
    global.fetch = jest.fn();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    for (const v of VARIABLES) {
      if (original[v] === undefined) delete process.env[v]; else process.env[v] = original[v];
    }
    global.fetch = fetchOriginal;
    console.log.mockRestore();
  });

  test('CP-53 Con NODE_ENV=test, sin BREVO_API_KEY o hacia una cuenta de demostración no se envía nada', async () => {
    process.env.NODE_ENV = 'test';
    process.env.BREVO_API_KEY = 'clave-de-prueba';
    process.env.CORREO_REMITENTE = 'remitente@prueba.test';
    expect(await enviarReal(MENSAJE)).toEqual({ enviado: false, motivo: 'NODE_ENV=test' });

    // Configurado, pero el destinatario es una cuenta demo (dominio que no es un buzón real).
    process.env.NODE_ENV = 'production';
    expect(await enviarReal({ ...MENSAJE, para: 'ana.morales@ecoreporte.gt' }))
      .toEqual({ enviado: false, motivo: 'cuenta de demostración (@ecoreporte.gt)' });

    delete process.env.BREVO_API_KEY;
    expect(await enviarReal(MENSAJE)).toEqual({ enviado: false, motivo: 'falta BREVO_API_KEY' });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('CP-54 Configurado: POST a la API de Brevo con el header api-key; un rechazo de Brevo lanza error', async () => {
    process.env.NODE_ENV = 'production';
    process.env.BREVO_API_KEY = 'clave-de-prueba';
    process.env.CORREO_REMITENTE = 'remitente@prueba.test';
    delete process.env.CORREO_REMITENTE_NOMBRE;
    global.fetch.mockResolvedValueOnce({ ok: true, status: 201, text: async () => '{"messageId":"<abc@brevo>"}' });

    expect(await enviarReal(MENSAJE)).toEqual({ enviado: true, messageId: '<abc@brevo>' });
    const [url, opciones] = global.fetch.mock.calls[0];
    expect(url).toBe(BREVO_URL);
    expect(BREVO_URL).toBe('https://api.brevo.com/v3/smtp/email');
    expect(opciones.method).toBe('POST');
    expect(opciones.headers['api-key']).toBe('clave-de-prueba');
    expect(JSON.parse(opciones.body)).toEqual({
      sender: { email: 'remitente@prueba.test', name: 'EcoReporte GT' },
      to: [{ email: 'destino@ejemplo.com', name: 'Destino' }],
      subject: 'Asunto',
      htmlContent: '<p>Hola</p>',
      textContent: 'Hola',
    });

    global.fetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => '{"message":"Key not found"}' });
    await expect(enviarReal(MENSAJE)).rejects.toThrow('Brevo respondió 401');
  });
});
