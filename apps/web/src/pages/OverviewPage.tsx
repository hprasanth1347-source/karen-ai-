import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  Phone,
  Instagram,
  Mail,
  HardDrive,
  Mic,
  Send,
  Zap,
  Activity,
  AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const OverviewPage: React.FC = () => {
  const [healthStatus, setHealthStatus] = useState<{
    ok: boolean;
    service?: string;
    time?: string;
  } | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setHealthStatus(data))
      .catch(() => {
        fetch('/api/v1/health')
          .then((res) => res.json())
          .then((data) => setHealthStatus(data))
          .catch(() => setHealthStatus({ ok: false }));
      });
  }, []);

  const stats = [
    { label: 'Active Tasks', value: '4', change: '2 due today', color: 'bg-yellow' },
    { label: 'Unread Communications', value: '7', change: 'WhatsApp & Gmail', color: 'bg-coral text-white' },
    { label: 'Stored Memories', value: '42', change: '100% verified facts', color: 'bg-teal text-white' },
    { label: 'Security Status', value: 'Locked', change: 'Owner Only • RLS Active', color: 'bg-mint text-ink' },
  ];

  const integrations = [
    { name: 'WhatsApp Business', icon: Phone, status: 'Standby', note: 'Official Meta Cloud API' },
    { name: 'Instagram Creator', icon: Instagram, status: 'Standby', note: 'Graph API DMs & Mentions' },
    { name: 'Google Gmail', icon: Mail, status: 'Standby', note: 'OAuth2 Digest & Drafts' },
    { name: 'Google Drive', icon: HardDrive, status: 'Standby', note: 'Encrypted Doc Indexing' },
    { name: 'Telegram Bot', icon: Send, status: 'Standby', note: 'Owner-only Tunnel' },
    { name: 'ElevenLabs Voice', icon: Mic, status: 'Configured', note: 'Female voice policy active' },
  ];

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="bg-cream-100 border-3 border-ink p-6 shadow-brutal relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-coral text-white text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>PERSONAL AI OPERATING SYSTEM</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Vanakkam! 👋 Naan Karen AI.
            </h1>
            <p className="text-sm font-medium text-ink-muted mt-1 max-w-2xl">
              Ungaloda personal AI assistant. All communications, reminders, documents, and memory oru central secure dashboard-la manage pannunga.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/ai-chat"
              className="btn-coral flex items-center gap-2 text-xs"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Chat with Karen</span>
            </Link>
            <Link
              to="/tasks"
              className="btn-ghost flex items-center gap-2 text-xs"
            >
              <Zap className="w-4 h-4" />
              <span>Quick Task</span>
            </Link>
          </div>
        </div>

        {/* System Health Ticker */}
        <div className="mt-4 pt-3 border-t-2 border-ink flex flex-wrap items-center justify-between text-xs font-mono gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold">STATUS:</span>
            {healthStatus?.ok ? (
              <span className="text-mint font-extrabold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> ONLINE (API 8080)
              </span>
            ) : (
              <span className="text-coral font-extrabold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> INITIALIZING
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-ink-muted">
            <span>VOICE: STRICT FEMALE ONLY</span>
            <span>•</span>
            <span>TIMEZONE: Asia/Kolkata</span>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-white border-3 border-ink p-4 shadow-brutal flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-ink-muted uppercase">
                {s.label}
              </span>
              <span
                className={`text-[10px] font-mono font-extrabold px-1.5 py-0.5 border border-ink ${s.color}`}
              >
                LIVE
              </span>
            </div>
            <div className="text-3xl font-black my-2">{s.value}</div>
            <span className="text-xs font-semibold text-ink-muted">{s.change}</span>
          </div>
        ))}
      </div>

      {/* Main Grid: Integrations + Live Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Integrations Grid */}
        <div className="lg:col-span-2 bg-white border-3 border-ink p-5 shadow-brutal">
          <div className="flex items-center justify-between pb-3 border-b-2 border-ink mb-4">
            <h2 className="text-base font-black flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-coral" />
              INTEGRATION GATEWAYS
            </h2>
            <Link
              to="/api-management"
              className="text-xs font-bold text-coral hover:underline flex items-center gap-1"
            >
              Configure API Keys <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {integrations.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.name}
                  className="p-3 border-2 border-ink bg-cream-50 hover:bg-cream-100 transition-colors shadow-brutal-sm flex items-start gap-3"
                >
                  <div className="p-2 bg-white border-2 border-ink shrink-0">
                    <Icon className="w-4 h-4 text-ink" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold truncate">{item.name}</h4>
                      <span className="text-[10px] font-mono px-1 border border-ink bg-yellow/40">
                        {item.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-muted mt-0.5 truncate">{item.note}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Recent Actions */}
        <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b-2 border-ink mb-4">
              <h2 className="text-base font-black flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal" />
                RECENT ACTIVITY
              </h2>
              <span className="text-[10px] font-mono text-ink-muted">LOGGED</span>
            </div>

            <div className="space-y-3">
              {[
                { title: 'Core schema updated', time: '5m ago', tag: 'DB' },
                { title: 'Female voice ID confirmed', time: '15m ago', tag: 'VOICE' },
                { title: 'Telegram webhook listening', time: '1h ago', tag: 'BOT' },
                { title: 'Owner authorization verified', time: 'Today', tag: 'AUTH' },
              ].map((act, i) => (
                <div key={i} className="flex items-center justify-between text-xs border-b border-ink/20 pb-2">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[9px] font-mono px-1 py-0.5 border border-ink bg-cream-200 font-bold">
                      {act.tag}
                    </span>
                    <span className="font-semibold truncate">{act.title}</span>
                  </div>
                  <span className="text-[10px] font-mono text-ink-muted shrink-0">{act.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t-2 border-ink">
            <Link
              to="/activity"
              className="w-full btn-ghost text-xs text-center flex items-center justify-center gap-2"
            >
              <span>View Full Audit Log</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
export default OverviewPage;
