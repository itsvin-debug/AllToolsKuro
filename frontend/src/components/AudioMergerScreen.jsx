import React, { useState, useRef } from 'react';
import axios from 'axios';
import CosmicBackButton from './CosmicBackButton';
import { 
  Music, 
  ArrowLeft, 
  Upload, 
  Plus, 
  Trash2, 
  Play, 
  Pause, 
  Volume2, 
  Clock, 
  Download, 
  Check, 
  AlertCircle, 
  Loader2, 
  Sparkles, 
  MoveUp, 
  MoveDown,
  Scissors,
  Layers,
  FileAudio,
  Film,
  Video
} from 'lucide-react';
import { addGalleryItem } from '../services/storageService';
import { translations } from '../utils/translations';

export default function AudioMergerScreen({ onBack, lang = 'id' }) {
  const isEn = lang === 'en';
  const t = translations[lang] || translations.id;
  const am = t.audioMerger || translations.id.audioMerger;

  const [tracks, setTracks] = useState([]);
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [playingTrackId, setPlayingTrackId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const audioRefs = useRef({});
  const videoRefs = useRef({});
  const masterMediaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Format detik ke MM:SS
  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Upload file video dan audio
  const handleFileList = (filesList) => {
    const files = Array.from(filesList || []);
    if (files.length === 0) return;

    setErrorMessage('');

    files.forEach((file) => {
      const isAudio = file.type.startsWith('audio/');
      const isVideo = file.type.startsWith('video/') || file.name.endsWith('.mp4') || file.name.endsWith('.webm') || file.name.endsWith('.mov');

      if (!isAudio && !isVideo) {
        setErrorMessage(isEn ? 'Files must be Audio (MP3, WAV, M4A) or Video (MP4, WebM).' : 'File harus berupa Audio (MP3, WAV, M4A) atau Video (MP4, WebM).');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;

        if (isVideo) {
          const tempVideo = document.createElement('video');
          tempVideo.src = dataUrl;
          tempVideo.onloadedmetadata = () => {
            const dur = Math.floor(tempVideo.duration) || 30;
            const newTrack = {
              id: Date.now() + '_' + Math.random().toString(36).substring(2, 7),
              name: file.name,
              size: file.size,
              dataUrl,
              totalDuration: dur,
              startMin: 0,
              startSec: 0,
              endMin: Math.floor(dur / 60),
              endSec: dur % 60,
              volume: 1.0,
              isVideo: true
            };
            setTracks((prev) => [...prev, newTrack]);
          };
          tempVideo.onerror = () => {
            const newTrack = {
              id: Date.now() + '_' + Math.random().toString(36).substring(2, 7),
              name: file.name,
              size: file.size,
              dataUrl,
              totalDuration: 30,
              startMin: 0,
              startSec: 0,
              endMin: 0,
              endSec: 30,
              volume: 1.0,
              isVideo: true
            };
            setTracks((prev) => [...prev, newTrack]);
          };
        } else {
          const tempAudio = new Audio();
          tempAudio.src = dataUrl;
          tempAudio.onloadedmetadata = () => {
            const dur = Math.floor(tempAudio.duration) || 30;
            const newTrack = {
              id: Date.now() + '_' + Math.random().toString(36).substring(2, 7),
              name: file.name,
              size: file.size,
              dataUrl,
              totalDuration: dur,
              startMin: 0,
              startSec: 0,
              endMin: Math.floor(dur / 60),
              endSec: dur % 60,
              volume: 1.0,
              isVideo: false
            };
            setTracks((prev) => [...prev, newTrack]);
          };
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFilesUpload = (e) => {
    handleFileList(e.target.files);
    e.target.value = '';
  };

  const updateTrackField = (id, field, value) => {
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return { ...t, [field]: value };
      })
    );
  };

  const removeTrack = (id) => {
    if (playingTrackId === id) {
      if (audioRefs.current[id]) audioRefs.current[id].pause();
      if (videoRefs.current[id]) videoRefs.current[id].pause();
      setPlayingTrackId(null);
    }
    setTracks((prev) => prev.filter((t) => t.id !== id));
  };

  const moveTrack = (index, direction) => {
    const newTracks = [...tracks];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newTracks.length) return;
    const temp = newTracks[index];
    newTracks[index] = newTracks[targetIndex];
    newTracks[targetIndex] = temp;
    setTracks(newTracks);
  };

  // Play / Pause preview potongan
  const togglePlayTrack = (track) => {
    const mediaEl = track.isVideo ? videoRefs.current[track.id] : audioRefs.current[track.id];
    if (!mediaEl) return;

    if (playingTrackId === track.id) {
      mediaEl.pause();
      setPlayingTrackId(null);
    } else {
      // Pause track lain
      if (playingTrackId) {
        if (audioRefs.current[playingTrackId]) audioRefs.current[playingTrackId].pause();
        if (videoRefs.current[playingTrackId]) videoRefs.current[playingTrackId].pause();
      }

      const startTotalSec = (Number(track.startMin) * 60) + Number(track.startSec);
      const endTotalSec = (Number(track.endMin) * 60) + Number(track.endSec);

      mediaEl.currentTime = startTotalSec;
      mediaEl.volume = track.volume;
      mediaEl.play().catch(() => {});
      setPlayingTrackId(track.id);

      mediaEl.ontimeupdate = () => {
        if (mediaEl.currentTime >= endTotalSec) {
          mediaEl.pause();
          setPlayingTrackId(null);
        }
      };
    }
  };

  // Eksekusi penggabungan via FFmpeg
  const handleMerge = async () => {
    if (tracks.length === 0) {
      setErrorMessage(isEn ? 'Please add at least 1 audio or video track.' : 'Harap tambahkan minimal 1 track audio atau video.');
      return;
    }

    setMerging(true);
    setErrorMessage('');
    setMergeResult(null);

    try {
      const payloadTracks = tracks.map((t) => {
        const startSec = (Number(t.startMin) * 60) + Number(t.startSec);
        const endSec = (Number(t.endMin) * 60) + Number(t.endSec);
        return {
          name: t.name,
          base64: t.dataUrl,
          startTime: startSec,
          endTime: endSec,
          volume: t.volume,
          isVideo: t.isVideo
        };
      });

      const res = await axios.post('/api/merge-audio', {
        tracks: payloadTracks
      }, {
        timeout: 120000
      });

      if (res.data && res.data.success) {
        const resultData = res.data.data;
        setMergeResult(resultData);

        // Simpan otomatis ke galeri perangkat
        addGalleryItem({
          title: resultData.isVideo 
            ? `Merged Video Studio (${tracks.length} Tracks)` 
            : `Merged Audio Master (${tracks.length} Tracks)`,
          type: resultData.isVideo ? 'video' : 'audio',
          category: 'Audio & Video Merger',
          extension: resultData.isVideo ? 'MP4' : 'MP3',
          size: resultData.sizeFormatted || '2 MB',
          previewUrl: resultData.url,
          downloadData: resultData.url,
          filename: resultData.fileName || (resultData.isVideo ? 'kuro_merged_video.mp4' : 'kuro_merged_audio.mp3')
        });

        // Scroll halus ke area hasil output
        setTimeout(() => {
          const el = document.getElementById('merge-output-preview');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);

      } else {
        setErrorMessage(res.data?.message || (isEn ? 'Failed to merge tracks.' : 'Gagal menggabungkan media.'));
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || err.message || (isEn ? 'An error occurred during media merge.' : 'Terjadi kesalahan saat memproses penggabungan.'));
    } finally {
      setMerging(false);
    }
  };

  return (
    <main className="flex-grow flex flex-col items-center justify-start px-4 sm:px-6 py-6 sm:py-8 max-w-4xl mx-auto w-full">
      
      <div className="w-full flex flex-col gap-5">
        
        {/* Tombol Navigasi Kembali */}
        <div className="w-full flex items-center justify-between">
          <CosmicBackButton onClick={onBack} label={t.nav.backToHome} />

          <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded border-2 border-black bg-neutral-100 text-black uppercase">
            {am.studioBadge}
          </span>
        </div>

        {/* Header Judul Fitur */}
        <div className="w-full border-b-2 border-black pb-4">
          <h1 className="text-xl sm:text-3xl font-black text-black tracking-tight font-display uppercase">
            {am.title}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-600 mt-1 leading-relaxed max-w-2xl">
            {am.subtitle}
          </p>
        </div>

        {/* Card Utama Pengaturan & Daftar Track */}
        <div className="w-full rounded-xl border-2 border-black bg-white shadow-[4px_4px_0px_#000000] p-4 sm:p-6 flex flex-col gap-4">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b-2 border-black">
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-black uppercase tracking-tight flex items-center gap-2">
                <Layers className="w-4 h-4 stroke-[2.5]" />
                <span>{am.trackListHeader} ({tracks.length} Track)</span>
              </h2>
              <p className="text-xs text-neutral-600 mt-0.5">
                {am.trackListSubtitle}
              </p>
            </div>

            <label className="px-4 py-2.5 rounded-lg border-2 border-black bg-black text-white hover:bg-neutral-800 font-bold text-xs flex items-center gap-2 shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer shrink-0">
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>{am.addTrackBtn}</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="audio/*,video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={handleFilesUpload}
              />
            </label>
          </div>

          {/* Pesan Error */}
          {errorMessage && (
            <div className="p-3.5 rounded-lg border-2 border-black bg-neutral-100 text-black flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 stroke-[2.5]" />
              <span className="font-semibold">{errorMessage}</span>
            </div>
          )}

          {/* Kondisi Jika Belum Ada Track */}
          {tracks.length === 0 ? (
            <div 
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                if (e.dataTransfer.files) handleFileList(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 sm:p-12 flex flex-col items-center justify-center text-center gap-2 cursor-pointer transition-all ${
                isDragging
                  ? 'border-black bg-neutral-200 scale-[0.99] shadow-[1px_1px_0px_#000000]'
                  : 'border-black bg-neutral-50 hover:bg-neutral-100'
              }`}
            >
              <div className="w-12 h-12 rounded-lg border-2 border-black bg-white flex items-center justify-center text-black mb-1 shadow-[2px_2px_0px_#000000]">
                <Video className="w-6 h-6 stroke-[2]" />
              </div>
              <p className="text-sm font-black text-black uppercase font-display">
                {am.emptyTracksTitle}
              </p>
              <p className="text-xs text-neutral-600 max-w-md">
                {am.emptyTracksDesc} (Bisa Tarik & Lepaskan / Drag & Drop File Langsung ke Sini)
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {tracks.map((track, idx) => {
                const startTotal = (Number(track.startMin) * 60) + Number(track.startSec);
                const endTotal = (Number(track.endMin) * 60) + Number(track.endSec);
                const sliceDur = Math.max(0, endTotal - startTotal);

                return (
                  <div
                    key={track.id}
                    className="p-4 sm:p-5 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_#000000] flex flex-col gap-3.5"
                  >
                    
                    {/* 1. Header Track & Aksi */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <span className="w-7 h-7 rounded border-2 border-black bg-black text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="overflow-hidden">
                          <p className="text-xs sm:text-sm font-extrabold text-black truncate">
                            {track.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border border-black bg-neutral-100 text-black">
                              {track.isVideo ? 'VIDEO' : 'AUDIO'}
                            </span>
                            <span className="text-[11px] text-neutral-500 font-mono">
                              Total: {formatTime(track.totalDuration)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Tombol Reorder & Delete */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveTrack(idx, -1)}
                          disabled={idx === 0}
                          className="w-8 h-8 rounded border-2 border-black bg-white hover:bg-neutral-100 disabled:opacity-30 text-black flex items-center justify-center shadow-[1px_1px_0px_#000000] cursor-pointer"
                          title={am.moveUp}
                        >
                          <MoveUp className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>

                        <button
                          type="button"
                          onClick={() => moveTrack(idx, 1)}
                          disabled={idx === tracks.length - 1}
                          className="w-8 h-8 rounded border-2 border-black bg-white hover:bg-neutral-100 disabled:opacity-30 text-black flex items-center justify-center shadow-[1px_1px_0px_#000000] cursor-pointer"
                          title={am.moveDown}
                        >
                          <MoveDown className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>

                        <button
                          type="button"
                          onClick={() => removeTrack(track.id)}
                          className="w-8 h-8 rounded border-2 border-black bg-white hover:bg-red-50 text-red-600 flex items-center justify-center shadow-[1px_1px_0px_#000000] cursor-pointer"
                          title={am.deleteTrack}
                        >
                          <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>
                      </div>
                    </div>

                    {/* 2. MEDIA PREVIEW (TAMPILAN VIDEO ASLI ATAU AUDIO PLAYER) */}
                    {track.isVideo ? (
                      <div className="w-full flex flex-col gap-2 rounded-lg border-2 border-black p-3 bg-neutral-900 text-white">
                        <div className="relative w-full rounded overflow-hidden max-h-[300px] bg-black flex items-center justify-center">
                          <video
                            ref={(el) => (videoRefs.current[track.id] = el)}
                            src={track.dataUrl}
                            controls
                            playsInline
                            className="w-full max-h-[280px] object-contain rounded"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-neutral-300 px-1">
                          <span className="flex items-center gap-1.5">
                            <Film className="w-3.5 h-3.5 text-white" />
                            <span>{track.name}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePlayTrack(track)}
                            className="px-2.5 py-1 rounded border border-white bg-white text-black font-bold text-[10px] uppercase cursor-pointer hover:bg-neutral-200"
                          >
                            {playingTrackId === track.id ? 'Pause Clip' : am.testVideoBtn}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full rounded-lg border-2 border-black p-3 bg-neutral-50 flex items-center justify-between gap-3">
                        <audio
                          ref={(el) => (audioRefs.current[track.id] = el)}
                          src={track.dataUrl}
                          preload="metadata"
                        />
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded border border-black bg-white flex items-center justify-center text-black shrink-0">
                            <FileAudio className="w-4 h-4" />
                          </div>
                          <div className="truncate text-xs font-bold text-black">
                            {track.name}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => togglePlayTrack(track)}
                          className={`px-3 py-1.5 rounded-lg border-2 border-black font-bold text-xs flex items-center gap-1.5 shadow-[1.5px_1.5px_0px_#000000] cursor-pointer transition-all ${
                            playingTrackId === track.id
                              ? 'bg-black text-white'
                              : 'bg-white text-black hover:bg-neutral-100'
                          }`}
                        >
                          {playingTrackId === track.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          <span>{playingTrackId === track.id ? 'Pause' : am.testClipBtn}</span>
                        </button>
                      </div>
                    )}

                    {/* 3. Pengaturan Detik & Menit Potongan */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t-2 border-black">
                      
                      {/* Waktu Mulai (Start) */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-black flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{am.startLabel}:</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            value={track.startMin}
                            onChange={(e) => updateTrackField(track.id, 'startMin', Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-16 px-2 py-1.5 rounded border-2 border-black bg-white text-xs text-black font-mono font-bold text-center"
                            title="Menit Mulai"
                          />
                          <span className="font-bold">:</span>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={track.startSec}
                            onChange={(e) => updateTrackField(track.id, 'startSec', Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                            className="w-16 px-2 py-1.5 rounded border-2 border-black bg-white text-xs text-black font-mono font-bold text-center"
                            title="Detik Mulai"
                          />
                          <span className="text-[10px] text-neutral-500 font-mono font-bold">
                            ({formatTime(startTotal)})
                          </span>
                        </div>
                      </div>

                      {/* Waktu Selesai (End) */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-black flex items-center gap-1">
                          <Scissors className="w-3 h-3" />
                          <span>{am.endLabel}:</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            value={track.endMin}
                            onChange={(e) => updateTrackField(track.id, 'endMin', Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-16 px-2 py-1.5 rounded border-2 border-black bg-white text-xs text-black font-mono font-bold text-center"
                            title="Menit Selesai"
                          />
                          <span className="font-bold">:</span>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={track.endSec}
                            onChange={(e) => updateTrackField(track.id, 'endSec', Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                            className="w-16 px-2 py-1.5 rounded border-2 border-black bg-white text-xs text-black font-mono font-bold text-center"
                            title="Detik Selesai"
                          />
                          <span className="text-[10px] text-neutral-500 font-mono font-bold">
                            ({formatTime(endTotal)})
                          </span>
                        </div>
                      </div>

                      {/* Volume & Durasi Hasil */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[11px] font-bold text-black">
                          <span className="flex items-center gap-1">
                            <Volume2 className="w-3 h-3" />
                            <span>{am.volumeLabel}: {Math.round(track.volume * 100)}%</span>
                          </span>
                          <span className="font-mono text-neutral-700">
                            {formatTime(sliceDur)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1.5"
                          step="0.05"
                          value={track.volume}
                          onChange={(e) => updateTrackField(track.id, 'volume', parseFloat(e.target.value))}
                          className="w-full accent-black cursor-pointer"
                        />
                      </div>

                    </div>

                  </div>
                );
              })}
            </div>
          )}

          {/* Tombol Eksekusi Penggabungan */}
          {tracks.length > 0 && (
            <div className="pt-3 border-t-2 border-black flex justify-end">
              <button
                type="button"
                onClick={handleMerge}
                disabled={merging}
                className="w-full sm:w-auto px-6 py-3 rounded-xl border-2 border-black bg-black text-white hover:bg-neutral-800 disabled:opacity-50 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[3px_3px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
              >
                {merging ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{am.mergingBtn}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>{am.mergeBtn}</span>
                  </>
                )}
              </button>
            </div>
          )}

        </div>

        {/* ─── OUTPUT PREVIEW SECTION (LIHAT HASIL TERLEBIH DAHULU SEBELUM DOWNLOAD) ─── */}
        {mergeResult && (
          <div 
            id="merge-output-preview" 
            className="w-full rounded-xl border-2 border-black bg-white shadow-[4px_4px_0px_#000000] p-5 sm:p-7 flex flex-col gap-5 animate-in fade-in"
          >
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-black">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg border-2 border-black bg-emerald-100 flex items-center justify-center text-black shadow-[1.5px_1.5px_0px_#000000]">
                  <Check className="w-5 h-5 stroke-[3]" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-black uppercase font-display">
                    {am.successTitle}
                  </h3>
                  <p className="text-xs text-neutral-600">
                    {mergeResult.isVideo ? am.successSubtitleVideo : am.successSubtitleAudio}
                  </p>
                </div>
              </div>

              <a
                href={mergeResult.url}
                download={mergeResult.fileName}
                className="px-5 py-2.5 rounded-lg border-2 border-black bg-black text-white hover:bg-neutral-800 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer shrink-0"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>
                  {mergeResult.isVideo ? am.downloadVideoBtn : am.downloadAudioBtn} ({mergeResult.sizeFormatted})
                </span>
              </a>
            </div>

            {/* Area Pratinjau Interaktif Sesuai Format Hasil (Video / Audio) */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-black uppercase tracking-wide flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 fill-black" />
                  <span>{am.outputPreviewTitle}</span>
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-black bg-neutral-100 text-black">
                  {mergeResult.isVideo ? 'VIDEO MP4 HD' : 'AUDIO MP3 MASTER'}
                </span>
              </div>

              {mergeResult.isVideo ? (
                <div className="w-full rounded-xl border-2 border-black bg-black overflow-hidden shadow-[2px_2px_0px_#000000] flex items-center justify-center">
                  <video
                    ref={masterMediaRef}
                    src={mergeResult.url}
                    controls
                    playsInline
                    className="w-full max-h-[440px] object-contain"
                  />
                </div>
              ) : (
                <div className="w-full rounded-xl border-2 border-black p-4 bg-neutral-50 shadow-[2px_2px_0px_#000000] flex flex-col items-center gap-3">
                  <audio
                    ref={masterMediaRef}
                    src={mergeResult.url}
                    controls
                    className="w-full max-w-xl"
                  />
                </div>
              )}

              <p className="text-[11px] text-neutral-500 font-mono text-center">
                {am.outputPreviewSubtitle}
              </p>
            </div>

          </div>
        )}

      </div>

    </main>
  );
}
