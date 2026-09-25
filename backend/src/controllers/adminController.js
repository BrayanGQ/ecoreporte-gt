// Controlador de administración: gestión de cuentas de personal municipal
// y configuración de los catálogos del sistema.
// Todas estas funciones están restringidas al rol 'administrador' desde las rutas.
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

// Roles que el administrador puede asignar a una cuenta de personal.
const ROLES_PERSONAL = ['personal_municipal', 'administrador'];

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
       WHERE r.nombre_rol IN ('personal_municipal', 'administrador')
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
       WHERE nombre_rol IN ('personal_municipal', 'administrador')
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
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    // El rol debe ser uno de los asignables al personal (nunca 'ciudadano').
    const rol = await query('SELECT nombre_rol FROM rol WHERE id_rol = $1', [id_rol]);
    if (rol.rows.length === 0 || !ROLES_PERSONAL.includes(rol.rows[0].nombre_rol)) {
      return res.status(400).json({ error: 'El rol seleccionado no es válido para personal municipal.' });
    }

    // La municipalidad debe existir.
    const muni = await query(
      'SELECT id_municipalidad FROM municipalidad WHERE id_municipalidad = $1',
      [id_municipalidad]
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
      [nombre_completo, correo, password_hash, id_rol, id_municipalidad]
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

// POST /api/admin/tipos-incidencia — agrega un tipo de incidencia.
async function crearTipoIncidencia(req, res) {
  const { nombre_tipo, descripcion } = req.body;
  if (!nombre_tipo || !nombre_tipo.trim()) {
    return res.status(400).json({ error: 'El nombre del tipo de incidencia es obligatorio.' });
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
  const { id } = req.params;
  const { nombre_tipo, descripcion } = req.body;
  if (!nombre_tipo || !nombre_tipo.trim()) {
    return res.status(400).json({ error: 'El nombre del tipo de incidencia es obligatorio.' });
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
async function listarMunicipalidades(req, res) {
  try {
    const r = await query(
      `SELECT id_municipalidad, nombre, departamento, direccion, estado_activo
       FROM municipalidad ORDER BY nombre`
    );
    res.json(r.rows);
  } catch (err) {
    console.error('Error al listar municipalidades:', err.message);
    res.status(500).json({ error: 'Error al obtener las municipalidades.' });
  }
}

// POST /api/admin/municipalidades — agrega una municipalidad.
async function crearMunicipalidad(req, res) {
  const { nombre, departamento, direccion } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre de la municipalidad es obligatorio.' });
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
  const { id } = req.params;
  const { nombre, departamento, direccion, estado_activo } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre de la municipalidad es obligatorio.' });
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

module.exports = {
  listarUsuarios,
  listarRoles,
  crearUsuario,
  cambiarEstadoUsuario,
  listarTiposIncidencia,
  crearTipoIncidencia,
  editarTipoIncidencia,
  listarMunicipalidades,
  crearMunicipalidad,
  editarMunicipalidad,
};
