/**
 * Utilitas normalisasi nomor telepon & pemformat kode pairing 8-karakter WhatsApp
 */
export function normalizePairingPhone(raw) {
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

export function isValidPairingPhone(digits) {
  return typeof digits === 'string' && digits.length >= 9 && digits.length <= 15 && /^\d+$/.test(digits);
}

export function formatPairingCodeDisplay(code = '') {
  const clean = String(code || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  }
  return clean || String(code || '');
}
