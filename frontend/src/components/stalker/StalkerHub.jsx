import React, { useState } from 'react';
import CosmicBackButton from '../CosmicBackButton';
import { 
  Radio, 
  Camera, 
  ArrowRight, 
  ShieldCheck, 
  EyeOff, 
  Sparkles,
  Search,
  Globe2
} from 'lucide-react';
import TikTokStalkerView from './TikTokStalkerView';
import InstagramStalkerView from './InstagramStalkerView';
import TwitterStalkerView from './TwitterStalkerView';
import GithubStalkerView from './GithubStalkerView';

function TwitterIcon({ className = "w-6 h-6", ...props }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GithubIcon({ className = "w-6 h-6", ...props }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export default function StalkerHub({ onBack, onShowToast, lang = 'id' }) {
  const isEn = lang === 'en';
  const [selectedPlatform, setSelectedPlatform] = useState(null);

  // Jika platform sudah dipilih, render sub-view platform tersebut secara terisolasi
  if (selectedPlatform === 'tiktok') {
    return (
      <TikTokStalkerView 
        onBack={onBack} 
        onChangePlatform={() => setSelectedPlatform(null)} 
        onShowToast={onShowToast} 
        lang={lang} 
      />
    );
  }

  if (selectedPlatform === 'instagram') {
    return (
      <InstagramStalkerView 
        onBack={onBack} 
        onChangePlatform={() => setSelectedPlatform(null)} 
        onShowToast={onShowToast} 
        lang={lang} 
      />
    );
  }

  if (selectedPlatform === 'twitter') {
    return (
      <TwitterStalkerView 
        onBack={onBack} 
        onChangePlatform={() => setSelectedPlatform(null)} 
        onShowToast={onShowToast} 
        lang={lang} 
      />
    );
  }

  if (selectedPlatform === 'github') {
    return (
      <GithubStalkerView 
        onBack={onBack} 
        onChangePlatform={() => setSelectedPlatform(null)} 
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
      color: '#ef4444',
      bgHover: 'hover:border-[#ef4444]',
      icon: Radio,
      desc: isEn 
        ? 'Inspect TikTok accounts, follower analytics, likes, private status, and bio without logging in.'
        : 'Pantau intelijen akun, followers, total likes, status akun privat, serta bio TikTok secara 100% anonim.'
    },
    {
      id: 'instagram',
      name: 'Instagram Stalker',
      badge: 'INSTAGRAM OSINT',
      color: '#d946ef',
      bgHover: 'hover:border-[#d946ef]',
      icon: Camera,
      desc: isEn
        ? 'Download HD profile pictures, inspect followers, following, posts, bio links, and privacy status.'
        : 'Cek foto profil HD asli, followers, following, jumlah post, status privat, dan tautan bio aktif IG.'
    },
    {
      id: 'twitter',
      name: 'X / Twitter Stalker',
      badge: 'X / TWITTER OSINT',
      color: '#0ea5e9',
      bgHover: 'hover:border-[#0ea5e9]',
      icon: TwitterIcon,
      desc: isEn
        ? 'Track X profiles, followers, total tweets, joined dates, locations, verified badges, and banners.'
        : 'Lacak profil X, jumlah followers, total tweet, tanggal bergabung, lokasi akun, badge verifikasi & bio.'
    },
    {
      id: 'github',
      name: 'GitHub Stalker',
      badge: 'GITHUB OSINT',
      color: '#10b981',
      bgHover: 'hover:border-[#10b981]',
      icon: GithubIcon,
      desc: isEn
        ? 'Analyze open-source developers, total repo stars, public repos, followers, company, and tech portfolio.'
        : 'Analisis profil developer, total stars repositori, public repos, followers, company, dan portfolio tech.'
    }
  ];

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header & Back Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <CosmicBackButton onClick={onBack} onBack={onBack} label={isEn ? 'Back to Home' : 'Kembali ke Beranda'} />

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#10b981] text-black text-xs font-black uppercase tracking-wider border-2 border-black rounded-lg shadow-[2px_2px_0px_#000000]">
            <EyeOff className="w-3.5 h-3.5" />
            100% Anonymous
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#facc15] text-black text-xs font-black uppercase tracking-wider border-2 border-black rounded-lg shadow-[2px_2px_0px_#000000]">
            <ShieldCheck className="w-3.5 h-3.5" />
            Zero Footprint
          </span>
        </div>
      </div>

      {/* Main Title Banner */}
      <div className="bg-white border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0px_#000000] relative overflow-hidden">
        <div className="flex items-start gap-4">
          <div className="p-3.5 bg-black border-2 border-black rounded-xl shadow-[3px_3px_0px_#000000] text-white shrink-0">
            <Globe2 className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-[#fef08a] border border-black rounded-md text-[10px] font-black uppercase tracking-wider text-black mb-1">
              <Sparkles className="w-3 h-3 text-black" />
              <span>Multi-Platform OSINT</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-black uppercase tracking-tight">
              Social Media Stalker
            </h1>
            <p className="text-sm md:text-base font-semibold text-neutral-600">
              {isEn 
                ? 'Select a target social media platform to begin anonymous profile reconnaissance and intelligence gathering.'
                : 'Pilih platform media sosial target untuk memulai pemantauan intelijen akun secara 100% anonim.'}
            </p>
          </div>
        </div>
      </div>

      {/* 2x2 Platform Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {platforms.map(p => {
          const Icon = p.icon;
          return (
            <div
              key={p.id}
              onClick={() => setSelectedPlatform(p.id)}
              className="group bg-white border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0px_#000000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#000000] transition-all cursor-pointer flex flex-col justify-between space-y-4 relative overflow-hidden"
            >
              <div className="flex items-start justify-between gap-3">
                <div 
                  className="p-3 rounded-xl border-2 border-black text-white shadow-[2px_2px_0px_#000000] transition-transform group-hover:scale-105"
                  style={{ backgroundColor: p.color }}
                >
                  <Icon className="w-6 h-6 stroke-[2.2]" />
                </div>
                <span className="text-[10px] font-black px-2.5 py-0.5 rounded-md border border-black bg-neutral-100 uppercase tracking-wider">
                  {p.badge}
                </span>
              </div>

              <div className="space-y-1.5 flex-1">
                <h3 className="text-xl font-black text-black group-hover:text-neutral-800 flex items-center justify-between">
                  <span>{p.name}</span>
                  <ArrowRight className="w-4 h-4 text-black group-hover:translate-x-1 transition-transform" />
                </h3>
                <p className="text-xs md:text-sm font-semibold text-neutral-600 leading-relaxed">
                  {p.desc}
                </p>
              </div>

              <div className="pt-2 border-t border-neutral-200 flex items-center justify-between text-xs font-black">
                <span className="text-neutral-500 font-bold">
                  {isEn ? 'Click to inspect' : 'Buka instrumen'}
                </span>
                <span 
                  className="inline-flex items-center gap-1 font-black"
                  style={{ color: p.color }}
                >
                  <span>{isEn ? 'Launch' : 'Mulai Lacak'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
