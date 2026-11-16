import { stalkTiktokProfile } from '../services/tiktokStalker.service.js';

/**
 * Controller untuk pelacak profil TikTok anonim (TikTok Stalker)
 * Mendukung POST body { username } atau GET query ?username=...
 */
export async function getTiktokProfileStalk(req, res) {
  try {
    const rawTarget = req.body?.username || req.body?.url || req.query?.username || req.query?.url || '';

    if (!rawTarget || typeof rawTarget !== 'string' || !rawTarget.trim()) {
      return res.status(400).json({
        success: false,
        error: 'missing_target',
        message: 'Mohon masukkan username atau tautan profil TikTok yang valid.'
      });
    }

    const result = await stalkTiktokProfile(rawTarget.trim());

    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    if (!result.success) {
      const code = result.statusCode || (result.error === 'invalid_username' ? 400 : 502);
      return res.status(code).json({
        status: 'error',
        success: false,
        message: result.message || 'API TikTok eksternal sedang gangguan atau mengembalikan respons tidak valid.',
        error: result.error || 'external_api_error'
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('Unhandled error in getTiktokProfileStalk controller:', err);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Gagal memproses pelacakan profil TikTok. Terjadi kendala internal server.'
    });
  }
}
