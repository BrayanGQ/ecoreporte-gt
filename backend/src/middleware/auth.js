// Middleware de autenticación (JWT) y control de acceso por rol.
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'clave_por_defecto';

// Verifica que la petición traiga un token JWT válido en el encabezado Authorization.
function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Guarda los datos del usuario autenticado en la petición.
    req.usuario = payload; // { id_usuario, correo, rol, id_municipalidad }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

// Restringe el acceso a los roles indicados. Uso: permitirRoles('administrador')
function permitirRoles(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tenés permiso para realizar esta acción.' });
    }
    next();
  };
}

module.exports = { verificarToken, permitirRoles, JWT_SECRET };
