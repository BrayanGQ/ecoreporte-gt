<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { authService } from '../services/api';

const router = useRouter();
const nombre = ref('');
const correo = ref('');
const password = ref('');
const password2 = ref('');
const error = ref('');
const ok = ref('');
const cargando = ref(false);

async function registrar() {
  error.value = '';
  ok.value = '';
  if (password.value !== password2.value) {
    error.value = 'Las contraseñas no coinciden.';
    return;
  }
  cargando.value = true;
  try {
    await authService.registro({
      nombre_completo: nombre.value,
      correo: correo.value,
      password: password.value,
    });
    ok.value = 'Cuenta creada correctamente. Ya podés iniciar sesión.';
    setTimeout(() => router.push('/portal/login'), 1500);
  } catch (err) {
    error.value = err.response?.data?.error || 'Error al crear la cuenta.';
  } finally {
    cargando.value = false;
  }
}
</script>

<template>
  <div class="container-narrow">
    <div class="card">
      <h1 class="title">Crear cuenta</h1>
      <p class="sub">Registrate para dar seguimiento a tus reportes.</p>

      <div v-if="error" class="alert error">{{ error }}</div>
      <div v-if="ok" class="alert ok">{{ ok }}</div>

      <label>Nombre completo</label>
      <input v-model="nombre" type="text" placeholder="Tu nombre" />

      <label>Correo electrónico</label>
      <input v-model="correo" type="email" placeholder="correo@ejemplo.com" />

      <label>Contraseña</label>
      <input v-model="password" type="password" placeholder="Mínimo 6 caracteres" />

      <label>Confirmar contraseña</label>
      <input v-model="password2" type="password" placeholder="Repetí la contraseña" />

      <button class="btn block" style="margin-top:20px" :disabled="cargando" @click="registrar">
        {{ cargando ? 'Creando...' : 'Crear cuenta' }}
      </button>

      <div style="margin-top:16px; font-size:13px; text-align:center;">
        ¿Ya tenés cuenta? <router-link to="/portal/login">Iniciá sesión</router-link>
      </div>
    </div>
  </div>
</template>
