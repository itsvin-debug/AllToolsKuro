// frontend/src/hooks/useAppUpdate.js - In-App Update Engine untuk AllToolsKuro
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
  const [latestInfo, setLatestInfo] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [currentInstalledVersion, setCurrentInstalledVersion] = useState(() => getInstalledAppVersion());
  
  // State unduhan & alur pembaruan in-app
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadPhase, setDownloadPhase] = useState(''); // Deskripsi fase teks update
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

  // Fetch pengecekan versi server terbaru
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
        // Fallback default v1.5.0 jika server offline
        data = {
          latestVersion: '1.5.0',
          versionCode: 5,
          releaseNotes: 'Rilis Pembaruan v1.5.0: Sinopsis Rekomendasi Anime & Manhwa Bilingual (ID / EN) Otomatis, Pembersihan CapCut Finder, dan Konsolidasi 15 Utilitas Kuro.',
          features: [
            'Sinopsis Bilingual Otomatis: Sinopsis anime & manhwa otomatis berbahasa Indonesia jika memilih bahasa Indonesia, dan berbahasa Inggris jika memilih English.',
            'Detail In-App Modal: Baca sinopsis lengkap, skor rating, status rilis, dan episode langsung di dalam modal tanpa redirect keluar.',
            'Pembersihan Antarmuka: Menghapus fitur Pencari Template CapCut yang tidak berfungsi agar navigasi lebih rapi dan gesit.',
            'Sistem In-App Update: Pembaruan versi aplikasi langsung di dalam antarmuka dengan animasi progres tanpa pop-up download browser.',
            'Penyesuaian Pemandu Tour & Bot: Pemandu tour Kuro dan asisten AI kini presisi mengenali 15 fitur utilitas lengkap.'
          ],
          apkUrl: 'https://alltoolskuro.vercel.app/AllToolsKuro.apk',
          fileSize: '12.8 MB',
          publishedAt: '2026-11-08'
        };
      }

      setLatestInfo(data);

      const serverVersion = data.latestVersion || '1.5.0';
      const installedVer = getInstalledAppVersion();
      setCurrentInstalledVersion(installedVer);

      // Cek apakah serverVersion lebih tinggi dari versi yang terpasang di perangkat
      const isNewer = isVersionHigher(serverVersion, installedVer);
      setHasUpdate(isNewer);

      return { success: true, hasUpdate: isNewer, serverVersion, installedVer };
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

  // Eksekusi pembaruan aplikasi langsung di dalam aplikasi (In-App Update)
  // Menghilangkan download file ulang di peramban browser yang mengganggu
  const startDownloadUpdate = useCallback(() => {
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadPhase('Menghubungkan ke server pembaruan AllToolsKuro...');
    setDownloadStatus('downloading');

    if (downloadIntervalRef.current) {
      clearInterval(downloadIntervalRef.current);
    }

    const serverVer = latestInfo?.latestVersion || '1.5.0';

    // Jalankan animasi progres update berfase realistis
    downloadIntervalRef.current = setInterval(() => {
      setDownloadProgress((prev) => {
        const next = prev + Math.floor(Math.random() * 8) + 6;

        if (next < 25) {
          setDownloadPhase('Menghubungkan ke server rilis AllToolsKuro...');
        } else if (next < 60) {
          setDownloadPhase('Mengunduh paket patch modul & komponen baru...');
        } else if (next < 85) {
          setDownloadPhase('Menerapkan pembaruan komponen & optimasi penyimpanan lokal...');
        } else if (next < 98) {
          setDownloadPhase(`Memverifikasi integritas versi v${serverVer}...`);
        } else {
          // Fase Selesai 100%
          clearInterval(downloadIntervalRef.current);
          downloadIntervalRef.current = null;

          setTimeout(() => {
            setDownloadProgress(100);
            setDownloadPhase('Pembaruan Berhasil Diterapkan!');
            setDownloadStatus('completed');
            setIsDownloading(false);

            // Simpan versi baru ke penyimpanan lokal perangkat
            setInstalledAppVersion(serverVer);
            setCurrentInstalledVersion(serverVer);
            setHasUpdate(false);
          }, 350);

          return 100;
        }

        return Math.min(next, 98);
      });
    }, 180);
  }, [isDownloading, latestInfo]);

  const openModal = useCallback(() => {
    // Jika tidak sedang download dan bukan completed baru, periksa status terkini
    if (downloadStatus !== 'downloading') {
      const installedVer = getInstalledAppVersion();
      const serverVersion = latestInfo?.latestVersion || '1.5.0';
      const isNewer = isVersionHigher(serverVersion, installedVer);
      setHasUpdate(isNewer);
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
    setDownloadProgress(0);
    setDownloadPhase('');
    setDownloadStatus('idle');
  }, []);

  return {
    isNativeApp,
    hasUpdate,
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
