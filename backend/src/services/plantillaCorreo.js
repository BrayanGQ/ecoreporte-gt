// Plantilla de los correos de EcoReporte GT: HTML simple (tablas y estilos en línea, que es lo
// que respetan los clientes de correo), adaptable al celular, con los colores de la app, y su
// versión en texto plano.
// Todo el contenido entra como texto plano y se escapa aquí: la descripción, los nombres y el
// motivo del descarte los escriben los usuarios.

const COLORES = {
  forest: '#2C5F2D',
  forestDark: '#243D20',
  moss: '#97BC62',
  amber: '#E0A800',
  cream: '#F5F7F0',
  bg: '#F7F8FA',
  border: '#E4E7EC',
  slate: '#3A3A3A',
  secundario: '#667085',
};

const FUENTE = "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

function escapar(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Texto con saltos de línea → HTML escapado con <br>.
const conSaltos = (texto) => escapar(texto).replace(/\r?\n/g, '<br>');

// URL pública de la app (frontend), sin barra final. Ej.: https://ecoreporte-gt.onrender.com
function urlApp(ruta = '') {
  const base = (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return base + ruta;
}

// Arma { html, texto } a partir de bloques de texto plano:
//   titulo, saludo?, parrafos[], datos[[etiqueta, valor]], botones[{ texto, url, secundario? }],
//   nota? (texto chico al final del contenido).
function armarCorreo({ titulo, saludo, parrafos = [], datos = [], botones = [], nota }) {
  const filasDatos = datos
    .filter(([, valor]) => valor != null && String(valor).trim() !== '')
    .map(([etiqueta, valor]) => `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid ${COLORES.border};color:${COLORES.secundario};font-size:13px;vertical-align:top;width:34%;">${escapar(etiqueta)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid ${COLORES.border};color:${COLORES.slate};font-size:14px;font-weight:600;vertical-align:top;word-break:break-word;">${conSaltos(valor)}</td>
          </tr>`).join('');

  const htmlBotones = botones.map((b) => {
    const fondo = b.secundario ? '#FFFFFF' : COLORES.forest;
    const color = b.secundario ? COLORES.forest : '#FFFFFF';
    return `
          <a href="${escapar(b.url)}" target="_blank" rel="noopener"
             style="display:inline-block;margin:6px 6px 0 0;padding:12px 20px;border-radius:6px;border:1px solid ${COLORES.forest};background:${fondo};color:${color};font-size:14px;font-weight:600;text-decoration:none;">${escapar(b.texto)}</a>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapar(titulo)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORES.bg};font-family:${FUENTE};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORES.bg};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${COLORES.border};border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:${COLORES.forest};padding:18px 24px;border-bottom:4px solid ${COLORES.moss};">
              <span style="color:#FFFFFF;font-size:18px;font-weight:700;">EcoReporte GT</span>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:${COLORES.slate};font-size:15px;line-height:1.55;">
              <h1 style="margin:0 0 14px;color:${COLORES.forestDark};font-size:20px;line-height:1.3;">${escapar(titulo)}</h1>
              ${saludo ? `<p style="margin:0 0 12px;">${escapar(saludo)}</p>` : ''}
              ${parrafos.map((p) => `<p style="margin:0 0 12px;">${conSaltos(p)}</p>`).join('')}
              ${filasDatos ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;background:${COLORES.cream};border:1px solid ${COLORES.border};border-radius:6px;">${filasDatos}
              </table>` : ''}
              ${htmlBotones ? `<div style="margin:8px 0 4px;">${htmlBotones}</div>` : ''}
              ${nota ? `<p style="margin:16px 0 0;color:${COLORES.secundario};font-size:12.5px;">${conSaltos(nota)}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px;background:${COLORES.cream};color:${COLORES.secundario};font-size:12px;line-height:1.5;">
              Este es un correo automático de EcoReporte GT, la plataforma para reportar vertederos
              clandestinos en el departamento de Guatemala. No respondas a este mensaje.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const texto = [
    'EcoReporte GT',
    '',
    titulo,
    '',
    ...(saludo ? [saludo, ''] : []),
    ...parrafos.flatMap((p) => [p, '']),
    ...datos
      .filter(([, valor]) => valor != null && String(valor).trim() !== '')
      .map(([etiqueta, valor]) => `${etiqueta}: ${valor}`),
    ...(datos.length ? [''] : []),
    ...botones.map((b) => `${b.texto}: ${b.url}`),
    ...(nota ? ['', nota] : []),
    '',
    '--',
    'Correo automático de EcoReporte GT. No respondas a este mensaje.',
  ].join('\n');

  return { html, texto };
}

module.exports = { armarCorreo, escapar, urlApp };
