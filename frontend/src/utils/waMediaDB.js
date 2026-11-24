// Helper IndexedDB lokal untuk menyimpan media & pesan WA Vault (View Once, Ghost Reader, Anti-Delete, Status)

const DB_NAME = 'AllToolsKuro_WaVault';
const DB_VERSION = 3; // Upgrade ke v3 untuk mendukung category, isDeleted, isEdited, dll.
const STORE_NAME = 'view_once_media'; // Nama store dipertahankan agar data View Once lama tetap aman

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
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Gagal membuka IndexedDB.'));
  });
}

// Simpan atau perbarui item ke penyimpanan lokal IndexedDB
export async function saveMediaItem(item) {
  if (!item || typeof item !== 'object') return null;
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const sanitizedItem = {
      ...item,
      id: String(item.id || Date.now()),
      category: item.category === 'status' ? 'status' : 'chat',
      senderNumber: String(item.senderNumber || ''),
      senderName: String(item.senderName || ''),
      mediaType: String(item.mediaType || 'text'),
      mimeType: String(item.mimeType || ''),
      textContent: String(item.textContent || ''),
      caption: String(item.caption || ''),
      bgColor: String(item.bgColor || ''),
      fileName: String(item.fileName || ''),
      fileSize: Number(item.fileSize || 0),
      isVoiceNote: Boolean(item.isVoiceNote),
      isViewOnce: Boolean(item.isViewOnce),
      isDeleted: Boolean(item.isDeleted),
      deletedAt: item.deletedAt ? Number(item.deletedAt) : null,
      isEdited: Boolean(item.isEdited),
      editedText: String(item.editedText || ''),
      editedAt: item.editedAt ? Number(item.editedAt) : null,
      sentAt: Number(item.sentAt || item.timestamp || Date.now()),
      base64Data: typeof item.base64Data === 'string' ? item.base64Data : ''
    };

    const request = store.put(sanitizedItem);

    request.onsuccess = () => resolve(sanitizedItem);
    request.onerror = () => reject(request.error || new Error('Gagal menyimpan item ke IndexedDB.'));
  });
}

// Perbarui sebagian field item (misal status isDeleted atau isEdited)
export async function updateMediaItem(id, patch = {}) {
  if (!id) return null;
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
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
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(updated);
      putReq.onerror = () => reject(putReq.error || new Error('Gagal memperbarui item IndexedDB.'));
    };

    getReq.onerror = () => reject(getReq.error || new Error('Gagal membaca item dari IndexedDB.'));
  });
}

// Ambil seluruh media tersimpan (diurutkan dari yang terbaru, kompatibel dengan data View Once lama)
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
          isViewOnce: it.isViewOnce !== undefined ? Boolean(it.isViewOnce) : true, // Jika data lama tanpa isViewOnce, default true
          mediaType: it.mediaType || (it.base64Data?.includes('video') ? 'video' : 'image'),
          sentAt: Number(it.sentAt || it.timestamp || Date.now()),
          isDeleted: Boolean(it.isDeleted),
          isEdited: Boolean(it.isEdited)
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

// Export aliases
export {
  getAllMediaItems as getAllMedia,
  deleteMediaItem as deleteMediaById,
  clearAllMediaItems as clearAllMedia
};
