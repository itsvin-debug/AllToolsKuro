const path = require('path');
const fs = require('fs');
const { BACKEND_ROOT, AUTH_SESSIONS_DIR } = require('../config/constants');
const { isValidSessionId } = require('./common');

function getSessionDir(sessionId) {
  if (!isValidSessionId(sessionId)) {
    throw new Error('ID sesi tidak valid.');
  }
  return path.join(AUTH_SESSIONS_DIR, sessionId);
}

function getOwnerHashPath(sessionDir) {
  return path.join(sessionDir, '.owner.hash');
}

function writeOwnerHash(sessionDir, tokenHash) {
  if (!sessionDir || !tokenHash) return;
  try {
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    fs.writeFileSync(getOwnerHashPath(sessionDir), String(tokenHash), 'utf8');
  } catch (err) {
    console.warn('[WA-AUTH] Gagal menulis owner hash:', err.message);
  }
}

function isDirRegistered(sessionDir) {
  try {
    const credsPath = path.join(sessionDir, 'creds.json');
    if (!fs.existsSync(credsPath)) return false;
    const raw = fs.readFileSync(credsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.registered);
  } catch {
    return false;
  }
}

function removeSessionDir(sessionId) {
  if (!isValidSessionId(sessionId)) return;
  const dirs = [
    path.join(AUTH_SESSIONS_DIR, sessionId),
    path.join(BACKEND_ROOT, `auth_info_${sessionId}`),
    path.join(BACKEND_ROOT, 'sessions', sessionId)
  ];
  for (const dir of dirs) {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`[Session ${sessionId}] Gagal membersihkan folder auth:`, err.message);
    }
  }
}

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

module.exports = {
  getSessionDir,
  getOwnerHashPath,
  writeOwnerHash,
  isDirRegistered,
  removeSessionDir,
  packAuthSnapshot,
  unpackAuthSnapshot
};
