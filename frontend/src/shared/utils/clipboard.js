/**
 * frontend/src/utils/clipboard.js
 * Utilitas universal clipboard untuk membaca dan menempel tautan secara otomatis.
 * Mendukung pembacaan instan navigator.clipboard.readText() di mobile dan desktop.
 */

export async function readClipboardText() {
  // 1. Coba Clipboard API modern navigator.clipboard.readText() langsung dalam user gesture
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
    try {
      const text = await navigator.clipboard.readText();
      if (text && typeof text === 'string' && text.trim().length > 0) {
        return { success: true, text: text.trim() };
      }
      return { 
        success: false, 
        reason: 'empty', 
        message: 'Papan klip (clipboard) masih kosong. Salin tautan terlebih dahulu!' 
      };
    } catch (err) {
      // 2. Coba fallback navigator.clipboard.read()
      if (navigator.clipboard.read) {
        try {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            const textType = item.types.find(t => t.startsWith('text/'));
            if (textType) {
              const blob = await item.getType(textType);
              const text = await blob.text();
              if (text && text.trim().length > 0) {
                return { success: true, text: text.trim() };
              }
            }
          }
        } catch {}
      }

      // Deteksi penolakan izin browser
      const isDenied = err.name === 'NotAllowedError' || err.name === 'SecurityError';
      return {
        success: false,
        reason: isDenied ? 'permission_denied' : 'error',
        message: isDenied 
          ? 'Izin clipboard dibatasi browser. Izinkan clipboard atau ketuk tahan kolom untuk menempel.'
          : 'Gagal membaca papan klip perangkat secara otomatis.'
      };
    }
  }

  return {
    success: false,
    reason: 'unsupported',
    message: 'Browser tidak mengizinkan pembacaan papan klip otomatis.'
  };
}

