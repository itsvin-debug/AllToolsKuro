const fs = require('fs');
const crypto = require('crypto');
const { isValidSessionId, hashDeviceToken, getDeviceRoom } = require('../utils/common');
const { getSessionDir, getOwnerHashPath, packAuthSnapshot } = require('../utils/authFiles');
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

function scheduleAuthSnapshotSync(io, sessionId, session) {
  if (!io || !session || !isValidSessionId(sessionId)) return;
  if (session.authSyncTimer) clearTimeout(session.authSyncTimer);
  session.authSyncTimer = setTimeout(() => {
    try {
      const authDir = getSessionDir(sessionId);
      const snapshot = packAuthSnapshot(authDir);
      if (snapshot && getDeviceRoomSize(io, sessionId) > 0) {
        emitToDevice(io, sessionId, 'auth-snapshot-sync', {
          snapshot,
          updatedAt: Date.now()
        });
      }
    } catch (_) {}
  }, 3000);
}

module.exports = {
  getDeviceRoomSize,
  emitToDevice,
  joinExclusiveDeviceRoom,
  verifyDeviceOwner,
  scheduleAuthSnapshotSync
};
