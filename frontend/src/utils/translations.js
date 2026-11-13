/**
 * Kuro Studio - Bilingual Translations (ID / EN)
 * Kamus teks lengkap untuk antarmuka dwibahasa (Bahasa Indonesia & English).
 * Mencakup seluruh halaman, kartu identitas, alat utilitas, dan menu pengaturan Photo 2.
 */

export const translations = {
  id: {
    nav: {
      home: 'Beranda',
      gallery: 'Galeri',
      history: 'Riwayat',
      settings: 'Pengaturan',
      search: 'Cari',
      downloadApk: 'Unduh APK',
      backToHome: 'Kembali ke Beranda',
      switchTool: 'Beralih Alat',
      tagline: 'Multi-Tool Platform'
    },
    identity: {
      creatorName: 'Nama Kreator',
      deviceUser: 'Pengguna Perangkat',
      enterUsername: 'Ketik nama Anda di sini...',
      inputUsername: 'MASUKKAN NAMA PENGGUNA',
      deviceDetected: '1 Perangkat Terdeteksi',
      save: 'Simpan',
      saved: 'Tersimpan',
      edit: 'Ubah',
      status: 'Status',
      online: 'ONLINE',
      region: 'Region',
      device: 'Perangkat',
      battery: 'Baterai',
      charging: 'CAS',
      batteryActive: 'AKTIF',
      network: 'Network',
      detecting: 'Mendeteksi...',
      deviceTime: 'Jam',
      role: 'Role',
      member: 'MEMBER',
      admin: 'ADMIN',
      login: 'Login',
      searchPlaceholder: 'Cari alat di Kuro Studio (Media Downloader, PDF, QR Code, Kompres...)',
      whatsappChannel: 'Saluran WhatsApp',
      tiktokChannel: 'TT @kazexy1 (TikTok)',
      githubRepo: 'GitHub Repo',
      adminModalTitle: 'Masuk Role Admin',
      adminModalDesc: 'Masukkan kata sandi admin untuk mengelola izin akses khusus.',
      adminPasswordPlaceholder: 'Ketik kata sandi admin...',
      adminCancel: 'Batal',
      adminSubmit: 'Verifikasi Sandi',
      adminWrongPass: 'Kata sandi admin salah. Akses role Admin ditolak.'
    },
    welcome: {
      mainTools: 'DAFTAR ALAT UTAMA',
      toolsCount: 'ALAT',
      subtitle: 'Pilih alat utilitas yang ingin digunakan. Setiap alat membuka halaman kerja khusus.',
      resetSearch: 'Reset Pencarian',
      catAll: 'Semua Alat',
      catDownloader: 'Downloader',
      catFile: 'Konversi & File',
      catCreative: 'Studio & Kreatif',
      catUtility: 'Utilitas & WA',
      tools: {
        downloader: {
          name: 'Media Downloader',
          desc: 'Unduh video HD, foto slide, dan audio tanpa watermark dari 16 platform medsos.',
          tag: '16 PLATFORM'
        },
        jjFinder: {
          name: 'Cari Link JJ',
          desc: 'Template XML dan preset 5MB TikTok jedag-jedug untuk Alight Motion.',
          tag: 'SOSMED'
        },
        pngToPdf: {
          name: 'PNG to PDF',
          desc: 'Satukan multi-foto menjadi dokumen PDF dengan kustomisasi teks dan layout tipografi.',
          tag: 'MULTI-IMG'
        },
        linkToDoc: {
          name: 'Link to PDF & PPT',
          desc: 'Konversi tautan dokumen web menjadi dokumen PDF dan presentasi PPTX terstruktur.',
          tag: 'DOC & PPTX'
        },
        imageToLink: {
          name: 'File ke Link',
          desc: 'Unggah foto, video, dan PDF untuk dijadikan tautan URL publik yang dapat diakses langsung.',
          tag: 'UNIVERSAL'
        },
        compressor: {
          name: 'Kompres Media & PDF',
          desc: 'Optimasi ukuran file gambar, video, dan dokumen PDF tanpa merusak ketajaman visual atau tata letak teks.',
          tag: 'MEDIA & PDF'
        },
        qrStudio: {
          name: 'QR Code Studio',
          desc: 'Desain kode QR kustom dengan logo dan frame panggilan aksi untuk berbagai kebutuhan.',
          tag: 'CUSTOM QR'
        },
        audioMerger: {
          name: 'Audio Merger',
          desc: 'Satukan dan potong menit atau detik beberapa lagu audio dalam satu linimasa.',
          tag: 'TIMELINE'
        },
        photoStudio: {
          name: 'Photo Studio',
          desc: 'Pertajam foto, atur kontras hitam putih, dan sesuaikan resolusi gambar.',
          tag: 'STUDIO HD'
        },
        videoStudio: {
          name: 'Video Studio',
          desc: 'Editor filter visual video untuk penyesuaian kecerahan, saturasi, dan efek gerak.',
          tag: 'FX STUDIO'
        },
        videoTrimmer: {
          name: 'Video Trimmer',
          desc: 'Potong durasi video dari titik awal ke akhir tanpa kompresi ulang kualitas.',
          tag: 'LOSSLESS'
        },
        bgRemover: {
          name: 'Hapus Background',
          desc: 'Ekstraksi subjek foto dan logo untuk menghasilkan gambar transparan format PNG.',
          tag: 'PNG HD'
        },
        resolver: {
          name: 'Safelink Resolver',
          desc: 'Lewati safelink bertingkat (Sfl.gl, SafelinkU, dll), lewati iklan & countdown langsung ke link file asli (Mediafire, Drive, dll).',
          tag: 'BYPASS'
        },
        animeFinder: {
          name: 'Rekomendasi Anime',
          desc: 'Jelajahi rekomendasi dan cari anime berdasarkan saringan multi-genre, rating skor, dan sinopsis.',
          tag: 'ANIME HD'
        },
        manhwaFinder: {
          name: 'Rekomendasi Manhwa',
          desc: 'Koleksi dan kurasi manhwa Korea terpopuler dengan filter genre, rating, cover, dan sinopsis cerita.',
          tag: 'MANHWA'
        },
        ipChecker: {
          name: 'IP & DNS Checker',
          desc: 'Analisis telemetri IP publik, operator ISP, nomor ASN, koordinat lokasi, dan deteksi VPN/Proxy.',
          tag: 'NETWORK'
        }
      }
    },
    gallery: {
      title: 'Galeri Hasil Karya',
      subtitle: 'Semua berkas, hasil unduhan, dan kreasi Anda tersimpan secara lokal di sini.',
      filterAll: 'Semua Berkas',
      filterSlide: 'Slide Media',
      filterImage: 'Gambar & QR',
      filterVideo: 'Video & JJ',
      filterDoc: 'Dokumen',
      filterAudio: 'Audio',
      emptyTitle: 'Belum Ada Berkas di Galeri',
      emptyDesc: 'Kreasi seperti unduhan media, QR Code, dan dokumen yang Anda buat akan muncul di sini secara otomatis.',
      exploreTools: 'Jelajahi Alat Sekarang',
      redownload: 'Unduh Ulang',
      delete: 'Hapus',
      downloadSuccess: 'Mulai mengunduh berkas...',
      itemDeleted: 'Berkas dihapus dari galeri.',
      itemsCount: 'berkas tersimpan',
      downloadCurrentSlide: 'Unduh Slide Ini',
      downloadAllSlides: 'Unduh Semua Slide (ZIP)'
    },
    history: {
      title: 'Riwayat Penggunaan',
      subtitle: 'Pantau alat dan fitur yang pernah Anda gunakan di perangkat ini.',
      filterAll: 'Semua',
      filterToday: 'Hari Ini',
      filterOlder: 'Sebelumnya',
      emptyTitle: 'Belum Ada Riwayat',
      emptyDesc: 'Aktivitas penggunaan alat utilitas Kuro Studio akan tercatat secara otomatis di sini.',
      clearAll: 'Bersihkan Riwayat',
      clearConfirm: 'Apakah Anda yakin ingin menghapus seluruh riwayat?',
      cleared: 'Riwayat aktivitas telah dibersihkan.',
      reopenTool: 'Buka Alat Ini',
      justNow: 'Baru saja',
      minutesAgo: 'menit lalu',
      hoursAgo: 'jam lalu',
      daysAgo: 'hari lalu'
    },
    settings: {
      title: 'PENGATURAN',
      subtitle: 'Sesuaikan preferensi dan pengalaman Anda',
      searchPlaceholder: 'Temukan konten terkait & preferensi...',
      
      // 6 Kartu Kategori Utama
      secGeneral: {
        title: 'UMUM',
        subtitle: 'Bahasa, Otomasi Input & Keamanan Aplikasi'
      },
      secLookFeel: {
        title: 'TAMPILAN & TEMA',
        subtitle: 'Tema, Font, Animasi & Efek Visual'
      },
      secStorage: {
        title: 'PENYIMPANAN & UNDUHAN',
        subtitle: 'Lokasi Simpan, Penamaan File & Isolasi Data'
      },
      secNetwork: {
        title: 'JARINGAN & PERFORMA',
        subtitle: 'Server, Koneksi, Latensi & Percobaan Ulang'
      },
      secAdvanced: {
        title: 'LANJUTAN',
        subtitle: 'Retensi Riwayat, Pemutar Media & Reset'
      },
      secAbout: {
        title: 'TENTANG & BANTUAN',
        subtitle: 'Versi, Bantuan, dan Tautan Pengembang'
      },

      // Konten General
      languageTitle: 'Bahasa Antarmuka (Language)',
      languageDesc: 'Pilih bahasa tampilan yang Anda sukai untuk seluruh halaman Kuro Studio.',
      langIndonesian: 'Bahasa Indonesia',
      langEnglish: 'English (US)',
      inputAutoTitle: 'Otomasi Input URL',
      inputAutoDesc: 'Otomatis fokus pada kolom input dan mempermudah penempelan tautan.',
      appSecurityTitle: 'Keamanan Sesi & Privasi',
      appSecurityDesc: 'Enkripsi data sesi lokal dan lindungi riwayat unduhan pada perangkat publik.',

      // Konten Look & Feel
      darkModeTitle: 'Mode Gelap (Dark Mode)',
      darkModeDesc: 'Tampilan kontras tinggi bertema gelap monokrom.',
      compactModeTitle: 'Mode Ringkas (Compact Mode)',
      compactModeDesc: 'Rapatkan jarak spasi antar-card untuk layar kecil.',
      fontTitle: 'Font Aplikasi',
      fontDesc: 'Pilih tipografi utama untuk tampilan antarmuka web.',
      textSizeTitle: 'Ukuran Teks Antarmuka',
      textSizeDesc: 'Sesuaikan skala keterbacaan teks agar nyaman di mata Anda.',
      textSizeSmall: 'Kecil',
      textSizeNormal: 'Default',
      textSizeLarge: 'Besar',
      animSpeedTitle: 'Kecepatan Animasi',
      animSpeedDesc: 'Atur ritme transisi antarmuka dan interaksi elemen.',
      animFast: 'Cepat (0.5x)',
      animNormal: 'Normal (1x)',
      animRelaxed: 'Santai (1.5x)',
      cornerStyleTitle: 'Gaya Sudut Card (Border Radius)',
      cornerStyleDesc: 'Pilih bentuk kelengkungan sudut card dan tombol neobrutalism.',
      cornerRounded: 'Modern (Bulat)',
      cornerSharp: 'Brutalist (Lancip)',
      cornerSoft: 'Soft (Halus)',

      // Border & Bayangan Neobrutalisme
      borderThicknessTitle: 'Ketebalan Garis Border (Border Thickness)',
      borderThicknessDesc: 'Atur ketebalan garis tepi neobrutalism pada kartu dan tombol.',
      borderThin: 'Thin (1px)',
      borderNormal: 'Normal (2px - Default)',
      borderHeavy: 'Heavy (4px)',
      shadowOffsetTitle: 'Offset Bayangan Keras (Hard Shadow Offset)',
      shadowOffsetDesc: 'Pilih kedalaman bayangan tajam tanpa blur khas gaya Neobrutalisme.',
      shadowFlat: 'Flat (No Shadow)',
      shadowHard: 'Hard Offset (4px 4px)',
      shadowDeep: 'Deep Offset (8px 8px)',

      // Efek Visual Latar Belakang
      backgroundFxTitle: 'Efek Visual Latar (Background Particles / FX)',
      backgroundFxDesc: 'Pilih animasi partikel atau suasana latar belakang yang tampil di balik layar.',
      bgFxSakura: 'Sakura Falling (Default)',
      bgFxGrid: 'Cyber Grid',
      bgFxOff: 'Off / Minimal',
      powerSavingTitle: 'Matikan Semua Animasi (Mode Hemat Daya)',
      powerSavingDesc: 'Nonaktifkan seluruh animasi dan efek latar untuk performa maksimal dan hemat baterai.',

      // Warna Aksen
      accentColorTitle: 'Warna Aksen Sorotan (Accent Highlight Color)',
      accentColorDesc: 'Beri warna aksen kontras tinggi pada tombol dan lencana yang sedang aktif.',
      accentMonochrome: 'Monokrom (Hitam/Putih - Default)',
      accentYellow: 'Cyber Yellow (#FFE600)',
      accentPink: 'Neobrutalist Pink (#FF76CE)',
      accentMint: 'Neon Mint (#00F5D4)',

      hideAnimationsTitle: 'Matikan Animasi Latar (Hemat Baterai)',
      hideAnimationsDesc: 'Sembunyikan animasi sakura gugur & partikel agar performa super ringan.',

      // Konten Storage & Download
      deviceIdTitle: 'ID Klien Perangkat Ini',
      deviceIdDesc: 'ID unik permanen ini mengisolasi galeri dan riwayat khusus untuk perangkat Anda.',
      showGalleryTitle: 'Tampilkan Tab Galeri di Navbar',
      showGalleryDesc: 'Tampilkan atau sembunyikan pintasan tab Galeri pada navigasi.',
      showHistoryTitle: 'Tampilkan Tab Riwayat di Navbar',
      showHistoryDesc: 'Tampilkan atau sembunyikan pintasan tab Riwayat pada navigasi.',
      clearGalleryTitle: 'Bersihkan Galeri Perangkat',
      clearGalleryDesc: 'Hapus seluruh kreasi dan berkas yang tersimpan di memori perangkat ini.',
      clearGalleryBtn: 'Bersihkan Galeri',
      clearGalleryConfirm: 'Apakah Anda yakin ingin menghapus semua berkas galeri lokal pada perangkat ini?',
      galleryClearedMsg: 'Galeri perangkat telah dibersihkan.',

      // Konten Network & Performance
      currentLatencyTitle: 'Latensi Jaringan Saat Ini',
      currentLatencyDesc: 'Metrik kecepatan transmisi paket data antara perangkat Anda dan server.',
      engineTitle: 'Dual Engine Processing',
      engineDesc: 'Pemrosesan otomatis menggunakan Backend FFmpeg dengan fallback Client-Side Browser.',
      offlineModeTitle: 'Kesiapan Mode Luring',
      offlineModeDesc: 'Alat seperti pemotong video, studio foto, dan QR dapat berjalan mandiri di browser.',

      // Konten Advanced
      historyLimitTitle: 'Batas Retensi Riwayat',
      historyLimitDesc: 'Menyimpan hingga 50 entri aktivitas terakhir pada perangkat ini secara otomatis.',
      mediaAutoplayTitle: 'Putar Otomatis Media di Galeri',
      mediaAutoplayDesc: 'Putar otomatis video dan audio saat modal pratinjau dibuka.',
      factoryResetTitle: 'Kembalikan Pengaturan ke Bawaan Pabrik',
      factoryResetDesc: 'Pulihkan seluruh tema, font, dan preferensi ke setelan standar Kuro Studio.',
      factoryResetBtn: 'Reset Pengaturan',
      factoryResetConfirm: 'Apakah Anda yakin ingin mereset semua pengaturan ke setelan bawaan pabrik?',
      factoryResetSuccessMsg: 'Semua pengaturan berhasil dipulihkan ke bawaan.',

      // Konten About & Help
      versionTitle: 'Versi Web',
      versionBadge: 'v2.5.0 (Stable Release)',
      versionDesc: 'Kuro Studio Multi-Tool Suite edisi produksi dengan arsitektur modular.',
      helpTitle: 'Bantuan & FAQ Singkat',
      help1Q: 'Bagaimana cara mengunduh media tanpa watermark?',
      help1A: 'Salin tautan dari aplikasi TikTok/Instagram, buka Media Downloader, tempel tautan, lalu klik Unduh HD.',
      help2Q: 'Apakah data saya bisa dilihat oleh perangkat lain?',
      help2A: 'Tidak bisa. Sistem Kuro Studio menggunakan isolasi Device ID mandiri, data setiap HP atau komputer terpisah 100%.',
      devLinksTitle: 'Tautan Pengembang & Komunitas',
      devLinksDesc: 'Terhubung langsung dengan kreator dan repositori sumber terbuka Kuro Studio.',
      linkWhatsapp: 'Saluran WhatsApp Resmi',
      linkTiktok: 'TikTok (@kazexy1)',
      linkGithub: 'Repositori GitHub (Source Code)'
    },
    toasts: {
      galleryHidden: 'Tab Galeri disembunyikan',
      galleryVisible: 'Tab Galeri ditampilkan',
      historyHidden: 'Tab Riwayat disembunyikan',
      historyVisible: 'Tab Riwayat ditampilkan',
      darkModeOn: 'Mode gelap diaktifkan',
      darkModeOff: 'Mode terang diaktifkan',
      compactModeOn: 'Mode ringkas diaktifkan',
      compactModeOff: 'Mode normal diaktifkan',
      animationsOff: 'Animasi latar dimatikan untuk performa hemat',
      animationsOn: 'Animasi diaktifkan kembali',
      fontChanged: 'Font aplikasi diubah ke',
      textSizeChanged: 'Ukuran teks diatur ke',
      cornerChanged: 'Gaya sudut diubah ke',
      borderChanged: 'Ketebalan border diatur ke',
      shadowChanged: 'Offset bayangan diatur ke',
      bgFxChanged: 'Efek latar diatur ke',
      accentChanged: 'Warna aksen sorotan diatur ke',
      langSwitched: 'Bahasa berhasil diubah ke Bahasa Indonesia',
      inputAutoToggled: 'Pengaturan otomasi input diperbarui',
      securityToggled: 'Pengaturan keamanan sesi diperbarui'
    },
    downloader: {
      title: 'MEDIA DOWNLOADER',
      subtitle: 'Unduh video definisi tinggi, kumpulan slide foto, dan trek audio tanpa watermark dari 16 platform media sosial dan konten streaming. Pilih platform di bawah, tempelkan tautan yang valid, lalu unduh secara langsung.',
      platformsAvailable: '16 PLATFORM TERSEDIA',
      choosePlatform: 'PILIH PLATFORM MEDIA',
      activeStatus: 'AKTIF',
      downloadMediaPrefix: 'UNDUH MEDIA',
      pasteButton: 'Tempel',
      downloadButton: 'Unduh Media',
      processingButton: 'Memproses Media...',
      emptyUrlError: 'Silakan tempelkan tautan media terlebih dahulu.',
      invalidDomainError: 'Tautan tidak cocok dengan domain resmi {name}. Pastikan URL memuat domain {domains}.',
      switchSuggestion: 'Tautan ini terdeteksi dari {suggested}. Beralih ke platform {suggested}?',
      switchButton: 'Beralih Platform',
      platforms: {
        tiktok: {
          badge: 'Video & Slide',
          placeholder: 'Tempel link video atau slide TikTok (vt.tiktok.com atau tiktok.com/@user/...)',
          hint: 'Mendukung video HD tanpa watermark dan kumpulan slide gambar TikTok.'
        },
        instagram: {
          badge: 'Reels & Post',
          placeholder: 'Tempel link Reels, Carousel, atau Foto IG (instagram.com/reel/... atau /p/...)',
          hint: 'Mendukung video Reels, postingan carousel multi-foto, dan foto resolusi tinggi.'
        },
        youtube: {
          badge: 'Shorts & MP3',
          placeholder: 'Tempel link video atau Shorts (youtube.com/watch?v=... atau youtu.be/...)',
          hint: 'Mendukung video reguler, YouTube Shorts, serta konversi audio MP3.'
        },
        twitter: {
          badge: 'Tweet Video',
          placeholder: 'Tempel link postingan tweet video (x.com/.../status/... atau twitter.com/...)',
          hint: 'Mendukung unduhan file MP4 kualitas master dari postingan video di platform X.'
        },
        spotify: {
          badge: 'Audio Trek',
          placeholder: 'Tempel link lagu atau album Spotify (open.spotify.com/track/...)',
          hint: 'Ekstrak metadata lagu, cover album resolusi penuh, dan trek audio.'
        },
        bilibili: {
          badge: 'Anime & HD',
          placeholder: 'Tempel link video Bilibili (bilibili.com/video/... atau b23.tv/...)',
          hint: 'Unduh klip anime dan konten video streaming Bilibili tanpa penurunan resolusi.'
        },
        douyin: {
          badge: 'Video China',
          placeholder: 'Tempel link video Douyin (douyin.com/video/... atau iesdouyin.com/...)',
          hint: 'Unduh video original Douyin tanpa watermark langsung dalam format MP4.'
        },
        rednote: {
          badge: 'Xiaohongshu',
          placeholder: 'Tempel link postingan Rednote / Xiaohongshu (xhslink.com/... atau xiaohongshu.com/...)',
          hint: 'Unduh album foto lifestyle dan video pendek resolusi tinggi dari Xiaohongshu.'
        },
        threads: {
          badge: 'Post Media',
          placeholder: 'Tempel link postingan Threads (threads.net/@user/post/...)',
          hint: 'Unduh konten video dan lampiran gambar resolusi penuh dari Threads.'
        },
        pinterest: {
          badge: 'Pins & Foto',
          placeholder: 'Tempel link Pin Pinterest (pinterest.com/pin/... atau pin.it/...)',
          hint: 'Unduh foto inspirasi resolusi ultra tinggi dan video Pin original.'
        },
        appleMusic: {
          badge: 'Artwork & Audio',
          placeholder: 'Tempel link album/lagu Apple Music (music.apple.com/...)',
          hint: 'Ekstrak cover artwork resolusi tinggi dan pratinjau trek audio lossless.'
        },
        facebook: {
          badge: 'Reels & Video',
          placeholder: 'Tempel link video/Reels FB (facebook.com/reel/... atau /watch/...)',
          hint: 'Unduh video publik Facebook kualitas HD MP4 secara instan.'
        },
        bandcamp: {
          badge: 'Musik Lossless',
          placeholder: 'Tempel link trek Bandcamp (artist.bandcamp.com/track/...)',
          hint: 'Unduh trek audio berkualitas tinggi dan artwork cover album musisi indie.'
        },
        pixiv: {
          badge: 'Artwork Ilustrasi',
          placeholder: 'Tempel link karya Pixiv (pixiv.net/artworks/...)',
          hint: 'Unduh ilustrasi anime, manga, dan karya seni digital kualitas asli.'
        },
        reddit: {
          badge: 'Video & Post',
          placeholder: 'Tempel link postingan Reddit (reddit.com/r/.../comments/...)',
          hint: 'Unduh video Reddit lengkap dengan audio tersinkronisasi dalam format MP4.'
        },
        terabox: {
          badge: 'Cloud Media',
          placeholder: 'Tempel link unduhan Terabox (terabox.com/s/... atau 1024tera.com/...)',
          hint: 'Akses dan unduh berkas video cloud media langsung tanpa aplikasi tambahan.'
        }
      }
    },
    audioMerger: {
      studioBadge: 'Multi-Track Timeline Studio',
      title: 'Penggabungan Audio & Video',
      subtitle: 'Gabungkan video dengan lagu favorit atau satukan beberapa track audio. Tonton dan dengarkan langsung hasilnya sebelum mengunduh.',
      trackListHeader: 'Daftar Track',
      trackListSubtitle: 'Atur durasi potong (menit & detik), volume, dan tonton/dengarkan preview tiap track.',
      addTrackBtn: 'Tambah Audio / Video',
      emptyTracksTitle: 'Belum Ada Media yang Ditambahkan',
      emptyTracksDesc: 'Klik tombol di atas untuk memasukkan file Video (MP4, WebM) atau Audio (MP3, WAV, M4A).',
      startLabel: 'Mulai (Menit : Detik)',
      endLabel: 'Selesai (Menit : Detik)',
      volumeLabel: 'Volume',
      durationLabel: 'Durasi Potongan',
      testClipBtn: 'Tes Dengar',
      testVideoBtn: 'Pratinjau Video',
      moveUp: 'Geser ke Atas',
      moveDown: 'Geser ke Bawah',
      deleteTrack: 'Hapus Track',
      mergeBtn: 'Satukan & Gabungkan Sekarang',
      mergingBtn: 'Menggabungkan Media via FFmpeg...',
      successTitle: 'Media Berhasil Digabungkan!',
      successSubtitleVideo: 'Video dan audio Anda telah berhasil digabungkan menjadi file MP4 baru.',
      successSubtitleAudio: 'Track audio Anda telah berhasil digabungkan menjadi file MP3 master.',
      outputPreviewTitle: 'Pratinjau Hasil Penggabungan',
      outputPreviewSubtitle: 'Tonton atau dengarkan hasil sebelum mengunduh berkas ke perangkat Anda.',
      downloadVideoBtn: 'Unduh Video MP4',
      downloadAudioBtn: 'Unduh Audio MP3'
    },
    pngToPdf: {
      badge: 'Word & Docs Style Layout Engine',
      title: 'PNG to PDF & Word Studio',
      subtitle: 'Atur foto dan teks secara terstruktur layaknya dokumen Word/Docs, lengkapi dengan toolbar tipografi, dan ekspor menjadi PDF.',
      addPhotos: 'Tambah Foto / Gambar',
      paperFormat: 'Ukuran Kertas',
      orientationPortrait: 'Potret (Tegak)',
      orientationLandscape: 'Lanskap (Mendatar)',
      marginNormal: 'Margin Normal',
      marginNarrow: 'Margin Sempit',
      marginWide: 'Margin Lebar',
      showPageNumbers: 'Nomor Halaman',
      toolbarFont: 'Font Dokumen',
      toolbarSize: 'Ukuran Font',
      toolbarBold: 'Tebal (Bold)',
      toolbarItalic: 'Miring (Italic)',
      toolbarUnderline: 'Garis Bawah (Underline)',
      toolbarStrike: 'Coret (Strikethrough)',
      toolbarCase: 'Ubah Huruf (Case)',
      toolbarColor: 'Warna Teks',
      toolbarHighlight: 'Sorot Warna (Highlight)',
      toolbarBullet: 'Daftar Poin (Bullets)',
      toolbarNumber: 'Daftar Angka (Numbers)',
      toolbarAlignLeft: 'Rata Kiri',
      toolbarAlignCenter: 'Rata Tengah',
      toolbarAlignRight: 'Rata Kanan',
      toolbarJustify: 'Rata Kanan-Kiri (Justify)',
      styleNormal: 'Teks Normal',
      styleHeading1: 'Judul 1 (Heading 1)',
      styleHeading2: 'Judul 2 (Heading 2)',
      styleHeading3: 'Judul 3 (Heading 3)',
      textPlaceholder: 'Ketik atau tempel teks dokumen di sini...',
      generatePdfBtn: 'Ekspor Dokumen PDF',
      generatingPdf: 'Menyusun Dokumen PDF...',
      previewPage: 'Halaman',
      downloadModalTitle: 'Unduh Dokumen PDF',
      downloadModalDesc: 'Beri nama berkas dokumen PDF yang siap disimpan ke perangkat Anda.',
      fileNameLabel: 'Nama Berkas PDF',
      confirmDownloadBtn: 'Simpan PDF ke Perangkat'
    },
    animeFinder: {
      title: 'Pencari Rekomendasi Anime',
      subtitle: 'Jelajahi ribuan anime terbaik berdasarkan genre favorit, rating MyAnimeList, dan sinopsis lengkap.',
      searchPlaceholder: 'Cari judul anime (contoh: Frieren, Jujutsu Kaisen, Oshi no Ko)...',
      searchBtn: 'Cari Anime',
      searching: 'Memuat Rekomendasi...',
      filterGenre: 'Saring Genre',
      allGenres: 'Semua Genre',
      sortPopular: 'Paling Populer',
      sortScore: 'Skor Tertinggi',
      sortTrending: 'Sedang Tren',
      episodes: 'Episode',
      statusFinished: 'Tamat',
      statusReleasing: 'Sedang Tayang',
      readMore: 'Baca Selengkapnya',
      readLess: 'Tutup Sinopsis',
      copyTitle: 'Salin Judul',
      copiedTitle: 'Judul anime disalin ke papan klip!',
      openOfficial: 'Detail Info Resmi',
      noResultsTitle: 'Anime Tidak Ditemukan',
      noResultsDesc: 'Coba ubah kata kunci pencarian atau sesuaikan kombinasi filter genre.'
    },
    manhwaFinder: {
      title: 'Pencari Rekomendasi Manhwa',
      subtitle: 'Temukan komik Korea (Manhwa) terbaik dengan rating tinggi, cover jernih, dan sinopsis seru.',
      searchPlaceholder: 'Cari judul manhwa (contoh: Solo Leveling, Omniscient Reader)...',
      searchBtn: 'Cari Manhwa',
      searching: 'Memuat Manhwa...',
      filterGenre: 'Saring Genre',
      allGenres: 'Semua Genre',
      sortPopular: 'Paling Populer',
      sortScore: 'Skor Tertinggi',
      sortTrending: 'Sedang Tren',
      chapters: 'Chapter',
      statusFinished: 'Tamat',
      statusReleasing: 'Sedang Berjalan',
      readMore: 'Baca Selengkapnya',
      readLess: 'Tutup Sinopsis',
      copyTitle: 'Salin Judul',
      copiedTitle: 'Judul manhwa disalin ke papan klip!',
      openOfficial: 'Detail Info Resmi',
      noResultsTitle: 'Manhwa Tidak Ditemukan',
      noResultsDesc: 'Coba kata kunci lain atau pilih filter genre berbeda.'
    },
    footer: {
      suite: 'UTILITY SUITE',
      text: 'Platform utilitas all-in-one untuk media, dokumen, audio, dan alat kreatif digital.'
    }
  },

  en: {
    nav: {
      home: 'Home',
      gallery: 'Gallery',
      history: 'History',
      settings: 'Settings',
      search: 'Search',
      downloadApk: 'Download APK',
      backToHome: 'Back to Home',
      switchTool: 'Switch Tool',
      tagline: 'Multi-Tool Platform'
    },
    identity: {
      creatorName: 'Creator Name',
      deviceUser: 'Device User',
      enterUsername: 'Enter your username here...',
      inputUsername: 'ENTER USERNAME',
      deviceDetected: '1 Device Detected',
      save: 'Save',
      saved: 'Saved',
      edit: 'Edit',
      status: 'Status',
      online: 'ONLINE',
      region: 'Region',
      device: 'Device',
      battery: 'Battery',
      charging: 'CHARGING',
      batteryActive: 'ACTIVE',
      network: 'Network',
      detecting: 'Detecting...',
      deviceTime: 'Time',
      role: 'Role',
      member: 'MEMBER',
      admin: 'ADMIN',
      login: 'Login',
      searchPlaceholder: 'Search tools in Kuro Studio (Media Downloader, PDF, QR Code, Compress...)',
      whatsappChannel: 'WhatsApp Channel',
      tiktokChannel: 'TT @kazexy1 (TikTok)',
      githubRepo: 'GitHub Repo',
      adminModalTitle: 'Admin Role Login',
      adminModalDesc: 'Enter administrator credentials to unlock special administrative permissions.',
      adminPasswordPlaceholder: 'Enter admin password...',
      adminCancel: 'Cancel',
      adminSubmit: 'Verify Password',
      adminWrongPass: 'Incorrect admin password. Access denied.'
    },
    welcome: {
      mainTools: 'MAIN UTILITY TOOLS',
      toolsCount: 'TOOLS',
      subtitle: 'Select utility tool to use. Each tool opens a dedicated workspace.',
      resetSearch: 'Reset Search',
      catAll: 'All Tools',
      catDownloader: 'Downloader',
      catFile: 'Convert & Files',
      catCreative: 'Studio & Creative',
      catUtility: 'Utility & WA',
      tools: {
        downloader: {
          name: 'Media Downloader',
          desc: 'Download HD videos, photo slides, and audio without watermarks from 16 social platforms.',
          tag: '16 PLATFORMS'
        },
        jjFinder: {
          name: 'JJ Preset Finder',
          desc: 'Alight Motion XML templates and 5MB TikTok jedag-jedug presets.',
          tag: 'SOCIAL'
        },
        pngToPdf: {
          name: 'PNG to PDF',
          desc: 'Merge multiple images into formatted PDF documents with custom typography.',
          tag: 'MULTI-IMG'
        },
        linkToDoc: {
          name: 'Link to PDF & PPT',
          desc: 'Convert web document links into structured PDF and PPTX slide presentations.',
          tag: 'DOC & PPTX'
        },
        imageToLink: {
          name: 'File to Link',
          desc: 'Upload photos, videos, and PDFs to generate instant public CDN links.',
          tag: 'UNIVERSAL'
        },
        compressor: {
          name: 'Media & PDF Compressor',
          desc: 'Optimize image, video, and PDF document file sizes without sacrificing clarity, fonts, or layouts.',
          tag: 'MEDIA & PDF'
        },
        qrStudio: {
          name: 'QR Code Studio',
          desc: 'Design custom QR codes with branding logos, stylized dot patterns, and frames.',
          tag: 'CUSTOM QR'
        },
        audioMerger: {
          name: 'Audio Merger',
          desc: 'Trim and merge multiple audio/video audio tracks into a master MP3 track.',
          tag: 'TIMELINE'
        },
        photoStudio: {
          name: 'Photo Studio',
          desc: 'Enhance photo sharpness, adjust monochromatic contrast, and upscale resolution.',
          tag: 'STUDIO HD'
        },
        videoStudio: {
          name: 'Video Studio',
          desc: 'Video visual filter suite for brightness, saturation, and cinematic motion effects.',
          tag: 'FX STUDIO'
        },
        videoTrimmer: {
          name: 'Video Trimmer',
          desc: 'Lossless video trimming with millisecond precision without re-encoding.',
          tag: 'LOSSLESS'
        },
        bgRemover: {
          name: 'Background Remover',
          desc: 'Extract subjects and logos into clean, high-resolution transparent PNG images.',
          tag: 'PNG HD'
        },
        resolver: {
          name: 'Safelink Resolver',
          desc: 'Bypass multi-level safelinks (Sfl.gl, SafelinkU, etc), skip ads and countdowns straight to the direct download link.',
          tag: 'BYPASS'
        },
        animeFinder: {
          name: 'Anime Recommendations',
          desc: 'Explore anime recommendations filtered by multiple genres, ratings, synopsis, and posters.',
          tag: 'ANIME HD'
        },
        manhwaFinder: {
          name: 'Manhwa Recommendations',
          desc: 'Discover top Korean manhwa with genre filters, reader ratings, covers, and full synopsis.',
          tag: 'MANHWA'
        },
        ipChecker: {
          name: 'IP & DNS Checker',
          desc: 'Live telemetry for public IP, ISP provider, ASN routing, geographic coordinates, and VPN/Proxy detection.',
          tag: 'NETWORK'
        }
      }
    },
    gallery: {
      title: 'Creation Gallery',
      subtitle: 'All files, downloads, and creations you produced are stored locally here.',
      filterAll: 'All Files',
      filterSlide: 'Media Slides',
      filterImage: 'Images & QR',
      filterVideo: 'Video & JJ',
      filterDoc: 'Documents',
      filterAudio: 'Audio',
      emptyTitle: 'No Files in Gallery Yet',
      emptyDesc: 'Media downloads, custom QR Codes, and converted files will appear here automatically.',
      exploreTools: 'Explore Tools Now',
      redownload: 'Re-download',
      delete: 'Delete',
      downloadSuccess: 'Starting file download...',
      itemDeleted: 'File removed from gallery.',
      itemsCount: 'saved files',
      downloadCurrentSlide: 'Download This Slide',
      downloadAllSlides: 'Download All Slides (ZIP)'
    },
    history: {
      title: 'Usage History',
      subtitle: 'Review tools and features you accessed on this device.',
      filterAll: 'All',
      filterToday: 'Today',
      filterOlder: 'Older',
      emptyTitle: 'No History Yet',
      emptyDesc: 'Your Kuro Studio utility tool activity will be recorded here automatically.',
      clearAll: 'Clear History',
      clearConfirm: 'Are you sure you want to clear all usage history?',
      cleared: 'Activity history has been cleared.',
      reopenTool: 'Open This Tool',
      justNow: 'Just now',
      minutesAgo: 'mins ago',
      hoursAgo: 'hours ago',
      daysAgo: 'days ago'
    },
    settings: {
      title: 'SETTINGS',
      subtitle: 'Configure your experience',
      searchPlaceholder: 'Search related settings & tools...',

      // 6 Main Category Cards (Inspired by Photo 2)
      secGeneral: {
        title: 'GENERAL',
        subtitle: 'Language, Input Automation & App Security'
      },
      secLookFeel: {
        title: 'LOOK & FEEL',
        subtitle: 'Theme, Fonts, Animations & Visual FX'
      },
      secStorage: {
        title: 'STORAGE & DOWNLOAD',
        subtitle: 'Save Paths, Filenames & Data Isolation'
      },
      secNetwork: {
        title: 'NETWORK & PERFORMANCE',
        subtitle: 'Servers, Connections, Latency & Retries'
      },
      secAdvanced: {
        title: 'ADVANCED',
        subtitle: 'History Retention, Media Player & Reset'
      },
      secAbout: {
        title: 'ABOUT & HELP',
        subtitle: 'Version, Help, Developer links'
      },

      // General Content
      languageTitle: 'Interface Language',
      languageDesc: 'Select your preferred language across Kuro Studio pages.',
      langIndonesian: 'Bahasa Indonesia',
      langEnglish: 'English (US)',
      inputAutoTitle: 'Input URL Automation',
      inputAutoDesc: 'Automatically focus input fields and simplify pasting links.',
      appSecurityTitle: 'Session Security & Privacy',
      appSecurityDesc: 'Encrypt local session data and protect download history on shared devices.',

      // Look & Feel Content
      darkModeTitle: 'Dark Mode',
      darkModeDesc: 'High-contrast monochrome dark aesthetic.',
      compactModeTitle: 'Compact Mode',
      compactModeDesc: 'Tighter card spacing and margins for smaller displays.',
      fontTitle: 'Application Font',
      fontDesc: 'Choose the primary typography for the user interface.',
      textSizeTitle: 'Interface Text Size',
      textSizeDesc: 'Scale text sizing for optimal eye comfort and readability.',
      textSizeSmall: 'Small',
      textSizeNormal: 'Default',
      textSizeLarge: 'Large',
      animSpeedTitle: 'Animation Rhythm',
      animSpeedDesc: 'Adjust transition speed and element interactions.',
      animFast: 'Fast (0.5x)',
      animNormal: 'Normal (1x)',
      animRelaxed: 'Relaxed (1.5x)',
      cornerStyleTitle: 'Card Corner Style (Border Radius)',
      cornerStyleDesc: 'Choose the curvature style of Neo-Brutalist cards and buttons.',
      cornerRounded: 'Modern (Rounded)',
      cornerSharp: 'Brutalist (Sharp)',
      cornerSoft: 'Soft (Subtle)',

      // Neobrutalist Border & Shadow
      borderThicknessTitle: 'Border Thickness',
      borderThicknessDesc: 'Adjust outline border thickness for cards and buttons.',
      borderThin: 'Thin (1px)',
      borderNormal: 'Normal (2px - Default)',
      borderHeavy: 'Heavy (4px)',
      shadowOffsetTitle: 'Hard Shadow Offset',
      shadowOffsetDesc: 'Select the depth of unblurred hard drop shadows.',
      shadowFlat: 'Flat (No Shadow)',
      shadowHard: 'Hard Offset (4px 4px)',
      shadowDeep: 'Deep Offset (8px 8px)',

      // Background Visual FX
      backgroundFxTitle: 'Background Particles / FX',
      backgroundFxDesc: 'Choose ambient background particle animation behind the UI.',
      bgFxSakura: 'Sakura Falling (Default)',
      bgFxGrid: 'Cyber Grid',
      bgFxOff: 'Off / Minimal',
      powerSavingTitle: 'Disable Animations (Power Saving Mode)',
      powerSavingDesc: 'Turn off all background animations and particles for peak performance and battery savings.',

      // Accent Color
      accentColorTitle: 'Accent Highlight Color',
      accentColorDesc: 'Set high-contrast highlight accent for active buttons and badges.',
      accentMonochrome: 'Monochrome (Black/White - Default)',
      accentYellow: 'Cyber Yellow (#FFE600)',
      accentPink: 'Neobrutalist Pink (#FF76CE)',
      accentMint: 'Neon Mint (#00F5D4)',

      hideAnimationsTitle: 'Hide Background Animations (Eco Mode)',
      hideAnimationsDesc: 'Hide falling sakura leaves and particle effects for maximum battery performance.',

      // Storage & Download Content
      deviceIdTitle: 'Current Device Client ID',
      deviceIdDesc: 'This unique permanent ID isolates gallery and history specifically to this device.',
      showGalleryTitle: 'Show Gallery Tab in Navbar',
      showGalleryDesc: 'Toggle visibility of the Gallery shortcut on the navigation bar.',
      showHistoryTitle: 'Show History Tab in Navbar',
      showHistoryDesc: 'Toggle visibility of the History shortcut on the navigation bar.',
      clearGalleryTitle: 'Clear Device Gallery',
      clearGalleryDesc: 'Delete all locally stored creations and files from this device memory.',
      clearGalleryBtn: 'Clear Gallery',
      clearGalleryConfirm: 'Are you sure you want to delete all local gallery files on this device?',
      galleryClearedMsg: 'Device gallery has been cleared.',

      // Network & Performance Content
      currentLatencyTitle: 'Current Network Latency',
      currentLatencyDesc: 'Packet transmission speed metric between your device and the server.',
      engineTitle: 'Dual Engine Processing',
      engineDesc: 'Automatic processing using FFmpeg backend with client-side browser fallback.',
      offlineModeTitle: 'Offline Mode Readiness',
      offlineModeDesc: 'Tools like video trimmer, photo studio, and QR code run independently in the browser.',

      // Advanced Content
      historyLimitTitle: 'History Retention Limit',
      historyLimitDesc: 'Stores up to the latest 50 activity entries on this device automatically.',
      mediaAutoplayTitle: 'Autoplay Media in Gallery',
      mediaAutoplayDesc: 'Automatically play video and audio when opening the preview modal.',
      factoryResetTitle: 'Reset Settings to Factory Defaults',
      factoryResetDesc: 'Restore all themes, fonts, and preferences to Kuro Studio default configuration.',
      factoryResetBtn: 'Reset Settings',
      factoryResetConfirm: 'Are you sure you want to reset all settings to factory defaults?',
      factoryResetSuccessMsg: 'All settings have been restored to factory defaults.',

      // About & Help Content
      versionTitle: 'Web Version',
      versionBadge: 'v2.5.0 (Stable Release)',
      versionDesc: 'Kuro Studio production multi-tool suite with modular architecture.',
      helpTitle: 'Quick Help & FAQ',
      help1Q: 'How do I download media without watermark?',
      help1A: 'Copy the link from TikTok or Instagram, open Media Downloader, paste it, and click Download HD.',
      help2Q: 'Can my data be seen by other devices or users?',
      help2A: 'No. Kuro Studio uses isolated Device ID sandboxing. Every phone or computer is 100% separate.',
      devLinksTitle: 'Developer & Community Links',
      devLinksDesc: 'Connect directly with the creator and official Kuro Studio open-source repos.',
      linkWhatsapp: 'Official WhatsApp Channel',
      linkTiktok: 'TikTok (@kazexy1)',
      linkGithub: 'GitHub Repository (Source Code)'
    },
    toasts: {
      galleryHidden: 'Gallery tab hidden',
      galleryVisible: 'Gallery tab visible',
      historyHidden: 'History tab hidden',
      historyVisible: 'History tab visible',
      darkModeOn: 'Dark mode enabled',
      darkModeOff: 'Light mode enabled',
      compactModeOn: 'Compact mode enabled',
      compactModeOff: 'Default mode enabled',
      animationsOff: 'Animations hidden for performance',
      animationsOn: 'Animations re-enabled',
      fontChanged: 'Application font changed to',
      textSizeChanged: 'Text size set to',
      cornerChanged: 'Corner style changed to',
      borderChanged: 'Border thickness set to',
      shadowChanged: 'Shadow offset set to',
      bgFxChanged: 'Background FX set to',
      accentChanged: 'Accent highlight color set to',
      langSwitched: 'Language switched to English',
      inputAutoToggled: 'Input automation setting updated',
      securityToggled: 'Session security setting updated'
    },
    downloader: {
      title: 'MEDIA DOWNLOADER',
      subtitle: 'Download high-definition videos, photo slide decks, and watermark-free audio tracks from 16 social media and streaming platforms. Select a platform below, paste a valid link, and download instantly.',
      platformsAvailable: '16 PLATFORMS AVAILABLE',
      choosePlatform: 'CHOOSE MEDIA PLATFORM',
      activeStatus: 'ACTIVE',
      downloadMediaPrefix: 'DOWNLOAD',
      pasteButton: 'Paste',
      downloadButton: 'Download Media',
      processingButton: 'Processing Media...',
      emptyUrlError: 'Please paste a valid media link first.',
      invalidDomainError: 'Link does not match official domains for {name}. Ensure URL contains {domains}.',
      switchSuggestion: 'This link was detected as {suggested}. Switch to {suggested} platform?',
      switchButton: 'Switch Platform',
      platforms: {
        tiktok: {
          badge: 'Video & Slide',
          placeholder: 'Paste TikTok video or slide link (vt.tiktok.com or tiktok.com/@user/...)',
          hint: 'Supports HD video without watermark and TikTok slide photo collections.'
        },
        instagram: {
          badge: 'Reels & Post',
          placeholder: 'Paste IG Reels, Carousel, or Photo link (instagram.com/reel/... or /p/...)',
          hint: 'Supports Reels video, multi-photo carousels, and high-resolution photos.'
        },
        youtube: {
          badge: 'Shorts & MP3',
          placeholder: 'Paste video or Shorts link (youtube.com/watch?v=... or youtu.be/...)',
          hint: 'Supports regular videos, YouTube Shorts, and MP3 audio conversion.'
        },
        twitter: {
          badge: 'Tweet Video',
          placeholder: 'Paste tweet video post link (x.com/.../status/... or twitter.com/...)',
          hint: 'Supports master quality MP4 downloads from video posts on the X platform.'
        },
        spotify: {
          badge: 'Audio Track',
          placeholder: 'Paste Spotify song or album link (open.spotify.com/track/...)',
          hint: 'Extract song metadata, full-resolution cover art, and audio streams.'
        },
        bilibili: {
          badge: 'Anime & HD',
          placeholder: 'Paste Bilibili video link (bilibili.com/video/... or b23.tv/...)',
          hint: 'Download anime clips and streaming videos without resolution downscaling.'
        },
        douyin: {
          badge: 'China Video',
          placeholder: 'Paste Douyin video link (douyin.com/video/... or iesdouyin.com/...)',
          hint: 'Download original Douyin videos without watermark directly in MP4 format.'
        },
        rednote: {
          badge: 'Xiaohongshu',
          placeholder: 'Paste Rednote / Xiaohongshu post link (xhslink.com/... or xiaohongshu.com/...)',
          hint: 'Download lifestyle photo albums and high-res short clips from Xiaohongshu.'
        },
        threads: {
          badge: 'Post Media',
          placeholder: 'Paste Threads post link (threads.net/@user/post/...)',
          hint: 'Download video clips and full-resolution image attachments from Threads.'
        },
        pinterest: {
          badge: 'Pins & Photo',
          placeholder: 'Paste Pinterest Pin link (pinterest.com/pin/... or pin.it/...)',
          hint: 'Download ultra high-resolution inspiration images and original Pin videos.'
        },
        appleMusic: {
          badge: 'Artwork & Audio',
          placeholder: 'Paste Apple Music album/song link (music.apple.com/...)',
          hint: 'Extract high-resolution album artwork and lossless audio previews.'
        },
        facebook: {
          badge: 'Reels & Video',
          placeholder: 'Paste FB video/Reels link (facebook.com/reel/... or /watch/...)',
          hint: 'Download public Facebook videos in high definition MP4 format instantly.'
        },
        bandcamp: {
          badge: 'Lossless Music',
          placeholder: 'Paste Bandcamp track link (artist.bandcamp.com/track/...)',
          hint: 'Download high-quality audio tracks and album covers from independent artists.'
        },
        pixiv: {
          badge: 'Artwork Art',
          placeholder: 'Paste Pixiv artwork link (pixiv.net/artworks/...)',
          hint: 'Download anime, manga, and digital illustrations in original master quality.'
        },
        reddit: {
          badge: 'Video & Post',
          placeholder: 'Paste Reddit post link (reddit.com/r/.../comments/...)',
          hint: 'Download Reddit videos with synchronized audio tracks in MP4 format.'
        },
        terabox: {
          badge: 'Cloud Media',
          placeholder: 'Paste Terabox download link (terabox.com/s/... or 1024tera.com/...)',
          hint: 'Access and download cloud video files directly without additional apps.'
        }
      }
    },
    audioMerger: {
      studioBadge: 'Multi-Track Timeline Studio',
      title: 'Audio & Video Merger',
      subtitle: 'Merge video with your favorite soundtrack or combine multiple audio tracks. Watch and listen to the result before downloading.',
      trackListHeader: 'Track List',
      trackListSubtitle: 'Adjust trimming duration (min & sec), volume, and watch/listen to preview for each track.',
      addTrackBtn: 'Add Audio / Video',
      emptyTracksTitle: 'No Media Added Yet',
      emptyTracksDesc: 'Click the button above to insert Video (MP4, WebM) or Audio (MP3, WAV, M4A) files.',
      startLabel: 'Start (Min : Sec)',
      endLabel: 'End (Min : Sec)',
      volumeLabel: 'Volume',
      durationLabel: 'Clip Duration',
      testClipBtn: 'Preview Audio',
      testVideoBtn: 'Preview Video',
      moveUp: 'Move Up',
      moveDown: 'Move Down',
      deleteTrack: 'Delete Track',
      mergeBtn: 'Merge & Combine Now',
      mergingBtn: 'Merging Media via FFmpeg...',
      successTitle: 'Media Successfully Merged!',
      successSubtitleVideo: 'Your video and audio have been combined into a new MP4 file.',
      successSubtitleAudio: 'Your audio tracks have been combined into a master MP3 track.',
      outputPreviewTitle: 'Merged Output Preview',
      outputPreviewSubtitle: 'Watch or listen to the output before downloading to your device.',
      downloadVideoBtn: 'Download Video MP4',
      downloadAudioBtn: 'Download Audio MP3'
    },
    pngToPdf: {
      badge: 'Word & Docs Style Layout Engine',
      title: 'PNG to PDF & Word Studio',
      subtitle: 'Arrange photos and text like a Word/Docs document with a typography toolbar and export to PDF.',
      addPhotos: 'Add Photos / Images',
      paperFormat: 'Paper Format',
      orientationPortrait: 'Portrait',
      orientationLandscape: 'Landscape',
      marginNormal: 'Normal Margin',
      marginNarrow: 'Narrow Margin',
      marginWide: 'Wide Margin',
      showPageNumbers: 'Page Numbers',
      toolbarFont: 'Document Font',
      toolbarSize: 'Font Size',
      toolbarBold: 'Bold',
      toolbarItalic: 'Italic',
      toolbarUnderline: 'Underline',
      toolbarStrike: 'Strikethrough',
      toolbarCase: 'Change Case',
      toolbarColor: 'Text Color',
      toolbarHighlight: 'Highlight Color',
      toolbarBullet: 'Bulleted List',
      toolbarNumber: 'Numbered List',
      toolbarAlignLeft: 'Align Left',
      toolbarAlignCenter: 'Align Center',
      toolbarAlignRight: 'Align Right',
      toolbarJustify: 'Justify',
      styleNormal: 'Normal Text',
      styleHeading1: 'Heading 1',
      styleHeading2: 'Heading 2',
      styleHeading3: 'Heading 3',
      textPlaceholder: 'Type or paste document text here...',
      generatePdfBtn: 'Export PDF Document',
      generatingPdf: 'Building PDF Document...',
      previewPage: 'Page',
      downloadModalTitle: 'Download PDF Document',
      downloadModalDesc: 'Provide a filename for the PDF document ready to be saved to your device.',
      fileNameLabel: 'PDF File Name',
      confirmDownloadBtn: 'Save PDF to Device'
    },
    animeFinder: {
      title: 'Anime Recommendations',
      subtitle: 'Browse thousands of top anime filtered by your favorite genres, MyAnimeList scores, and full synopsis.',
      searchPlaceholder: 'Search anime title (e.g. Frieren, Jujutsu Kaisen, Oshi no Ko)...',
      searchBtn: 'Search Anime',
      searching: 'Loading Recommendations...',
      filterGenre: 'Filter Genres',
      allGenres: 'All Genres',
      sortPopular: 'Most Popular',
      sortScore: 'Top Rated',
      sortTrending: 'Trending Now',
      episodes: 'Episodes',
      statusFinished: 'Completed',
      statusReleasing: 'Currently Airing',
      readMore: 'Read More',
      readLess: 'Collapse',
      copyTitle: 'Copy Title',
      copiedTitle: 'Anime title copied to clipboard!',
      openOfficial: 'Official Details',
      noResultsTitle: 'No Anime Found',
      noResultsDesc: 'Try adjusting your search keywords or switching genre filters.'
    },
    manhwaFinder: {
      title: 'Manhwa Recommendations',
      subtitle: 'Discover top Korean manhwa with high ratings, crisp cover art, and captivating plot synopsis.',
      searchPlaceholder: 'Search manhwa title (e.g. Solo Leveling, Omniscient Reader)...',
      searchBtn: 'Search Manhwa',
      searching: 'Loading Manhwa...',
      filterGenre: 'Filter Genres',
      allGenres: 'All Genres',
      sortPopular: 'Most Popular',
      sortScore: 'Top Rated',
      sortTrending: 'Trending Now',
      chapters: 'Chapters',
      statusFinished: 'Completed',
      statusReleasing: 'Ongoing',
      readMore: 'Read More',
      readLess: 'Collapse',
      copyTitle: 'Copy Title',
      copiedTitle: 'Manhwa title copied to clipboard!',
      openOfficial: 'Official Details',
      noResultsTitle: 'No Manhwa Found',
      noResultsDesc: 'Try different search keywords or select different genres.'
    },
    footer: {
      suite: 'UTILITY SUITE',
      text: 'All-in-one utility suite for media, documents, audio, and digital creative tools.'
    }
  }
};
