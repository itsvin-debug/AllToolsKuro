// Helper IndexedDB lokal untuk menyimpan media & pesan WA Vault (View Once, Ghost Reader, Anti-Delete, Status)

const DB_NAME = 'AllToolsKuro_WaVault';
const DB_VERSION = 4;
const STORE_NAME = 'view_once_media';
const DEVICE_AUTH_STORE = 'wa_device_auth';
const CONTACTS_STORE = 'wa_contacts';

function openWaDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB tidak didukung pada browser ini.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      let store;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      } else {
        store = event.target.transaction.objectStore(STORE_NAME);
      }

      if (!store.indexNames.contains('sentAt')) {
        store.createIndex('sentAt', 'sentAt', { unique: false });
      }
      if (!store.indexNames.contains('timestamp')) {
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!store.indexNames.contains('senderNumber')) {
        store.createIndex('senderNumber', 'senderNumber', { unique: false });
      }
      if (!store.indexNames.contains('category')) {
        store.createIndex('category', 'category', { unique: false });
      }
      if (!store.indexNames.contains('isViewOnce')) {
        store.createIndex('isViewOnce', 'isViewOnce', { unique: false });
      }
      if (!store.indexNames.contains('isDeleted')) {
        store.createIndex('isDeleted', 'isDeleted', { unique: false });
      }
      if (!store.indexNames.contains('isEdited')) {
        store.createIndex('isEdited', 'isEdited', { unique: false });
      }

      if (!db.objectStoreNames.contains(DEVICE_AUTH_STORE)) {
        db.createObjectStore(DEVICE_AUTH_STORE, { keyPath: 'deviceId' });
      }
      if (!db.objectStoreNames.contains(CONTACTS_STORE)) {
        db.createObjectStore(CONTACTS_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Gagal membuka IndexedDB.'));
  });
}

// Simpan atau perbarui item ke IndexedDB dengan Smart Merge Anti-Timpa
export async function saveMediaItem(item) {
  if (!item || typeof item !== 'object') return null;
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const itemId = String(item.id || Date.now());

      const getReq = store.get(itemId);

      getReq.onsuccess = () => {
        const existing = getReq.result || null;

        // Smart Merge: Jangan timpa base64Data HD yang sudah ada jika pointer baru membawa base64 kosong
        let finalBase64 = typeof item.base64Data === 'string' && item.base64Data.length > 0
          ? item.base64Data
          : (existing?.base64Data || '');

        let finalThumbnail = typeof item.thumbnailBase64 === 'string' && item.thumbnailBase64.length > 0
          ? item.thumbnailBase64
          : (existing?.thumbnailBase64 || '');

        let needsLoad = Boolean(item.needsOnDemandLoad);
        if (finalBase64.length > 0) {
          needsLoad = false; // Sudah ter-hydrate dengan HD
        }

        const sanitizedItem = {
          ...existing,
          ...item,
          id: itemId,
          category: item.category === 'status' ? 'status' : 'chat',
          senderNumber: String(item.senderNumber || existing?.senderNumber || ''),
          senderLid: String(item.senderLid || existing?.senderLid || ''),
          senderName: String(item.senderName || existing?.senderName || ''),
          mediaType: String(item.mediaType || existing?.mediaType || 'text'),
          mimeType: String(item.mimeType || existing?.mimeType || ''),
          textContent: String(item.textContent || existing?.textContent || ''),
          caption: String(item.caption || existing?.caption || ''),
          bgColor: String(item.bgColor || existing?.bgColor || ''),
          fileName: String(item.fileName || existing?.fileName || ''),
          fileSize: Number(item.fileSize || existing?.fileSize || 0),
          durationSec: Number(item.durationSec || existing?.durationSec || 0),
          isVoiceNote: Boolean(item.isVoiceNote ?? existing?.isVoiceNote),
          isViewOnce: Boolean(item.isViewOnce ?? existing?.isViewOnce),
          isDeleted: Boolean(item.isDeleted ?? existing?.isDeleted),
          deletedAt: item.deletedAt ? Number(item.deletedAt) : (existing?.deletedAt ? Number(existing.deletedAt) : null),
          isEdited: Boolean(item.isEdited ?? existing?.isEdited),
          editedText: String(item.editedText || existing?.editedText || ''),
          editedAt: item.editedAt ? Number(item.editedAt) : (existing?.editedAt ? Number(existing.editedAt) : null),
          sentAt: Number(item.sentAt || item.timestamp || existing?.sentAt || Date.now()),
          base64Data: finalBase64,
          thumbnailBase64: finalThumbnail,
          needsOnDemandLoad: needsLoad
        };

        const putReq = store.put(sanitizedItem);
        putReq.onsuccess = () => resolve(sanitizedItem);
        putReq.onerror = (e) => {
          if (e?.target?.error?.name === 'QuotaExceededError') {
            console.warn('[IndexedDB] Kuota penyimpanan browser penuh! Hapus status lama untuk mengosongkan ruang.');
          }
          reject(putReq.error || new Error('Gagal menyimpan item ke IndexedDB.'));
        };
      };

      getReq.onerror = () => reject(getReq.error || new Error('Gagal membaca item dari IndexedDB.'));
    } catch (err) {
      reject(err);
    }
  });
}

// Perbarui sebagian field item (misal status isDeleted atau isEdited, atau saat media on-demand selesai)
export async function updateMediaItem(id, patch = {}) {
  if (!id) return null;
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(String(id));

      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) {
          resolve(null);
          return;
        }

        const updated = {
          ...existing,
          ...patch,
          id: existing.id
        };

        if (updated.base64Data && updated.base64Data.length > 0) {
          updated.needsOnDemandLoad = false;
        }

        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = (e) => {
          if (e?.target?.error?.name === 'QuotaExceededError') {
            console.warn('[IndexedDB] Kuota penyimpanan browser penuh!');
          }
          reject(putReq.error || new Error('Gagal memperbarui item IndexedDB.'));
        };
      };

      getReq.onerror = () => reject(getReq.error || new Error('Gagal membaca item dari IndexedDB.'));
    } catch (err) {
      reject(err);
    }
  });
}

// Ambil seluruh media tersimpan (diurutkan dari yang terbaru)
export async function getAllMediaItems() {
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = request.result || [];
      const normalized = items
        .filter((it) => it && it.id && it.id !== 'viewonce-pending' && it.id !== 'viewonce-blocked')
        .map((it) => ({
          ...it,
          id: String(it.id),
          category: it.category === 'status' ? 'status' : 'chat',
          isViewOnce: it.isViewOnce !== undefined ? Boolean(it.isViewOnce) : true,
          mediaType: it.mediaType || (it.base64Data?.includes('video') ? 'video' : 'image'),
          sentAt: Number(it.sentAt || it.timestamp || Date.now()),
          isDeleted: Boolean(it.isDeleted),
          isEdited: Boolean(it.isEdited),
          durationSec: Number(it.durationSec || 0),
          fileSize: Number(it.fileSize || 0),
          bgColor: String(it.bgColor || ''),
          thumbnailBase64: it.thumbnailBase64 || '',
          needsOnDemandLoad: Boolean(it.needsOnDemandLoad && !it.base64Data)
        }));

      normalized.sort((a, b) => {
        const timeA = Number(a?.sentAt || 0);
        const timeB = Number(b?.sentAt || 0);
        return timeB - timeA;
      });

      resolve(normalized);
    };
    request.onerror = () => reject(request.error || new Error('Gagal mengambil data dari IndexedDB.'));
  });
}

// Hapus satu item berdasarkan ID
export async function deleteMediaItem(id) {
  if (!id) return true;
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(String(id));

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error('Gagal menghapus item dari IndexedDB.'));
  });
}

// Hapus banyak item sekaligus berdasarkan array of IDs
export async function deleteMediaByIds(ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) return true;
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (const id of ids) {
      if (id) store.delete(String(id));
    }

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('Gagal menghapus beberapa item dari IndexedDB.'));
  });
}

// Bersihkan seluruh database di IndexedDB
export async function clearAllMediaItems() {
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error('Gagal membersihkan database IndexedDB.'));
  });
}

// Alias untuk kompatibilitas penamaan ekspor WaViewOnceView
export const deleteMediaById = deleteMediaItem;
export const clearAllMedia = clearAllMediaItems;

// Dapatkan statistik kapasitas penyimpanan IndexedDB browser pengguna
export async function getVaultStorageStats() {
  try {
    const items = await getAllMediaItems();
    let totalBytes = 0;
    let statusCount = 0;

    for (const it of items) {
      if (it.category === 'status') statusCount++;
      if (it.base64Data) totalBytes += it.base64Data.length;
      if (it.thumbnailBase64) totalBytes += it.thumbnailBase64.length;
      if (it.textContent) totalBytes += it.textContent.length * 2;
      if (it.caption) totalBytes += it.caption.length * 2;
    }

    const estimatedMB = (totalBytes / (1024 * 1024)).toFixed(2);
    return {
      totalItems: items.length,
      statusCount,
      estimatedMB
    };
  } catch (err) {
    console.error('Gagal menghitung statistik vault:', err);
    return { totalItems: 0, statusCount: 0, estimatedMB: '0.00' };
  }
}

// Bersihkan Status WA yang sudah kedaluwarsa (> 24 jam) untuk menghemat storage HP/browser
export async function pruneExpiredStatuses(maxAgeMs = 24 * 60 * 60 * 1000) {
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result || [];
        const now = Date.now();
        let deletedCount = 0;

        for (const item of items) {
          if (item.category === 'status') {
            const age = now - (Number(item.sentAt) || 0);
            if (age > maxAgeMs) {
              store.delete(item.id);
              deletedCount++;
            }
          }
        }

        tx.oncomplete = () => resolve(deletedCount);
        tx.onerror = () => reject(tx.error || new Error('Gagal memangkas status kedaluwarsa.'));
      };

      request.onerror = () => reject(request.error || new Error('Gagal membaca data IndexedDB.'));
    } catch (err) {
      reject(err);
    }
  });
}

// =========================================================================
// STORE KHUSUS: wa_device_auth (Identitas & Snapshot Auth Terikat Perangkat)
// =========================================================================

export async function getDeviceAuthRecord(deviceId) {
  if (!deviceId) return null;
  try {
    const db = await openWaDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(DEVICE_AUTH_STORE, 'readonly');
      const req = tx.objectStore(DEVICE_AUTH_STORE).get(String(deviceId));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getAnyDeviceAuthRecord() {
  try {
    const db = await openWaDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(DEVICE_AUTH_STORE, 'readonly');
      const req = tx.objectStore(DEVICE_AUTH_STORE).getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        resolve(list[0] || null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveDeviceAuthRecord({ deviceId, deviceToken, snapshot = undefined, updatedAt = Date.now() }) {
  if (!deviceId) return null;
  try {
    const db = await openWaDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DEVICE_AUTH_STORE, 'readwrite');
      const store = tx.objectStore(DEVICE_AUTH_STORE);
      const getReq = store.get(String(deviceId));
      getReq.onsuccess = () => {
        const existing = getReq.result || {};
        const record = {
          deviceId: String(deviceId),
          deviceToken: String(deviceToken || existing.deviceToken || ''),
          snapshot: snapshot !== undefined ? snapshot : (existing.snapshot || null),
          updatedAt: Number(updatedAt || Date.now())
        };
        const putReq = store.put(record);
        putReq.onsuccess = () => resolve(record);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn('Gagal menyimpan auth record ke IndexedDB:', err);
    return null;
  }
}

const LS_LINKED_PREFIX = 'kuro_wa_linked_';
const LS_CREDS_PREFIX = 'kuro_wa_creds_';
const MAX_LS_CREDS_CHARS = 148 * 1024;

export function hasSavedDeviceLink(deviceId) {
  if (!deviceId || typeof window === 'undefined') return false;
  try {
    return (
      window.localStorage.getItem(`${LS_LINKED_PREFIX}${deviceId}`) === '1' ||
      Boolean(window.localStorage.getItem(`${LS_CREDS_PREFIX}${deviceId}`))
    );
  } catch {
    return false;
  }
}

function saveSnapshotLocalFallback(deviceId, snapshot) {
  if (!deviceId || !snapshot?.files?.['creds.json'] || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${LS_LINKED_PREFIX}${deviceId}`, '1');
    const fullStr = JSON.stringify(snapshot);
    if (fullStr.length <= MAX_LS_CREDS_CHARS) {
      window.localStorage.setItem(`${LS_CREDS_PREFIX}${deviceId}`, fullStr);
      return;
    }
    const compactSnapshot = {
      version: 1,
      createdAt: snapshot.createdAt || Date.now(),
      files: { 'creds.json': snapshot.files['creds.json'] }
    };
    const compactStr = JSON.stringify(compactSnapshot);
    if (compactStr.length <= MAX_LS_CREDS_CHARS) {
      window.localStorage.setItem(`${LS_CREDS_PREFIX}${deviceId}`, compactStr);
    }
  } catch (_) {}
}

function readSnapshotLocalFallback(deviceId) {
  if (!deviceId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${LS_CREDS_PREFIX}${deviceId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.files?.['creds.json']) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function loadDeviceAuthSnapshot(deviceId) {
  if (!deviceId) return null;
  const record = await getDeviceAuthRecord(deviceId);
  if (record?.snapshot?.files?.['creds.json']) {
    return record.snapshot;
  }
  return readSnapshotLocalFallback(deviceId);
}

export async function saveDeviceAuthSnapshot(deviceId, snapshot, updatedAt = Date.now()) {
  if (!deviceId || !snapshot) return null;
  saveSnapshotLocalFallback(deviceId, snapshot);
  return saveDeviceAuthRecord({ deviceId, snapshot, updatedAt });
}

export async function clearAuthSnapshotOnly(deviceId) {
  if (!deviceId) return true;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(`${LS_LINKED_PREFIX}${deviceId}`);
      window.localStorage.removeItem(`${LS_CREDS_PREFIX}${deviceId}`);
    } catch (_) {}
  }
  try {
    const db = await openWaDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(DEVICE_AUTH_STORE, 'readwrite');
      const store = tx.objectStore(DEVICE_AUTH_STORE);
      const getReq = store.get(String(deviceId));
      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) {
          resolve(true);
          return;
        }
        store.put({
          ...existing,
          snapshot: null,
          updatedAt: Date.now()
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      };
      getReq.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

// =========================================================================
// STORE KHUSUS: wa_contacts (Peta Nama Kontak Asli Disimpan User di WA)
// =========================================================================

export async function saveContactsMap(contactsObj) {
  if (!contactsObj || typeof contactsObj !== 'object') return 0;
  try {
    const entries = Object.entries(contactsObj).filter(([k, v]) => k && v);
    if (entries.length === 0) return 0;
    const db = await openWaDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(CONTACTS_STORE, 'readwrite');
      const store = tx.objectStore(CONTACTS_STORE);
      for (const [key, val] of entries) {
        if (typeof val === 'string') {
          store.put({ key: String(key), savedName: val });
        } else if (val && typeof val === 'object') {
          store.put({ key: String(key), ...val });
        }
      }
      tx.oncomplete = () => resolve(entries.length);
      tx.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

export async function getContactsMap() {
  try {
    const db = await openWaDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(CONTACTS_STORE, 'readonly');
      const req = tx.objectStore(CONTACTS_STORE).getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        const map = {};
        for (const entry of list) {
          if (entry?.key && entry?.savedName) {
            map[entry.key] = entry.savedName;
          }
        }
        resolve(map);
      };
      req.onerror = () => resolve({});
    });
  } catch {
    return {};
  }
}

export async function clearContactsMap() {
  try {
    const db = await openWaDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(CONTACTS_STORE, 'readwrite');
      tx.objectStore(CONTACTS_STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}
