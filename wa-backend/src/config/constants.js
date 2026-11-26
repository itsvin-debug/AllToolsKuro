const path = require('path');
const fs = require('fs');
const pino = require('pino');
const baileysModule = require('@whiskeysockets/baileys');

const { fetchLatestBaileysVersion, fetchLatestWaWebVersion } = baileysModule;

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const AUTH_SESSIONS_DIR = path.join(BACKEND_ROOT, 'auth_sessions');

const PORT = process.env.PORT || 4000;
const MAX_ACTIVE_SESSIONS = 10;
const IDLE_TIMEOUT_MS = 45 * 60 * 1000;
const UNLINKED_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

const pinoSilent = pino({ level: 'silent' });

const WA_VERSION_CACHE_TTL = 6 * 60 * 60 * 1000;
const FALLBACK_WA_VERSION = [2, 3000, 1043857760];
let cachedWaVersion = null;
let cachedWaVersionTime = 0;

function ensureAuthRootDir() {
  if (!fs.existsSync(AUTH_SESSIONS_DIR)) {
    try {
      fs.mkdirSync(AUTH_SESSIONS_DIR, { recursive: true });
    } catch (_) {}
  }
}

async function getWaVersion() {
  if (cachedWaVersion && Date.now() - cachedWaVersionTime < WA_VERSION_CACHE_TTL) {
    return cachedWaVersion;
  }

  // Prioritas 1: Versi WhatsApp Web langsung dari web.whatsapp.com (penting untuk Pairing Code 8-digit)
  if (typeof fetchLatestWaWebVersion === 'function') {
    try {
      const liveWa = await Promise.race([
        fetchLatestWaWebVersion({}),
        new Promise((_, reject) => setTimeout(() => reject(new Error('fetchLatestWaWebVersion timeout (5s)')), 5000))
      ]);
      if (liveWa?.version && Array.isArray(liveWa.version) && liveWa.isLatest !== false) {
        cachedWaVersion = liveWa.version;
        cachedWaVersionTime = Date.now();
        return cachedWaVersion;
      }
    } catch (err) {
      console.warn(`[WA-VAULT] fetchLatestWaWebVersion gagal/timeout (${err.message}), mencoba fetchLatestBaileysVersion...`);
    }
  }

  // Prioritas 2: Versi Baileys upstream atau fallback built-in 6.7.24
  try {
    const fetchPromise = fetchLatestBaileysVersion();
    const fetched = await Promise.race([
      fetchPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('fetchLatestBaileysVersion timeout (5s)')), 5000)
      )
    ]);
    if (fetched?.version && Array.isArray(fetched.version)) {
      cachedWaVersion = fetched.version;
      cachedWaVersionTime = Date.now();
      return cachedWaVersion;
    }
  } catch (err) {
    console.warn(`[WA-VAULT] fetchLatestBaileysVersion gagal/timeout (${err.message}). Menggunakan versi fallback terbaru.`);
  }
  if (cachedWaVersion) return cachedWaVersion;
  return FALLBACK_WA_VERSION;
}

module.exports = {
  BACKEND_ROOT,
  AUTH_SESSIONS_DIR,
  PORT,
  MAX_ACTIVE_SESSIONS,
  IDLE_TIMEOUT_MS,
  UNLINKED_IDLE_TIMEOUT_MS,
  SESSION_ID_REGEX,
  pinoSilent,
  ensureAuthRootDir,
  getWaVersion
};
