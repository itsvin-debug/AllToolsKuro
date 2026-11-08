// api/version.js - Serverless endpoint untuk cek versi aplikasi AllToolsKuro

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const versionPayload = {
    latestVersion: '1.3.0',
    versionCode: 3,
    releaseNotes: 'Rilis Pembaruan v1.3.0: 3 Fitur Baru (CapCut JJ, Rekomendasi Anime & Manhwa) dan Optimalisasi Real-Time.',
    features: [
      'Pencari Template CapCut: Cari preset JJ viral via lirik & pratinjau loop video dengan direct link resmi CapCut.',
      'Pencari Rekomendasi Anime: Rekomendasi cerdas modal pilihan genre & kombinasi genre favorit, rating skor MAL, dan sinopsis.',
      'Pencari Rekomendasi Manhwa: Kurasi webtoon Korea modal kombinasi genre, rating pembaca, cover seni HD, dan sinopsis cerita.',
      'Real-Time Live Search: Seluruh pencarian dan saringan genre kini berjalan seketika (real-time).',
      'Penyempurnaan Stabilitas: Pembaruan telemetri sistem bebas proxy error.'
    ],
    apkUrl: 'https://alltoolskuro.vercel.app/AllToolsKuro.apk',
    fileSize: '12.4 MB',
    publishedAt: '2026-11-08'
  };

  return res.status(200).json(versionPayload);
}
