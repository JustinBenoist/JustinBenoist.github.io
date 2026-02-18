// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        publications: resolve(__dirname, 'publications.html'),
        nppm: resolve(__dirname, 'publications/nppm.html'),
      }
    }
  }
});