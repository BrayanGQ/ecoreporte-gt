# EcoReporte GT

Plataforma digital para la detección, registro y seguimiento de vertederos clandestinos en zonas urbanas de municipios del departamento de Guatemala.

Proyecto de graduación — Ingeniería en Sistemas, Universidad Mariano Gálvez de Guatemala.

## Tecnologías

- **Frontend:** Vue.js 3 + Vite + Leaflet (OpenStreetMap)
- **Backend:** Node.js + Express
- **Base de datos:** PostgreSQL + PostGIS
- **Autenticación:** JWT (JSON Web Tokens) con control de acceso por rol

## Estructura del proyecto

```
ecoreporte/
├── database/
│   ├── 01_esquema.sql          Estructura de las 9 tablas + índices
│   └── 02_datos_iniciales.sql  Catálogos y usuarios de demostración
├── backend/
│   ├── src/
│   │   ├── config/db.js        Conexión a PostgreSQL
│   │   ├── middleware/auth.js  Verificación de JWT y roles
│   │   ├── controllers/        Lógica de negocio
│   │   ├── routes/index.js     Definición de rutas de la API
│   │   ├── seed.js             Genera contraseñas de los usuarios demo
│   │   └── index.js            Punto de entrada del servidor
│   └── package.json
└── frontend/
    ├── src/
    │   ├── views/              Pantallas (Reportar, Mapa, Consultar, etc.)
    │   ├── services/api.js     Llamadas a la API
    │   ├── router/index.js     Rutas de navegación
    │   └── App.vue
    └── package.json
```

---

## Requisitos previos

Antes de empezar, instalá en tu máquina:

1. **Node.js** (versión 18 o superior) — https://nodejs.org
2. **PostgreSQL** (versión 15 o superior) — https://www.postgresql.org/download/
3. **PostGIS** (extensión de PostgreSQL para datos geográficos) — normalmente se instala junto con PostgreSQL mediante el "Stack Builder" en Windows.

---

## Paso 1 — Crear la base de datos

Abrí una terminal y entrá a PostgreSQL con el usuario `postgres`:

```bash
psql -U postgres
```

Creá la base de datos y salí:

```sql
CREATE DATABASE ecoreporte;
\q
```

Cargá el esquema y los datos iniciales (desde la carpeta del proyecto):

```bash
psql -U postgres -d ecoreporte -f database/01_esquema.sql
psql -U postgres -d ecoreporte -f database/02_datos_iniciales.sql
```

> Si PostGIS no está habilitado, el primer script mostrará un error en la línea `CREATE EXTENSION postgis`. En ese caso, instalá PostGIS y volvé a ejecutarlo.

---

## Paso 2 — Configurar y arrancar el backend

```bash
cd backend
npm install
```

Copiá el archivo de configuración de ejemplo y ajustá los valores:

```bash
cp .env.example .env
```

Abrí `.env` y verificá que `DB_PASSWORD` coincida con la contraseña de tu usuario `postgres`.

Generá las contraseñas de los usuarios de demostración:

```bash
npm run seed
```

Arrancá el servidor:

```bash
npm run dev
```

Deberías ver:

```
Conexión a PostgreSQL exitosa: ...
Servidor escuchando en http://localhost:3000
```

Dejá esta terminal abierta.

---

## Paso 3 — Configurar y arrancar el frontend

Abrí **otra** terminal:

```bash
cd frontend
npm install
npm run dev
```

Deberías ver algo como:

```
VITE v5  ready
➜  Local:   http://localhost:5173/
```

Abrí ese enlace en el navegador.

---

## Usuarios de demostración

Todos usan la contraseña: **password123**

| Rol                | Correo                     | Acceso                          |
|--------------------|----------------------------|---------------------------------|
| Administrador      | admin@ecoreporte.gt        | Configuración general           |
| Personal municipal | municipal@ecoreporte.gt    | Panel de gestión de reportes    |
| Ciudadano          | ciudadano@ecoreporte.gt    | Reportar y consultar            |

---

## Funcionalidades implementadas

- **Registro ciudadano de reportes** con geolocalización sobre el mapa (Leaflet + OpenStreetMap), sin necesidad de crear cuenta.
- **Mapa de reportes** con marcadores por color según el estado y filtros por estado y tipo.
- **Consulta pública** del estado de un reporte mediante su código de seguimiento.
- **Registro e inicio de sesión** de usuarios con contraseña cifrada (bcrypt).
- **Recuperación de contraseña** (flujo de dos pasos).
- **Panel municipal** con el listado de reportes y su gestión.
- **Detalle del reporte** con actualización de estado e historial de seguimiento.
- **Notificaciones** automáticas al ciudadano registrado cuando cambia el estado de su reporte.
- **Control de acceso por rol** mediante JWT.

---

## Endpoints principales de la API

| Método | Ruta                              | Acceso            | Descripción                        |
|--------|-----------------------------------|-------------------|------------------------------------|
| POST   | /api/auth/registro                | Público           | Crear cuenta de ciudadano          |
| POST   | /api/auth/login                   | Público           | Iniciar sesión                     |
| POST   | /api/auth/recuperar               | Público           | Solicitar recuperación             |
| POST   | /api/auth/restablecer             | Público           | Restablecer contraseña             |
| GET    | /api/catalogos/tipos              | Público           | Tipos de incidencia                |
| GET    | /api/catalogos/municipalidades    | Público           | Municipalidades activas            |
| POST   | /api/reportes                     | Público           | Registrar un reporte               |
| GET    | /api/reportes                     | Público           | Listar reportes (con filtros)      |
| GET    | /api/reportes/consulta/:codigo    | Público           | Consultar por código               |
| GET    | /api/reportes/:id/detalle         | Autenticado       | Detalle completo del reporte       |
| PUT    | /api/reportes/:id/estado          | Municipal/Admin   | Actualizar estado                  |

---

## Notas para el desarrollo

- El frontend usa un *proxy* de Vite: todas las llamadas a `/api` se redirigen automáticamente al backend en el puerto 3000, así que no hay problemas de CORS durante el desarrollo.
- Las contraseñas se almacenan cifradas con bcrypt; nunca en texto plano.
- El token JWT se guarda en `localStorage` y se envía automáticamente en cada petición autenticada.
