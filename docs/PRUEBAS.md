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
| `backend/tests/setup/mock-correo.js` | *setupFilesAfterEnv*: reemplaza `src/services/correo.js` por un mock en todas las pruebas, para que ninguna mande correos reales. Va antes de `cerrar-pool.js`, que ya carga la app. |
| `backend/tests/setup/cerrar-pool.js` | *setupFilesAfterEnv*: borra los datos de prueba antes y después de cada archivo y cierra el pool al final. |
| `backend/tests/helpers.js` | Usuarios demo, inicio de sesión, puntos de prueba y creación de reportes. |
| `backend/tests/*.test.js` | Un archivo por módulo: `auth`, `reportes`, `flujo`, `permisos`, `admin`, `correo`, `criticos` (módulos críticos), `defectos` (regresión de D-03 a D-05), `validaciones` (regresión de D-06 a D-12) y `reporteria` (listado de Estadísticas). |

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

Ejecución sobre `ecoreporte_test`: CP-01 a CP-35 el 13/10/2026; CP-36 y CP-37 tras la corrección de D-01; CP-38 a CP-42 el 20/10/2026 (corrección de D-02, restablecimiento por el administrador y cambio de la contraseña propia); CP-43 a CP-54 el 22/10/2026 (notificaciones por correo); CP-55 a CP-73 el 28/10/2026 (paquete de verificación del sistema de calidad: módulos críticos y regresión de D-03 a D-05); CP-74 a CP-86 el 29/10/2026 (regresión de D-06 a D-12 y reportería). La suite completa (86 casos) se volvió a ejecutar el 29/10/2026, después de `npm run test:bd`, con todos los casos aprobados.

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
| CP-36 | Reportes | Reporte sin sesión enviando en el cuerpo el `id_usuario_reporta` de otro usuario | 201; el reporte queda anónimo (`id_usuario_reporta` nulo), no a nombre del otro usuario | Aprobado |
| CP-37 | Reportes | Reporte con sesión de ciudadano enviando en el cuerpo el id de otro usuario | 201; el reporte y su foto quedan a nombre del ciudadano del token; aparece en sus "Mis reportes" y no en los del otro | Aprobado |
| CP-38 | Administración | El admin restablece la contraseña de un ciudadano buscándolo por correo (en mayúsculas) | 200 con la cuenta encontrada (rol `ciudadano`, sin `password_hash`); la contraseña anterior da 401 y la nueva 200 | Aprobado |
| CP-39 | Administración | Restablecer contraseña sin permisos o con datos inválidos | Coordinador 403; sin token 401; correo inexistente 404; contraseña corta o sin correo 400; la contraseña original sigue funcionando | Aprobado |
| CP-40 | Autenticación | Recuperación de contraseña con `NODE_ENV=production` (correo existente e inexistente) y en desarrollo | Producción: 200 sin `token_recuperacion` y la misma respuesta para ambos correos. Desarrollo: 200 con token | Aprobado |
| CP-41 | Autenticación | Un usuario con sesión cambia su contraseña (`PUT /api/cuenta/password`) | 200; la contraseña anterior da 401 y la nueva 200 | Aprobado |
| CP-42 | Autenticación | Cambio de contraseña sin sesión, con la actual incorrecta, nueva corta, igual a la actual o incompleto | Sin sesión 401; los demás 400 (la actual incorrecta da 400 y no 401, para no cerrar la sesión en el frontend); la contraseña no cambia | Aprobado |
| CP-43 | Correo | Ciudadano con sesión registra un reporte en Guatemala | 201; un correo al ciudadano con el código en el asunto y el enlace `/portal/consultar?codigo=...` (HTML y texto), y uno a cada coordinador **activo** de Guatemala con el enlace `/municipal/panel/reporte/:id`; el coordinador inactivo no recibe nada | Aprobado |
| CP-44 | Correo | Reporte anónimo | 201; solo los coordinadores reciben correo (indica "Reporte anónimo"); ninguno a un ciudadano | Aprobado |
| CP-45 | Correo | Descripción con `<script>`, `<b>`, comillas y `&` | En el HTML aparece escapada (`&lt;script&gt;...`), sin etiquetas activas; el texto plano la conserva tal cual | Aprobado |
| CP-46 | Correo | El coordinador asigna el reporte a una cuadrilla | 200; correo a la cuadrilla con tipo, descripción, municipalidad, enlace "Cómo llegar" de Google Maps con la latitud y longitud del reporte y enlace al reporte en el panel; correo al ciudadano "cambió a: Asignado" con el enlace de consulta | Aprobado |
| CP-47 | Correo | Reasignación a otra cuadrilla | 200; solo el encargado nuevo recibe "Te reasignaron el reporte ..."; el ciudadano no (el estado no cambia) | Aprobado |
| CP-48 | Correo | La cuadrilla inicia la atención y resuelve con foto | 200 y 200; el ciudadano recibe "cambió a: En atención" y "cambió a: Resuelto", en ese orden | Aprobado |
| CP-49 | Correo | El coordinador descarta un reporte con motivo que contiene `<...>` | 200; el ciudadano recibe "cambió a: Descartado" con el motivo escapado en el HTML y completo en el texto plano | Aprobado |
| CP-50 | Correo | Reporte anónimo: asignar, iniciar y descartar otro | Al asignar solo la cuadrilla recibe correo; iniciar y descartar no envían ninguno | Aprobado |
| CP-51 | Correo | Acción rechazada (descartar sin motivo) | 400 y ningún correo | Aprobado |
| CP-52 | Correo | Brevo falla: `enviarCorreo` rechaza la promesa al registrar y lanza un error síncrono al asignar | Registrar responde 201 con el mismo cuerpo de siempre y asignar 200 `{ mensaje, estado: 'asignado' }`; el reporte queda asignado; cada falla queda registrada en `console.error` | Aprobado |
| CP-53 | Correo (servicio) | `enviarCorreo` real con `NODE_ENV=test`; en producción hacia una cuenta demo (`@ecoreporte.gt`); y en producción sin `BREVO_API_KEY` | `{ enviado: false, motivo }` y no se llama a `fetch` | Aprobado |
| CP-54 | Correo (servicio) | `enviarCorreo` real configurado (`fetch` mockeado) | `POST https://api.brevo.com/v3/smtp/email` con el header `api-key`, remitente "EcoReporte GT" por defecto, destinatario, asunto, HTML y texto; si Brevo responde 401, la función lanza "Brevo respondió 401" | Aprobado |
| CP-55 | Autenticación | Registro con campos faltantes, contraseña corta o correo duplicado | 400 "Todos los campos son obligatorios."; 400 de contraseña corta; 409 "El correo ya está registrado." | Aprobado |
| CP-56 | Autenticación | Login sin contraseña o con un correo no registrado | 400 "Correo y contraseña son obligatorios."; 401 "Correo o contraseña incorrectos." sin token, sin revelar cuál dato falló | Aprobado |
| CP-57 | Autenticación | Recuperación de contraseña en desarrollo | Sin correo 400; correo inexistente y existente responden 200 con el mismo mensaje (solo el existente trae token); con el token se restablece: la nueva da 200 y la anterior 401 | Aprobado |
| CP-58 | Autenticación | Restablecer con datos incompletos, contraseña corta, token inválido o token de sesión | 400 en todos los casos; el token de inicio de sesión responde "Token no válido para esta operación." | Aprobado |
| CP-59 | Autenticación | Token firmado con otra clave o vencido en una ruta protegida | 401 en ambos; el vencido con "Token inválido o expirado." | Aprobado |
| CP-60 | Reportes | Coordenadas no numéricas, fuera de rango o vacías | 400 con el mensaje de ubicación no válida (o de datos obligatorios) | Aprobado |
| CP-61 | Reportes | Reporte con una foto válida y una cadena vacía | 201; queda una sola evidencia, de tipo `ciudadana` | Aprobado |
| CP-62 | Reportes | Listado público sin sesión con filtros por estado, tipo y municipalidad | 200; cada filtro devuelve solo los reportes que lo cumplen | Aprobado |
| CP-63 | Permisos | Listado con sesión de coordinador y de cuadrillas | El coordinador de Mixco solo ve Mixco; la cuadrilla asignada ve su reporte y la otra no | Aprobado |
| CP-64 | Reportes | Detalle de un reporte inexistente, como administrador y como cuadrilla ajena | 404; 200 con historial, evidencias y asignado; 403 | Aprobado |
| CP-65 | Flujo | Encargados asignables de un reporte | 200 con las cuadrillas de su municipalidad; 403 para el coordinador de otra; 404 si el reporte no existe | Aprobado |
| CP-66 | Reportes | "Mis reportes" de un reporte resuelto | La ciudadana ve el reporte en estado resuelto con su evidencia municipal | Aprobado |
| CP-67 | Flujo | Acción sobre un id no numérico o inexistente | 404 en ambos | Aprobado |
| CP-68 | Flujo | Asignar a un encargado inválido, de otra municipalidad o al mismo; reasignar a otro | 400 en los inválidos; reasignar 200, queda el nuevo encargado, historial "Reasignado de ..." y estado asignado | Aprobado |
| CP-69 | Flujo | Descartar con motivo no textual o de más de 300 caracteres | 400; el reporte sigue recibido | Aprobado |
| CP-70 | Flujo | Resolver con evidencias que no son arreglo, más de cinco o con formato inválido | 400 en todos; el reporte sigue en atención | Aprobado |
| CP-71 | Autenticación | (D-03) Registro con un correo sin formato válido | 400 y la cuenta no se crea | Aprobado |
| CP-72 | Autenticación | (D-04) Registro con contraseña numérica o nombre de 121 caracteres | 400, no 500 | Aprobado |
| CP-73 | Reportes | (D-05) Reporte con tipo de incidencia inexistente o no numérico | 400, no 500 | Aprobado |
| CP-74 | Administración | (D-06) Crear cuenta de personal con un correo sin formato válido | 400 y la cuenta no se crea | Aprobado |
| CP-75 | Administración | (D-07) Crear cuenta de personal con contraseña numérica, nombre de 121 caracteres, correo de más de 150, `id_rol` o `id_municipalidad` no numéricos | 400 en cada caso, no 500 | Aprobado |
| CP-76 | Administración | (D-08) Valor numérico en el correo de restablecer contraseña y en el nombre al crear o editar un tipo de incidencia o una municipalidad | 400 en cada caso; antes la petición quedaba sin respuesta y el proceso del servidor terminaba | Aprobado |
| CP-77 | Administración | (D-09) Restablecer una contraseña con un valor numérico | 400, no 500; la contraseña anterior sigue funcionando | Aprobado |
| CP-78 | Autenticación | (D-10) Cambiar la contraseña propia con la actual o la nueva numérica | 400 en ambos, no 500; la contraseña no cambia | Aprobado |
| CP-79 | Administración | (D-11) Tipo de incidencia con nombre de 81 caracteres, descripción de 201 o id no numérico al editar | 400 en cada caso, no 500; un id numérico inexistente sigue dando 404 | Aprobado |
| CP-80 | Administración | (D-12) Municipalidad con nombre o departamento de 101 caracteres, dirección de 201, o id no numérico al editar o cambiar el estado | 400 en cada caso, no 500; un id inexistente sigue dando 404; no se crea ninguna municipalidad | Aprobado |
| CP-81 | Reportería | `GET /api/estadisticas/reportes` como coordinador de Guatemala, también enviando el `id_municipalidad` de Mixco | 200 solo con reportes de Guatemala, los mismos y en el mismo orden (fecha descendente) que en la base | Aprobado |
| CP-82 | Reportería | Listado como administrador, sin filtro y con `id_municipalidad` de Mixco | Sin filtro, todos los reportes de la base; con filtro, exactamente los de Mixco | Aprobado |
| CP-83 | Reportería | Filtro `fecha_inicio`/`fecha_fin` (un día, solo inicio y solo fin) | Coincide con la base incluyendo ambos extremos; un rango sin reportes devuelve `[]` | Aprobado |
| CP-84 | Reportería | Listado con sesión de ciudadano, de cuadrilla y sin sesión | 403, 403 y 401 | Aprobado |
| CP-85 | Reportería | Fecha con otro formato, día inexistente (30/02) e inicio posterior al fin | 400 con el mensaje de cada caso | Aprobado |
| CP-86 | Reportería | Campos de la respuesta, con un reporte de ciudadana resuelto y otro recibido | Cada fila trae solo código, fecha, tipo, estado, municipalidad, latitud, longitud, encargado y fecha de resolución; no aparecen el nombre, el correo ni la descripción de la ciudadana; el resuelto trae encargado y fecha de resolución, el recibido ambos en `null` | Aprobado |

CP-36 y CP-37 se agregaron para el defecto D-01. Antes de la corrección ambos fallaban (el
reporte quedaba a nombre del id enviado en el cuerpo); después de la corrección pasan.
CP-38 a CP-40 se agregaron con la corrección del defecto D-02 y el restablecimiento de
contraseñas por el administrador. CP-41 y CP-42 cubren el cambio de la contraseña propia
(*Mi cuenta*). CP-43 a CP-54 cubren las notificaciones por correo (`tests/correo.test.js`):
CP-43 a CP-52 revisan las llamadas al servicio mockeado y CP-53 y CP-54 prueban el servicio real
de `src/services/correo.js` con `fetch` mockeado, sin conectarse a Brevo.
CP-55 a CP-73 vienen del paquete de verificación del sistema de calidad (28/10/2026):
`tests/criticos.test.js` (CP-55 a CP-70) cubre ramas de los módulos críticos que la suite no
ejercitaba y `tests/defectos.test.js` (CP-71 a CP-73) es la regresión de D-03 a D-05. CP-74 a
CP-80 (`tests/validaciones.test.js`) son la regresión de D-06 a D-12: se escribieron antes de la
corrección y fallaron (201, 500 o sin respuesta) hasta aplicarla. CP-81 a CP-86
(`tests/reporteria.test.js`) cubren el listado de reportes de Estadísticas.

## Resumen

| Total de casos | Aprobados | Fallidos |
|---|---|---|
| 86 | 86 | 0 |

## Defectos encontrados y corregidos

### Registro

| ID | Descripción | Severidad | Módulo | Vía de detección | Fecha de detección | Casos de regresión |
|---|---|---|---|---|---|---|
| D-01 | La autoría de un reporte podía suplantarse enviando `id_usuario_reporta` en el cuerpo de `POST /api/reportes` | Crítica | Registro de reportes | Pruebas automatizadas | 13/10/2026 | CP-36, CP-37 |
| D-02 | `POST /api/auth/recuperar` devolvía el token de recuperación también en producción | Alta | Autenticación | Revisión del sistema desplegado | 20/10/2026 | CP-38, CP-39, CP-40 |
| D-03 | El registro de ciudadanos aceptaba correos sin formato válido | Media | Autenticación | Pruebas negativas de robustez | 28/10/2026 | CP-71 |
| D-04 | Una contraseña no textual o un nombre de más de 120 caracteres en el registro provocaban un error 500 | Baja | Autenticación | Pruebas negativas de robustez | 28/10/2026 | CP-72 |
| D-05 | Un tipo de incidencia inexistente o no numérico al registrar un reporte provocaba un error 500 | Baja | Registro de reportes | Pruebas negativas de robustez | 28/10/2026 | CP-73 |
| D-06 | Crear una cuenta de personal (`POST /api/admin/usuarios`) aceptaba correos sin formato válido | Media | Administración (usuarios) | Pruebas negativas de robustez | 29/10/2026 | CP-74 |
| D-07 | Al crear una cuenta de personal, una contraseña no textual, un nombre de más de 120 caracteres, un correo de más de 150 o un `id_rol`/`id_municipalidad` no numérico provocaban un error 500 | Baja | Administración (usuarios) | Pruebas negativas de robustez | 29/10/2026 | CP-75 |
| D-08 | Un valor no textual en el correo de restablecer contraseña o en el nombre de un tipo de incidencia o de una municipalidad lanzaba una excepción fuera del `try`: la petición quedaba sin respuesta y el proceso del servidor terminaba (código 1), dejando la plataforma fuera de servicio hasta reiniciarlo | Alta | Administración (restablecer contraseña y catálogos) | Pruebas negativas de robustez | 29/10/2026 | CP-76 |
| D-09 | Restablecer una contraseña (administrador) con un valor no textual provocaba un error 500 | Baja | Administración (usuarios) | Pruebas negativas de robustez | 29/10/2026 | CP-77 |
| D-10 | Cambiar la contraseña propia con la actual o la nueva no textual provocaba un error 500 | Baja | Autenticación (Mi cuenta) | Pruebas negativas de robustez | 29/10/2026 | CP-78 |
| D-11 | Tipos de incidencia: un nombre de más de 80 caracteres, una descripción de más de 200 o un id no numérico al editar provocaban un error 500 | Baja | Administración (catálogos) | Pruebas negativas de robustez | 29/10/2026 | CP-79 |
| D-12 | Municipalidades: un nombre o departamento de más de 100 caracteres, una dirección de más de 200 o un id no numérico al editar o cambiar el estado provocaban un error 500 | Baja | Administración (catálogos) | Pruebas negativas de robustez | 29/10/2026 | CP-80 |

D-08 se confirmó con un servidor aparte conectado a `ecoreporte_test`: después de
`POST /api/admin/tipos-incidencia` con `{ "nombre_tipo": 12345 }` la petición no tuvo respuesta y
el proceso terminó con `TypeError: nombre_tipo.trim is not a function`. Requiere una sesión de
administrador, pero deja fuera de servicio a todos los usuarios.

### Corrección

| ID | Descripción | Archivo | Corrección |
|---|---|---|---|
| D-01 | `POST /api/reportes` es público y tomaba `id_usuario_reporta` del cuerpo de la petición: cualquiera podía registrar un reporte a nombre de otro ciudadano (le aparecía en "Mis reportes" y recibía sus notificaciones). El frontend enviaba ese campo desde `localStorage`. | `backend/src/routes/index.js`, `backend/src/controllers/reporteController.js`, `frontend/src/views/Reportar.vue` | La ruta usa `tokenOpcional`. El controlador toma el autor de `req.usuario.id_usuario` si hay un token válido y, si no, deja el reporte anónimo (`null`); se ignora siempre lo que venga en el cuerpo. El frontend ya no envía el campo: el token lo adjunta el interceptor de `api.js`. Cubierto por CP-36 y CP-37. |
| D-02 | `POST /api/auth/recuperar` devolvía el token de recuperación en la respuesta también en producción: cualquiera que conociera un correo (p. ej. `admin@ecoreporte.gt`) podía cambiar la contraseña de esa cuenta. Detectado al revisar el despliegue, no por una prueba. | `backend/src/controllers/authController.js`, `frontend/src/views/RecuperarPassword.vue`, `backend/src/controllers/adminController.js`, `backend/src/routes/index.js`, `frontend/src/views/AdminUsuarios.vue` | Con `NODE_ENV=production` el endpoint nunca devuelve el token y responde lo mismo exista o no el correo; la pantalla muestra solo ese mensaje. Para que la recuperación siga siendo posible, el administrador puede restablecer la contraseña de cualquier cuenta por correo (`POST /api/admin/usuarios/restablecer-password`, *Administración → Usuarios*). Cubierto por CP-38, CP-39 y CP-40. |
| D-03 | El registro aceptaba correos sin formato. | `backend/src/controllers/authController.js` | `registro` valida el correo con una expresión regular y un largo máximo de 150 (la columna). Cubierto por CP-71. |
| D-04 | Contraseña no textual o nombre largo en el registro: error 500. | `backend/src/controllers/authController.js` | `registro` exige que nombre, correo y contraseña sean texto y que el nombre no supere 120 caracteres: responde 400. Cubierto por CP-72. |
| D-05 | Tipo de incidencia inexistente o no numérico al reportar: error 500. | `backend/src/controllers/reporteController.js` | `crearReporte` exige un entero positivo y verifica dentro de la transacción que el tipo exista: responde 400. Cubierto por CP-73. |
| D-06 | Crear cuenta de personal aceptaba correos sin formato. | `backend/src/controllers/adminController.js` | `crearUsuario` valida el formato del correo y su largo máximo (150): responde 400. Cubierto por CP-74. |
| D-07 | Datos no textuales, largos o ids no numéricos al crear una cuenta de personal: error 500. | `backend/src/controllers/adminController.js` | `crearUsuario` exige texto en nombre, correo y contraseña, nombre de hasta 120 caracteres e ids enteros positivos (`idValido`); usa los ids validados en las consultas. Cubierto por CP-75. |
| D-08 | Valor no textual en restablecer contraseña o en los catálogos: caída del servidor. | `backend/src/controllers/adminController.js` | Antes de llamar a `.trim()` se valida que los campos sean texto (`esTextoOpcional`) en `restablecerPasswordUsuario` y en las validaciones de tipos de incidencia (`errorTipoIncidencia`) y municipalidades (`errorMunicipalidad`): responde 400. Cubierto por CP-76. |
| D-09 | Contraseña no textual al restablecer: error 500. | `backend/src/controllers/adminController.js` | `restablecerPasswordUsuario` exige que la contraseña sea texto: responde 400. Cubierto por CP-77. |
| D-10 | Contraseña no textual al cambiar la propia: error 500. | `backend/src/controllers/authController.js` | `cambiarPassword` exige que la actual y la nueva sean texto: responde 400. Cubierto por CP-78. |
| D-11 | Textos largos o id no numérico en tipos de incidencia: error 500. | `backend/src/controllers/adminController.js` | `errorTipoIncidencia` limita el nombre a 80 y la descripción a 200 caracteres; `editarTipoIncidencia` responde 400 si el id no es un entero positivo. Cubierto por CP-79. |
| D-12 | Textos largos o id no numérico en municipalidades: error 500. | `backend/src/controllers/adminController.js` | `errorMunicipalidad` limita nombre y departamento a 100 y la dirección a 200 caracteres; `editarMunicipalidad` y `cambiarEstadoMunicipalidad` responden 400 si el id no es un entero positivo. Cubierto por CP-80. |

Durante la puesta a punto hubo además un problema en la configuración de las pruebas, no en el
sistema: el pool de PostgreSQL se cerraba antes de que cada archivo terminara de limpiar sus
datos. Se resolvió moviendo la limpieza y el cierre del pool a un único `afterAll` en
`tests/setup/cerrar-pool.js`.
