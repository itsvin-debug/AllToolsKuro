/**
 * Kuro Studio - Unified Customization Panel (`StudioCustomPanel.jsx`)
 * Dipakai bersama oleh Editor Kode & Editor Teks dengan 4 Sub-Tab terstruktur
 * serta Sakelar Master Polos Murni / Kustomisasi Aktif & Reset instan.
 */

import React, { useState } from 'react';
import {
  Palette,
  Sparkles,
  Type,
  SlidersHorizontal,
  ShieldCheck,
  RotateCcw,
  Tv,
  Cloud
} from 'lucide-react';
import {
  STUDIO_VISUAL_STYLES,
  STUDIO_MOOD_PRESETS,
  STUDIO_FONT_PRESETS
} from './codeToVideoEngine';
import {
  PROMPT_BG_PATTERNS,
  PROMPT_HERO_VISUALS,
  PROMPT_CARD_STYLES,
  PROMPT_TEXT_SCALES,
  PROMPT_TEXT_ALIGNS,
  PROMPT_EASINGS
} from './textPromptCompiler';

export default function StudioCustomPanel({
  editorTab,
  settings,
  onChangeSetting,
  onToggleBypass,
  onResetToPure,
  onSyncTextDuration,
  recommendedDuration = 12,
  onSendLiveSpeed
}) {
  const [subTab, setSubTab] = useState('design'); // 'design' | 'effects' | 'typo' | 'motion'

  const isBypass = Boolean(settings.pureBypassMode);

  const handleSelectMood = (moodObj) => {
    onChangeSetting({
      mood: moodObj.id,
      ...(moodObj.id !== 'auto' && moodObj.id !== 'custom'
        ? {
            bgColor1: moodObj.bg1,
            bgColor2: moodObj.bg2,
            tintColor: moodObj.accent,
            hudTextColor: moodObj.text
          }
        : {})
    });
  };

  return (
    <div className="w-full max-w-full bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3 sm:p-4 space-y-3 overflow-hidden min-w-0">
      {/* ─── HEADER KONTROL MASTER: POLOS MURNI vs KUSTOMISASI AKTIF ─── */}
      <div
        className={`p-2.5 sm:p-3 border-2 border-black flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
          isBypass ? 'bg-emerald-100' : 'bg-amber-50'
        }`}
      >
        <div className="min-w-0">
          <div className="font-black text-xs sm:text-sm text-black flex items-center gap-1.5 flex-wrap">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Panel Kustomisasi Studio</span>
            <span
              className={`px-2 py-0.5 text-[10px] font-black border border-black ${
                isBypass ? 'bg-black text-yellow-300' : 'bg-cyan-300 text-black'
              }`}
            >
              {isBypass ? 'POLOS MURNI' : 'KUSTOMISASI AKTIF'}
            </span>
          </div>
          <p className="text-[11px] font-semibold text-neutral-700 mt-0.5 leading-snug">
            {isBypass
              ? 'Video tampil 100% asli tanpa efek tambahan. Ubah opsi mana pun di bawah untuk langsung mengaktifkan kustomisasi.'
              : 'Semua perubahan di bawah diterapkan real-time pada Live Preview & direkam ke MP4/WebM.'}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          <div className="grid grid-cols-2 border-2 border-black bg-white shadow-[1.5px_1.5px_0px_#000]">
            <button
              type="button"
              onClick={() => onToggleBypass(true)}
              className={`px-2.5 py-1.5 text-[11px] font-black cursor-pointer transition-colors ${
                isBypass ? 'bg-black text-yellow-300' : 'hover:bg-neutral-100 text-black'
              }`}
            >
              Polos Murni
            </button>
            <button
              type="button"
              onClick={() => onToggleBypass(false)}
              className={`px-2.5 py-1.5 text-[11px] font-black border-l-2 border-black cursor-pointer transition-colors ${
                !isBypass ? 'bg-cyan-300 text-black' : 'hover:bg-neutral-100 text-black'
              }`}
            >
              Kustom Aktif
            </button>
          </div>

          <button
            type="button"
            onClick={onResetToPure}
            className="px-2.5 py-1.5 bg-white hover:bg-neutral-200 border-2 border-black shadow-[1.5px_1.5px_0px_#000] font-black text-[11px] flex items-center gap-1 cursor-pointer"
            title="Batalkan dan reset seluruh pengaturan ke kondisi polos"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Batalkan / Reset ke Polos</span>
            <span className="sm:hidden">Reset</span>
          </button>
        </div>
      </div>

      {/* ─── 4 SUB-TAB KUSTOMISASI TERPADU (SELALU TAMPIL & RESPONSIF MOBILE) ─── */}
      <div className="grid grid-cols-4 border-b-2 border-black gap-1 pb-1.5">
        <button
          type="button"
          onClick={() => setSubTab('design')}
          className={`px-1 sm:px-2.5 py-2 text-[10px] sm:text-xs font-black uppercase flex items-center justify-center gap-1 border-t-2 border-l-2 border-r-2 border-black -mb-[2px] cursor-pointer truncate ${
            subTab === 'design' ? 'bg-yellow-300 text-black' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          <Palette className="w-3.5 h-3.5 shrink-0" />
          <span className="sm:hidden truncate">Warna</span>
          <span className="hidden sm:inline truncate">Desain &amp; Warna</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('effects')}
          className={`px-1 sm:px-2.5 py-2 text-[10px] sm:text-xs font-black uppercase flex items-center justify-center gap-1 border-t-2 border-l-2 border-r-2 border-black -mb-[2px] cursor-pointer truncate ${
            subTab === 'effects' ? 'bg-cyan-300 text-black' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span className="sm:hidden truncate">Efek</span>
          <span className="hidden sm:inline truncate">Bentukan &amp; Efek</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('typo')}
          className={`px-1 sm:px-2.5 py-2 text-[10px] sm:text-xs font-black uppercase flex items-center justify-center gap-1 border-t-2 border-l-2 border-r-2 border-black -mb-[2px] cursor-pointer truncate ${
            subTab === 'typo' ? 'bg-pink-300 text-black' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          <Type className="w-3.5 h-3.5 shrink-0" />
          <span className="sm:hidden truncate">Teks</span>
          <span className="hidden sm:inline truncate">Tipografi &amp; HUD</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('motion')}
          className={`px-1 sm:px-2.5 py-2 text-[10px] sm:text-xs font-black uppercase flex items-center justify-center gap-1 border-t-2 border-l-2 border-r-2 border-black -mb-[2px] cursor-pointer truncate ${
            subTab === 'motion' ? 'bg-lime-300 text-black' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
          <span className="sm:hidden truncate">Gerak</span>
          <span className="hidden sm:inline truncate">Kamera &amp; Gerak</span>
        </button>
      </div>

      {/* ═══ TAB 1: DESAIN & WARNA ═══ */}
      {subTab === 'design' && (
        <div className={`space-y-3 text-xs ${isBypass ? 'opacity-85' : ''}`}>
          <div>
            <label className="font-black uppercase text-[10px] text-neutral-700 block mb-1">Gaya Visual / Look:</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {STUDIO_VISUAL_STYLES.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onChangeSetting({ visualStyle: st.id })}
                  className={`px-2 py-1.5 border-2 border-black font-bold text-[11px] text-left truncate cursor-pointer ${
                    settings.visualStyle === st.id ? 'bg-yellow-300 text-black shadow-[1.5px_1.5px_0px_#000]' : 'bg-neutral-50 hover:bg-neutral-100 text-black'
                  }`}
                >
                  {st.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-black uppercase text-[10px] text-neutral-700 block mb-1">Mood Warna (Preset):</label>
            <div className="flex flex-wrap gap-1.5">
              {STUDIO_MOOD_PRESETS.map((mood) => (
                <button
                  key={mood.id}
                  type="button"
                  onClick={() => handleSelectMood(mood)}
                  className={`px-2 py-1 border-2 border-black text-[11px] font-bold flex items-center gap-1.5 cursor-pointer ${
                    settings.mood === mood.id ? 'bg-black text-white' : 'bg-white hover:bg-neutral-100 text-black'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full border border-black inline-block shrink-0" style={{ background: mood.dot }} />
                  <span>{mood.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 4 Color Picker Kustom */}
          <div className="p-2.5 bg-neutral-50 border border-black space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-black text-[11px] uppercase text-neutral-800">Palet Latar, Aksen &amp; HUD:</span>
              <div className="flex gap-1">
                {['gradient', 'solid'].map((bt) => (
                  <button
                    key={bt}
                    type="button"
                    onClick={() => onChangeSetting({ bgType: bt })}
                    className={`px-2 py-0.5 border border-black font-bold text-[10px] uppercase cursor-pointer ${
                      settings.bgType === bt ? 'bg-black text-white' : 'bg-white'
                    }`}
                  >
                    {bt}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { key: 'bgColor1', label: 'Latar 1' },
                { key: 'bgColor2', label: 'Latar 2' },
                { key: 'tintColor', label: 'Aksen / Tint' },
                { key: 'hudTextColor', label: 'Teks HUD' }
              ].map((cp) => (
                <label key={cp.key} className="flex items-center justify-between gap-1 px-2 py-1.5 bg-white border border-black cursor-pointer">
                  <span className="font-bold text-[10px] truncate">{cp.label}</span>
                  <input
                    type="color"
                    value={settings[cp.key] || '#38bdf8'}
                    onChange={(e) => onChangeSetting({ mood: 'custom', [cp.key]: e.target.value })}
                    className="w-6 h-5 p-0 border border-black cursor-pointer bg-transparent shrink-0"
                  />
                </label>
              ))}
            </div>

            {editorTab === 'text' && (
              <label className="flex items-center gap-2 font-bold text-[11px] pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.usePromptHexColors !== false}
                  onChange={(e) => onChangeSetting({ usePromptHexColors: e.target.checked })}
                  className="w-3.5 h-3.5 accent-black cursor-pointer"
                />
                <span>Prioritaskan kode warna #hex langsung dari teks prompt</span>
              </label>
            )}
          </div>

          {/* Color Grading Real-Time */}
          <div className="p-2.5 bg-neutral-50 border border-black space-y-2">
            <span className="font-black text-[11px] uppercase text-neutral-800 block">Color Grading Real-Time:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'saturation', label: 'Saturasi', min: 0, max: 200, unit: '%' },
                { key: 'contrast', label: 'Kontras', min: 50, max: 180, unit: '%' },
                { key: 'brightness', label: 'Kecerahan', min: 50, max: 160, unit: '%' },
                { key: 'hueRotate', label: 'Hue Shift', min: -180, max: 180, unit: '°' }
              ].map((sl) => (
                <div key={sl.key}>
                  <div className="flex justify-between font-bold text-[11px] mb-1">
                    <span>{sl.label}:</span>
                    <span className="font-mono">{settings[sl.key] ?? (sl.key === 'hueRotate' ? 0 : 100)}{sl.unit}</span>
                  </div>
                  <input
                    type="range"
                    min={sl.min}
                    max={sl.max}
                    step={5}
                    value={settings[sl.key] ?? (sl.key === 'hueRotate' ? 0 : 100)}
                    onChange={(e) => onChangeSetting({ [sl.key]: Number(e.target.value) })}
                    className="w-full accent-black cursor-pointer h-2"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB 2: BENTUKAN, LATAR & EFEK ═══ */}
      {subTab === 'effects' && (
        <div className={`space-y-3 text-xs ${isBypass ? 'opacity-85' : ''}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="font-black uppercase text-[10px] text-neutral-700 block mb-1">Pola Latar / Overlay Atmosfer:</label>
              <select
                value={settings.bgPattern || 'none'}
                onChange={(e) => onChangeSetting({ bgPattern: e.target.value })}
                className="w-full bg-white border-2 border-black p-2 font-bold text-xs cursor-pointer"
              >
                <option value="none">Mati / Asli</option>
                {PROMPT_BG_PATTERNS.filter((p) => p.id !== 'auto' && p.id !== 'plain').map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-black uppercase text-[10px] text-neutral-700 block mb-1">Gaya Bingkai / Frame Video:</label>
              <select
                value={settings.frameStyle || (settings.stage3d ? '3d-tv' : 'full')}
                onChange={(e) => {
                  const fs = e.target.value;
                  onChangeSetting({ frameStyle: fs, stage3d: fs === '3d-tv' });
                }}
                className="w-full bg-white border-2 border-black p-2 font-bold text-xs cursor-pointer"
              >
                <option value="full">Full Layar (Tanpa Bingkai)</option>
                <option value="neo-brutalist">Bingkai Neo-Brutalist (Border Tegas)</option>
                <option value="glass">Glass Frame Rounded</option>
                <option value="3d-tv">Bingkai TV / Panggung 3D</option>
              </select>
            </div>

            {editorTab === 'text' && (
              <>
                <div>
                  <label className="font-black uppercase text-[10px] text-neutral-700 block mb-1">Ilustrasi Hero Adegan:</label>
                  <select
                    value={settings.heroVisual || 'auto'}
                    onChange={(e) => onChangeSetting({ heroVisual: e.target.value })}
                    className="w-full bg-white border-2 border-black p-2 font-bold text-xs cursor-pointer"
                  >
                    {PROMPT_HERO_VISUALS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-black uppercase text-[10px] text-neutral-700 block mb-1">Gaya Kartu Fitur:</label>
                  <select
                    value={settings.cardStyle || 'auto'}
                    onChange={(e) => onChangeSetting({ cardStyle: e.target.value })}
                    className="w-full bg-white border-2 border-black p-2 font-bold text-xs cursor-pointer"
                  >
                    {PROMPT_CARD_STYLES.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Awan Atmosferik */}
          <div className="p-2.5 bg-neutral-50 border border-black space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-black text-black flex items-center gap-1.5">
                <Cloud className="w-4 h-4" /> Awan Atmosferik
              </span>
              <input
                type="checkbox"
                checked={Boolean(settings.clouds)}
                onChange={(e) => onChangeSetting({ clouds: e.target.checked })}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </div>
            {settings.clouds && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-neutral-200 items-center">
                <div>
                  <div className="flex justify-between font-bold text-[11px] mb-1">
                    <span>Opasitas Awan:</span>
                    <span className="font-mono">{Math.round((settings.cloudDensity || 0.25) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.05"
                    value={settings.cloudDensity || 0.25}
                    onChange={(e) => onChangeSetting({ cloudDensity: Number(e.target.value) })}
                    className="w-full accent-black cursor-pointer h-2"
                  />
                </div>
                <label className="flex items-center justify-between bg-white border border-black px-2 py-1 cursor-pointer">
                  <span className="font-bold text-[11px]">Warna Awan</span>
                  <input
                    type="color"
                    value={settings.cloudColor || '#ffffff'}
                    onChange={(e) => onChangeSetting({ cloudColor: e.target.value })}
                    className="w-7 h-6 p-0 border border-black cursor-pointer"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Partikel Udara */}
          <div className="p-2.5 bg-neutral-50 border border-black space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-black text-black flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> Partikel Udara (5 Gaya)
              </span>
              <input
                type="checkbox"
                checked={Boolean(settings.particles)}
                onChange={(e) => onChangeSetting({ particles: e.target.checked })}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </div>
            {settings.particles && (
              <div className="space-y-2 pt-1 border-t border-neutral-200">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1">
                  {[
                    { id: 'petals-stars', label: 'Kelopak & Bintang' },
                    { id: 'dust', label: 'Debu Bokeh' },
                    { id: 'fire-sparks', label: 'Bara Api' },
                    { id: 'snow', label: 'Salju Lembut' },
                    { id: 'sparks', label: 'Neon Sparks' }
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => onChangeSetting({ particleStyle: st.id })}
                      className={`px-1.5 py-1.5 border border-black font-bold text-[10px] text-center cursor-pointer truncate ${
                        settings.particleStyle === st.id ? 'bg-cyan-300 text-black' : 'bg-white hover:bg-neutral-100'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                  <div>
                    <div className="flex justify-between font-bold text-[11px] mb-1">
                      <span>Kepadatan:</span>
                      <span className="font-mono">{settings.particleCount || 100} titik</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="300"
                      step="20"
                      value={settings.particleCount || 100}
                      onChange={(e) => onChangeSetting({ particleCount: Number(e.target.value) })}
                      className="w-full accent-black cursor-pointer h-2"
                    />
                  </div>
                  <label className="flex items-center justify-between bg-white border border-black px-2 py-1 cursor-pointer">
                    <span className="font-bold text-[11px]">Warna Partikel</span>
                    <input
                      type="color"
                      value={settings.particleColor || '#ffffff'}
                      onChange={(e) => onChangeSetting({ particleColor: e.target.value })}
                      className="w-7 h-6 p-0 border border-black cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Polesan Sinematik HD */}
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { key: 'vignette', label: 'Vignette Halus' },
              { key: 'softBloom', label: 'Soft Bloom / Glow' },
              { key: 'filmGrain', label: 'Subtle Film Grain' },
              { key: 'shimmerSweep', label: 'Kilau Diagonal (Shimmer)' }
            ].map((fx) => (
              <label key={fx.key} className="flex items-center gap-2 p-2 bg-neutral-50 border border-black cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(settings[fx.key])}
                  onChange={(e) => onChangeSetting({ [fx.key]: e.target.checked })}
                  className="w-3.5 h-3.5 accent-black cursor-pointer"
                />
                <span className="font-bold text-[11px] truncate">{fx.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ═══ TAB 3: TIPOGRAFI & ELEMEN HUD ═══ */}
      {subTab === 'typo' && (
        <div className={`space-y-3 text-xs ${isBypass ? 'opacity-85' : ''}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="font-black uppercase text-[10px] text-neutral-700 block mb-1">Jenis Font:</label>
              <select
                value={settings.fontFamily || 'original'}
                onChange={(e) => onChangeSetting({ fontFamily: e.target.value })}
                className="w-full bg-white border-2 border-black p-2 font-bold text-xs cursor-pointer"
              >
                <option value="original">Asli Kode</option>
                {Object.keys(STUDIO_FONT_PRESETS)
                  .filter((k) => k !== 'original')
                  .map((k) => (
                    <option key={k} value={k}>
                      {k === 'geometric' ? 'Modern Geometris' : k === 'bold-display' ? 'Bold Display' : k === 'editorial-serif' ? 'Editorial Serif' : 'Tech Mono'}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex items-end">
              <label className="w-full flex items-center justify-between gap-2 p-2 bg-neutral-50 border-2 border-black cursor-pointer">
                <span className="font-black text-xs">Progress Bar Bawah</span>
                <input
                  type="checkbox"
                  checked={Boolean(settings.progressBarEnabled)}
                  onChange={(e) => onChangeSetting({ progressBarEnabled: e.target.checked })}
                  className="w-4 h-4 accent-black cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Toggle Judul & Subjudul HUD */}
          <div className="p-2.5 bg-neutral-50 border border-black space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-black text-black">Tampilkan Judul &amp; Subjudul HUD</span>
              <input
                type="checkbox"
                checked={Boolean(settings.hudEnabled)}
                onChange={(e) => onChangeSetting({ hudEnabled: e.target.checked })}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </div>

            {settings.hudEnabled && (
              <div className="space-y-2 pt-1 border-t border-neutral-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={settings.hudTitle || ''}
                    onChange={(e) => onChangeSetting({ hudTitle: e.target.value })}
                    placeholder="Judul Utama HUD"
                    className="w-full bg-white border border-black p-1.5 font-bold font-mono text-xs"
                  />
                  <input
                    type="text"
                    value={settings.hudSubtitle || ''}
                    onChange={(e) => onChangeSetting({ hudSubtitle: e.target.value })}
                    placeholder="Subjudul HUD"
                    className="w-full bg-white border border-black p-1.5 font-bold font-mono text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <select
                    value={settings.hudStyle || 'brutalist'}
                    onChange={(e) => onChangeSetting({ hudStyle: e.target.value })}
                    className="bg-white border border-black p-1.5 font-bold text-[11px]"
                  >
                    <option value="brutalist">Badge: Neo-Brutalist</option>
                    <option value="glass">Badge: Glass</option>
                    <option value="minimal">Badge: Polos Minimal</option>
                  </select>
                  <select
                    value={settings.hudPosition || 'bottom-left'}
                    onChange={(e) => onChangeSetting({ hudPosition: e.target.value })}
                    className="bg-white border border-black p-1.5 font-bold text-[11px]"
                  >
                    <option value="bottom-left">Bawah Kiri</option>
                    <option value="bottom-center">Bawah Tengah</option>
                    <option value="top-left">Atas Kiri</option>
                    <option value="top-center">Atas Tengah</option>
                  </select>
                  <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5 px-2 bg-white border border-black">
                    <span className="text-[10px] font-bold">Ukuran</span>
                    <input
                      type="range"
                      min="0.7"
                      max="1.4"
                      step="0.1"
                      value={settings.hudScale || 1.0}
                      onChange={(e) => onChangeSetting({ hudScale: Number(e.target.value) })}
                      className="flex-1 accent-black cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Brand Pill Atas */}
          <div className="p-2.5 bg-neutral-50 border border-black space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-black text-black">Brand Pill Atas (Sorotan Merek)</span>
              <input
                type="checkbox"
                checked={Boolean(settings.brandBadgeEnabled)}
                onChange={(e) => onChangeSetting({ brandBadgeEnabled: e.target.checked })}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </div>
            {settings.brandBadgeEnabled && (
              <input
                type="text"
                value={settings.brandBadgeText || ''}
                onChange={(e) => onChangeSetting({ brandBadgeText: e.target.value })}
                placeholder="Contoh: KURO STUDIO"
                className="w-full bg-white border border-black p-1.5 font-bold font-mono text-xs"
              />
            )}
          </div>

          {editorTab === 'text' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <select
                value={settings.textScale || 'normal'}
                onChange={(e) => onChangeSetting({ textScale: e.target.value })}
                className="bg-white border border-black p-1.5 font-bold text-[11px]"
              >
                {PROMPT_TEXT_SCALES.map((o) => <option key={o.id} value={o.id}>Skala: {o.name}</option>)}
              </select>
              <select
                value={settings.textAlign || 'left'}
                onChange={(e) => onChangeSetting({ textAlign: e.target.value })}
                className="bg-white border border-black p-1.5 font-bold text-[11px]"
              >
                {PROMPT_TEXT_ALIGNS.map((o) => <option key={o.id} value={o.id}>Rata: {o.name}</option>)}
              </select>
              <label className="flex items-center gap-1.5 p-1.5 bg-white border border-black font-bold text-[11px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showMetricCounters !== false}
                  onChange={(e) => onChangeSetting({ showMetricCounters: e.target.checked })}
                  className="w-3.5 h-3.5 accent-black cursor-pointer"
                />
                <span className="truncate">Animasi Angka</span>
              </label>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB 4: KOREOGRAFI, TRANSISI & KAMERA 3D ═══ */}
      {subTab === 'motion' && (
        <div className={`space-y-3 text-xs ${isBypass ? 'opacity-85' : ''}`}>
          <div>
            <div className="flex justify-between font-bold mb-1">
              <span>Kecepatan Gerak (Speed Multiplier):</span>
              <span className="font-mono">{settings.motionSpeed || 1}x</span>
            </div>
            <input
              type="range"
              min="0.25"
              max="3.0"
              step="0.25"
              value={settings.motionSpeed || 1}
              onChange={(e) => {
                const spd = Number(e.target.value);
                onChangeSetting({ motionSpeed: spd });
                onSendLiveSpeed?.(spd);
              }}
              className="w-full accent-black cursor-pointer h-2"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="font-black uppercase text-[10px] text-neutral-700 block mb-1">Transisi Intro &amp; Outro Video:</label>
              <select
                value={settings.transitionStyle || 'none'}
                onChange={(e) => onChangeSetting({ transitionStyle: e.target.value })}
                className="w-full bg-white border-2 border-black p-2 font-bold text-xs cursor-pointer"
              >
                <option value="none">Tanpa Transisi</option>
                <option value="fade">Fade Sinematik</option>
                <option value="zoom">Zoom Smooth</option>
                <option value="wipe">Wipe Cepat</option>
                <option value="slide">Slide Elastis</option>
              </select>
            </div>

            <div>
              <label className="font-black uppercase text-[10px] text-neutral-700 block mb-1">Gerakan Kamera Halus:</label>
              <select
                value={settings.cameraMotion || 'static'}
                onChange={(e) => {
                  const cm = e.target.value;
                  onChangeSetting({
                    cameraMotion: cm,
                    autoOrbit: cm === 'auto-orbit'
                  });
                }}
                className="w-full bg-white border-2 border-black p-2 font-bold text-xs cursor-pointer"
              >
                <option value="static">Diam (Static)</option>
                <option value="ken-burns">Ken Burns Zoom Halus</option>
                <option value="floating">Floating Melayang</option>
                <option value="auto-orbit">Auto-Orbit 3D</option>
              </select>
            </div>
          </div>

          {editorTab === 'text' && (
            <div className="p-2 bg-neutral-50 border border-black grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
              <select
                value={settings.motionEasing || 'bouncy'}
                onChange={(e) => onChangeSetting({ motionEasing: e.target.value })}
                className="bg-white border border-black p-1.5 font-bold text-[11px]"
              >
                {PROMPT_EASINGS.map((o) => <option key={o.id} value={o.id}>Easing: {o.name}</option>)}
              </select>
              <button
                type="button"
                onClick={onSyncTextDuration}
                className="px-2 py-1.5 bg-cyan-200 hover:bg-cyan-300 border border-black font-black text-[11px] cursor-pointer truncate"
              >
                Sinkron Durasi Teks ({recommendedDuration}s)
              </button>
            </div>
          )}

          {/* Kontrol Kamera 3D TV */}
          <div className="p-2.5 bg-neutral-50 border-2 border-black space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-black text-black flex items-center gap-1.5">
                <Tv className="w-4 h-4" /> Aktifkan Bingkai / Kamera 3D TV
              </span>
              <input
                type="checkbox"
                checked={settings.frameStyle === '3d-tv' || Boolean(settings.stage3d)}
                onChange={(e) => {
                  const on = e.target.checked;
                  onChangeSetting({ stage3d: on, frameStyle: on ? '3d-tv' : 'full' });
                }}
                className="w-4 h-4 accent-black cursor-pointer"
              />
            </div>

            {(settings.frameStyle === '3d-tv' || settings.stage3d) && (
              <div className="space-y-2.5 pt-1 border-t border-neutral-200">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                  {[
                    { name: 'Flat', rx: 0, ry: 0, rz: 0 },
                    { name: 'Isometric', rx: 22, ry: -25, rz: 0 },
                    { name: 'Cinematic', rx: 16, ry: -20, rz: 0 },
                    { name: 'Top-Down', rx: 45, ry: 0, rz: 0 }
                  ].map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => onChangeSetting({ rotateX: p.rx, rotateY: p.ry, rotateZ: p.rz })}
                      className="p-1.5 bg-white hover:bg-yellow-200 border border-black font-bold text-[11px] cursor-pointer"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { key: 'rotateX', label: 'Pitch', min: -60, max: 60, step: 1, unit: '°' },
                    { key: 'rotateY', label: 'Yaw', min: -60, max: 60, step: 1, unit: '°' },
                    { key: 'rotateZ', label: 'Roll', min: -45, max: 45, step: 1, unit: '°' },
                    { key: 'zoom', label: 'Zoom', min: 0.5, max: 2.0, step: 0.05, unit: 'x' }
                  ].map((s) => (
                    <div key={s.key}>
                      <div className="flex justify-between font-bold text-[10px]">
                        <span>{s.label}</span>
                        <span className="font-mono">{settings[s.key] ?? 0}{s.unit}</span>
                      </div>
                      <input
                        type="range"
                        min={s.min}
                        max={s.max}
                        step={s.step}
                        value={settings[s.key] ?? 0}
                        onChange={(e) => onChangeSetting({ [s.key]: Number(e.target.value) })}
                        className="w-full accent-black cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
