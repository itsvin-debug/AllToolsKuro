import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

// Vite middleware to handle /api/locked-tools for multi-device live sync
let devLockedTools = []
const devLocksFile = path.resolve(__dirname, '../backend/uploads/locked_tools.json')
try {
  if (fs.existsSync(devLocksFile)) {
    devLockedTools = JSON.parse(fs.readFileSync(devLocksFile, 'utf8'))
  }
} catch {}

function lockedToolsDevMiddleware() {
  return {
    name: 'locked-tools-dev-middleware',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && (req.url === '/api/locked-tools' || req.url.startsWith('/api/locked-tools?'))) {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store, no-cache')
          res.setHeader('Access-Control-Allow-Origin', '*')

          if (req.method === 'GET') {
            try {
              if (fs.existsSync(devLocksFile)) {
                devLockedTools = JSON.parse(fs.readFileSync(devLocksFile, 'utf8'))
              }
            } catch {}
            res.end(JSON.stringify({ success: true, lockedTools: devLockedTools }))
            return
          }

          if (req.method === 'POST') {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}')
                const { toolId, action, lockedTools } = parsed
                if (Array.isArray(lockedTools)) {
                  devLockedTools = lockedTools
                } else if (toolId) {
                  if (action === 'unlock') {
                    devLockedTools = devLockedTools.filter(id => id !== toolId)
                  } else if (action === 'lock') {
                    if (!devLockedTools.includes(toolId)) devLockedTools.push(toolId)
                  } else {
                    if (devLockedTools.includes(toolId)) {
                      devLockedTools = devLockedTools.filter(id => id !== toolId)
                    } else {
                      devLockedTools.push(toolId)
                    }
                  }
                }
                try {
                  const dir = path.dirname(devLocksFile)
                  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
                  fs.writeFileSync(devLocksFile, JSON.stringify(devLockedTools, null, 2))
                } catch {}
                res.end(JSON.stringify({ success: true, lockedTools: devLockedTools }))
              } catch (e) {
                res.statusCode = 400
                res.end(JSON.stringify({ success: false, error: e.message }))
              }
            })
            return
          }
        }
        next()
      })
    }
  }
}

function chatDevMiddleware() {
  return {
    name: 'chat-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && (req.url === '/api/chat' || req.url.startsWith('/api/chat?'))) {
          try {
            const chatModule = await import('../api/chat.js');
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                req.body = body ? JSON.parse(body) : {};
              } catch {
                req.body = {};
              }
              const mockRes = {
                setHeader: (k, v) => res.setHeader(k, v),
                status: (code) => {
                  res.statusCode = code;
                  return {
                    json: (data) => {
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify(data));
                    },
                    end: () => res.end()
                  };
                }
              };
              await chatModule.default(req, mockRes);
            });
            return;
          } catch (err) {
            console.warn('chatDevMiddleware error:', err);
          }
        }
        next();
      });
    }
  };
}

function downloadDevMiddleware() {
  return {
    name: 'download-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0];
        if (pathname === '/api/download') {
          try {
            const dlModule = await import('../api/download.js');
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try { req.body = body ? JSON.parse(body) : {}; } catch { req.body = {}; }
              const mockRes = {
                setHeader: (k, v) => res.setHeader(k, v),
                status: (code) => {
                  res.statusCode = code;
                  return {
                    json: (data) => {
                      if (!res.headersSent) res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify(data));
                    },
                    send: (data) => res.end(data),
                    end: () => res.end()
                  };
                }
              };
              await dlModule.default(req, mockRes);
            });
            return;
          } catch (err) {
            console.warn('downloadDevMiddleware error:', err);
          }
        } else if (pathname === '/api/proxy-stream') {
          try {
            const streamModule = await import('../api/proxy-stream.js');
            const parsedUrl = new URL(req.url, 'http://localhost:5173');
            req.query = Object.fromEntries(parsedUrl.searchParams.entries());
            await streamModule.default(req, res);
            return;
          } catch (err) {
            console.warn('proxyStreamDevMiddleware error:', err);
          }
        } else if (pathname === '/api/proxy-download') {
          try {
            const proxyDlModule = await import('../api/proxy-download.js');
            const parsedUrl = new URL(req.url, 'http://localhost:5173');
            req.query = Object.fromEntries(parsedUrl.searchParams.entries());
            await proxyDlModule.default(req, res);
            return;
          } catch (err) {
            console.warn('proxyDownloadDevMiddleware error:', err);
          }
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), pingDevMiddleware(), lockedToolsDevMiddleware(), chatDevMiddleware(), downloadDevMiddleware()],
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
