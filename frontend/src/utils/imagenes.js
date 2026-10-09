// Utilidades para preparar fotos antes de enviarlas a la API como base64 (data URL).

function leerComoDataUrl(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    lector.readAsDataURL(archivo);
  });
}

function cargarImagen(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo abrir la imagen.'));
    img.src = src;
  });
}

// Convierte una foto (p. ej. de la cámara del celular, que suele pesar varios MB) en un
// JPEG reducido a `maxLado` píxeles en su lado mayor. Así 5 fotos viajan rápido con datos
// móviles y caben en el límite del backend. Si el navegador no puede decodificarla,
// devuelve el archivo original en base64.
export async function prepararFoto(archivo, { maxLado = 1600, calidad = 0.8 } = {}) {
  const original = await leerComoDataUrl(archivo);
  try {
    const img = await cargarImagen(original);
    const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const reducida = canvas.toDataURL('image/jpeg', calidad);
    return reducida.length < original.length ? reducida : original;
  } catch (e) {
    return original;
  }
}
