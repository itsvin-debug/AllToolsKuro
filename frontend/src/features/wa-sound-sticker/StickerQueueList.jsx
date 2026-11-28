import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Trash2,
  Eye,
  RotateCcw,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Edit3,
  Layers
} from 'lucide-react';
import { createSnippetPlayer } from './audioTrimmerEngine';
import { loadMediaElementFromFile, releaseMediaElement } from './soundStickerComposer';

function statusBadgeMeta(status) {
  switch (status) {
    case 'composing':
      return { text: 'Merakit...', cls: 'bg-yellow-200 text-black' };
    case 'sending':
      return { text: 'Mengirim...', cls: 'bg-yellow-300 text-black' };
    case 'server_ack':
      return { text: 'Server ✓', cls: 'bg-sky-200 text-black' };
    case 'delivered':
      return { text: 'Diterima HP ✓✓', cls: 'bg-emerald-300 text-black' };
    case 'failed':
      return { text: 'Gagal', cls: 'bg-rose-200 text-rose-950' };
    default:
      return { text: 'Siap', cls: 'bg-neutral-100 text-black' };
  }
}

export default function StickerQueueList({
  items = [],
  isBatchSending = false,
  batchProgress = null,
  waConnected = false,
  onPreviewItem,
  onUpdateItem,
  onRetryItem,
  onRemoveItem,
  onSendAll,
  onClearAll
}) {
  const [editingId, setEditingId] = useState(null);
  const [playingItemId, setPlayingItemId] = useState(null);
  const playerRef = useRef(null);

  useEffect(() => {
    playerRef.current = createSnippetPlayer();
    return () => {
      playerRef.current?.stop();
    };
  }, []);

  const handleToggleQuickPlay = async (item) => {
    if (playingItemId === item.id) {
      playerRef.current?.stop();
      setPlayingItemId(null);
      return;
    }

    if (item.audioBuffer) {
      setPlayingItemId(item.id);
      await playerRef.current?.play(item.audioBuffer, item.startSec || 0, item.endSec || 5, item.volume ?? 1, {
        fadeSmooth: item.fadeSmooth !== false,
        onEnded: () => setPlayingItemId(null)
      });
      return;
    }

    if (item.visualFile) {
      setPlayingItemId(item.id);
      const { mediaEl, objectUrl } = await loadMediaElementFromFile(item.visualFile).catch(() => ({}));
      if (mediaEl instanceof HTMLVideoElement) {
        try {
          mediaEl.muted = false;
          mediaEl.currentTime = item.startSec || 0;
          await mediaEl.play();
          const stopAt = Math.max(400, ((item.endSec || 5) - (item.startSec || 0)) * 1000);
          setTimeout(() => {
            try { mediaEl.pause(); } catch {}
            releaseMediaElement(mediaEl, objectUrl);
            setPlayingItemId((cur) => (cur === item.id ? null : cur));
          }, stopAt);
          return;
        } catch {
          releaseMediaElement(mediaEl, objectUrl);
        }
      }
      setPlayingItemId(null);
    }
  };

  const pendingCount = items.filter((it) => it.status !== 'delivered' && it.status !== 'server_ack').length;

  return (
    <section className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3.5 sm:p-4 space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2 pb-2 border-b-2 border-black flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-emerald-600 shrink-0" />
          <h3 className="font-black text-xs sm:text-sm uppercase text-black">
            Antrean Stiker Audio
          </h3>
        </div>
        <span className="px-2 py-0.5 bg-yellow-300 border border-black font-mono font-black text-[10px] shrink-0">
          {items.length} Item
        </span>
      </div>

      {items.length === 0 ? (
        <div className="p-4 border-2 border-dashed border-black bg-neutral-50 text-center space-y-1">
          <p className="font-black text-xs text-black">Antrean masih kosong</p>
          <p className="text-[11px] font-semibold text-neutral-600 leading-snug">
            Rakit lewat <b>Foto/Video + Sound</b> lalu tekan <b>Tambah ke Antrean</b>, atau unggah banyak video sekaligus di tab <b>Multi Video</b>.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-0.5">
          {items.map((item, idx) => {
            const badge = statusBadgeMeta(item.status);
            const clipDur = Math.max(0.2, (Number(item.endSec) || 5) - (Number(item.startSec) || 0)).toFixed(1);
            const isPlaying = playingItemId === item.id;
            const isEditing = editingId === item.id;

            return (
              <div
                key={item.id}
                className="border-2 border-black bg-neutral-50 p-2.5 space-y-2 min-w-0"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  {/* Thumbnail 1:1 dengan ikon speaker pojok kiri atas */}
                  <button
                    type="button"
                    onClick={() => handleToggleQuickPlay(item)}
                    className="relative w-16 h-16 shrink-0 border-2 border-black bg-neutral-900 overflow-hidden cursor-pointer active:scale-95 transition-transform"
                    title="Ketuk untuk putar suara"
                    aria-label={isPlaying ? `Matikan suara ${item.title}` : `Putar suara ${item.title}`}
                  >
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] font-mono text-white">
                        1:1
                      </div>
                    )}
                    <span
                      className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center ${
                        isPlaying ? 'bg-emerald-500 text-white' : 'bg-black/65 text-white'
                      }`}
                    >
                      {isPlaying ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                    </span>
                  </button>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-1.5">
                      <span className="font-black text-xs text-black truncate">
                        {idx + 1}. {item.title}
                      </span>
                      <span className={`px-1.5 py-0.5 border border-black font-mono font-bold text-[10px] shrink-0 ${badge.cls}`}>
                        {item.status === 'composing' || item.status === 'sending' ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            {badge.text}
                          </span>
                        ) : (
                          badge.text
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono font-bold text-neutral-700">
                      <span className="px-1.5 py-0.5 bg-white border border-black">
                        {item.sourceKind === 'multi-video'
                          ? 'Multi Video'
                          : item.visualKind === 'image'
                            ? 'Foto+Sound'
                            : 'Video+Sound'}
                      </span>
                      <span className="px-1.5 py-0.5 bg-white border border-black">
                        {clipDur}s
                      </span>
                      {item.stickerText?.trim() && (
                        <span className="px-1.5 py-0.5 bg-yellow-100 border border-black truncate max-w-[120px]">
                          &ldquo;{item.stickerText.trim()}&rdquo;
                        </span>
                      )}
                    </div>

                    {item.error && (
                      <p className="text-[10px] font-bold text-rose-700 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span className="truncate">{item.error}</span>
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <button
                        type="button"
                        onClick={() => onPreviewItem?.(item)}
                        className="px-2 py-1 bg-white hover:bg-yellow-100 border border-black font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer min-h-[30px]"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Preview</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingId(isEditing ? null : item.id)}
                        disabled={isBatchSending}
                        className="px-2 py-1 bg-white hover:bg-neutral-100 disabled:opacity-45 border border-black font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer min-h-[30px]"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>{isEditing ? 'Tutup' : 'Edit'}</span>
                      </button>

                      {item.status === 'failed' && (
                        <button
                          type="button"
                          onClick={() => onRetryItem?.(item)}
                          disabled={isBatchSending || !waConnected}
                          className="px-2 py-1 bg-yellow-300 hover:bg-yellow-400 disabled:opacity-45 border border-black font-black text-[10px] inline-flex items-center gap-1 cursor-pointer min-h-[30px]"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Kirim Ulang</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onRemoveItem?.(item.id)}
                        disabled={isBatchSending}
                        className="px-2 py-1 bg-white hover:bg-rose-100 disabled:opacity-45 border border-black font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer min-h-[30px] ml-auto"
                        aria-label={`Hapus ${item.title}`}
                      >
                        <Trash2 className="w-3 h-3 text-rose-700" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <div className="p-2.5 bg-white border border-black space-y-2 text-[11px]">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-black text-[10px] uppercase block mb-0.5">
                          Mulai (s):
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max={Math.max(0, (Number(item.totalDuration) || 8) - 0.5).toFixed(1)}
                          value={Number(item.startSec ?? 0)}
                          onChange={(e) => {
                            const maxD = Math.max(0.5, Number(item.totalDuration) || 8);
                            const nextStart = Math.max(0, Math.min(maxD - 0.5, Number(e.target.value) || 0));
                            let nextEnd = Number(item.endSec ?? Math.min(maxD, nextStart + 5));
                            if (nextEnd - nextStart < 0.5) nextEnd = Math.min(maxD, nextStart + 0.5);
                            if (nextEnd - nextStart > 8) nextEnd = Math.min(maxD, nextStart + 8);
                            const patch = {
                              startSec: Number(nextStart.toFixed(1)),
                              endSec: Number(nextEnd.toFixed(1)),
                              status: 'ready',
                              error: null
                            };
                            if (item.sourceKind === 'multi-video') {
                              patch.videoStartSec = patch.startSec;
                              patch.videoEndSec = patch.endSec;
                            }
                            onUpdateItem?.(item.id, patch);
                          }}
                          className="w-full border border-black px-2 py-1 font-mono font-bold text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="font-black text-[10px] uppercase block mb-0.5">
                          Selesai (s):
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          max={Math.max(1, Number(item.totalDuration) || 8).toFixed(1)}
                          value={Number(item.endSec ?? 5)}
                          onChange={(e) => {
                            const maxD = Math.max(0.5, Number(item.totalDuration) || 8);
                            const nextEnd = Math.max(0.5, Math.min(maxD, Number(e.target.value) || 5));
                            let nextStart = Number(item.startSec ?? 0);
                            if (nextEnd - nextStart < 0.5) nextStart = Math.max(0, nextEnd - 0.5);
                            if (nextEnd - nextStart > 8) nextStart = Math.max(0, nextEnd - 8);
                            const patch = {
                              startSec: Number(nextStart.toFixed(1)),
                              endSec: Number(nextEnd.toFixed(1)),
                              status: 'ready',
                              error: null
                            };
                            if (item.sourceKind === 'multi-video') {
                              patch.videoStartSec = patch.startSec;
                              patch.videoEndSec = patch.endSec;
                            }
                            onUpdateItem?.(item.id, patch);
                          }}
                          className="w-full border border-black px-2 py-1 font-mono font-bold text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                      <div className="sm:col-span-2">
                        <label className="font-black text-[10px] uppercase block mb-0.5">
                          Teks Meme Opsional:
                        </label>
                        <input
                          type="text"
                          maxLength={40}
                          value={item.stickerText || ''}
                          onChange={(e) => onUpdateItem?.(item.id, { stickerText: e.target.value, status: 'ready', error: null })}
                          placeholder="Kosongkan jika tanpa teks"
                          className="w-full border border-black px-2 py-1 font-bold text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="font-black text-[10px] uppercase block mb-0.5">
                          Framing 1:1:
                        </label>
                        <select
                          value={item.cropMode || 'cover'}
                          onChange={(e) => onUpdateItem?.(item.id, { cropMode: e.target.value, status: 'ready', error: null })}
                          className="w-full border border-black px-2 py-1 font-bold text-xs bg-white cursor-pointer"
                        >
                          <option value="cover">Crop Penuh</option>
                          <option value="contain">Pas (Fit)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isBatchSending && batchProgress && (
        <div className="p-2.5 bg-yellow-50 border-2 border-black space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-black gap-2">
            <span className="flex items-center gap-1.5 truncate">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span className="truncate">{batchProgress.label}</span>
            </span>
            <span className="font-mono shrink-0">
              {batchProgress.current}/{batchProgress.total}
            </span>
          </div>
          <div className="w-full h-2.5 bg-white border border-black overflow-hidden">
            <div
              style={{
                width: `${Math.max(5, Math.min(100, Math.round((batchProgress.current / Math.max(1, batchProgress.total)) * 100)))}%`
              }}
              className="h-full bg-emerald-500 transition-all duration-200"
            />
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <button
            type="button"
            onClick={onSendAll}
            disabled={isBatchSending || !waConnected || pendingCount === 0}
            className="flex-1 py-3 px-4 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-45 text-black border-2 border-black shadow-[3px_3px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all min-h-[44px]"
          >
            {isBatchSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>
              Kirim Semua Stiker Audio ({pendingCount > 0 ? pendingCount : items.length}) ke WA Saya
            </span>
          </button>

          <button
            type="button"
            onClick={onClearAll}
            disabled={isBatchSending}
            className="px-3 py-2.5 bg-white hover:bg-rose-50 disabled:opacity-45 border-2 border-black shadow-[2px_2px_0px_#000] font-black text-xs cursor-pointer min-h-[42px] shrink-0"
          >
            Kosongkan
          </button>
        </div>
      )}

      {!waConnected && items.length > 0 && (
        <p className="text-[11px] font-bold text-amber-800 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Tautkan WhatsApp di tab/panel Koneksi WA agar tombol Kirim Semua aktif.</span>
        </p>
      )}
    </section>
  );
}
