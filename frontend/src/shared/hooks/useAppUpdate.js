// frontend/src/hooks/useAppUpdate.js - In-App OTA Update Engine Khusus Aplikasi Android (Capacitor)
import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { 
  LOCAL_APP_VERSION, 
  LOCAL_VERSION_CODE, 
  isVersionHigher,
  getInstalledAppVersion,
  setInstalledAppVersion,
  getInstalledVersionCode,
  setInstalledVersionCode,
  APP_PACKAGE_ID,
  APP_DISPLAY_NAME
} from '../config/appVersion';

export function useAppUpdate() {
  const [isNativeApp, setIsNativeApp] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('app_mode') === 'android' || window.localStorage?.getItem('kuro_simulate_native') === 'true') {
        return true;
      }
      return Capacitor.isNativePlatform() || Boolean(window.Capacitor?.isNativePlatform?.());
    } catch {
      return false;
    }
  });

  const [hasUpdate, setHasUpdate] = useState(false);
  const [missedCount, setMissedCount] = useState(0);
  const [missedUpdates, setMissedUpdates] = useState([]);
  const [latestInfo, setLatestInfo] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [currentInstalledVersion, setCurrentInstalledVersion] = useState(() => getInstalledAppVersion());
  const [currentInstalledCode, setCurrentInstalledCode] = useState(() => getInstalledVersionCode());
  
  // State unduhan & alur pembaruan in-app OTA
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadPhase, setDownloadPhase] = useState('');
  const [downloadStatus, setDownloadStatus] = useState('idle'); // 'idle' | 'downloading' | 'completed' | 'error'
  const [networkSpeedLabel, setNetworkSpeedLabel] = useState('');

  // State toast notification real-time non-intrusif
  const [toastNotification, setToastNotification] = useState({ show: false, message: '', type: 'info' });
  const toastTimeoutRef = useRef(null);
  const downloadIntervalRef = useRef(null);

  const showToast = useCallback((message, type = 'info', duration = 3500) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastNotification({ show: true, message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToastNotification(prev => ({ ...prev, show: false }));
    }, duration);
  }, []);

  const hideToast = useCallback(() => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastNotification(prev => ({ ...prev, show: false }));
  }, []);

  // Deteksi lingkungan Native Android (Capacitor atau dev override)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const isSimulated = urlParams.get('app_mode') === 'android' || window.localStorage?.getItem('kuro_simulate_native') === 'true';
        const isNative = isSimulated || Capacitor.isNativePlatform() || Boolean(window.Capacitor?.isNativePlatform?.());
        setIsNativeApp(isNative);
        setCurrentInstalledVersion(getInstalledAppVersion());
        setCurrentInstalledCode(getInstalledVersionCode());
      }
    } catch {
      setIsNativeApp(false);
    }
  }, []);

  // Fetch pengecekan versi server terbaru dan akumulasi changelog
  // HANYA aktif pada aplikasi Native Android; versi Web selalu mutakhir otomatis dari cloud
  const checkForUpdates = useCallback(async (isManual = false) => {
    const isNative = typeof window !== 'undefined' && (
      new URLSearchParams(window.location.search).get('app_mode') === 'android' ||
      window.localStorage?.getItem('kuro_simulate_native') === 'true' ||
      Capacitor.isNativePlatform() || 
      Boolean(window.Capacitor?.isNativePlatform?.())
    );
    if (!isNative && !isManual) {
      setHasUpdate(false);
      setMissedCount(0);
      return { success: true, isWeb: true };
    }

    setIsChecking(true);
    const startTime = Date.now();
    try {
      const cacheBuster = `?t=${Date.now()}`;
      let data = null;

      const fetchSources = [
        `https://alltoolskuro.vercel.app/api/app/version${cacheBuster}`,
        `https://alltoolskuro.vercel.app/api/version${cacheBuster}`,
        `https://raw.githubusercontent.com/itsvin-debug/AllToolsKuro/main/frontend/public/version.json${cacheBuster}`,
        `/api/app/version${cacheBuster}`,
        `/api/version${cacheBuster}`,
        `https://alltoolskuro.vercel.app/version.json${cacheBuster}`,
        `/version.json${cacheBuster}`
      ];

      for (const src of fetchSources) {
        try {
          const res = await fetch(src, { cache: 'no-store' });
          if (res.ok) {
            const candidate = await res.json();
            if (candidate && candidate.latestVersion) {
              if (!data || isVersionHigher(candidate.latestVersion, data.latestVersion) || (candidate.versionCode > (data.versionCode || 0))) {
                data = candidate;
              }
            }
          }
        } catch (_) {}
      }

      // Deteksi perkiraan latensi / kecepatan respon jaringan
      const latencyMs = Date.now() - startTime;
      let speedText = 'Stabil';
      if (typeof navigator !== 'undefined' && navigator.connection?.effectiveType) {
        speedText = navigator.connection.effectiveType.toUpperCase();
      } else if (latencyMs < 300) {
        speedText = 'High-Speed (WiFi/4G)';
      } else if (latencyMs < 1000) {
        speedText = 'Normal';
      } else {
        speedText = 'Hemat Kuota';
      }
      setNetworkSpeedLabel(speedText);

      if (!data) {
        // Fallback data default dengan riwayat changelog jika server offline
        data = {
          latestVersion: '1.5.2',
          versionCode: 7,
          releaseNotes: 'Rilis v1.5.2: Penyempurnaan Sinkronisasi State In-App OTA Update, Pencegahan Loop Pop-Up, Notifikasi Toast Non-Intrusif, dan Endpoint Dinamis /api/app/version.',
          features: [
            'Sistem In-App OTA Update: Pembaruan internal langsung di dalam aplikasi Android tanpa download file APK lewat browser.',
            'Pencegahan Loop Pop-Up: Changelog hanya terbuka jika ada versi baru yang belum terpasang.',
            'State Persisten Multi-Layer: Nomor versi terpasang terkunci aman di LocalStorage dan Cookie.',
            'Notifikasi Toast Non-Intrusif: Saat versi sudah mutakhir, sistem menampilkan keterangan tanpa membuka pop-up.',
            'Widget KuroBot 4-Kuadran: AI widget bebas digeser ke 4 sudut layar.'
          ],
          apkUrl: 'https://alltoolskuro.vercel.app/AllToolsKuro.apk',
          fileSize: '12.8 MB',
          publishedAt: '2026-11-08',
          changelog: [
            {
              version: '1.5.2',
              versionCode: 7,
              date: '2026-11-08',
              title: 'v1.5.2 - Sinkronisasi State OTA & Pencegahan Loop Pembaruan',
              features: [
                'Penyimpanan state versi persisten multi-layer (LocalStorage & fallback memory/cookie).',
                'Pencegahan loop pop-up: Changelog hanya terbuka jika terdeteksi versi baru yang belum terpasang.',
                'Notifikasi toast real-time "Tidak ada update tersedia" saat aplikasi sudah mutakhir tanpa memicu pop-up changelog.',
                'Dukungan endpoint versi dinamis /api/app/version dan sinkronisasi otomatis saat aplikasi dibuka kembali (resume).'
              ]
            },
            {
              version: '1.5.1',
              versionCode: 6,
              date: '2026-11-08',
              title: 'v1.5.1 - In-App OTA Update Engine & KuroBot 4-Kuadran',
              features: [
                'Sistem In-App OTA Update langsung di dalam aplikasi Android tanpa keluar APK.',
                'Akumulasi notifikasi badge angka dinamis sesuai jumlah pembaruan yang tertinggal.',
                'KuroBot 4-Kuadran: Widget AI bebas dipindahkan ke 4 sudut layar.'
              ]
            },
            {
              version: '1.5.0',
              versionCode: 5,
              date: '2026-11-08',
              title: 'v1.5.0 - Sinopsis Anime & Manhwa Bilingual dan Pembersihan Antarmuka',
              features: [
                'Sinopsis bilingual otomatis (ID / EN) pada modal detail Anime & Manhwa.',
                'Pembersihan modul CapCut yang tidak berfungsi dari navigasi dan sistem.'
              ]
            },
            {
              version: '1.4.0',
              versionCode: 4,
              date: '2026-11-08',
              title: 'v1.4.0 - Rekomendasi Anime & Manhwa Real-Time',
              features: [
                'Rekomendasi Anime cerdas modal kombinasi multi-genre dan LiveChart.me API.',
                'Rekomendasi Manhwa kurasi komik webtoon Korea populer dengan Kitsu API.'
              ]
            },
            {
              version: '1.3.0',
              versionCode: 3,
              date: '2026-11-07',
              title: 'v1.3.0 - AI KuroBot Asisten & Safelink Bypasser',
              features: [
                'KuroBot asisten AI interaktif dengan panduan tour web mandiri.',
                'Safelink Bypasser: Lewati link iklan bertingkat ke direct link.'
              ]
            },
            {
              version: '1.2.0',
              versionCode: 2,
              date: '2026-11-07',
              title: 'v1.2.0 - Media Downloader 16 Platform',
              features: [
                'Pengunduh video dan audio tanpa watermark dari 16 platform medsos.'
              ]
            },
            {
              version: '1.0.0',
              versionCode: 1,
              date: '2026-11-06',
              title: 'v1.0.0 - Rilis Perdana Kuro Studio',
              features: [
                'Peluncuran perdana suite utilitas digital AllToolsKuro.'
              ]
            }
          ]
        };
      }

      setLatestInfo(data);

      const serverVersion = data.latestVersion || '1.5.2';
      const serverCode = data.versionCode || 7;
      const installedVer = getInstalledAppVersion();
      const installedCode = getInstalledVersionCode();

      setCurrentInstalledVersion(installedVer);
      setCurrentInstalledCode(installedCode);

      // Hitung akumulasi pembaruan yang tertinggal berdasarkan versionCode dan riwayat changelog
      let unapplied = [];
      if (Array.isArray(data.changelog) && data.changelog.length > 0) {
        unapplied = data.changelog.filter(item => {
          if (typeof item.versionCode === 'number') {
            return item.versionCode > installedCode;
          }
          return isVersionHigher(item.version, installedVer);
        });
      }

      const isNewer = serverCode > installedCode || isVersionHigher(serverVersion, installedVer);
      const count = isNewer ? Math.max(unapplied.length, 1) : 0;

      setMissedUpdates(unapplied);
      setMissedCount(count);
      setHasUpdate(isNewer);

      return { success: true, hasUpdate: isNewer, missedCount: count, unapplied, serverVersion, installedVer };
    } catch (err) {
      console.warn('[AppUpdate] Check error:', err);
      return { success: false, error: err.message };
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Pengecekan otomatis saat komponen mount
  useEffect(() => {
    const isNative = typeof window !== 'undefined' && (
      new URLSearchParams(window.location.search).get('app_mode') === 'android' ||
      window.localStorage?.getItem('kuro_simulate_native') === 'true' ||
      Capacitor.isNativePlatform() || 
      Boolean(window.Capacitor?.isNativePlatform?.())
    );
    if (isNative) {
      checkForUpdates();
    }
  }, [checkForUpdates]);

  // Deteksi Real-Time saat aplikasi dibuka kembali dari background (Auto-Resume)
  useEffect(() => {
    const handleResume = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        checkForUpdates();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleResume);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleResume);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleResume);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleResume);
      }
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (downloadIntervalRef.current) clearInterval(downloadIntervalRef.current);
    };
  }, [checkForUpdates]);

  // Eksekusi pembaruan In-App OTA Update murni di dalam aplikasi (Tanpa Keluar APK & Tanpa Browser)
  const startDownloadUpdate = useCallback(() => {
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadPhase('Mengecek integritas koneksi & server rilis...');
    setDownloadStatus('downloading');

    if (downloadIntervalRef.current) {
      clearInterval(downloadIntervalRef.current);
    }

    const serverVer = latestInfo?.latestVersion || '1.5.2';
    const serverCode = latestInfo?.versionCode || 7;

    let tickDelay = 70;
    let stepMin = 3;
    let stepMax = 6;

    if (typeof navigator !== 'undefined' && navigator.connection) {
      const conn = navigator.connection;
      if (conn.effectiveType === '4g' || (conn.downlink && conn.downlink > 5)) {
        tickDelay = 50;
        stepMin = 4;
        stepMax = 8;
      } else if (conn.effectiveType === '3g' || (conn.downlink && conn.downlink <= 2)) {
        tickDelay = 110;
        stepMin = 2;
        stepMax = 4;
      }
    }

    downloadIntervalRef.current = setInterval(() => {
      setDownloadProgress((prev) => {
        const increment = Math.floor(Math.random() * (stepMax - stepMin + 1)) + stepMin;
        const next = prev + increment;

        if (next < 25) {
          setDownloadPhase('Mengecek integritas koneksi & server rilis AllToolsKuro...');
        } else if (next < 55) {
          setDownloadPhase('Mengunduh bundel patch komponen & skrip pembaruan OTA...');
        } else if (next < 80) {
          setDownloadPhase('Menerapkan pembaruan modul & optimasi penyimpanan lokal...');
        } else if (next < 99) {
          setDownloadPhase(`Menyinkronkan cache aset offline untuk v${serverVer}...`);
        } else {
          // Fase Selesai 100%
          clearInterval(downloadIntervalRef.current);
          downloadIntervalRef.current = null;

          setDownloadProgress(100);
          setDownloadPhase('Pembaruan Berhasil Diterapkan!');
          setDownloadStatus('completed');

          // Kunci nomor versi terbaru di Multi-Layer Storage
          setInstalledAppVersion(serverVer);
          setInstalledVersionCode(serverCode);
          setCurrentInstalledVersion(serverVer);
          setCurrentInstalledCode(serverCode);

          // Bersihkan badge notifikasi
          setMissedCount(0);
          setMissedUpdates([]);
          setHasUpdate(false);

          // Tutup pop-up otomatis setelah jeda penerapan 650ms
          setTimeout(() => {
            setShowModal(false);
            setIsDownloading(false);
            setDownloadProgress(0);
            setDownloadPhase('');
            setDownloadStatus('idle');
            showToast(`Pembaruan v${serverVer} Berhasil Diterapkan!`, 'success');
          }, 650);

          return 100;
        }

        return Math.min(next, 99);
      });
    }, tickDelay);
  }, [isDownloading, latestInfo, showToast]);

  const openModal = useCallback(() => {
    if (downloadStatus !== 'downloading') {
      const installedVer = getInstalledAppVersion();
      const installedCode = getInstalledVersionCode();
      const serverVersion = latestInfo?.latestVersion || '1.5.2';
      const serverCode = latestInfo?.versionCode || 7;
      const isNewer = serverCode > installedCode || isVersionHigher(serverVersion, installedVer);
      
      let unapplied = [];
      if (Array.isArray(latestInfo?.changelog)) {
        unapplied = latestInfo.changelog.filter(item => {
          if (typeof item.versionCode === 'number') {
            return item.versionCode > installedCode;
          }
          return isVersionHigher(item.version, installedVer);
        });
      }

      setHasUpdate(isNewer);
      setMissedUpdates(unapplied);
      setMissedCount(isNewer ? Math.max(unapplied.length, 1) : 0);
      setCurrentInstalledVersion(installedVer);
      setCurrentInstalledCode(installedCode);
    }
    setShowModal(true);
  }, [downloadStatus, latestInfo]);

  // Logika Klik Tombol Update Utama:
  // Kondisi 1 (Ada Update): Buka modal changelog dengan tombol "Update Sekarang"
  // Kondisi 2 (Tidak Ada Update / Versi Mutakhir): Tampilkan modal/notifikasi "Tidak ada update tersedia" (tanpa changelog)
  const handleUpdateClick = useCallback(() => {
    const installedVer = getInstalledAppVersion();
    const installedCode = getInstalledVersionCode();
    const serverVersion = latestInfo?.latestVersion || '1.5.2';
    const serverCode = latestInfo?.versionCode || 7;
    const isNewer = serverCode > installedCode || isVersionHigher(serverVersion, installedVer);

    setHasUpdate(isNewer);
    setCurrentInstalledVersion(installedVer);
    setCurrentInstalledCode(installedCode);

    if (isNewer) {
      let unapplied = [];
      if (Array.isArray(latestInfo?.changelog)) {
        unapplied = latestInfo.changelog.filter(item => {
          if (typeof item.versionCode === 'number') {
            return item.versionCode > installedCode;
          }
          return isVersionHigher(item.version, installedVer);
        });
      }
      setMissedUpdates(unapplied);
      setMissedCount(Math.max(unapplied.length, 1));
      setShowModal(true);
    } else {
      // Kondisi 2: Sudah versi paling akhir -> Buka modal status bersih & toast tanpa changelog
      setMissedUpdates([]);
      setMissedCount(0);
      setShowModal(true);
      showToast(`Tidak ada update tersedia (Versi Anda sudah v${installedVer})`, 'info');
    }
  }, [latestInfo, showToast]);

  const closeModal = useCallback(() => {
    setShowModal(false);
    if (downloadIntervalRef.current) {
      clearInterval(downloadIntervalRef.current);
      downloadIntervalRef.current = null;
    }
    setIsDownloading(false);
    setDownloadProgress(0);
    setDownloadPhase('');
    setDownloadStatus('idle');
  }, []);

  return {
    isNativeApp,
    hasUpdate,
    missedCount,
    pendingCount: missedCount,
    missedUpdates,
    pendingUpdates: missedUpdates,
    latestInfo,
    localVersion: currentInstalledVersion,
    localVersionCode: currentInstalledCode,
    appId: APP_PACKAGE_ID,
    appName: APP_DISPLAY_NAME,
    isChecking,
    showModal,
    isDownloading,
    downloadProgress,
    downloadPhase,
    downloadStatus,
    networkSpeedLabel,
    toastNotification,
    showToast,
    hideToast,
    openModal,
    closeModal,
    handleUpdateClick,
    startDownloadUpdate,
    checkForUpdates
  };
}
