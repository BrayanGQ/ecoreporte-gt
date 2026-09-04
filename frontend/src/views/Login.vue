<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authService } from '../services/api';

const route = useRoute();
const router = useRouter();
const correo = ref('');
const password = ref('');
const error = ref('');
const cargando = ref(false);

// El mismo formulario se usa para el login ciudadano y el municipal.
const esMunicipal = computed(() => route.meta.portal === 'municipal');

async function iniciarSesion() {
  error.value = '';
  cargando.value = true;
  try {
    const { data } = await authService.login({ correo: correo.value, password: password.value });
    localStorage.setItem('token', data.token);
    localStorage.setItem('usuario', JSON.stringify(data.usuario));
    window.dispatchEvent(new Event('storage-updated'));
    // Redirige según el rol.
    if (['personal_municipal', 'administrador'].includes(data.usuario.rol)) {
      router.push('/municipal/panel');
    } else {
      router.push('/portal');
    }
  } catch (err) {
    error.value = err.response?.data?.error || 'Error al iniciar sesión.';
  } finally {
    cargando.value = false;
  }
}
</script>

<template>
  <div class="container-narrow">
    <div class="card">
      <h1 class="title">
        <i :class="esMunicipal ? 'bx bx-building' : 'bx bx-user'"></i>
        {{ esMunicipal ? 'Acceso municipal' : 'Iniciar sesión' }}
      </h1>
      <p class="sub">Ingresá tus credenciales para acceder.</p>

      <div v-if="error" class="alert error"><i class="bx bx-error-circle"></i> {{ error }}</div>

      <label>Correo electrónico</label>
      <input v-model="correo" type="email" placeholder="correo@ejemplo.com" @keyup.enter="iniciarSesion" />

      <label>Contraseña</label>
      <input v-model="password" type="password" placeholder="••••••••" @keyup.enter="iniciarSesion" />

      <button class="btn block" style="margin-top:20px" :disabled="cargando" @click="iniciarSesion">
        <i class="bx bx-log-in"></i> {{ cargando ? 'Ingresando...' : 'Ingresar' }}
      </button>

      <div class="links-footer">
        <template v-if="!esMunicipal">
          <router-link to="/portal/recuperar">¿Olvidaste tu contraseña?</router-link>
          <br /><br />
          ¿No tenés cuenta? <router-link to="/portal/registro">Registrate</router-link>
          <br /><br />
        </template>
        <router-link to="/"><i class="bx bx-arrow-back"></i> Volver al inicio</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title { display: flex; align-items: center; gap: 10px; }
.links-footer { margin-top: 18px; font-size: 13px; text-align: center; }
.links-footer a { display: inline-flex; align-items: center; gap: 4px; }
</style>
