import fs from 'fs';
import path from 'path';

// Shared persistence across serverless invocations where possible
let inMemoryLockedTools = [];
const TMP_FILE = path.join('/tmp', 'kuro_locked_tools.json');

function readPersistedLocks() {
  try {
    if (fs.existsSync(TMP_FILE)) {
      const data = JSON.parse(fs.readFileSync(TMP_FILE, 'utf8'));
      if (Array.isArray(data)) {
        inMemoryLockedTools = data;
      }
    }
  } catch {}
  return inMemoryLockedTools;
}

function writePersistedLocks(list) {
  inMemoryLockedTools = list;
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(list, null, 2));
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
      lockedTools: inMemoryLockedTools
    });
  }

  if (req.method === 'POST') {
    try {
      const { toolId, action, lockedTools } = req.body || {};

      if (Array.isArray(lockedTools)) {
        writePersistedLocks(lockedTools);
      } else if (toolId) {
        if (action === 'unlock') {
          writePersistedLocks(inMemoryLockedTools.filter(id => id !== toolId));
        } else if (action === 'lock') {
          if (!inMemoryLockedTools.includes(toolId)) {
            writePersistedLocks([...inMemoryLockedTools, toolId]);
          }
        } else {
          // toggle
          if (inMemoryLockedTools.includes(toolId)) {
            writePersistedLocks(inMemoryLockedTools.filter(id => id !== toolId));
          } else {
            writePersistedLocks([...inMemoryLockedTools, toolId]);
          }
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Status kunci alat berhasil diperbarui.',
        lockedTools: inMemoryLockedTools
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
