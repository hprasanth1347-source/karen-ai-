import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, Bell, Sun, Moon, Sparkles } from 'lucide-react';
import { useAuthContext } from '../../contexts/AuthContext';

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
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#111318' : '#FAF7F0');
  }, [isDark]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('karen_theme', next ? 'dark' : 'light');
    } catch {
      // ignore
    }
  };

  const displayName = user?.email?.split('@')[0] || 'Hari';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <header className="min-h-14 pt-[env(safe-area-inset-top)] bg-cream border-b-3 border-ink sticky top-0 z-30 flex items-center justify-between px-3 md:px-4 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="lg:hidden p-2 border-2 border-ink bg-surface hover:bg-cream-200 shadow-brutal-sm cursor-pointer"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 px-3 py-2 bg-surface border-2 border-ink shadow-brutal-sm text-xs font-mono text-ink-muted hover:border-coral transition-colors w-36 sm:w-52 md:w-64 cursor-pointer"
          aria-label="Open Command Palette"
        >
          <Search className="w-3.5 h-3.5 text-ink shrink-0" />
          <span className="truncate">Search / Cmd...</span>
          <span className="ml-auto bg-cream-200 border border-ink px-1 text-[10px] font-bold text-ink hidden sm:inline">
            ⌘K
          </span>
        </button>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => navigate('/ai-chat')}
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-yellow text-[#0A0A0A] border-2 border-ink text-xs font-black shadow-brutal-sm"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Ask Karen</span>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 border-2 border-ink bg-surface hover:bg-cream-200 shadow-brutal-sm cursor-pointer"
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Light mode' : 'Dark mode'}
        >
          {isDark ? <Sun className="w-4 h-4 text-ink" /> : <Moon className="w-4 h-4 text-ink" />}
        </button>

        <button
          type="button"
          onClick={onToggleNotifications}
          className="relative p-2 border-2 border-ink bg-surface hover:bg-cream-100 shadow-brutal-sm cursor-pointer"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4 text-ink" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-coral text-[#0A0A0A] text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-ink">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 pl-2 border-l-2 border-ink">
          <div className="w-8 h-8 bg-teal text-[#0A0A0A] font-black text-xs border-2 border-ink flex items-center justify-center shadow-brutal-sm">
            {initial}
          </div>
          <span className="text-xs font-bold hidden md:inline max-w-[110px] truncate">{displayName}</span>
        </div>
      </div>
    </header>
  );
};
