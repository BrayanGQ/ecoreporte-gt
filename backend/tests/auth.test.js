// Pruebas de integración: autenticación (login, registro y rutas protegidas).
const { api, uno, USUARIOS, PASSWORD, CORREO_PRUEBA } = require('./helpers');

// La limpieza de datos de prueba y el cierre del pool están en tests/setup/cerrar-pool.js.

describe('Autenticación', () => {
  test('CP-01 Login correcto devuelve token y rol', async () => {
    const res = await api().post('/api/auth/login').send({ correo: USUARIOS.coordGuatemala, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.split('.')).toHaveLength(3); // JWT: cabecera.carga.firma
    expect(res.body.usuario).toMatchObject({ correo: USUARIOS.coordGuatemala, rol: 'personal_municipal' });
    expect(res.body.usuario).not.toHaveProperty('password_hash');
  });

  test('CP-02 Login con contraseña incorrecta es rechazado', async () => {
    const res = await api().post('/api/auth/login').send({ correo: USUARIOS.coordGuatemala, password: 'incorrecta' });

    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('token');
    expect(res.body.error).toBe('Correo o contraseña incorrectos.');
  });

  test('CP-03 Registro de ciudadano nuevo y luego login con esa cuenta', async () => {
    const correo = CORREO_PRUEBA('registro');
    const registro = await api().post('/api/auth/registro')
      .send({ nombre_completo: 'Ciudadano de Prueba', correo, password: 'clave123' });

    expect(registro.status).toBe(201);
    expect(registro.body.usuario).toMatchObject({ correo, nombre_completo: 'Ciudadano de Prueba' });
    const enBd = await uno(
      'SELECT r.nombre_rol, u.id_municipalidad FROM usuario u JOIN rol r USING (id_rol) WHERE u.correo = $1', [correo]
    );
    expect(enBd).toEqual({ nombre_rol: 'ciudadano', id_municipalidad: null });

    const login = await api().post('/api/auth/login').send({ correo, password: 'clave123' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.usuario.rol).toBe('ciudadano');
  });

  test('CP-04 Ruta protegida sin token responde 401', async () => {
    const sinToken = await api().get('/api/reportes/mis-reportes');
    expect(sinToken.status).toBe(401);
    expect(sinToken.body.error).toBe('Token no proporcionado.');

    const tokenInvalido = await api().get('/api/reportes/mis-reportes').set('Authorization', 'Bearer no-es-un-jwt');
    expect(tokenInvalido.status).toBe(401);
  });
});

describe('Recuperación de contraseña', () => {
  const recuperar = (correo) => api().post('/api/auth/recuperar').send({ correo });

  test('CP-40 En producción no se entrega el token de recuperación y la respuesta no revela si el correo existe', async () => {
    const entornoOriginal = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const existe = await recuperar(USUARIOS.admin);
      const noExiste = await recuperar('nadie@prueba.test');

      for (const res of [existe, noExiste]) {
        expect(res.status).toBe(200);
        expect(res.body).not.toHaveProperty('token_recuperacion');
      }
      expect(existe.body).toEqual(noExiste.body);
      expect(existe.body.mensaje).toMatch(/administrador de EcoReporte GT/);

      // Fuera de producción (desarrollo) se mantiene el flujo con token.
      process.env.NODE_ENV = 'development';
      const desarrollo = await recuperar(USUARIOS.admin);
      expect(desarrollo.status).toBe(200);
      expect(typeof desarrollo.body.token_recuperacion).toBe('string');
    } finally {
      process.env.NODE_ENV = entornoOriginal;
    }
  });
});

describe('Cambio de la contraseña propia', () => {
  const login = (correo, password) => api().post('/api/auth/login').send({ correo, password });
  // Cuenta creada por la prueba (se borra al terminar: correo prueba.*@prueba.test).
  async function cuentaDePrueba() {
    const correo = CORREO_PRUEBA('cambio');
    expect((await api().post('/api/auth/registro').send({ nombre_completo: 'Ciudadana de Prueba', correo, password: 'original123' })).status).toBe(201);
    const { token } = (await login(correo, 'original123')).body;
    return { correo, auth: { Authorization: `Bearer ${token}` } };
  }

  test('CP-41 Un usuario con sesión cambia su contraseña: la nueva funciona y la anterior no', async () => {
    const { correo, auth } = await cuentaDePrueba();
    const res = await api().put('/api/cuenta/password').set(auth)
      .send({ password_actual: 'original123', password_nueva: 'MiClaveNueva9' });

    expect(res.status).toBe(200);
    expect(res.body.mensaje).toBe('Contraseña actualizada correctamente.');
    expect((await login(correo, 'original123')).status).toBe(401);
    expect((await login(correo, 'MiClaveNueva9')).status).toBe(200);
  });

  test('CP-42 Cambio de contraseña rechazado: sin sesión, actual incorrecta, nueva inválida o igual a la actual', async () => {
    const { correo, auth } = await cuentaDePrueba();
    const cambiar = (cuerpo, cabeceras = auth) => api().put('/api/cuenta/password').set(cabeceras).send(cuerpo);

    const sinSesion = await cambiar({ password_actual: 'original123', password_nueva: 'MiClaveNueva9' }, {});
    const actualIncorrecta = await cambiar({ password_actual: 'equivocada', password_nueva: 'MiClaveNueva9' });
    const corta = await cambiar({ password_actual: 'original123', password_nueva: '123' });
    const igual = await cambiar({ password_actual: 'original123', password_nueva: 'original123' });
    const incompleto = await cambiar({ password_nueva: 'MiClaveNueva9' });

    expect(sinSesion.status).toBe(401);
    // 400 y no 401: una contraseña actual incorrecta no debe tratarse como sesión vencida.
    expect(actualIncorrecta.status).toBe(400);
    expect(actualIncorrecta.body.error).toBe('La contraseña actual no es correcta.');
    expect(corta.status).toBe(400);
    expect(igual.status).toBe(400);
    expect(incompleto.status).toBe(400);
    // La contraseña no cambió.
    expect((await login(correo, 'original123')).status).toBe(200);
  });
});
