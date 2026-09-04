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
      <h1 class="title"><i class="bx bx-user-plus"></i> Crear cuenta</h1>
      <p class="sub">Registrate para dar seguimiento a tus reportes.</p>

      <div v-if="error" class="alert error"><i class="bx bx-error-circle"></i> {{ error }}</div>
      <div v-if="ok" class="alert ok"><i class="bx bx-check-circle"></i> {{ ok }}</div>

      <label>Nombre completo</label>
      <input v-model="nombre" type="text" placeholder="Tu nombre" />

      <label>Correo electrónico</label>
      <input v-model="correo" type="email" placeholder="correo@ejemplo.com" />

      <label>Contraseña</label>
      <input v-model="password" type="password" placeholder="Mínimo 6 caracteres" />

      <label>Confirmar contraseña</label>
      <input v-model="password2" type="password" placeholder="Repetí la contraseña" />

      <button class="btn block" style="margin-top:20px" :disabled="cargando" @click="registrar">
        <i class="bx bx-user-plus"></i> {{ cargando ? 'Creando...' : 'Crear cuenta' }}
      </button>

      <div class="links-footer">
        ¿Ya tenés cuenta? <router-link to="/portal/login">Iniciá sesión</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title { display: flex; align-items: center; gap: 10px; }
.links-footer { margin-top: 18px; font-size: 13px; text-align: center; }
</style>
