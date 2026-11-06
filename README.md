# Kuro Studio - Technical Utility Suite

[![Node.js](https://img.shields.io/badge/Node.js-20.x-000000?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.x-000000?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.x-000000?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-000000?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Python](https://img.shields.io/badge/Python-3.11+-000000?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Vercel](https://img.shields.io/badge/Deployment-Vercel_Serverless-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/)
[![License](https://img.shields.io/badge/License-MIT-000000?style=flat-square&logo=opensourceinitiative&logoColor=white)](LICENSE)

Kuro Studio adalah suite utilitas digital multi-mesin yang dirancang dengan arsitektur hybrid modern: antarmuka web reaktif berbasis React dan Vite, lapisan serverless API berbasis Node.js pada Vercel, serta pekerja scraping berkecepatan tinggi berbasis Python. Sistem ini menggabungkan 13 modul produktivitas media, bypass proteksi tautan perantara, konversi dokumen kecerdasan buatan, dan CLI terintegrasi bernama `opkuro`.

---

## 1. Arsitektur Sistem

Arsitektur aplikasi terbagi menjadi tiga komponen utama yang terisolasi dan modular:

```text
+-----------------------------------------------------------------------------------+
|                                  Kuro Client UI                                   |
|             (React 18, Vite, Tailwind CSS, Neobrutalist Design System)            |
+-----------------------------------------------------------------------------------+
                                   |          |
                  HTTP / JSON API  |          |  Web Intent / Deep Links
                                   v          v
+----------------------------------------+  +---------------------------------------+
|          Edge & Serverless API         |  |         Platform Applications         |
|   (Vercel Functions / Node.js Engine)  |  |    (CapCut App, Alight Motion, dll)   |
+----------------------------------------+  +---------------------------------------+
        |                        |
        v                        v
+----------------------+  +---------------------------------------------------------+
| Dedicated Extractors |  |                 Python Backend Workers                  |
| (16 Social Scrapers) |  |   (Safelink Deobfuscation, Kasada Bypass, Deep Scrape)  |
+----------------------+  +---------------------------------------------------------+
```

### Karakteristik Arsitektur
1. **Desain Antarmuka Neobrutalist**: Border tegas 2px hitam, bayangan kontras tanpa blur (`shadow-[3px_3px_0px_#000000]`), layout fluid mobile-first, dan aksesibilitas keyboard lengkap.
2. **Kepatuhan Vercel Serverless (Hobby Plan)**: Seluruh endpoint terdistribusi dalam 10 serverless function mandiri (di bawah ambang batas 12 fungsi Hobby Plan) dengan durasi eksekusi maksimum 15 detik.
3. **Pemisahan Logika Proteksi**: Fitur administratif dilindungi oleh `EnvGuard` di tingkat middleware untuk memastikan repositori publik yang di-fork atau di-clone berjalan aman tanpa membocorkan credential internal.

---

## 2. Katalog Lengkap Modul Utilitas

Berikut adalah daftar modul yang tersedia pada Kuro Studio:

<!-- AUTO-FEATURES-START -->
| ID Fitur | Nama Alat | Kategori | Ringkasan Fungsi Teknis | Status Mesin |
|:---|:---|:---|:---|:---:|
| `downloader` | **Media Downloader** | All-in-One HD | Pengunduh serbaguna untuk mengunduh video, foto slide album, dan audio MP3 tanpa watermark dari TikTok, Instagram, YouTube, dan medsos lainnya dengan kualitas jernih hingga 4K serta opsi 1080p Status WA Anti-Burik agar tidak pecah saat di-upload. | Aktif |
| `jjFinder` | **Cari Link JJ** | Jedag-Jedug Viral | Temukan ribuan sound jedag-jedug viral, preset Alight Motion, dan backsound tren terbaru dengan tautan langsung siap pakai untuk konten kreatifmu. | Aktif |
| `pngToPdf` | **PNG to PDF** | Konversi Dokumen | Satukan banyak file gambar atau foto PNG dan JPG menjadi satu berkas PDF rapi dengan tata letak proporsional dan kualitas visual tajam. | Aktif |
| `linkToDoc` | **Link to PDF/PPT** | Ekstraktor Materi | Ekstrak dokumen kuliah dan materi presentasi dari Scribd atau SlideShare menjadi berkas PDF atau PPT utuh langsung dari tautan web. | Aktif |
| `imageToLink` | **File ke Link** | Hosting Instan | Unggah foto dari perangkatmu dan dapatkan tautan URL publik instan berkecepatan tinggi untuk dibagikan ke mana saja. | Aktif |
| `compressor` | **Kompres Media HD** | Hemat Memori | Kecilkan ukuran file video dan gambar secara drastis tanpa membuat visual pecah atau burik, sangat hemat kuota dan memori. | Aktif |
| `qrStudio` | **QR Code Studio** | Desain Kustom | Studio pembuat kode QR estetik dengan logo kustom, pewarnaan neobrutalist fleksibel, dan resolusi tinggi yang siap dipindai. | Aktif |
| `audioMerger` | **Audio Merger** | Kombinasi Suara | Gabungkan beberapa trek audio atau musik menjadi satu kesatuan alunan utuh dengan perpindahan lagu yang mulus dan jernih. | Aktif |
| `photoStudio` | **Photo Studio** | Filter & Efek | Editor foto instan dengan ragam filter neobrutalist, rotasi, penyesuaian kontras, serta efek grafis artistik untuk mempercantik gambarmu. | Aktif |
| `videoStudio` | **Video Studio** | Studio Kreatif | Editor video praktis untuk mengatur kecepatan pemutaran, mengubah rasio layar 9:16 untuk story dan 16:9 untuk layar lebar, serta filter visual. | Aktif |
| `videoTrimmer` | **Video Trimmer** | Pemotong Presisi | Pangkas detik awal atau akhir klip videomu secara akurat tanpa menurunkan bitrate asli atau merusak kualitas audionya. | Aktif |
| `bgRemover` | **Hapus Background** | AI Background Remover | Hapus latar belakang foto dalam satu kali klik menggunakan kecerdasan AI untuk menghasilkan file PNG transparan yang rapi dan presisi. | Aktif |
| `resolver` | **Safelink & Link Resolver** | Bypass Link & Iklan | Lewati tautan safelink bertingkat (seperti Sfl.gl, SafelinkU, Ouo, Bitly, dll), lewati hitungan detik dan halaman iklan membingungkan untuk langsung mengambil link unduhan asli (Mediafire, Google Drive, Mega, dll) secara instan dan aman. | Aktif |
<!-- AUTO-FEATURES-END -->

### Detail Spesifikasi Modul Inti

#### A. Media Downloader (16 Platform)
Mendukung ekstraksi video resolusi tinggi (hingga 4K Ultra HD), audio MP3 320kbps, dan album carousel multi-slide dari 16 penyedia konten:
- **Platform yang Didukung**: TikTok, Instagram, YouTube, X (Twitter), Spotify, Bilibili, Douyin, Rednote (Xiaohongshu), Threads, Pinterest, Facebook, CapCut, SoundCloud, SnackVideo, Likee, dan Dailymotion.
- **Preset Khusus**: Opsi unduhan 1080p Status WA Anti-Burik dengan optimalisasi kompresi agar tidak mengalami degradasi kualitas saat diunggah ke status WhatsApp.

#### B. Safelink & Shortlink Resolver
Menembus rantai pengalihan berlapis dan timer penundaan iklan:
- **Mekanisme Ekstraksi**: Evaluasi HTTP redirect header (301, 302, 307), parsing DOM HTML untuk script pengalihan (meta refresh, window.location, countdown redirect), dan dekoder payload Base64 otomatis.
- **Dukungan Agregator Bio**: Mendeteksi halaman bio seperti Linktree (`linktr.ee`), mengumpulkan seluruh tautan anak secara agregat, dan menyajikan opsi batch download atau penyalinan sekaligus.

#### C. Cari Link JJ (Jedag-Jedug & CapCut Deep Linking)
Pencari template dan audio pengiring untuk kreator video pendek:
- **Deep Linking Native**: Mengintegrasikan skema URL `capcut://template/detail?template_id={id}&enter_from=template` untuk langsung meluncurkan aplikasi CapCut di perangkat pengguna.
- **Fallback Otomatis**: Jika aplikasi tidak terpasang atau pengguna menggunakan desktop, sistem melakukan fallback otomatis dalam 1.2 detik ke antarmuka web browser.

#### D. Link to Document & Slides
Ekstraktor dokumen materi kuliah dan presentasi:
- **Bypass Proteksi Baca**: Mengunduh dan merekonstruksi dokumen utuh dari Scribd, Canva, dan SlideShare tanpa terhalang paywall login.
- **Pilihan Ekspor**: Mendukung konversi langsung ke format PDF standar penerbitan atau berkas presentasi PPTX yang dapat diedit langsung.

---

## 3. Kuro Command Line Interface (opkuro)

Kuro Studio menyediakan perkakas CLI global `opkuro` untuk meluncurkan antarmuka web, mengelola konfigurasi, dan memicu server lokal langsung dari terminal.

### Instalasi Global
Jalankan salah satu metode berikut:

```bash
# Melalui npm global link dari repositori lokal
npm link

# Atau jalankan installer otomatis (Linux/macOS)
curl -fsSL https://raw.githubusercontent.com/itsvin-debug/AllToolsKuro/main/install.sh | bash

# Atau jalankan installer otomatis (Windows PowerShell)
irm https://raw.githubusercontent.com/itsvin-debug/AllToolsKuro/main/install.ps1 | iex
```

### Penggunaan CLI
```bash
# Buka Kuro Studio di web browser lokal
opkuro

# Buka Kuro Studio versi cloud production
opkuro --cloud

# Menampilkan versi CLI terpasang
opkuro --version

# Menampilkan bantuan parameter
opkuro --help
```

Setiap pemanggilan `opkuro` akan memeriksa rilis pembaruan terbaru secara asinkron di latar belakang tanpa menghambat alur kerja utama pengguna.

---

## 4. Panduan Menjalankan Repositori Lokal

### Prasyarat
- Node.js versi 20.x atau lebih baru
- Python versi 3.11 atau lebih baru (opsional untuk worker deep-scraping)
- Git

### Langkah Instalasi
```bash
# 1. Kloning repositori
git clone https://github.com/itsvin-debug/AllToolsKuro.git
cd AllToolsKuro

# 2. Pasang dependensi pada root dan frontend
npm install
npm --prefix frontend install
npm --prefix backend install

# 3. Konfigurasi Environment Variables
cp .env.example .env
cp .env.example frontend/.env

# 4. Jalankan aplikasi dalam mode pengembangan
npm run dev
```

Aplikasi frontend akan aktif di `http://localhost:5173` dan server backend lokal akan berjalan di `http://localhost:5001`.

---

## 5. Sistem Proteksi Repositori Publik (Env Guard)

Repositori ini menerapkan sistem keamanan `EnvGuard` (`backend/src/middlewares/envGuard.js` dan `api/_envGuard.js`):
- Saat dijalankan pada mode kloning publik (tanpa `ADMIN_PASSWORD` atau `KURO_ADMIN_SECRET`), seluruh endpoint mutasi administratif (`/api/admin/*`, `/api/locked-tools`) otomatis terkunci dengan respons `403 Forbidden` terstandarisasi.
- Seluruh verifikasi kredensial divalidasi secara kriptografis di sisi server; tidak ada password, secret token, atau kunci enkripsi yang tertanam pada bundle JavaScript sisi klien.

---

## 6. Pohon Direktori Repositori

Struktur organisasi berkas utama proyek:

<!-- AUTO-TREE-START -->
```text
AllToolsKuro/
├── .kilo/
│   ├── .gitignore
│   └── agent-manager.json
├── api/
│   ├── _envGuard.js
│   ├── _security.js
│   ├── chat.js
│   ├── download.js
│   ├── jj-finder.js
│   ├── link-to-doc.js
│   ├── locked-tools.js
│   ├── ping.js
│   ├── proxy-doc-image.js
│   ├── proxy-download.js
│   ├── proxy-stream.js
│   └── resolve.js
├── backend/
│   ├── bin/
│   │   └── yt-dlp.exe
│   ├── src/
│   │   ├── controllers/
│   │   ├── middlewares/
│   │   ├── routes/
│   │   ├── services/
│   │   └── server.js
│   ├── uploads/
│   │   ├── temp/
│   │   └── .gitkeep
│   ├── package-lock.json
│   └── package.json
├── backend-python/
│   ├── __pycache__/
│   │   └── app.cpython-314.pyc
│   ├── services/
│   │   ├── __pycache__/
│   │   ├── jj_service.py
│   │   └── resolver_service.py
│   ├── static/
│   │   ├── index.html
│   │   ├── script.js
│   │   └── style.css
│   ├── app.py
│   ├── requirements.txt
│   ├── script_jj.py
│   └── script_resolver.py
├── bin/
│   └── opkuro.js
├── frontend/
│   ├── public/
│   │   ├── videos/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── App.css
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── .gitignore
│   ├── .oxlintrc.json
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── README.md
│   └── vite.config.js
├── scripts/
│   ├── audit-secrets.js
│   └── generate-readme.js
├── .gitignore
├── .vercelignore
├── AGENTS.md
├── GEMINI.md
├── install.ps1
├── install.sh
├── package-lock.json
├── package.json
├── README.md
├── start-dev.js
└── vercel.json
```
<!-- AUTO-TREE-END -->

---

## 7. Catatan Pembaruan (Changelog)

5 riwayat pembaruan commit terakhir pada repositori:

<!-- AUTO-CHANGELOG-START -->
- [4ed5e96] chore: remove bot workflow to maintain solo developer contribution history (2026-11-06)
- [cc9ec02] feat: complete security audit, global CLI opkuro, env guard, dynamic zero-emoji docs, and UI fixes (2026-11-06)
- [a3db3e5] feat: add Python script and JJ preset service for video extraction (2026-11-06)
- [b9ebd6b] fix(all): resolve sfl bypass, 4-layer jj preset engine, clean downloader video preview & universal paste (2026-11-06)
- [4b9ad9e] feat(resolver): implement hybrid python and js gateway with multi-link aggregator and deep scan (2026-11-06)
<!-- AUTO-CHANGELOG-END -->

---

## 8. Lisensi

Proyek ini didistribusikan di bawah lisensi terbuka [MIT License](LICENSE). Seluruh hak cipta modul, desain neobrutalist, dan implementasi kode dilindungi.
