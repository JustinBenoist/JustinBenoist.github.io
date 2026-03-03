import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        google6c1aaaeed7382f6e: resolve(__dirname, 'google6c1aaaeed7382f6e.html'),
        publications: resolve(__dirname, 'publications.html'),
        nppm: resolve(__dirname, 'public/publications/nppm.html'),
      }
    }
  }
});