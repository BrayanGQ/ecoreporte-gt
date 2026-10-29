// Controlador de autenticación: registro, inicio de sesión y recuperación de contraseña.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');
require('dotenv').config();

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/registro — registro de un nuevo ciudadano.
async function registro(req, res) {
  const { nombre_completo, correo, password } = req.body;
  if (!nombre_completo || !correo || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }
  // D-04: valores que no son texto (p. ej. una contraseña numérica) o que exceden el largo de
  // la columna provocaban un error 500; se rechazan como datos inválidos.
  if (typeof nombre_completo !== 'string' || typeof correo !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Los datos enviados no tienen un formato válido.' });
  }
  if (nombre_completo.trim().length > 120) {
    return res.status(400).json({ error: 'El nombre admite como máximo 120 caracteres.' });
  }
  // D-03: el correo se guardaba sin validar su formato.
  if (correo.length > 150 || !CORREO_VALIDO.test(correo)) {
    return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    // Verifica que el correo no exista ya.
    const existe = await query('SELECT id_usuario FROM usuario WHERE correo = $1', [correo]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ error: 'El correo ya está registrado.' });
    }

    // Hashea la contraseña antes de guardarla.
    const password_hash = await bcrypt.hash(password, 10);

    // Los registros públicos siempre se crean con rol 'ciudadano' (id_rol = 1) y sin municipalidad.
    const result = await query(
      `INSERT INTO usuario (nombre_completo, correo, password_hash, id_rol, id_municipalidad)
       VALUES ($1, $2, $3, (SELECT id_rol FROM rol WHERE nombre_rol = 'ciudadano'), NULL)
       RETURNING id_usuario, nombre_completo, correo`,
      [nombre_completo, correo, password_hash]
    );

    res.status(201).json({
      mensaje: 'Cuenta creada correctamente.',
      usuario: result.rows[0],
    });
  } catch (err) {
    console.error('Error en registro:', err.message);
    res.status(500).json({ error: 'Error al crear la cuenta.' });
  }
}

// POST /api/auth/login — inicio de sesión.
async function login(req, res) {
  const { correo, password } = req.body;
  if (!correo || !password) {
    return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
  }

  try {
    const result = await query(
      `SELECT u.id_usuario, u.nombre_completo, u.correo, u.password_hash, u.estado,
              u.id_municipalidad, r.nombre_rol
       FROM usuario u
       JOIN rol r ON u.id_rol = r.id_rol
       WHERE u.correo = $1`,
      [correo]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    const usuario = result.rows[0];

    if (!usuario.estado) {
      return res.status(403).json({ error: 'La cuenta se encuentra desactivada.' });
    }

    const passwordValido = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValido) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    // Genera el token JWT con los datos esenciales del usuario.
    const payload = {
      id_usuario: usuario.id_usuario,
      correo: usuario.correo,
      rol: usuario.nombre_rol,
      id_municipalidad: usuario.id_municipalidad,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      mensaje: 'Inicio de sesión exitoso.',
      token,
      usuario: {
        id_usuario: usuario.id_usuario,
        nombre_completo: usuario.nombre_completo,
        correo: usuario.correo,
        rol: usuario.nombre_rol,
        id_municipalidad: usuario.id_municipalidad,
      },
    });
  } catch (err) {
    console.error('Error en login:', err.message);
    res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
}

// Respuesta de recuperación en producción: la misma exista o no el correo, para no revelar
// qué cuentas están registradas. La recuperación la hace el administrador desde
// Administración → Usuarios (POST /api/admin/usuarios/restablecer-password).
const MENSAJE_RECUPERACION_PRODUCCION =
  'La recuperación automática por correo todavía no está disponible. Si tu correo está registrado, ' +
  'pedile al administrador de EcoReporte GT que restablezca tu contraseña.';

// POST /api/auth/recuperar — solicitud de recuperación de contraseña.
// La app todavía no envía correos. En desarrollo se simula: valida el correo y devuelve un token
// temporal para completar el flujo. En producción (NODE_ENV=production) NUNCA se devuelve el
// token: con él cualquiera podría cambiar la contraseña de una cuenta conociendo su correo.
async function recuperarPassword(req, res) {
  const { correo } = req.body;
  if (!correo) {
    return res.status(400).json({ error: 'El correo es obligatorio.' });
  }

  if (process.env.NODE_ENV === 'production') {
    return res.json({ mensaje: MENSAJE_RECUPERACION_PRODUCCION });
  }

  try {
    const result = await query('SELECT id_usuario FROM usuario WHERE correo = $1', [correo]);
    // Por seguridad, se responde igual exista o no el correo.
    if (result.rows.length === 0) {
      return res.json({ mensaje: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.' });
    }

    // Token temporal de recuperación (válido 15 minutos).
    const tokenRecuperacion = jwt.sign(
      { id_usuario: result.rows[0].id_usuario, tipo: 'recuperacion' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    // En producción: enviar por correo. Aquí se devuelve para pruebas.
    res.json({
      mensaje: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.',
      token_recuperacion: tokenRecuperacion, // solo para desarrollo
    });
  } catch (err) {
    console.error('Error en recuperación:', err.message);
    res.status(500).json({ error: 'Error al procesar la solicitud.' });
  }
}

// POST /api/auth/restablecer — restablece la contraseña con el token de recuperación.
async function restablecerPassword(req, res) {
  const { token, nueva_password } = req.body;
  if (!token || !nueva_password) {
    return res.status(400).json({ error: 'Token y nueva contraseña son obligatorios.' });
  }
  if (typeof nueva_password !== 'string') {
    return res.status(400).json({ error: 'Los datos enviados no tienen un formato válido.' });
  }
  if (nueva_password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  // D-16: un solo catch respondía "enlace inválido" (400) también ante una falla de la base.
  // El token inválido o vencido es un error del cliente; la falla al guardar, del servidor (500).
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(400).json({ error: 'El enlace de recuperación es inválido o expiró.' });
  }
  if (payload.tipo !== 'recuperacion') {
    return res.status(400).json({ error: 'Token no válido para esta operación.' });
  }

  try {
    const password_hash = await bcrypt.hash(nueva_password, 10);
    await query('UPDATE usuario SET password_hash = $1 WHERE id_usuario = $2', [
      password_hash,
      payload.id_usuario,
    ]);

    res.json({ mensaje: 'Contraseña restablecida correctamente.' });
  } catch (err) {
    console.error('Error al restablecer la contraseña:', err.message);
    res.status(500).json({ error: 'Error al restablecer la contraseña.' });
  }
}

// PUT /api/cuenta/password — el usuario autenticado cambia su propia contraseña.
// Body: { password_actual, password_nueva }. Pide la actual para que una sesión abierta en un
// equipo ajeno no baste para cambiarla. Si la actual no coincide responde 400 (no 401), para que
// el frontend no lo confunda con una sesión vencida y cierre la sesión.
async function cambiarPassword(req, res) {
  const { password_actual, password_nueva } = req.body;
  if (!password_actual || !password_nueva) {
    return res.status(400).json({ error: 'La contraseña actual y la nueva son obligatorias.' });
  }
  // D-10: una contraseña que no es texto provocaba un error 500 en bcrypt.
  if (typeof password_actual !== 'string' || typeof password_nueva !== 'string') {
    return res.status(400).json({ error: 'Los datos enviados no tienen un formato válido.' });
  }
  if (password_nueva.length < 6) {
    return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 6 caracteres.' });
  }
  if (password_nueva === password_actual) {
    return res.status(400).json({ error: 'La contraseña nueva debe ser distinta de la actual.' });
  }

  try {
    const result = await query('SELECT password_hash, estado FROM usuario WHERE id_usuario = $1', [
      req.usuario.id_usuario,
    ]);
    if (result.rows.length === 0 || !result.rows[0].estado) {
      return res.status(403).json({ error: 'La cuenta no existe o está desactivada.' });
    }
    if (!(await bcrypt.compare(password_actual, result.rows[0].password_hash))) {
      return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
    }

    const password_hash = await bcrypt.hash(password_nueva, 10);
    await query('UPDATE usuario SET password_hash = $1 WHERE id_usuario = $2', [
      password_hash, req.usuario.id_usuario,
    ]);
    res.json({ mensaje: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    console.error('Error al cambiar la contraseña:', err.message);
    res.status(500).json({ error: 'Error al cambiar la contraseña.' });
  }
}

module.exports = { registro, login, recuperarPassword, restablecerPassword, cambiarPassword };
