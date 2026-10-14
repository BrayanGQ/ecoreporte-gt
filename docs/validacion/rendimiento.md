# Rendimiento de la API

Fecha de ejecución: 2026-10-14T00:53:28.528Z

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
| Base de datos | ecoreporte_test |

## Metodología

- 5 peticiones de calentamiento (no cuentan) y 50 peticiones medidas por endpoint, secuencial (una petición a la vez).
- Cliente: fetch de Node.js v22.20.0 contra http://127.0.0.1:3100 (mismo equipo). Servidor: backend de EcoReporte GT (node src/index.js) como proceso aparte.
- Tiempo medido: desde que se envía la petición hasta que se termina de leer la respuesta.
- Percentil 95: rango más cercano: valor en la posición ceil(0.95·n) de las muestras ordenadas.
- Datos: 28 reportes de demostración (npm run test:bd) más los creados por la medición.

## Resultados (milisegundos)

Valores mostrados con 2 decimales; los valores completos y las 50 muestras de cada endpoint están en `rendimiento.json`.

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
