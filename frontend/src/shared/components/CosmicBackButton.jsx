import React from 'react';
import { ArrowLeft } from 'lucide-react';

export default function CosmicBackButton({ onClick, onBack, label = "Kembali ke Beranda" }) {
  const handleClick = onClick || onBack;
  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border-2 border-black text-black font-bold text-xs sm:text-sm tracking-tight hover:bg-black hover:text-white transition-all duration-150 shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
      title={label}
    >
      <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
      <span>{label}</span>
    </button>
  );
}
