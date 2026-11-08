// api/version.js - Serverless endpoint untuk cek versi dan changelog AllToolsKuro

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
    releaseNotes: 'Rilis Pembaruan v1.5.1: Sistem In-App OTA Update Internal (Tanpa Keluar APK), Akumulasi Changelog, dan Docking KuroBot 4-Kuadran.',
    features: [
      'Sistem In-App OTA Update: Pembaruan internal langsung di dalam aplikasi Android tanpa download file APK lewat browser.',
      'Akumulasi Changelog & Badge Angka: Badge menampilkan jumlah pembaruan yang tertinggal dan riwayat perubahannya.',
      'Widget KuroBot 4-Kuadran: Widget AI bebas digeser ke Kiri-Atas, Kanan-Atas, Kiri-Bawah, atau Kanan-Bawah dengan penyimpanan posisi persisten.',
      'Sinopsis Rekomendasi Bilingual: Sinopsis anime & manhwa otomatis berbahasa Indonesia jika memilih ID, dan English jika memilih EN.',
      'Pembersihan Antarmuka & Optimasi: Menghapus modul CapCut yang tidak berfungsi agar navigasi lebih gesit dan bebas error.'
    ],
    apkUrl: 'https://alltoolskuro.vercel.app/AllToolsKuro.apk',
    fileSize: '12.8 MB',
    publishedAt: '2026-11-08',
    changelog: [
      {
        version: '1.5.1',
        versionCode: 6,
        date: '2026-11-08',
        title: 'v1.5.1 - In-App OTA Update Engine & KuroBot 4-Kuadran',
        features: [
          'Sistem In-App OTA Update langsung di dalam aplikasi Android tanpa keluar APK.',
          'Akumulasi notifikasi badge angka dinamis sesuai jumlah pembaruan yang tertinggal.',
          'KuroBot 4-Kuadran: Widget AI bebas dipindahkan ke 4 sudut layar dengan penyimpanan posisi persisten di LocalStorage.'
        ]
      },
      {
        version: '1.5.0',
        versionCode: 5,
        date: '2026-11-08',
        title: 'v1.5.0 - Sinopsis Anime & Manhwa Bilingual dan Pembersihan Antarmuka',
        features: [
          'Sinopsis bilingual otomatis (ID / EN) pada modal detail Anime & Manhwa.',
          'Pembersihan modul CapCut yang tidak berfungsi dari navigasi dan sistem.',
          'Konsolidasi serverless endpoint Vercel agar selalu stabil dan cepat.'
        ]
      },
      {
        version: '1.4.0',
        versionCode: 4,
        date: '2026-11-08',
        title: 'v1.4.0 - Rekomendasi Anime & Manhwa Real-Time',
        features: [
          'Rekomendasi Anime cerdas modal kombinasi multi-genre dan LiveChart.me API.',
          'Rekomendasi Manhwa kurasi komik webtoon Korea populer dengan Kitsu API.',
          'Modal detail in-app lengkap dengan cover HD, rating, dan status rilis.'
        ]
      },
      {
        version: '1.3.0',
        versionCode: 3,
        date: '2026-11-07',
        title: 'v1.3.0 - AI KuroBot Asisten & Safelink Bypasser',
        features: [
          'KuroBot asisten AI interaktif dengan panduan tour web mandiri.',
          'Safelink Bypasser: Lewati link iklan bertingkat (Sfl.gl, SafelinkU, Ouo) ke direct link.'
        ]
      },
      {
        version: '1.2.0',
        versionCode: 2,
        date: '2026-11-07',
        title: 'v1.2.0 - Media Downloader 16 Platform',
        features: [
          'Pengunduh video dan audio tanpa watermark dari 16 platform medsos.',
          'Preset 1080p Status WA Anti-Burik agar video tidak pecah saat di-upload.'
        ]
      },
      {
        version: '1.0.0',
        versionCode: 1,
        date: '2026-11-06',
        title: 'v1.0.0 - Rilis Perdana Kuro Studio',
        features: [
          'Peluncuran perdana suite utilitas digital AllToolsKuro dengan arsitektur hybrid modern.'
        ]
      }
    ]
  };

  return res.status(200).json(versionPayload);
}
