import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, X, Check } from 'lucide-react';

export default function ConfirmModal({
  isOpen,
  title = 'Konfirmasi Tindakan',
  message = 'Apakah Anda yakin ingin melanjutkan tindakan ini?',
  confirmText = 'Ya, Lanjutkan',
  cancelText = 'Batal',
  type = 'danger', // 'danger' | 'warning' | 'info'
  onConfirm,
  onCancel
}) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter') {
        onConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white rounded-xl border-2 border-black shadow-[6px_6px_0px_#000000] overflow-hidden transform transition-all animate-in zoom-in-95 duration-150">
        
        {/* Header Bar */}
        <div className="px-5 py-4 border-b-2 border-black flex items-center justify-between bg-neutral-50">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg border-2 border-black flex items-center justify-center ${
              type === 'danger' ? 'bg-red-500 text-white' : 'bg-amber-400 text-black'
            } shadow-[1.5px_1.5px_0px_#000000]`}>
              {type === 'danger' ? (
                <Trash2 className="w-4 h-4 stroke-[2.5]" />
              ) : (
                <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
              )}
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 font-bold block">
                KURO STUDIO
              </span>
              <h3 className="text-sm sm:text-base font-black text-black tracking-tight font-display">
                {title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 flex items-center justify-center text-black shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
            aria-label="Tutup dialog"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 bg-white">
          <p className="text-xs sm:text-sm font-semibold text-neutral-700 leading-relaxed">
            {message}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="px-5 py-4 border-t-2 border-black bg-neutral-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 text-black font-extrabold text-xs shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer min-h-[44px]"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2.5 rounded-lg border-2 border-black font-extrabold text-xs text-white shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer min-h-[44px] flex items-center gap-1.5 ${
              type === 'danger' ? 'bg-black hover:bg-neutral-800' : 'bg-black hover:bg-neutral-800'
            }`}
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
            <span>{confirmText}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
