// Enlace "Cómo llegar" hacia un punto, sin depender de un proveedor de mapas:
// - iPhone / iPad: Apple Maps (Safari en iOS no abre enlaces geo:).
// - Otros celulares (Android): URI geo:, que abre la app de mapas que tenga instalada el usuario.
// - Escritorio: OpenStreetMap centrado en la ubicación, con un marcador.

function esIOS() {
  // iPadOS se presenta como "Macintosh", pero a diferencia de una Mac tiene pantalla táctil.
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function esCelular() {
  if (navigator.userAgentData) return navigator.userAgentData.mobile;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function urlComoLlegar(latitud, longitud) {
  const lat = Number(latitud);
  const lng = Number(longitud);
  if (esIOS()) {
    // Enlace universal: en iOS abre la app Mapas con un marcador en el punto.
    return `https://maps.apple.com/?ll=${lat},${lng}&q=${lat},${lng}`;
  }
  if (esCelular()) {
    // ?q= hace que la app muestre un marcador en el punto (no solo centre el mapa).
    return `geo:${lat},${lng}?q=${lat},${lng}`;
  }
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}
