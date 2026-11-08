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
    latestVersion: '1.5.0',
    versionCode: 5,
    releaseNotes: 'Rilis Pembaruan v1.5.0: Sinopsis Rekomendasi Anime & Manhwa Bilingual (ID / EN) Otomatis, Pembersihan CapCut Finder, dan Optimalisasi Serverless Vercel.',
    features: [
      'Sinopsis Bilingual Otomatis: Sinopsis anime & manhwa otomatis berbahasa Indonesia jika memilih bahasa Indonesia, dan berbahasa Inggris jika memilih English.',
      'Detail In-App Modal: Baca sinopsis lengkap, skor rating ⭐, status rilis, dan episode langsung di dalam modal tanpa redirect ke situs luar.',
      'Pembersihan Antarmuka: Menghapus fitur Pencari Template CapCut yang tidak berfungsi agar navigasi lebih rapi dan gesit.',
      'Sinkronisasi Cloud Real-Time: Deteksi pembaruan versi server dan catatan rilis otomatis tersinkronisasi di tombol update aplikasi.',
      'Penyempurnaan Stabilitas & Keamanan: Konsolidasi API serverless bebas kendala kuota Vercel dan sanitasi input.'
    ],
    apkUrl: 'https://alltoolskuro.vercel.app/AllToolsKuro.apk',
    fileSize: '12.8 MB',
    publishedAt: '2026-11-08'
  };

  return res.status(200).json(versionPayload);
}
