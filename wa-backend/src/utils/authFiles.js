const path = require('path');
const fs = require('fs');
const { BACKEND_ROOT, AUTH_SESSIONS_DIR } = require('../config/constants');
const { isValidSessionId } = require('./common');

const coldRestoredSessionDirs = new Set();

function normalizeJidUserPart(jid = '') {
  return String(jid || '').trim().split('@')[0].split(':')[0];
}

function extractOwnIdentifiersFromCreds(parsedCreds) {
  const me = parsedCreds?.me || {};
  return {
    ownPhone: normalizeJidUserPart(me.id || me.jid || ''),
    ownLidUser: normalizeJidUserPart(me.lid || '')
  };
}

function matchesSignalFileBoundary(text, prefix) {
  if (!prefix) return false;
  if (text === prefix) return true;
  const boundary = text[prefix.length];
  return text.startsWith(prefix) && (boundary === '.' || boundary === '-' || boundary === '_' || boundary === '@');
}

function isOwnSignalSessionFile(fname, ownPhone, ownLidUser) {
  if (!fname || typeof fname !== 'string') return false;
  if (fname === 'creds.json' || fname === '.owner.hash') return false;
  if (!fname.endsWith('.json')) return false;
  if (fname.startsWith('session-')) {
    const body = fname.slice('session-'.length, -'.json'.length);
    return matchesSignalFileBoundary(body, ownPhone) || matchesSignalFileBoundary(body, ownLidUser);
  }
  if (fname.startsWith('sender-key-')) {
    const sepIdx = fname.indexOf('--');
    if (sepIdx !== -1) {
      const senderBody = fname.slice(sepIdx + 2, -'.json'.length);
      return matchesSignalFileBoundary(senderBody, ownPhone) || matchesSignalFileBoundary(senderBody, ownLidUser);
    }
  }
  return false;
}

function clearOwnSignalSessionFilesOnDisk(authDir, ownPhone, ownLidUser) {
  const clearedFiles = [];
  const nullSessionMap = {};
  if (!authDir || !fs.existsSync(authDir)) {
    return { clearedFiles, nullSessionMap };
  }
  const entries = fs.readdirSync(authDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !isOwnSignalSessionFile(entry.name, ownPhone, ownLidUser)) continue;
    if (entry.name.startsWith('session-')) {
      const bodyId = entry.name.slice('session-'.length, -'.json'.length);
      if (bodyId) nullSessionMap[bodyId] = null;
    }
    try {
      fs.unlinkSync(path.join(authDir, entry.name));
      clearedFiles.push(entry.name);
    } catch (_) {}
  }
  return { clearedFiles, nullSessionMap };
}

function consumeColdRestoredFlag(authDir) {
  if (!authDir) return false;
  const key = path.resolve(authDir);
  if (!coldRestoredSessionDirs.has(key)) return false;
  coldRestoredSessionDirs.delete(key);
  return true;
}

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

    // Baca raw UTF-8 string tanpa parse+re-stringify agar struktur BufferJSON Baileys utuh 100%
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
      if (fname.startsWith('app-state-sync-version-')) return 2;
      if (fname.startsWith('lid-mapping-')) return 3;
      if (fname.startsWith('session-')) return 4;
      if (fname.startsWith('pre-key-')) return 5;
      return 6;
    };

    const jsonFiles = entries
      .filter((e) => e.isFile() && /^[a-zA-Z0-9._-]+\.json$/.test(e.name))
      .map((e) => {
        const full = path.join(authDir, e.name);
        const st = fs.statSync(full);
        const rank = priorityRank(e.name);
        const ownIds = extractOwnIdentifiersFromCreds(credsParsed);
        const isOwnSession = isOwnSignalSessionFile(e.name, ownIds.ownPhone, ownIds.ownLidUser);
        return { name: e.name, full, rank: isOwnSession ? 2.5 : rank, mtimeMs: st.mtimeMs, size: st.size };
      })
      .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : b.mtimeMs - a.mtimeMs));

    const files = {};
    let totalBytes = 0;
    const MAX_SNAPSHOT_BYTES = 680 * 1024;
    let sessionCount = 0;
    let preKeyCount = 0;

    for (const f of jsonFiles) {
      if (f.size > 384 * 1024 && f.name !== 'creds.json') continue;
      if (f.name.startsWith('session-')) {
        if (sessionCount >= 60) continue;
        sessionCount++;
      } else if (f.name.startsWith('pre-key-')) {
        if (preKeyCount >= 30) continue;
        preKeyCount++;
      } else if (f.rank === 6) {
        continue;
      }

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

function unpackAuthSnapshot(authDir, snapshot, tokenHash, metaOut = null) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.files || typeof snapshot.files !== 'object') {
    return false;
  }
  const credsRaw = snapshot.files['creds.json'];
  if (!credsRaw || typeof credsRaw !== 'string') return false;

  let parsedCreds = null;
  try {
    parsedCreds = JSON.parse(credsRaw);
    if (!parsedCreds?.registered && !parsedCreds?.me) return false;
  } catch {
    return false;
  }

  const { ownPhone, ownLidUser } = extractOwnIdentifiersFromCreds(parsedCreds);

  try {
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    } else {
      // Bersihkan file json sisa sesi tak tertaut sebelum memulihkan snapshot terverifikasi
      for (const entry of fs.readdirSync(authDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          try { fs.unlinkSync(path.join(authDir, entry.name)); } catch (_) {}
        }
      }
    }
    if (tokenHash) {
      writeOwnerHash(authDir, tokenHash);
    }

    let restoredCount = 0;
    const restoredOwnRatchets = [];

    for (const [fname, content] of Object.entries(snapshot.files)) {
      if (typeof fname !== 'string' || typeof content !== 'string') continue;
      if (fname !== path.basename(fname) || fname.includes('..') || !/^[a-zA-Z0-9._-]+\.json$/.test(fname)) {
        continue;
      }
      // Pertahankan session-<ownLid>* & session-<ownPhone>* dari snapshot segar agar pesan masuk LID tidak terkena stub: 2
      if (isOwnSignalSessionFile(fname, ownPhone, ownLidUser)) {
        restoredOwnRatchets.push(fname);
      }
      fs.writeFileSync(path.join(authDir, fname), content, 'utf8');
      restoredCount++;
    }

    const ok = restoredCount > 0 && fs.existsSync(path.join(authDir, 'creds.json'));
    if (ok) {
      coldRestoredSessionDirs.add(path.resolve(authDir));
      if (restoredOwnRatchets.length > 0) {
        console.log(`[WA-SNAPSHOT] Pertahankan ${restoredOwnRatchets.length} own Signal session (${restoredOwnRatchets.slice(0, 4).join(', ')})`);
      }
      if (metaOut && typeof metaOut === 'object') {
        metaOut.restoredOwnRatchets = restoredOwnRatchets;
        metaOut.skippedOwnRatchets = [];
        metaOut.ownPhone = ownPhone;
        metaOut.ownLidUser = ownLidUser;
      }
    }
    return ok;
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
  extractOwnIdentifiersFromCreds,
  isOwnSignalSessionFile,
  clearOwnSignalSessionFilesOnDisk,
  consumeColdRestoredFlag,
  packAuthSnapshot,
  unpackAuthSnapshot
};
