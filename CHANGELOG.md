# Cambios

## 1.0.1 — 29/10/2026

### Correcciones

- **D-03 a D-05:** el registro de ciudadanos valida el formato del correo, que los datos sean
  texto y el largo del nombre; registrar un reporte con un tipo de incidencia inexistente o no
  numérico responde 400 en lugar de 500.
- **D-06 y D-07:** crear una cuenta de personal valida el formato del correo, que los datos sean
  texto, el largo de nombre y correo, y que el rol y la municipalidad sean ids numéricos.
- **D-08:** un valor no textual en restablecer contraseña o en los catálogos (tipos de incidencia y
  municipalidades) ya no hace caer el servidor: responde 400.
- **D-09 a D-12:** restablecer contraseña, cambiar la contraseña propia y editar los catálogos
  responden 400, no 500, ante datos no textuales, textos más largos que la columna o ids no
  numéricos.

### Reportería

- Nuevo endpoint `GET /api/estadisticas/reportes`: listado de reportes con el mismo alcance por rol
  y los mismos filtros (fechas y municipalidad) que las estadísticas, sin datos personales del
  ciudadano.
- En *Estadísticas*: tabla con el listado, descarga en CSV para Excel
  (`reporte_ecoreporte_AAAA-MM-DD.csv`) e impresión o PDF del "Reporte de incidencias ambientales".

### Pruebas

- 86 casos automatizados (antes 54): módulos críticos, regresión de D-03 a D-12 y reportería.
  Detalle en [docs/PRUEBAS.md](docs/PRUEBAS.md).

## 1.0.0 — 13/10/2026

Versión inicial.
