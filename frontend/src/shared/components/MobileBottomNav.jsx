import React from 'react';
import { Home, Images, History, Settings } from 'lucide-react';
import { translations } from '../utils/translations';

/**
 * MobileBottomNav Component
 * Navigasi bilah bawah khusus perangkat layar mobile/HP (md:hidden).
 * Memberikan pengalaman navigasi seperti aplikasi native yang responsif dan mudah dijangkau jempol.
 */
export default function MobileBottomNav({ 
  currentScreen, 
  onNavigate, 
  settings 
}) {
  const lang = settings?.language || 'id';
  const t = translations[lang] || translations.id;

  const showGallery = settings?.showGallery !== false;
  const showHistory = settings?.showHistory !== false;

  const navItems = [
    { id: 'welcome', label: t.nav.home, icon: Home },
    ...(showGallery ? [{ id: 'gallery', label: t.nav.gallery, icon: Images }] : []),
    ...(showHistory ? [{ id: 'history', label: t.nav.history, icon: History }] : []),
    { id: 'settings', label: t.nav.settings, icon: Settings }
  ];

  return (
    <nav 
      aria-label="Mobile Navigation Bar"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t-2 border-black shadow-[0px_-2px_0px_#000000] px-2 py-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center justify-around gap-1 max-w-md mx-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id || (item.id === 'welcome' && currentScreen !== 'gallery' && currentScreen !== 'history' && currentScreen !== 'settings');
          
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-all min-h-[48px] min-w-[44px] cursor-pointer active:scale-95 ${
                isActive
                  ? 'bg-black text-white shadow-[2px_2px_0px_#000000]'
                  : 'text-neutral-700 hover:text-black hover:bg-neutral-100'
              }`}
            >
              <Icon className="w-4.5 h-4.5 stroke-[2.2] mb-0.5" />
              <span className="text-[10px] font-bold font-sans tracking-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
