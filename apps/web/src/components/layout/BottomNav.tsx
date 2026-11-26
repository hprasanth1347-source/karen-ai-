import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, Mail, CheckSquare, Menu } from 'lucide-react';

interface BottomNavProps {
  onOpenMore: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ onOpenMore }) => {
  const items = [
    { path: '/', label: 'Home', icon: LayoutDashboard },
    { path: '/ai-chat', label: 'Karen', icon: MessageSquare },
    { path: '/gmail', label: 'Inbox', icon: Mail },
    { path: '/tasks', label: 'Tasks', icon: CheckSquare },
  ];

  return (
    <nav
      aria-label="Mobile Primary Navigation"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-cream border-t-3 border-ink pb-[env(safe-area-inset-bottom)] flex items-stretch"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 text-[11px] font-bold min-h-[52px] ${
                isActive ? 'bg-coral text-[#0A0A0A]' : 'text-ink hover:bg-cream-200'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
      <button
        type="button"
        onClick={onOpenMore}
        className="flex-1 flex flex-col items-center justify-center py-2 text-[11px] font-bold min-h-[52px] text-ink hover:bg-cream-200"
        aria-label="Open More Pages"
      >
        <Menu className="w-5 h-5" />
        <span>More</span>
      </button>
    </nav>
  );
};
