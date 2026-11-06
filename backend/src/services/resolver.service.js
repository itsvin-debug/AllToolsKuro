import axios from 'axios';
import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Validasi skema dan cegah SSRF ke alamat loopback / IP privat
export function isValidPublicUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      /^169\.254\./.test(host)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// Coba ekstrak URL dari berbagai pola encoding di query parameter
function extractFromQueryParams(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const searchParams = parsed.searchParams;

    const candidateKeys = [
      'url', 'u', 'link', 'r', 'redirect', 'target', 'go', 'destination', 
      'dest', 'data', 'href', 'dl', 'file', 'out', 'to', 'next'
    ];

    for (const key of candidateKeys) {
      const val = searchParams.get(key);
      if (!val) continue;

      // 1. URL plaintext
      if (isValidPublicUrl(val) && new URL(val).hostname !== parsed.hostname) {
        return val;
      }

      // 2. URL-encoded
      try {
        const decodedUri = decodeURIComponent(val);
        if (isValidPublicUrl(decodedUri) && new URL(decodedUri).hostname !== parsed.hostname) {
          return decodedUri;
        }
      } catch {}

      // 3. Base64 encoded
      try {
        const decodedB64 = Buffer.from(val, 'base64').toString('utf8');
        if (isValidPublicUrl(decodedB64) && new URL(decodedB64).hostname !== parsed.hostname) {
          return decodedB64;
        }
      } catch {}

      // 4. Hex encoded
      try {
        if (/^[0-9a-fA-F]+$/.test(val) && val.length % 2 === 0) {
          const decodedHex = Buffer.from(val, 'hex').toString('utf8');
          if (isValidPublicUrl(decodedHex) && new URL(decodedHex).hostname !== parsed.hostname) {
            return decodedHex;
          }
        }
      } catch {}
    }
  } catch {}

  return null;
}

// Resolusi fast-path: periksa query decoding dan header redirect HTTP (301/302)
async function resolveFastPath(targetUrl, timeoutMs = 4500) {
  // 1. Fast decoding query params
  const paramUrl = extractFromQueryParams(targetUrl);
  if (paramUrl) {
    return {
      status: 'success',
      original_url: targetUrl,
      resolved_url: paramUrl,
      engine: 'nodejs-fast'
    };
  }

  // 2. Header redirect HTTP (301, 302, 303, 307, 308)
  try {
    const res = await axios.get(targetUrl, {
      maxRedirects: 5,
      timeout: timeoutMs,
      headers: {
        'User-Agent': UA_DESKTOP,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      validateStatus: (status) => status >= 200 && status < 400
    });

    const finalUrl = res.request?.res?.responseUrl || res.config?.url;
    if (finalUrl && finalUrl !== targetUrl && isValidPublicUrl(finalUrl)) {
      const origHost = new URL(targetUrl).hostname;
      const finalHost = new URL(finalUrl).hostname;

      if (origHost !== finalHost) {
        return {
          status: 'success',
          original_url: targetUrl,
          resolved_url: finalUrl,
          engine: 'nodejs-fast'
        };
      }
    }

    // 3. Cek meta refresh atau redirect script sederhana di HTML awal
    if (typeof res.data === 'string') {
      const metaMatch = res.data.match(/<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?[0-9]*\s*;\s*url=([^"'>\s]+)/i);
      if (metaMatch && metaMatch[1]) {
        let metaUrl = metaMatch[1].trim();
        if (metaUrl.startsWith('/') && finalUrl) {
          metaUrl = new URL(metaUrl, finalUrl).toString();
        }
        if (isValidPublicUrl(metaUrl)) {
          return {
            status: 'success',
            original_url: targetUrl,
            resolved_url: metaUrl,
            engine: 'nodejs-fast'
          };
        }
      }
    }
  } catch {}

  return null;
}

// Meneruskan tugas ke service Python (FastAPI internal REST API dengan fallback child_process)
async function forwardToPython(targetUrl, timeoutMs = 28000) {
  const candidateUrls = [
    process.env.PYTHON_RESOLVER_URL,
    'http://127.0.0.1:8001/worker/resolve',
    'http://127.0.0.1:8000/worker/resolve'
  ].filter(Boolean);

  // Opsi A: Coba internal REST API mikroservis FastAPI
  for (const workerUrl of candidateUrls) {
    try {
      const res = await axios.post(workerUrl, { url: targetUrl }, {
        timeout: timeoutMs,
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.data && (res.data.status === 'success' || res.data.status === 'error')) {
        return res.data;
      }
    } catch {
      // Coba fallback endpoint /resolve pada URL yang sama
      try {
        const fallbackUrl = workerUrl.replace('/worker/resolve', '/resolve');
        const res = await axios.post(fallbackUrl, { url: targetUrl }, {
          timeout: Math.min(timeoutMs, 4000),
          headers: { 'Content-Type': 'application/json' }
        });
        if (res.data && (res.data.status === 'success' || res.data.status === 'error')) {
          return res.data;
        }
      } catch {}
    }
  }

  // Opsi B: Jalankan script runner Python via child_process dengan direktori kerja yang tepat
  return new Promise((resolve) => {
    const pythonDir = path.resolve(__dirname, '../../../backend-python');
    const scriptPath = path.resolve(pythonDir, 'script_resolver.py');
    const pythonExec = process.env.PYTHON_PATH || 'python';

    execFile(pythonExec, [scriptPath, targetUrl], { 
      timeout: timeoutMs,
      cwd: pythonDir
    }, (error, stdout) => {
      if (error) {
        return resolve({
          status: 'error',
          message: error.killed ? 'Resolusi timeout melebihi batas waktu.' : 'Layanan deep scraper sedang tidak tersedia.',
          engine: 'python-deep'
        });
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        return resolve(parsed);
      } catch {
        return resolve({
          status: 'error',
          message: 'Gagal memproses data dari deep resolver engine.',
          engine: 'python-deep'
        });
      }
    });
  });
}

/**
 * Fungsi Utama Resolver Orchestrator:
 * Menggabungkan Node.js Fast-Path dan Python Deep-Scraper dalam alur terpadu.
 */
export async function resolveUrl(rawUrl) {
  const startTime = Date.now();

  if (!rawUrl || !isValidPublicUrl(rawUrl)) {
    return {
      status: 'error',
      message: 'URL target tidak valid atau tidak diizinkan. Gunakan format http:// atau https://',
      engine: 'nodejs-fast',
      elapsed_ms: Date.now() - startTime
    };
  }

  const cleanUrl = rawUrl.trim();
  const MAX_BUDGET_MS = 32000; // Alokasi waktu untuk bypass dinamis bertingkat

  // 1. Eksekusi Node.js Fast-Path
  const fastResult = await resolveFastPath(cleanUrl, 3500);
  if (fastResult && fastResult.status === 'success') {
    return {
      ...fastResult,
      elapsed_ms: Math.max(1, Date.now() - startTime)
    };
  }

  // 2. Teruskan ke Python Deep-Scraper Service
  const elapsed = Date.now() - startTime;
  const remainingBudget = Math.max(5000, MAX_BUDGET_MS - elapsed);

  const pythonResult = await forwardToPython(cleanUrl, remainingBudget);
  return {
    ...pythonResult,
    elapsed_ms: pythonResult.elapsed_ms || Math.max(1, Date.now() - startTime)
  };
}
