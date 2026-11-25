const path = require('path');
const fs = require('fs');
const pino = require('pino');
const baileysModule = require('@whiskeysockets/baileys');

const { fetchLatestBaileysVersion } = baileysModule;

const WA_BACKEND_ROOT = path.resolve(__dirname, '../..');
const PORT = process.env.PORT || 4000;
const MAX_ACTIVE_SESSIONS = 10;
const IDLE_TIMEOUT_MS = 45 * 60 * 1000;
const UNLINKED_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;
const AUTH_SESSIONS_ROOT = path.join(WA_BACKEND_ROOT, 'auth_sessions');

const pinoSilent = pino({ level: 'silent' });

const WA_VERSION_CACHE_TTL = 6 * 60 * 60 * 1000;
const FALLBACK_WA_VERSION = [2, 3000, 1017531287];
let cachedWaVersion = null;
let cachedWaVersionTime = 0;

function ensureAuthRootDir() {
  if (!fs.existsSync(AUTH_SESSIONS_ROOT)) {
    try {
      fs.mkdirSync(AUTH_SESSIONS_ROOT, { recursive: true });
    } catch (_) {}
  }
}

async function getWaVersion() {
  if (cachedWaVersion && Date.now() - cachedWaVersionTime < WA_VERSION_CACHE_TTL) {
    return cachedWaVersion;
  }
  try {
    const fetchPromise = fetchLatestBaileysVersion();
    const fetched = await Promise.race([
      fetchPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('fetchLatestBaileysVersion timeout (3s)')), 3000)
      )
    ]);
    if (fetched?.version && Array.isArray(fetched.version)) {
      cachedWaVersion = fetched.version;
      cachedWaVersionTime = Date.now();
      return cachedWaVersion;
    }
  } catch (err) {
    console.warn(`[WA-VAULT] fetchLatestBaileysVersion gagal/timeout (${err.message}). Menggunakan versi fallback.`);
  }
  if (cachedWaVersion) return cachedWaVersion;
  return FALLBACK_WA_VERSION;
}

module.exports = {
  WA_BACKEND_ROOT,
  PORT,
  MAX_ACTIVE_SESSIONS,
  IDLE_TIMEOUT_MS,
  UNLINKED_IDLE_TIMEOUT_MS,
  SESSION_ID_REGEX,
  AUTH_SESSIONS_ROOT,
  pinoSilent,
  ensureAuthRootDir,
  getWaVersion
};
