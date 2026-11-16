import React from 'react';
import { translations } from '../utils/translations';

export default function Footer({ lang = 'id' }) {
  const t = translations[lang] || translations.id;

  return (
    <footer className="bg-white border-t-2 border-black w-full mt-auto pt-6 pb-28 sm:pb-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div className="flex items-center gap-2">
          <span className="font-black text-base tracking-tight font-display text-black">
            KURO STUDIO
          </span>
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-black bg-neutral-100 text-black">
            {t.footer?.suite || 'UTILITY SUITE'}
          </span>
        </div>
        <p className="text-xs text-neutral-600 font-sans">
          © {new Date().getFullYear()} Kuro Studio. {t.footer?.text || 'Platform utilitas all-in-one untuk media, dokumen, audio, dan alat kreatif digital.'}
        </p>
      </div>
    </footer>
  );
}
