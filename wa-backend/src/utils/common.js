const crypto = require('crypto');
const { SESSION_ID_REGEX } = require('../config/constants');

function isValidSessionId(sessionId) {
  return typeof sessionId === 'string' && SESSION_ID_REGEX.test(sessionId);
}

function hashDeviceToken(deviceToken) {
  return crypto.createHash('sha256').update(String(deviceToken)).digest('hex');
}

function getDeviceRoom(sessionId) {
  return `device:${sessionId}`;
}

function normalizePhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('620')) {
    digits = '62' + digits.slice(3);
  } else if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8')) {
    digits = '62' + digits;
  }
  return digits;
}

function isValidPairingPhone(digits) {
  return typeof digits === 'string' && digits.length >= 9 && digits.length <= 15 && /^\d+$/.test(digits);
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
  isValidSessionId,
  hashDeviceToken,
  getDeviceRoom,
  normalizePhone,
  isValidPairingPhone,
  argbToHex,
  withTimeout,
  toCleanBuffer
};
