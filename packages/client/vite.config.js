import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  publicDir: resolve(__dirname, '../../game-assets'),
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared/src'),
      '@assets': resolve(__dirname, '../../game-assets'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Route everything through the LB (port 3000). The LB weight-random
      // routes WS upgrades to pool A (:3001) or pool B (:3002) and round-
      // robins HTTP calls between them.
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
