<script setup>
import { ref } from 'vue';
import { authService } from '../services/api';

const paso = ref(1); // 1 = solicitar, 2 = restablecer
const correo = ref('');
const token = ref('');
const nuevaPassword = ref('');
const mensaje = ref('');
const error = ref('');
const cargando = ref(false);

async function solicitar() {
  error.value = '';
  mensaje.value = '';
  cargando.value = true;
  try {
    const { data } = await authService.recuperar(correo.value);
    mensaje.value = data.mensaje;
    // En desarrollo, el backend devuelve el token para poder continuar la prueba.
    if (data.token_recuperacion) {
      token.value = data.token_recuperacion;
      paso.value = 2;
    }
  } catch (err) {
    error.value = err.response?.data?.error || 'Error al procesar la solicitud.';
  } finally {
    cargando.value = false;
  }
}

async function restablecer() {
  error.value = '';
  mensaje.value = '';
  cargando.value = true;
  try {
    const { data } = await authService.restablecer(token.value, nuevaPassword.value);
    mensaje.value = data.mensaje + ' Ya podés iniciar sesión.';
  } catch (err) {
    error.value = err.response?.data?.error || 'Error al restablecer la contraseña.';
  } finally {
    cargando.value = false;
  }
}
</script>

<template>
  <div class="container-narrow">
    <div class="card">
      <h1 class="title">Recuperar contraseña</h1>

      <div v-if="error" class="alert error">{{ error }}</div>
      <div v-if="mensaje" class="alert ok">{{ mensaje }}</div>

      <!-- Paso 1: solicitar por correo -->
      <template v-if="paso === 1">
        <p class="sub">Ingresá tu correo y te enviaremos instrucciones para restablecerla.</p>
        <label>Correo electrónico</label>
        <input v-model="correo" type="email" placeholder="correo@ejemplo.com" />
        <button class="btn block" style="margin-top:20px" :disabled="cargando" @click="solicitar">
          {{ cargando ? 'Enviando...' : 'Enviar instrucciones' }}
        </button>
      </template>

      <!-- Paso 2: restablecer con nueva contraseña -->
      <template v-else>
        <p class="sub">Ingresá tu nueva contraseña.</p>
        <label>Nueva contraseña</label>
        <input v-model="nuevaPassword" type="password" placeholder="Mínimo 6 caracteres" />
        <button class="btn block" style="margin-top:20px" :disabled="cargando" @click="restablecer">
          {{ cargando ? 'Guardando...' : 'Restablecer contraseña' }}
        </button>
      </template>

      <div style="margin-top:16px; font-size:13px; text-align:center;">
        <router-link to="/portal/login">Volver a iniciar sesión</router-link>
      </div>
    </div>
  </div>
</template>
