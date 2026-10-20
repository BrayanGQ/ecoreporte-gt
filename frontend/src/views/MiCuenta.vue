<script setup>
// Mi cuenta: datos del usuario y cambio de la contraseña propia.
// Se usa en los dos portales (/portal/cuenta y /municipal/panel/cuenta).
import { ref } from 'vue';
import { authService } from '../services/api';
import { obtenerUsuario } from '../utils/sesion';

const usuario = obtenerUsuario();

const ETIQUETAS_ROL = {
  ciudadano: 'Ciudadano',
  personal_municipal: 'Personal municipal (coordinador)',
  encargado_cuadrilla: 'Encargado de cuadrilla',
  administrador: 'Administrador',
};

const form = ref({ actual: '', nueva: '', confirmacion: '' });
const mostrar = ref(false);
const guardando = ref(false);
const error = ref('');
const exito = ref('');

async function cambiar() {
  error.value = '';
  exito.value = '';
  const { actual, nueva, confirmacion } = form.value;
  if (!actual || !nueva || !confirmacion) {
    error.value = 'Completá los tres campos.';
    return;
  }
  if (nueva.length < 6) {
    error.value = 'La contraseña nueva debe tener al menos 6 caracteres.';
    return;
  }
  if (nueva !== confirmacion) {
    error.value = 'La confirmación no coincide con la contraseña nueva.';
    return;
  }
  if (nueva === actual) {
    error.value = 'La contraseña nueva debe ser distinta de la actual.';
    return;
  }

  guardando.value = true;
  try {
    const { data } = await authService.cambiarPassword(actual, nueva);
    exito.value = `${data.mensaje} Usala la próxima vez que inicies sesión.`;
    form.value = { actual: '', nueva: '', confirmacion: '' };
  } catch (err) {
    error.value = err.response?.data?.error || 'No se pudo cambiar la contraseña.';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div class="container-narrow">
    <div class="card">
      <h1 class="title"><i class="bx bx-user-circle"></i> Mi cuenta</h1>

      <dl v-if="usuario" class="datos">
        <div><dt>Nombre</dt><dd>{{ usuario.nombre_completo }}</dd></div>
        <div><dt>Correo</dt><dd>{{ usuario.correo }}</dd></div>
        <div><dt>Rol</dt><dd>{{ ETIQUETAS_ROL[usuario.rol] || usuario.rol }}</dd></div>
      </dl>

      <h2 class="subtitulo"><i class="bx bx-key"></i> Cambiar contraseña</h2>
      <p class="sub">
        Si el administrador te asignó una contraseña temporal, cambiala por una propia.
      </p>

      <div v-if="error" class="alert error"><i class="bx bx-error-circle"></i> {{ error }}</div>
      <div v-if="exito" class="alert ok"><i class="bx bx-check-circle"></i> {{ exito }}</div>

      <form @submit.prevent="cambiar">
        <label for="password-actual">Contraseña actual</label>
        <input id="password-actual" v-model="form.actual" :type="mostrar ? 'text' : 'password'" autocomplete="current-password" />

        <label for="password-nueva">Contraseña nueva</label>
        <input id="password-nueva" v-model="form.nueva" :type="mostrar ? 'text' : 'password'" autocomplete="new-password"
               placeholder="Mínimo 6 caracteres" />

        <label for="password-confirmacion">Confirmá la contraseña nueva</label>
        <input id="password-confirmacion" v-model="form.confirmacion" :type="mostrar ? 'text' : 'password'"
               autocomplete="new-password" />

        <label class="check"><input v-model="mostrar" type="checkbox" /> Mostrar contraseñas</label>

        <button type="submit" class="btn block" :disabled="guardando">
          <i class="bx bx-save"></i> {{ guardando ? 'Guardando...' : 'Cambiar contraseña' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.title { display: flex; align-items: center; gap: 10px; }
.datos {
  display: grid; gap: 8px; margin: 4px 0 22px; padding: 14px 16px;
  background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-input);
}
.datos div { display: grid; grid-template-columns: 80px 1fr; gap: 8px; font-size: 13.5px; }
.datos dt { color: var(--text-secondary); }
.datos dd { color: var(--slate); font-weight: 600; word-break: break-word; }
.subtitulo {
  display: flex; align-items: center; gap: 8px;
  font-size: 16px; font-weight: 700; color: var(--forest-dark); margin-bottom: 4px;
}
.subtitulo i { color: var(--forest); font-size: 18px; }
.check { display: flex; align-items: center; gap: 8px; font-weight: 400; margin: 14px 0 18px; }
.check input { width: auto; }
</style>
