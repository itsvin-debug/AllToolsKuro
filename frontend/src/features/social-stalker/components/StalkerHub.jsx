import React, { useState } from 'react';
import CosmicBackButton from '../../../shared/components/CosmicBackButton';
import { 
  ArrowRight, 
  ShieldCheck, 
  EyeOff, 
  Sparkles,
  Globe2
} from 'lucide-react';
import { TikTokLogo, InstagramLogo, TwitterXLogo, GitHubLogo } from './BrandLogos';
import TikTokStalkerView from './TikTokStalkerView';
import InstagramStalkerView from './InstagramStalkerView';
import TwitterStalkerView from './TwitterStalkerView';
import GithubStalkerView from './GithubStalkerView';

export default function StalkerHub({ onBack, onShowToast, lang = 'id' }) {
  const isEn = lang === 'en';
  const [selectedPlatform, setSelectedPlatform] = useState(null);

  const handlePlatformBack = () => setSelectedPlatform(null);

  // Jika platform sudah dipilih, render sub-view platform tersebut secara terisolasi
  if (selectedPlatform === 'tiktok') {
    return (
      <TikTokStalkerView 
        onBack={handlePlatformBack} 
        onChangePlatform={handlePlatformBack} 
        onShowToast={onShowToast} 
        lang={lang} 
      />
    );
  }

  if (selectedPlatform === 'instagram') {
    return (
      <InstagramStalkerView 
        onBack={handlePlatformBack} 
        onChangePlatform={handlePlatformBack} 
        onShowToast={onShowToast} 
        lang={lang} 
      />
    );
  }

  if (selectedPlatform === 'twitter') {
    return (
      <TwitterStalkerView 
        onBack={handlePlatformBack} 
        onChangePlatform={handlePlatformBack} 
        onShowToast={onShowToast} 
        lang={lang} 
      />
    );
  }

  if (selectedPlatform === 'github') {
    return (
      <GithubStalkerView 
        onBack={handlePlatformBack} 
        onChangePlatform={handlePlatformBack} 
        onShowToast={onShowToast} 
        lang={lang} 
      />
    );
  }

  const platforms = [
    {
      id: 'tiktok',
      name: 'TikTok Stalker',
      badge: 'TIKTOK OSINT',
      color: '#000000',
      iconBg: '#000000',
      iconColor: '#ffffff',
      icon: TikTokLogo,
      desc: isEn 
        ? 'Inspect TikTok accounts, follower analytics, likes, private status, and bio without logging in.'
        : 'Pantau intelijen akun, followers, total likes, status akun privat, serta bio TikTok secara 100% anonim.'
    },
    {
      id: 'instagram',
      name: 'Instagram Stalker',
      badge: 'INSTAGRAM OSINT',
      color: '#d946ef',
      iconBg: 'transparent',
      iconColor: '#ffffff',
      icon: InstagramLogo,
      desc: isEn
        ? 'Download HD profile pictures, inspect followers, following, posts, bio links, and privacy status.'
        : 'Cek foto profil HD asli, followers, following, jumlah post, status privat, dan tautan bio aktif IG.'
    },
    {
      id: 'twitter',
      name: 'X / Twitter Stalker',
      badge: 'X / TWITTER OSINT',
      color: '#0f172a',
      iconBg: '#000000',
      iconColor: '#ffffff',
      icon: TwitterXLogo,
      desc: isEn
        ? 'Track X profiles, followers, total tweets, joined dates, locations, verified badges, and banners.'
        : 'Lacak profil X, jumlah followers, total tweet, tanggal bergabung, lokasi akun, badge verifikasi & bio.'
    },
    {
      id: 'github',
      name: 'GitHub Stalker',
      badge: 'GITHUB OSINT',
      color: '#24292f',
      iconBg: '#24292f',
      iconColor: '#ffffff',
      icon: GitHubLogo,
      desc: isEn
        ? 'Analyze open-source developers, total repo stars, public repos, followers, company, and tech portfolio.'
        : 'Analisis profil developer, total stars repositori, public repos, followers, company, dan portfolio tech.'
    }
  ];

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-4 sm:space-y-6">
      {/* Header & Back Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <CosmicBackButton onClick={onBack} onBack={onBack} label={isEn ? 'Back to Home' : 'Kembali ke Beranda'} />

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#10b981] text-black text-[11px] sm:text-xs font-black uppercase tracking-wider border-2 border-black rounded-lg shadow-[2px_2px_0px_#000000]">
            <EyeOff className="w-3.5 h-3.5" />
            100% Anonymous
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#facc15] text-black text-[11px] sm:text-xs font-black uppercase tracking-wider border-2 border-black rounded-lg shadow-[2px_2px_0px_#000000]">
            <ShieldCheck className="w-3.5 h-3.5" />
            Zero Footprint
          </span>
        </div>
      </div>

      {/* Main Title Banner */}
      <div className="bg-white border-2 border-black rounded-2xl p-4 sm:p-6 shadow-[4px_4px_0px_#000000] relative overflow-hidden">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="p-2.5 sm:p-3.5 bg-black border-2 border-black rounded-xl shadow-[3px_3px_0px_#000000] text-white shrink-0">
            <Globe2 className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#fef08a] border border-black rounded-md text-[10px] font-black uppercase tracking-wider text-black mb-0.5">
              <Sparkles className="w-3 h-3 text-black" />
              <span>Multi-Platform OSINT</span>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-black uppercase tracking-tight">
              Social Media Stalker
            </h1>
            <p className="text-xs sm:text-sm md:text-base font-semibold text-neutral-600 leading-relaxed">
              {isEn 
                ? 'Select a target social media platform to begin anonymous profile reconnaissance and intelligence gathering.'
                : 'Pilih platform media sosial target untuk memulai pemantauan intelijen akun secara 100% anonim.'}
            </p>
          </div>
        </div>
      </div>

      {/* 2x2 Platform Selection Grid (Responsif 2 kolom di HP & Desktop) */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 w-full">
        {platforms.map(p => {
          const Icon = p.icon;
          return (
            <div
              key={p.id}
              onClick={() => setSelectedPlatform(p.id)}
              className="group bg-white border-2 border-black rounded-xl sm:rounded-2xl p-2.5 sm:p-5 shadow-[3px_3px_0px_#000000] sm:shadow-[4px_4px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0px_#000000] transition-all cursor-pointer flex flex-col justify-between space-y-2 sm:space-y-4 relative overflow-hidden min-w-0"
            >
              <div className="flex items-start justify-between gap-1 sm:gap-3">
                <div 
                  className="p-1.5 sm:p-3 rounded-lg sm:rounded-xl border-2 border-black text-white shadow-[2px_2px_0px_#000000] transition-transform group-hover:scale-105 shrink-0"
                  style={{ backgroundColor: p.iconBg }}
                >
                  <Icon className="w-4 h-4 sm:w-6 sm:h-6" style={{ color: p.iconColor }} />
                </div>
                <span className="text-[7.5px] sm:text-[10px] font-black px-1.5 sm:px-2 py-0.5 rounded-md border border-black bg-neutral-100 uppercase tracking-wider text-right truncate">
                  {p.badge}
                </span>
              </div>

              <div className="space-y-0.5 sm:space-y-1 flex-1 min-w-0">
                <h3 className="text-xs sm:text-base md:text-lg font-black text-black group-hover:text-neutral-800 flex items-center justify-between">
                  <span className="truncate">{p.name}</span>
                  <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 text-black group-hover:translate-x-1 transition-transform shrink-0 ml-1" />
                </h3>
                <p className="text-[9.5px] sm:text-xs font-semibold text-neutral-600 leading-tight sm:leading-relaxed line-clamp-2">
                  {p.desc}
                </p>
              </div>

              <div className="pt-1.5 sm:pt-2 border-t border-neutral-200 flex items-center justify-between text-[9px] sm:text-xs font-black">
                <span className="text-neutral-500 font-bold hidden sm:inline">
                  {isEn ? 'Click to inspect' : 'Buka instrumen'}
                </span>
                <span 
                  className="inline-flex items-center gap-1 font-black ml-auto sm:ml-0"
                  style={{ color: p.color }}
                >
                  <span>{isEn ? 'Launch' : 'Mulai Lacak'}</span>
                  <ArrowRight className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
