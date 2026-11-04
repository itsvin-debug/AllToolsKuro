// Kuro Studio - Security Guard & Bot Defense
// Menjaga serverless functions dari scanning bot, probing .env/file sensitif, dan serangan brute force / flooding.

const IP_REQUEST_LOG = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 menit
const MAX_REQUESTS_PER_WINDOW = 60; // Maksimal 60 request per IP per menit

// User-Agent scanner/bot berbahaya yang umum digunakan untuk mengeksploitasi celah web
const BLOCKED_USER_AGENTS = [
  /sqlmap/i,
  /nikto/i,
  /wpscan/i,
  /acunetix/i,
  /dirbuster/i,
  /nmap/i,
  /masscan/i,
  /zgrab/i,
  /gobuster/i,
  /censys/i,
  /shodan/i,
  /python-requests.*bot/i
];

// Pola path atau query string yang mencoba mengakses file sensitif atau path traversal
const SENSITIVE_PATH_PATTERNS = [
  /\/\.env/i,
  /\/\.git/i,
  /\/\.aws/i,
  /\/\.ssh/i,
  /\/\.config/i,
  /config\.json/i,
  /package\.json/i,
  /\.bak$/i,
  /\.sql$/i,
  /\.tar(\.gz)?$/i,
  /\.zip$/i,
  /\.\.\//, // Path traversal ../
  /%2e%2e%2f/i,
  /\0/ // Null byte injection
];

// Terapkan security headers standar industri
export function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
}

// Ekstrak IP klien dari headers Vercel atau direct request
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || '127.0.0.1';
}

// Validasi request dan blokir jika terdeteksi aktivitas mencurigakan
export function validateRequestSecurity(req, res) {
  applySecurityHeaders(res);

  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';
  const url = req.url || '';

  // 1. Cek User-Agent scanner berbahaya
  for (const pattern of BLOCKED_USER_AGENTS) {
    if (pattern.test(ua)) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Akses ditolak oleh Kuro Security Shield.'
      });
      return false;
    }
  }

  // 2. Cek upaya akses file sensitif / path traversal
  const fullCheck = `${url} ${JSON.stringify(req.query || {})} ${JSON.stringify(req.body || {})}`;
  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    if (pattern.test(fullCheck)) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Akses ke berkas atau direktori sensitif dilarang.'
      });
      return false;
    }
  }

  // 3. Sliding window rate limiting per IP
  const now = Date.now();
  let clientLog = IP_REQUEST_LOG.get(ip);
  if (!clientLog || now - clientLog.startTime > RATE_LIMIT_WINDOW_MS) {
    clientLog = { startTime: now, count: 1 };
    IP_REQUEST_LOG.set(ip, clientLog);
  } else {
    clientLog.count += 1;
    if (clientLog.count > MAX_REQUESTS_PER_WINDOW) {
      res.status(429).json({
        success: false,
        error: 'Too Many Requests',
        message: 'Batas frekuensi permintaan terlampaui. Silakan tunggu beberapa detik sebelum mencoba lagi.'
      });
      return false;
    }
  }

  // Pembersihan memory cache IP setiap 5 menit agar tidak membesar
  if (IP_REQUEST_LOG.size > 5000) {
    for (const [key, value] of IP_REQUEST_LOG.entries()) {
      if (now - value.startTime > RATE_LIMIT_WINDOW_MS) {
        IP_REQUEST_LOG.delete(key);
      }
    }
  }

  return true;
}
