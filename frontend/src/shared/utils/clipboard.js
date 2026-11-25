/**
 * Kuro Studio - Universal Clipboard Helper
 * Mendukung salin teks (writeText + fallback execCommand untuk Android WebView / non-HTTPS)
 * dan tempel tautan otomatis (readText / clipboard.read).
 */

export async function copyTextToClipboard(text) {
  const value = text === undefined || text === null ? '' : String(text);
  if (!value) {
    return { success: false, message: 'Tidak ada teks untuk disalin.' };
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return { success: true };
    } catch {
      // Lanjut ke fallback execCommand
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (copied) {
        return { success: true };
      }
    } catch {}
  }

  return {
    success: false,
    message: 'Gagal menyalin otomatis ke clipboard. Salin teks secara manual.'
  };
}

export async function readClipboardText() {
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
