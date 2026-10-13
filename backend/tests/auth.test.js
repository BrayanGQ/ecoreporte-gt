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
