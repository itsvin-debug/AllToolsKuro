import { resolveUrl } from '../services/resolver.service.js';

export async function resolveLinkController(req, res) {
  try {
    const rawUrl = req.body?.url || req.query?.url;

    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Parameter URL target wajib disertakan.'
      });
    }

    const result = await resolveUrl(rawUrl);

    if (result.status === 'success') {
      return res.status(200).json(result);
    } else {
      return res.status(422).json(result);
    }
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: err.message || 'Terjadi kesalahan internal pada resolver gateway.'
    });
  }
}
