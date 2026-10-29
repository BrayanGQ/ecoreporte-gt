// Envío de correos transaccionales con la API HTTP de Brevo (Render gratis bloquea SMTP).
// Variables de entorno:
//   BREVO_API_KEY            clave de la API de Brevo. Sin ella no se envía nada.
//   CORREO_REMITENTE         correo remitente verificado en Brevo.
//   CORREO_REMITENTE_NOMBRE  nombre visible del remitente (por defecto "EcoReporte GT").
// Con NODE_ENV=test nunca se envía: las pruebas no deben mandar correos reales.
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const TIEMPO_MAXIMO_MS = 10000;

// Dominios de las cuentas de demostración (seed.js, demo.js) y de las pruebas: no son buzones
// reales. Escribirles rebotaría y dañaría la reputación del remitente en Brevo.
const DOMINIOS_SIN_ENVIO = ['ecoreporte.gt', 'prueba.test'];

// Motivo por el que no se envía, o null si el envío está configurado.
function motivoSinEnvio(para) {
  if (process.env.NODE_ENV === 'test') return 'NODE_ENV=test';
  if (!process.env.BREVO_API_KEY) return 'falta BREVO_API_KEY';
  if (!process.env.CORREO_REMITENTE) return 'falta CORREO_REMITENTE';
  const dominio = String(para || '').split('@').pop().toLowerCase();
  if (DOMINIOS_SIN_ENVIO.includes(dominio)) return `cuenta de demostración (@${dominio})`;
  return null;
}

// Envía un correo. Devuelve { enviado: true, messageId } o { enviado: false, motivo } si el envío
// está desactivado. Lanza un error si Brevo rechaza la petición o no responde: quien lo llama
// decide qué hacer (los avisos del flujo solo lo registran, ver avisosCorreo.js).
async function enviarCorreo({ para, nombre, asunto, html, texto }) {
  const motivo = motivoSinEnvio(para);
  if (motivo) {
    console.log(`[correo] No se envía (${motivo}): "${asunto}" para ${para}`);
    return { enviado: false, motivo };
  }

  const respuesta = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: process.env.CORREO_REMITENTE,
        name: process.env.CORREO_REMITENTE_NOMBRE || 'EcoReporte GT',
      },
      to: [nombre ? { email: para, name: nombre } : { email: para }],
      subject: asunto,
      htmlContent: html,
      textContent: texto,
    }),
    signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
  });

  const cuerpo = await respuesta.text();
  if (!respuesta.ok) {
    throw new Error(`Brevo respondió ${respuesta.status}: ${cuerpo.slice(0, 300)}`);
  }
  let messageId = null;
  try {
    messageId = JSON.parse(cuerpo).messageId ?? null;
  } catch {
    // Respuesta 2xx sin JSON: el envío igual fue aceptado.
  }
  console.log(`[correo] Enviado "${asunto}" para ${para} (Brevo ${respuesta.status}, messageId ${messageId})`);
  return { enviado: true, messageId };
}

module.exports = { enviarCorreo, BREVO_URL };
