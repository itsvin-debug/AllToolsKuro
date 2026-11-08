// api/version.js - Serverless endpoint untuk cek versi & changelog registry aplikasi AllToolsKuro

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const versionPayload = {
    latestVersion: '1.5.2',
    versionCode: 7,
    publishedAt: '2026-11-08',
    fileSize: '12.8 MB',
    apkUrl: 'https://alltoolskuro.vercel.app/AllToolsKuro.apk',
    releaseNotes: 'Rilis Pembaruan v1.5.2: Peningkatan Posisi 4-Kuadran KuroBot & In-App Live Update Akumulatif Tanpa Unduh Ulang Browser.',
    features: [
      'Widget AI KuroBot 4-Kuadran: Bebas digeser ke sudut mana pun (Kiri-Atas, Kanan-Atas, Kiri-Bawah, Kanan-Bawah) dengan penyimpanan permanen.',
      'In-App Live Update Akumulatif: Melacak seluruh pembaruan tertunda dan menampilkan riwayat perubahan secara kronologis.',
      'Badge Notifikasi Angka Dinamis: Tombol update menampilkan jumlah pembaruan yang belum diambil (misal \'4\' atau \'5\').',
      'Animasi Progres Live 1% - 100%: Sinkronisasi aset pembaruan langsung di dalam aplikasi tanpa berpindah ke peramban browser.',
      'Status Up-to-Date Otomatis: Menampilkan \'Tidak ada update tersedia\' begitu seluruh pembaruan telah terpasang.'
    ],
    history: [
      {
        version: '1.5.2',
        versionCode: 7,
        date: '2026-11-08',
        title: 'Peningkatan Posisi 4-Kuadran KuroBot & In-App Live Update Akumulatif',
        changes: [
          'Widget AI KuroBot kini bebas dipindahkan secara vertikal dan horizontal ke 4 sudut kuadran (Kiri-Atas, Kanan-Atas, Kiri-Bawah, Kanan-Bawah) dengan penyimpanan LocalStorage.',
          'Sistem In-App Live Update akumulatif: menampilkan seluruh rilis yang belum diambil pengguna.',
          'Badge notifikasi angka dinamis pada tombol update sesuai akumulasi rilis pembaruan.'
        ]
      },
      {
        version: '1.5.1',
        versionCode: 6,
        date: '2026-11-08',
        title: 'Sistem In-App Update & Sinkronisasi 15 Utilitas Kuro',
        changes: [
          'Pembaruan in-app langsung di aplikasi dengan animasi progres tanpa pop-up download browser.',
          'Sinkronisasi Pemandu Tour dan Chatbot AI ke 15 utilitas resmi AllToolsKuro.'
        ]
      },
      {
        version: '1.5.0',
        versionCode: 5,
        date: '2026-11-08',
        title: 'Sinopsis Rekomendasi Anime & Manhwa Bilingual',
        changes: [
          'Penerjemahan sinopsis anime & manhwa otomatis (Bahasa Indonesia / English).',
          'Pembersihan modul CapCut Finder agar antarmuka lebih gesit dan bebas error.'
        ]
      },
      {
        version: '1.4.0',
        versionCode: 4,
        date: '2026-11-08',
        title: 'Integrasi Database Rekomendasi Anime & Manhwa',
        changes: [
          'Modul Rekomendasi Anime dengan data LiveChart & rating MyAnimeList.',
          'Modul Rekomendasi Manhwa dengan filter genre & Kitsu Manga API.'
        ]
      },
      {
        version: '1.3.0',
        versionCode: 3,
        date: '2026-11-07',
        title: 'Penyempurnaan Safelink Bypasser & Cari Link JJ',
        changes: [
          'Bypass link iklan Sfl.gl, SafelinkU, Ouo ke direct download asli.',
          'Koleksi ribuan sound jedag-jedug, preset Alight Motion, dan file XML Google Drive.'
        ]
      }
    ]
  };

  return res.status(200).json(versionPayload);
}
