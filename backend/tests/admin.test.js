// Pruebas de integración: administración (usuarios, catálogos y municipalidades).
const {
  api, bearer, puntos, crearReporte, uno, idMunicipalidad, USUARIOS, MARCA, SIN_COBERTURA,
  CORREO_PRUEBA,
} = require('./helpers');

let P;
let idMixco;
let mixcoActivaAlInicio;

beforeAll(async () => {
  P = await puntos();
  idMixco = await idMunicipalidad('Municipalidad de Mixco');
  mixcoActivaAlInicio = (await uno('SELECT estado_activo FROM municipalidad WHERE id_municipalidad = $1', [idMixco])).estado_activo;
});

describe('Administración', () => {
  test('CP-32 El admin crea un usuario, lo desactiva y ese usuario ya no puede iniciar sesión', async () => {
    const admin = await bearer(USUARIOS.admin);
    const roles = await api().get('/api/admin/roles').set(admin);
    const rolCuadrilla = roles.body.find((r) => r.nombre_rol === 'encargado_cuadrilla');
    const correo = CORREO_PRUEBA('cuadrilla');

    const creado = await api().post('/api/admin/usuarios').set(admin).send({
      nombre_completo: 'Cuadrilla de Prueba', correo, password: 'clave123',
      id_rol: rolCuadrilla.id_rol, id_municipalidad: await idMunicipalidad('Municipalidad de Guatemala'),
    });
    expect(creado.status).toBe(201);

    const loginAntes = await api().post('/api/auth/login').send({ correo, password: 'clave123' });
    expect(loginAntes.status).toBe(200);
    expect(loginAntes.body.usuario.rol).toBe('encargado_cuadrilla');

    const desactivado = await api().put(`/api/admin/usuarios/${creado.body.usuario.id_usuario}/estado`)
      .set(admin).send({ estado: false });
    expect(desactivado.status).toBe(200);
    expect(desactivado.body.usuario.estado).toBe(false);

    const loginDespues = await api().post('/api/auth/login').send({ correo, password: 'clave123' });
    expect(loginDespues.status).toBe(403);
    expect(loginDespues.body).not.toHaveProperty('token');
    expect(loginDespues.body.error).toBe('La cuenta se encuentra desactivada.');
  });

  test('CP-33 El admin crea y edita un tipo de incidencia', async () => {
    const admin = await bearer(USUARIOS.admin);
    const creado = await api().post('/api/admin/tipos-incidencia').set(admin)
      .send({ nombre_tipo: `${MARCA} Llantas abandonadas`, descripcion: 'Creado por la prueba' });
    expect(creado.status).toBe(201);
    const id = creado.body.tipo.id_tipo_incidencia;

    const editado = await api().put(`/api/admin/tipos-incidencia/${id}`).set(admin)
      .send({ nombre_tipo: `${MARCA} Llantas y neumáticos`, descripcion: 'Editado por la prueba' });
    expect(editado.status).toBe(200);

    const enBd = await uno('SELECT nombre_tipo, descripcion FROM tipo_incidencia WHERE id_tipo_incidencia = $1', [id]);
    expect(enBd).toEqual({ nombre_tipo: `${MARCA} Llantas y neumáticos`, descripcion: 'Editado por la prueba' });

    // Aparece en el catálogo público que usa el formulario de reporte.
    const catalogo = await api().get('/api/catalogos/tipos');
    expect(catalogo.body.map((t) => t.id_tipo_incidencia)).toContain(id);
  });

  test('CP-34 Desactivar una municipalidad rechaza reportes en su zona; reactivarla los permite', async () => {
    const admin = await bearer(USUARIOS.admin);
    try {
      const desactivar = await api().put(`/api/admin/municipalidades/${idMixco}/estado`).set(admin).send({ estado_activo: false });
      expect(desactivar.status).toBe(200);
      const rechazado = await crearReporte(P.mixco, { descripcion: 'Mixco inactiva' });
      expect(rechazado.status).toBe(400);
      expect(rechazado.body.error).toBe(SIN_COBERTURA);

      const activar = await api().put(`/api/admin/municipalidades/${idMixco}/estado`).set(admin).send({ estado_activo: true });
      expect(activar.status).toBe(200);
      const aceptado = await crearReporte(P.mixco, { descripcion: 'Mixco activa' });
      expect(aceptado.status).toBe(201);
      expect(aceptado.body.municipalidad.nombre).toBe('Municipalidad de Mixco');
    } finally {
      // Deja Mixco como estaba aunque la prueba falle a mitad de camino.
      await uno('UPDATE municipalidad SET estado_activo = $1 WHERE id_municipalidad = $2 RETURNING 1',
        [mixcoActivaAlInicio, idMixco]);
    }
  });

  test('CP-35 Un usuario que no es admin recibe 403 en las rutas /api/admin', async () => {
    const rutas = [
      ['get', '/api/admin/usuarios'],
      ['get', '/api/admin/roles'],
      ['get', '/api/admin/municipalidades'],
      ['post', '/api/admin/tipos-incidencia'],
      ['put', `/api/admin/municipalidades/${idMixco}/estado`],
    ];
    for (const correo of [USUARIOS.coordGuatemala, USUARIOS.cuadrillaA, USUARIOS.ciudadano]) {
      const auth = await bearer(correo);
      for (const [metodo, ruta] of rutas) {
        const res = await api()[metodo](ruta).set(auth).send({ estado_activo: false, nombre_tipo: 'x' });
        expect([correo, ruta, res.status]).toEqual([correo, ruta, 403]);
      }
    }
    // Ningún intento cambió el estado de Mixco.
    const mixco = await uno('SELECT estado_activo FROM municipalidad WHERE id_municipalidad = $1', [idMixco]);
    expect(mixco.estado_activo).toBe(mixcoActivaAlInicio);
  });
});

describe('Restablecer contraseña (administrador)', () => {
  // Cuenta de ciudadano creada por la prueba (se borra al terminar: correo prueba.*@prueba.test).
  async function ciudadanoDePrueba(password) {
    const correo = CORREO_PRUEBA('restablecer');
    const res = await api().post('/api/auth/registro').send({ nombre_completo: 'Ciudadano Olvidadizo', correo, password });
    expect(res.status).toBe(201);
    return correo;
  }
  const login = (correo, password) => api().post('/api/auth/login').send({ correo, password });

  test('CP-38 El admin restablece la contraseña de un ciudadano buscándolo por correo', async () => {
    const correo = await ciudadanoDePrueba('original123');

    const res = await api().post('/api/admin/usuarios/restablecer-password').set(await bearer(USUARIOS.admin))
      .send({ correo: correo.toUpperCase(), password: 'Temporal456' }); // sin distinguir mayúsculas
    expect(res.status).toBe(200);
    expect(res.body.usuario).toMatchObject({ correo, nombre_rol: 'ciudadano' });
    expect(res.body.usuario).not.toHaveProperty('password_hash');

    expect((await login(correo, 'original123')).status).toBe(401);
    expect((await login(correo, 'Temporal456')).status).toBe(200);
  });

  test('CP-39 Restablecer contraseña: solo el admin, con correo existente y contraseña válida', async () => {
    const correo = await ciudadanoDePrueba('original123');
    const ruta = '/api/admin/usuarios/restablecer-password';

    const coordinador = await api().post(ruta).set(await bearer(USUARIOS.coordGuatemala)).send({ correo, password: 'Intruso123' });
    const sinToken = await api().post(ruta).send({ correo, password: 'Intruso123' });
    const inexistente = await api().post(ruta).set(await bearer(USUARIOS.admin)).send({ correo: 'nadie@prueba.test', password: 'Temporal456' });
    const corta = await api().post(ruta).set(await bearer(USUARIOS.admin)).send({ correo, password: '123' });
    const sinCorreo = await api().post(ruta).set(await bearer(USUARIOS.admin)).send({ password: 'Temporal456' });

    expect(coordinador.status).toBe(403);
    expect(sinToken.status).toBe(401);
    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error).toBe('No existe una cuenta con ese correo.');
    expect(corta.status).toBe(400);
    expect(sinCorreo.status).toBe(400);
    // Ningún intento cambió la contraseña.
    expect((await login(correo, 'original123')).status).toBe(200);
  });
});
