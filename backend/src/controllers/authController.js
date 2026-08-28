// Controlador de autenticación: registro, inicio de sesión y recuperación de contraseña.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');
require('dotenv').config();

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// POST /api/auth/registro — registro de un nuevo ciudadano.
async function registro(req, res) {
  const { nombre_completo, correo, password } = req.body;
  if (!nombre_completo || !correo || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
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

// POST /api/auth/recuperar — solicitud de recuperación de contraseña.
// En esta fase se simula: valida el correo y devuelve un token temporal.
// En producción, se enviaría un enlace por correo electrónico.
async function recuperarPassword(req, res) {
  const { correo } = req.body;
  if (!correo) {
    return res.status(400).json({ error: 'El correo es obligatorio.' });
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
  if (nueva_password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.tipo !== 'recuperacion') {
      return res.status(400).json({ error: 'Token no válido para esta operación.' });
    }

    const password_hash = await bcrypt.hash(nueva_password, 10);
    await query('UPDATE usuario SET password_hash = $1 WHERE id_usuario = $2', [
      password_hash,
      payload.id_usuario,
    ]);

    res.json({ mensaje: 'Contraseña restablecida correctamente.' });
  } catch (err) {
    return res.status(400).json({ error: 'El enlace de recuperación es inválido o expiró.' });
  }
}

module.exports = { registro, login, recuperarPassword, restablecerPassword };
