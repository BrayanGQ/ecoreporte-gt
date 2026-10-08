-- =========================================================================
-- EcoReporte GT — Rol 'encargado_cuadrilla' (Fase 1 del rediseño de roles)
-- Encargado de un equipo de limpieza de una municipalidad: ve solo los
-- reportes que tiene asignados.
-- Ejecutar después de 01, 02 y 03. Es idempotente: se puede correr más de una vez.
-- Luego correr `npm run seed` en backend/ para asignar la contraseña del usuario demo.
-- =========================================================================

INSERT INTO rol (nombre_rol, descripcion) VALUES
    ('encargado_cuadrilla', 'Encargado de una cuadrilla de limpieza; atiende los reportes asignados.')
ON CONFLICT (nombre_rol) DO NOTHING;

-- Usuario de demostración (la contraseña real la asigna seed.js).
INSERT INTO usuario (nombre_completo, correo, password_hash, id_rol, id_municipalidad) VALUES
    ('Encargado de Cuadrilla', 'cuadrilla@ecoreporte.gt', 'PENDIENTE',
     (SELECT id_rol FROM rol WHERE nombre_rol = 'encargado_cuadrilla'), 1)
ON CONFLICT (correo) DO NOTHING;
