const fs = require('fs');
const crypto = require('crypto');
const { isValidSessionId, hashDeviceToken, getDeviceRoom } = require('../utils/common');
const { getSessionDir, getOwnerHashPath, isDirRegistered, packAuthSnapshot } = require('../utils/authFiles');
const { sessions } = require('../state/sessionStore');

function getDeviceRoomSize(io, sessionId) {
  if (!io) return 0;
  const room = io.sockets.adapter.rooms.get(getDeviceRoom(sessionId));
  return room ? room.size : 0;
}

function emitToDevice(io, sessionId, event, data) {
  if (!io || !isValidSessionId(sessionId)) return;
  io.to(getDeviceRoom(sessionId)).emit(event, data);
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
  const sessionDir = getSessionDir(sessionId);
  let storedHash = existingSession?.tokenHash || '';

  if (!storedHash) {
    try {
      const ownerPath = getOwnerHashPath(sessionDir);
      if (fs.existsSync(ownerPath)) {
        storedHash = fs.readFileSync(ownerPath, 'utf8').trim();
      }
    } catch (_) {}
  }

  // Jangan izinkan koneksi tanpa .owner.hash mengambil alih folder sesi terdaftar
  if (!storedHash && isDirRegistered(sessionDir)) {
    socket.emit('session-error', { message: 'Akses ditolak: Sesi ini terkunci ke pemilik perangkat asli.' });
    return null;
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

  if (socket.data) {
    socket.data.verifiedSessionId = sessionId;
    socket.data.verifiedTokenHash = incomingHash;
  }
  return incomingHash;
}

function emitAuthSnapshotNow(io, sessionId, session) {
  if (!io || !isValidSessionId(sessionId)) return false;
  if (session?.authSyncTimer) {
    clearTimeout(session.authSyncTimer);
    session.authSyncTimer = null;
  }
  try {
    const authDir = getSessionDir(sessionId);
    const snapshot = packAuthSnapshot(authDir);
    if (snapshot && getDeviceRoomSize(io, sessionId) > 0) {
      emitToDevice(io, sessionId, 'auth-snapshot-sync', {
        sessionId,
        accountJid: session?.accountJid || '',
        snapshot,
        registered: true,
        updatedAt: Date.now()
      });
      return true;
    }
  } catch (_) {}
  return false;
}

function scheduleAuthSnapshotSync(io, sessionId, session, debounceMs = 800) {
  if (!io || !session || !isValidSessionId(sessionId)) return;
  if (session.authSyncTimer) clearTimeout(session.authSyncTimer);
  session.authSyncTimer = setTimeout(() => {
    session.authSyncTimer = null;
    emitAuthSnapshotNow(io, sessionId, session);
  }, Math.max(0, Number(debounceMs) || 800));
}

module.exports = {
  getDeviceRoomSize,
  emitToDevice,
  joinExclusiveDeviceRoom,
  verifyDeviceOwner,
  emitAuthSnapshotNow,
  scheduleAuthSnapshotSync
};
