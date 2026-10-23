<script setup>
// Portada del portal ciudadano ("/"): punto de entrada público de la app.
// Va dentro de PortalCiudadanoLayout, que ya pone la barra y la región <main>.
const OPCIONES = [
  {
    ruta: '/portal',
    icono: 'bx-trash',
    titulo: 'Reportar un vertedero',
    texto: 'Marcá la ubicación en el mapa, contá qué viste y subí fotos. No necesitás cuenta.',
    cta: 'Hacer un reporte',
    principal: true,
  },
  {
    ruta: '/portal/mapa',
    icono: 'bx-map-alt',
    titulo: 'Ver el mapa',
    texto: 'Mirá los reportes de tu zona y en qué estado está cada uno.',
    cta: 'Abrir el mapa',
  },
  {
    ruta: '/portal/consultar',
    icono: 'bx-search',
    titulo: 'Consultar un reporte',
    texto: 'Ingresá tu código de seguimiento (por ejemplo ER-2026-0001) para ver su avance.',
    cta: 'Consultar',
  },
];
</script>

<template>
  <div class="inicio">
    <section class="encabezado">
      <div class="logo"><i class="bx bx-leaf"></i></div>
      <h1>Reportá vertederos clandestinos</h1>
      <p class="descripcion">
        EcoReporte GT conecta a los vecinos del departamento de Guatemala con su municipalidad:
        vos reportás, la municipalidad asigna una cuadrilla y podés seguir la limpieza hasta el final.
      </p>
    </section>

    <div class="tarjetas">
      <router-link
        v-for="o in OPCIONES"
        :key="o.ruta"
        :to="o.ruta"
        class="tarjeta"
        :class="{ principal: o.principal }"
      >
        <span class="icono"><i class="bx" :class="o.icono"></i></span>
        <h2>{{ o.titulo }}</h2>
        <p>{{ o.texto }}</p>
        <span class="cta">{{ o.cta }} <i class="bx bx-right-arrow-alt"></i></span>
      </router-link>
    </div>

    <p class="nota">
      <i class="bx bx-envelope"></i>
      Si reportás con tu cuenta, te avisamos por correo cada vez que tu reporte cambie de estado.
      <router-link to="/portal/registro">Crear una cuenta</router-link>
    </p>
  </div>
</template>

<style scoped>
.inicio {
  max-width: 980px;
  margin: 0 auto;
  padding: 48px 24px 56px;
}
.encabezado { text-align: center; margin-bottom: 36px; }
.logo {
  width: 52px;
  height: 52px;
  margin: 0 auto 16px;
  border-radius: 12px;
  background: var(--forest);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 26px;
}
.encabezado h1 {
  color: var(--forest-dark);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -.01em;
  margin-bottom: 12px;
}
.descripcion {
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.6;
  max-width: 620px;
  margin: 0 auto;
}
.tarjetas {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.tarjeta {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: 28px 24px;
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  transition: transform .15s, box-shadow .15s, border-color .15s;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tarjeta:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: var(--moss);
}
.tarjeta.principal { border-top: 3px solid var(--forest); }
.icono {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  margin-bottom: 8px;
  background: var(--cream);
  color: var(--forest);
}
.tarjeta.principal .icono { background: var(--forest); color: #fff; }
.tarjeta h2 { color: var(--forest-dark); font-size: 17px; font-weight: 700; }
.tarjeta p {
  color: var(--text-secondary);
  font-size: 13.5px;
  line-height: 1.5;
  margin-bottom: 8px;
  flex: 1;
}
.cta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--forest);
}
.nota {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 28px;
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
}
.nota i { font-size: 16px; color: var(--forest); }
.nota a { font-weight: 600; }

@media (max-width: 860px) {
  .tarjetas { grid-template-columns: 1fr; max-width: 520px; margin: 0 auto; }
}
@media (max-width: 640px) {
  .inicio { padding: 32px 16px 40px; }
  .encabezado h1 { font-size: 24px; }
}
</style>
