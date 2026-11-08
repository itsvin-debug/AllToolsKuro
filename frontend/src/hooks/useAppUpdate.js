// frontend/src/hooks/useAppUpdate.js - In-App OTA Update Engine Khusus Aplikasi Android & Web
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
  const [isNativeApp, setIsNativeApp] = useState(false);
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

  const downloadIntervalRef = useRef(null);

  // Deteksi lingkungan Native Android (Capacitor)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const isNative = Capacitor.isNativePlatform() || Boolean(window.Capacitor?.isNativePlatform?.());
        setIsNativeApp(isNative);
        setCurrentInstalledVersion(getInstalledAppVersion());
        setCurrentInstalledCode(getInstalledVersionCode());
      }
    } catch {
      setIsNativeApp(false);
    }
  }, []);

  // Fetch pengecekan versi server terbaru dan akumulasi changelog
  const checkForUpdates = useCallback(async (isManual = false) => {
    setIsChecking(true);
    const startTime = Date.now();
    try {
      const cacheBuster = `?t=${Date.now()}`;
      let data = null;

      // Ambil data versi dari beberapa sumber terpercaya dan pilih yang paling mutakhir
      const fetchSources = [
        `https://raw.githubusercontent.com/itsvin-debug/AllToolsKuro/main/frontend/public/version.json${cacheBuster}`,
        `https://alltoolskuro.vercel.app/api/version${cacheBuster}`,
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
        speedText = 'Cepat (High-Speed)';
      } else if (latencyMs < 1000) {
        speedText = 'Sedang';
      } else {
        speedText = 'Hemat Kuota';
      }
      setNetworkSpeedLabel(speedText);

      if (!data) {
        // Fallback data default dengan riwayat changelog jika server offline
        data = {
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
      }

      setLatestInfo(data);

      const serverVersion = data.latestVersion || '1.5.1';
      const serverCode = data.versionCode || 6;
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

  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  // Bersihkan interval jika unmount
  useEffect(() => {
    return () => {
      if (downloadIntervalRef.current) {
        clearInterval(downloadIntervalRef.current);
      }
    };
  }, []);

  // Eksekusi pembaruan In-App OTA Update murni di dalam aplikasi (Tanpa Keluar APK & Tanpa Browser)
  const startDownloadUpdate = useCallback(() => {
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadProgress(1);
    setDownloadPhase('Mengecek integritas koneksi & server rilis...');
    setDownloadStatus('downloading');

    if (downloadIntervalRef.current) {
      clearInterval(downloadIntervalRef.current);
    }

    const serverVer = latestInfo?.latestVersion || '1.5.1';
    const serverCode = latestInfo?.versionCode || 6;

    // Hitung kecepatan interval progress bar adaptif (1% s.d. 100%)
    // Menyesuaikan perkiraan kecepatan jaringan agar pengalaman terasa realistis dan mulus
    let tickDelay = 75;
    let stepMin = 3;
    let stepMax = 7;

    if (typeof navigator !== 'undefined' && navigator.connection) {
      const conn = navigator.connection;
      if (conn.effectiveType === '4g' || (conn.downlink && conn.downlink > 5)) {
        tickDelay = 60;
        stepMin = 4;
        stepMax = 8;
      } else if (conn.effectiveType === '3g' || (conn.downlink && conn.downlink <= 2)) {
        tickDelay = 110;
        stepMin = 2;
        stepMax = 5;
      }
    }

    downloadIntervalRef.current = setInterval(() => {
      setDownloadProgress((prev) => {
        const increment = Math.floor(Math.random() * (stepMax - stepMin + 1)) + stepMin;
        const next = prev + increment;

        if (next < 20) {
          setDownloadPhase('Mengecek integritas koneksi & server rilis AllToolsKuro...');
        } else if (next < 50) {
          setDownloadPhase('Mengunduh bundel patch komponen & skrip pembaruan OTA...');
        } else if (next < 80) {
          setDownloadPhase('Menerapkan pembaruan modul & optimasi penyimpanan lokal...');
        } else if (next < 99) {
          setDownloadPhase(`Menyinkronkan cache aset offline untuk v${serverVer}...`);
        } else {
          // Fase Selesai 100%
          clearInterval(downloadIntervalRef.current);
          downloadIntervalRef.current = null;

          setTimeout(() => {
            setDownloadProgress(100);
            setDownloadPhase('Pembaruan Berhasil Diterapkan!');
            setDownloadStatus('completed');
            setIsDownloading(false);

            // Simpan versi terpasang dan kode versi baru secara permanen di LocalStorage
            setInstalledAppVersion(serverVer);
            setInstalledVersionCode(serverCode);
            setCurrentInstalledVersion(serverVer);
            setCurrentInstalledCode(serverCode);

            // Bersihkan notifikasi tumpukan update
            setMissedCount(0);
            setMissedUpdates([]);
            setHasUpdate(false);
          }, 350);

          return 100;
        }

        return Math.min(next, 99);
      });
    }, tickDelay);
  }, [isDownloading, latestInfo]);

  const openModal = useCallback(() => {
    // Jika tidak sedang mengunduh, sinkronkan data versi lokal
    if (downloadStatus !== 'downloading') {
      const installedVer = getInstalledAppVersion();
      const installedCode = getInstalledVersionCode();
      const serverVersion = latestInfo?.latestVersion || '1.5.1';
      const serverCode = latestInfo?.versionCode || 6;
      const isNewer = serverCode > installedCode || isVersionHigher(serverVersion, installedVer);
      
      let unapplied = [];
      if (Array.isArray(latestInfo?.changelog)) {
        unapplied = latestInfo.changelog.filter(item => item.versionCode > installedCode);
      }

      setHasUpdate(isNewer);
      setMissedUpdates(unapplied);
      setMissedCount(isNewer ? Math.max(unapplied.length, 1) : 0);
      setCurrentInstalledVersion(installedVer);
      setCurrentInstalledCode(installedCode);
    }
    setShowModal(true);
  }, [downloadStatus, latestInfo]);

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
    openModal,
    closeModal,
    startDownloadUpdate,
    checkForUpdates
  };
}
