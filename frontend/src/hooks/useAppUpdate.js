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
  const [currentInstalledVersion, setCurrentInstalledVersion] = useState(LOCAL_APP_VERSION);
  
  // State unduhan APK
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
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

  // Silent Fetch pengecekan versi saat aplikasi diluncurkan (on-launch)
  const checkForUpdates = useCallback(async () => {
    setIsChecking(true);
    try {
      const cacheBuster = `?t=${Date.now()}`;
      let data = null;

      // 1. Prioritas utama: Ambil dari remote Vercel live server agar APK selalu sinkron dengan rilis web terbaru
      try {
        const remoteRes = await fetch(`https://alltoolskuro.vercel.app/version.json${cacheBuster}`, {
          cache: 'no-store'
        });
        if (remoteRes.ok) {
          data = await remoteRes.json();
        }
      } catch {
        // Abaikan jika network offline
      }

      // 2. Fallback ke endpoint API remote
      if (!data) {
        try {
          const apiRes = await fetch(`https://alltoolskuro.vercel.app/api/version${cacheBuster}`);
          if (apiRes.ok) {
            data = await apiRes.json();
          }
        } catch {
          // Abaikan
        }
      }

      // 3. Fallback ke file version.json lokal
      if (!data) {
        try {
          const localRes = await fetch(`/version.json${cacheBuster}`);
          if (localRes.ok) {
            data = await localRes.json();
          }
        } catch {
          // Abaikan
        }
      }

      if (!data) {
        // Fallback data rilis terbaru jika server tidak merespon
        data = {
          latestVersion: '1.3.0',
          versionCode: 3,
          releaseNotes: 'Rilis Pembaruan v1.3.0: 3 Fitur Baru (CapCut JJ, Rekomendasi Anime & Manhwa) dan Optimalisasi Real-Time.',
          features: [
            'Pencari Template CapCut: Cari preset JJ viral via lirik & pratinjau loop video dengan direct link resmi CapCut.',
            'Pencari Rekomendasi Anime: Rekomendasi cerdas modal pilihan genre & kombinasi genre favorit, rating skor MAL, dan sinopsis.',
            'Pencari Rekomendasi Manhwa: Kurasi webtoon Korea modal kombinasi genre, rating pembaca, cover seni HD, dan sinopsis cerita.',
            'Real-Time Live Search: Seluruh pencarian dan saringan genre kini berjalan seketika (real-time).',
            'Penyempurnaan Stabilitas: Pembaruan telemetri sistem bebas proxy error.'
          ],
          apkUrl: 'https://alltoolskuro.vercel.app/AllToolsKuro.apk',
          fileSize: '12.4 MB',
          publishedAt: '2026-11-08'
        };
      }

      setLatestInfo(data);

      const serverVersion = data.latestVersion || '1.3.0';
      const installedVer = getInstalledAppVersion();
      setCurrentInstalledVersion(installedVer);

      // Cek apakah serverVersion lebih tinggi dari versi yang terpasang di perangkat
      const isNewer = isVersionHigher(serverVersion, installedVer);
      setHasUpdate(isNewer);

    } catch (err) {
      console.warn('[AppUpdate] Silent check error:', err);
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

  // Eksekusi pengunduhan APK terbaru dengan progress bar
  const startDownloadUpdate = useCallback(() => {
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStatus('downloading');

    if (downloadIntervalRef.current) {
      clearInterval(downloadIntervalRef.current);
    }

    // Jalankan progress bar
    downloadIntervalRef.current = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 95) {
          clearInterval(downloadIntervalRef.current);
          downloadIntervalRef.current = null;

          // Selesaikan unduhan ke 100% dan trigger installer APK
          setTimeout(() => {
            setDownloadProgress(100);
            setDownloadStatus('completed');
            setIsDownloading(false);

            const serverVer = latestInfo?.latestVersion || '1.2.0';
            const apkUrl = latestInfo?.apkUrl || 'https://alltoolskuro.vercel.app/AllToolsKuro.apk';
            
            // Catat versi terbaru sebagai terpasang sehingga kedip & notif merah hilang
            setInstalledAppVersion(serverVer);
            setCurrentInstalledVersion(serverVer);
            setHasUpdate(false);

            // Buka installer APK pada native Android atau browser
            try {
              if (window.Capacitor?.isNativePlatform?.() || Capacitor.isNativePlatform()) {
                window.open(apkUrl, '_system');
              }
            } catch (err) {
              console.warn('[AppUpdate] Window open error:', err);
            }

            // Trigger link download
            const link = document.createElement('a');
            link.href = apkUrl;
            link.download = 'AllToolsKuro.apk';
            link.target = '_system';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Fallback lokasi window
            setTimeout(() => {
              if (typeof window !== 'undefined') {
                window.location.assign(apkUrl);
              }
            }, 300);

          }, 300);

          return 95;
        }

        const increment = Math.floor(Math.random() * 8) + 5;
        return Math.min(prev + increment, 95);
      });
    }, 150);
  }, [isDownloading, latestInfo]);

  const openModal = useCallback(() => {
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    if (downloadIntervalRef.current) {
      clearInterval(downloadIntervalRef.current);
      downloadIntervalRef.current = null;
    }
    setIsDownloading(false);
    setDownloadProgress(0);
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
    downloadStatus,
    openModal,
    closeModal,
    startDownloadUpdate,
    checkForUpdates
  };
}
