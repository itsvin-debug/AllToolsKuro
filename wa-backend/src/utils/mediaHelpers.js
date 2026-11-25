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

const globalMediaDownloadQueue = new GlobalMediaDownloadQueue(2, 30);

function normalizePhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8')) {
    digits = '62' + digits;
  }
  return digits;
}

function argbToHex(argb) {
  if (argb === null || argb === undefined) return '#1e293b';
  const num = Number(argb);
  if (isNaN(num)) return '#1e293b';
  const hex = (num >>> 0).toString(16).padStart(8, '0');
  return '#' + hex.slice(2);
}

function withTimeout(promise, ms = 15000, errorMsg = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
  ]);
}

function toCleanBuffer(data) {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.from(data);
  return null;
}

module.exports = {
  GlobalMediaDownloadQueue,
  globalMediaDownloadQueue,
  normalizePhone,
  argbToHex,
  withTimeout,
  toCleanBuffer
};
