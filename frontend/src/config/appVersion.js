// frontend/src/config/appVersion.js - Konfigurasi versi lokal aplikasi AllToolsKuro

export const LOCAL_APP_VERSION = '1.3.0';
export const LOCAL_VERSION_CODE = 3;
export const APP_PACKAGE_ID = 'com.kuro.alltools';
export const APP_DISPLAY_NAME = 'AllToolsKuro';

const INSTALLED_VERSION_KEY = 'kuro_installed_app_version';

export function getInstalledAppVersion() {
  if (typeof window === 'undefined') return LOCAL_APP_VERSION;
  try {
    return localStorage.getItem(INSTALLED_VERSION_KEY) || LOCAL_APP_VERSION;
  } catch {
    return LOCAL_APP_VERSION;
  }
}

export function setInstalledAppVersion(version) {
  if (typeof window === 'undefined' || !version) return;
  try {
    localStorage.setItem(INSTALLED_VERSION_KEY, String(version).trim());
  } catch (err) {
    console.warn('[AppVersion] Gagal menyimpan versi aplikasi:', err);
  }
}

// Fungsi pembanding nomor versi (Semantic Versioning)
export function isVersionHigher(remoteVersion, localVersion) {
  if (!remoteVersion || !localVersion) return false;
  
  const parsePart = (v) => v.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const rParts = parsePart(remoteVersion);
  const lParts = parsePart(localVersion);
  const maxLen = Math.max(rParts.length, lParts.length);

  for (let i = 0; i < maxLen; i++) {
    const r = rParts[i] || 0;
    const l = lParts[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}
