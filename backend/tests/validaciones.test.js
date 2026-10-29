// Pruebas de regresión de los defectos D-06 a D-12, detectados el 29/10/2026 con pruebas negativas
// de robustez sobre la administración (cuentas de personal, restablecer contraseña, catálogos) y el
// cambio de la contraseña propia. Cada caso falla sobre la versión sin corregir y pasa con la corrección.
const {
  api, bearer, query, idMunicipalidad, USUARIOS, PASSWORD, MARCA, CORREO_PRUEBA,
} = require('./helpers');

// Algunos defectos dejaban la petición sin respuesta: se corta a los 5 s para que el caso falle
// con un mensaje claro en vez de agotar el tiempo de la prueba.
const LIMITE_MS = 5000;
function conLimite(peticion) {
  let temporizador;
  return Promise.race([
    peticion,
    new Promise((_, rechazar) => {
      temporizador = setTimeout(() => rechazar(new Error(`La API no respondió en ${LIMITE_MS / 1000} s`)), LIMITE_MS);
    }),
  ]).finally(() => clearTimeout(temporizador));
}

const SIN_FORMATO = `prueba.sinformato.${Date.now()}`;
let admin;
let idGuatemala;
let idRolPersonal;

beforeAll(async () => {
  admin = await bearer(USUARIOS.admin);
  idGuatemala = await idMunicipalidad('Municipalidad de Guatemala');
  idRolPersonal = (await query("SELECT id_rol FROM rol WHERE nombre_rol = 'personal_municipal'")).rows[0].id_rol;
});

const post = (url, cuerpo, cabeceras = admin) => conLimite(api().post(url).set(cabeceras).send(cuerpo));
const put = (url, cuerpo, cabeceras = admin) => conLimite(api().put(url).set(cabeceras).send(cuerpo));

const cuentaPersonal = (cambios = {}) => ({
  nombre_completo: 'Prueba personal',
  correo: CORREO_PRUEBA('personal'),
  password: 'clave123',
  id_municipalidad: idGuatemala,
  id_rol: idRolPersonal,
  ...cambios,
});

describe('Regresión de defectos de validación en administración y cuenta', () => {
  test('CP-74 (D-06) Crear cuenta de personal con un correo sin formato válido es rechazado con 400 y no crea la cuenta', async () => {
    try {
      const res = await post('/api/admin/usuarios', cuentaPersonal({ correo: SIN_FORMATO }));

      expect(res.status).toBe(400);
      expect((await query('SELECT 1 FROM usuario WHERE correo = $1', [SIN_FORMATO])).rows).toHaveLength(0);
    } finally {
      // Si el defecto reapareciera, la cuenta creada no sigue el patrón que borra la limpieza general.
      await query('DELETE FROM usuario WHERE correo = $1', [SIN_FORMATO]);
    }
  });

  test('CP-75 (D-07) Crear cuenta de personal con contraseña no textual, textos más largos que la columna o ids no numéricos responde 400, no 500', async () => {
    const casos = {
      'contraseña numérica': { password: 12345678 },
      'nombre de 121 caracteres': { nombre_completo: 'N'.repeat(121) },
      'correo de más de 150 caracteres': { correo: `prueba.${'x'.repeat(150)}@prueba.test` },
      'id_rol no numérico': { id_rol: 'abc' },
      'id_municipalidad no numérico': { id_municipalidad: 'abc' },
    };
    for (const [caso, cambios] of Object.entries(casos)) {
      const res = await post('/api/admin/usuarios', cuentaPersonal(cambios));
      expect({ caso, status: res.status }).toEqual({ caso, status: 400 });
    }
  });

  test('CP-76 (D-08) Un nombre o correo no textual en restablecer contraseña, tipos de incidencia o municipalidades responde 400 (antes: sin respuesta y caída del servidor)', async () => {
    const casos = [
      ['restablecer contraseña con correo numérico', () => post('/api/admin/usuarios/restablecer-password', { correo: 12345, password: 'clave123' })],
      ['tipo de incidencia con nombre numérico', () => post('/api/admin/tipos-incidencia', { nombre_tipo: 12345 })],
      ['editar tipo de incidencia con nombre numérico', () => put('/api/admin/tipos-incidencia/1', { nombre_tipo: 12345 })],
      ['municipalidad con nombre numérico', () => post('/api/admin/municipalidades', { nombre: 12345 })],
      ['editar municipalidad con nombre numérico', () => put(`/api/admin/municipalidades/${idGuatemala}`, { nombre: 12345 })],
    ];
    for (const [caso, peticion] of casos) {
      const res = await peticion();
      expect({ caso, status: res.status }).toEqual({ caso, status: 400 });
    }
  });

  test('CP-77 (D-09) Restablecer una contraseña con un valor no textual responde 400, no 500, y la contraseña no cambia', async () => {
    const res = await post('/api/admin/usuarios/restablecer-password', { correo: USUARIOS.ciudadano, password: 12345678 });

    expect(res.status).toBe(400);
    expect((await api().post('/api/auth/login').send({ correo: USUARIOS.ciudadano, password: PASSWORD })).status).toBe(200);
  });

  test('CP-78 (D-10) Cambiar la contraseña propia con la actual o la nueva no textual responde 400, no 500', async () => {
    const correo = CORREO_PRUEBA('cambio.notextual');
    await api().post('/api/auth/registro').send({ nombre_completo: 'Prueba cambio', correo, password: 'clave123' });
    const login = await api().post('/api/auth/login').send({ correo, password: 'clave123' });
    const sesion = { Authorization: `Bearer ${login.body.token}` };

    const nuevaNumerica = await put('/api/cuenta/password', { password_actual: 'clave123', password_nueva: 87654321 }, sesion);
    const actualNumerica = await put('/api/cuenta/password', { password_actual: 12345678, password_nueva: 'nueva123' }, sesion);

    expect(nuevaNumerica.status).toBe(400);
    expect(actualNumerica.status).toBe(400);
    expect((await api().post('/api/auth/login').send({ correo, password: 'clave123' })).status).toBe(200);
  });

  test('CP-79 (D-11) Tipos de incidencia: nombre o descripción más largos que la columna, o id no numérico al editar, responden 400, no 500', async () => {
    const casos = [
      ['nombre de 81 caracteres', () => post('/api/admin/tipos-incidencia', { nombre_tipo: `${MARCA} ${'x'.repeat(70)}` })],
      ['descripción de 201 caracteres', () => post('/api/admin/tipos-incidencia', { nombre_tipo: `${MARCA} desc`, descripcion: 'd'.repeat(201) })],
      ['editar con id no numérico', () => put('/api/admin/tipos-incidencia/abc', { nombre_tipo: `${MARCA} id` })],
    ];
    for (const [caso, peticion] of casos) {
      const res = await peticion();
      expect({ caso, status: res.status }).toEqual({ caso, status: 400 });
    }
    // Un id numérico inexistente sigue respondiendo 404.
    expect((await put('/api/admin/tipos-incidencia/999999', { nombre_tipo: `${MARCA} id` })).status).toBe(404);
  });

  test('CP-80 (D-12) Municipalidades: nombre, departamento o dirección más largos que la columna, o id no numérico al editar o cambiar el estado, responden 400, no 500', async () => {
    const casos = [
      ['nombre de 101 caracteres', () => post('/api/admin/municipalidades', { nombre: 'M'.repeat(101) })],
      ['departamento de 101 caracteres', () => post('/api/admin/municipalidades', { nombre: `${MARCA} dep`, departamento: 'd'.repeat(101) })],
      ['dirección de 201 caracteres', () => post('/api/admin/municipalidades', { nombre: `${MARCA} dir`, direccion: 'd'.repeat(201) })],
      ['editar con id no numérico', () => put('/api/admin/municipalidades/abc', { nombre: `${MARCA} id` })],
      ['cambiar estado con id no numérico', () => put('/api/admin/municipalidades/abc/estado', { estado_activo: true })],
    ];
    for (const [caso, peticion] of casos) {
      const res = await peticion();
      expect({ caso, status: res.status }).toEqual({ caso, status: 400 });
    }
    expect((await put('/api/admin/municipalidades/999999', { nombre: `${MARCA} id` })).status).toBe(404);
    expect((await query('SELECT count(*)::int AS n FROM municipalidad WHERE nombre LIKE $1', [`${MARCA}%`])).rows[0].n).toBe(0);
  });
});
