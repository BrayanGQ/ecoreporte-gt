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
│   ├── 01_esquema.sql              Estructura de las 9 tablas + índices
│   ├── 02_datos_iniciales.sql      Catálogos y usuarios de demostración
│   ├── 03_evidencia_base64.sql     Evidencias fotográficas en base64
│   ├── 04_rol_cuadrilla.sql        Rol encargado_cuadrilla + usuario demo
│   └── 05_limites_municipales.sql  Límites de los 17 municipios (PostGIS)
├── backend/
│   ├── src/
│   │   ├── config/db.js        Conexión a PostgreSQL
│   │   ├── middleware/auth.js  Verificación de JWT y roles
│   │   ├── controllers/        Lógica de negocio
│   │   ├── routes/index.js     Definición de rutas de la API
│   │   ├── seed.js             Genera contraseñas de los usuarios demo
│   │   ├── demo.js             Carga los datos de demostración (npm run demo)
│   │   ├── app.js              App de Express (la usan el servidor y las pruebas)
│   │   └── index.js            Punto de entrada del servidor
│   ├── scripts/                Preparación de la base de pruebas (npm run test:bd)
│   ├── tests/                  Pruebas de integración (npm test)
│   └── package.json
├── docs/PRUEBAS.md             Casos y resultados de las pruebas
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
psql -U postgres -d ecoreporte -f database/03_evidencia_base64.sql
psql -U postgres -d ecoreporte -f database/04_rol_cuadrilla.sql
psql -U postgres -d ecoreporte -f database/05_limites_municipales.sql
```

> Los scripts 04 y 05 se pueden volver a ejecutar sin duplicar datos. El 05 registra los
> 17 municipios del departamento de Guatemala con su límite territorial; solo la
> Municipalidad de Guatemala queda activa (ver "Datos geográficos" más abajo).

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

## Datos de demostración

Para presentar el sistema con datos realistas, después de los pasos 1 y 2 ejecutá (desde `backend/`):

```bash
npm run demo
```

El script `backend/src/demo.js`:

- **Borra todos los reportes**, evidencias, historial y notificaciones (y reinicia la numeración:
  los códigos vuelven a empezar en `ER-AAAA-0001`). También borra los usuarios que no sean los
  demo base ni los de la demostración.
- Conserva los catálogos, los límites municipales y los usuarios demo base.
- Deja **activas** solo las municipalidades de **Guatemala, Mixco y Villa Nueva**.
- Crea un coordinador y dos encargados de cuadrilla por municipalidad, y 5 ciudadanos.
- Carga **28 reportes** entre el 1 de septiembre y la fecha en que se ejecuta, dentro del límite
  de su municipio (verificado con `ST_Contains`), con estados variados que siguen el flujo real:
  historial completo, notificaciones para los ciudadanos registrados (las de los últimos 10 días
  quedan sin leer) y evidencia fotográfica. Todo reporte resuelto tiene fotos de la limpieza.
- Se puede volver a ejecutar las veces que haga falta: siempre deja el mismo estado de demostración.

**Fotos:** si existe la carpeta `database/demo_fotos/`, se usan sus imágenes (JPG, PNG o WebP):
las que empiezan con `antes_` como evidencia del ciudadano y las que empiezan con `despues_`
como evidencia de la limpieza. Si no existe, se generan imágenes de muestra.

> ⚠️ No lo ejecutes sobre una base con datos reales: reemplaza todos los reportes.

---

## Usuarios de demostración

Todos usan la contraseña: **password123**

**Usuarios base** (se crean con los scripts 02 y 04 y `npm run seed`):

| Rol                  | Correo                  | Municipalidad | Acceso                           |
|----------------------|-------------------------|---------------|----------------------------------|
| Administrador        | admin@ecoreporte.gt     | Todas         | Usuarios, catálogos y estadísticas globales |
| Coordinador          | municipal@ecoreporte.gt | Guatemala     | Asigna, reasigna y descarta      |
| Encargado cuadrilla  | cuadrilla@ecoreporte.gt | Guatemala     | Atiende y resuelve lo asignado   |
| Ciudadano            | ciudadano@ecoreporte.gt | —             | Reportar y consultar             |

**Usuarios de la demostración** (`npm run demo`):

| Rol                 | Nombre                   | Correo                         | Municipalidad |
|---------------------|--------------------------|--------------------------------|---------------|
| Coordinador         | Ana Lucía Morales        | ana.morales@ecoreporte.gt      | Guatemala     |
| Encargado cuadrilla | Carlos Enrique Pérez     | carlos.perez@ecoreporte.gt     | Guatemala     |
| Encargado cuadrilla | José Luis Hernández      | jose.hernandez@ecoreporte.gt   | Guatemala     |
| Coordinador         | Mario Roberto Castillo   | mario.castillo@ecoreporte.gt   | Mixco         |
| Encargado cuadrilla | Luis Fernando Ramírez    | luis.ramirez@ecoreporte.gt     | Mixco         |
| Encargado cuadrilla | Edgar Antonio López      | edgar.lopez@ecoreporte.gt      | Mixco         |
| Coordinador         | Claudia Patricia Gómez   | claudia.gomez@ecoreporte.gt    | Villa Nueva   |
| Encargado cuadrilla | Byron Alexander Juárez   | byron.juarez@ecoreporte.gt     | Villa Nueva   |
| Encargado cuadrilla | Henry Estuardo Pineda    | henry.pineda@ecoreporte.gt     | Villa Nueva   |
| Ciudadano           | María José García        | maria.garcia@ecoreporte.gt     | —             |
| Ciudadano           | Juan Pablo Rodríguez     | juan.rodriguez@ecoreporte.gt   | —             |
| Ciudadano           | Sofía Alejandra Méndez   | sofia.mendez@ecoreporte.gt     | —             |
| Ciudadano           | Diego Andrés Orellana    | diego.orellana@ecoreporte.gt   | —             |
| Ciudadano           | Lucía Fernanda Cifuentes | lucia.cifuentes@ecoreporte.gt  | —             |

Los coordinadores y encargados entran por el portal municipal (`/municipal/login`); los
ciudadanos, por el portal ciudadano (`/portal/login`).

---

## Funcionalidades implementadas

- **Registro ciudadano de reportes** con geolocalización sobre el mapa (Leaflet + OpenStreetMap), sin necesidad de crear cuenta. La municipalidad que atiende el reporte se detecta automáticamente según la ubicación (PostGIS).
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
| GET    | /api/catalogos/municipalidad-por-ubicacion?lat=&lng= | Público | Municipalidad que cubre un punto |
| GET    | /api/catalogos/limites-activos    | Público           | Contornos de las municipalidades activas (GeoJSON) |
| POST   | /api/reportes                     | Público           | Registrar un reporte               |
| GET    | /api/reportes                     | Público           | Listar reportes (con filtros)      |
| GET    | /api/reportes/consulta/:codigo    | Público           | Consultar por código               |
| GET    | /api/reportes/:id/detalle         | Autenticado       | Detalle completo del reporte       |
| POST   | /api/reportes/:id/asignar         | Coordinador       | Asignar o reasignar cuadrilla      |
| POST   | /api/reportes/:id/descartar       | Coordinador       | Descartar (con motivo)             |
| POST   | /api/reportes/:id/iniciar         | Cuadrilla         | Iniciar la atención                |
| POST   | /api/reportes/:id/resolver        | Cuadrilla         | Resolver (con 1 a 5 fotos)         |
| PUT    | /api/admin/municipalidades/:id/estado | Administrador | Activar o desactivar municipalidad |

---

## Pruebas

El backend tiene 37 pruebas de integración automatizadas (Jest + Supertest) que corren contra una
base de datos aparte, `ecoreporte_test`, sin tocar los datos de la aplicación. Desde `backend/`:

```bash
cp .env.test.example .env.test   # una sola vez: completá DB_PASSWORD
npm run test:bd                  # crea y carga la base de pruebas
npm test                         # corre las pruebas
```

Casos, resultados y defectos: [docs/PRUEBAS.md](docs/PRUEBAS.md).

---

## Notas para el desarrollo

- El frontend usa un *proxy* de Vite: todas las llamadas a `/api` se redirigen automáticamente al backend en el puerto 3000, así que no hay problemas de CORS durante el desarrollo.
- Las contraseñas se almacenan cifradas con bcrypt; nunca en texto plano.
- El token JWT se guarda en `localStorage` y se envía automáticamente en cada petición autenticada.

---

## Datos geográficos

Los límites municipales de `database/05_limites_municipales.sql` provienen de
**geoBoundaries** (https://www.geoboundaries.org/), conjunto *gbOpen* de Guatemala, nivel
**ADM2** (municipios), release `9469f09`, año representado 2021. El dato original es de
CONRED y OCHA, publicado en data.humdata.org.

- **Licencia:** Creative Commons Attribution 3.0 IGO (CC BY 3.0 IGO). Se permite su uso,
  incluso comercial, citando la fuente.
- **Cita:** Runfola, D. et al. (2020) *geoBoundaries: A global database of political
  administrative boundaries.* PLoS ONE 15(4): e0231866.
- **Selección:** los 17 municipios ADM2 cuyo punto interior cae dentro del departamento de
  Guatemala (ADM1 del mismo conjunto). Dos nombres se ajustaron al nombre oficial:
  "Petapa" → San Miguel Petapa y "San Raimundo" → San Raymundo.
- **Precisión:** coordenadas redondeadas a 7 decimales (~1 cm). Son límites de referencia
  para asignar reportes, no límites legales oficiales.

Una municipalidad **activa** es la que adoptó la plataforma: los reportes cuya ubicación cae
dentro de su límite se le asignan automáticamente. El administrador la activa o desactiva
desde *Administración → Catálogos → Municipalidades*. Si un punto no cae en ninguna
municipalidad activa, el reporte no se puede registrar.
