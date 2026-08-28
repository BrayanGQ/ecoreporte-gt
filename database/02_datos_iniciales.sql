-- =========================================================================
-- Datos iniciales — EcoReporte GT
-- =========================================================================

-- Roles
INSERT INTO rol (nombre_rol, descripcion) VALUES
    ('ciudadano',          'Usuario público que registra y consulta reportes.'),
    ('personal_municipal', 'Colaborador municipal que gestiona y atiende reportes.'),
    ('administrador',      'Usuario con privilegios de configuración general.');

-- Estados del reporte
INSERT INTO estado_reporte (nombre_estado, orden) VALUES
    ('recibido',    1),
    ('asignado',    2),
    ('en_atencion', 3),
    ('resuelto',    4),
    ('descartado',  5);

-- Tipos de incidencia
INSERT INTO tipo_incidencia (nombre_tipo, descripcion) VALUES
    ('Vertedero clandestino',      'Acumulación no autorizada de residuos sólidos.'),
    ('Quema de residuos',          'Incineración de basura a cielo abierto.'),
    ('Escombros de construcción',  'Desechos de obra depositados en vía pública.'),
    ('Desechos junto a fuente de agua', 'Residuos cercanos a ríos o cuerpos de agua.');

-- Municipalidad de ejemplo
INSERT INTO municipalidad (nombre, departamento, direccion) VALUES
    ('Municipalidad de Guatemala', 'Guatemala', '21 calle 6-77 zona 1');

-- Usuarios de demostración
-- NOTA: los password_hash corresponden a la contraseña "password123" (bcrypt).
-- Se recomienda cambiarlos tras el primer inicio de sesión.
-- El hash se genera desde el backend; aquí se usa un placeholder que el
-- script de seed (seed.js) reemplazará por hashes reales.
INSERT INTO usuario (nombre_completo, correo, password_hash, id_rol, id_municipalidad) VALUES
    ('Administrador General', 'admin@ecoreporte.gt',    'PENDIENTE', 3, 1),
    ('Empleado Municipal',    'municipal@ecoreporte.gt','PENDIENTE', 2, 1),
    ('Ciudadano Demo',        'ciudadano@ecoreporte.gt','PENDIENTE', 1, NULL);
