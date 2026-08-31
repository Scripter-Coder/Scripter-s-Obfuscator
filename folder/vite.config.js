import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
    copyPublicDir: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        raw: 'raw.html',
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
