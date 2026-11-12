#!/usr/bin/env node

import { spawn, execSync } from 'child_process';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Baca versi lokal dari package.json
let currentVersion = '1.0.0';
try {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    currentVersion = pkg.version || '1.0.0';
  }
} catch {}

const CLOUD_URL = 'https://alltoolskuro.vercel.app';
const FRONTEND_PORT = 5173;
const BACKEND_PORT = 5001;
const LOCAL_URL = `http://localhost:${FRONTEND_PORT}`;
const REMOTE_PKG_URL = 'https://raw.githubusercontent.com/itsvin-debug/AllToolsKuro/main/package.json';

// Banner ASCII Kuro Studio
const BANNER = `
==================================================
  _  ___   _ ____   ____     ____ _____ _   _ ____ ___ ___  
 | |/ / | | |  _ \\ / __ \\   / ___|_   _| | | |  _ \\_ _/ _ \\ 
 | ' /| | | | |_) | |  | |  \\___ \\ | | | | | | | | | | | | |
 | . \\| |_| |  _ <| |__| |   ___) || | | |_| | |_| | | |_| |
 |_|\\_\\\\___/|_| \\_\\\\____/   |____/ |_|  \\___/|____/___\\___/ 
                                                            
               ALLTOOLS KURO UTILITY SUITE
==================================================
`;

// Fungsi pembuka URL di browser default sesuai sistem operasi
function openBrowser(targetUrl) {
  const platform = process.platform;
  let command = '';
  let args = [];

  if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', targetUrl];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [targetUrl];
  } else {
    command = 'xdg-open';
    args = [targetUrl];
  }

  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.unref();
  } catch {
    console.log(`Silakan buka tautan berikut di browser Anda: ${targetUrl}`);
  }
}

// Pemeriksaan ketersediaan service lokal secara aktif
function checkUrlActive(url, timeoutMs = 1200) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const req = http.request({
        hostname: parsed.hostname === 'localhost' ? '127.0.0.1' : parsed.hostname,
        port: parsed.port,
        path: '/',
        method: 'GET',
        timeout: timeoutMs
      }, (res) => {
        resolve(true);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    } catch {
      resolve(false);
    }
  });
}

// Polling hingga service siap melayani koneksi
async function waitForLocalServer(url, maxAttempts = 15, delayMs = 600) {
  for (let i = 0; i < maxAttempts; i++) {
    const isUp = await checkUrlActive(url);
    if (isUp) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

// Pemeriksaan ketersediaan port jaringan lokal
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') resolve(true);
      else resolve(false);
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '127.0.0.1');
  });
}

// Pengecekan versi remote secara asinkron dengan batas waktu ketat (offline-safe)
function checkRemoteVersion() {
  return new Promise((resolve) => {
    const req = https.get(REMOTE_PKG_URL, { timeout: 3500 }, (res) => {
      if (res.statusCode !== 200) return resolve(null);
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.version || null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

// Pembaruan mandiri CLI di background
function runSelfUpdate() {
  try {
    console.log('\nPembaruan baru tersedia! Memperbarui Kuro Studio secara otomatis...');
    execSync('npm install -g github:itsvin-debug/AllToolsKuro', { stdio: 'inherit' });
    console.log('Pembaruan selesai.');
  } catch {
    // Lewati jika izin npm terbatas tanpa menghentikan peluncuran
  }
}

// Validasi keberadaan modul dependensi lokal
function verifyLocalDependencies() {
  const rootModules = fs.existsSync(path.join(ROOT_DIR, 'node_modules'));
  const frontendModules = fs.existsSync(path.join(ROOT_DIR, 'frontend', 'node_modules'));
  const backendModules = fs.existsSync(path.join(ROOT_DIR, 'backend', 'node_modules'));
  return rootModules && frontendModules && backendModules;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(BANNER);
    console.log(`Penggunaan:
  opkuro              Jalankan instance lokal atau buka web Kuro Studio
  opkuro --cloud      Buka langsung versi cloud (${CLOUD_URL})
  opkuro --version    Tampilkan versi terpasang
  opkuro --help       Tampilkan bantuan ini
`);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`opkuro v${currentVersion}`);
    process.exit(0);
  }

  console.log(BANNER);

  // 1. Pengecekan versi terbaru di latar belakang
  const remoteVer = await checkRemoteVersion();
  if (remoteVer && remoteVer !== currentVersion) {
    runSelfUpdate();
  }

  // 2. Mode Cloud langsung jika diminta
  if (args.includes('--cloud')) {
    console.log(`Membuka Kuro Studio Cloud di browser (${CLOUD_URL})...`);
    openBrowser(CLOUD_URL);
    return;
  }

  // 3. Mode Lokal (Default)
  const isFrontendActive = await isPortInUse(FRONTEND_PORT);
  if (isFrontendActive) {
    console.log(`Service lokal terdeteksi aktif pada port ${FRONTEND_PORT}.`);
    console.log(`Membuka ${LOCAL_URL}...`);
    openBrowser(LOCAL_URL);
    return;
  }

  // Periksa apakah berjalan di repositori kode lokal
  const isWorkspace = fs.existsSync(path.join(ROOT_DIR, 'frontend', 'vite.config.js'));
  if (isWorkspace) {
    const hasModules = verifyLocalDependencies();
    if (!hasModules) {
      console.log('Dependensi subfolder belum terpasang lengkap. Memasang modul dependensi...');
      try {
        execSync('npm run install:all', { cwd: ROOT_DIR, stdio: 'inherit' });
      } catch {
        console.log(`Pemasangan otomatis gagal. Mengalihkan ke versi cloud (${CLOUD_URL})...`);
        openBrowser(CLOUD_URL);
        return;
      }
    }

    console.log(`Menjalankan service lokal Kuro Studio pada ${LOCAL_URL}...`);
    const devProcess = spawn('npm', ['run', 'dev'], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: true
    });

    devProcess.on('error', () => {
      console.log(`Gagal menyalakan service lokal. Mengalihkan ke versi cloud (${CLOUD_URL})...`);
      openBrowser(CLOUD_URL);
    });

    devProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.log(`Proses dev server berhenti (kode ${code}). Mengalihkan ke versi cloud...`);
        openBrowser(CLOUD_URL);
      }
    });

    // Polling kesiapan server sebelum membuka browser secara presisi
    waitForLocalServer(LOCAL_URL, 15, 600).then((isReady) => {
      if (isReady) {
        console.log(`Service lokal siap. Membuka ${LOCAL_URL}...`);
        openBrowser(LOCAL_URL);
      } else {
        console.log(`Service lokal membutuhkan waktu lebih lama. Membuka ${LOCAL_URL}...`);
        openBrowser(LOCAL_URL);
      }
    });

    // Tangani sinyal keluar terminal dengan rapi
    process.on('SIGINT', () => {
      devProcess.kill();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      devProcess.kill();
      process.exit(0);
    });

  } else {
    // Jika CLI dipanggil dari instalasi global mandiri tanpa folder repo
    console.log(`Membuka Kuro Studio di browser (${CLOUD_URL})...`);
    openBrowser(CLOUD_URL);
  }
}

main().catch(() => {
  openBrowser(CLOUD_URL);
});
