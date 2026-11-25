const path = require('path');
const fs = require('fs');
const {
  BACKEND_ROOT,
  AUTH_SESSIONS_DIR,
  UNLINKED_IDLE_TIMEOUT_MS
} = require('../config/constants');
const { isDirRegistered } = require('../utils/authFiles');

// Antrean unduhan global lintas semua sesi (maksimal 2 paralel, maksimal 1 per sesi)
class GlobalMediaDownloadQueue {
  constructor(maxConcurrent = 2, maxQueueSize = 30) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
    this.queue = [];
    this.activeCount = 0;
    this.sessionActiveCounts = new Map();
  }

  push(taskFn, sessionId = 'global') {
    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
    }
    this.queue.push({ taskFn, sessionId });
    this.runNext();
  }

  async runNext() {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) return;

    const taskIndex = this.queue.findIndex(t => (this.sessionActiveCounts.get(t.sessionId) || 0) < 1);
    if (taskIndex === -1) return;

    const [item] = this.queue.splice(taskIndex, 1);
    const { taskFn, sessionId } = item;

    this.activeCount++;
    this.sessionActiveCounts.set(sessionId, (this.sessionActiveCounts.get(sessionId) || 0) + 1);

    try {
      await taskFn();
    } catch (err) {
      console.warn('[GlobalDownloadQueue] Error eksekusi unduhan:', err.message);
    } finally {
      this.activeCount--;
      const cur = (this.sessionActiveCounts.get(sessionId) || 1) - 1;
      if (cur <= 0) {
        this.sessionActiveCounts.delete(sessionId);
      } else {
        this.sessionActiveCounts.set(sessionId, cur);
      }
      this.runNext();
    }
  }
}

const sessions = new Map();
const globalMediaDownloadQueue = new GlobalMediaDownloadQueue(2, 30);

function cleanupOrphanedAuthDirs() {
  const now = Date.now();

  if (fs.existsSync(AUTH_SESSIONS_DIR)) {
    try {
      const entries = fs.readdirSync(AUTH_SESSIONS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const fullPath = path.join(AUTH_SESSIONS_DIR, entry.name);
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

  const legacyDirs = [BACKEND_ROOT, path.join(BACKEND_ROOT, 'sessions')];
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
  sessions,
  GlobalMediaDownloadQueue,
  globalMediaDownloadQueue,
  cleanupOrphanedAuthDirs
};
