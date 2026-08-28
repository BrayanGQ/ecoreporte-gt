-- =========================================================================
-- EcoReporte GT — Esquema de base de datos
-- Plataforma para la detección, registro y seguimiento de vertederos clandestinos
-- Motor: PostgreSQL 15+ con extensión PostGIS
-- Modelo de 9 entidades (Capítulo V — DER)
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- =========================================================================
-- TABLAS DE CATÁLOGO
-- =========================================================================

CREATE TABLE rol (
    id_rol       SERIAL PRIMARY KEY,
    nombre_rol   VARCHAR(50)  NOT NULL UNIQUE,
    descripcion  VARCHAR(200)
);

CREATE TABLE municipalidad (
    id_municipalidad  SERIAL PRIMARY KEY,
    nombre            VARCHAR(100) NOT NULL,
    departamento      VARCHAR(100) NOT NULL DEFAULT 'Guatemala',
    direccion         VARCHAR(200),
    estado_activo     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE tipo_incidencia (
    id_tipo_incidencia  SERIAL PRIMARY KEY,
    nombre_tipo         VARCHAR(80) NOT NULL,
    descripcion         VARCHAR(200)
);

CREATE TABLE estado_reporte (
    id_estado     SERIAL PRIMARY KEY,
    nombre_estado VARCHAR(50) NOT NULL UNIQUE,
    orden         INTEGER NOT NULL
);

-- =========================================================================
-- ENTIDADES PRINCIPALES
-- =========================================================================

CREATE TABLE usuario (
    id_usuario        SERIAL PRIMARY KEY,
    nombre_completo   VARCHAR(120) NOT NULL,
    correo            VARCHAR(150) NOT NULL UNIQUE,
    password_hash     VARCHAR(255) NOT NULL,
    estado            BOOLEAN NOT NULL DEFAULT TRUE,
    id_rol            INTEGER NOT NULL REFERENCES rol(id_rol),
    id_municipalidad  INTEGER REFERENCES municipalidad(id_municipalidad),  -- NULL para ciudadanos
    fecha_registro    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE reporte (
    id_reporte           SERIAL PRIMARY KEY,
    id_usuario_reporta   INTEGER REFERENCES usuario(id_usuario),            -- NULL = denuncia anónima
    id_usuario_asignado  INTEGER REFERENCES usuario(id_usuario),
    id_municipalidad     INTEGER NOT NULL REFERENCES municipalidad(id_municipalidad),
    id_tipo_incidencia   INTEGER NOT NULL REFERENCES tipo_incidencia(id_tipo_incidencia),
    id_estado_actual     INTEGER NOT NULL REFERENCES estado_reporte(id_estado),
    descripcion          TEXT,
    latitud              DECIMAL(10,8) NOT NULL,
    longitud             DECIMAL(11,8) NOT NULL,
    fecha_reporte        TIMESTAMP NOT NULL DEFAULT NOW(),
    codigo_seguimiento   VARCHAR(20) UNIQUE
);

CREATE TABLE evidencia_fotografica (
    id_evidencia    SERIAL PRIMARY KEY,
    id_reporte      INTEGER NOT NULL REFERENCES reporte(id_reporte) ON DELETE CASCADE,
    id_usuario      INTEGER REFERENCES usuario(id_usuario),
    url_imagen      VARCHAR(255) NOT NULL,
    tipo_evidencia  VARCHAR(30) NOT NULL DEFAULT 'ciudadana',  -- 'ciudadana' | 'municipal'
    fecha_carga     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE historial_estado (
    id_historial            SERIAL PRIMARY KEY,
    id_reporte              INTEGER NOT NULL REFERENCES reporte(id_reporte) ON DELETE CASCADE,
    id_estado               INTEGER NOT NULL REFERENCES estado_reporte(id_estado),
    id_usuario_responsable  INTEGER REFERENCES usuario(id_usuario),
    comentario              VARCHAR(300),
    fecha_cambio            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE notificacion (
    id_notificacion  SERIAL PRIMARY KEY,
    id_usuario       INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
    id_reporte       INTEGER REFERENCES reporte(id_reporte) ON DELETE CASCADE,
    mensaje          VARCHAR(300) NOT NULL,
    leida            BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_envio      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =========================================================================
-- ÍNDICES
-- =========================================================================

CREATE INDEX idx_usuario_rol           ON usuario(id_rol);
CREATE INDEX idx_usuario_municipalidad ON usuario(id_municipalidad);
CREATE INDEX idx_reporte_municipalidad ON reporte(id_municipalidad);
CREATE INDEX idx_reporte_estado        ON reporte(id_estado_actual);
CREATE INDEX idx_reporte_tipo          ON reporte(id_tipo_incidencia);
CREATE INDEX idx_evidencia_reporte     ON evidencia_fotografica(id_reporte);
CREATE INDEX idx_historial_reporte     ON historial_estado(id_reporte);
CREATE INDEX idx_notificacion_usuario  ON notificacion(id_usuario);

-- Índice espacial (GiST) para consultas geográficas con PostGIS
CREATE INDEX idx_reporte_ubicacion
    ON reporte
    USING GIST (ST_SetSRID(ST_MakePoint(longitud, latitud), 4326));
