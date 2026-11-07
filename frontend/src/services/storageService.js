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
    if (typeof window.crypto !== 'undefined' && typeof window.crypto.randomUUID === 'function') {
      id = 'dev_' + window.crypto.randomUUID();
    } else {
      id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    }
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

/**
 * Validasi ketat nama panggilan pengguna
 * Aturan:
 * - Hanya 1 kata pendek (tanpa spasi)
 * - 2 - 12 karakter huruf alfabet murni (tanpa angka/simbol)
 * - Dilarang keras kata toxic, kelamin, makian, rasisme, dan nama binatang
 */
export function validateNickname(rawName) {
  if (!rawName || typeof rawName !== 'string') {
    return { isValid: false, error: 'Silakan masukkan nama panggilan Anda terlebih dahulu.' };
  }

  const trimmed = rawName.trim();

  if (!trimmed) {
    return { isValid: false, error: 'Nama panggilan tidak boleh kosong.' };
  }

  // Dilarang mengandung spasi (hanya 1 kata)
  if (/\s/.test(trimmed)) {
    return { isValid: false, error: 'Hanya boleh 1 kata nama panggilan pendek (tanpa spasi).' };
  }

  // Dilarang angka
  if (/\d/.test(trimmed)) {
    return { isValid: false, error: 'Nama panggilan dilarang mengandung angka.' };
  }

  // Dilarang simbol / karakter khusus (hanya huruf alfabet a-z / A-Z)
  if (!/^[a-zA-Z]+$/.test(trimmed)) {
    return { isValid: false, error: 'Nama panggilan hanya boleh berisi huruf alfabet.' };
  }

  // Batas panjang 2 - 12 karakter
  if (trimmed.length < 2) {
    return { isValid: false, error: 'Nama panggilan terlalu pendek (minimal 2 huruf).' };
  }
  if (trimmed.length > 12) {
    return { isValid: false, error: 'Nama panggilan terlalu panjang (maksimal 12 huruf).' };
  }

  // Filter nama binatang
  const animalPattern = /\b(anjing|asu|asw|babi|monyet|kunyuk|kampret|kucing|tikus|ular|celeng|buaya|bebek|ayam|kuda|sapi|kambing|codot|buntal)\b/i;
  if (animalPattern.test(trimmed)) {
    return { isValid: false, error: 'Dilarang menggunakan nama binatang atau sebutan tidak wajar.' };
  }

  // Filter kata toxic, kelamin, rasisme, makian, dan singkatan slang kotor
  const toxicPattern = /\b(kontol|kontl|kntl|memek|mmk|jembut|peler|pepek|itil|pantek|ngentot|ngntt|ngentd|bangsat|bgst|bngst|bajingan|goblok|gblk|tolol|bego|idiot|bodoh|bodo|pekok|tai|taik|bokep|porno|sange|lonte|perek|jablay|bencong|banci|fuck|shit|bitch|asshole|bastard|dick|pussy|cunt|nigga|nigger|negro|chink|spic|kike|faggot|retard|anj|anjr|anjir|kelamin|titit|tetek|toket|penis|vagina)\b/i;
  if (toxicPattern.test(trimmed)) {
    return { isValid: false, error: 'Nama mengandung kata tidak pantas atau dilarang. Harap gunakan nama yang sopan.' };
  }

  // Format huruf kapital di awal kata (Title Case)
  const formatted = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  return { isValid: true, sanitized: formatted };
}

function getDeviceAngerKey() {
  return 'kuro_anger_state_' + getDeviceId();
}

/**
 * Status sistem ngambek KuroBot (3-Strike System & 30 Menit Cooldown)
 */
export function getDeviceAngerState() {
  if (typeof window === 'undefined') {
    return { strikes: 0, angryUntil: 0, isAngry: false, remainingMs: 0 };
  }

  try {
    const raw = localStorage.getItem(getDeviceAngerKey());
    if (!raw) return { strikes: 0, angryUntil: 0, isAngry: false, remainingMs: 0 };

    const parsed = JSON.parse(raw);
    const strikes = Number(parsed.strikes) || 0;
    const angryUntil = Number(parsed.angryUntil) || 0;
    const now = Date.now();

    if (angryUntil > now) {
      return {
        strikes,
        angryUntil,
        isAngry: true,
        remainingMs: angryUntil - now
      };
    }

    // Jika waktu ngambek sudah habis, reset status kembali normal
    if (angryUntil > 0 && angryUntil <= now) {
      resetDeviceAngerState();
      return { strikes: 0, angryUntil: 0, isAngry: false, remainingMs: 0 };
    }

    return { strikes, angryUntil: 0, isAngry: false, remainingMs: 0 };
  } catch {
    return { strikes: 0, angryUntil: 0, isAngry: false, remainingMs: 0 };
  }
}

/**
 * Mencatat pelanggaran kata kasar / makian per perangkat
 * Strike 1 & 2: Peringatan
 * Strike 3: Ngambek total selama 30 menit
 */
export function recordDeviceStrike() {
  if (typeof window === 'undefined') return { strikes: 1, isAngry: false, angryUntil: 0 };

  const current = getDeviceAngerState();
  const nextStrikes = Math.min((current.strikes || 0) + 1, 3);
  let angryUntil = current.angryUntil || 0;

  // Pelanggaran ke-3 memicu ngambek 30 menit
  if (nextStrikes >= 3) {
    angryUntil = Date.now() + 30 * 60 * 1000;
  }

  const payload = {
    strikes: nextStrikes,
    angryUntil,
    lastViolationTime: Date.now()
  };

  try {
    localStorage.setItem(getDeviceAngerKey(), JSON.stringify(payload));
  } catch (e) {
    console.warn('[Storage] Gagal menyimpan status ngambek:', e);
  }

  return {
    strikes: nextStrikes,
    isAngry: nextStrikes >= 3,
    angryUntil
  };
}

export function resetDeviceAngerState() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getDeviceAngerKey());
  } catch {}
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
const LOCKED_TOOLS_META_KEY = 'kuro_locked_tools_meta';

export function getLockedToolsMeta() {
  try {
    const raw = localStorage.getItem(LOCKED_TOOLS_META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          lockedTools: Array.isArray(parsed.lockedTools) ? parsed.lockedTools : [],
          updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0
        };
      }
    }
  } catch {}
  return { lockedTools: getLockedTools(), updatedAt: 0 };
}

export function getLockedTools() {
  try {
    const raw = localStorage.getItem(LOCKED_TOOLS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setLockedTools(lockedList, updatedAt = Date.now()) {
  try {
    const safeList = Array.isArray(lockedList) ? lockedList : [];
    localStorage.setItem(LOCKED_TOOLS_KEY, JSON.stringify(safeList));
    localStorage.setItem(LOCKED_TOOLS_META_KEY, JSON.stringify({
      lockedTools: safeList,
      updatedAt
    }));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kuro_locked_tools_updated', { 
        detail: { lockedTools: safeList, updatedAt } 
      }));
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
// Mencegah status kunci terhapus saat server dingin/restart
export async function syncLockedToolsFromServer() {
  try {
    const res = await fetch('/api/locked-tools', {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        const localMeta = getLockedToolsMeta();
        const serverUpdated = typeof data.updatedAt === 'number' ? data.updatedAt : 0;
        const localUpdated = localMeta.updatedAt || 0;
        const currentLocal = getLockedTools();

        // Server dingin / baru menyala ulang tanpa data (serverUpdated === 0),
        // sedangkan perangkat memiliki kunci tersimpan:
        // jangan hapus data lokal, melainkan re-sinkronkan ke server.
        if (serverUpdated === 0 && localUpdated > 0 && currentLocal.length > 0) {
          try {
            await fetch('/api/locked-tools', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lockedTools: currentLocal,
                updatedAt: localUpdated,
                isRehydrate: true
              })
            });
          } catch {}
          return currentLocal;
        }

        // Jika server memiliki timestamp lebih baru atau valid
        if (serverUpdated >= localUpdated && Array.isArray(data.lockedTools)) {
          if (JSON.stringify(currentLocal) !== JSON.stringify(data.lockedTools)) {
            setLockedTools(data.lockedTools, serverUpdated);
          }
          return data.lockedTools;
        }

        // Jika lokal lebih baru daripada server, perbarui server
        if (localUpdated > serverUpdated && currentLocal.length > 0) {
          try {
            await fetch('/api/locked-tools', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lockedTools: currentLocal,
                updatedAt: localUpdated
              })
            });
          } catch {}
          return currentLocal;
        }

        return Array.isArray(data.lockedTools) ? data.lockedTools : currentLocal;
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
    const timestamp = Date.now();
    
    // Simpan lokal seketika dengan timestamp baru
    setLockedTools(updated, timestamp);

    // Kirim pembaruan ke server agar langsung menyinkron ke seluruh pengguna
    try {
      await fetch('/api/locked-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          toolId, 
          action: isLocked ? 'unlock' : 'lock', 
          lockedTools: updated,
          updatedAt: timestamp 
        })
      });
    } catch {}

    return !isLocked;
  } catch {
    return false;
  }
}

// --- MANAJEMEN AUTENTIKASI ADMIN ---
export function isAdminAuthenticated() {
  if (typeof window === 'undefined') return false;
  return (
    localStorage.getItem('kuro_admin_auth') === 'true' ||
    localStorage.getItem('kaze_admin_auth') === 'true' ||
    localStorage.getItem('kuro_user_role') === 'Admin'
  );
}

export function setAdminAuth(isAuth) {
  if (typeof window === 'undefined') return;
  const active = Boolean(isAuth);
  if (active) {
    localStorage.setItem('kuro_user_role', 'Admin');
    localStorage.setItem('kuro_admin_auth', 'true');
  } else {
    localStorage.setItem('kuro_user_role', 'Member');
    localStorage.removeItem('kuro_admin_auth');
    localStorage.removeItem('kaze_admin_auth');
  }

  // Siarkan event untuk memperbarui UI seketika tanpa perlu refresh halaman
  window.dispatchEvent(new CustomEvent('kuro_admin_auth_updated', { 
    detail: { isAdmin: active } 
  }));
  window.dispatchEvent(new Event('storage'));
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

