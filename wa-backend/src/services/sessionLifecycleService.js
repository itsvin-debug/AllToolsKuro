const { IDLE_TIMEOUT_MS, UNLINKED_IDLE_TIMEOUT_MS } = require('../config/constants');
const { getSessionDir, isDirRegistered, removeSessionDir } = require('../utils/authFiles');
const { sessions } = require('../state/sessionStore');
const { getDeviceRoomSize } = require('./deviceAuthService');

function startLifecycleTimers(io) {
  // Watchdog RAM setiap 45 detik: pangkas cache tanpa menghapus kredensial login
  setInterval(() => {
    const mem = process.memoryUsage();
    const rssMB = Math.round(mem.rss / 1024 / 1024);

    if (rssMB >= 300) {
      for (const session of sessions.values()) {
        const isIdleSession = getDeviceRoomSize(io, session.sessionId) === 0;

        if (session.pendingMedia && session.pendingMedia.length > 5) {
          session.pendingMedia = session.pendingMedia.slice(-5);
        }
        if (session.msgCache && session.msgCache.size > 30) {
          const keys = Array.from(session.msgCache.keys()).slice(0, session.msgCache.size - 30);
          for (const k of keys) session.msgCache.delete(k);
        }
        if (session.viewOnceStore && session.viewOnceStore.size > 10) {
          const keys = Array.from(session.viewOnceStore.keys()).slice(0, session.viewOnceStore.size - 10);
          for (const k of keys) session.viewOnceStore.delete(k);
        }
        if (session.statusPointers) {
          const maxPointers = isIdleSession ? 40 : 100;
          if (session.statusPointers.size > maxPointers) {
            const keys = Array.from(session.statusPointers.keys()).slice(0, session.statusPointers.size - maxPointers);
            for (const k of keys) session.statusPointers.delete(k);
          }
        }
      }

      try {
        if (global.gc) global.gc();
      } catch (_) {}

      console.log(`[WA-GUARD] RAM ${rssMB}MB >= 300MB — pembersihan memori cache otomatis dijalankan (kredensial login tetap aman).`);
    }
  }, 45 * 1000);

  // Pembersih sesi idle tiap 5 menit
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
      const roomSize = getDeviceRoomSize(io, sessionId);
      let isReg = false;
      try {
        isReg = Boolean(session.sock?.authState?.creds?.registered) || isDirRegistered(getSessionDir(sessionId));
      } catch (_) {}

      if (!isReg && session.status !== 'connected' && now - session.lastActive > UNLINKED_IDLE_TIMEOUT_MS) {
        try {
          session.sock?.ev?.removeAllListeners();
          session.sock?.end();
        } catch (_) {}
        removeSessionDir(sessionId);
        sessions.delete(sessionId);
        console.log(`[WA-JANITOR] Sesi belum tertaut ${sessionId} dibersihkan setelah 15 menit idle.`);
        continue;
      }

      if (session.status === 'connected' && roomSize === 0 && now - session.lastActive > IDLE_TIMEOUT_MS) {
        try {
          session.sock?.ev?.removeAllListeners();
          session.sock?.end();
        } catch (_) {}
        if (!isReg) {
          removeSessionDir(sessionId);
        }
        sessions.delete(sessionId);
        console.log(`[WA-JANITOR] Sesi tertaut ${sessionId} dinonaktifkan dari RAM setelah 45 menit tanpa tab aktif (creds disimpan aman).`);
      }
    }
  }, 5 * 60 * 1000);
}

module.exports = {
  startLifecycleTimers
};
