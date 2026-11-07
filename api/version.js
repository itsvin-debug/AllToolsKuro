// api/version.js - Serverless endpoint untuk cek versi aplikasi AllToolsKuro

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const versionPayload = {
    latestVersion: '1.2.0',
    versionCode: 2,
    releaseNotes: 'Penambahan fitur Safelink Bypasser dan ekstrak deep link CapCut.',
    features: [
      'Safelink Bypasser: Lewati link iklan bertingkat (Sfl.gl, SafelinkU, Ouo) ke direct link.',
      'Ekstrak Deep Link CapCut & Preset Alight Motion pada Cari Link JJ.',
      'Performa unduhan media lebih stabil dengan auto-reconnect.'
    ],
    apkUrl: 'https://alltoolskuro.vercel.app/AllToolsKuro.apk',
    fileSize: '11.9 MB',
    publishedAt: '2026-11-07'
  };

  return res.status(200).json(versionPayload);
}
