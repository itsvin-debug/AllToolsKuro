const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  WA_BACKEND_ROOT,
  SESSION_ID_REGEX,
  AUTH_SESSIONS_ROOT
} = require('../config/waConfig');

const sessions = new Map();
let ioServer = null;

function setIoServer(io) {
  ioServer = io;
}

function getIoServer() {
  return ioServer;
}

function isValidSessionId(sessionId) {
  return typeof sessionId === 'string' && SESSION_ID_REGEX.test(sessionId);
}

function hashDeviceToken(deviceToken) {
  return crypto.createHash('sha256').update(String(deviceToken)).digest('hex');
}

function getDeviceRoom(sessionId) {
  return `device:${sessionId}`;
}

function getDeviceRoomSize(sessionId) {
  if (!ioServer) return 0;
  const room = ioServer.sockets.adapter.rooms.get(getDeviceRoom(sessionId));
  return room ? room.size : 0;
}

function emitToDevice(sessionId, event, data) {
  if (!ioServer || !isValidSessionId(sessionId)) return;
  ioServer.to(getDeviceRoom(sessionId)).emit(event, data);
}

function joinExclusiveDeviceRoom(socket, sessionId) {
  if (!socket || !isValidSessionId(sessionId)) return;
  const targetRoom = getDeviceRoom(sessionId);
  for (const r of socket.rooms) {
    if (r.startsWith('device:') && r !== targetRoom) {
      socket.leave(r);
    }
  }
  socket.join(targetRoom);
}

function getSessionDir(sessionId) {
  if (!isValidSessionId(sessionId)) {
    throw new Error('ID sesi tidak valid.');
  }
  return path.join(AUTH_SESSIONS_ROOT, sessionId);
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

function verifyDeviceOwner(socket, sessionId, deviceToken) {
  if (!isValidSessionId(sessionId)) {
    socket.emit('session-error', { message: 'Akses ditolak: ID sesi perangkat tidak valid.' });
    return null;
  }
  if (!deviceToken || typeof deviceToken !== 'string' || deviceToken.length < 16) {
    socket.emit('session-error', { message: 'Akses ditolak: Token perangkat tidak valid atau hilang.' });
    return null;
  }

  const incomingHash = hashDeviceToken(deviceToken);
  const existingSession = sessions.get(sessionId);
  let storedHash = existingSession?.tokenHash || '';

  if (!storedHash) {
    try {
      const ownerPath = getOwnerHashPath(getSessionDir(sessionId));
      if (fs.existsSync(ownerPath)) {
        storedHash = fs.readFileSync(ownerPath, 'utf8').trim();
      }
    } catch (_) {}
  }

  if (storedHash) {
    try {
      const incomingBuf = Buffer.from(incomingHash, 'hex');
      const storedBuf = Buffer.from(storedHash, 'hex');
      if (incomingBuf.length !== storedBuf.length || !crypto.timingSafeEqual(incomingBuf, storedBuf)) {
        socket.emit('session-error', { message: 'Akses ditolak: Sesi ini milik perangkat lain.' });
        return null;
      }
    } catch {
      socket.emit('session-error', { message: 'Akses ditolak: Sesi ini milik perangkat lain.' });
      return null;
    }
  }

  return incomingHash;
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
    path.join(AUTH_SESSIONS_ROOT, sessionId),
    path.join(WA_BACKEND_ROOT, `auth_info_${sessionId}`),
    path.join(WA_BACKEND_ROOT, 'sessions', sessionId)
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

module.exports = {
  sessions,
  setIoServer,
  getIoServer,
  isValidSessionId,
  hashDeviceToken,
  getDeviceRoom,
  getDeviceRoomSize,
  emitToDevice,
  joinExclusiveDeviceRoom,
  getSessionDir,
  getOwnerHashPath,
  writeOwnerHash,
  verifyDeviceOwner,
  isDirRegistered,
  removeSessionDir
};
