// Carga datos de demostración realistas y coherentes con el flujo del sistema.
// Uso (desde backend/):  npm run demo
// También lo reutiliza scripts/preparar-bd-pruebas.js (exporta cargarDatosDemo).
//
// Requiere haber cargado database/01 a 05 y corrido `npm run seed`.
// Se puede repetir: cada ejecución deja la base en el mismo estado de demostración.
//   · Borra TODOS los reportes, evidencias, historial y notificaciones (y reinicia sus ids,
//     así los códigos vuelven a empezar en ER-AAAA-0001).
//   · Borra los usuarios que no sean los demo base ni los de esta demostración.
//   · Conserva catálogos, límites municipales y los usuarios demo base.
//   · Deja activas solo Guatemala, Mixco y Villa Nueva.
//
// Fotos: si existe database/demo_fotos/ se usan sus imágenes (antes_* = evidencia del
// ciudadano, despues_* = evidencia de la limpieza); si no, se generan imágenes de muestra.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('./config/db');

const PASSWORD = 'password123';
const INICIO = new Date(2026, 8, 1, 7, 0); // 1 de septiembre de 2026, 07:00
const AHORA = new Date();
const CARPETA_FOTOS = path.join(__dirname, '..', '..', 'database', 'demo_fotos');

// Usuarios demo base (database/02 y 04): se conservan tal cual.
const USUARIOS_BASE = [
  'admin@ecoreporte.gt', 'municipal@ecoreporte.gt', 'ciudadano@ecoreporte.gt', 'cuadrilla@ecoreporte.gt',
];

const MUNICIPALIDADES = {
  G: 'Municipalidad de Guatemala',
  M: 'Municipalidad de Mixco',
  V: 'Municipalidad de Villa Nueva',
};

// Personal de cada municipalidad: coordinador (personal_municipal) y dos encargados de cuadrilla.
const PERSONAL = {
  G: {
    coordinador: ['Ana Lucía Morales', 'ana.morales@ecoreporte.gt'],
    cuadrillas: [['Carlos Enrique Pérez', 'carlos.perez@ecoreporte.gt'], ['José Luis Hernández', 'jose.hernandez@ecoreporte.gt']],
  },
  M: {
    coordinador: ['Mario Roberto Castillo', 'mario.castillo@ecoreporte.gt'],
    cuadrillas: [['Luis Fernando Ramírez', 'luis.ramirez@ecoreporte.gt'], ['Edgar Antonio López', 'edgar.lopez@ecoreporte.gt']],
  },
  V: {
    coordinador: ['Claudia Patricia Gómez', 'claudia.gomez@ecoreporte.gt'],
    cuadrillas: [['Byron Alexander Juárez', 'byron.juarez@ecoreporte.gt'], ['Henry Estuardo Pineda', 'henry.pineda@ecoreporte.gt']],
  },
};

const CIUDADANOS = [
  ['María José García', 'maria.garcia@ecoreporte.gt'],
  ['Juan Pablo Rodríguez', 'juan.rodriguez@ecoreporte.gt'],
  ['Sofía Alejandra Méndez', 'sofia.mendez@ecoreporte.gt'],
  ['Diego Andrés Orellana', 'diego.orellana@ecoreporte.gt'],
  ['Lucía Fernanda Cifuentes', 'lucia.cifuentes@ecoreporte.gt'],
];

// Tipos de incidencia (02_datos_iniciales.sql).
const T = { VERTEDERO: 1, QUEMA: 2, ESCOMBROS: 3, AGUA: 4 };

// Reportes en orden cronológico. f = posición en el período (0 = 1 de sept, 1 = hoy).
// ciudadano: índice en CIUDADANOS o null (anónimo). cuadrilla: 0 o 1 del personal del municipio.
// Las coordenadas se verificaron con ST_Contains contra el límite del municipio.
const REPORTES = [
  { f: 0.00, m: 'G', lugar: 'Zona 3, barranco La Verbena', lat: 14.6285, lng: -90.5302, tipo: T.AGUA, ciudadano: 0,
    desc: 'Bolsas de basura y restos de comida tirados al barranco; ya bajan hacia el riachuelo. Hay mal olor y muchos zancudos.',
    estado: 'resuelto', cuadrilla: 0 },
  { f: 0.03, m: 'M', lugar: 'Mixco, cabecera municipal', lat: 14.6311, lng: -90.6072, tipo: T.VERTEDERO, ciudadano: null,
    desc: 'Montón de basura en la esquina del mercado. Lleva más de una semana y los perros la riegan por toda la calle.',
    estado: 'resuelto', cuadrilla: 0 },
  { f: 0.06, m: 'V', lugar: 'Villa Nueva, parque central', lat: 14.5268, lng: -90.5878, tipo: T.QUEMA, ciudadano: 1,
    desc: 'Todas las noches queman basura en el terreno baldío detrás de la iglesia; el humo se mete a las casas.',
    estado: 'resuelto', cuadrilla: 0 },
  { f: 0.09, m: 'G', lugar: 'Zona 18, colonia Paraíso', lat: 14.6553, lng: -90.4651, tipo: T.VERTEDERO, ciudadano: 2,
    desc: 'Vertedero en el terreno junto a la cancha: colchones viejos, llantas y muchas bolsas de basura.',
    estado: 'resuelto', cuadrilla: 1 },
  { f: 0.12, m: 'M', lugar: 'Colonia El Milagro', lat: 14.6408, lng: -90.5715, tipo: T.ESCOMBROS, ciudadano: null,
    desc: 'Dejaron una carga de escombros y ripio en media calle; los carros tienen que subirse a la banqueta para pasar.',
    estado: 'descartado',
    motivo: 'Los escombros pertenecen a una obra con licencia municipal vigente; se notificó al propietario para que los retire.' },
  { f: 0.15, m: 'V', lugar: 'Colonia Mario Alioto', lat: 14.5235, lng: -90.6020, tipo: T.AGUA, ciudadano: 3,
    desc: 'Basura acumulada a la orilla del río; cuando llueve la corriente se la lleva.',
    estado: 'resuelto', cuadrilla: 1 },
  { f: 0.18, m: 'G', lugar: 'Zona 7, Kaminal Juyú', lat: 14.6248, lng: -90.5432, tipo: T.ESCOMBROS, ciudadano: null,
    desc: 'Restos de una demolición (block, lámina y madera) tirados en el arriate central de la avenida.',
    estado: 'resuelto', cuadrilla: 0 },
  { f: 0.22, m: 'M', lugar: 'Lomas de Portugal', lat: 14.6200, lng: -90.5862, tipo: T.VERTEDERO, ciudadano: 4,
    desc: 'Los vecinos están usando el área verde de la colonia como basurero; ya no se puede usar el parque.',
    estado: 'resuelto', cuadrilla: 1 },
  { f: 0.26, m: 'G', lugar: 'Zona 1, El Gallito', lat: 14.6402, lng: -90.5238, tipo: T.QUEMA, ciudadano: null,
    desc: 'Quema de llantas y cables en la madrugada; el humo es negro y muy fuerte.',
    estado: 'descartado',
    motivo: 'Al llegar al lugar la quema ya había sido controlada por los Bomberos Voluntarios y no quedaron residuos que retirar.' },
  { f: 0.30, m: 'V', lugar: 'Bárcenas', lat: 14.5565, lng: -90.6140, tipo: T.VERTEDERO, ciudadano: 0,
    desc: 'Un camión dejó varias bolsas con desechos de un comercio en la entrada de la colonia.',
    estado: 'resuelto', cuadrilla: 0 },
  { f: 0.34, m: 'G', lugar: 'Zona 6, colonia Cipresales', lat: 14.6583, lng: -90.4952, tipo: T.VERTEDERO, ciudadano: 1,
    desc: 'Basurero clandestino frente a la escuela; los niños tienen que pasar entre la basura para entrar.',
    estado: 'resuelto', cuadrilla: 1, reasignadoDesde: 0 },
  { f: 0.38, m: 'M', lugar: 'Ciudad San Cristóbal', lat: 14.5985, lng: -90.5870, tipo: T.AGUA, ciudadano: null,
    desc: 'Desechos plásticos y electrodomésticos viejos tirados en el barranco cerca del puente.',
    estado: 'resuelto', cuadrilla: 0 },
  { f: 0.42, m: 'V', lugar: 'Colonia Villa Lobos', lat: 14.5622, lng: -90.5515, tipo: T.ESCOMBROS, ciudadano: null,
    desc: 'Escombros de una remodelación abandonados en la banqueta desde hace dos semanas.',
    estado: 'en_atencion', cuadrilla: 1 },
  { f: 0.46, m: 'G', lugar: 'Zona 12, colonia Santa Elisa', lat: 14.5905, lng: -90.5402, tipo: T.VERTEDERO, ciudadano: 2,
    desc: 'Basura acumulada en la parada de bus; ya tapó el tragante y cuando llueve se inunda la esquina.',
    estado: 'en_atencion', cuadrilla: 0 },
  { f: 0.50, m: 'M', lugar: 'Bosques de San Nicolás', lat: 14.6618, lng: -90.5895, tipo: T.QUEMA, ciudadano: 3,
    desc: 'Queman hojas y basura en el lote baldío cada fin de semana.',
    estado: 'descartado',
    motivo: 'Reporte duplicado: la misma quema en este lote ya se está atendiendo por otro reporte de la colonia.' },
  { f: 0.54, m: 'V', lugar: 'Ciudad del Sol', lat: 14.5150, lng: -90.5780, tipo: T.VERTEDERO, ciudadano: 4,
    desc: 'Montículo de basura en el redondel de la entrada que ya bloquea parte del paso.',
    estado: 'en_atencion', cuadrilla: 0 },
  { f: 0.58, m: 'G', lugar: 'Zona 21, colonia Justo Rufino Barrios', lat: 14.5662, lng: -90.5405, tipo: T.AGUA, ciudadano: null,
    desc: 'Basura acumulada junto al zanjón; con las lluvias hay riesgo de que se tape y se inunden las casas.',
    estado: 'en_atencion', cuadrilla: 1 },
  { f: 0.62, m: 'M', lugar: 'Colonia Las Brisas', lat: 14.6165, lng: -90.5960, tipo: T.VERTEDERO, ciudadano: null,
    desc: 'Colchones, muebles viejos y bolsas de basura en la esquina del parque.',
    estado: 'en_atencion', cuadrilla: 1 },
  { f: 0.66, m: 'G', lugar: 'Zona 13, avenida Hincapié', lat: 14.5832, lng: -90.5110, tipo: T.ESCOMBROS, ciudadano: 0,
    desc: 'Escombros de construcción tirados a la orilla de la avenida, cerca del puente.',
    estado: 'resuelto', cuadrilla: 1 },
  { f: 0.70, m: 'V', lugar: 'Colonia Planes de Bárcenas', lat: 14.5480, lng: -90.6050, tipo: T.QUEMA, ciudadano: 1,
    desc: 'Queman basura a cielo abierto en el terreno junto a las casas; varios niños de la cuadra tienen tos.',
    estado: 'asignado', cuadrilla: 1, reasignadoDesde: 0 },
  { f: 0.74, m: 'G', lugar: 'Zona 16, colonia Lourdes', lat: 14.6145, lng: -90.4795, tipo: T.VERTEDERO, ciudadano: null,
    desc: 'El vertedero en el terreno junto al bosque sigue creciendo; ahora también tiran ramas y llantas.',
    estado: 'asignado', cuadrilla: 0 },
  { f: 0.78, m: 'M', lugar: 'Colonia El Caminero', lat: 14.6520, lng: -90.5780, tipo: T.ESCOMBROS, ciudadano: 2,
    desc: 'Llantas y escombros a la orilla de la carretera, en la curva antes de la entrada a la colonia.',
    estado: 'asignado', cuadrilla: 0 },
  { f: 0.82, m: 'V', lugar: 'Prados de Villa Hermosa', lat: 14.5355, lng: -90.5705, tipo: T.VERTEDERO, ciudadano: 3,
    desc: 'Bolsas de basura amontonadas en la esquina; ya se ven ratas por las noches.',
    estado: 'asignado', cuadrilla: 0 },
  { f: 0.86, m: 'G', lugar: 'Zona 1, barrio San Sebastián', lat: 14.6448, lng: -90.5118, tipo: T.VERTEDERO, ciudadano: 4,
    desc: 'Basura acumulada en el callejón detrás del mercado; huele muy mal desde la calle.',
    estado: 'recibido' },
  { f: 0.89, m: 'M', lugar: 'Colonia Belencito', lat: 14.6390, lng: -90.6000, tipo: T.AGUA, ciudadano: null,
    desc: 'Bolsas de basura flotando en el río; se ven desde el puente.',
    estado: 'recibido' },
  { f: 0.92, m: 'G', lugar: 'Zona 5, colonia Abril', lat: 14.6268, lng: -90.4948, tipo: T.ESCOMBROS, ciudadano: null,
    desc: 'Dejaron ripio y block quebrado en la calle; ya hubo una moto que se cayó.',
    estado: 'recibido' },
  { f: 0.95, m: 'V', lugar: 'Colonia Enriqueta', lat: 14.5200, lng: -90.5930, tipo: T.VERTEDERO, ciudadano: 0,
    desc: 'Basurero en el terreno baldío a la par de la iglesia.',
    estado: 'recibido' },
  { f: 0.98, m: 'G', lugar: 'Zona 6, Proyectos 4-4', lat: 14.6668, lng: -90.4892, tipo: T.QUEMA, ciudadano: 1,
    desc: 'Están quemando basura en el barranco; el humo llega hasta la avenida.',
    estado: 'recibido' },
];

const COMENTARIOS_INICIO = [
  'Cuadrilla en el lugar, se inicia la recolección.',
  'Se trasladó el camión compactador al punto.',
  'Inicia la limpieza; se requiere un segundo viaje del camión.',
  'Personal en sitio, se delimitó el área de trabajo.',
  'Atención iniciada por la cuadrilla',
];
const COMENTARIOS_RESOLUCION = [
  'Se retiraron aproximadamente 2 m³ de desechos y se barrió el área.',
  'Limpieza completada; se colocó un rótulo de prohibido tirar basura.',
  'Se retiraron 14 llantas y 3 colchones; el área quedó despejada.',
  'Se limpió el barranco y se retiraron 6 costales de basura.',
  'Área limpia; se coordinó con los vecinos para vigilar el punto.',
  'Se retiró todo el material y se lavó la banqueta.',
];

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------
const HORA = 60 * 60 * 1000;

// Fecha del reporte: día según su posición f en el período, a una hora diurna (6:00–19:59).
function fechaReporte(f, i) {
  const dia = new Date(INICIO.getTime() + f * (AHORA.getTime() - INICIO.getTime()));
  dia.setHours(6 + ((i * 5) % 14), (i * 17) % 60, (i * 23) % 60, 0);
  // Si cayó en el futuro (p. ej. hoy más tarde), se adelanta para que siga siendo pasado.
  const tope = AHORA.getTime() - 2 * HORA;
  return new Date(Math.min(dia.getTime(), tope));
}

// Las acciones del personal ocurren en horario laboral (7:00–17:59): si cae fuera,
// pasa a las 7:00 de ese día o del día siguiente.
function enHorarioLaboral(fecha) {
  const d = new Date(fecha);
  if (d.getHours() < 7) d.setHours(7);
  else if (d.getHours() >= 18) { d.setDate(d.getDate() + 1); d.setHours(7); }
  return d;
}

// Siguiente evento del flujo `horas` después del anterior, sin pasarse de "ahora".
function despues(anterior, horas) {
  const t = enHorarioLaboral(anterior.getTime() + horas * HORA).getTime();
  const tope = anterior.getTime() + (AHORA.getTime() - anterior.getTime()) * 0.5;
  return new Date(Math.min(t, tope));
}

// ---------------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------------
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function cargarFotosCarpeta() {
  if (!fs.existsSync(CARPETA_FOTOS)) return null;
  const archivos = fs.readdirSync(CARPETA_FOTOS).filter((a) => MIME[path.extname(a).toLowerCase()]);
  const leer = (prefijo) => archivos
    .filter((a) => a.toLowerCase().startsWith(prefijo))
    .sort()
    .map((a) => `data:${MIME[path.extname(a).toLowerCase()]};base64,${fs.readFileSync(path.join(CARPETA_FOTOS, a)).toString('base64')}`);
  const fotos = { antes: leer('antes_'), despues: leer('despues_') };
  return fotos.antes.length || fotos.despues.length ? fotos : null;
}

const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Imagen de muestra (SVG) cuando no hay fotos reales: "antes" en tonos tierra con bolsas
// de basura; "después" en verde con el área limpia.
function fotoMuestra(tipo, codigo, lugar, n) {
  const antes = tipo === 'antes';
  const fondo = antes ? '#7A5C3E' : '#4E8A55';
  const suelo = antes ? '#5C4330' : '#3E6F44';
  // Cuadrada y con el texto centrado: se ve completa también en las miniaturas recortadas.
  const dibujo = antes
    ? [[200, 330, 62], [300, 350, 50], [400, 335, 58], [250, 300, 38], [355, 300, 34]]
        .map(([x, y, r], k) => `<ellipse cx="${x + n * 12}" cy="${y}" rx="${r}" ry="${r * 0.8}" fill="${['#2B2B2B', '#3D3D3D', '#1F3A5A', '#2B2B2B', '#4A4A4A'][k]}"/>`).join('')
    : '<circle cx="300" cy="300" r="85" fill="#FFFFFF" opacity=".9"/><path d="M258 300 l30 30 l56 -62" stroke="#2C5F2D" stroke-width="17" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
<rect width="600" height="600" fill="${fondo}"/><rect y="420" width="600" height="180" fill="${suelo}"/>
<g font-family="Arial, sans-serif" fill="#fff" text-anchor="middle">
<text x="300" y="120" font-size="54" font-weight="700">${antes ? 'ANTES' : 'DESPUÉS'}</text>
<text x="300" y="170" font-size="30" opacity=".9">${xml(codigo)}</text>
${dibujo}
<text x="300" y="490" font-size="26">${xml(lugar)}</text>
<text x="300" y="540" font-size="20" opacity=".75">Imagen de demostración</text>
</g>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------
async function cargar() {
  const fotosCarpeta = cargarFotosCarpeta();
  let siguienteFoto = { antes: 0, despues: 0 };
  const foto = (tipo, codigo, lugar, n) => {
    const lista = fotosCarpeta?.[tipo];
    if (lista && lista.length) return lista[siguienteFoto[tipo]++ % lista.length];
    return fotoMuestra(tipo, codigo, lugar, n);
  };

  const hash = await bcrypt.hash(PASSWORD, 10);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const q = (t, p) => c.query(t, p);

    // 1. Limpieza: reportes y todo lo que cuelga de ellos (reinicia los ids).
    await q('TRUNCATE notificacion, historial_estado, evidencia_fotografica, reporte RESTART IDENTITY');

    // 2. Municipalidades: solo Guatemala, Mixco y Villa Nueva activas (entre las que tienen límite).
    const munis = {};
    for (const [clave, nombre] of Object.entries(MUNICIPALIDADES)) {
      const r = await q('SELECT id_municipalidad FROM municipalidad WHERE nombre = $1 AND limite IS NOT NULL', [nombre]);
      if (!r.rows.length) throw new Error(`No se encontró "${nombre}" con límite. ¿Corriste database/05_limites_municipales.sql?`);
      munis[clave] = r.rows[0].id_municipalidad;
    }
    await q(
      'UPDATE municipalidad SET estado_activo = (id_municipalidad = ANY($1::int[])) WHERE limite IS NOT NULL',
      [Object.values(munis)]
    );

    // 3. Usuarios: crea o actualiza los de la demostración y borra los demás (salvo los base).
    const rolId = async (nombre) => (await q('SELECT id_rol FROM rol WHERE nombre_rol = $1', [nombre])).rows[0].id_rol;
    const ROL = {
      ciudadano: await rolId('ciudadano'),
      personal_municipal: await rolId('personal_municipal'),
      encargado_cuadrilla: await rolId('encargado_cuadrilla'),
    };
    const upsert = async (nombre, correo, rol, idMuni) => (await q(
      `INSERT INTO usuario (nombre_completo, correo, password_hash, id_rol, id_municipalidad, estado)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (correo) DO UPDATE
         SET nombre_completo = EXCLUDED.nombre_completo, password_hash = EXCLUDED.password_hash,
             id_rol = EXCLUDED.id_rol, id_municipalidad = EXCLUDED.id_municipalidad, estado = TRUE
       RETURNING id_usuario`,
      [nombre, correo, hash, ROL[rol], idMuni]
    )).rows[0].id_usuario;

    const personal = {};
    for (const [clave, p] of Object.entries(PERSONAL)) {
      personal[clave] = {
        coordinador: { id: await upsert(...p.coordinador, 'personal_municipal', munis[clave]), nombre: p.coordinador[0] },
        cuadrillas: [],
      };
      for (const cu of p.cuadrillas) {
        personal[clave].cuadrillas.push({ id: await upsert(...cu, 'encargado_cuadrilla', munis[clave]), nombre: cu[0] });
      }
    }
    const ciudadanos = [];
    for (const ci of CIUDADANOS) ciudadanos.push(await upsert(...ci, 'ciudadano', null));

    const conservar = [
      ...USUARIOS_BASE,
      ...Object.values(PERSONAL).flatMap((p) => [p.coordinador[1], ...p.cuadrillas.map((x) => x[1])]),
      ...CIUDADANOS.map((x) => x[1]),
    ];
    const borrados = await q('DELETE FROM usuario WHERE NOT (correo = ANY($1::text[])) RETURNING correo', [conservar]);

    // 4. Reportes con su historial, evidencias y notificaciones.
    const estadoId = {};
    for (const r of (await q('SELECT id_estado, nombre_estado FROM estado_reporte')).rows) estadoId[r.nombre_estado] = r.id_estado;

    for (const [i, rep] of REPORTES.entries()) {
      // Verifica que el punto caiga dentro del límite de su municipalidad.
      const dentro = await q(
        'SELECT ST_Contains(limite, ST_SetSRID(ST_MakePoint($2, $1), 4326)) AS ok FROM municipalidad WHERE id_municipalidad = $3',
        [rep.lat, rep.lng, munis[rep.m]]
      );
      if (!dentro.rows[0].ok) throw new Error(`"${rep.lugar}" no cae dentro de ${MUNICIPALIDADES[rep.m]}.`);

      const equipo = personal[rep.m];
      const idCiudadano = rep.ciudadano == null ? null : ciudadanos[rep.ciudadano];
      const fecha = fechaReporte(rep.f, i);

      const ins = await q(
        `INSERT INTO reporte (id_usuario_reporta, id_municipalidad, id_tipo_incidencia, id_estado_actual,
                              descripcion, latitud, longitud, fecha_reporte)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_reporte`,
        [idCiudadano, munis[rep.m], rep.tipo, estadoId.recibido, rep.desc, rep.lat, rep.lng, fecha]
      );
      const id = ins.rows[0].id_reporte;
      // Mismo formato que el backend (generarCodigo): ER-AAAA-0000.
      const codigo = `ER-${fecha.getFullYear()}-${String(id).padStart(4, '0')}`;
      await q('UPDATE reporte SET codigo_seguimiento = $1 WHERE id_reporte = $2', [codigo, id]);

      // Historial + notificación (al ciudadano registrado) de cada paso del flujo.
      const paso = async (estado, cuando, idResponsable, comentario, mensaje) => {
        await q(
          `INSERT INTO historial_estado (id_reporte, id_estado, id_usuario_responsable, comentario, fecha_cambio)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, estadoId[estado], idResponsable, comentario, cuando]
        );
        if (idCiudadano && mensaje) {
          // Las de los últimos 10 días quedan sin leer (la campanita del ciudadano muestra pendientes).
          const leida = AHORA.getTime() - cuando.getTime() > 10 * 24 * HORA;
          await q(
            `INSERT INTO notificacion (id_usuario, id_reporte, mensaje, leida, fecha_envio)
             VALUES ($1, $2, $3, $4, $5)`,
            [idCiudadano, id, mensaje, leida, cuando]
          );
        }
      };
      const cambio = (estado) => `Tu reporte ${codigo} cambió al estado: ${estado}.`;

      // recibido (lo registra el sistema al crear el reporte, sin responsable).
      await paso('recibido', fecha, null, 'Reporte recibido', null);

      // Evidencia del ciudadano (en 2 de cada 3 reportes; 1 o 2 fotos).
      if (i % 3 !== 2) {
        for (let n = 0; n < 1 + (i % 2); n++) {
          await q(
            `INSERT INTO evidencia_fotografica (id_reporte, id_usuario, url_imagen, tipo_evidencia, fecha_carga)
             VALUES ($1, $2, $3, 'ciudadana', $4)`,
            [id, idCiudadano, foto('antes', codigo, rep.lugar, n), fecha]
          );
        }
      }

      let t = fecha;
      let estadoFinal = 'recibido';
      let asignado = null;

      if (rep.estado === 'descartado') {
        t = despues(t, 2 + (i % 10));
        await paso('descartado', t, equipo.coordinador.id, rep.motivo, cambio('descartado'));
        estadoFinal = 'descartado';
      } else if (rep.estado !== 'recibido') {
        // asignado (coordinador), con una reasignación previa en algunos casos.
        const primera = equipo.cuadrillas[rep.reasignadoDesde ?? rep.cuadrilla];
        t = despues(t, 3 + ((i * 7) % 20));
        await paso('asignado', t, equipo.coordinador.id, `Asignado a ${primera.nombre}`, cambio('asignado'));
        asignado = primera;
        if (rep.reasignadoDesde != null) {
          const nueva = equipo.cuadrillas[rep.cuadrilla];
          t = despues(t, 4 + (i % 6));
          await paso('asignado', t, equipo.coordinador.id, `Reasignado de ${primera.nombre} a ${nueva.nombre}`,
            `Tu reporte ${codigo} fue reasignado a otra cuadrilla.`);
          asignado = nueva;
        }
        estadoFinal = 'asignado';

        if (rep.estado === 'en_atencion' || rep.estado === 'resuelto') {
          t = despues(t, 10 + ((i * 11) % 30));
          await paso('en_atencion', t, asignado.id, COMENTARIOS_INICIO[i % COMENTARIOS_INICIO.length], cambio('en_atencion'));
          estadoFinal = 'en_atencion';
        }
        if (rep.estado === 'resuelto') {
          t = despues(t, 5 + ((i * 13) % 40));
          await paso('resuelto', t, asignado.id, COMENTARIOS_RESOLUCION[i % COMENTARIOS_RESOLUCION.length], cambio('resuelto'));
          // Evidencia de la limpieza (obligatoria al resolver): 1 o 2 fotos.
          for (let n = 0; n < 1 + ((i + 1) % 2); n++) {
            await q(
              `INSERT INTO evidencia_fotografica (id_reporte, id_usuario, url_imagen, tipo_evidencia, fecha_carga)
               VALUES ($1, $2, $3, 'municipal', $4)`,
              [id, asignado.id, foto('despues', codigo, rep.lugar, n), t]
            );
          }
          estadoFinal = 'resuelto';
        }
      }

      if (t > AHORA) throw new Error(`El flujo de ${codigo} terminó en el futuro.`);
      await q(
        'UPDATE reporte SET id_estado_actual = $1, id_usuario_asignado = $2 WHERE id_reporte = $3',
        [estadoId[estadoFinal], asignado?.id ?? null, id]
      );
    }

    await q('COMMIT');
    return { borrados: borrados.rows.map((r) => r.correo), fotosReales: !!fotosCarpeta };
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
  }
}

async function resumen() {
  const porMuni = await pool.query(`
    SELECT m.nombre AS municipalidad,
           count(*) FILTER (WHERE e.nombre_estado = 'recibido')    AS recibido,
           count(*) FILTER (WHERE e.nombre_estado = 'asignado')    AS asignado,
           count(*) FILTER (WHERE e.nombre_estado = 'en_atencion') AS en_atencion,
           count(*) FILTER (WHERE e.nombre_estado = 'resuelto')    AS resuelto,
           count(*) FILTER (WHERE e.nombre_estado = 'descartado')  AS descartado,
           count(*) AS total
    FROM reporte r
    JOIN municipalidad m USING (id_municipalidad)
    JOIN estado_reporte e ON e.id_estado = r.id_estado_actual
    GROUP BY m.nombre ORDER BY m.nombre`);
  console.log('\nReportes por municipalidad y estado:');
  console.table(porMuni.rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === 'municipalidad' ? v : Number(v)]))));

  const otros = await pool.query(`
    SELECT (SELECT count(*) FROM evidencia_fotografica WHERE tipo_evidencia = 'ciudadana') AS fotos_ciudadanas,
           (SELECT count(*) FROM evidencia_fotografica WHERE tipo_evidencia = 'municipal') AS fotos_limpieza,
           (SELECT count(*) FROM historial_estado) AS historial,
           (SELECT count(*) FROM notificacion) AS notificaciones,
           (SELECT count(*) FROM reporte WHERE id_usuario_reporta IS NULL) AS anonimos`);
  console.log('Otros datos:', otros.rows[0]);

  const usuarios = await pool.query(`
    SELECT u.nombre_completo AS nombre, u.correo, r.nombre_rol AS rol, coalesce(m.nombre, '—') AS municipalidad
    FROM usuario u JOIN rol r USING (id_rol) LEFT JOIN municipalidad m USING (id_municipalidad)
    ORDER BY array_position(ARRAY['administrador','personal_municipal','encargado_cuadrilla','ciudadano'], r.nombre_rol::text),
             m.nombre NULLS LAST, u.nombre_completo`);
  console.log(`\nUsuarios (contraseña de los nuevos: ${PASSWORD}):`);
  console.table(usuarios.rows);
}

async function main() {
  try {
    const { borrados, fotosReales } = await cargar();
    console.log('Datos de demostración cargados.');
    console.log(`Fotos: ${fotosReales ? 'database/demo_fotos/' : 'imágenes de muestra generadas'}.`);
    if (borrados.length) console.log('Usuarios eliminados:', borrados.join(', '));
    await resumen();
  } catch (err) {
    console.error('Error al cargar los datos de demostración:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) main();

// scripts/preparar-bd-pruebas.js reutiliza la carga (no cierra el pool).
module.exports = { cargarDatosDemo: cargar, resumen };
