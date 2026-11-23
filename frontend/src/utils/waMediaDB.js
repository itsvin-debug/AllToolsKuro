// Helper IndexedDB lokal untuk menyimpan media View Once langsung di browser pengguna

const DB_NAME = 'AllToolsKuro_WaVault';
const DB_VERSION = 1;
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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
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

// Ambil seluruh media tersimpan (diurutkan dari yang terbaru)
export async function getAllMediaItems() {
  const db = await openWaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = request.result || [];
      // Urutkan dari timestamp terbaru
      items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
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
