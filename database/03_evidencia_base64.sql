-- Migración: permitir almacenar imágenes en base64 dentro de evidencia_fotografica.
-- La columna url_imagen era VARCHAR(255), insuficiente para una cadena base64.
-- Ejecutar una sola vez sobre la base de datos ecoreporte.

ALTER TABLE evidencia_fotografica
    ALTER COLUMN url_imagen TYPE TEXT;
