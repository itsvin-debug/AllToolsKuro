// Bersihkan markdown mentah agar tampilan ucapan Kuro tetap rapi
export function cleanSpeechText(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

// Katalog 17 utilitas AllToolsKuro lengkap berurutan 100% sesuai DAFTAR ALAT UTAMA (kiri ke kanan, atas ke bawah)
export const KURO_TOOLS_CATALOG = [
  {
    id: 'downloader',
    name: 'Media Downloader',
    tag: 'All-in-One HD',
    desc: 'Unduh video, album slide foto, dan audio MP3 tanpa watermark dari TikTok, Instagram, YouTube, dan medsos lainnya hingga kualitas 4K & Status WA Anti-Burik 1080p.',
    howToUse: 'Tempel URL video atau audio di kolom input, pilih format (Video/Audio/Slide) dan resolusi, lalu klik tombol download.'
  },
  {
    id: 'jjFinder',
    name: 'Cari Link JJ',
    tag: 'Jedag-Jedug Viral',
    desc: 'Temukan ribuan sound jedag-jedug viral, template CapCut siap pakai, preset Alight Motion, dan backsound tren terbaru untuk konten kreatif.',
    howToUse: 'Ketik kata kunci sound atau pembuat template, dengarkan pratinjau audio, dan klik tombol Buka Template untuk langsung mengedit.'
  },
  {
    id: 'pngToPdf',
    name: 'PNG to PDF',
    tag: 'Konversi Dokumen',
    desc: 'Satukan banyak file gambar PNG dan JPG menjadi satu berkas PDF rapi dengan tata letak proporsional dan resolusi tajam.',
    howToUse: 'Pilih atau seret gambar-gambar yang ingin disatukan, atur urutan halaman, lalu tekan Konversi ke PDF untuk mengunduh.'
  },
  {
    id: 'linkToDoc',
    name: 'Link to PDF/PPT',
    tag: 'Ekstraktor Materi',
    desc: 'Ekstrak dokumen kuliah dan presentasi dari Scribd atau SlideShare menjadi berkas PDF atau PPT utuh langsung dari tautan web.',
    howToUse: 'Masukkan tautan dokumen Scribd atau SlideShare, pilih format keluaran (PDF/PPT), lalu klik Ekstrak Dokumen.'
  },
  {
    id: 'imageToLink',
    name: 'File ke Link',
    tag: 'Hosting Instan',
    desc: 'Unggah foto dari perangkatmu dan dapatkan tautan URL publik instan berkecepatan tinggi untuk dibagikan ke mana saja.',
    howToUse: 'Unggah foto dari galeri atau kamera, tunggu proses upload sekejap, dan salin URL tautan gambar publik yang dihasilkan.'
  },
  {
    id: 'compressor',
    name: 'Kompres Media & PDF',
    tag: 'Hemat Memori',
    desc: 'Kecilkan ukuran video, foto, dan dokumen PDF secara signifikan tanpa merusak isi atau membuat gambar pecah.',
    howToUse: 'Pilih file media atau PDF yang ukurannya besar, tentukan tingkat kompresi, dan unduh file hasil kompresi yang jauh lebih ringan.'
  },
  {
    id: 'qrStudio',
    name: 'QR Code Studio',
    tag: 'Desain Kustom',
    desc: 'Studio pembuat kode QR estetik dengan logo kustom, pewarnaan neobrutalist fleksibel, dan resolusi tinggi yang siap dipindai.',
    howToUse: 'Ketik teks atau URL tautan tujuan, sesuaikan warna latar & mata QR, unggah logo jika perlu, lalu unduh file gambar QR.'
  },
  {
    id: 'audioMerger',
    name: 'Audio Merger',
    tag: 'Kombinasi Suara',
    desc: 'Gabungkan beberapa trek audio atau musik menjadi satu kesatuan alunan utuh dengan perpindahan lagu yang mulus.',
    howToUse: 'Unggah dua atau lebih file audio MP3/WAV, atur urutan pemutaran, lalu klik Gabungkan Audio untuk memproses dan mengunduh.'
  },
  {
    id: 'photoStudio',
    name: 'Photo Studio',
    tag: 'Filter & Efek',
    desc: 'Editor foto instan dengan ragam filter neobrutalist, rotasi, penyesuaian kontras, serta efek grafis artistik untuk mempercantik gambarmu.',
    howToUse: 'Unggah foto, pilih filter warna atau rotasi yang diinginkan, pratinjau hasilnya secara langsung, dan simpan gambar.'
  },
  {
    id: 'videoStudio',
    name: 'Video Studio',
    tag: 'Studio Kreatif',
    desc: 'Editor video praktis untuk mengatur kecepatan pemutaran, rotasi, rasio layar 9:16 story & 16:9 layar lebar, serta filter visual.',
    howToUse: 'Pilih klip video, ubah kecepatan atau rasio aspek sesuai platform yang dituju, lalu klik Export Video.'
  },
  {
    id: 'videoTrimmer',
    name: 'Video Trimmer',
    tag: 'Pemotong Presisi',
    desc: 'Pangkas detik awal atau akhir klip videomu secara presisi tanpa menurunkan bitrate asli atau merusak kualitas audionya.',
    howToUse: 'Pilih video, geser penanda awal dan akhir untuk memilih potongan yang diinginkan, lalu klik Potong Video.'
  },
  {
    id: 'bgRemover',
    name: 'Hapus Background',
    tag: 'AI Background Remover',
    desc: 'Hapus latar belakang foto dalam satu kali klik menggunakan kecerdasan buatan untuk menghasilkan file PNG transparan rapi.',
    howToUse: 'Unggah gambar apapun yang memiliki subjek jelas, tunggu AI memisahkan latar belakang, lalu unduh PNG transparan.'
  },
  {
    id: 'resolver',
    name: 'Safelink & Link Resolver',
    tag: 'Bypass Link & Iklan',
    desc: 'Lewati safelink bertingkat (Sfl.gl, SafelinkU, Ouo, dll) langsung ke direct download (Mediafire, GDrive, Mega) dan ekstrak seluruh tautan bio Linktree instan.',
    howToUse: 'Tempel tautan safelink atau profil Linktree, klik Selesaikan Tautan, dan dapatkan link tujuan asli tanpa iklan jebakan.'
  },
  {
    id: 'animeFinder',
    name: 'Rekomendasi Anime',
    tag: 'Database MyAnimeList',
    desc: 'Jelajahi ribuan anime terbaik berdasarkan kombinasi genre favorit, skor rating MyAnimeList, poster visual HD, dan sinopsis lengkap.',
    howToUse: 'Pilih satu atau beberapa genre favorit, atur urutan rating, lalu klik cari untuk melihat sinopsis bilingual dan detail episode.'
  },
  {
    id: 'manhwaFinder',
    name: 'Rekomendasi Manhwa',
    tag: 'Komik Webtoon Korea',
    desc: 'Temukan komik Korea (Manhwa) terpopuler dengan filter genre, skor pembaca, cover jernih, dan rangkuman alur cerita seru.',
    howToUse: 'Pilih genre komik yang diminati, temukan judul populer dengan skor tertinggi, dan baca ringkasan sinopsisnya.'
  },
  {
    id: 'ipChecker',
    name: 'IP & DNS Checker',
    tag: 'Analisis Jaringan',
    desc: 'Cek telemetri IP publik, operator ISP, nomor ASN, koordinat lokasi, dan deteksi VPN/Proxy secara real-time.',
    howToUse: 'Buka fitur untuk melihat telemetri koneksimu secara otomatis, atau ketik alamat IP/domain lain untuk menganalisis jaringannya.'
  },
  {
    id: 'tiktokStalker',
    name: 'Social Media Stalker',
    tag: 'Multi-Platform OSINT',
    desc: 'Pantau profil, statistik followers, bio, dan postingan akun TikTok, Instagram, X (Twitter), dan GitHub secara 100% anonim tanpa login.',
    howToUse: 'Pilih platform (TikTok, Instagram, X, atau GitHub), masukkan username target, lalu klik Mulai Lacak Profil.'
  },
  {
    id: 'waViewOnce',
    name: 'WA View Once Vault',
    tag: 'WA Media Vault',
    desc: 'Tangkap dan simpan foto/video sekali lihat (View Once) dari nomor WhatsApp target secara real-time via perangkat tertaut.',
    howToUse: 'Tautkan perangkat dengan scan QR Code, masukkan nomor WA target yang ingin dipantau, lalu media sekali lihat akan otomatis tersimpan di galeri lokal browser.'
  },
  {
    id: 'codeToVideo',
    name: 'Code to Video Studio',
    tag: '3D Render & MP4 Video',
    desc: 'Ubah kode visual HTML/CSS/JS menjadi video animasi 3D sinematik dengan efek awan, partikel udara, dan ekspor MP4 langsung di browser.',
    howToUse: 'Pilih template animasi atau ketik kode HTML/Canvas kamu, sesuaikan rotasi 3D dan partikel di panel visual, lalu klik Mulai Render Video untuk mengunduh berkas MP4/WebM.'
  }
];
