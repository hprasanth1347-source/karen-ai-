import React from 'react';
import { Menu, Search, Bell, ShieldCheck, User } from 'lucide-react';

interface TopbarProps {
  onToggleSidebar: () => void;
  onToggleNotifications: () => void;
  onOpenCommandPalette: () => void;
  unreadCount?: number;
}

export const Topbar: React.FC<TopbarProps> = ({
  onToggleSidebar,
  onToggleNotifications,
  onOpenCommandPalette,
  unreadCount = 0,
}) => {
  return (
    <header className="h-14 bg-cream border-b-3 border-ink sticky top-0 z-30 flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-1.5 border-2 border-ink bg-cream hover:bg-cream-200 shadow-brutal-sm cursor-pointer"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <button
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-ink shadow-brutal-sm text-xs font-mono text-ink-muted hover:border-coral transition-colors w-44 md:w-64 cursor-pointer"
        >
          <Search className="w-3.5 h-3.5 text-ink" />
          <span className="truncate">Command / Search...</span>
          <span className="ml-auto bg-cream-200 border border-ink px-1 text-[10px] font-bold text-ink hidden sm:inline">
            ⌘K
          </span>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-1.5 px-2 py-1 bg-yellow/30 border-2 border-ink text-[11px] font-mono font-bold">
          <ShieldCheck className="w-3.5 h-3.5 text-ink" />
          <span>OWNER VERIFIED</span>
        </div>

        <button
          onClick={onToggleNotifications}
          className="relative p-1.5 border-2 border-ink bg-white hover:bg-cream-100 shadow-brutal-sm cursor-pointer"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4 text-ink" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-coral text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-ink">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 pl-2 border-l-2 border-ink">
          <div className="w-7 h-7 bg-teal text-white font-black text-xs border-2 border-ink flex items-center justify-center shadow-brutal-sm">
            K
          </div>
          <span className="text-xs font-bold hidden sm:inline">Owner</span>
        </div>
      </div>
    </header>
  );
};
