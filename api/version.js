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
    latestVersion: '1.5.1',
    versionCode: 6,
    releaseNotes: 'Rilis Pembaruan v1.5.1: Sistem In-App Update Interaktif Langsung di Aplikasi, Penyesuaian Pemandu Tour & Bot 15 Utilitas Kuro, serta Sinopsis Rekomendasi Bilingual.',
    features: [
      'Sistem In-App Update Interaktif: Pembaruan versi aplikasi langsung di dalam antarmuka dengan animasi progres bertahap tanpa pop-up download ulang browser yang mengganggu.',
      'Status Otomatis \'Tidak Ada Update Tersedia\': Begitu pembaruan selesai, sistem langsung menandai versi terbaru dan menyediakan opsi cek berkala.',
      'Pemandu Tour & Chatbot 15 Utilitas: Sinkronisasi pemandu tour Kuro dan asisten AI agar presisi mengenali 15 fitur aktif AllToolsKuro.',
      'Sinopsis Rekomendasi Bilingual: Sinopsis anime & manhwa otomatis berbahasa Indonesia jika memilih bahasa Indonesia, dan berbahasa Inggris jika memilih English.',
      'Pembersihan Antarmuka & Optimasi: Menghapus modul CapCut yang tidak berfungsi agar navigasi lebih gesit dan bebas error.'
    ],
    apkUrl: 'https://alltoolskuro.vercel.app/AllToolsKuro.apk',
    fileSize: '12.8 MB',
    publishedAt: '2026-11-08'
  };

  return res.status(200).json(versionPayload);
}
