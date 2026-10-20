# EcoReporte GT

**Versión 1.0.0**

Plataforma digital para la detección, registro y seguimiento de vertederos clandestinos en zonas urbanas de municipios del departamento de Guatemala.

Proyecto de graduación — Ingeniería en Sistemas, Universidad Mariano Gálvez de Guatemala.

## Tecnologías

- **Frontend:** Vue.js 3 + Vite + Vue Router + Leaflet (OpenStreetMap) + Chart.js
- **Backend:** Node.js + Express
- **Base de datos:** PostgreSQL + PostGIS (detección de la municipalidad por ubicación)
- **Autenticación:** JWT (JSON Web Tokens) con control de acceso por rol; contraseñas cifradas con bcrypt
- **Pruebas:** Jest + Supertest (pruebas de integración del backend)

## Estructura del proyecto

```
ecoreporte/
├── database/
│   ├── 01_esquema.sql              Estructura de las 9 tablas + índices (activa PostGIS)
│   ├── 02_datos_iniciales.sql      Catálogos y usuarios demo base
│   ├── 03_evidencia_base64.sql     Evidencias fotográficas en base64
│   ├── 04_rol_cuadrilla.sql        Rol encargado_cuadrilla + usuario demo
│   ├── 05_limites_municipales.sql  Límites de los 17 municipios (PostGIS)
│   └── demo_fotos/                 Fotos de los datos de demostración (ver CREDITOS.md)
├── backend/
│   ├── src/
│   │   ├── app.js              App de Express (la usan el servidor y las pruebas)
│   │   ├── index.js            Punto de entrada del servidor
│   │   ├── config/db.js        Conexión a PostgreSQL
│   │   ├── middleware/auth.js  Verificación de JWT y roles
│   │   ├── controllers/        Lógica de negocio
│   │   ├── routes/index.js     Rutas de la API
│   │   ├── utils/ubicacion.js  Municipalidad según la ubicación (PostGIS)
│   │   ├── seed.js             Contraseñas de los usuarios demo base (npm run seed)
│   │   └── demo.js             Datos de demostración (npm run demo)
│   ├── scripts/                Carga del esquema (bd:esquema), base de pruebas (test:bd) y mediciones
│   ├── tests/                  Pruebas de integración (npm test)
│   ├── .env.example            Plantilla de variables de entorno
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── views/              Pantallas (Reportar, Mapa, Panel, Estadísticas, etc.)
│   │   ├── layouts/            Portal ciudadano y portal municipal
│   │   ├── components/         Componentes reutilizables (galería de evidencias)
│   │   ├── services/api.js     Llamadas a la API (axios + manejo de sesión)
│   │   ├── utils/              Sesión, fotos y enlaces a mapas
│   │   └── router/index.js     Rutas de navegación y permisos por rol
│   └── package.json
└── docs/PRUEBAS.md             Casos y resultados de las pruebas
```

---

## Requisitos previos

1. **Node.js 18 o superior** — https://nodejs.org
2. **PostgreSQL 15 o superior** — https://www.postgresql.org/download/
3. **PostGIS 3** (extensión geográfica de PostgreSQL). En Windows se instala con el
   *Stack Builder* que viene con PostgreSQL (categoría *Spatial Extensions*).

> En Windows, `psql` suele no estar en el `PATH`. Podés usar la ruta completa, por ejemplo
> `"C:\Program Files\PostgreSQL\17\bin\psql.exe"`, o agregar esa carpeta al `PATH`.

---

## Instalación

### Paso 1 — Crear la base de datos

Desde la carpeta del proyecto, creá la base y cargá los scripts **en orden**:

```bash
psql -U postgres -c "CREATE DATABASE ecoreporte"
psql -U postgres -d ecoreporte -f database/01_esquema.sql
psql -U postgres -d ecoreporte -f database/02_datos_iniciales.sql
psql -U postgres -d ecoreporte -f database/03_evidencia_base64.sql
psql -U postgres -d ecoreporte -f database/04_rol_cuadrilla.sql
psql -U postgres -d ecoreporte -f database/05_limites_municipales.sql
```

| Script | Qué hace |
|---|---|
| `01_esquema.sql` | Activa PostGIS y crea las 9 tablas con sus índices. |
| `02_datos_iniciales.sql` | Roles, estados, tipos de incidencia, la Municipalidad de Guatemala y los usuarios demo base. |
| `03_evidencia_base64.sql` | Permite guardar las fotos de evidencia en base64. |
| `04_rol_cuadrilla.sql` | Agrega el rol `encargado_cuadrilla` y su usuario demo. |
| `05_limites_municipales.sql` | Agrega los límites de los 17 municipios del departamento de Guatemala. Solo la Municipalidad de Guatemala queda activa. |

> Los scripts 04 y 05 se pueden volver a ejecutar sin duplicar datos. Si PostGIS no está
> instalado, el script 01 falla en `CREATE EXTENSION postgis`: instalalo y volvé a ejecutarlo.

### Paso 2 — Configurar y arrancar el backend

```bash
cd backend
npm install
cp .env.example .env
```

Editá `backend/.env`:

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `DB_HOST` | Servidor de PostgreSQL | `localhost` |
| `DB_PORT` | Puerto de PostgreSQL | `5432` |
| `DB_NAME` | Nombre de la base | `ecoreporte` |
| `DB_USER` | Usuario de PostgreSQL | `postgres` |
| `DB_PASSWORD` | Contraseña de ese usuario | — (obligatoria) |
| `PORT` | Puerto de la API | `3000` |
| `JWT_SECRET` | Clave para firmar los tokens: usá una cadena larga y aleatoria | — (obligatoria) |
| `JWT_EXPIRES_IN` | Duración de la sesión | `8h` |
| `DATABASE_URL` | Solo para usar una base en la nube (Neon): si está definida, reemplaza a las `DB_*` (ver "Despliegue") | — (vacía en local) |
| `NODE_ENV` | `production` en el servidor de producción | — |
| `DEMO_PASSWORD` | Contraseña que asignan `npm run seed` y `npm run demo` a los usuarios de demostración (mínimo 6 caracteres) | `password123` |

Asigná las contraseñas de los usuarios demo base y arrancá el servidor:

```bash
npm run seed
npm run dev
```

Deberías ver:

```
Conexión a PostgreSQL exitosa: ...
Servidor escuchando en http://localhost:3000
```

Dejá esta terminal abierta.

### Paso 3 — Arrancar el frontend

En **otra** terminal:

```bash
cd frontend
npm install
npm run dev
```

Abrí http://localhost:5173. Vite redirige las llamadas a `/api` al backend en el puerto 3000.

Para generar la versión de producción: `npm run build` (queda en `frontend/dist/`).

### Paso 4 (opcional) — Cargar los datos de demostración

```bash
cd backend
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

**Fotos:** usa las imágenes de `database/demo_fotos/` (JPG, PNG o WebP): las que empiezan con
`antes_` como evidencia del ciudadano y las que empiezan con `despues_` como evidencia de la
limpieza. Si la carpeta no existe, genera imágenes de muestra. Las fotos incluidas son de Pexels
(ver `database/demo_fotos/CREDITOS.md`).

> ⚠️ No lo ejecutes sobre una base con datos reales: reemplaza todos los reportes.

---

## Usuarios de demostración

Todos usan la contraseña **password123**, salvo que `DEMO_PASSWORD` defina otra al correr
`npm run seed` y `npm run demo` (ver "Despliegue"). El ciudadano entra por el portal ciudadano
(`/portal/login`); el resto, por el portal municipal (`/municipal/login`).

**Usuarios base** (scripts 02 y 04 + `npm run seed`):

| Rol                 | Correo                  | Municipalidad |
|---------------------|-------------------------|---------------|
| Administrador       | admin@ecoreporte.gt     | Todas         |
| Coordinador         | municipal@ecoreporte.gt | Guatemala     |
| Encargado cuadrilla | cuadrilla@ecoreporte.gt | Guatemala     |
| Ciudadano           | ciudadano@ecoreporte.gt | —             |

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

---

## Funcionalidades por rol

**Cualquier persona (sin cuenta)**
- Reportar un vertedero desde el mapa, con descripción y hasta 5 fotos. La municipalidad que lo
  atenderá se detecta automáticamente por la ubicación (PostGIS); si la zona no está cubierta,
  se avisa y no se puede enviar.
- Consultar el estado e historial de un reporte con su código de seguimiento.
- Ver el mapa público de reportes, con filtros por estado y tipo.

**Ciudadano registrado**
- Todo lo anterior; sus reportes quedan asociados a su cuenta.
- *Mis reportes*: estado, historial y, cuando el reporte se resuelve, las fotos de la limpieza.
- Notificaciones de cada cambio de estado de sus reportes.
- Registro de cuenta y recuperación de contraseña.
- *Mi cuenta* (clic en su nombre, en la barra superior): datos de la cuenta y cambio de la
  contraseña propia.

**Coordinador (personal municipal)** — solo reportes de su municipalidad
- Lista de reportes y detalle con la evidencia del ciudadano ("antes") y de la limpieza ("después").
- Asignar un reporte recibido a un encargado de cuadrilla, reasignarlo mientras siga asignado, o
  descartarlo con un motivo obligatorio.
- Estadísticas de su municipalidad: tarjetas de resumen, gráfica por estado y por tipo, filtro por fechas.

**Encargado de cuadrilla** — solo reportes asignados a él
- Panel pensado para el celular: pendientes, en atención y resueltos, con enlace "Cómo llegar".
- Iniciar la atención y marcar el reporte como resuelto con 1 a 5 fotos de la limpieza
  (obligatorias), tomadas con la cámara del celular.

**Administrador**
- Gestión de usuarios: crear coordinadores, encargados de cuadrilla y administradores,
  activar o desactivar cuentas y restablecer la contraseña de cualquier cuenta (también de
  ciudadanos) buscándola por correo.
- Catálogos: tipos de incidencia y municipalidades; activar una municipalidad significa que
  adoptó la plataforma y empieza a recibir los reportes de su territorio.
- Estadísticas globales, con filtro por municipalidad. Ve todos los reportes en solo lectura:
  no interviene en su atención.

**Todo el personal** (coordinador, cuadrilla y administrador) tiene *Mi cuenta* en el menú
lateral, para ver sus datos y cambiar su propia contraseña.

**Flujo de un reporte:** `recibido` → `asignado` (coordinador) → `en_atencion` (cuadrilla) →
`resuelto` (cuadrilla, con fotos). Desde `recibido`, el coordinador también puede pasarlo a
`descartado`. El backend valida cada transición y el rol de quien la hace; cada cambio queda en
el historial y se notifica al ciudadano.

---

## Endpoints de la API

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/auth/registro` | Público | Crear cuenta de ciudadano |
| POST | `/api/auth/login` | Público | Iniciar sesión |
| POST | `/api/auth/recuperar` | Público | Solicitar recuperación de contraseña |
| POST | `/api/auth/restablecer` | Público | Restablecer contraseña |
| GET | `/api/catalogos/tipos` | Público | Tipos de incidencia |
| GET | `/api/catalogos/estados` | Público | Estados del reporte |
| GET | `/api/catalogos/municipalidades` | Público | Municipalidades activas |
| GET | `/api/catalogos/municipalidad-por-ubicacion?lat=&lng=` | Público | Municipalidad que cubre un punto |
| GET | `/api/catalogos/limites-activos` | Público | Contornos de las municipalidades activas (GeoJSON) |
| POST | `/api/reportes` | Público (con sesión, queda a nombre del usuario) | Registrar un reporte |
| GET | `/api/reportes` | Público (con sesión, filtrado por rol) | Listar reportes |
| GET | `/api/reportes/consulta/:codigo` | Público | Consultar por código de seguimiento |
| GET | `/api/reportes/mis-reportes` | Autenticado | Reportes que registró el usuario |
| GET | `/api/reportes/:id/detalle` | Coordinador, cuadrilla, admin | Detalle completo |
| GET | `/api/reportes/:id/asignables` | Coordinador, admin | Encargados de cuadrilla asignables |
| POST | `/api/reportes/:id/asignar` | Coordinador | Asignar o reasignar cuadrilla |
| POST | `/api/reportes/:id/descartar` | Coordinador | Descartar (con motivo) |
| POST | `/api/reportes/:id/iniciar` | Cuadrilla | Iniciar la atención |
| POST | `/api/reportes/:id/resolver` | Cuadrilla | Resolver (con 1 a 5 fotos) |
| GET | `/api/notificaciones` | Autenticado | Notificaciones propias |
| PUT | `/api/notificaciones/:id/leida` | Autenticado | Marcar como leída |
| PUT | `/api/cuenta/password` | Autenticado | Cambiar la contraseña propia (pide la actual) |
| GET | `/api/estadisticas/resumen` | Coordinador, admin | Totales por estado |
| GET | `/api/estadisticas/por-estado` | Coordinador, admin | Conteo por estado |
| GET | `/api/estadisticas/por-tipo` | Coordinador, admin | Conteo por tipo de incidencia |
| GET/POST | `/api/admin/usuarios` | Administrador | Listar y crear cuentas |
| PUT | `/api/admin/usuarios/:id/estado` | Administrador | Activar o desactivar una cuenta |
| POST | `/api/admin/usuarios/restablecer-password` | Administrador | Asignar una contraseña nueva a cualquier cuenta, por correo |
| GET | `/api/admin/roles` | Administrador | Roles asignables |
| GET/POST | `/api/admin/tipos-incidencia` | Administrador | Listar y crear tipos |
| PUT | `/api/admin/tipos-incidencia/:id` | Administrador | Editar un tipo |
| GET/POST | `/api/admin/municipalidades` | Administrador | Listar y crear municipalidades |
| PUT | `/api/admin/municipalidades/:id` | Administrador | Editar una municipalidad |
| PUT | `/api/admin/municipalidades/:id/estado` | Administrador | Activar o desactivar una municipalidad |

Las estadísticas aceptan `fecha_inicio` y `fecha_fin` (`YYYY-MM-DD`); el administrador puede
filtrar además por `id_municipalidad`.

---

## Pruebas

El backend tiene 42 pruebas de integración automatizadas (Jest + Supertest) que corren contra una
base de datos aparte, `ecoreporte_test`, sin tocar los datos de la aplicación. Desde `backend/`:

```bash
cp .env.test.example .env.test   # una sola vez: completá DB_PASSWORD
npm run test:bd                  # crea y carga la base de pruebas
npm test                         # corre las pruebas
```

Casos, resultados y defectos: [docs/PRUEBAS.md](docs/PRUEBAS.md).

Las pruebas siempre usan la base local de `.env.test`: aunque `backend/.env` tenga una
`DATABASE_URL` (por ejemplo la de Neon), se ignora al correr `npm test` o `npm run test:bd`.

---

## Despliegue (Neon + Render)

En producción, la base de datos está en **Neon** (PostgreSQL con PostGIS) y un solo servicio web
en **Render** sirve la API (`/api/...`) y el frontend compilado (`frontend/dist`). Cualquier ruta
que no sea de la API devuelve `index.html`, así que recargar páginas como `/portal/mapa` funciona.

### 1. Base de datos en Neon

1. Creá un proyecto en https://neon.tech y copiá la cadena de conexión
   (*Dashboard → Connection string*), con la forma
   `postgresql://USUARIO:CONTRASEÑA@HOST/BASE?sslmode=require`.
2. Cargá el esquema y los datos iniciales **desde tu equipo**: poné esa cadena en
   `backend/.env` como `DATABASE_URL=...` (si está definida, el backend la usa con SSL e ignora
   las variables `DB_*`) y ejecutá, desde `backend/`:

   ```bash
   npm run bd:esquema   # ejecuta database/01 a 05 (no necesita psql); no hace nada si ya hay tablas
   npm run seed         # contraseñas de los usuarios demo base
   npm run demo         # opcional: datos de demostración (BORRA todos los reportes)
   ```

   El script 01 activa PostGIS (`CREATE EXTENSION postgis`), que Neon soporta.
3. Al terminar, quitá o comentá `DATABASE_URL` en `backend/.env` para volver a trabajar con la
   base local.

> ⚠️ Por defecto, los usuarios demo quedan con la contraseña pública `password123`. Antes de
> correr `npm run seed` y `npm run demo` contra Neon, agregá a `backend/.env` una contraseña
> propia en `DEMO_PASSWORD` (mínimo 6 caracteres): ambos scripts la asignan a todas las cuentas
> demo y no la muestran en la consola. Las pruebas automatizadas no la usan. También podés
> desactivar las cuentas que no necesites desde *Administración → Usuarios*.

### 2. Servicio web en Render

Creá un **Web Service** conectado al repositorio, con estos valores:

| Campo | Valor |
|---|---|
| Root Directory | *(vacío: la raíz del repositorio)* |
| Runtime | Node |
| Build Command | `npm ci --include=dev --prefix frontend && npm run build --prefix frontend && npm ci --prefix backend` |
| Start Command | `npm start --prefix backend` |
| Health Check Path | `/api/salud` |

`--include=dev` es necesario porque Vite es una dependencia de desarrollo del frontend y, con
`NODE_ENV=production`, `npm ci` no la instalaría.

**Variables de entorno** (*Environment*):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Cadena de conexión de Neon |
| `JWT_SECRET` | Cadena larga y aleatoria, distinta de la de desarrollo (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `JWT_EXPIRES_IN` | `8h` |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` (versión de Node que usa Render; el proyecto se probó con 22.20.0) |

`PORT` no hace falta: Render la define y el backend la usa. `NODE_ENV=production` es
obligatoria: además de identificar el entorno, hace que la recuperación de contraseña no
devuelva el token (ver "Notas para el desarrollo"). `DEMO_PASSWORD` tampoco va en Render:
solo la usan `npm run seed` y `npm run demo`, que se corren desde tu equipo (paso 1).

### 3. Verificación

- `https://<tu-servicio>.onrender.com/api/salud` responde
  `{"mensaje":"API de EcoReporte GT en funcionamiento.","version":"1.0.0"}`.
- `https://<tu-servicio>.onrender.com/` muestra la app, y recargar `/portal/mapa` no da 404.

---

## Notas para el desarrollo

- El frontend usa un *proxy* de Vite: las llamadas a `/api` se redirigen al backend en el puerto
  3000, así que no hay problemas de CORS durante el desarrollo.
- Las contraseñas se almacenan cifradas con bcrypt; nunca en texto plano.
- **Sesión:** el token JWT se guarda en `localStorage` y se envía en cada petición. Vence a las
  8 horas (`JWT_EXPIRES_IN`). Si venció, el frontend borra la sesión; si una ruta protegida
  responde 401, lleva al usuario al login de su portal con el aviso "Tu sesión expiró, iniciá
  sesión de nuevo.". Las rutas públicas siguen funcionando sin sesión.
- **Recuperación de contraseña:** en esta versión no se envían correos. En desarrollo, el backend
  devuelve el token de recuperación en la respuesta para poder completar el flujo. Con
  `NODE_ENV=production` nunca lo devuelve: responde siempre "La recuperación automática por
  correo todavía no está disponible. Si tu correo está registrado, pedile al administrador de
  EcoReporte GT que restablezca tu contraseña.", exista o no el correo, y la pantalla muestra
  solo ese mensaje. El administrador la restablece desde *Administración → Usuarios →
  Restablecer contraseña* (o con el botón de la llave en cada cuenta de personal): asigna una
  contraseña temporal, que puede generar ahí mismo, y se la comunica a la persona. Después,
  esa persona la cambia por una propia desde *Mi cuenta*.

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
