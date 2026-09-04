<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="bienvenida">
    <div class="halo"></div>
    <div class="contenido">
      <div class="marca">
        <div class="logo"></div>
        <h1>EcoReporte GT</h1>
      </div>
      <p class="descripcion">
        Plataforma ciudadana para reportar vertederos clandestinos en Guatemala
        y darle seguimiento a su atención junto a las municipalidades.
      </p>

      <div class="tarjetas">
        <button class="tarjeta ciudadano" @click="router.push('/portal')">
          <span class="icono">🌱</span>
          <h2>Soy Ciudadano</h2>
          <p>Reportá un vertedero, consultá el estado de tu denuncia o mirá el mapa. No necesitás cuenta.</p>
          <span class="cta">Entrar al portal ciudadano →</span>
        </button>

        <button class="tarjeta municipal" @click="router.push('/municipal/login')">
          <span class="icono">🏛️</span>
          <h2>Soy Municipalidad</h2>
          <p>Accedé al panel para gestionar los reportes recibidos en tu municipalidad.</p>
          <span class="cta">Ingresar al panel municipal →</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bienvenida {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, var(--cream) 0%, #eaf0e2 100%);
  padding: 24px;
  position: relative;
  overflow: hidden;
}
.halo {
  position: absolute;
  width: 700px;
  height: 700px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(151, 188, 98, 0.25) 0%, rgba(151, 188, 98, 0) 70%);
  top: -220px;
  right: -220px;
}
.contenido {
  position: relative;
  max-width: 780px;
  text-align: center;
}
.marca {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 14px;
}
.logo {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--forest);
  box-shadow: 0 0 0 6px rgba(151, 188, 98, 0.35);
}
.marca h1 {
  font-family: Georgia, serif;
  color: var(--forest);
  font-size: 32px;
}
.descripcion {
  color: var(--slate);
  font-size: 15px;
  max-width: 560px;
  margin: 0 auto 36px;
  line-height: 1.5;
}
.tarjetas {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.tarjeta {
  background: #fff;
  border: none;
  border-radius: 14px;
  padding: 30px 24px;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
  transition: transform 0.15s, box-shadow 0.15s;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tarjeta:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.14);
}
.tarjeta .icono {
  font-size: 30px;
  margin-bottom: 4px;
}
.tarjeta h2 {
  color: var(--forest);
  font-size: 19px;
}
.tarjeta p {
  color: #666;
  font-size: 13px;
  line-height: 1.45;
  margin-bottom: 8px;
}
.tarjeta .cta {
  font-size: 13px;
  font-weight: 700;
}
.tarjeta.ciudadano .cta { color: var(--forest); }
.tarjeta.municipal { border-top: 4px solid var(--forest-dark); }
.tarjeta.municipal .cta { color: var(--amber); }

@media (max-width: 640px) {
  .tarjetas { grid-template-columns: 1fr; }
  .marca h1 { font-size: 26px; }
}
</style>
