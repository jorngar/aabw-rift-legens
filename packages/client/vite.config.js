import { defineConfig } from 'vite';

// Rewrite `/ab-dashboard` (no trailing slash, no `.html`) to the folder's
// index. Vite would otherwise 301-redirect to `/ab-dashboard/`.
function cleanUrlDashboard() {
  return {
    name: 'ab-dashboard-clean-url',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/ab-dashboard') req.url = '/ab-dashboard/index.html';
        next();
      });
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [cleanUrlDashboard()],
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
