import React from 'react';
import { Menu, Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Topbar({ onMenuClick, title }) {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-surface-100 px-4 sm:px-6 py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface-100 text-surface-600 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          {title && <h1 className="text-base font-semibold text-surface-800 truncate">{title}</h1>}
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 bg-surface-50 border border-surface-100 rounded-xl px-3 py-1.5">
            <div className="w-6 h-6 bg-brand-100 rounded-lg flex items-center justify-center">
              <span className="text-brand-700 font-bold text-xs">{user?.name?.[0]?.toUpperCase()}</span>
            </div>
            <span className="text-sm font-medium text-surface-700">{user?.name}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
