import React, { useState, useEffect } from 'react';
import CosmicBackButton from '../../shared/components/CosmicBackButton';
import { 
  History as HistoryIcon, 
  Trash2, 
  ArrowUpRight, 
  Clock, 
  Download, 
  Flame, 
  QrCode, 
  FileText, 
  Link2, 
  Minimize2, 
  Music, 
  Sparkles, 
  Film, 
  Scissors,
  CheckCircle2
} from 'lucide-react';
import { getHistoryItems, clearHistory } from '../../shared/utils/storageService';
import { translations } from '../../shared/utils/translations';
import ConfirmModal from '../../shared/components/ConfirmModal';

export default function HistoryScreen({ onBack, onOpenTool, lang = 'id', onShowToast }) {
  const [historyList, setHistoryList] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all' | 'today' | 'older'
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const t = translations[lang] || translations.id;

  useEffect(() => {
    setHistoryList(getHistoryItems());
  }, []);

  const handleClear = () => {
    setShowClearConfirm(true);
  };

  const executeClear = () => {
    clearHistory();
    setHistoryList([]);
    setShowClearConfirm(false);
    if (onShowToast) {
      onShowToast(t.history.cleared);
    }
  };

  const getToolIcon = (toolId) => {
    switch (toolId) {
      case 'downloader':
        return Download;
      case 'jjFinder':
        return Flame;
      case 'qrStudio':
        return QrCode;
      case 'linkToDoc':
      case 'pngToPdf':
        return FileText;
      case 'imageToLink':
        return Link2;
      case 'compressor':
        return Minimize2;
      case 'audioMerger':
        return Music;
      case 'photoStudio':
        return Sparkles;
      case 'videoStudio':
        return Film;
      case 'videoTrimmer':
      case 'bgRemover':
        return Scissors;
      default:
        return HistoryIcon;
    }
  };

  const formatRelativeTime = (timestamp) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 2) return t.history.justNow;
    if (minutes < 60) return `${minutes} ${t.history.minutesAgo}`;
    if (hours < 24) return `${hours} ${t.history.hoursAgo}`;
    return `${days} ${t.history.daysAgo}`;
  };

  const isToday = (dateString) => {
    const d = new Date(dateString);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  };

  const filteredHistory = historyList.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'today') return isToday(item.timestamp);
    if (filter === 'older') return !isToday(item.timestamp);
    return true;
  });

  return (
    <main className="flex-grow flex flex-col items-center justify-start px-4 sm:px-6 py-6 sm:py-8 max-w-4xl mx-auto w-full">
      <div className="w-full flex flex-col gap-5">
        
        {/* Navigasi Atas */}
        <div className="w-full flex items-center justify-between">
          <CosmicBackButton onClick={onBack} label={t.nav.backToHome} />

          {historyList.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 rounded-lg border-2 border-black bg-white hover:bg-red-50 text-neutral-800 hover:text-red-600 text-xs font-bold flex items-center gap-1.5 shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t.history.clearAll}</span>
            </button>
          )}
        </div>

        {/* Banner Judul */}
        <div className="w-full rounded-xl border-2 border-black p-5 sm:p-6 bg-white shadow-[4px_4px_0px_#000000] flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg border-2 border-black bg-black text-white flex items-center justify-center shrink-0">
              <HistoryIcon className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-black tracking-tight font-display">
                {t.history.title}
              </h1>
              <p className="text-xs text-neutral-600 mt-0.5">
                {t.history.subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2">
          {[
            { id: 'all', label: t.history.filterAll },
            { id: 'today', label: t.history.filterToday },
            { id: 'older', label: t.history.filterOlder }
          ].map(f => {
            const isActive = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg border-2 border-black text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-black text-white shadow-[2px_2px_0px_#000000] -translate-x-0.5 -translate-y-0.5'
                    : 'bg-white text-black hover:bg-neutral-100 shadow-[1px_1px_0px_#000000]'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* History List Cards */}
        {filteredHistory.length === 0 ? (
          <div className="w-full rounded-xl border-2 border-black p-8 sm:p-12 bg-white shadow-[4px_4px_0px_#000000] text-center flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-full border-2 border-black bg-neutral-100 flex items-center justify-center text-black mb-1">
              <Clock className="w-7 h-7 stroke-[1.8]" />
            </div>
            <h2 className="text-base font-extrabold text-black font-display">
              {t.history.emptyTitle}
            </h2>
            <p className="text-xs text-neutral-600 max-w-md">
              {t.history.emptyDesc}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredHistory.map(item => {
              const ToolIcon = getToolIcon(item.toolId);
              return (
                <div
                  key={item.id}
                  className="rounded-xl border-2 border-black p-4 bg-white shadow-[2.5px_2.5px_0px_#000000] hover:shadow-[4px_4px_0px_#000000] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg border-2 border-black bg-neutral-100 flex items-center justify-center text-black shrink-0 mt-0.5 sm:mt-0">
                      <ToolIcon className="w-4.5 h-4.5 stroke-[2.2]" />
                    </div>

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-black tracking-tight truncate">
                          {item.toolName}
                        </span>
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border border-black bg-neutral-100 text-black shrink-0">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>

                      <p className="text-xs text-neutral-600 line-clamp-1 mt-0.5">
                        {item.action}
                      </p>

                      {item.target && (
                        <span className="text-[11px] font-mono text-neutral-500 truncate max-w-sm mt-0.5">
                          {item.target}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenTool(item.toolId)}
                      className="px-3 py-1.5 rounded-lg border-2 border-black bg-black text-white hover:bg-neutral-800 text-xs font-bold flex items-center gap-1.5 shadow-[1.5px_1.5px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer min-h-[44px]"
                    >
                      <span>{t.history.reopenTool}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      <ConfirmModal
        isOpen={showClearConfirm}
        title={t.history.clear}
        message={t.history.clearConfirm}
        confirmText={lang === 'en' ? 'Yes, Clear All' : 'Ya, Bersihkan'}
        cancelText={lang === 'en' ? 'Cancel' : 'Batal'}
        type="danger"
        onConfirm={executeClear}
        onCancel={() => setShowClearConfirm(false)}
      />
    </main>
  );
}
