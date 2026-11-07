// frontend/src/hooks/useAppUpdate.js - In-App Update Engine untuk AllToolsKuro
import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { 
  LOCAL_APP_VERSION, 
  LOCAL_VERSION_CODE, 
  isVersionHigher,
  APP_PACKAGE_ID,
  APP_DISPLAY_NAME
} from '../config/appVersion';

export function useAppUpdate() {
  const [isNativeApp, setIsNativeApp] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestInfo, setLatestInfo] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showModal, setShowModal] = useState(false);
  
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
      }
    } catch {
      setIsNativeApp(false);
    }
  }, []);

  // Silent Fetch pengecekan versi saat aplikasi diluncurkan (on-launch)
  const checkForUpdates = useCallback(async () => {
    setIsChecking(true);
    try {
      // Prioritaskan endpoint version.json dengan cache-buster
      const cacheBuster = `?t=${Date.now()}`;
      let res = await fetch(`/version.json${cacheBuster}`);
      
      // Fallback ke /api/version jika file statis tidak merespons
      if (!res.ok) {
        res = await fetch(`/api/version${cacheBuster}`);
      }

      if (!res.ok) {
        throw new Error(`Gagal membaca versi server (HTTP ${res.status})`);
      }

      const data = await res.json();
      setLatestInfo(data);

      const serverVersion = data.latestVersion || '1.0.0';
      const serverCode = data.versionCode || 1;

      // Cek apakah ada versi baru baik dari SemVer maupun versionCode
      const isNewer = isVersionHigher(serverVersion, LOCAL_APP_VERSION) || (serverCode > LOCAL_VERSION_CODE);
      setHasUpdate(isNewer);

    } catch (err) {
      console.warn('[AppUpdate] Silent check error:', err);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    // Jalankan silent check saat pertama kali aplikasi dibuka
    checkForUpdates();
  }, [checkForUpdates]);

  // Bersihkan timer download jika komponen unmount
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

    // Simulasi progress pengunduhan halus dan konsisten
    downloadIntervalRef.current = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 95) {
          clearInterval(downloadIntervalRef.current);
          downloadIntervalRef.current = null;

          // Selesaikan unduhan ke 100% dan luncurkan installer APK
          setTimeout(() => {
            setDownloadProgress(100);
            setDownloadStatus('completed');
            setIsDownloading(false);

            // Buka installer APK terbaru
            const downloadUrl = latestInfo?.apkUrl || '/AllToolsKuro.apk';
            
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = 'AllToolsKuro.apk';
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Trigger window redirect fallback untuk webview Android
            if (typeof window !== 'undefined') {
              setTimeout(() => {
                window.location.href = downloadUrl;
              }, 400);
            }
          }, 350);

          return 95;
        }

        // Kenaikan acak berangsur untuk visual realistis
        const increment = Math.floor(Math.random() * 8) + 4;
        return Math.min(prev + increment, 95);
      });
    }, 180);
  }, [isDownloading, latestInfo]);

  const openModal = useCallback(() => {
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    // Jika batal saat mengunduh, reset status unduhan agar siap diulang nanti
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
    localVersion: LOCAL_APP_VERSION,
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

