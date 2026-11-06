export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Respons telemetri jika dipanggil dari endpoint /api/system-battery
  if ((req.url && req.url.includes('battery')) || req.query?.action === 'battery') {
    return res.status(200).json({
      success: true,
      level: 100,
      isCharging: true,
      hasBattery: false,
      source: 'cloud'
    });
  }

  return res.status(200).json({ ok: true, status: 'online', timestamp: Date.now() });
}
