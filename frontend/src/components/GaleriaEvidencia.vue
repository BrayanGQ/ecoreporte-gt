<script setup>
// Miniaturas de evidencia fotográfica con vista ampliada al hacer clic.
import { ref } from 'vue';

defineProps({
  imagenes: { type: Array, default: () => [] }, // [{ id_evidencia, url_imagen }]
  vacio: { type: String, default: 'No hay fotografías.' },
});

const ampliada = ref(null);
</script>

<template>
  <div v-if="imagenes.length" class="evidencias">
    <button
      v-for="ev in imagenes"
      :key="ev.id_evidencia"
      type="button"
      class="evidencia"
      @click="ampliada = ev.url_imagen"
    >
      <img :src="ev.url_imagen" :alt="'Evidencia ' + ev.id_evidencia" loading="lazy" />
    </button>
  </div>
  <p v-else class="sin-evidencia">{{ vacio }}</p>

  <Teleport to="body">
    <div v-if="ampliada" class="lightbox" @click="ampliada = null">
      <button type="button" class="cerrar" title="Cerrar"><i class="bx bx-x"></i></button>
      <img :src="ampliada" alt="Evidencia ampliada" @click.stop />
    </div>
  </Teleport>
</template>

<style scoped>
.evidencias { display: flex; flex-wrap: wrap; gap: 10px; }
.evidencia {
  width: 110px; height: 110px; padding: 0; border: 1px solid var(--border);
  border-radius: var(--radius-input); overflow: hidden; background: none;
  transition: border-color .15s, transform .15s;
}
.evidencia:hover { border-color: var(--moss); transform: translateY(-2px); }
.evidencia img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sin-evidencia { font-size: 13px; color: var(--text-secondary); }

.lightbox {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(16, 24, 40, .8);
  display: flex; align-items: center; justify-content: center;
  padding: 32px;
}
.lightbox img {
  max-width: 90vw; max-height: 88vh; border-radius: var(--radius-card);
  box-shadow: 0 8px 32px rgba(0, 0, 0, .4);
}
.lightbox .cerrar {
  position: absolute; top: 20px; right: 24px;
  width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
  background: rgba(255, 255, 255, .15); color: #fff; border: none; border-radius: 50%;
  font-size: 24px;
}
.lightbox .cerrar:hover { background: rgba(255, 255, 255, .3); }

@media (max-width: 480px) {
  .evidencia { width: calc(33.333% - 7px); height: auto; aspect-ratio: 1; }
}
</style>
