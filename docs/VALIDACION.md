# Validación técnica — EcoReporte GT v1.0.0

Evidencia de validación obtenida con mediciones ejecutadas en el equipo de desarrollo. Los
valores de las tablas salen directamente de los archivos de resultados de cada medición
(`docs/validacion/`); no se estimaron ni se completaron a mano.

**Fecha de ejecución:** 13 de octubre de 2026, 6:53 p. m. (hora de Guatemala, UTC−6).

| Medición | Inicio (hora de Guatemala) | Resultados |
|---|---|---|
| Rendimiento de la API | 13 de octubre de 2026, 6:53 p. m. | `docs/validacion/rendimiento.json`, `rendimiento.md` |
| Auditoría Lighthouse — antes | 13 de octubre de 2026, 6:57 p. m. | `docs/validacion/lighthouse/antes/` (12 reportes HTML + `resumen.json`) |
| Auditoría Lighthouse — después de las correcciones | 13 de octubre de 2026, 7:09 p. m. | `docs/validacion/lighthouse/despues/` (12 reportes HTML + `resumen.json`) |
| Repeticiones de rendimiento (Lighthouse) | 13 de octubre de 2026, 7:13 p. m. y 13 de octubre de 2026, 7:16 p. m. | `despues/repeticiones-rendimiento.json`, `despues/mapa-celular-alternado.json` |
| Compatibilidad | 13 de octubre de 2026, 6:59 p. m. | `docs/validacion/compatibilidad/` (capturas + `resultados.json`) |

## Equipo

| Componente | Valor |
|---|---|
| Equipo | HP Laptop 15-fc0xxx |
| Procesador | AMD Ryzen 7 7730U with Radeon Graphics |
| Núcleos | 8 físicos, 16 lógicos |
| RAM | 16 GiB instalados (2 módulos, 3200/3200 MT/s); 15.34 GiB visibles para el sistema |
| Sistema operativo | Microsoft Windows 11 Home Single Language (10.0.26200, x64) |
| Node.js | v22.20.0 |
| PostgreSQL | 17.4 (PostGIS 3.5.2) |
| Google Chrome | 155.0.8059.41 |
| Microsoft Edge | 155.0.4283.45 |
| Lighthouse | 13.5.0 |

Todas las mediciones se ejecutaron en el mismo equipo (cliente, servidor y base de datos
locales), sin otras cargas de trabajo deliberadas.

---

## 1. Rendimiento de la API

**Cómo se midió** (`backend/scripts/medir-rendimiento.js`, `npm run medir`):

- Base de datos de pruebas `ecoreporte_test`, preparada con `npm run test:bd` (scripts 01–05 y los
  28 reportes de demostración). El backend se levanta como proceso aparte (`node src/index.js`)
  en el puerto 3100, sin tocar la base de la aplicación.
- Por endpoint: 5 peticiones de calentamiento (descartadas) y **50 peticiones medidas**, secuencial (una petición a la vez).
- Tiempo medido: desde que se envía la petición hasta que se termina de leer la respuesta, con `fetch` de Node.js contra `127.0.0.1`.
- Percentil 95 por rango más cercano (valor en la posición ⌈0,95·n⌉ de las muestras ordenadas).
- Las acciones que cambian de estado (asignar, resolver) se midieron sobre reportes preparados
  antes de la medición; los reportes creados se borran al terminar.

**Resultados (milisegundos).** Se muestran con 2 decimales; los valores completos y las 50
muestras de cada endpoint están en `docs/validacion/rendimiento.json`.

| Endpoint | Reportes en la base | Mínimo | Promedio | Mediana | P95 | Máximo |
|---|---|---|---|---|---|---|
| `POST /api/auth/login` | 139 | 59.95 | 61.36 | 61.19 | 62.99 | 65.46 |
| `POST /api/reportes` | 139 | 2.38 | 2.86 | 2.76 | 3.47 | 3.83 |
| `GET /api/reportes` | 194 | 2.44 | 3.33 | 3.23 | 4.50 | 4.56 |
| `GET /api/reportes/consulta/:codigo` | 194 | 1.39 | 1.67 | 1.65 | 2.03 | 2.08 |
| `GET /api/reportes/:id/detalle` | 194 | 2.20 | 2.58 | 2.45 | 3.41 | 3.84 |
| `POST /api/reportes/:id/asignar` | 194 | 2.57 | 3.19 | 3.00 | 4.34 | 4.84 |
| `POST /api/reportes/:id/resolver` | 194 | 10.92 | 13.22 | 12.16 | 16.95 | 36.75 |
| `GET /api/estadisticas/resumen` | 194 | 1.08 | 1.32 | 1.28 | 1.63 | 1.87 |
| `GET /api/catalogos/municipalidad-por-ubicacion` | 194 | 0.85 | 1.06 | 1.02 | 1.38 | 1.48 |

- `POST /api/auth/login`: Inicio de sesión del coordinador (incluye bcrypt).
- `POST /api/reportes`: Reporte anónimo sin fotos; incluye la detección de municipalidad con PostGIS.
- `GET /api/reportes`: Listado público completo (el que usa el mapa).
- `GET /api/reportes/consulta/:codigo`: Consulta pública por código de seguimiento.
- `GET /api/reportes/:id/detalle`: Detalle del reporte como coordinador.
- `POST /api/reportes/:id/asignar`: Coordinador asigna un reporte recibido a una cuadrilla (transacción).
- `POST /api/reportes/:id/resolver`: Cuadrilla resuelve con 1 foto JPEG real (despues_1.jpg, 207082 bytes; 276135 caracteres en base64).
- `GET /api/estadisticas/resumen`: Resumen de estadísticas del coordinador (su municipalidad).
- `GET /api/catalogos/municipalidad-por-ubicacion`: Consulta PostGIS (ST_Contains) para un punto dentro de Guatemala.

"Reportes en la base" es la cantidad de reportes al empezar a medir cada endpoint: incluye los
que creó la propia medición en los pasos anteriores (por eso el listado se midió con 194).

---

## 2. Auditoría Lighthouse

**Cómo se ejecutó** (`frontend/scripts/lighthouse.mjs`):

- Frontend compilado y servido con `npm run build && npm run preview` (`http://localhost:4173`), con el
  backend de desarrollo y los datos de demostración (28 reportes).
- `npx lighthouse` 13.5.0 sobre Chrome/155.0.8059.41 en modo *headless*, con las cuatro categorías.
  **Escritorio:** `--preset=desktop`. **Celular:** configuración por defecto de Lighthouse
  (emulación de un teléfono con red y CPU limitadas por simulación).
- **Dashboard del coordinador:** se inició sesión por la API como Ana Lucía Morales
  (coordinadora de Guatemala), se guardó la sesión en el `localStorage` del navegador por el
  protocolo de depuración de Chrome y se corrió Lighthouse con `--disable-storage-reset` para
  que no la borrara. Se verificó que la URL final fuera `/municipal/panel` y que la captura
  final de Lighthouse mostrara el panel con los 12 reportes de su municipalidad.
- **Consulta por código:** la vista no recibe el código por la URL, así que se auditó la carga
  de la pantalla de consulta (formulario sin buscar).
- Se auditó dos veces con el mismo script, las mismas vistas y los mismos presets: **antes**
  (13 de octubre de 2026, 6:57 p. m.) y **después** de corregir los problemas encontrados (13 de octubre de 2026, 7:09 p. m.).
  Una ejecución por vista y dispositivo en cada caso.
- Los reportes HTML están en `docs/validacion/lighthouse/antes/` y `.../despues/`, con un
  `resumen.json` en cada carpeta. Cada reporte HTML trae el resultado completo de Lighthouse
  incrustado; los JSON individuales se eliminaron para que el repositorio pese menos.

### 2.1 Comparativa antes → después

En negrita, los puntajes que cambiaron (con la diferencia entre paréntesis).

| Vista | Dispositivo | Rendimiento | Accesibilidad | Buenas prácticas | SEO | Reportes |
|---|---|---|---|---|---|---|
| Inicio | Escritorio | 100 → **97** (-3) | 86 → **100** (+14) | 96 → **100** (+4) | 82 → **100** (+18) | [antes](validacion/lighthouse/antes/inicio-escritorio.report.html) · [después](validacion/lighthouse/despues/inicio-escritorio.report.html) |
| Inicio | Celular | 95 → 95 | 86 → **100** (+14) | 100 → 100 | 82 → **100** (+18) | [antes](validacion/lighthouse/antes/inicio-celular.report.html) · [después](validacion/lighthouse/despues/inicio-celular.report.html) |
| Portal ciudadano (Reportar) | Escritorio | 96 → 96 | 93 → **100** (+7) | 100 → 100 | 83 → **100** (+17) | [antes](validacion/lighthouse/antes/reportar-escritorio.report.html) · [después](validacion/lighthouse/despues/reportar-escritorio.report.html) |
| Portal ciudadano (Reportar) | Celular | 91 → **90** (-1) | 93 → **100** (+7) | 96 → 96 | 83 → **100** (+17) | [antes](validacion/lighthouse/antes/reportar-celular.report.html) · [después](validacion/lighthouse/despues/reportar-celular.report.html) |
| Mapa de reportes | Escritorio | 99 → **97** (-2) | 89 → **100** (+11) | 100 → 100 | 83 → **100** (+17) | [antes](validacion/lighthouse/antes/mapa-escritorio.report.html) · [después](validacion/lighthouse/despues/mapa-escritorio.report.html) |
| Mapa de reportes | Celular | 83 → **78** (-5) | 89 → **100** (+11) | 96 → 96 | 83 → **100** (+17) | [antes](validacion/lighthouse/antes/mapa-celular.report.html) · [después](validacion/lighthouse/despues/mapa-celular.report.html) |
| Consulta por código | Escritorio | 100 → 100 | 98 → **100** (+2) | 100 → 100 | 82 → **100** (+18) | [antes](validacion/lighthouse/antes/consulta-escritorio.report.html) · [después](validacion/lighthouse/despues/consulta-escritorio.report.html) |
| Consulta por código | Celular | 94 → **95** (+1) | 98 → **100** (+2) | 100 → 100 | 82 → **100** (+18) | [antes](validacion/lighthouse/antes/consulta-celular.report.html) · [después](validacion/lighthouse/despues/consulta-celular.report.html) |
| Login municipal | Escritorio | 99 → **100** (+1) | 97 → **100** (+3) | 100 → 100 | 82 → **100** (+18) | [antes](validacion/lighthouse/antes/login-municipal-escritorio.report.html) · [después](validacion/lighthouse/despues/login-municipal-escritorio.report.html) |
| Login municipal | Celular | 95 → 95 | 97 → **100** (+3) | 100 → 100 | 82 → **100** (+18) | [antes](validacion/lighthouse/antes/login-municipal-celular.report.html) · [después](validacion/lighthouse/despues/login-municipal-celular.report.html) |
| Dashboard del coordinador | Escritorio | 100 → 100 | 100 → 100 | 100 → 100 | 82 → **100** (+18) | [antes](validacion/lighthouse/antes/dashboard-coordinador-escritorio.report.html) · [después](validacion/lighthouse/despues/dashboard-coordinador-escritorio.report.html) |
| Dashboard del coordinador | Celular | 100 → 100 | 100 → 100 | 100 → 100 | 82 → **100** (+18) | [antes](validacion/lighthouse/antes/dashboard-coordinador-celular.report.html) · [después](validacion/lighthouse/despues/dashboard-coordinador-celular.report.html) |

| Promedio | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
|---|---|---|---|---|
| Escritorio (6 vistas) | 99.00 → 98.33 | 93.83 → 100.00 | 99.33 → 100.00 | 82.33 → 100.00 |
| Celular (6 vistas) | 93.00 → 92.17 | 93.83 → 100.00 | 98.67 → 98.67 | 82.33 → 100.00 |

**Resultado:** Accesibilidad y SEO pasan a **100 en las 12 auditorías**; Lighthouse ya no
reporta ningún problema de accesibilidad (4 → 0). Buenas prácticas queda en 100 salvo en Reportar y Mapa
en celular (96), por un punto que no estaba entre los problemas a corregir (ver 2.4).

### 2.2 Problemas encontrados en la auditoría "antes"

Lighthouse reportó **4 problemas de accesibilidad distintos** en las 12 auditorías (no hubo un
quinto), ordenados por la cantidad de auditorías en que aparecen:

| # | Problema (auditoría de Lighthouse) | Auditorías en que aparecía | Elementos afectados (total) | Vistas | Después |
|---|---|---|---|---|---|
| 1 | El documento no tiene una región principal (`<main>`) (`landmark-one-main`) | 10 de 12 | 10 | Inicio, Portal ciudadano (Reportar), Mapa de reportes, Consulta por código, Login municipal | Corregido (0 de 12) |
| 2 | Listas desplegables (`<select>`) sin etiqueta asociada (`select-name`) | 4 de 12 | 6 | Portal ciudadano (Reportar), Mapa de reportes | Corregido (0 de 12) |
| 3 | Elementos con rol de botón sin nombre accesible (`aria-command-name`) | 2 de 12 | 56 | Mapa de reportes | Corregido (0 de 12) |
| 4 | Contraste de color insuficiente (`color-contrast`) | 2 de 12 | 2 | Inicio | Corregido (0 de 12) |

Causa observada en cada caso:

1. **`landmark-one-main`** — El layout del portal ciudadano y las pantallas sin layout (inicio y login municipal) no envuelven el contenido en `<main>`. El portal municipal sí lo tiene, por eso el dashboard no falla.
2. **`select-name`** — En Reportar, la etiqueta "Tipo de incidencia" no está vinculada al `<select>` (falta `for`/`id`); en el mapa, los filtros de estado y tipo no tienen etiqueta.
3. **`aria-command-name`** — Los marcadores de Leaflet del mapa tienen `role="button"` pero no un texto o `alt` que los describa (28 marcadores por auditoría, uno por reporte).
4. **`color-contrast`** — El enlace "Ingresar al panel municipal" de la pantalla de inicio usa ámbar `#E0A800` sobre blanco: contraste 2.14:1 con texto de 13 px (el mínimo es 4.5:1).

Además, **SEO** estaba en 82–83 en las 12 auditorías porque faltaba la etiqueta
`<meta name="description">` y `robots.txt` no era válido (el servidor respondía con
`index.html`), y **Buenas prácticas** registraba en Inicio un 404 de `/favicon.ico` (la app
no tenía favicon).

### 2.3 Correcciones aplicadas

| Problema | Corrección | Archivos |
|---|---|---|
| Sin región `<main>` | El contenido del portal ciudadano va dentro de `<main>`; la pantalla de inicio usa `<main>` como contenedor raíz; el login usa `<main>` solo en el portal municipal (en el ciudadano ya está dentro del `<main>` del portal, y no puede haber dos). Sin cambios visuales. | `layouts/PortalCiudadanoLayout.vue`, `views/Bienvenida.vue`, `views/Login.vue` |
| `<select>` sin etiqueta | "Tipo de incidencia" quedó asociada con `for`/`id`; los filtros del mapa tienen `aria-label` ("Filtrar reportes por estado" y "… por tipo de incidencia"). | `views/Reportar.vue`, `views/Mapa.vue` |
| Marcadores sin nombre accesible | Cada marcador tiene `title` y `aria-label` con el código, el tipo y el estado del reporte, p. ej. "Reporte ER-2026-0019: Escombros de construcción, estado resuelto". | `views/Mapa.vue` |
| Contraste de "Ingresar al panel municipal" | El texto pasó de `#E0A800` (2.15:1) a `#93650A` (5.11:1), el ámbar oscuro que la app ya usa en los badges "en atención". El ícono de la tarjeta conserva el ámbar base. | `views/Bienvenida.vue` |
| SEO | `<meta name="description">` y `theme-color` en `index.html`; `public/robots.txt` que permite indexar el sitio. | `index.html`, `public/robots.txt` |
| 404 de `favicon.ico` | Favicon SVG con los colores de la app (hoja verde musgo sobre verde bosque), enlazado desde `index.html`. | `public/favicon.svg`, `index.html` |

Verificación: las 37 pruebas del backend (`npm test`) pasan y `npm run build` compila sin
errores después de las correcciones.

### 2.4 Puntajes que bajaron

Bajaron 4 puntajes, todos de **Rendimiento**: Inicio en escritorio (100 → 97); Portal ciudadano (Reportar) en celular (91 → 90); Mapa de reportes en escritorio (99 → 97); Mapa de reportes en celular (83 → 78).

Las correcciones casi no cambian lo que se descarga y se ejecuta al cargar esas vistas: el
peso total aumentó unos 1,000 bytes (el favicon y la etiqueta `meta description`), en el
mapa se agregan dos atributos (`title` y `aria-label`) a cada marcador, y el tiempo de
bloqueo (TBT) siguió entre 0 y 70 ms. Lo que varió fueron el primer pintado y el pintado del
elemento más grande (FCP y LCP), que en estas vistas dependen de tres hojas de estilo externas
que bloquean el renderizado (unpkg.com y cdnjs.cloudflare.com, ~1 s en celular) y, en el mapa,
de los mosaicos de OpenStreetMap. Para comprobar que la diferencia es variación entre
ejecuciones y no efecto del código, se repitieron esas auditorías:

**Repeticiones de la versión corregida** (`despues/repeticiones-rendimiento.json`, 3 ejecuciones más por caso):

| Vista | Dispositivo | Antes (1 ejecución) | Después (1 ejecución) | Repeticiones después | Rango |
|---|---|---|---|---|---|
| Inicio | Escritorio | 100 | 97 | 98, 100, 100 | 98–100 |
| Portal ciudadano (Reportar) | Celular | 91 | 90 | 77, 92, 92 | 77–92 |
| Mapa de reportes | Escritorio | 99 | 97 | 99, 98, 98 | 98–99 |
| Mapa de reportes | Celular | 83 | 78 | 80, 75, 77 | 75–80 |

En Inicio, Reportar y Mapa (escritorio), el valor de "antes" queda dentro del rango de las
repeticiones de la versión corregida. En el Mapa en celular las repeticiones quedaron por
debajo del 83 de "antes", así que se midió también la **versión anterior a las correcciones**
(reconstruida temporalmente y servida en otro puerto), alternando con la corregida para que
ambas tuvieran las mismas condiciones de red (`despues/mapa-celular-alternado.json`):

| Ronda | Antes (sin correcciones) | Después (corregida) |
|---|---|---|
| 1 | 76 (LCP 5.5 s) | 77 (LCP 5.2 s) |
| 2 | 80 (LCP 4.6 s) | 78 (LCP 5.2 s) |
| 3 | 78 (LCP 5.0 s) | 79 (LCP 4.9 s) |
| 4 | 78 (LCP 5.0 s) | 79 (LCP 4.9 s) |
| 5 | 86 (LCP 3.7 s) | 78 (LCP 5.0 s) |
| **Mediana** | **78** (rango 76–86, promedio 79.60) | **78** (rango 77–79, promedio 78.20) |

Las dos versiones tienen la misma mediana: el 83 de la primera auditoría fue una ejecución
favorable dentro de la variación normal, no un efecto de las correcciones.

**Pendiente (no estaba entre las correcciones pedidas):** en Reportar y Mapa en celular,
Buenas prácticas sigue en 96 por `image-size-responsive`: los mosaicos de OpenStreetMap se
sirven a 256 px y el celular emulado, por su densidad de pantalla, esperaría 384 px. Se puede
resolver con la opción `detectRetina` de la capa de mosaicos de Leaflet, a costa de descargar
más mosaicos.

---

## 3. Compatibilidad entre navegadores

**Navegadores instalados en el equipo:** Google Chrome 155.0.8059.41 y Microsoft Edge
155.0.4283.45. **Mozilla Firefox no está instalado**.

**Cómo se ejecutó** (`frontend/scripts/compatibilidad.mjs`): sobre la versión compilada
(`http://localhost:4173`), cada navegador se abrió en modo *headless* (`--headless=new`, el mismo motor
que la versión con ventana) y se controló por su protocolo de depuración. En cada vista se
esperó a que el contenido apareciera, se registraron los errores de la consola y se guardó una
captura (`docs/validacion/compatibilidad/<navegador>-<prueba>.jpg`).

| Verificación | Chrome | Edge | Firefox | Detalle (Chrome y Edge) |
|---|---|---|---|---|
| Inicio carga | ✔ Correcto | ✔ Correcto | Pendiente (manual) | Se muestran las dos entradas (ciudadano y municipalidad). |
| Reportar: formulario y mapa | ✔ Correcto | ✔ Correcto | Pendiente (manual) | Mapa con 8 mosaicos cargados y marcador; detecta la municipalidad. |
| Mapa: mosaicos y marcadores | ✔ Correcto | ✔ Correcto | Pendiente (manual) | 12 mosaicos cargados; 28 marcadores de 28 reportes. |
| Consulta por código | ✔ Correcto | ✔ Correcto | Pendiente (manual) | Muestra el estado y el historial de ER-2026-0019. |
| Inicio de sesión del ciudadano | ✔ Correcto | ✔ Correcto | Pendiente (manual) | Redirige al portal y muestra el nombre de la ciudadana. |
| Inicio de sesión del coordinador | ✔ Correcto | ✔ Correcto | Pendiente (manual) | Entra al panel municipal con 12 reportes de su municipalidad. |
| **Total** | **6/6** | **6/6** | — | |

En ambos navegadores el único error de consola fue el 404 de `/favicon.ico` al cargar la
pantalla de inicio. Esta prueba se ejecutó antes de las correcciones de la sección 2.3, que
agregaron un favicon y eliminan ese 404.

### Lista de verificación manual para Firefox

Firefox no está instalado y no se pudo automatizar con el mismo protocolo. Para completar la
tabla, instalá Firefox (https://www.mozilla.org/firefox/), levantá el backend (`npm run dev` en
`backend/`) y el frontend (`npm run build && npm run preview` en `frontend/`), abrí
http://localhost:4173 y marcá cada punto:

- [ ] **Inicio:** se ven "Soy Ciudadano" y "Soy Municipalidad".
- [ ] **Reportar** (`/portal`): el mapa muestra los mosaicos de OpenStreetMap y el marcador;
      debajo aparece "Este reporte será atendido por: Municipalidad de Guatemala".
- [ ] **Reportar:** al hacer clic en el mapa fuera del departamento, aparece el aviso de zona no
      cubierta y el botón Enviar se deshabilita.
- [ ] **Mapa** (`/portal/mapa`): se ven los mosaicos y los 28 marcadores de colores; al hacer
      clic en uno se abre su ventana con el tipo, la descripción y el estado.
- [ ] **Consulta** (`/portal/consultar`): al buscar `ER-2026-0019` se muestra el estado
      "resuelto" y el historial.
- [ ] **Login ciudadano** (`/portal/login`) con `maria.garcia@ecoreporte.gt` / `password123`:
      vuelve al portal con su nombre en la barra superior; "Mis reportes" lista sus reportes.
- [ ] **Login municipal** (`/municipal/login`) con `ana.morales@ecoreporte.gt` / `password123`:
      entra al panel con 12 reportes; Estadísticas muestra las gráficas de dona y de barras.
- [ ] **Consola del navegador** (F12): no hay errores.

Anotá la versión de Firefox (menú ☰ → Ayuda → Acerca de Firefox) junto con el resultado.

---

## Cómo repetir las mediciones

```bash
# Rendimiento (backend/)
npm run test:bd
npm run medir

# Lighthouse y compatibilidad (con el backend corriendo: npm run dev en backend/)
cd frontend
npm run build
npm run preview          # en otra terminal; sirve http://localhost:4173
node scripts/lighthouse.mjs despues --sin-json   # carpeta de salida y sin los JSON individuales
node scripts/compatibilidad.mjs
```
