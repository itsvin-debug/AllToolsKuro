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
      let res = await fetch(`/version.json${cacheBuster}`);
      
      if (!res.ok) {
        res = await fetch(`/api/version${cacheBuster}`);
      }

      if (!res.ok) {
        throw new Error(`Gagal membaca versi server (HTTP ${res.status})`);
      }

      const data = await res.json();
      setLatestInfo(data);

      const serverVersion = data.latestVersion || '1.0.0';
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
