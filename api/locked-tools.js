import fs from 'fs';
import path from 'path';

let inMemoryLockedTools = [];
let inMemoryUpdatedAt = 0;
const TMP_FILE = path.join('/tmp', 'kuro_locked_tools.json');

function readPersistedLocks() {
  try {
    if (fs.existsSync(TMP_FILE)) {
      const raw = fs.readFileSync(TMP_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        inMemoryLockedTools = data;
        inMemoryUpdatedAt = inMemoryUpdatedAt || Date.now();
      } else if (data && typeof data === 'object') {
        if (Array.isArray(data.lockedTools)) {
          inMemoryLockedTools = data.lockedTools;
          inMemoryUpdatedAt = typeof data.updatedAt === 'number' ? data.updatedAt : (inMemoryUpdatedAt || Date.now());
        }
      }
    }
  } catch {}
  return { lockedTools: inMemoryLockedTools, updatedAt: inMemoryUpdatedAt };
}

function writePersistedLocks(list, timestamp = Date.now()) {
  inMemoryLockedTools = Array.isArray(list) ? list : [];
  inMemoryUpdatedAt = timestamp;
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify({
      lockedTools: inMemoryLockedTools,
      updatedAt: inMemoryUpdatedAt
    }, null, 2));
  } catch {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  readPersistedLocks();

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      lockedTools: inMemoryLockedTools,
      updatedAt: inMemoryUpdatedAt
    });
  }

  if (req.method === 'POST') {
    try {
      const { toolId, action, lockedTools, updatedAt, isRehydrate } = req.body || {};
      const newTimestamp = typeof updatedAt === 'number' ? updatedAt : Date.now();

      // Kasus re-hidrasi dari client saat server baru menyala ulang
      if (isRehydrate && Array.isArray(lockedTools)) {
        writePersistedLocks(lockedTools, newTimestamp);
        return res.status(200).json({
          success: true,
          message: 'Status kunci alat berhasil dipulihkan dari sinkronisasi klien.',
          lockedTools: inMemoryLockedTools,
          updatedAt: inMemoryUpdatedAt
        });
      }

      if (Array.isArray(lockedTools)) {
        writePersistedLocks(lockedTools, newTimestamp);
      } else if (toolId) {
        if (action === 'unlock') {
          writePersistedLocks(inMemoryLockedTools.filter(id => id !== toolId), newTimestamp);
        } else if (action === 'lock') {
          if (!inMemoryLockedTools.includes(toolId)) {
            writePersistedLocks([...inMemoryLockedTools, toolId], newTimestamp);
          }
        } else {
          // toggle
          if (inMemoryLockedTools.includes(toolId)) {
            writePersistedLocks(inMemoryLockedTools.filter(id => id !== toolId), newTimestamp);
          } else {
            writePersistedLocks([...inMemoryLockedTools, toolId], newTimestamp);
          }
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Status kunci alat berhasil diperbarui.',
        lockedTools: inMemoryLockedTools,
        updatedAt: inMemoryUpdatedAt
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Gagal memperbarui status kunci alat.'
      });
    }
  }

  return res.status(405).json({ success: false, message: 'Method Not Allowed' });
}
