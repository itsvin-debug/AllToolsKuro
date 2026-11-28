import { normalizePairingPhone } from '../../shared/utils/waPhoneUtils';

const DB_NAME = 'AllToolsKuro_WaVault';
const DB_VERSION = 5;
const DEVICE_AUTH_STORE = 'wa_device_auth';

const STORAGE_SESSION_ID = 'wa_vault_session_id';
const STORAGE_DEVICE_TOKEN = 'wa_vault_device_token';
const STORAGE_PAIRING_PHONE = 'wa_vault_pairing_phone';
const LS_LINKED_PREFIX = 'kuro_wa_linked_';
const LS_CREDS_PREFIX = 'kuro_wa_creds_';
const MAX_LS_CREDS_CHARS = 148 * 1024;
const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

export function getWaBackendUrl() {
  return import.meta.env.VITE_WA_BACKEND_URL || 'http://localhost:4000';
}

export function normalizeWaPhone(raw) {
  return normalizePairingPhone(raw);
}

function generateDeviceId() {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
  return `dev_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function generateDeviceToken() {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export function getOrCreateDeviceCredentials() {
  if (typeof window === 'undefined') {
    return { sessionId: '', deviceToken: '' };
  }
  let sessionId = localStorage.getItem(STORAGE_SESSION_ID);
  if (!sessionId || !DEVICE_ID_REGEX.test(sessionId)) {
    sessionId = generateDeviceId();
    localStorage.setItem(STORAGE_SESSION_ID, sessionId);
  }
  let deviceToken = localStorage.getItem(STORAGE_DEVICE_TOKEN);
  if (!deviceToken || deviceToken.length < 32) {
    deviceToken = generateDeviceToken();
    localStorage.setItem(STORAGE_DEVICE_TOKEN, deviceToken);
  }
  return { sessionId, deviceToken };
}

export function getSavedPairingPhone() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_PAIRING_PHONE) || '';
}

export function setSavedPairingPhone(phone) {
  if (typeof window === 'undefined') return;
  try {
    if (phone) localStorage.setItem(STORAGE_PAIRING_PHONE, phone);
  } catch {}
}

function openAuthDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB tidak tersedia.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('view_once_media')) {
        db.createObjectStore('view_once_media', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(DEVICE_AUTH_STORE)) {
        db.createObjectStore(DEVICE_AUTH_STORE, { keyPath: 'deviceId' });
      }
      if (!db.objectStoreNames.contains('wa_contacts')) {
        db.createObjectStore('wa_contacts', { keyPath: 'scope' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function hasSavedDeviceLink(deviceId) {
  if (!deviceId || typeof window === 'undefined') return false;
  try {
    return (
      localStorage.getItem(`${LS_LINKED_PREFIX}${deviceId}`) === '1' ||
      Boolean(localStorage.getItem(`${LS_CREDS_PREFIX}${deviceId}`))
    );
  } catch {
    return false;
  }
}

export async function loadDeviceAuthSnapshotLocal(deviceId) {
  if (!deviceId) return null;
  try {
    const db = await openAuthDatabase();
    if (db.objectStoreNames.contains(DEVICE_AUTH_STORE)) {
      const record = await new Promise((resolve) => {
        const tx = db.transaction(DEVICE_AUTH_STORE, 'readonly');
        const req = tx.objectStore(DEVICE_AUTH_STORE).get(String(deviceId));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (record?.snapshot?.files?.['creds.json']) {
        return record.snapshot;
      }
    }
  } catch {}

  try {
    const raw = localStorage.getItem(`${LS_CREDS_PREFIX}${deviceId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.files?.['creds.json'] ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveDeviceAuthSnapshotLocal(deviceId, deviceToken, snapshot, updatedAt = Date.now()) {
  if (!deviceId || !snapshot?.files?.['creds.json']) return false;
  try {
    localStorage.setItem(`${LS_LINKED_PREFIX}${deviceId}`, '1');
    const fullStr = JSON.stringify(snapshot);
    if (fullStr.length <= MAX_LS_CREDS_CHARS) {
      localStorage.setItem(`${LS_CREDS_PREFIX}${deviceId}`, fullStr);
    } else {
      // Tetap perbarui creds.json agar localStorage tidak menahan snapshot awal yang usang saat > 148 KB
      const compactStr = JSON.stringify({
        version: 1,
        createdAt: snapshot.createdAt || Date.now(),
        files: { 'creds.json': snapshot.files['creds.json'] }
      });
      if (compactStr.length <= MAX_LS_CREDS_CHARS) {
        localStorage.setItem(`${LS_CREDS_PREFIX}${deviceId}`, compactStr);
      }
    }
  } catch {}

  try {
    const db = await openAuthDatabase();
    if (!db.objectStoreNames.contains(DEVICE_AUTH_STORE)) return false;
    return await new Promise((resolve) => {
      const tx = db.transaction(DEVICE_AUTH_STORE, 'readwrite');
      const store = tx.objectStore(DEVICE_AUTH_STORE);
      const getReq = store.get(String(deviceId));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
      getReq.onsuccess = () => {
        const existing = getReq.result || {};
        store.put({
          deviceId: String(deviceId),
          deviceToken: String(deviceToken || existing.deviceToken || ''),
          snapshot,
          updatedAt
        });
      };
      getReq.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function clearDeviceAuthSnapshotLocal(deviceId) {
  if (!deviceId) return;
  try {
    localStorage.removeItem(`${LS_LINKED_PREFIX}${deviceId}`);
    localStorage.removeItem(`${LS_CREDS_PREFIX}${deviceId}`);
  } catch {}
  try {
    const db = await openAuthDatabase();
    if (!db.objectStoreNames.contains(DEVICE_AUTH_STORE)) return;
    await new Promise((resolve) => {
      const tx = db.transaction(DEVICE_AUTH_STORE, 'readwrite');
      const store = tx.objectStore(DEVICE_AUTH_STORE);
      const req = store.get(String(deviceId));
      req.onsuccess = () => {
        const rec = req.result;
        if (rec) {
          store.put({ ...rec, snapshot: null, updatedAt: Date.now() });
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {}
}

export function blobToBase64String(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx !== -1 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas ke base64.'));
    reader.readAsDataURL(blob);
  });
}
