/**
 * Kuro Studio - Storage Service
 * Mengelola persistensi data terisolasi per-perangkat (Device Isolation) untuk
 * Pengaturan (Settings), Galeri Hasil Karya (Gallery), dan Riwayat Penggunaan (History).
 * Menjamin tidak ada tabrakan data antar-perangkat yang berbeda.
 */

const SETTINGS_KEY = 'kuro_app_settings';

// Menghasilkan ID unik permanen khusus untuk perangkat/browser ini
export function getDeviceId() {
  if (typeof window === 'undefined') return 'device_default';
  let id = localStorage.getItem('kuro_device_client_id');
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    localStorage.setItem('kuro_device_client_id', id);
  }
  return id;
}

function getDeviceSettingsKey() {
  return 'kuro_settings_' + getDeviceId();
}

function getDeviceGalleryKey() {
  return 'kuro_gallery_' + getDeviceId();
}

function getDeviceHistoryKey() {
  return 'kuro_history_' + getDeviceId();
}

function getDeviceUserNameKey() {
  return 'kuro_user_name_' + getDeviceId();
}

export function getDeviceUserName() {
  if (typeof window === 'undefined') return '';
  const key = getDeviceUserNameKey();
  return localStorage.getItem(key) || localStorage.getItem('kuro_device_user_name') || '';
}

export function setDeviceUserName(name) {
  if (typeof window === 'undefined') return;
  const key = getDeviceUserNameKey();
  localStorage.setItem(key, name);
  localStorage.setItem('kuro_device_user_name', name);
}

// Pengaturan default aplikasi
export const DEFAULT_SETTINGS = {
  // A. General
  language: 'id', // 'id' | 'en'
  inputAutomation: true,
  appSecurity: false,

  // B. Theme & Tampilan
  fontFamily: 'Inter', // 'Inter' | 'Outfit' | 'JetBrains Mono' | 'Plus Jakarta Sans' | 'Space Grotesk'
  textSize: 'normal', // 'small' | 'normal' | 'large'
  animationSpeed: 'normal', // 'fast' | 'normal' | 'relaxed'
  cornerStyle: 'rounded', // 'rounded' | 'sharp' | 'soft'
  darkMode: false,
  compactMode: false,
  showGallery: true,
  showHistory: true,
  hideAnimations: false,

  // Kustomisasi Neobrutalist Baru
  borderThickness: 'normal', // 'thin' (1px) | 'normal' (2px) | 'heavy' (4px)
  shadowOffset: 'hard', // 'flat' (none) | 'hard' (4px 4px) | 'deep' (8px 8px)
  backgroundFx: 'sakura', // 'sakura' | 'grid' | 'off'
  accentColor: 'monochrome' // 'monochrome' | 'yellow' | 'pink' | 'mint'
};

// Inisialisasi awal galeri dan riwayat: Kosong secara default agar perangkat baru bersih.
// Item hanya akan terisi saat pengguna benar-benar menghasilkan karya dari fitur Kuro Studio.
const SEED_GALLERY_ITEMS = [];
const SEED_HISTORY_ITEMS = [];

// --- PENGATURAN (DEVICE-ISOLATED SETTINGS) ---
export function getSettings() {
  try {
    const key = getDeviceSettingsKey();
    const raw = localStorage.getItem(key) || localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(newSettings) {
  try {
    const key = getDeviceSettingsKey();
    const updated = { ...getSettings(), ...newSettings };
    localStorage.setItem(key, JSON.stringify(updated));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return newSettings;
  }
}

export function resetDeviceSettings() {
  try {
    const key = getDeviceSettingsKey();
    localStorage.removeItem(key);
    localStorage.removeItem(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

// --- GALERI HASIL (DEVICE-ISOLATED) ---
export function getGalleryItems() {
  try {
    const key = getDeviceGalleryKey();
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    
    // Bersihkan data dummy warisan (gal-seed-*) jika sebelumnya sempat tersimpan
    const cleaned = parsed.filter(item => !String(item.id).startsWith('gal-seed-'));
    if (cleaned.length !== parsed.length) {
      localStorage.setItem(key, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return [];
  }
}

export function addGalleryItem(item) {
  try {
    const key = getDeviceGalleryKey();
    const current = getGalleryItems();
    
    // Cegah duplikasi berkas yang sama persis
    const isDuplicate = current.some(existing => 
      existing.title === item.title && existing.filename === item.filename
    );
    if (isDuplicate) {
      return current;
    }

    const newItem = {
      id: 'gal-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      deviceId: getDeviceId(),
      createdAt: new Date().toISOString(),
      ...item
    };
    const updated = [newItem, ...current];
    localStorage.setItem(key, JSON.stringify(updated));

    // Picu pembaruan instan antar-komponen di browser
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kuro_gallery_updated'));
    }

    return updated;
  } catch {
    return [];
  }
}

export function removeGalleryItem(id) {
  try {
    const key = getDeviceGalleryKey();
    const current = getGalleryItems();
    const updated = current.filter(item => item.id !== id);
    localStorage.setItem(key, JSON.stringify(updated));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kuro_gallery_updated'));
    }

    return updated;
  } catch {
    return [];
  }
}

// --- RIWAYAT PENGGUNAAN (DEVICE-ISOLATED) ---
export function getHistoryItems() {
  try {
    const key = getDeviceHistoryKey();
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Bersihkan riwayat dummy warisan (hist-seed-*) jika sebelumnya ada
    const cleaned = parsed.filter(item => !String(item.id).startsWith('hist-seed-'));
    if (cleaned.length !== parsed.length) {
      localStorage.setItem(key, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return [];
  }
}

export function logHistoryItem(entry) {
  try {
    const key = getDeviceHistoryKey();
    const current = getHistoryItems();
    const newEntry = {
      id: 'hist-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      deviceId: getDeviceId(),
      timestamp: new Date().toISOString(),
      status: 'success',
      ...entry
    };
    // Batasi hingga 50 riwayat terakhir
    const updated = [newEntry, ...current].slice(0, 50);
    localStorage.setItem(key, JSON.stringify(updated));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kuro_history_updated'));
    }

    return updated;
  } catch {
    return [];
  }
}

export function clearHistory() {
  try {
    const key = getDeviceHistoryKey();
    localStorage.removeItem(key);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kuro_history_updated'));
    }
    return [];
  } catch {
    return [];
  }
}

export function clearGallery() {
  try {
    const key = getDeviceGalleryKey();
    localStorage.removeItem(key);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kuro_gallery_updated'));
    }
    return [];
  } catch {
    return [];
  }
}

// ==========================================
// MANAJEMEN STATUS KUNCI FITUR (LOCK & UNLOCK ADMIN DENGAN MULTI-DEVICE SYNC)
// ==========================================
const LOCKED_TOOLS_KEY = 'kuro_locked_tools';

export function getLockedTools() {
  try {
    const raw = localStorage.getItem(LOCKED_TOOLS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setLockedTools(lockedList) {
  try {
    localStorage.setItem(LOCKED_TOOLS_KEY, JSON.stringify(lockedList));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kuro_locked_tools_updated', { detail: lockedList }));
    }
  } catch {}
}

export function isToolLocked(toolId) {
  try {
    const list = getLockedTools();
    return list.includes(toolId);
  } catch {
    return false;
  }
}

// Fetch dan sinkronisasi status kunci langsung dari server
export async function syncLockedToolsFromServer() {
  try {
    const res = await fetch('/api/locked-tools', {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && Array.isArray(data.lockedTools)) {
        const current = getLockedTools();
        if (JSON.stringify(current) !== JSON.stringify(data.lockedTools)) {
          setLockedTools(data.lockedTools);
        }
        return data.lockedTools;
      }
    }
  } catch {}
  return getLockedTools();
}

export async function toggleToolLock(toolId) {
  try {
    const current = getLockedTools();
    const isLocked = current.includes(toolId);
    const updated = isLocked ? current.filter(id => id !== toolId) : [...current, toolId];
    
    // Simpan lokal seketika (optimistic UI)
    setLockedTools(updated);

    // Kirim pembaruan ke server agar langsung menyinkron ke seluruh perangkat member
    try {
      await fetch('/api/locked-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId, action: isLocked ? 'unlock' : 'lock', lockedTools: updated })
      });
    } catch {}

    return !isLocked;
  } catch {
    return false;
  }
}

// Inisialisasi auto-sync berkala (setiap 4 detik dan saat tab aktif)
if (typeof window !== 'undefined') {
  syncLockedToolsFromServer();
  setInterval(syncLockedToolsFromServer, 4000);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncLockedToolsFromServer();
    }
  });
}

