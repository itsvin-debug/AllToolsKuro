import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite middleware to answer /api/ping instantly without relying on proxy
function pingDevMiddleware() {
  return {
    name: 'ping-dev-middleware',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && (req.url === '/api/ping' || req.url.startsWith('/api/ping?'))) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store, no-cache');
          res.end(JSON.stringify({ ok: true, status: 'online', timestamp: Date.now() }));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), pingDevMiddleware()],
  clearScreen: false,
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            if (!res.headersSent) {
              if (req.url && req.url.startsWith('/api/ping')) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, fallback: true, timestamp: Date.now() }));
                return;
              }
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Backend offline', code: err.code }));
            }
          });
        },
      },
      '/uploads': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            if (!res.headersSent) {
              res.writeHead(404, { 'Content-Type': 'text/plain' });
              res.end('File not found or backend offline');
            }
          });
        },
      },
    },
  },
})
