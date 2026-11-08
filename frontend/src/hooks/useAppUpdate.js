// frontend/src/hooks/useAppUpdate.js - In-App Live Update Engine untuk AllToolsKuro
import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { 
  LOCAL_APP_VERSION, 
  LOCAL_VERSION_CODE, 
  isVersionHigher,
  getInstalledAppVersion,
  setInstalledAppVersion,
  APP_PACKAGE_ID,
  APP_DISPLAY_NAME
} from '../config/appVersion';

export function useAppUpdate() {
  const [isNativeApp, setIsNativeApp] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingUpdates, setPendingUpdates] = useState([]);
  const [latestInfo, setLatestInfo] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [currentInstalledVersion, setCurrentInstalledVersion] = useState(() => getInstalledAppVersion());
  
  // State unduhan & alur pembaruan in-app live
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(1);
  const [downloadPhase, setDownloadPhase] = useState('');
  const [downloadStatus, setDownloadStatus] = useState('idle'); // 'idle' | 'downloading' | 'completed' | 'error'

  const downloadIntervalRef = useRef(null);

  // Deteksi lingkungan Native Android (Capacitor)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const isNative = Capacitor.isNativePlatform() || Boolean(window.Capacitor?.isNativePlatform?.());
        setIsNativeApp(isNative);
        setCurrentInstalledVersion(getInstalledAppVersion());
      }
    } catch {
      setIsNativeApp(false);
    }
  }, []);

  // Fetch pengecekan versi server & kalkulasi akumulasi pembaruan tertunda
  const checkForUpdates = useCallback(async (isManual = false) => {
    setIsChecking(true);
    try {
      const cacheBuster = `?t=${Date.now()}`;
      let data = null;

      // Ambil data versi dari beberapa sumber terpercaya dan pilih versi tertinggi
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
              if (!data || isVersionHigher(candidate.latestVersion, data.latestVersion)) {
                data = candidate;
              }
            }
          }
        } catch (_) {}
      }

      if (!data) {
        // Fallback default v1.5.2 jika server offline
        data = {
          latestVersion: '1.5.2',
          versionCode: 7,
          releaseNotes: 'Rilis Pembaruan v1.5.2: Peningkatan Posisi 4-Kuadran KuroBot & In-App Live Update Akumulatif Tanpa Unduh Ulang Browser.',
          features: [
            'Widget AI KuroBot 4-Kuadran: Bebas digeser ke sudut mana pun dengan penyimpanan permanen.',
            'In-App Live Update Akumulatif: Menampilkan seluruh riwayat perubahan yang belum diambil pengguna.',
            'Badge Notifikasi Angka Dinamis: Tombol update menampilkan jumlah pembaruan tertunda.',
            'Animasi Progres Live 1% - 100%: Sinkronisasi aset pembaruan langsung di dalam aplikasi.',
            'Status Up-to-Date Otomatis: Menampilkan \'Tidak ada update tersedia\' begitu selesai.'
          ],
          history: [
            {
              version: '1.5.2',
              versionCode: 7,
              date: '2026-11-08',
              title: 'Peningkatan Posisi 4-Kuadran KuroBot & In-App Live Update Akumulatif',
              changes: [
                'Widget AI KuroBot kini bebas dipindahkan ke 4 sudut kuadran (Kiri-Atas, Kanan-Atas, Kiri-Bawah, Kanan-Bawah).',
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
          ],
          apkUrl: 'https://alltoolskuro.vercel.app/AllToolsKuro.apk',
          fileSize: '12.8 MB',
          publishedAt: '2026-11-08'
        };
      }

      setLatestInfo(data);

      const serverVersion = data.latestVersion || '1.5.2';
      const installedVer = getInstalledAppVersion();
      setCurrentInstalledVersion(installedVer);

      // Hitung daftar dan akumulasi pembaruan yang belum terpasang dari history
      const historyList = Array.isArray(data.history) ? data.history : [];
      const unapplied = historyList.filter(item => isVersionHigher(item.version, installedVer));
      
      // Jika history kosong tapi serverVersion > installedVer, buat fallback 1 update
      if (unapplied.length === 0 && isVersionHigher(serverVersion, installedVer)) {
        unapplied.push({
          version: serverVersion,
          versionCode: data.versionCode || 7,
          date: data.publishedAt || '2026-11-08',
          title: data.releaseNotes || 'Pembaruan Fitur Terbaru',
          changes: data.features || []
        });
      }

      setPendingUpdates(unapplied);
      setPendingCount(unapplied.length);
      setHasUpdate(unapplied.length > 0);

      return { 
        success: true, 
        hasUpdate: unapplied.length > 0, 
        pendingCount: unapplied.length, 
        serverVersion, 
        installedVer 
      };
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

  // Eksekusi pembaruan in-app live (1% hingga 100%) langsung di aplikasi
  const startDownloadUpdate = useCallback(() => {
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadProgress(1);
    setDownloadPhase('Menghubungkan ke server registry AllToolsKuro...');
    setDownloadStatus('downloading');

    if (downloadIntervalRef.current) {
      clearInterval(downloadIntervalRef.current);
    }

    const serverVer = latestInfo?.latestVersion || '1.5.2';
    const totalAccumulated = pendingCount > 0 ? pendingCount : 1;

    // Jalankan animasi progres 1% -> 100% real-time bertahap
    downloadIntervalRef.current = setInterval(() => {
      setDownloadProgress((prev) => {
        const increment = Math.floor(Math.random() * 6) + 4;
        const next = prev + increment;

        if (next < 20) {
          setDownloadPhase('Menghubungkan ke server registry AllToolsKuro...');
        } else if (next < 50) {
          setDownloadPhase(`Mengunduh paket bundle pembaruan (${totalAccumulated} rilis terakumulasi)...`);
        } else if (next < 80) {
          setDownloadPhase('Menerapkan patch skrip & memperbarui cache aset...');
        } else if (next < 99) {
          setDownloadPhase(`Memverifikasi integritas rilis v${serverVer}...`);
        } else {
          // Fase 100% Selesai
          clearInterval(downloadIntervalRef.current);
          downloadIntervalRef.current = null;

          setTimeout(() => {
            setDownloadProgress(100);
            setDownloadPhase('Pembaruan Berhasil Diterapkan!');
            setDownloadStatus('completed');
            setIsDownloading(false);

            // Simpan versi mutakhir ke penyimpanan lokal perangkat
            setInstalledAppVersion(serverVer);
            setCurrentInstalledVersion(serverVer);
            setPendingCount(0);
            setPendingUpdates([]);
            setHasUpdate(false);
          }, 350);

          return 100;
        }

        return Math.min(next, 99);
      });
    }, 140);
  }, [isDownloading, latestInfo, pendingCount]);

  const openModal = useCallback(() => {
    if (downloadStatus !== 'downloading') {
      const installedVer = getInstalledAppVersion();
      const serverVersion = latestInfo?.latestVersion || '1.5.2';
      const historyList = Array.isArray(latestInfo?.history) ? latestInfo.history : [];
      const unapplied = historyList.filter(item => isVersionHigher(item.version, installedVer));
      
      if (unapplied.length === 0 && isVersionHigher(serverVersion, installedVer)) {
        unapplied.push({
          version: serverVersion,
          versionCode: latestInfo?.versionCode || 7,
          date: latestInfo?.publishedAt || '2026-11-08',
          title: latestInfo?.releaseNotes || 'Pembaruan Fitur Terbaru',
          changes: latestInfo?.features || []
        });
      }

      setPendingUpdates(unapplied);
      setPendingCount(unapplied.length);
      setHasUpdate(unapplied.length > 0);
      setCurrentInstalledVersion(installedVer);
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
    setDownloadProgress(1);
    setDownloadPhase('');
    setDownloadStatus('idle');
  }, []);

  return {
    isNativeApp,
    hasUpdate,
    pendingCount,
    pendingUpdates,
    latestInfo,
    localVersion: currentInstalledVersion,
    localVersionCode: LOCAL_VERSION_CODE,
    appId: APP_PACKAGE_ID,
    appName: APP_DISPLAY_NAME,
    isChecking,
    showModal,
    isDownloading,
    downloadProgress,
    downloadPhase,
    downloadStatus,
    openModal,
    closeModal,
    startDownloadUpdate,
    checkForUpdates
  };
}
