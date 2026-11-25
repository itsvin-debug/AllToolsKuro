const path = require('path');
const fs = require('fs');
const {
  WA_BACKEND_ROOT,
  AUTH_SESSIONS_ROOT,
  UNLINKED_IDLE_TIMEOUT_MS
} = require('../config/waConfig');
const {
  sessions,
  isValidSessionId,
  getSessionDir,
  getDeviceRoomSize,
  emitToDevice,
  isDirRegistered,
  writeOwnerHash
} = require('./deviceAuth');

function packAuthSnapshot(authDir) {
  try {
    if (!authDir || !fs.existsSync(authDir)) return null;
    const credsPath = path.join(authDir, 'creds.json');
    if (!fs.existsSync(credsPath)) return null;

    const credsRaw = fs.readFileSync(credsPath, 'utf8');
    let credsParsed = null;
    try {
      credsParsed = JSON.parse(credsRaw);
    } catch {
      return null;
    }
    if (!credsParsed?.registered) return null;

    const entries = fs.readdirSync(authDir, { withFileTypes: true });
    const priorityRank = (fname) => {
      if (fname === 'creds.json') return 0;
      if (fname.startsWith('app-state-sync-key-')) return 1;
      if (fname.startsWith('lid-mapping-')) return 2;
      if (fname.startsWith('session-')) return 3;
      if (fname.startsWith('sender-key-')) return 4;
      return 5;
    };

    const jsonFiles = entries
      .filter((e) => e.isFile() && /^[a-zA-Z0-9._-]+\.json$/.test(e.name))
      .map((e) => {
        const full = path.join(authDir, e.name);
        const st = fs.statSync(full);
        return { name: e.name, full, rank: priorityRank(e.name), mtimeMs: st.mtimeMs, size: st.size };
      })
      .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : b.mtimeMs - a.mtimeMs));

    const files = {};
    let totalBytes = 0;
    const MAX_SNAPSHOT_BYTES = 1.5 * 1024 * 1024;

    for (const f of jsonFiles) {
      if (f.size > 512 * 1024 && f.name !== 'creds.json') continue;
      const content = fs.readFileSync(f.full, 'utf8');
      const approxLen = Buffer.byteLength(content, 'utf8') + f.name.length + 16;
      if (totalBytes + approxLen > MAX_SNAPSHOT_BYTES) {
        if (f.name === 'creds.json') return null;
        continue;
      }
      files[f.name] = content;
      totalBytes += approxLen;
    }

    if (!files['creds.json']) return null;
    return {
      version: 1,
      createdAt: Date.now(),
      files
    };
  } catch (err) {
    console.warn('[WA-SNAPSHOT] Gagal pack auth snapshot:', err.message);
    return null;
  }
}

function unpackAuthSnapshot(authDir, snapshot, tokenHash) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.files || typeof snapshot.files !== 'object') {
    return false;
  }
  const credsRaw = snapshot.files['creds.json'];
  if (!credsRaw || typeof credsRaw !== 'string') return false;

  try {
    const parsedCreds = JSON.parse(credsRaw);
    if (!parsedCreds?.registered && !parsedCreds?.me) return false;
  } catch {
    return false;
  }

  try {
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    if (tokenHash) {
      writeOwnerHash(authDir, tokenHash);
    }

    let restoredCount = 0;
    for (const [fname, content] of Object.entries(snapshot.files)) {
      if (typeof fname !== 'string' || typeof content !== 'string') continue;
      if (fname !== path.basename(fname) || fname.includes('..') || !/^[a-zA-Z0-9._-]+\.json$/.test(fname)) {
        continue;
      }
      fs.writeFileSync(path.join(authDir, fname), content, 'utf8');
      restoredCount++;
    }

    return restoredCount > 0 && fs.existsSync(path.join(authDir, 'creds.json'));
  } catch (err) {
    console.warn('[WA-SNAPSHOT] Gagal unpack auth snapshot:', err.message);
    return false;
  }
}

function scheduleAuthSnapshotSync(sessionId, session) {
  if (!session || !isValidSessionId(sessionId)) return;
  if (session.authSyncTimer) clearTimeout(session.authSyncTimer);
  session.authSyncTimer = setTimeout(() => {
    try {
      const authDir = getSessionDir(sessionId);
      const snapshot = packAuthSnapshot(authDir);
      if (snapshot && getDeviceRoomSize(sessionId) > 0) {
        emitToDevice(sessionId, 'auth-snapshot-sync', {
          snapshot,
          updatedAt: Date.now()
        });
      }
    } catch (_) {}
  }, 3000);
}

function cleanupOrphanedAuthDirs() {
  const now = Date.now();

  if (fs.existsSync(AUTH_SESSIONS_ROOT)) {
    try {
      const entries = fs.readdirSync(AUTH_SESSIONS_ROOT, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const fullPath = path.join(AUTH_SESSIONS_ROOT, entry.name);
        try {
          if (isDirRegistered(fullPath)) {
            continue;
          }
          const stat = fs.statSync(fullPath);
          const isUnlinkedExpired = now - stat.mtimeMs > UNLINKED_IDLE_TIMEOUT_MS;
          const isActive = sessions.has(entry.name);
          if (isUnlinkedExpired && !isActive) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            console.log(`[WA-JANITOR] Folder belum tertaut kedaluwarsa dibersihkan: ${entry.name}`);
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  const legacyDirs = [WA_BACKEND_ROOT, path.join(WA_BACKEND_ROOT, 'sessions')];
  for (const baseDir of legacyDirs) {
    if (!fs.existsSync(baseDir)) continue;
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const name = entry.name;
        if (name.startsWith('auth_info_') || name.startsWith('auth_sessions_') || baseDir.endsWith('sessions')) {
          const fullPath = path.join(baseDir, name);
          try {
            if (isDirRegistered(fullPath)) continue;
            const stat = fs.statSync(fullPath);
            if (now - stat.mtimeMs > UNLINKED_IDLE_TIMEOUT_MS) {
              fs.rmSync(fullPath, { recursive: true, force: true });
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }
}

module.exports = {
  packAuthSnapshot,
  unpackAuthSnapshot,
  scheduleAuthSnapshotSync,
  cleanupOrphanedAuthDirs
};
