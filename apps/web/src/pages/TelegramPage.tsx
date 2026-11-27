import React, { useCallback, useEffect, useState } from 'react';
import {
  Send,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Key,
  Terminal,
  RefreshCw,
  Webhook,
  Radio,
  Square,
  ListChecks,
  MessageSquare,
  AlertCircle,
  Bell,
  Clock,
  Sun,
} from 'lucide-react';
import { api } from '../lib/api';

interface TelegramMessagePreview {
  text: string;
  timestamp: string;
}

interface TelegramErrorEntry {
  message: string;
  timestamp: string;
}

interface TelegramStatus {
  configured: boolean;
  botUsername: string | null;
  botName: string | null;
  ownerChatId: string | null;
  pollingActive: boolean;
  webhookSet: boolean;
  webhookUrl?: string | null;
  pendingUpdateCount?: number;
  webhookLastError?: string | null;
  lastIncoming: TelegramMessagePreview | null;
  lastOutgoing: TelegramMessagePreview | null;
  totalReceived: number;
  totalSent: number;
  errors: TelegramErrorEntry[];
  startedAt: string | null;
}

type NotificationPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type NotificationSource =
  | 'whatsapp'
  | 'instagram'
  | 'gmail'
  | 'calendar'
  | 'drive'
  | 'tasks'
  | 'system'
  | 'files'
  | 'automation';

interface NotificationRecord {
  id: string;
  source: NotificationSource;
  priority: NotificationPriority;
  title: string;
  sender: string;
  summary: string;
  timestamp: string;
  status: string;
  isRead: boolean;
}

interface NotificationStats {
  total: number;
  critical: number;
  unread: number;
  delivered: number;
  failures: number;
}

interface NotificationPreferences {
  enabled: boolean;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
    allowEmergency: boolean;
  };
  sources: Record<NotificationSource, boolean>;
}

type GreetingSlot = 'morning' | 'afternoon' | 'evening' | 'night';

interface CompanionConfig {
  enabled: boolean;
  language: 'english' | 'tanglish' | 'mixed';
  respectQuietHours: boolean;
  slots: Record<GreetingSlot, { enabled: boolean; time: string }>;
}

const BOT_COMMANDS = [
  { cmd: '/start', desc: 'Start Karen AI in Telegram' },
  { cmd: '/help', desc: 'Show available commands' },
  { cmd: '/status', desc: 'Check Karen & integration health' },
  { cmd: '/chat', desc: 'Start an AI conversation' },
  { cmd: '/clear', desc: 'Clear current chat context' },
  { cmd: '/memory', desc: 'Save or view persistent memories' },
  { cmd: '/tasks', desc: 'List active tasks' },
  { cmd: '/task <name>', desc: 'Create a task in IST timezone' },
  { cmd: '/digest', desc: 'Unread emails & urgent deadlines' },
  { cmd: '/approve <id>', desc: 'Approve a pending draft' },
  { cmd: '/reject <id>', desc: 'Cancel a pending automated send' },
  { cmd: '/whatsapp', desc: 'WhatsApp integration status' },
  { cmd: '/instagram', desc: 'Instagram activity & status' },
  { cmd: '/connectgoogle', desc: 'Connect all Google services (OAuth link)' },
  { cmd: '/drive', desc: 'List or download Google Drive files' },
  { cmd: '/gmail', desc: 'List, search, or send Gmail' },
  { cmd: '/calendar', desc: 'View or add Google Calendar events' },
  { cmd: '/sheets', desc: 'List, read, create, or append Google Sheets' },
  { cmd: '/contacts', desc: 'Search or add Google Contacts' },
  { cmd: '/classroom', desc: 'Google Classroom overview' },
  { cmd: '/assignments', desc: 'Classroom assignments & deadlines' },
  { cmd: '/grades', desc: 'Classroom grades & submissions' },
  { cmd: '/alerts', desc: 'Live Calendar, Tasks & Classroom alerts' },
  { cmd: '/settings', desc: 'Assistant settings & mode' },
];

export const TelegramPage: React.FC = () => {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [notifStats, setNotifStats] = useState<NotificationStats | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences | null>(null);
  const [notifHistory, setNotifHistory] = useState<NotificationRecord[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [companionCfg, setCompanionCfg] = useState<CompanionConfig | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testText, setTestText] = useState<string>('');

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, notifRes, compRes] = await Promise.all([
        api.get<{ ok: boolean; data: TelegramStatus }>('/telegram/status'),
        api.get<{
          ok: boolean;
          data: { stats: NotificationStats; preferences: NotificationPreferences; history: NotificationRecord[] };
        }>(`/telegram/notifications${priorityFilter !== 'ALL' ? `?priority=${priorityFilter}` : ''}`),
        api.get<{ ok: boolean; data: { config: CompanionConfig } }>('/telegram/companion/config'),
      ]);
      if (statusRes.data?.data) setStatus(statusRes.data.data);
      if (notifRes.data?.data) {
        setNotifStats(notifRes.data.data.stats);
        setNotifPrefs(notifRes.data.data.preferences);
        setNotifHistory(notifRes.data.data.history);
      }
      if (compRes.data?.data?.config) setCompanionCfg(compRes.data.data.config);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load Telegram status';
      setFeedback((prev) => prev ?? { type: 'error', text: msg });
    } finally {
      setLoading(false);
    }
  }, [priorityFilter]);

  useEffect(() => {
    void fetchAll();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void fetchAll();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const runAction = async (
    key: string,
    method: 'post' | 'put',
    endpoint: string,
    body?: Record<string, unknown>,
    successMsg?: string
  ) => {
    setActionLoading(key);
    setFeedback(null);
    try {
      await api[method](endpoint, body ?? {});
      setFeedback({ type: 'success', text: successMsg || 'Action completed successfully.' });
      await fetchAll();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
      const msg = axiosErr.response?.data?.error || axiosErr.message || 'Action failed.';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setActionLoading(null);
    }
  };

  const handleTestSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = testText.trim();
    if (!trimmed) return;
    await runAction('send', 'post', '/telegram/send', { text: trimmed }, 'Test message sent to Telegram.');
    setTestText('');
  };

  const toggleSource = async (source: NotificationSource) => {
    if (!notifPrefs) return;
    const nextSources = { ...notifPrefs.sources, [source]: !notifPrefs.sources[source] };
    await runAction(
      `src-${source}`,
      'put',
      '/telegram/notifications/preferences',
      { sources: nextSources },
      `Updated ${source} notification setting.`
    );
  };

  const toggleQuietHours = async () => {
    if (!notifPrefs) return;
    await runAction(
      'quiet-hours',
      'put',
      '/telegram/notifications/preferences',
      { quietHours: { ...notifPrefs.quietHours, enabled: !notifPrefs.quietHours.enabled } },
      'Quiet hours setting updated.'
    );
  };

  const toggleGreetingSlot = async (slot: GreetingSlot) => {
    if (!companionCfg) return;
    const nextSlots = {
      ...companionCfg.slots,
      [slot]: { ...companionCfg.slots[slot], enabled: !companionCfg.slots[slot].enabled },
    };
    await runAction(
      `slot-${slot}`,
      'put',
      '/telegram/companion/config',
      { slots: nextSlots },
      `${slot} greeting updated.`
    );
  };

  const updateSlotTime = async (slot: GreetingSlot, time: string) => {
    if (!companionCfg) return;
    const nextSlots = {
      ...companionCfg.slots,
      [slot]: { ...companionCfg.slots[slot], time },
    };
    await runAction(
      `time-${slot}`,
      'put',
      '/telegram/companion/config',
      { slots: nextSlots },
      `${slot} greeting time set to ${time} IST.`
    );
  };

  const formatTime = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-teal text-white text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Send className="w-3.5 h-3.5" />
            <span>TELEGRAM BOT API • PROACTIVE ASSISTANT &amp; TUNNEL</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Telegram Remote Assistant &amp; Notification Centre</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Control Karen remotely, receive proactive prioritized alerts across all integrations, and configure your 4 daily IST greetings.
          </p>
        </div>
        <button
          onClick={() => void fetchAll()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 bg-cream-100 hover:bg-cream-200 border-2 border-ink font-mono text-xs font-bold shadow-brutal-sm active:translate-y-0.5 transition-all self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>REFRESH</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`border-3 border-ink p-3 shadow-brutal-sm flex items-center justify-between text-xs font-bold ${
            feedback.type === 'success' ? 'bg-teal/15 text-ink' : 'bg-coral/15 text-ink'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-teal shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-coral shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="font-mono text-[11px] underline ml-4">
            DISMISS
          </button>
        </div>
      )}

      {/* Missing Env Vars Reminder */}
      {status && !status.configured && (
        <div className="bg-amber-50 border-3 border-ink p-4 shadow-brutal space-y-2">
          <div className="flex items-center gap-2 font-extrabold text-sm text-ink">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>TELEGRAM_BOT_TOKEN NOT CONFIGURED</span>
          </div>
          <p className="text-xs text-ink/80">
            Add these environment variables in Vercel (or <code className="font-mono bg-white px-1 border border-ink">.env</code> locally) and redeploy:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] font-mono">
            <div className="bg-white border border-ink p-2">TELEGRAM_BOT_TOKEN</div>
            <div className="bg-white border border-ink p-2">TELEGRAM_OWNER_CHAT_ID</div>
            <div className="bg-white border border-ink p-2">TELEGRAM_WEBHOOK_SECRET</div>
          </div>
        </div>
      )}

      {/* Status + Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal" />
              CONNECTION STATUS
            </span>
            {status?.configured ? (
              <span className="px-2 py-0.5 bg-teal text-white text-[10px] font-mono border border-ink">CONFIGURED</span>
            ) : (
              <span className="px-2 py-0.5 bg-coral text-white text-[10px] font-mono border border-ink">NOT CONFIGURED</span>
            )}
          </h3>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2.5 border-2 border-ink bg-cream-50">
              <div className="text-[10px] font-mono text-ink-muted">BOT USERNAME</div>
              <div className="font-extrabold mt-0.5">{status?.botUsername ? `@${status.botUsername}` : '—'}</div>
            </div>
            <div className="p-2.5 border-2 border-ink bg-cream-50">
              <div className="text-[10px] font-mono text-ink-muted">OWNER CHAT ID</div>
              <div className="font-mono font-bold mt-0.5">{status?.ownerChatId || 'Not set'}</div>
            </div>
            <div className="p-2.5 border-2 border-ink bg-cream-50">
              <div className="text-[10px] font-mono text-ink-muted">MODE</div>
              <div className="font-extrabold mt-0.5">
                {status?.webhookSet ? 'Webhook (Production)' : status?.pollingActive ? 'Polling (Local Dev)' : 'Idle'}
              </div>
            </div>
            <div className="p-2.5 border-2 border-ink bg-cream-50">
              <div className="text-[10px] font-mono text-ink-muted">MESSAGES (RX / TX)</div>
              <div className="font-mono font-extrabold mt-0.5">
                {status?.totalReceived ?? 0} / {status?.totalSent ?? 0}
              </div>
            </div>
          </div>

          {status?.webhookSet && (
            <div className="p-2.5 border-2 border-ink bg-cream-50 text-[11px] font-mono space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-muted">WEBHOOK URL</span>
                <span className="font-bold">Pending: {status.pendingUpdateCount ?? 0}</span>
              </div>
              <div className="truncate font-bold text-teal">{status.webhookUrl}</div>
              {status.webhookLastError && (
                <div className="text-coral font-bold">Last Error: {status.webhookLastError}</div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center gap-2">
            <Webhook className="w-4 h-4 text-coral" />
            BOT CONTROLS
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              onClick={() => void runAction('reg-webhook', 'post', '/telegram/register-webhook', {}, 'Webhook registered with Telegram.')}
              disabled={!status?.configured || actionLoading !== null}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-teal text-white border-2 border-ink font-mono text-xs font-bold shadow-brutal-sm disabled:opacity-50"
            >
              <Webhook className="w-3.5 h-3.5" />
              <span>{actionLoading === 'reg-webhook' ? 'REGISTERING...' : 'REGISTER WEBHOOK'}</span>
            </button>

            <button
              onClick={() => void runAction('del-webhook', 'post', '/telegram/delete-webhook', {}, 'Webhook removed.')}
              disabled={!status?.configured || actionLoading !== null}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-cream-100 hover:bg-cream-200 border-2 border-ink font-mono text-xs font-bold shadow-brutal-sm disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5" />
              <span>{actionLoading === 'del-webhook' ? 'REMOVING...' : 'DELETE WEBHOOK'}</span>
            </button>

            <button
              onClick={() => void runAction('start-poll', 'post', '/telegram/start-polling', {}, 'Local polling started.')}
              disabled={!status?.configured || status?.pollingActive || actionLoading !== null}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-cream-100 hover:bg-cream-200 border-2 border-ink font-mono text-xs font-bold shadow-brutal-sm disabled:opacity-50"
            >
              <Radio className="w-3.5 h-3.5 text-teal" />
              <span>{actionLoading === 'start-poll' ? 'STARTING...' : 'START POLLING'}</span>
            </button>

            <button
              onClick={() => void runAction('stop-poll', 'post', '/telegram/stop-polling', {}, 'Polling stopped.')}
              disabled={!status?.pollingActive || actionLoading !== null}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-cream-100 hover:bg-cream-200 border-2 border-ink font-mono text-xs font-bold shadow-brutal-sm disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5 text-coral" />
              <span>{actionLoading === 'stop-poll' ? 'STOPPING...' : 'STOP POLLING'}</span>
            </button>
          </div>

          <button
            onClick={() => void runAction('set-cmds', 'post', '/telegram/set-commands', {}, 'BotFather command menu updated.')}
            disabled={!status?.configured || actionLoading !== null}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white hover:bg-cream-100 border-2 border-ink font-mono text-xs font-bold shadow-brutal-sm disabled:opacity-50"
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>{actionLoading === 'set-cmds' ? 'UPDATING MENU...' : 'SYNC BOT COMMAND MENU'}</span>
          </button>
        </div>
      </div>

      {/* Proactive Notification Centre */}
      <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b-2 border-ink pb-2">
          <h3 className="font-extrabold text-sm flex items-center gap-2">
            <Bell className="w-4 h-4 text-coral" />
            TELEGRAM PROACTIVE NOTIFICATION CENTRE
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() =>
                void runAction(
                  'test-notif',
                  'post',
                  '/telegram/notifications/test-event',
                  {
                    source: 'system',
                    title: 'Test Proactive Alert',
                    body: 'Verification alert from Karen Notification Centre.',
                    suggestedPriority: 'HIGH',
                  },
                  'Test proactive alert processed.'
                )
              }
              className="px-2.5 py-1 bg-teal text-white border border-ink font-mono text-[11px] font-bold"
            >
              TEST ALERT
            </button>
            <button
              onClick={() => void runAction('retry-failed', 'post', '/telegram/notifications/retry-failed', {}, 'Retry complete.')}
              className="px-2.5 py-1 bg-cream-100 border border-ink font-mono text-[11px] font-bold"
            >
              RETRY FAILED ({notifStats?.failures ?? 0})
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 border-2 border-ink bg-cream-50">
            <div className="text-[10px] font-mono text-ink-muted">TOTAL ALERTS</div>
            <div className="font-extrabold text-base">{notifStats?.total ?? 0}</div>
          </div>
          <div className="p-2.5 border-2 border-ink bg-cream-50">
            <div className="text-[10px] font-mono text-ink-muted">CRITICAL</div>
            <div className="font-extrabold text-base text-coral">{notifStats?.critical ?? 0}</div>
          </div>
          <div className="p-2.5 border-2 border-ink bg-cream-50">
            <div className="text-[10px] font-mono text-ink-muted">UNREAD</div>
            <div className="font-extrabold text-base">{notifStats?.unread ?? 0}</div>
          </div>
          <div className="p-2.5 border-2 border-ink bg-cream-50">
            <div className="text-[10px] font-mono text-ink-muted">DELIVERY FAILURES</div>
            <div className="font-extrabold text-base">{notifStats?.failures ?? 0}</div>
          </div>
        </div>

        {/* Integration Toggles + Quiet Hours */}
        {notifPrefs && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="space-y-2">
              <div className="text-[11px] font-mono font-bold text-ink-muted">CONNECTED INTEGRATIONS</div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(notifPrefs.sources) as NotificationSource[]).map((src) => (
                  <button
                    key={src}
                    onClick={() => void toggleSource(src)}
                    className={`px-2 py-1 border border-ink font-mono text-[11px] font-bold uppercase ${
                      notifPrefs.sources[src] ? 'bg-teal text-white' : 'bg-cream-100 text-ink-muted'
                    }`}
                  >
                    {src}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-mono font-bold text-ink-muted">QUIET HOURS (ASIA/KOLKATA)</div>
              <div className="flex items-center gap-3 text-xs">
                <button
                  onClick={() => void toggleQuietHours()}
                  className={`px-3 py-1.5 border-2 border-ink font-mono text-xs font-bold ${
                    notifPrefs.quietHours.enabled ? 'bg-ink text-white' : 'bg-cream-100'
                  }`}
                >
                  {notifPrefs.quietHours.enabled ? 'QUIET HOURS: ON' : 'QUIET HOURS: OFF'}
                </button>
                <span className="font-mono text-[11px] text-ink-muted">
                  {notifPrefs.quietHours.start} – {notifPrefs.quietHours.end} IST (Emergency bypass: {notifPrefs.quietHours.allowEmergency ? 'ON' : 'OFF'})
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Priority Filters + History */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-mono">
            <span className="font-bold text-ink-muted mr-1">FILTER:</span>
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-2 py-0.5 border border-ink font-bold ${
                  priorityFilter === p ? 'bg-coral text-white' : 'bg-cream-50'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs">
            {notifHistory.length === 0 ? (
              <div className="p-3 border border-ink bg-cream-50 font-mono text-ink-muted">No proactive notifications recorded yet.</div>
            ) : (
              notifHistory.slice(0, 10).map((n) => (
                <div key={n.id} className="p-2 border border-ink bg-cream-50 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-[10px] px-1 border border-ink mr-1.5">{n.priority}</span>
                    <span className="font-mono text-[10px] uppercase text-ink-muted mr-1.5">[{n.source}]</span>
                    <span className="font-bold">{n.title}</span>
                    <span className="text-ink-muted ml-2 truncate">{n.summary}</span>
                  </div>
                  <span className="font-mono text-[10px] shrink-0">{n.status}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Daily Companion & Smart Greeting Schedule */}
      {companionCfg && (
        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b-2 border-ink pb-2">
            <h3 className="font-extrabold text-sm flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-500" />
              DAILY COMPANION &amp; SMART GREETINGS (ASIA/KOLKATA)
            </h3>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span>LANGUAGE:</span>
              {(['english', 'mixed', 'tanglish'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() =>
                    void runAction('comp-lang', 'put', '/telegram/companion/config', { language: lang }, `Language set to ${lang}.`)
                  }
                  className={`px-2 py-0.5 border border-ink uppercase font-bold ${
                    companionCfg.language === lang ? 'bg-teal text-white' : 'bg-cream-50'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(['morning', 'afternoon', 'evening', 'night'] as GreetingSlot[]).map((slot) => (
              <div key={slot} className="p-3 border-2 border-ink bg-cream-50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs uppercase flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-teal" />
                    {slot}
                  </span>
                  <button
                    onClick={() => void toggleGreetingSlot(slot)}
                    className={`px-2 py-0.5 border border-ink font-mono text-[10px] font-bold ${
                      companionCfg.slots[slot].enabled ? 'bg-teal text-white' : 'bg-white text-ink-muted'
                    }`}
                  >
                    {companionCfg.slots[slot].enabled ? 'ON' : 'OFF'}
                  </button>
                </div>
                <input
                  type="time"
                  value={companionCfg.slots[slot].time}
                  onChange={(e) => void updateSlotTime(slot, e.target.value)}
                  className="w-full px-2 py-1 border border-ink bg-white font-mono text-xs"
                />
                <button
                  onClick={() =>
                    void runAction(`trig-${slot}`, 'post', '/telegram/companion/trigger', { slot, force: true }, `${slot} greeting triggered.`)
                  }
                  disabled={actionLoading !== null}
                  className="w-full py-1 bg-white hover:bg-cream-200 border border-ink font-mono text-[10px] font-bold"
                >
                  SEND NOW
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test Send + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-3">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center gap-2">
            <Send className="w-4 h-4 text-teal" />
            SEND TEST MESSAGE TO OWNER
          </h3>
          <form onSubmit={(e) => void handleTestSend(e)} className="space-y-3">
            <input
              type="text"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Hello from Karen AI dashboard..."
              className="w-full px-3 py-2 border-2 border-ink bg-cream-50 text-xs font-mono focus:outline-none"
            />
            <button
              type="submit"
              disabled={!status?.configured || !testText.trim() || actionLoading !== null}
              className="px-4 py-2 bg-coral text-white border-2 border-ink font-mono text-xs font-bold shadow-brutal-sm disabled:opacity-50"
            >
              {actionLoading === 'send' ? 'SENDING...' : 'SEND TEST MESSAGE'}
            </button>
          </form>
        </div>

        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-3">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-coral" />
            RECENT MESSAGE ACTIVITY
          </h3>
          <div className="space-y-2 text-xs">
            <div className="p-2.5 border border-ink bg-cream-50">
              <div className="flex justify-between text-[10px] font-mono text-ink-muted mb-1">
                <span>LAST INCOMING</span>
                <span>{formatTime(status?.lastIncoming?.timestamp)}</span>
              </div>
              <div className="font-mono truncate">{status?.lastIncoming?.text || 'No incoming messages yet.'}</div>
            </div>
            <div className="p-2.5 border border-ink bg-cream-50">
              <div className="flex justify-between text-[10px] font-mono text-ink-muted mb-1">
                <span>LAST OUTGOING</span>
                <span>{formatTime(status?.lastOutgoing?.timestamp)}</span>
              </div>
              <div className="font-mono truncate">{status?.lastOutgoing?.text || 'No outgoing messages yet.'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Error Logs */}
      {status && status.errors.length > 0 && (
        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-3">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center gap-2 text-coral">
            <AlertCircle className="w-4 h-4" />
            RECENT TELEGRAM ERRORS
          </h3>
          <div className="space-y-2 text-xs font-mono">
            {status.errors.map((err, idx) => (
              <div key={idx} className="p-2 border border-ink bg-coral/10 flex justify-between gap-4">
                <span className="truncate">{err.message}</span>
                <span className="text-[10px] text-ink-muted shrink-0">{formatTime(err.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Setup + Commands */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-3">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center gap-2">
            <Key className="w-4 h-4 text-teal" />
            SECURE PAIRING SETUP
          </h3>
          <ol className="list-decimal list-inside space-y-2 text-xs text-ink/80 leading-relaxed">
            <li>Create your private bot using <code className="font-mono bg-cream-200 px-1 border border-ink">@BotFather</code> on Telegram.</li>
            <li>Copy the Bot Token into <code className="font-mono bg-cream-200 px-1 border border-ink">TELEGRAM_BOT_TOKEN</code> in Vercel or <code className="font-mono">.env</code>.</li>
            <li>Get your personal Telegram user ID via <code className="font-mono bg-cream-200 px-1 border border-ink">@userinfobot</code> and set <code className="font-mono">TELEGRAM_OWNER_CHAT_ID</code>.</li>
            <li>Set <code className="font-mono bg-cream-200 px-1 border border-ink">TELEGRAM_WEBHOOK_SECRET</code> to any random string, redeploy, then click <strong>Register Webhook</strong> above.</li>
            <li>All messages from non-owner IDs are rejected automatically.</li>
          </ol>
        </div>

        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-3">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-coral" />
            SUPPORTED BOT COMMANDS
          </h3>
          <div className="space-y-1.5 text-xs font-mono max-h-72 overflow-y-auto pr-1">
            {BOT_COMMANDS.map((c, i) => (
              <div key={i} className="p-2 border border-ink bg-cream-50 flex items-center justify-between gap-2">
                <span className="font-bold text-coral shrink-0">{c.cmd}</span>
                <span className="text-[11px] text-ink-muted text-right">{c.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TelegramPage;
