import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
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
