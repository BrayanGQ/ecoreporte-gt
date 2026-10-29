// Controlador de administración: gestión de cuentas de personal municipal
// y configuración de los catálogos del sistema.
// Todas estas funciones están restringidas al rol 'administrador' desde las rutas.
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

// Roles que el administrador puede asignar a una cuenta de personal.
const ROLES_PERSONAL = ['personal_municipal', 'encargado_cuadrilla', 'administrador'];

// Validación de entrada (D-06 a D-12): datos que no son texto, textos más largos que su columna
// (database/01_esquema.sql) o ids no numéricos provocaban errores 500 o la caída del servidor.
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATOS_INVALIDOS = 'Los datos enviados no tienen un formato válido.';
const ID_INVALIDO = 'El identificador indicado no es válido.';
const esTextoOpcional = (valor) => valor == null || typeof valor === 'string';

// Id entero positivo (de la ruta o del cuerpo), o null si no lo es.
function idValido(valor) {
  return /^\d+$/.test(String(valor)) && Number(valor) > 0 ? Number(valor) : null;
}

// =========================================================================
// GESTIÓN DE USUARIOS
// =========================================================================

// GET /api/admin/usuarios — lista las cuentas de personal municipal y administradores.
async function listarUsuarios(req, res) {
  try {
    const r = await query(
      `SELECT u.id_usuario, u.nombre_completo, u.correo, u.estado, u.fecha_registro,
              u.id_rol, r.nombre_rol,
              u.id_municipalidad, m.nombre AS nombre_municipalidad
       FROM usuario u
       JOIN rol r ON u.id_rol = r.id_rol
       LEFT JOIN municipalidad m ON u.id_municipalidad = m.id_municipalidad
       WHERE r.nombre_rol IN ('personal_municipal', 'encargado_cuadrilla', 'administrador')
       ORDER BY u.nombre_completo`
    );
    res.json(r.rows);
  } catch (err) {
    console.error('Error al listar usuarios:', err.message);
    res.status(500).json({ error: 'Error al obtener los usuarios.' });
  }
}

// GET /api/admin/roles — roles asignables a una cuenta de personal.
async function listarRoles(req, res) {
  try {
    const r = await query(
      `SELECT id_rol, nombre_rol, descripcion
       FROM rol
       WHERE nombre_rol IN ('personal_municipal', 'encargado_cuadrilla', 'administrador')
       ORDER BY id_rol`
    );
    res.json(r.rows);
  } catch (err) {
    console.error('Error al listar roles:', err.message);
    res.status(500).json({ error: 'Error al obtener los roles.' });
  }
}

// POST /api/admin/usuarios — crea una cuenta de personal municipal.
async function crearUsuario(req, res) {
  const { nombre_completo, correo, password, id_municipalidad, id_rol } = req.body;

  if (!nombre_completo || !correo || !password || !id_municipalidad || !id_rol) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }
  // D-07: valores que no son texto o más largos que la columna provocaban un error 500.
  if (typeof nombre_completo !== 'string' || typeof correo !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: DATOS_INVALIDOS });
  }
  if (nombre_completo.length > 120) {
    return res.status(400).json({ error: 'El nombre admite como máximo 120 caracteres.' });
  }
  // D-06: el correo se guardaba sin validar su formato.
  if (correo.length > 150 || !CORREO_VALIDO.test(correo)) {
    return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }
  // D-07: un id de rol o de municipalidad no numérico provocaba un error 500.
  const idRol = idValido(id_rol);
  const idMunicipalidad = idValido(id_municipalidad);
  if (!idRol || !idMunicipalidad) {
    return res.status(400).json({ error: 'El rol o la municipalidad indicados no son válidos.' });
  }

  try {
    // El rol debe ser uno de los asignables al personal (nunca 'ciudadano').
    const rol = await query('SELECT nombre_rol FROM rol WHERE id_rol = $1', [idRol]);
    if (rol.rows.length === 0 || !ROLES_PERSONAL.includes(rol.rows[0].nombre_rol)) {
      return res.status(400).json({ error: 'El rol seleccionado no es válido para personal municipal.' });
    }

    // La municipalidad debe existir.
    const muni = await query(
      'SELECT id_municipalidad FROM municipalidad WHERE id_municipalidad = $1',
      [idMunicipalidad]
    );
    if (muni.rows.length === 0) {
      return res.status(400).json({ error: 'La municipalidad seleccionada no existe.' });
    }

    // Valida que el correo no esté ya registrado.
    const existe = await query('SELECT id_usuario FROM usuario WHERE LOWER(correo) = LOWER($1)', [correo]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ error: 'El correo ya está registrado.' });
    }

    // Hashea la contraseña antes de guardarla.
    const password_hash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO usuario (nombre_completo, correo, password_hash, id_rol, id_municipalidad)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id_usuario, nombre_completo, correo, estado, id_rol, id_municipalidad`,
      [nombre_completo, correo, password_hash, idRol, idMunicipalidad]
    );

    res.status(201).json({
      mensaje: 'Cuenta creada correctamente.',
      usuario: result.rows[0],
    });
  } catch (err) {
    console.error('Error al crear usuario:', err.message);
    res.status(500).json({ error: 'Error al crear la cuenta.' });
  }
}

// PUT /api/admin/usuarios/:id/estado — activa o desactiva una cuenta.
async function cambiarEstadoUsuario(req, res) {
  const { id } = req.params;
  const { estado } = req.body;

  if (typeof estado !== 'boolean') {
    return res.status(400).json({ error: 'El estado debe ser verdadero o falso.' });
  }

  // Evita que un administrador se desactive a sí mismo y quede fuera del sistema.
  if (Number(id) === Number(req.usuario.id_usuario) && estado === false) {
    return res.status(400).json({ error: 'No podés desactivar tu propia cuenta.' });
  }

  try {
    // Solo se pueden modificar cuentas de personal, nunca las de ciudadanos.
    const usuario = await query(
      `SELECT u.id_usuario, r.nombre_rol
       FROM usuario u JOIN rol r ON u.id_rol = r.id_rol
       WHERE u.id_usuario = $1`,
      [id]
    );
    if (usuario.rows.length === 0) {
      return res.status(404).json({ error: 'El usuario no existe.' });
    }
    if (!ROLES_PERSONAL.includes(usuario.rows[0].nombre_rol)) {
      return res.status(403).json({ error: 'Solo se pueden modificar cuentas de personal municipal.' });
    }

    const result = await query(
      `UPDATE usuario SET estado = $1 WHERE id_usuario = $2
       RETURNING id_usuario, nombre_completo, correo, estado`,
      [estado, id]
    );

    res.json({
      mensaje: estado ? 'Cuenta activada correctamente.' : 'Cuenta desactivada correctamente.',
      usuario: result.rows[0],
    });
  } catch (err) {
    console.error('Error al cambiar el estado del usuario:', err.message);
    res.status(500).json({ error: 'Error al actualizar el estado de la cuenta.' });
  }
}

// POST /api/admin/usuarios/restablecer-password — asigna una contraseña nueva a una cuenta.
// Body: { correo, password }. La cuenta se busca por correo (sin distinguir mayúsculas), así
// sirve para cualquier rol, incluidos los ciudadanos, que no aparecen en la lista de personal.
// Es la vía de recuperación en producción, donde POST /api/auth/recuperar no devuelve el token.
async function restablecerPasswordUsuario(req, res) {
  const { correo, password } = req.body;
  // D-08: un correo que no es texto lanzaba una excepción fuera del try (caída del servidor).
  // D-09: una contraseña que no es texto provocaba un error 500 en bcrypt.
  if (!esTextoOpcional(correo) || !esTextoOpcional(password)) {
    return res.status(400).json({ error: DATOS_INVALIDOS });
  }
  if (!correo || !correo.trim() || !password) {
    return res.status(400).json({ error: 'El correo y la nueva contraseña son obligatorios.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const usuario = await query(
      `SELECT u.id_usuario, u.nombre_completo, u.correo, u.estado, r.nombre_rol
       FROM usuario u JOIN rol r ON u.id_rol = r.id_rol
       WHERE LOWER(u.correo) = LOWER($1)`,
      [correo.trim()]
    );
    if (usuario.rows.length === 0) {
      return res.status(404).json({ error: 'No existe una cuenta con ese correo.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    await query('UPDATE usuario SET password_hash = $1 WHERE id_usuario = $2', [
      password_hash, usuario.rows[0].id_usuario,
    ]);

    res.json({
      mensaje: `Contraseña restablecida para ${usuario.rows[0].nombre_completo}.`,
      usuario: usuario.rows[0],
    });
  } catch (err) {
    console.error('Error al restablecer la contraseña:', err.message);
    res.status(500).json({ error: 'Error al restablecer la contraseña.' });
  }
}

// =========================================================================
// CATÁLOGO: TIPOS DE INCIDENCIA
// =========================================================================

// GET /api/admin/tipos-incidencia — lista completa (incluye la descripción).
async function listarTiposIncidencia(req, res) {
  try {
    const r = await query(
      'SELECT id_tipo_incidencia, nombre_tipo, descripcion FROM tipo_incidencia ORDER BY nombre_tipo'
    );
    res.json(r.rows);
  } catch (err) {
    console.error('Error al listar tipos de incidencia:', err.message);
    res.status(500).json({ error: 'Error al obtener los tipos de incidencia.' });
  }
}

// Valida el cuerpo de un tipo de incidencia; devuelve el mensaje de error o null.
// D-08: un nombre que no es texto lanzaba una excepción fuera del try (caída del servidor).
// D-11: textos más largos que la columna provocaban un error 500.
function errorTipoIncidencia({ nombre_tipo, descripcion }) {
  if (!esTextoOpcional(nombre_tipo) || !esTextoOpcional(descripcion)) return DATOS_INVALIDOS;
  if (!nombre_tipo || !nombre_tipo.trim()) return 'El nombre del tipo de incidencia es obligatorio.';
  if (nombre_tipo.trim().length > 80) return 'El nombre admite como máximo 80 caracteres.';
  if (descripcion && descripcion.length > 200) return 'La descripción admite como máximo 200 caracteres.';
  return null;
}

// POST /api/admin/tipos-incidencia — agrega un tipo de incidencia.
async function crearTipoIncidencia(req, res) {
  const { nombre_tipo, descripcion } = req.body;
  const error = errorTipoIncidencia(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const existe = await query(
      'SELECT id_tipo_incidencia FROM tipo_incidencia WHERE LOWER(nombre_tipo) = LOWER($1)',
      [nombre_tipo.trim()]
    );
    if (existe.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe un tipo de incidencia con ese nombre.' });
    }

    const r = await query(
      `INSERT INTO tipo_incidencia (nombre_tipo, descripcion)
       VALUES ($1, $2)
       RETURNING id_tipo_incidencia, nombre_tipo, descripcion`,
      [nombre_tipo.trim(), descripcion || null]
    );

    res.status(201).json({ mensaje: 'Tipo de incidencia agregado.', tipo: r.rows[0] });
  } catch (err) {
    console.error('Error al crear tipo de incidencia:', err.message);
    res.status(500).json({ error: 'Error al agregar el tipo de incidencia.' });
  }
}

// PUT /api/admin/tipos-incidencia/:id — edita un tipo de incidencia.
async function editarTipoIncidencia(req, res) {
  const id = idValido(req.params.id);
  const { nombre_tipo, descripcion } = req.body;
  if (!id) {
    return res.status(400).json({ error: ID_INVALIDO });
  }
  const error = errorTipoIncidencia(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const duplicado = await query(
      `SELECT id_tipo_incidencia FROM tipo_incidencia
       WHERE LOWER(nombre_tipo) = LOWER($1) AND id_tipo_incidencia <> $2`,
      [nombre_tipo.trim(), id]
    );
    if (duplicado.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe otro tipo de incidencia con ese nombre.' });
    }

    const r = await query(
      `UPDATE tipo_incidencia SET nombre_tipo = $1, descripcion = $2
       WHERE id_tipo_incidencia = $3
       RETURNING id_tipo_incidencia, nombre_tipo, descripcion`,
      [nombre_tipo.trim(), descripcion || null, id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'El tipo de incidencia no existe.' });
    }

    res.json({ mensaje: 'Tipo de incidencia actualizado.', tipo: r.rows[0] });
  } catch (err) {
    console.error('Error al editar tipo de incidencia:', err.message);
    res.status(500).json({ error: 'Error al actualizar el tipo de incidencia.' });
  }
}

// =========================================================================
// CATÁLOGO: MUNICIPALIDADES
// =========================================================================

// GET /api/admin/municipalidades — lista completa (incluye las inactivas).
// tiene_limite indica si la municipalidad tiene cargado su límite territorial (PostGIS):
// sin límite, ningún reporte puede caer en ella aunque esté activa.
async function listarMunicipalidades(req, res) {
  try {
    const r = await query(
      `SELECT id_municipalidad, nombre, departamento, direccion, estado_activo,
              (limite IS NOT NULL) AS tiene_limite
       FROM municipalidad ORDER BY nombre`
    );
    res.json(r.rows);
  } catch (err) {
    console.error('Error al listar municipalidades:', err.message);
    res.status(500).json({ error: 'Error al obtener las municipalidades.' });
  }
}

// Valida el cuerpo de una municipalidad; devuelve el mensaje de error o null.
// D-08: un nombre que no es texto lanzaba una excepción fuera del try (caída del servidor).
// D-12: textos más largos que la columna provocaban un error 500.
function errorMunicipalidad({ nombre, departamento, direccion }) {
  if (!esTextoOpcional(nombre) || !esTextoOpcional(departamento) || !esTextoOpcional(direccion)) {
    return DATOS_INVALIDOS;
  }
  if (!nombre || !nombre.trim()) return 'El nombre de la municipalidad es obligatorio.';
  if (nombre.trim().length > 100) return 'El nombre admite como máximo 100 caracteres.';
  if (departamento && departamento.trim().length > 100) return 'El departamento admite como máximo 100 caracteres.';
  if (direccion && direccion.length > 200) return 'La dirección admite como máximo 200 caracteres.';
  return null;
}

// POST /api/admin/municipalidades — agrega una municipalidad.
async function crearMunicipalidad(req, res) {
  const { nombre, departamento, direccion } = req.body;
  const error = errorMunicipalidad(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const existe = await query(
      'SELECT id_municipalidad FROM municipalidad WHERE LOWER(nombre) = LOWER($1)',
      [nombre.trim()]
    );
    if (existe.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe una municipalidad con ese nombre.' });
    }

    // Si no se indica departamento, la columna conserva su valor por defecto.
    const r = await query(
      `INSERT INTO municipalidad (nombre, departamento, direccion)
       VALUES ($1, COALESCE($2, 'Guatemala'), $3)
       RETURNING id_municipalidad, nombre, departamento, direccion, estado_activo`,
      [nombre.trim(), departamento && departamento.trim() ? departamento.trim() : null, direccion || null]
    );

    res.status(201).json({ mensaje: 'Municipalidad agregada.', municipalidad: r.rows[0] });
  } catch (err) {
    console.error('Error al crear municipalidad:', err.message);
    res.status(500).json({ error: 'Error al agregar la municipalidad.' });
  }
}

// PUT /api/admin/municipalidades/:id — edita una municipalidad.
async function editarMunicipalidad(req, res) {
  const id = idValido(req.params.id);
  const { nombre, departamento, direccion, estado_activo } = req.body;
  if (!id) {
    return res.status(400).json({ error: ID_INVALIDO });
  }
  const error = errorMunicipalidad(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const duplicado = await query(
      `SELECT id_municipalidad FROM municipalidad
       WHERE LOWER(nombre) = LOWER($1) AND id_municipalidad <> $2`,
      [nombre.trim(), id]
    );
    if (duplicado.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe otra municipalidad con ese nombre.' });
    }

    const r = await query(
      `UPDATE municipalidad
       SET nombre = $1,
           departamento = COALESCE($2, departamento),
           direccion = $3,
           estado_activo = COALESCE($4, estado_activo)
       WHERE id_municipalidad = $5
       RETURNING id_municipalidad, nombre, departamento, direccion, estado_activo`,
      [
        nombre.trim(),
        departamento && departamento.trim() ? departamento.trim() : null,
        direccion || null,
        typeof estado_activo === 'boolean' ? estado_activo : null,
        id,
      ]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'La municipalidad no existe.' });
    }

    res.json({ mensaje: 'Municipalidad actualizada.', municipalidad: r.rows[0] });
  } catch (err) {
    console.error('Error al editar municipalidad:', err.message);
    res.status(500).json({ error: 'Error al actualizar la municipalidad.' });
  }
}

// PUT /api/admin/municipalidades/:id/estado — activa o desactiva una municipalidad.
// Activa = adoptó la plataforma: los reportes dentro de su límite se le asignan.
async function cambiarEstadoMunicipalidad(req, res) {
  const id = idValido(req.params.id);
  const { estado_activo } = req.body;
  if (!id) {
    return res.status(400).json({ error: ID_INVALIDO });
  }
  if (typeof estado_activo !== 'boolean') {
    return res.status(400).json({ error: 'El estado debe ser verdadero o falso.' });
  }
  try {
    const r = await query(
      `UPDATE municipalidad SET estado_activo = $1 WHERE id_municipalidad = $2
       RETURNING id_municipalidad, nombre, departamento, direccion, estado_activo,
                 (limite IS NOT NULL) AS tiene_limite`,
      [estado_activo, id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'La municipalidad no existe.' });
    }
    res.json({
      mensaje: estado_activo ? 'Municipalidad activada.' : 'Municipalidad desactivada.',
      municipalidad: r.rows[0],
    });
  } catch (err) {
    console.error('Error al cambiar el estado de la municipalidad:', err.message);
    res.status(500).json({ error: 'Error al actualizar el estado de la municipalidad.' });
  }
}

module.exports = {
  listarUsuarios,
  listarRoles,
  crearUsuario,
  cambiarEstadoUsuario,
  restablecerPasswordUsuario,
  listarTiposIncidencia,
  crearTipoIncidencia,
  editarTipoIncidencia,
  listarMunicipalidades,
  crearMunicipalidad,
  editarMunicipalidad,
  cambiarEstadoMunicipalidad,
};
