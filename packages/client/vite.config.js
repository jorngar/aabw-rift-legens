import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
      // Route everything through the LB (port 3000) by default. The LB
      // weight-random routes WS upgrades to pool A (:3001) or pool B (:3002)
      // and round-robins HTTP calls between them. `pnpm dev:single` sets
      // API_PROXY=http://localhost:3001 to talk to one server directly —
      // without the override, running client + single server (the old
      // dev:all) leaves :3000 unbound and every request ECONNREFUSEs.
      '/api': process.env.API_PROXY || 'http://localhost:3000',
      '/ws': {
        target: (process.env.API_PROXY || 'http://localhost:3000').replace(/^http/, 'ws'),
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Multi-page build: both the game entry AND the A/B dashboard get
    // emitted with their own index.html + module chunks. Without this
    // Vite only builds the root index.html and the dashboard 404s in prod.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        abDashboard: resolve(__dirname, 'ab-dashboard/index.html'),
      },
    },
  },
});
