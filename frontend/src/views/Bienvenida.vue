<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="bienvenida">
    <div class="halo"></div>
    <div class="contenido">
      <div class="marca">
        <div class="logo"><i class="bx bx-leaf"></i></div>
        <h1>EcoReporte GT</h1>
      </div>
      <p class="descripcion">
        Plataforma ciudadana para reportar vertederos clandestinos en Guatemala
        y darle seguimiento a su atención junto a las municipalidades.
      </p>

      <div class="tarjetas">
        <button class="tarjeta ciudadano" @click="router.push('/portal')">
          <span class="icono"><i class="bx bx-user"></i></span>
          <h2>Soy Ciudadano</h2>
          <p>Reportá un vertedero, consultá el estado de tu denuncia o mirá el mapa. No necesitás cuenta.</p>
          <span class="cta">Entrar al portal ciudadano <i class="bx bx-right-arrow-alt"></i></span>
        </button>

        <button class="tarjeta municipal" @click="router.push('/municipal/login')">
          <span class="icono"><i class="bx bx-building"></i></span>
          <h2>Soy Municipalidad</h2>
          <p>Accedé al panel para gestionar los reportes recibidos en tu municipalidad.</p>
          <span class="cta">Ingresar al panel municipal <i class="bx bx-right-arrow-alt"></i></span>
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
  background: var(--bg);
  padding: 24px;
  position: relative;
  overflow: hidden;
}
.halo {
  position: absolute;
  width: 700px;
  height: 700px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(151, 188, 98, .16) 0%, rgba(151, 188, 98, 0) 70%);
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
  margin-bottom: 16px;
}
.logo {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--forest);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 22px;
}
.marca h1 {
  font-weight: 700;
  color: var(--forest-dark);
  font-size: 30px;
  letter-spacing: -.01em;
}
.descripcion {
  color: var(--text-secondary);
  font-size: 15px;
  max-width: 560px;
  margin: 0 auto 40px;
  line-height: 1.6;
}
.tarjetas {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.tarjeta {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: 32px 26px;
  text-align: left;
  cursor: pointer;
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
.tarjeta .icono {
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
.tarjeta.municipal .icono { background: #FCF3DC; color: var(--amber); }
.tarjeta h2 {
  color: var(--forest-dark);
  font-size: 18px;
  font-weight: 700;
}
.tarjeta p {
  color: var(--text-secondary);
  font-size: 13.5px;
  line-height: 1.5;
  margin-bottom: 8px;
}
.tarjeta .cta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
}
.tarjeta.ciudadano .cta { color: var(--forest); }
.tarjeta.municipal { border-top: 3px solid var(--forest-dark); }
.tarjeta.municipal .cta { color: var(--amber); }

@media (max-width: 640px) {
  .tarjetas { grid-template-columns: 1fr; }
  .marca h1 { font-size: 24px; }
}
</style>
