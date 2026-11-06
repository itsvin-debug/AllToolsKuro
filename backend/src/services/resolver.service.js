import axios from 'axios';
import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const AGGREGATOR_DOMAINS = [
  'linktr.ee', 'heylink.me', 'carrd.co', 'beacons.ai', 
  'bio.link', 'taplink.cc', 'msha.ke', 'allmylinks.com'
];

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

function extractFromQueryParams(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const searchParams = parsed.searchParams;

    const candidateKeys = [
      'url', 'u', 'link', 'r', 'redirect', 'target', 'go', 'destination', 
      'dest', 'data', 'href', 'dl', 'file', 'out', 'to', 'next', 'download'
    ];

    for (const key of candidateKeys) {
      const val = searchParams.get(key);
      if (!val) continue;

      if (isValidPublicUrl(val) && new URL(val).hostname !== parsed.hostname) {
        return val;
      }

      try {
        const decodedUri = decodeURIComponent(val);
        if (isValidPublicUrl(decodedUri) && new URL(decodedUri).hostname !== parsed.hostname) {
          return decodedUri;
        }
      } catch {}

      try {
        const decodedB64 = Buffer.from(val, 'base64').toString('utf8');
        if (isValidPublicUrl(decodedB64) && new URL(decodedB64).hostname !== parsed.hostname) {
          return decodedB64;
        }
      } catch {}

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

async function forwardToPython(targetUrl, timeoutMs = 28000) {
  const candidateUrls = [
    process.env.PYTHON_RESOLVER_URL,
    'http://127.0.0.1:8001/worker/resolve',
    'http://127.0.0.1:8000/worker/resolve'
  ].filter(Boolean);

  for (const workerUrl of candidateUrls) {
    try {
      const res = await axios.post(workerUrl, { url: targetUrl }, {
        timeout: timeoutMs,
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.data && res.data.status === 'success') {
        return res.data;
      }
    } catch {
      try {
        const fallbackUrl = workerUrl.replace('/worker/resolve', '/resolve');
        const res = await axios.post(fallbackUrl, { url: targetUrl }, {
          timeout: Math.min(timeoutMs, 4000),
          headers: { 'Content-Type': 'application/json' }
        });
        if (res.data && res.data.status === 'success') {
          return res.data;
        }
      } catch {}
    }
  }

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
          message: 'Worker Python tidak merespons atau sedang sibuk.'
        });
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch {
        resolve({
          status: 'error',
          message: 'Format output resolver dari Python worker tidak valid.'
        });
      }
    });
  });
}

export async function resolveLink(targetUrl, options = {}) {
  const startTime = Date.now();
  if (!isValidPublicUrl(targetUrl)) {
    return {
      status: 'error',
      message: 'Parameter URL target tidak valid atau tidak diizinkan.',
      engine: 'nodejs-gateway',
      elapsed_ms: Date.now() - startTime
    };
  }

  const cleanUrl = targetUrl.trim();

  // 1. Coba dekode query parameter langsung
  const paramUrl = extractFromQueryParams(cleanUrl);
  if (paramUrl) {
    return {
      status: 'success',
      result_type: 'single_url',
      category: 'param',
      original_url: cleanUrl,
      resolved_url: paramUrl,
      engine: 'nodejs-gateway',
      elapsed_ms: Math.max(1, Date.now() - startTime)
    };
  }

  // 2. Teruskan ke Python worker untuk deep scrape & aggregator extraction
  try {
    const pyResult = await forwardToPython(cleanUrl, options.timeout || 28000);
    if (pyResult && pyResult.status === 'success') {
      return {
        ...pyResult,
        elapsed_ms: Math.max(1, Date.now() - startTime)
      };
    }
  } catch {}

  // 3. Fallback jika Python worker sedang offline
  return {
    status: 'error',
    message: 'Gagal menyelesaikan link. Worker resolver sedang tidak dapat dihubungi.',
    engine: 'nodejs-gateway',
    elapsed_ms: Math.max(1, Date.now() - startTime)
  };
}
