import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // Redirige las llamadas /api al backend en el puerto 3000 durante el desarrollo. Las pruebas
    // E2E apuntan a otro backend (el de la base de pruebas) con la variable API_URL.
    proxy: {
      '/api': process.env.API_URL || 'http://localhost:3000',
    },
  },
});
