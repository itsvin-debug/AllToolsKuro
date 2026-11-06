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
const LOCAL_PORT = 3000;
const LOCAL_URL = `http://localhost:${LOCAL_PORT}`;
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

// Pemeriksaan port lokal
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
    server.listen(port);
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

// Logika pembaruan mandiri di background
function runSelfUpdate() {
  try {
    console.log('\nPembaruan baru tersedia! Memperbarui Kuro Studio secara otomatis...');
    execSync('npm install -g github:itsvin-debug/AllToolsKuro', { stdio: 'inherit' });
    console.log('Pembaruan selesai.');
  } catch {
    // Lewati jika izin npm terbatas tanpa menghentikan peluncuran aplikasi
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(BANNER);
    console.log(`Penggunaan:
  opkuro              Jalankan instance lokal atau buka web Kuro Studio
  opkuro --cloud      Buka langsung versi cloud (https://alltoolskuro.vercel.app)
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

  // 1. Pengecekan pembaruan otomatis (Background Version Check)
  const remoteVer = await checkRemoteVersion();
  if (remoteVer && remoteVer !== currentVersion) {
    runSelfUpdate();
  }

  // 2. Mode Cloud
  if (args.includes('--cloud')) {
    console.log(`Membuka Kuro Studio Cloud di browser (${CLOUD_URL})...`);
    openBrowser(CLOUD_URL);
    return;
  }

  // 3. Mode Lokal (Default)
  const isRunning = await isPortInUse(LOCAL_PORT);
  if (isRunning) {
    console.log(`Service lokal terdeteksi aktif pada port ${LOCAL_PORT}.`);
    console.log(`Membuka ${LOCAL_URL}...`);
    openBrowser(LOCAL_URL);
  } else {
    // Jika repo berada di lingkungan kode lokal, coba nyalakan dev server
    const hasPackageJson = fs.existsSync(path.join(ROOT_DIR, 'package.json'));
    if (hasPackageJson) {
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

      // Beri jeda 2.5 detik agar Vite siap sebelum membuka browser
      setTimeout(() => {
        openBrowser(LOCAL_URL);
      }, 2500);
    } else {
      // Jika diinstall global tanpa clone direktori lengkap, langsung buka cloud instance
      console.log(`Membuka Kuro Studio di browser (${CLOUD_URL})...`);
      openBrowser(CLOUD_URL);
    }
  }
}

main().catch(() => {
  openBrowser(CLOUD_URL);
});
