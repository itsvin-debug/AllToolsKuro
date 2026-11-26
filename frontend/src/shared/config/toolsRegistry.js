import {
  Download,
  Flame,
  FileText,
  Link2,
  Minimize2,
  QrCode,
  Music,
  Sparkles,
  Film,
  Scissors,
  Images,
  Tv,
  BookOpen,
  Globe,
  Globe2,
  ShieldCheck,
  Clapperboard
} from 'lucide-react';

/**
 * Shared Tool Registry - Sumber kebenaran tunggal metadata seluruh utilitas Kuro Studio
 */
export const TOOLS_METADATA = [
  {
    id: 'downloader',
    category: 'downloader',
    defaultName: 'Media Downloader',
    defaultDesc: '',
    defaultTag: '',
    icon: Download
  },
  {
    id: 'jjFinder',
    category: 'downloader',
    defaultName: 'Cari Link JJ',
    defaultDesc: '',
    defaultTag: '',
    icon: Flame
  },
  {
    id: 'pngToPdf',
    category: 'file',
    defaultName: 'PNG to PDF',
    defaultDesc: '',
    defaultTag: '',
    icon: Images
  },
  {
    id: 'linkToDoc',
    category: 'file',
    defaultName: 'Link to PDF/PPT',
    defaultDesc: '',
    defaultTag: '',
    icon: FileText
  },
  {
    id: 'imageToLink',
    category: 'file',
    defaultName: 'File ke Link',
    defaultDesc: '',
    defaultTag: '',
    icon: Link2
  },
  {
    id: 'compressor',
    category: 'file',
    defaultName: 'Kompres Media & PDF',
    defaultDesc: '',
    defaultTag: '',
    icon: Minimize2
  },
  {
    id: 'qrStudio',
    category: 'creative',
    defaultName: 'QR Code Studio',
    defaultDesc: '',
    defaultTag: '',
    icon: QrCode
  },
  {
    id: 'audioMerger',
    category: 'creative',
    defaultName: 'Audio Merger',
    defaultDesc: '',
    defaultTag: '',
    icon: Music
  },
  {
    id: 'photoStudio',
    category: 'creative',
    defaultName: 'Photo Studio',
    defaultDesc: '',
    defaultTag: '',
    icon: Sparkles
  },
  {
    id: 'videoStudio',
    category: 'creative',
    defaultName: 'Video Studio',
    defaultDesc: '',
    defaultTag: '',
    icon: Film
  },
  {
    id: 'videoTrimmer',
    category: 'creative',
    defaultName: 'Video Trimmer',
    defaultDesc: '',
    defaultTag: '',
    icon: Scissors
  },
  {
    id: 'bgRemover',
    category: 'utility',
    defaultName: 'Hapus Background',
    defaultDesc: '',
    defaultTag: '',
    icon: Scissors
  },
  {
    id: 'resolver',
    category: 'utility',
    defaultName: 'Safelink Resolver',
    defaultDesc: 'Bypass safelink bertingkat dan shortlink secara instan.',
    defaultTag: 'BYPASS',
    icon: Link2
  },
  {
    id: 'animeFinder',
    category: 'utility',
    defaultName: 'Rekomendasi Anime',
    defaultDesc: 'Jelajahi rekomendasi anime berdasarkan multi-genre dan rating MyAnimeList.',
    defaultTag: 'ANIME HD',
    icon: Tv
  },
  {
    id: 'manhwaFinder',
    category: 'utility',
    defaultName: 'Rekomendasi Manhwa',
    defaultDesc: 'Koleksi manhwa Korea terpopuler dengan filter genre, cover, dan sinopsis.',
    defaultTag: 'MANHWA',
    icon: BookOpen
  },
  {
    id: 'ipChecker',
    category: 'utility',
    defaultName: 'IP & DNS Checker',
    defaultDesc: 'Analisis telemetri IP publik, operator ISP, routing ASN, dan keamanan VPN.',
    defaultTag: 'NETWORK',
    icon: Globe,
    navIcon: ShieldCheck
  },
  {
    id: 'tiktokStalker',
    category: 'utility',
    defaultName: 'Social Media Stalker',
    defaultDesc: 'Pantau intelijen akun TikTok, Instagram, X (Twitter), dan GitHub secara 100% anonim.',
    defaultTag: '4 PLATFORM',
    icon: Globe2
  },
  {
    id: 'waViewOnce',
    category: 'utility',
    defaultName: 'WA Stealth & Status Vault',
    defaultDesc: 'Platform 3-in-1: Baca chat pribadi tanpa centang biru (Ghost Reader), cegah pesan ditarik/diedit (Anti-Delete), dan amankan Status WA kontak tanpa terlihat (0 View).',
    defaultTag: 'WA STEALTH',
    icon: ShieldCheck
  },
  {
    id: 'codeToVideo',
    category: 'creative',
    defaultName: 'Code to Video Studio',
    defaultDesc: 'Ubah kode visual HTML/CSS/JS menjadi video animasi 3D sinematik dengan partikel, awan, dan ekspor MP4/WebM.',
    defaultTag: 'NEW • 3D RENDER',
    staticTag: true,
    icon: Clapperboard
  }
];

export const TOOL_NAMES_BY_ID = Object.fromEntries(
  TOOLS_METADATA.map((item) => [item.id, item.defaultName])
);

export function getLocalizedTools(t) {
  const wtTools = t?.welcome?.tools || {};
  return TOOLS_METADATA.map((item) => {
    const loc = wtTools[item.id] || {};
    return {
      id: item.id,
      category: item.category,
      name: loc.name || item.defaultName,
      desc: loc.desc || item.defaultDesc,
      tag: item.staticTag ? item.defaultTag : (loc.tag || item.defaultTag),
      icon: item.icon,
      navIcon: item.navIcon || item.icon
    };
  });
}
