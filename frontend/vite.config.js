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

export default defineConfig({
  plugins: [react(), pingDevMiddleware(), lockedToolsDevMiddleware()],
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
