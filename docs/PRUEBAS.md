# Pruebas de integración — Backend EcoReporte GT

Pruebas automatizadas de la API REST (`backend/`) con **Jest** y **Supertest**. Cada prueba
hace peticiones HTTP reales a la aplicación Express (sin abrir un puerto) contra una base de
datos PostgreSQL/PostGIS **exclusiva para pruebas** (`ecoreporte_test`), cargada con los mismos
scripts y datos de demostración que la aplicación.

## Cómo prepararlas y correrlas

Requisitos: PostgreSQL con PostGIS y las dependencias del backend instaladas (`npm install`).

1. **Configurar la base de pruebas** (una sola vez). Desde `backend/`:

   ```bash
   cp .env.test.example .env.test
   ```

   Completá `DB_PASSWORD`. `DB_NAME` debe terminar en `_test` (por defecto `ecoreporte_test`):
   si no, las pruebas se niegan a correr para no tocar la base de la aplicación.
   `.env.test` está en `.gitignore`.

2. **Preparar la base de pruebas**:

   ```bash
   npm run test:bd
   ```

   Se conecta a la base `postgres`, borra y vuelve a crear `ecoreporte_test`, ejecuta con `pg`
   (sin `psql`) los scripts `database/01` a `05` en orden, y corre la misma lógica que
   `npm run seed` y `npm run demo`. Hay que volver a ejecutarlo solo si cambian los scripts SQL
   o los datos de demostración.

3. **Correr las pruebas**:

   ```bash
   npm test
   ```

   Equivale a `jest --runInBand` (los archivos se ejecutan uno tras otro porque comparten la base).

### Cómo están armadas

| Archivo | Función |
|---|---|
| `backend/src/app.js` | Construye y exporta la app de Express (middlewares, rutas, 404). `src/index.js` solo verifica la conexión y llama a `app.listen()`. |
| `backend/scripts/preparar-bd-pruebas.js` | Prepara `ecoreporte_test` (`npm run test:bd`). |
| `backend/scripts/entorno-pruebas.js` | Carga `.env.test` y verifica que la base termine en `_test`. |
| `backend/tests/setup/entorno.js` | *setupFiles* de Jest: carga `.env.test` **antes** de que se importe `src/config/db.js`. |
| `backend/tests/setup/cerrar-pool.js` | *setupFilesAfterEnv*: borra los datos de prueba antes y después de cada archivo y cierra el pool al final. |
| `backend/tests/helpers.js` | Usuarios demo, inicio de sesión, puntos de prueba y creación de reportes. |
| `backend/tests/*.test.js` | Un archivo por módulo: `auth`, `reportes`, `flujo`, `permisos`, `admin`. |

- **Usuarios** (de `backend/src/demo.js`, contraseña `password123`): coordinadora de Guatemala
  (`ana.morales`), cuadrillas de Guatemala (`carlos.perez`, `jose.hernandez`), coordinador de
  Mixco (`mario.castillo`), ciudadana (`maria.garcia`) y `admin@ecoreporte.gt`.
- **Coordenadas**, calculadas con PostGIS sobre los límites cargados:
  `ST_PointOnSurface` del límite de Guatemala (zona cubierta), de Mixco, y de una municipalidad
  con límite pero inactiva; y un punto 0,5° al oeste de todos los límites, verificado con
  `ST_Contains` para que no caiga en ninguno.
- **Repetibles**: todo lo que crean las pruebas lleva la marca `[PRUEBA AUTOMATIZADA]` en la
  descripción, o un correo `prueba.*@prueba.test`, y se borra al terminar cada archivo. Los
  reportes arrastran su historial, evidencias y notificaciones por `ON DELETE CASCADE`. La
  prueba que desactiva Mixco la restaura en un bloque `finally`. Se verificó corriendo
  `npm test` varias veces seguidas: la base queda con los mismos 28 reportes, 18 usuarios,
  4 tipos y 3 municipalidades activas.

## Casos de prueba

Ejecución del 13/10/2026 sobre `ecoreporte_test`.

| ID | Módulo | Descripción | Resultado esperado | Resultado obtenido |
|---|---|---|---|---|
| CP-01 | Autenticación | Login correcto | 200 con token JWT y `usuario.rol = personal_municipal`; no expone `password_hash` | Aprobado |
| CP-02 | Autenticación | Login con contraseña incorrecta | 401 "Correo o contraseña incorrectos.", sin token | Aprobado |
| CP-03 | Autenticación | Registro de ciudadano nuevo y login con esa cuenta | Registro 201 con rol `ciudadano` y sin municipalidad; login 200 con token | Aprobado |
| CP-04 | Autenticación | Ruta protegida (`/api/reportes/mis-reportes`) sin token o con token inválido | 401 en ambos casos | Aprobado |
| CP-05 | Reportes | Crear reporte en zona cubierta | 201, código `ER-AAAA-NNNN`, municipalidad Guatemala detectada por PostGIS, estado `recibido` | Aprobado |
| CP-06 | Reportes | Crear reporte enviando otra `id_municipalidad` | 201; se ignora la del cliente y se asigna la del punto (Guatemala) | Aprobado |
| CP-07 | Reportes | Crear reporte fuera de todos los límites | 400 "Esta zona aún no está cubierta…" | Aprobado |
| CP-08 | Reportes | Crear reporte en un municipio con límite pero inactivo | 400 "Esta zona aún no está cubierta…" | Aprobado |
| CP-09 | Reportes | Crear reporte sin tipo de incidencia | 400 "Tipo de incidencia y ubicación son obligatorios." | Aprobado |
| CP-10 | Reportes | Crear reporte sin ubicación | 400 "Tipo de incidencia y ubicación son obligatorios." | Aprobado |
| CP-11 | Reportes | Crear reporte con 6 fotografías | 400 "Se permiten como máximo 5 fotografías por reporte." | Aprobado |
| CP-12 | Reportes | Consulta pública por código existente | 200 con código, estado `recibido`, municipalidad e historial | Aprobado |
| CP-13 | Reportes | Consulta pública por código inexistente | 404 "No se encontró un reporte con ese código." | Aprobado |
| CP-14 | Flujo | El coordinador asigna un reporte recibido a una cuadrilla de su municipalidad | 200, estado `asignado`, `id_usuario_asignado` = cuadrilla | Aprobado |
| CP-15 | Flujo | La cuadrilla asignada inicia la atención | 200, estado `en_atencion` | Aprobado |
| CP-16 | Flujo | Resolver sin fotos (sin campo y con arreglo vacío) | 400 "…obligatorio adjuntar al menos una foto…"; sigue `en_atencion` | Aprobado |
| CP-17 | Flujo | Resolver con 1 foto | 200, estado `resuelto`; evidencia `municipal` cargada por la cuadrilla; historial `recibido → asignado → en_atencion → resuelto` con el responsable correcto en cada paso; el detalle devuelve la evidencia con su tipo | Aprobado |
| CP-18 | Flujo | Descartar sin motivo (ausente o en blanco) | 400 "El motivo del descarte es obligatorio."; sigue `recibido` | Aprobado |
| CP-19 | Flujo | Descartar con motivo | 200, estado `descartado`; el historial registra el motivo y al coordinador | Aprobado |
| CP-20 | Flujo | Resolver un reporte recibido | Rechazado (403: aún no tiene cuadrilla asignada); sigue `recibido` | Aprobado |
| CP-21 | Flujo | Resolver un reporte asignado sin iniciar la atención | 400 "No se puede resolver un reporte en estado 'asignado'…"; sigue `asignado` | Aprobado |
| CP-22 | Flujo | Iniciar un reporte que no está asignado (ya resuelto) | 400 "No se puede iniciar la atención de un reporte en estado 'resuelto'…" | Aprobado |
| CP-23 | Flujo | Asignar un reporte ya resuelto | 400 "No se puede asignar un reporte en estado 'resuelto'…" | Aprobado |
| CP-24 | Permisos | El ciudadano intenta asignar, descartar, iniciar y resolver | 403 en las cuatro acciones; los estados no cambian | Aprobado |
| CP-25 | Permisos | El coordinador de Mixco asigna un reporte de Guatemala | 403 "No tenés acceso a este reporte."; sigue `recibido` | Aprobado |
| CP-26 | Permisos | El coordinador de Mixco abre el detalle de un reporte de Guatemala | 403, sin datos del reporte | Aprobado |
| CP-27 | Permisos | Una cuadrilla inicia un reporte asignado a otra | 403; sigue `asignado` | Aprobado |
| CP-28 | Permisos | Una cuadrilla resuelve un reporte asignado a otra | 403; sigue `en_atencion` | Aprobado |
| CP-29 | Permisos | El administrador asigna un reporte | 403; sigue `recibido` | Aprobado |
| CP-30 | Permisos | El administrador resuelve un reporte | 403; sigue `en_atencion` | Aprobado |
| CP-31 | Permisos | Estadísticas del coordinador | Guatemala y Mixco ven solo el total de su municipalidad, aunque Mixco pida `?id_municipalidad` de Guatemala; el admin ve el total global | Aprobado |
| CP-32 | Administración | El admin crea un usuario, lo desactiva y el usuario intenta iniciar sesión | Creación 201; login 200 antes; desactivación 200; login 403 "La cuenta se encuentra desactivada." | Aprobado |
| CP-33 | Administración | El admin crea y edita un tipo de incidencia | Creación 201; edición 200; cambios guardados y visibles en el catálogo público | Aprobado |
| CP-34 | Administración | Desactivar Mixco y reportar en su zona; reactivarla y reportar de nuevo | Inactiva: 400 de zona no cubierta. Activa: 201 asignado a Mixco | Aprobado |
| CP-35 | Administración | Coordinador, cuadrilla y ciudadano acceden a rutas `/api/admin` | 403 en todas las rutas probadas; Mixco no cambia de estado | Aprobado |

## Resumen

| Total de casos | Aprobados | Fallidos |
|---|---|---|
| 35 | 35 | 0 |

## Defectos encontrados y corregidos

| ID | Descripción | Archivo | Corrección |
|---|---|---|---|
| — | No se encontraron defectos en el sistema: los 35 casos pasaron en la primera ejecución contra el código existente. | — | — |

Durante la puesta a punto hubo un problema en la configuración de las pruebas, no en el sistema:
el pool de PostgreSQL se cerraba antes de que cada archivo terminara de limpiar sus datos.
Se resolvió moviendo la limpieza y el cierre del pool a un único `afterAll` en
`tests/setup/cerrar-pool.js`.

## Observaciones (fuera del alcance de estos casos)

- `POST /api/reportes` es público y toma `id_usuario_reporta` del cuerpo de la petición:
  cualquiera podría registrar un reporte a nombre de otro ciudadano. Convendría tomarlo del
  token cuando haya sesión iniciada. Ningún caso lo cubre y el código no se modificó.
