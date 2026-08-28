import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // Redirige las llamadas /api al backend en el puerto 3000 durante el desarrollo.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
