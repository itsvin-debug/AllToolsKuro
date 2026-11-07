// frontend/src/config/apiConfig.js - Resolusi Base URL API untuk Native Android & Web
import { Capacitor } from '@capacitor/core';
import axios from 'axios';

export const PROD_API_BASE_URL = 'https://alltoolskuro.vercel.app';

export function getApiBaseUrl() {
  if (typeof window === 'undefined') return '';
  try {
    const isNative = Capacitor.isNativePlatform() || Boolean(window.Capacitor?.isNativePlatform?.());
    return isNative ? PROD_API_BASE_URL : '';
  } catch {
    return '';
  }
}

// Atur axios baseURL jika berjalan di lingkungan native Android
const nativeApiBase = getApiBaseUrl();
if (nativeApiBase) {
  axios.defaults.baseURL = nativeApiBase;

  // Intersep pemanggilan fetch relatif di native Android agar mengarah ke server Vercel
  if (typeof window !== 'undefined' && window.fetch) {
    const originalFetch = window.fetch;
    window.fetch = function (resource, init) {
      if (typeof resource === 'string' && resource.startsWith('/')) {
        return originalFetch(`${PROD_API_BASE_URL}${resource}`, init);
      }
      return originalFetch(resource, init);
    };
  }
}

