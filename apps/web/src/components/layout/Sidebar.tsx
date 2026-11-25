import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Phone,
  Instagram,
  Mail,
  HardDrive,
  Brain,
  FileText,
  Mic,
  Send,
  Bell,
  Users,
  Cpu,
  CheckSquare,
  Clock,
  Shield,
  Key,
  Database,
  Activity,
  History,
  Settings,
  Heart,
  X
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const navSections = [
    {
      title: 'Core AI',
      items: [
        { path: '/', label: 'Overview', icon: LayoutDashboard },
        { path: '/ai-chat', label: 'Karen AI Chat', icon: MessageSquare },
        { path: '/love-mode', label: 'Love & Comfort ❤️', icon: Heart },
      ],
    },
    {
      title: 'Communications',
      items: [
        { path: '/whatsapp', label: 'WhatsApp', icon: Phone },
        { path: '/instagram', label: 'Instagram', icon: Instagram },
        { path: '/gmail', label: 'Gmail', icon: Mail },
        { path: '/drive', label: 'Google Drive', icon: HardDrive },
      ],
    },
    {
      title: 'Intelligence & Voice',
      items: [
        { path: '/memory', label: 'Personal Memory', icon: Brain },
        { path: '/documents', label: 'Doc Intelligence', icon: FileText },
        { path: '/voice', label: 'Voice Centre', icon: Mic },
        { path: '/telegram', label: 'Telegram Tunnel', icon: Send },
      ],
    },
    {
      title: 'Operations',
      items: [
        { path: '/notifications', label: 'Notifications', icon: Bell },
        { path: '/contacts', label: 'Contact Manager', icon: Users },
        { path: '/automation', label: 'Automation Centre', icon: Cpu },
        { path: '/tasks', label: 'Tasks & Reminders', icon: CheckSquare },
        { path: '/reminders', label: 'Scheduled Alarms', icon: Clock },
      ],
    },
    {
      title: 'System & Security',
      items: [
        { path: '/security', label: 'Security Centre', icon: Shield },
        { path: '/api-management', label: 'API Management', icon: Key },
        { path: '/database', label: 'Database Health', icon: Database },
        { path: '/monitor', label: 'System Monitor', icon: Activity },
        { path: '/activity', label: 'Activity History', icon: History },
        { path: '/settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-ink/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-cream border-r-3 border-ink z-50 transition-transform duration-200 ease-in-out flex flex-col justify-between
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="p-4 border-b-3 border-ink flex items-center justify-between bg-cream-100">
          <div className="flex items-center gap-2">
            <span className="bg-coral text-white font-extrabold px-2.5 py-1 border-2 border-ink shadow-brutal-sm text-sm">
              KAREN
            </span>
            <span className="font-mono text-xs font-bold tracking-widest text-ink">
              AI
            </span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1 border-2 border-ink bg-cream hover:bg-cream-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {navSections.map((sec) => (
            <div key={sec.title}>
              <div className="px-2 py-1 text-[10px] font-mono font-black text-ink-muted uppercase tracking-wider">
                {sec.title}
              </div>
              <div className="space-y-0.5 mt-1">
                {sec.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => {
                        if (window.innerWidth < 1024) onClose();
                      }}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3 py-1.5 text-xs font-bold border-2 transition-all duration-100 ${
                          isActive
                            ? 'bg-coral text-white border-ink shadow-brutal-sm translate-x-1'
                            : 'bg-transparent text-ink border-transparent hover:border-ink hover:bg-white hover:shadow-brutal-sm'
                        }`
                      }
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t-3 border-ink bg-cream-200">
          <div className="flex items-center justify-between text-xs font-mono font-bold">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-mint border border-ink inline-block animate-pulse"></span>
              CORE READY
            </span>
            <span className="text-[10px] text-ink-muted">Asia/Kolkata</span>
          </div>
        </div>
      </aside>
    </>
  );
};
