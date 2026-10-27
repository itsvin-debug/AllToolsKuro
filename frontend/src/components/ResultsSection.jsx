import React, { useState, useEffect, useRef, useMemo } from 'react';
import JSZip from 'jszip';
import CosmicBackButton from './CosmicBackButton';
import { addGalleryItem } from '../services/storageService';
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Images,
  Play,
  Pause,
  Music2,
  CheckCircle2,
  RefreshCw,
  Clock,
  Volume2,
  VolumeX,
  FileArchive,
  RotateCcw,
  RotateCw,
  Disc3,
  Film,
  Sparkles,
  Layers,
  Zap
} from 'lucide-react';

export default function ResultsSection({ result, preferredFormat = '1080p', onReset, onBack, lang = 'id' }) {
  const isEn = lang === 'en';
  if (!result || !result.downloadLinks || result.downloadLinks.length === 0) {
    return null;
  }

  // 1. Ekstraksi Photo Slides
  const photoSlides = useMemo(() => {
    const rawPhotos = (result.photos && result.photos.length > 0)
      ? result.photos
      : (result.downloadLinks?.filter((l) => l.type === 'image') || []);

    return rawPhotos.map((p, idx) => ({
      ...p,
      id: p.id || `photo_${idx + 1}`,
      type: 'photo',
      label: p.label || `Foto Slide #${idx + 1}`,
      quality: p.quality || 'HD 1080p Image',
      filename: p.filename || `slide_${idx + 1}_hd.jpg`
    }));
  }, [result]);

  // 2. Ekstraksi Video Slides
  const videoSlidesList = useMemo(() => {
    const rawVideos = (result.videoSlides && result.videoSlides.length > 0)
      ? result.videoSlides
      : (result.downloadLinks?.filter((l) => 
          l.type === 'video' && (l.id?.includes('slide') || l.label?.toLowerCase().includes('slide') || (result.isSlide && l.id !== 'audio'))
        ) || []);

    return rawVideos.map((v, idx) => ({
      ...v,
      id: v.id || `videoslide_${idx + 1}`,
      type: 'video',
      label: v.label || `Video Slide #${idx + 1}`,
      quality: v.quality || 'HD 1080p Video',
      filename: v.filename || `video_slide_${idx + 1}.mp4`
    }));
  }, [result]);

  // 3. Ekstraksi Live Wallpapers
  const liveWallpaperList = useMemo(() => {
    const rawWallpapers = (result.liveWallpapers && result.liveWallpapers.length > 0)
      ? result.liveWallpapers
      : (result.downloadLinks?.filter((l) => 
          l.type === 'live_wallpaper' || 
          l.id?.includes('wallpaper') || 
          l.label?.toLowerCase().includes('wallpaper') ||
          l.id?.includes('dynamic')
        ) || []);

    return rawWallpapers.map((w, idx) => ({
      ...w,
      id: w.id || `wallpaper_${idx + 1}`,
      type: 'live_wallpaper',
      label: w.label || `Live Wallpaper #${idx + 1}`,
      quality: w.quality || 'Dynamic Motion Loop',
      filename: w.filename || `live_wallpaper_${idx + 1}.${w.extension || 'mp4'}`
    }));
  }, [result]);

  const hasPhotos = photoSlides.length > 0;
  const hasVideoSlides = videoSlidesList.length > 0;
  const hasLiveWallpapers = liveWallpaperList.length > 0;
  const isMultiContentPost = hasPhotos || hasVideoSlides || hasLiveWallpapers || result.isSlide || result.mediaType === 'slide';

  const regularVideoLinks = !isMultiContentPost
    ? (result.downloadLinks?.filter((l) => l.type === 'video') || [])
    : [];
  const hasVideo = regularVideoLinks.length > 0;

  const audioLinks = result.downloadLinks?.filter((l) => l.type === 'audio') || [];
  const activeAudio = audioLinks[0] || null;

  const [selectedQualityIndex, setSelectedQualityIndex] = useState(1);
  const [selectedPhotoRes, setSelectedPhotoRes] = useState('1080p');

  // Pilihan kualitas resolusi lengkap untuk video (4K, 1080p, 720p, MP3)
  const videoQualityOptions = useMemo(() => {
    if (!hasVideo && regularVideoLinks.length === 0) return [];

    const existing4k = regularVideoLinks.find(l => {
      const id = (l.id || '').toLowerCase();
      const q = (l.quality || '').toLowerCase();
      const lbl = (l.label || '').toLowerCase();
      return id === '2160p' || q.includes('2160') || q.includes('4k') || lbl.includes('4k') || lbl.includes('2160');
    });

    const existing1080 = regularVideoLinks.find(l => {
      const id = (l.id || '').toLowerCase();
      const q = (l.quality || '').toLowerCase();
      const lbl = (l.label || '').toLowerCase();
      return id === '1080p' || q.includes('1080') || lbl.includes('1080');
    });

    const existing720 = regularVideoLinks.find(l => {
      const id = (l.id || '').toLowerCase();
      const q = (l.quality || '').toLowerCase();
      const lbl = (l.label || '').toLowerCase();
      return id === '720p' || q.includes('720') || lbl.includes('720');
    });

    const masterVideo = regularVideoLinks[0] || (result.downloadLinks?.find(l => l.type === 'video')) || null;
    if (!masterVideo) return regularVideoLinks;

    const baseName = (result.platform || 'video').toLowerCase();
    const mediaId = result.id || Date.now();

    const options = [
      {
        id: '2160p',
        key: '2160p',
        label: isEn ? '4K Ultra HD (2160p)' : 'Resolusi 4K Ultra HD',
        badge: isEn ? 'Max Clarity' : 'Jernih Maksimal',
        quality: '4K Ultra HD (2160p)',
        desc: isEn ? 'Master source resolution for large screens' : 'Kualitas tertinggi ultra tajam',
        url: existing4k?.url || masterVideo.url,
        streamUrl: existing4k?.streamUrl || masterVideo.streamUrl,
        proxyUrl: existing4k?.proxyUrl || masterVideo.proxyUrl,
        type: 'video',
        extension: 'mp4',
        filename: existing4k?.filename || `${baseName}_${mediaId}_4k.mp4`
      },
      {
        id: '1080p',
        key: '1080p',
        label: isEn ? '1080p Full HD' : 'Resolusi HD 1080p',
        badge: isEn ? 'Status WA Anti-Blur' : 'Rekomendasi Status WA',
        quality: '1080p (Full HD)',
        desc: isEn ? 'Optimized for WhatsApp Status without compression blur' : 'Anti-burik, format pas untuk Status WA',
        url: existing1080?.url || masterVideo.url,
        streamUrl: existing1080?.streamUrl || masterVideo.streamUrl,
        proxyUrl: existing1080?.proxyUrl || masterVideo.proxyUrl,
        type: 'video',
        extension: 'mp4',
        filename: existing1080?.filename || `${baseName}_${mediaId}_1080p.mp4`
      },
      {
        id: '720p',
        key: '720p',
        label: isEn ? '720p HD' : 'Resolusi HD 720p',
        badge: isEn ? 'Fast' : 'Standar Cepat',
        quality: '720p (Standard HD)',
        desc: isEn ? 'Lightweight and fast download' : 'Hemat kuota dan unduh cepat',
        url: existing720?.url || masterVideo.url,
        streamUrl: existing720?.streamUrl || masterVideo.streamUrl,
        proxyUrl: existing720?.proxyUrl || masterVideo.proxyUrl,
        type: 'video',
        extension: 'mp4',
        filename: existing720?.filename || `${baseName}_${mediaId}_720p.mp4`
      }
    ];

    if (activeAudio) {
      options.push({
        id: 'audio',
        key: 'audio',
        label: isEn ? 'Audio MP3' : 'Audio MP3',
        badge: isEn ? 'Extract' : 'Ekstrak Suara',
        quality: '320kbps MP3',
        desc: isEn ? 'Clean standalone sound track' : 'Trek audio jernih tanpa video',
        url: activeAudio.url,
        streamUrl: activeAudio.streamUrl,
        proxyUrl: activeAudio.proxyUrl,
        type: 'audio',
        extension: 'mp3',
        filename: activeAudio.filename || `${baseName}_audio_${mediaId}.mp3`
      });
    }

    return options;
  }, [regularVideoLinks, activeAudio, hasVideo, result, isEn]);

  // Kategori filter aktif: 'photo' | 'video' | 'live_wallpaper' | 'all'
  const [contentTypeFilter, setContentTypeFilter] = useState(() => {
    if (hasPhotos) return 'photo';
    if (hasVideoSlides) return 'video';
    if (hasLiveWallpapers) return 'live_wallpaper';
    return 'all';
  });

  const allCombinedSlides = useMemo(() => {
    return [...photoSlides, ...videoSlidesList, ...liveWallpaperList];
  }, [photoSlides, videoSlidesList, liveWallpaperList]);

  const activeSlideList = useMemo(() => {
    if (contentTypeFilter === 'photo' && hasPhotos) return photoSlides;
    if (contentTypeFilter === 'video' && hasVideoSlides) return videoSlidesList;
    if (contentTypeFilter === 'live_wallpaper' && hasLiveWallpapers) return liveWallpaperList;
    if (contentTypeFilter === 'all') return allCombinedSlides;
    return photoSlides.length > 0 ? photoSlides : allCombinedSlides;
  }, [contentTypeFilter, photoSlides, videoSlidesList, liveWallpaperList, allCombinedSlides, hasPhotos, hasVideoSlides, hasLiveWallpapers]);

  const allSlidesToDownload = useMemo(() => {
    const list = [];
    const seen = new Set();
    [...photoSlides, ...videoSlidesList, ...liveWallpaperList].forEach(item => {
      if (item && item.url && !seen.has(item.url)) {
        seen.add(item.url);
        list.push(item);
      }
    });
    return list.length > 0 ? list : allCombinedSlides;
  }, [photoSlides, videoSlidesList, liveWallpaperList, allCombinedSlides]);

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState({});
  const [downloadingAllSlides, setDownloadingAllSlides] = useState(false);
  const [downloadAllProgressText, setDownloadAllProgressText] = useState('');
  const [detectedDuration, setDetectedDuration] = useState('');

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [currentAudioSrcIndex, setCurrentAudioSrcIndex] = useState(0);

  const [touchStartX, setTouchStartX] = useState(null);

  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const slideVideoRef = useRef(null);
  const liveWallpaperRef = useRef(null);

  const audioSources = useMemo(() => {
    if (!activeAudio) return [];
    const list = [];
    if (activeAudio.streamUrl) list.push(activeAudio.streamUrl);
    if (activeAudio.url) {
      list.push(`/api/proxy-stream?url=${encodeURIComponent(activeAudio.url)}&type=audio`);
    }
    if (activeAudio.proxyUrl) list.push(activeAudio.proxyUrl);
    if (activeAudio.url) list.push(activeAudio.url);
    return [...new Set(list)];
  }, [activeAudio]);

  const activeAudioSrc = audioSources[currentAudioSrcIndex] || audioSources[0] || '';

  // Sinkronisasi reset saat media baru dimuat
  useEffect(() => {
    setCurrentSlideIndex(0);
    if (hasPhotos) setContentTypeFilter('photo');
    else if (hasVideoSlides) setContentTypeFilter('video');
    else if (hasLiveWallpapers) setContentTypeFilter('live_wallpaper');
    else setContentTypeFilter('all');

    setIsPlayingAudio(false);
    setIsAudioLoading(false);
    setAudioCurrentTime(0);
    setCurrentAudioSrcIndex(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, [result, hasPhotos, hasVideoSlides, hasLiveWallpapers]);

  // Hentikan video & animasi saat berganti slide untuk mencegah kebocoran memori/suara
  useEffect(() => {
    if (slideVideoRef.current) {
      try {
        slideVideoRef.current.pause();
      } catch {}
    }
    if (liveWallpaperRef.current) {
      try {
        liveWallpaperRef.current.pause();
      } catch {}
    }
  }, [currentSlideIndex, contentTypeFilter]);

  // Preload gambar slide terdekat secara instan tanpa lag
  useEffect(() => {
    if (!activeSlideList || activeSlideList.length <= 1) return;
    const nextIdx = (currentSlideIndex + 1) % activeSlideList.length;
    const prevIdx = (currentSlideIndex - 1 + activeSlideList.length) % activeSlideList.length;
    [nextIdx, prevIdx].forEach(idx => {
      const item = activeSlideList[idx];
      if (item && (item.type === 'photo' || item.type === 'image') && item.url) {
        const img = new Image();
        img.src = item.url;
      }
    });
  }, [currentSlideIndex, activeSlideList]);

  useEffect(() => {
    if (!videoQualityOptions || videoQualityOptions.length === 0) return;

    // Cari kecocokan presisi berdasarkan resolusi yang dipilih pengguna
    const target = (preferredFormat || '1080p').toLowerCase();
    const matchIdx = videoQualityOptions.findIndex(o => {
      const oid = (o.id || '').toLowerCase();
      if (target === '2160p') return oid === '2160p';
      if (target === '1080p') return oid === '1080p';
      if (target === '720p') return oid === '720p';
      if (target === 'mp3' || target === 'audio') return oid === 'audio';
      return oid === target;
    });

    if (matchIdx !== -1) {
      setSelectedQualityIndex(matchIdx);
    } else {
      const default1080 = videoQualityOptions.findIndex(o => o.id === '1080p');
      setSelectedQualityIndex(default1080 !== -1 ? default1080 : 0);
    }
  }, [preferredFormat, videoQualityOptions]);

  const activeRegularVideo = videoQualityOptions[selectedQualityIndex] || videoQualityOptions[0] || regularVideoLinks[0];
  const activeSlide = activeSlideList[currentSlideIndex] || activeSlideList[0];

  // Proses canvas client-side agar foto pas ukuran 1080p native Status WA (anti-burik)
  const processImageResolution = async (imageUrl, targetRes = '1080p') => {
    return new Promise((resolve) => {
      if (targetRes === '2160p') {
        resolve(null);
        return;
      }

      const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(imageUrl)}&filename=image_temp.jpg`;
      fetch(proxyUrl)
        .then(res => res.blob())
        .then(blob => {
          const blobObjUrl = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            try {
              let width = img.naturalWidth || img.width;
              let height = img.naturalHeight || img.height;
              if (!width || !height) {
                URL.revokeObjectURL(blobObjUrl);
                resolve(null);
                return;
              }

              const aspectRatio = width / height;

              if (targetRes === '1080p') {
                if (aspectRatio < 1) {
                  height = 1920;
                  width = Math.round(1920 * aspectRatio);
                } else {
                  width = 1920;
                  height = Math.round(1920 / aspectRatio);
                }
              } else if (targetRes === '720p') {
                if (aspectRatio < 1) {
                  height = 1280;
                  width = Math.round(1280 * aspectRatio);
                } else {
                  width = 1280;
                  height = Math.round(1280 / aspectRatio);
                }
              }

              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, width, height);
              ctx.drawImage(img, 0, 0, width, height);

              canvas.toBlob((resBlob) => {
                URL.revokeObjectURL(blobObjUrl);
                resolve(resBlob || blob);
              }, 'image/jpeg', 0.96);
            } catch {
              URL.revokeObjectURL(blobObjUrl);
              resolve(blob);
            }
          };
          img.onerror = () => {
            URL.revokeObjectURL(blobObjUrl);
            resolve(blob);
          };
          img.src = blobObjUrl;
        })
        .catch(() => resolve(null));
    });
  };

  const downloadPhotoSlide = async (slideItem, index) => {
    if (!slideItem) return;
    const slideId = `slide_${slideItem.id || index}`;
    setDownloadingId(slideId);
    setDownloadProgress(prev => ({ ...prev, [slideId]: 15 }));

    const resLabel = selectedPhotoRes === '2160p' ? '4k' : selectedPhotoRes === '1080p' ? '1080p_sw' : '720p';
    const filename = `slide_${index + 1}_${resLabel}.jpg`;

    try {
      setDownloadProgress(prev => ({ ...prev, [slideId]: 45 }));
      const customBlob = await processImageResolution(slideItem.url, selectedPhotoRes);

      if (customBlob) {
        setDownloadProgress(prev => ({ ...prev, [slideId]: 90 }));
        const blobUrl = window.URL.createObjectURL(customBlob);
        const tempLink = document.createElement('a');
        tempLink.style.display = 'none';
        tempLink.href = blobUrl;
        tempLink.download = filename;
        document.body.appendChild(tempLink);
        tempLink.click();
        document.body.removeChild(tempLink);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);

        recordMediaInGallery(
          { ...slideItem, quality: selectedPhotoRes === '2160p' ? '4K Ultra HD' : selectedPhotoRes === '1080p' ? '1080p (Status WA Anti-Burik)' : '720p HD' },
          filename,
          slideId
        );
        setDownloadProgress(prev => ({ ...prev, [slideId]: 100 }));
        setTimeout(() => {
          setDownloadingId(null);
          setDownloadProgress(prev => {
            const next = { ...prev };
            delete next[slideId];
            return next;
          });
        }, 600);
      } else {
        downloadToDevice(slideItem, filename, slideId);
      }
    } catch {
      downloadToDevice(slideItem, filename, slideId);
    }
  };

  // Simpan media tunggal ke Galeri pengguna sesuai format aslinya (foto slide, video slide, video reguler, audio)
  const recordMediaInGallery = (mediaItem, finalFilename, explicitId) => {
    try {
      const isVid = mediaItem.type === 'video' || mediaItem.type === 'live_wallpaper';
      const isAud = mediaItem.type === 'audio';
      const isSlideItem = Boolean(
        explicitId?.toString().includes('slide') || 
        mediaItem.id?.toString().includes('slide') || 
        result.isSlide
      );

      const ext = mediaItem.extension || (isAud ? 'mp3' : isVid ? 'mp4' : 'jpg');

      const title = isSlideItem 
        ? `${result.title || 'Slide Post'} (${isVid ? (isEn ? 'Video Slide' : 'Slide Video') : (isEn ? 'Photo Slide' : 'Slide Foto')} #${currentSlideIndex + 1})`
        : (mediaItem.label || result.title || `Media ${result.platform || ''}`);

      addGalleryItem({
        title,
        type: isAud ? 'audio' : isVid ? 'video' : 'image',
        category: `Downloader (${result.platform || (isVid ? 'Video' : 'Foto')})`,
        extension: ext.toUpperCase(),
        size: mediaItem.quality || (isVid ? 'HD Video' : isAud ? '128kbps' : 'HD Foto'),
        thumbnail: mediaItem.thumbnail || (mediaItem.type === 'image' || mediaItem.type === 'photo' ? mediaItem.url : result.thumbnail),
        previewUrl: isVid ? (mediaItem.streamUrl || mediaItem.url) : mediaItem.url,
        downloadData: mediaItem.proxyUrl || mediaItem.url,
        filename: finalFilename
      });
    } catch (e) {
      console.error('Gagal mencatat unduhan ke galeri:', e);
    }
  };

  // Mengunduh media ke perangkat dengan indikator progres real-time jaringan (1-100%)
  const downloadToDevice = (mediaItem, customFilename = null, explicitId = null) => {
    if (!mediaItem) return;
    const mediaId = explicitId || mediaItem.id || mediaItem.type || 'media';
    setDownloadingId(mediaId);
    setDownloadProgress(prev => ({ ...prev, [mediaId]: 1 }));

    const ext = mediaItem.extension || (
      mediaItem.type === 'image' || mediaItem.type === 'photo' ? 'jpg' :
      mediaItem.type === 'audio' ? 'mp3' : 'mp4'
    );

    const filename = customFilename || mediaItem.filename || (
      mediaItem.type === 'image' || mediaItem.type === 'photo'
        ? `kuro_photo_${Date.now()}.${ext}` 
        : mediaItem.type === 'audio' 
        ? `kuro_audio_${Date.now()}.mp3` 
        : mediaItem.type === 'live_wallpaper'
        ? `kuro_live_wallpaper_${Date.now()}.${ext}`
        : `kuro_video_${Date.now()}.${ext}`
    );

    const proxyUrl = mediaItem.proxyUrl 
      || `/api/proxy-download?url=${encodeURIComponent(mediaItem.url)}&filename=${encodeURIComponent(filename)}`;

    // Catat ke Galeri perangkat lokal
    recordMediaInGallery(mediaItem, filename, mediaId);

    const xhr = new XMLHttpRequest();
    xhr.open('GET', proxyUrl, true);
    xhr.responseType = 'blob';

    xhr.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.min(99, Math.max(1, Math.round((event.loaded / event.total) * 100)));
        setDownloadProgress(prev => ({ ...prev, [mediaId]: percent }));
      } else {
        const loadedKb = event.loaded / 1024;
        const approx = Math.min(96, Math.max(5, Math.round((loadedKb / 6000) * 100)));
        setDownloadProgress(prev => ({ ...prev, [mediaId]: approx }));
      }
    };

    const cleanup = () => {
      setTimeout(() => {
        setDownloadingId(null);
        setDownloadProgress(prev => {
          const next = { ...prev };
          delete next[mediaId];
          return next;
        });
      }, 700);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        setDownloadProgress(prev => ({ ...prev, [mediaId]: 100 }));
        const blob = xhr.response;
        const blobUrl = window.URL.createObjectURL(blob);
        const tempLink = document.createElement('a');
        tempLink.style.display = 'none';
        tempLink.href = blobUrl;
        tempLink.download = filename;
        document.body.appendChild(tempLink);
        tempLink.click();
        document.body.removeChild(tempLink);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
        cleanup();
      } else {
        fallbackDownload();
      }
    };

    const fallbackDownload = () => {
      setDownloadProgress(prev => ({ ...prev, [mediaId]: 100 }));
      // Gunakan trigger link tersembunyi tanpa target='_blank' agar tidak membuka tab putih
      const tempLink = document.createElement('a');
      tempLink.style.display = 'none';
      tempLink.href = proxyUrl;
      tempLink.download = filename;
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
      cleanup();
    };

    xhr.onerror = fallbackDownload;
    xhr.send();
  };

  // Mengunduh seluruh slide sekaligus (foto, video slide, dan musik) ke dalam 1 arsip ZIP
  const handleDownloadAllSlidesZip = async () => {
    if (!allSlidesToDownload || allSlidesToDownload.length === 0) return;
    setDownloadingAllSlides(true);
    setDownloadAllProgressText(isEn ? 'Preparing ZIP...' : 'Menyiapkan ZIP...');

    const zip = new JSZip();
    const folder = zip.folder('slides');

    try {
      const totalItems = allSlidesToDownload.length;
      for (let i = 0; i < totalItems; i++) {
        const item = allSlidesToDownload[i];
        const isVid = item.type === 'video' || item.type === 'live_wallpaper';
        setDownloadAllProgressText(
          isEn 
            ? `Downloading ${isVid ? 'video' : 'photo'} ${i + 1} of ${totalItems}...` 
            : `Mengunduh ${isVid ? 'video slide' : 'foto slide'} ${i + 1} dari ${totalItems}...`
        );

        const ext = item.extension || (isVid ? 'mp4' : 'jpg');
        const resLabel = selectedPhotoRes === '2160p' ? '4k' : selectedPhotoRes === '1080p' ? '1080p_sw' : '720p';
        const filename = item.filename || (
          isVid ? `video_slide_${i + 1}.${ext}` : `slide_${i + 1}_${resLabel}.${ext}`
        );
        const proxyUrl = item.proxyUrl || `/api/proxy-download?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(filename)}`;

        try {
          if (!isVid && selectedPhotoRes !== '2160p') {
            const procBlob = await processImageResolution(item.url, selectedPhotoRes);
            if (procBlob) {
              folder.file(filename, procBlob);
              continue;
            }
          }

          const res = await fetch(proxyUrl);
          if (res.ok) {
            const blob = await res.blob();
            folder.file(filename, blob);
          }
        } catch {
          // Abaikan kegagalan individual agar proses batch tetap berlanjut
        }
      }

      // Pastikan audio trek dari postingan tetap disertakan di dalam arsip ZIP
      if (activeAudio && activeAudio.url) {
        setDownloadAllProgressText(isEn ? 'Including audio track...' : 'Menyertakan trek audio...');
        const audioFilename = activeAudio.filename || 'audio.mp3';
        const audioProxyUrl = activeAudio.proxyUrl || `/api/proxy-download?url=${encodeURIComponent(activeAudio.url)}&filename=${encodeURIComponent(audioFilename)}`;
        try {
          const aRes = await fetch(audioProxyUrl);
          if (aRes.ok) {
            const aBlob = await aRes.blob();
            folder.file(audioFilename, aBlob);
          }
        } catch {}
      }

      setDownloadAllProgressText(isEn ? 'Compressing ZIP archive...' : 'Mengompres arsip ZIP...');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = window.URL.createObjectURL(zipBlob);
      const zipFilename = `kuro_slides_${Date.now()}.zip`;

      // Simpan seluruh album koleksi slide ke Galeri pengguna agar bisa digeser di galeri
      try {
        addGalleryItem({
          title: result.title || `Koleksi Slide ${result.platform || ''}`,
          type: 'slide',
          category: `Downloader (${result.platform || 'Slide'})`,
          extension: 'SLIDES',
          size: `${totalItems} Slide`,
          thumbnail: allSlidesToDownload[0]?.thumbnail || allSlidesToDownload[0]?.url || result.thumbnail,
          previewUrl: allSlidesToDownload[0]?.url || result.thumbnail,
          downloadData: zipUrl,
          filename: zipFilename,
          slides: allSlidesToDownload.map((item, idx) => {
            const isVid = item.type === 'video' || item.type === 'live_wallpaper';
            const sExt = item.extension || (isVid ? 'mp4' : 'jpg');
            return {
              id: item.id || idx + 1,
              type: isVid ? 'video' : 'image',
              url: item.url,
              streamUrl: item.streamUrl || (isVid ? `/api/proxy-stream?url=${encodeURIComponent(item.url)}&type=video` : undefined),
              proxyUrl: item.proxyUrl || `/api/proxy-download?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(item.filename || `slide_${idx + 1}.${sExt}`)}`,
              filename: item.filename || `slide_${idx + 1}.${sExt}`,
              thumbnail: item.thumbnail || (item.type === 'image' || item.type === 'photo' ? item.url : result.thumbnail)
            };
          }),
          audio: (activeAudio && activeAudio.url) ? {
            url: activeAudio.url,
            streamUrl: activeAudio.streamUrl || `/api/proxy-stream?url=${encodeURIComponent(activeAudio.url)}&type=audio`,
            proxyUrl: activeAudio.proxyUrl || `/api/proxy-download?url=${encodeURIComponent(activeAudio.url)}&filename=audio.mp3`,
            title: result.musicInfo?.title || 'Trek Audio',
            filename: activeAudio.filename || 'audio.mp3'
          } : null
        });
      } catch (err) {
        console.error('Gagal menyimpan koleksi slide ke galeri:', err);
      }

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = zipUrl;
      a.download = zipFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(zipUrl), 3000);
    } catch (e) {
      console.error('Error generating zip:', e);
    } finally {
      setDownloadingAllSlides(false);
      setDownloadAllProgressText('');
    }
  };

  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setAudioCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration);
    }
  };

  const handleAudioSeek = (e) => {
    const time = parseFloat(e.target.value);
    setAudioCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleSeekDelta = (delta) => {
    if (audioRef.current) {
      const nextTime = Math.max(0, Math.min(audioDuration, audioRef.current.currentTime + delta));
      audioRef.current.currentTime = nextTime;
      setAudioCurrentTime(nextTime);
    }
  };

  const toggleAudioMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isAudioMuted;
      setIsAudioMuted(!isAudioMuted);
    }
  };

  const handleAudioError = () => {
    if (currentAudioSrcIndex < audioSources.length - 1) {
      setCurrentAudioSrcIndex(prev => prev + 1);
    }
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleNextSlide = () => {
    if (!activeSlideList || activeSlideList.length <= 1) return;
    setCurrentSlideIndex((prev) => (prev + 1) % activeSlideList.length);
  };

  const handlePrevSlide = () => {
    if (!activeSlideList || activeSlideList.length <= 1) return;
    setCurrentSlideIndex((prev) => (prev - 1 + activeSlideList.length) % activeSlideList.length);
  };

  const handleTouchStart = (e) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchStartX - touchEndX;

    if (diffX > 45) {
      handleNextSlide();
    } else if (diffX < -45) {
      handlePrevSlide();
    }
    setTouchStartX(null);
  };

  const handleVideoMetadata = (e) => {
    const sec = e.target.duration;
    if (sec && !isNaN(sec)) {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      setDetectedDuration(`${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`);
    }
  };

  const displayDuration = detectedDuration 
    ? `${detectedDuration} Menit` 
    : result.duration 
    ? `${result.duration}` 
    : null;

  return (
    <div className="w-full flex flex-col gap-5 mt-2">

      {/* ─── 1. MULTI-CONTENT SLIDE CAROUSEL (FOTO, VIDEO SLIDE, & LIVE WALLPAPER) ─── */}
      {isMultiContentPost && activeSlideList.length > 0 && (
        <div className="w-full bg-white border-2 border-black rounded-xl p-5 sm:p-6 shadow-[4px_4px_0px_#000000] flex flex-col gap-4 text-black">
          
          {/* Header & Smart Switcher Tabs */}
          <div className="flex flex-col gap-3 pb-3 border-b-2 border-black">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-md border-2 border-black bg-black text-white flex items-center justify-center shrink-0">
                  {contentTypeFilter === 'video' ? (
                    <Film className="w-4 h-4 stroke-[2.5]" />
                  ) : contentTypeFilter === 'live_wallpaper' ? (
                    <Sparkles className="w-4 h-4 stroke-[2.5]" />
                  ) : (
                    <Images className="w-4 h-4 stroke-[2.5]" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-black flex items-center gap-2">
                    <span>
                      {contentTypeFilter === 'photo' 
                        ? `Album Foto HD (${photoSlides.length} Slide)` 
                        : contentTypeFilter === 'video' 
                        ? `Video Slide (${videoSlidesList.length} Item)` 
                        : contentTypeFilter === 'live_wallpaper' 
                        ? `Live Wallpaper (${liveWallpaperList.length} Animasi Loop)` 
                        : `Pratinjau Multi-Konten (${activeSlideList.length} Item)`}
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-600">
                    Pilih kategori media atau geser layar untuk pratinjau instan tanpa lag
                  </p>
                </div>
              </div>

              <span className="px-3 py-1 rounded border-2 border-black text-xs font-mono font-bold bg-neutral-100 text-black self-start sm:self-auto shrink-0">
                Slide {currentSlideIndex + 1} dari {activeSlideList.length}
              </span>
            </div>

            {/* Smart Switcher Tabs (Aktif jika terdapat lebih dari satu jenis format media) */}
            {((hasPhotos && hasVideoSlides) || (hasPhotos && hasLiveWallpapers) || (hasVideoSlides && hasLiveWallpapers)) && (
              <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-0.5 custom-scrollbar">
                {hasPhotos && (
                  <button
                    type="button"
                    onClick={() => {
                      setContentTypeFilter('photo');
                      setCurrentSlideIndex(0);
                    }}
                    className={`px-3 py-1.5 rounded-lg border-2 border-black text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                      contentTypeFilter === 'photo'
                        ? 'bg-black text-white shadow-[2px_2px_0px_#000000]'
                        : 'bg-white text-black hover:bg-neutral-100'
                    }`}
                  >
                    <Images className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Foto HD ({photoSlides.length})</span>
                  </button>
                )}

                {hasVideoSlides && (
                  <button
                    type="button"
                    onClick={() => {
                      setContentTypeFilter('video');
                      setCurrentSlideIndex(0);
                    }}
                    className={`px-3 py-1.5 rounded-lg border-2 border-black text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                      contentTypeFilter === 'video'
                        ? 'bg-black text-white shadow-[2px_2px_0px_#000000]'
                        : 'bg-white text-black hover:bg-neutral-100'
                    }`}
                  >
                    <Film className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Video Slide ({videoSlidesList.length})</span>
                  </button>
                )}

                {hasLiveWallpapers && (
                  <button
                    type="button"
                    onClick={() => {
                      setContentTypeFilter('live_wallpaper');
                      setCurrentSlideIndex(0);
                    }}
                    className={`px-3 py-1.5 rounded-lg border-2 border-black text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                      contentTypeFilter === 'live_wallpaper'
                        ? 'bg-black text-white shadow-[2px_2px_0px_#000000]'
                        : 'bg-white text-black hover:bg-neutral-100'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Live Wallpaper ({liveWallpaperList.length})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setContentTypeFilter('all');
                    setCurrentSlideIndex(0);
                  }}
                  className={`px-3 py-1.5 rounded-lg border-2 border-black text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                    contentTypeFilter === 'all'
                      ? 'bg-black text-white shadow-[2px_2px_0px_#000000]'
                      : 'bg-white text-black hover:bg-neutral-100'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Semua ({allCombinedSlides.length})</span>
                </button>
              </div>
            )}
          </div>

          {/* Slide Frame / Viewport */}
          <div 
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="relative w-full max-w-xl mx-auto min-h-[360px] sm:min-h-[460px] max-h-[520px] rounded-lg overflow-hidden bg-neutral-950 border-2 border-black flex items-center justify-center select-none shadow-[2px_2px_0px_#000000]"
          >
            {activeSlide ? (
              activeSlide.type === 'video' ? (
                <video
                  ref={slideVideoRef}
                  key={`video-${activeSlide.streamUrl || activeSlide.url}`}
                  src={activeSlide.streamUrl || activeSlide.url}
                  poster={result.thumbnail || undefined}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-contain"
                />
              ) : activeSlide.type === 'live_wallpaper' ? (
                activeSlide.extension === 'webp' || activeSlide.url?.endsWith('.webp') ? (
                  <img
                    key={`wallpaper-img-${activeSlide.url}`}
                    src={activeSlide.url}
                    alt={activeSlide.label || 'Live Wallpaper'}
                    className="w-full h-full object-contain pointer-events-none"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <video
                    ref={liveWallpaperRef}
                    key={`wallpaper-vid-${activeSlide.streamUrl || activeSlide.url}`}
                    src={activeSlide.streamUrl || activeSlide.url}
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="auto"
                    className="w-full h-full object-contain"
                  />
                )
              ) : (
                <img
                  key={`photo-${activeSlide.url}`}
                  src={activeSlide.url}
                  alt={activeSlide.label || `Foto Slide ${currentSlideIndex + 1}`}
                  className="w-full h-full object-contain pointer-events-none transition-opacity duration-150"
                  referrerPolicy="no-referrer"
                  loading="eager"
                />
              )
            ) : (
              <div className="text-xs font-bold text-neutral-400">Media Siap Diunduh</div>
            )}

            {/* Navigation Chevrons */}
            {activeSlideList.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrevSlide}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-lg bg-white text-black border-2 border-black flex items-center justify-center cursor-pointer shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all z-10"
                  aria-label="Slide Sebelumnya"
                >
                  <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
                </button>
                <button
                  type="button"
                  onClick={handleNextSlide}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-lg bg-white text-black border-2 border-black flex items-center justify-center cursor-pointer shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all z-10"
                  aria-label="Slide Selanjutnya"
                >
                  <ChevronRight className="w-6 h-6 stroke-[2.5]" />
                </button>
              </>
            )}

            {/* Counter Badge */}
            <div className="absolute bottom-3 right-3 px-2.5 py-0.5 rounded border border-black bg-black text-white text-[10px] font-mono font-bold z-10">
              {currentSlideIndex + 1} / {activeSlideList.length}
            </div>

            {/* Content Type Badge */}
            <div className="absolute top-3 left-3 px-2.5 py-0.5 rounded border border-black bg-white text-black text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-sm z-10">
              {activeSlide?.type === 'video' ? (
                <>
                  <Film className="w-3 h-3 stroke-[2.5]" />
                  <span>VIDEO SLIDE</span>
                </>
              ) : activeSlide?.type === 'live_wallpaper' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-black inline-block animate-ping" />
                  <Sparkles className="w-3 h-3 stroke-[2.5]" />
                  <span>LIVE WALLPAPER (LOOP)</span>
                </>
              ) : (
                <>
                  <Images className="w-3 h-3 stroke-[2.5]" />
                  <span>FOTO HD</span>
                </>
              )}
            </div>
          </div>

          {/* Thumbnails Row */}
          {activeSlideList.length > 1 && (
            <div className="w-full flex items-center justify-start sm:justify-center gap-2 overflow-x-auto py-1 px-0.5 custom-scrollbar">
              {activeSlideList.map((item, idx) => {
                const isCurrent = idx === currentSlideIndex;
                return (
                  <button
                    key={`${item.id || idx}`}
                    onClick={() => setCurrentSlideIndex(idx)}
                    className={`relative w-12 h-12 rounded-md overflow-hidden shrink-0 border-2 transition-all cursor-pointer bg-neutral-200 ${
                      isCurrent 
                        ? 'border-black shadow-[2px_2px_0px_#000000] -translate-y-0.5' 
                        : 'border-neutral-300 opacity-60 hover:opacity-100 hover:border-black'
                    }`}
                  >
                    {item.type === 'video' ? (
                      <div className="w-full h-full bg-black text-white flex items-center justify-center">
                        <Play className="w-4 h-4 fill-white" />
                      </div>
                    ) : item.type === 'live_wallpaper' ? (
                      <div className="w-full h-full bg-black text-white flex items-center justify-center">
                        <Sparkles className="w-4 h-4" />
                      </div>
                    ) : (
                      <img 
                        src={item.url} 
                        alt={`Thumb ${idx + 1}`} 
                        className="w-full h-full object-cover pointer-events-none"
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Opsi Resolusi Foto Slide (4K, 1080p Status WA Anti-Burik, 720p) */}
          {hasPhotos && (
            <div className="flex flex-col gap-2 w-full pt-2">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-black flex items-center justify-between">
                <span>{isEn ? 'Choose Slide Resolution:' : 'Pilih Resolusi Foto / Slide:'}</span>
                <span className="text-neutral-500 font-bold">
                  {selectedPhotoRes === '2160p' ? '4K Ultra HD' : selectedPhotoRes === '1080p' ? (isEn ? '1080p Status WA' : '1080p (Status WA Anti-Burik)') : '720p HD'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 w-full">
                {[
                  { id: '2160p', label: '4K Ultra HD', badge: isEn ? 'Master Ultra' : 'Jernih Maksimal' },
                  { id: '1080p', label: '1080p Full HD', badge: isEn ? 'WA Status HD' : 'Format Pas Status WA' },
                  { id: '720p', label: '720p HD', badge: isEn ? 'Standard' : 'Standar Cepat' }
                ].map((opt) => {
                  const isSelected = selectedPhotoRes === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedPhotoRes(opt.id)}
                      className={`p-2 rounded-lg text-left transition-all duration-150 cursor-pointer border-2 border-black flex flex-col justify-between gap-1 ${
                        isSelected
                          ? 'bg-black text-white shadow-[2px_2px_0px_#000000] -translate-y-0.5'
                          : 'bg-white text-black hover:bg-neutral-100'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border border-current truncate ${isSelected ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-black'}`}>
                          {opt.badge}
                        </span>
                        {isSelected && <CheckCircle2 className="w-3 h-3 stroke-[2.5] text-white shrink-0" />}
                      </div>
                      <div className="font-extrabold text-[11px] sm:text-xs tracking-tight truncate">
                        {opt.label}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Status WA Anti-Burik Alert */}
              <div className="flex items-start gap-2 p-2.5 rounded-lg border-2 border-black bg-neutral-100 text-[11px] font-medium text-black">
                <Sparkles className="w-4 h-4 shrink-0 text-black mt-0.5" />
                <span className="leading-snug">
                  {isEn
                    ? 'WhatsApp Status Anti-Blur: 1080p format fits native WhatsApp Status dimensions perfectly so photos stay crystal clear without aggressive compression.'
                    : 'Status WA Anti-Burik: Format 1080p disesuaikan ke rasio resmi Status WhatsApp agar foto tidak dikompresi paksa menjadi burik oleh WhatsApp.'}
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons: Unduh Slide Ini & Unduh Semua Slide */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2 w-full">
            {activeSlide && (() => {
              const slideId = `slide_${activeSlide.id || currentSlideIndex}`;
              const isSlideDownloading = downloadingId === slideId;
              const slidePercent = downloadProgress[slideId] || 0;

              return (
                <button
                  type="button"
                  onClick={() => {
                    if (activeSlide.type === 'photo' || activeSlide.type === 'image') {
                      downloadPhotoSlide(activeSlide, currentSlideIndex);
                    } else {
                      downloadToDevice(activeSlide, activeSlide.filename, slideId);
                    }
                  }}
                  disabled={isSlideDownloading}
                  className="w-full sm:flex-1 relative overflow-hidden bg-black hover:bg-neutral-800 text-white font-extrabold text-xs sm:text-sm rounded-lg py-3 flex items-center justify-center gap-2 border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer disabled:opacity-85 min-h-[44px]"
                >
                  {isSlideDownloading && (
                    <div 
                      className="absolute left-0 top-0 bottom-0 bg-neutral-700/60 transition-all duration-150 pointer-events-none"
                      style={{ width: `${slidePercent}%` }}
                    />
                  )}
                  {isSlideDownloading ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-white relative z-10" />
                  ) : (
                    <Download className="w-4 h-4 stroke-[2.5] relative z-10" />
                  )}
                  <span className="relative z-10 font-bold">
                    {isSlideDownloading ? (
                      `Mengunduh... ${slidePercent}%`
                    ) : activeSlide.type === 'video'
                      ? (isEn ? `Download Slide Ini (Video #${currentSlideIndex + 1})` : `Unduh Slide Ini (Video #${currentSlideIndex + 1})`)
                      : activeSlide.type === 'live_wallpaper'
                      ? (isEn ? `Download Slide Ini (Live Wallpaper #${currentSlideIndex + 1})` : `Unduh Slide Ini (Live Wallpaper #${currentSlideIndex + 1})`)
                      : (isEn ? `Download Slide Ini (${selectedPhotoRes === '2160p' ? '4K Ultra HD' : selectedPhotoRes === '1080p' ? '1080p Status WA' : '720p HD'})` : `Unduh Slide Ini (${selectedPhotoRes === '2160p' ? '4K Ultra HD' : selectedPhotoRes === '1080p' ? '1080p Status WA' : '720p HD'})`)}
                  </span>
                </button>
              );
            })()}

            {allSlidesToDownload.length > 1 && (
              <button
                type="button"
                onClick={handleDownloadAllSlidesZip}
                disabled={downloadingAllSlides}
                className="w-full sm:flex-1 bg-white hover:bg-neutral-100 text-black font-extrabold text-xs sm:text-sm rounded-lg py-3 flex items-center justify-center gap-2 border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
              >
                {downloadingAllSlides ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-black" />
                    <span>{downloadAllProgressText || (isEn ? 'Preparing ZIP...' : 'Menyiapkan Semua Slide...')}</span>
                  </>
                ) : (
                  <>
                    <FileArchive className="w-4 h-4 stroke-[2.5]" />
                    <span>
                      {isEn 
                        ? `Download All Slides (${allSlidesToDownload.length} Items - ${selectedPhotoRes.toUpperCase()})` 
                        : `Unduh Semua Slide (${allSlidesToDownload.length} Slide - ${selectedPhotoRes === '2160p' ? '4K' : selectedPhotoRes === '1080p' ? '1080p SW' : '720p'})`}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>

        </div>
      )}

      {/* ─── 2. VIDEO REGULER ─── */}
      {!isMultiContentPost && hasVideo && (
        <div className="w-full bg-white border-2 border-black rounded-xl p-5 sm:p-6 shadow-[4px_4px_0px_#000000] flex flex-col md:flex-row gap-5 items-start text-black">
          
          <div className="w-full md:w-72 aspect-[9/16] sm:aspect-[3/4] max-h-[380px] rounded-lg bg-black border-2 border-black overflow-hidden relative shrink-0 flex items-center justify-center mx-auto md:mx-0 shadow-[2px_2px_0px_#000000]">
            {activeRegularVideo?.url ? (
              <video
                ref={videoRef}
                key={activeRegularVideo.streamUrl || activeRegularVideo.url}
                src={activeRegularVideo.streamUrl || activeRegularVideo.url}
                poster={result.thumbnail || undefined}
                controls
                playsInline
                onLoadedMetadata={handleVideoMetadata}
                className="w-full h-full object-contain"
              />
            ) : result.thumbnail ? (
              <img
                src={result.thumbnail}
                alt={result.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-neutral-400 p-4 text-center">
                <Play className="w-10 h-10 text-white" />
                <span className="text-xs mt-2 text-white">{isEn ? 'Video Ready to Play' : 'Video Siap Diputar'}</span>
              </div>
            )}

            <div className="absolute top-2.5 left-2.5 bg-white text-black font-mono font-bold text-[10px] px-2 py-0.5 rounded border border-black shadow-xs">
              {isEn ? 'No Watermark' : 'Tanpa Watermark'}
            </div>

            {displayDuration && (
              <div className="absolute bottom-2.5 right-2.5 bg-black text-white font-mono text-[10px] px-2 py-0.5 rounded border border-white/20 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{displayDuration}</span>
              </div>
            )}
          </div>

          <div className="flex-grow flex flex-col justify-between gap-4 w-full">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold border border-black bg-neutral-100 text-black">
                  {result.platform || 'Video HD'}
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold border border-black bg-black text-white">
                  {isEn ? 'Watermark Free' : 'Bebas Watermark'}
                </span>
              </div>

              <h3 className="text-base sm:text-lg font-extrabold text-black line-clamp-2 leading-snug font-sans">
                {result.title || (isEn ? 'Video Ready to Download' : 'Video Siap Diunduh')}
              </h3>

              {result.author && (
                <p className="text-xs text-neutral-600 font-bold font-mono">
                  Kreator: @{result.author}
                </p>
              )}

              <p className="text-neutral-600 text-xs mt-1">
                {isEn ? 'Choose video resolution to save to your device:' : 'Pilih opsi resolusi video untuk disimpan ke perangkat:'}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
                {videoQualityOptions.map((opt, idx) => {
                  const isSelected = selectedQualityIndex === idx;
                  return (
                    <button
                      key={opt.key || idx}
                      type="button"
                      onClick={() => setSelectedQualityIndex(idx)}
                      className={`p-2.5 rounded-lg text-left transition-all duration-150 cursor-pointer border-2 border-black flex flex-col justify-between gap-1.5 ${
                        isSelected
                          ? 'bg-black text-white shadow-[2px_2px_0px_#000000] -translate-x-0.5 -translate-y-0.5'
                          : 'bg-white text-black hover:bg-neutral-100 hover:shadow-[1px_1px_0px_#000000]'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-current truncate ${isSelected ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-black'}`}>
                          {opt.badge}
                        </span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5] text-white shrink-0" />}
                      </div>
                      <div className="font-extrabold text-xs tracking-tight truncate">
                        {opt.label}
                      </div>
                    </button>
                  );
                })}
              </div>

              {liveWallpaperList.length > 0 && (
                <div className="flex items-center gap-2">
                  {liveWallpaperList.map((liveWp, wpIdx) => (
                    <button
                      key={`wp-${wpIdx}`}
                      type="button"
                      onClick={() => downloadToDevice(liveWp, liveWp.filename)}
                      className="px-3 py-2 rounded-lg text-xs font-bold font-mono transition-all duration-150 cursor-pointer border-2 border-black flex items-center justify-center gap-1.5 bg-neutral-100 hover:bg-neutral-200 text-black shadow-xs"
                      title={isEn ? 'Download loop animation Live Wallpaper' : 'Unduh versi Live Wallpaper animasi loop'}
                    >
                      <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Live Wallpaper (Loop)</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Status WA Anti-Burik Guidance Box */}
              <div className="flex items-start gap-2 p-2.5 rounded-lg border-2 border-black bg-neutral-100 text-[11px] font-medium text-black">
                <Sparkles className="w-4 h-4 shrink-0 text-black mt-0.5" />
                <span className="leading-snug">
                  {isEn
                    ? 'WhatsApp Status Anti-Blur: Choose 1080p or 4K to preserve high bitrate clarity without pixelated compression when posted to WhatsApp Status.'
                    : 'Status WA Anti-Burik: Pilih opsi 1080p atau 4K agar video tidak pecah dan tetap HD jernih maksimal saat diunggah ke Status WhatsApp.'}
                </span>
              </div>

              {activeRegularVideo && (() => {
                const videoId = `video_${activeRegularVideo.id || selectedQualityIndex}`;
                const isVideoDownloading = downloadingId === videoId;
                const videoPercent = downloadProgress[videoId] || 0;
                const isAudioType = activeRegularVideo.type === 'audio';

                return (
                  <button
                    type="button"
                    onClick={() => downloadToDevice(activeRegularVideo, activeRegularVideo.filename, videoId)}
                    disabled={isVideoDownloading}
                    className="w-full relative overflow-hidden bg-black hover:bg-neutral-800 text-white font-extrabold text-xs sm:text-sm rounded-lg py-3.5 px-4 flex items-center justify-center gap-2 border-2 border-black shadow-[3px_3px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer disabled:opacity-85 min-h-[46px]"
                  >
                    {isVideoDownloading && (
                      <div 
                        className="absolute left-0 top-0 bottom-0 bg-neutral-700/60 transition-all duration-150 pointer-events-none"
                        style={{ width: `${videoPercent}%` }}
                      />
                    )}
                    {isVideoDownloading ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-white relative z-10" />
                    ) : (
                      <Download className="w-4 h-4 stroke-[2.5] relative z-10" />
                    )}
                    <span className="relative z-10 font-bold truncate">
                      {isVideoDownloading 
                        ? `Mengunduh... ${videoPercent}%` 
                        : isAudioType
                        ? `${isEn ? 'Download Audio MP3' : 'Download Audio MP3'} (${activeRegularVideo.label})`
                        : `${isEn ? 'Download Video MP4' : 'Download Video MP4'} (${activeRegularVideo.label})`}
                    </span>
                  </button>
                );
              })()}
            </div>

          </div>

        </div>
      )}

      {/* ─── 3. AUDIO PLAYER & DOWNLOAD ─── */}
      {activeAudio && (
        <div className="w-full bg-white border-2 border-black rounded-xl p-5 sm:p-6 shadow-[4px_4px_0px_#000000] flex flex-col gap-4 text-black">
          
          <audio
            ref={audioRef}
            src={activeAudioSrc}
            onTimeUpdate={handleAudioTimeUpdate}
            onLoadedMetadata={handleAudioLoadedMetadata}
            onWaiting={() => setIsAudioLoading(true)}
            onPlaying={() => {
              setIsAudioLoading(false);
              setIsPlayingAudio(true);
            }}
            onPause={() => setIsPlayingAudio(false)}
            onError={handleAudioError}
            onEnded={() => {
              setIsPlayingAudio(false);
              setAudioCurrentTime(0);
              if (audioRef.current) audioRef.current.currentTime = 0;
            }}
            preload="metadata"
            className="hidden"
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-black">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-11 h-11 rounded-lg border-2 border-black bg-neutral-100 flex items-center justify-center shrink-0">
                <Disc3 className={`w-6 h-6 stroke-[2] ${isPlayingAudio ? 'animate-spin' : ''}`} />
              </div>

              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-mono font-bold uppercase text-neutral-500">
                  {isEn ? 'Official Audio' : 'Audio Resmi'}
                </span>
                <h4 className="text-sm sm:text-base font-extrabold text-black truncate">
                  {result.musicInfo?.title || result.title || (isEn ? 'Audio Track' : 'Trek Audio')}
                </h4>
                <p className="text-xs text-neutral-600 truncate font-mono">
                  {result.musicInfo?.author || result.author || (isEn ? 'Audio Artist' : 'Audio Creator')}
                </p>
              </div>
            </div>

            <div className="px-2.5 py-1 rounded border border-black bg-neutral-100 font-mono text-xs font-bold self-start sm:self-auto">
              MP3 Audio HD
            </div>
          </div>

          <div className="flex flex-col gap-2 p-3 sm:p-4 rounded-lg bg-neutral-50 border-2 border-black">
            <input
              type="range"
              min="0"
              max={audioDuration || 100}
              step="0.1"
              value={audioCurrentTime}
              onChange={handleAudioSeek}
              className="w-full h-2 bg-neutral-300 rounded-none appearance-none cursor-pointer accent-black focus:outline-none"
            />

            <div className="flex items-center justify-between text-xs font-mono font-bold">
              <span>{formatTime(audioCurrentTime)}</span>
              <span className="text-neutral-500 font-normal">
                {isAudioLoading ? (isEn ? 'Loading audio...' : 'Memuat audio...') : isPlayingAudio ? (isEn ? 'Playing' : 'Sedang Diputar') : (isEn ? 'Audio Preview' : 'Pratinjau Suara')}
              </span>
              <span>{formatTime(audioDuration)}</span>
            </div>

            <div className="flex items-center justify-center gap-4 pt-2 border-t border-black/15">
              <button
                type="button"
                onClick={() => handleSeekDelta(-5)}
                className="p-2 rounded border border-black hover:bg-neutral-200 cursor-pointer text-xs font-bold font-mono"
                title="Mundur 5s"
              >
                <RotateCcw className="w-4 h-4 inline stroke-[2.5]" /> -5s
              </button>

              <button
                type="button"
                onClick={togglePlayAudio}
                className="w-11 h-11 rounded-lg border-2 border-black bg-black text-white flex items-center justify-center shadow-[2px_2px_0px_#000000] hover:bg-neutral-800 cursor-pointer"
                aria-label={isPlayingAudio ? (isEn ? 'Pause Audio' : 'Jeda Audio') : (isEn ? 'Play Audio' : 'Putar Audio')}
              >
                {isAudioLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : isPlayingAudio ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSeekDelta(5)}
                className="p-2 rounded border border-black hover:bg-neutral-200 cursor-pointer text-xs font-bold font-mono"
                title="Maju 5s"
              >
                +5s <RotateCw className="w-4 h-4 inline stroke-[2.5]" />
              </button>

              <button
                type="button"
                onClick={toggleAudioMute}
                className="p-2 rounded border border-black hover:bg-neutral-200 cursor-pointer"
                title={isAudioMuted ? (isEn ? 'Unmute' : 'Nyalakan') : (isEn ? 'Mute' : 'Bisukan')}
              >
                {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {(() => {
            const audioId = `audio_${activeAudio.id || 'main'}`;
            const isAudioDownloading = downloadingId === audioId;
            const audioPercent = downloadProgress[audioId] || 0;

            return (
              <button
                type="button"
                onClick={() => downloadToDevice(activeAudio, `audio_${Date.now()}.mp3`, audioId)}
                disabled={isAudioDownloading}
                className="w-full relative overflow-hidden py-3 rounded-lg border-2 border-black bg-black text-white font-extrabold text-xs sm:text-sm hover:bg-neutral-800 shadow-[3px_3px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-85 min-h-[44px]"
              >
                {isAudioDownloading && (
                  <div 
                    className="absolute left-0 top-0 bottom-0 bg-neutral-700/60 transition-all duration-150 pointer-events-none"
                    style={{ width: `${audioPercent}%` }}
                  />
                )}
                {isAudioDownloading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white relative z-10" />
                ) : (
                  <Download className="w-4 h-4 stroke-[2.5] relative z-10" />
                )}
                <span className="relative z-10 font-bold">
                  {isAudioDownloading 
                    ? `Mengunduh Audio... ${audioPercent}%`
                    : (isEn ? 'Download Audio MP3 File' : 'Download File Audio MP3')}
                </span>
              </button>
            );
          })()}

        </div>
      )}

      {/* ─── RESET & NAVIGASI KEMBALI ─── */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 w-full">
        {onBack && (
          <CosmicBackButton onClick={onBack} label={isEn ? 'Back to Home' : 'Kembali ke Beranda'} />
        )}

        <button
          onClick={onReset}
          className="w-full sm:w-auto px-6 py-2.5 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 text-black text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
        >
          <RefreshCw className="w-4 h-4 stroke-[2.5]" />
          <span>{isEn ? 'Download Another Link' : 'Unduh Tautan Lainnya'}</span>
        </button>
      </div>

    </div>
  );
}
