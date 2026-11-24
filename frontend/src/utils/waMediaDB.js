// Helper IndexedDB lokal untuk menyimpan chat dan Status WhatsApp di browser pengguna (Zero-Disk Server)

const DB_NAME = 'AllToolsKuro_WaVault';
const DB_VERSION = 3;
const STORE_NAME = 'view_once_media';

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
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Gagal membuka IndexedDB.'));
  });
}

// Simpan item (Chat atau Status WA) ke IndexedDB
export async function saveMediaItem(item) {
  if (!item || typeof item !== 'object') return null;
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const sanitizedItem = {
        ...item,
        id: String(item.id || Date.now()),
        base64Data: typeof item.base64Data === 'string' ? item.base64Data : ''
      };
      const request = store.put(sanitizedItem);

      request.onsuccess = () => resolve(sanitizedItem);
      request.onerror = () => reject(request.error || new Error('Gagal menyimpan item ke database.'));
    } catch (err) {
      reject(err);
    }
  });
}

// Ambil seluruh item tersimpan (terurut dari yang terbaru)
// Membersihkan otomatis item sampah/placeholder lama jika ada
export async function getAllMediaItems() {
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const rawItems = request.result || [];
        const cleanItems = [];
        const idsToDelete = [];

        for (const it of rawItems) {
          if (!it || typeof it !== 'object') continue;
          // Filter dan bersihkan artefak kartu pending/blocked lama
          if (it.mediaType === 'viewonce-pending' || it.mediaType === 'viewonce-blocked') {
            if (it.id) idsToDelete.push(String(it.id));
            continue;
          }
          cleanItems.push(it);
        }

        // Hapus sisa item lama secara background jika ada
        if (idsToDelete.length > 0) {
          for (const deadId of idsToDelete) {
            try {
              store.delete(deadId);
            } catch (_) {}
          }
        }

        cleanItems.sort((a, b) => {
          const timeA = Number(a?.sentAt || a?.timestamp) || 0;
          const timeB = Number(b?.sentAt || b?.timestamp) || 0;
          return timeB - timeA;
        });

        resolve(cleanItems);
      };
      request.onerror = () => reject(request.error || new Error('Gagal mengambil data dari database.'));
    } catch (err) {
      reject(err);
    }
  });
}

// Hapus satu item berdasarkan ID
export async function deleteMediaItem(id) {
  if (!id) return true;
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(String(id));

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error || new Error('Gagal menghapus item.'));
    } catch (err) {
      reject(err);
    }
  });
}

// Hapus sekumpulan ID sekaligus (untuk tombol Bersihkan Tab)
export async function deleteMediaByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return true;
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const id of ids) {
        if (id) {
          store.delete(String(id));
        }
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Gagal menghapus beberapa item.'));
    } catch (err) {
      reject(err);
    }
  });
}

// Perbarui parsial item yang sudah ada (misal status isDeleted atau editedText)
export async function updateMediaItem(id, patch) {
  if (!id || !patch || typeof patch !== 'object') return null;
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
          id: String(id)
        };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = () => reject(putReq.error || new Error('Gagal memperbarui item.'));
      };
      getReq.onerror = () => reject(getReq.error || new Error('Gagal mencari item.'));
    } catch (err) {
      reject(err);
    }
  });
}

// Bersihkan seluruh database IndexedDB
export async function clearAllMediaItems() {
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error || new Error('Gagal mengosongkan database.'));
    } catch (err) {
      reject(err);
    }
  });
}

// Export alias untuk kompatibilitas import
export {
  deleteMediaItem as deleteMediaById,
  clearAllMediaItems as clearAllMedia,
  getAllMediaItems as getAllMedia
};
