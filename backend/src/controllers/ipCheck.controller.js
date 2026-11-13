import { extractClientIp, lookupIpTelemetry } from '../services/ipCheck.service.js';

/**
 * Controller untuk endpoint GET /api/ip-check
 * Menyediakan telemetri jaringan IP publik, ISP, ASN, Geolocation, dan Security Check
 */
export async function getIpTelemetry(req, res) {
  try {
    const clientIp = extractClientIp(req);
    const requestedIp = req.query.ip ? String(req.query.ip).trim() : null;

    const data = await lookupIpTelemetry(requestedIp, clientIp);

    // Pastikan respon tidak di-cache oleh browser atau proxy perantara
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    });

    if (data.error === 'ssrf_blocked') {
      return res.status(403).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Unhandled error in getIpTelemetry controller:', err);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Gagal memproses analisis IP. Terjadi kendala internal server.'
    });
  }
}
