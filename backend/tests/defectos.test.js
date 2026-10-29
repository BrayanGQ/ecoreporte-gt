// Pruebas de regresión de los defectos D-03, D-04 y D-05, detectados el 28/10/2026 mediante
// pruebas negativas de robustez sobre la versión 1.0.0. Cada caso falla sobre la versión sin
// corregir y pasa con la corrección aplicada (correccion-D03-D05.patch).
const { api, puntos, crearReporte, uno, CORREO_PRUEBA } = require('./helpers');

let P;
beforeAll(async () => {
  P = await puntos();
});

const registro = (cuerpo) => api().post('/api/auth/registro').send(cuerpo);

describe('Regresión de defectos de validación de entrada', () => {
  test('CP-71 (D-03) Registro con un correo sin formato válido es rechazado con 400 y no crea la cuenta', async () => {
    const correo = `sin-formato-${Date.now()}`;
    const res = await registro({ nombre_completo: 'Prueba formato', correo, password: 'clave123' });

    expect(res.status).toBe(400);
    expect(await uno('SELECT 1 AS existe FROM usuario WHERE correo = $1', [correo])).toBeUndefined();
  });

  test('CP-72 (D-04) Registro con contraseña no textual o nombre de más de 120 caracteres responde 400, no 500', async () => {
    const numerica = await registro({ nombre_completo: 'Prueba', correo: CORREO_PRUEBA('numerica'), password: 12345678 });
    expect(numerica.status).toBe(400);

    const largo = await registro({ nombre_completo: 'N'.repeat(121), correo: CORREO_PRUEBA('largo'), password: 'clave123' });
    expect(largo.status).toBe(400);
  });

  test('CP-73 (D-05) Reporte con un tipo de incidencia inexistente o no numérico responde 400, no 500', async () => {
    for (const id_tipo_incidencia of [999999, 'abc']) {
      const res = await crearReporte(P.guatemala, { id_tipo_incidencia, descripcion: `tipo inválido ${id_tipo_incidencia}` });
      expect(res.status).toBe(400);
    }
  });
});
