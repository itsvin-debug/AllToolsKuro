// Helper IndexedDB lokal untuk menyimpan media View Once secara permanen di browser pengguna

const DB_NAME = 'AllToolsKuro_WaVault';
const DB_VERSION = 2; // Naikkan versi untuk index sentAt yang akurat
const STORE_NAME = 'view_once_media';

function openWaDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
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
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Simpan media baru ke penyimpanan lokal IndexedDB
export async function saveMediaItem(item) {
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(item);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Ambil seluruh media tersimpan (diurutkan dari yang terbaru berdasarkan waktu kirim asli WA)
export async function getAllMediaItems() {
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = request.result || [];
      // Urutkan dari waktu kirim asli WA terbaru
      items.sort((a, b) => {
        const timeA = a.sentAt || a.timestamp || 0;
        const timeB = b.sentAt || b.timestamp || 0;
        return timeB - timeA;
      });
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

// Hapus satu item media dari IndexedDB berdasarkan ID
export async function deleteMediaItem(id) {
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// Bersihkan seluruh galeri media di IndexedDB
export async function clearAllMediaItems() {
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// Export alias untuk fleksibilitas pemanggilan
export { deleteMediaItem as deleteMediaById, clearAllMediaItems as clearAllMedia };
