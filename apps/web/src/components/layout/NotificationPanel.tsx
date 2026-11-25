import React from 'react';
import { X, CheckCheck, Bell, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  notifications?: Array<{
    id: string;
    title: string;
    body: string;
    type: string;
    created_at: string;
    is_read: boolean;
  }>;
  onMarkAllRead?: () => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  isOpen,
  onClose,
  notifications = [],
  onMarkAllRead,
}) => {
  if (!isOpen) return null;

  const mockNotifs = [
    {
      id: '1',
      title: 'Security Engine Active',
      body: 'Row Level Security verified for 22 database tables.',
      type: 'success',
      created_at: 'Just now',
      is_read: false,
    },
    {
      id: '2',
      title: 'Voice Policy Enforced',
      body: 'Female voice profile configured. Fallback locked.',
      type: 'info',
      created_at: '10m ago',
      is_read: false,
    },
    {
      id: '3',
      title: 'Telegram Tunnel Standby',
      body: 'Webhook router ready. Set bot credentials in .env to activate.',
      type: 'warning',
      created_at: '1h ago',
      is_read: true,
    },
  ];

  const items = notifications.length > 0 ? notifications : mockNotifs;

  return (
    <>
      <div
        className="fixed inset-0 bg-ink/40 z-40"
        onClick={onClose}
      />
      <div className="fixed top-0 right-0 h-full w-80 md:w-96 bg-cream border-l-3 border-ink z-50 shadow-brutal-xl flex flex-col justify-between animate-in slide-in-from-right duration-200">
        <div className="p-4 border-b-3 border-ink flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-coral" />
            <h3 className="font-extrabold text-sm uppercase">Notifications</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onMarkAllRead}
              className="p-1 border border-ink hover:bg-cream-200 text-[10px] font-mono font-bold flex items-center gap-1"
              title="Mark all as read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1 border border-ink hover:bg-cream-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {items.map((n) => {
            const getIcon = () => {
              if (n.type === 'success') return <CheckCircle2 className="w-4 h-4 text-mint shrink-0" />;
              if (n.type === 'warning') return <AlertTriangle className="w-4 h-4 text-yellow shrink-0" />;
              return <Info className="w-4 h-4 text-teal shrink-0" />;
            };

            return (
              <div
                key={n.id}
                className={`p-3 border-2 border-ink shadow-brutal-sm transition-all ${
                  n.is_read ? 'bg-cream-100 opacity-80' : 'bg-white'
                }`}
              >
                <div className="flex items-start gap-2">
                  {getIcon()}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs truncate">{n.title}</span>
                      <span className="text-[10px] font-mono text-ink-muted whitespace-nowrap">
                        {n.created_at}
                      </span>
                    </div>
                    <p className="text-xs text-ink/80 mt-1 leading-snug">{n.body}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t-2 border-ink bg-cream-200 text-center">
          <span className="text-[11px] font-mono font-bold text-ink-muted">
            KAREN OPERATING SYSTEM NOTIFICATIONS
          </span>
        </div>
      </div>
    </>
  );
};
