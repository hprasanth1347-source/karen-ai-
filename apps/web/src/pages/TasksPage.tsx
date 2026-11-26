import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  Plus,
  Clock,
  Check,
  Calendar,
  RefreshCw,
  Trash2,
  Bell,
  Lock,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { api, readCachedGet } from '../lib/api';

interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  status: string;
}

interface CalendarEventItem {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  htmlLink?: string;
}

function getTodayIstIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export const TasksPage: React.FC = () => {
  const cachedGTasks = readCachedGet<{ data?: GoogleTaskItem[] }>('/google-tasks')?.data;
  const cachedEvents = readCachedGet<{ data?: CalendarEventItem[] }>('/calendar/events')?.data;

  const [googleTasks, setGoogleTasks] = useState<GoogleTaskItem[]>(() => cachedGTasks ?? []);
  const [events, setEvents] = useState<CalendarEventItem[]>(() => cachedEvents ?? []);
  const [loading, setLoading] = useState(() => !(cachedGTasks?.length || cachedEvents?.length));
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [syncingAlert, setSyncingAlert] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Add Google Task fields
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState(() => getTodayIstIso());
  const [newNotes, setNewNotes] = useState('');

  // Add Google Calendar Event fields
  const [evSummary, setEvSummary] = useState('');
  const [evDateTime, setEvDateTime] = useState('');
  const [evDesc, setEvDesc] = useState('');

  const loadLiveWorkspace = async (force = false) => {
    if ((!googleTasks.length && !events.length) || force) setLoading(true);
    setError(null);
    const [tasksRes, calRes] = await Promise.allSettled([
      api.get<{ data: GoogleTaskItem[] }>('/google-tasks', force ? ({ skipCache: true } as any) : undefined),
      api.get<{ data: CalendarEventItem[] }>('/calendar/events', force ? ({ skipCache: true } as any) : undefined),
    ]);

    let reconnect = false;
    if (tasksRes.status === 'fulfilled') {
      setGoogleTasks(tasksRes.value.data?.data ?? []);
    } else if (tasksRes.reason?.response?.status === 400 || tasksRes.reason?.response?.status === 403) {
      reconnect = true;
    }

    if (calRes.status === 'fulfilled') {
      setEvents(calRes.value.data?.data ?? []);
    } else if (calRes.reason?.response?.status === 400 || calRes.reason?.response?.status === 403) {
      reconnect = true;
    }

    setNeedsReconnect(reconnect);
    if (tasksRes.status === 'rejected' && calRes.status === 'rejected' && !reconnect) {
      setError('Could not load live Google Tasks or Calendar.');
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadLiveWorkspace();
  }, []);

  const handleConnect = async () => {
    const res = await api.get<{ data: { url: string } }>('/drive/auth-url', { params: { source: 'drive' } }).catch(() => null);
    if (res?.data?.data?.url) window.location.href = res.data.data.url;
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || savingTask) return;
    setSavingTask(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<{ data: GoogleTaskItem }>('/google-tasks', {
        title: newTitle.trim(),
        dueIso: newDue || undefined,
        notes: newNotes.trim() || undefined,
      });
      if (res.data?.data) {
        setGoogleTasks((prev) => [res.data.data, ...prev]);
      }
      setNewTitle('');
      setNewNotes('');
      setNotice('Task saved to live Google Tasks & notified on Telegram.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not create Google Task.');
    } finally {
      setSavingTask(false);
    }
  };

  const handleToggleTask = async (task: GoogleTaskItem) => {
    const nextStatus = task.status === 'completed' ? 'needsAction' : 'completed';
    setGoogleTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    try {
      await api.patch(`/google-tasks/${encodeURIComponent(task.id)}`, { status: nextStatus });
    } catch {
      setGoogleTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
  };

  const handleDeleteTask = async (id: string) => {
    setGoogleTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await api.delete(`/google-tasks/${encodeURIComponent(id)}`);
    } catch {
      void loadLiveWorkspace(true);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evSummary.trim() || !evDateTime || savingEvent) return;
    setSavingEvent(true);
    setError(null);
    setNotice(null);
    try {
      const startIso = new Date(evDateTime).toISOString();
      const res = await api.post<{ data: CalendarEventItem }>('/calendar/events', {
        summary: evSummary.trim(),
        startIso,
        description: evDesc.trim() || undefined,
      });
      if (res.data?.data) {
        setEvents((prev) => [...prev, res.data.data].sort((a, b) => a.start.localeCompare(b.start)));
      }
      setEvSummary('');
      setEvDateTime('');
      setEvDesc('');
      setNotice('Event added to Google Calendar & pushed to Telegram.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not create Google Calendar event.');
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
    try {
      await api.delete(`/calendar/events/${encodeURIComponent(id)}`);
    } catch {
      void loadLiveWorkspace(true);
    }
  };

  const handlePushTelegramAlerts = async () => {
    setSyncingAlert(true);
    setNotice(null);
    try {
      const res = await api.post<{ data: { alertsSent: number; checkedTasks: number; checkedEvents: number } }>(
        '/notifications/sync-live',
        { forceSummary: true }
      );
      const d = res.data?.data;
      setNotice(`Synced ${d?.checkedTasks ?? 0} Google Tasks & ${d?.checkedEvents ?? 0} Calendar events -> ${d?.alertsSent ?? 0} Telegram alert(s) sent.`);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not send live Telegram alert.');
    } finally {
      setSyncingAlert(false);
    }
  };

  const todayIst = useMemo(() => getTodayIstIso(), []);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-yellow text-ink text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <CheckSquare className="w-3.5 h-3.5" />
            <span>LIVE GOOGLE TASKS &amp; CALENDAR (IST)</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Tasks &amp; Calendar</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-2xl">
            100% live synced with Google Tasks &amp; Google Calendar (Asia/Kolkata). Important due tasks and upcoming events notify you directly in Telegram.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handlePushTelegramAlerts()}
            disabled={syncingAlert}
            className="btn-coral text-xs flex items-center gap-1.5"
          >
            {syncingAlert ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
            Notify Telegram Now
          </button>
          <button
            type="button"
            onClick={() => void loadLiveWorkspace(true)}
            className="btn-ghost text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {needsReconnect && (
        <div className="bg-yellow/50 border-3 border-ink p-4 shadow-brutal-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold">
            <Lock className="w-4 h-4" />
            <span>Reconnect your Google account once to grant live Google Tasks &amp; Google Calendar permissions.</span>
          </div>
          <button type="button" onClick={() => void handleConnect()} className="btn-coral text-xs">
            Reconnect Google
          </button>
        </div>
      )}

      {error && <div className="p-3 border-2 border-ink bg-coral/15 text-coral text-xs font-bold">{error}</div>}
      {notice && <div className="p-3 border-2 border-ink bg-teal/20 text-ink text-xs font-bold">{notice}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LIVE GOOGLE TASKS */}
        <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-4">
          <div className="flex items-center justify-between border-b-2 border-ink pb-2">
            <h2 className="font-black text-sm flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-teal" />
              LIVE GOOGLE TASKS ({googleTasks.length})
            </h2>
          </div>

          <form onSubmit={handleAddTask} className="space-y-2 bg-cream-50 border-2 border-ink p-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="New Google Task title..."
                className="flex-1 border-2 border-ink bg-white px-2.5 py-1.5 text-xs"
                required
              />
              <input
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className="border-2 border-ink bg-white px-2 py-1.5 text-xs font-mono"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Optional notes..."
                className="flex-1 border-2 border-ink bg-white px-2.5 py-1.5 text-xs"
              />
              <button type="submit" disabled={savingTask} className="btn-teal text-xs px-3 flex items-center gap-1">
                {savingTask ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add Task
              </button>
            </div>
          </form>

          {loading && googleTasks.length === 0 ? (
            <p className="text-xs font-mono text-ink-muted py-6 text-center">Loading live Google Tasks...</p>
          ) : googleTasks.length === 0 ? (
            <p className="text-xs font-mono text-ink-muted py-6 text-center">
              No active tasks in your Google Tasks list yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {googleTasks.map((task) => {
                const isDone = task.status === 'completed';
                const dueDate = task.due ? task.due.slice(0, 10) : '';
                const isOverdue = !isDone && dueDate && dueDate < todayIst;
                const isToday = !isDone && dueDate === todayIst;
                return (
                  <div
                    key={task.id}
                    className={`p-3 border-2 border-ink flex items-center justify-between gap-2 ${
                      isDone ? 'bg-cream-100 opacity-65' : 'bg-cream-50'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => void handleToggleTask(task)}
                        className={`mt-0.5 w-5 h-5 border-2 border-ink flex items-center justify-center shrink-0 ${
                          isDone ? 'bg-teal text-white' : 'bg-white hover:bg-cream'
                        }`}
                      >
                        {isDone && <Check className="w-3.5 h-3.5" />}
                      </button>
                      <div className="min-w-0">
                        <div className={`text-xs font-bold ${isDone ? 'line-through' : ''}`}>{task.title}</div>
                        {task.notes && <div className="text-[11px] text-ink-muted truncate">{task.notes}</div>}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] font-mono">
                          <span className="inline-flex items-center gap-1 text-ink-muted">
                            <Clock className="w-3 h-3" />
                            {dueDate || 'No due date'}
                          </span>
                          {isOverdue && <span className="px-1.5 bg-coral text-white font-bold">OVERDUE</span>}
                          {isToday && <span className="px-1.5 bg-yellow text-ink border border-ink font-bold">DUE TODAY</span>}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteTask(task.id)}
                      title="Delete task"
                      className="p-1.5 border border-ink text-coral hover:bg-coral hover:text-white shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* LIVE GOOGLE CALENDAR */}
        <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-4">
          <div className="flex items-center justify-between border-b-2 border-ink pb-2">
            <h2 className="font-black text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-coral" />
              LIVE GOOGLE CALENDAR ({events.length})
            </h2>
          </div>

          <form onSubmit={handleAddEvent} className="space-y-2 bg-cream-50 border-2 border-ink p-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={evSummary}
                onChange={(e) => setEvSummary(e.target.value)}
                placeholder="Event title (e.g. Project Demo)"
                className="flex-1 border-2 border-ink bg-white px-2.5 py-1.5 text-xs"
                required
              />
              <input
                type="datetime-local"
                value={evDateTime}
                onChange={(e) => setEvDateTime(e.target.value)}
                className="border-2 border-ink bg-white px-2 py-1.5 text-xs font-mono"
                required
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={evDesc}
                onChange={(e) => setEvDesc(e.target.value)}
                placeholder="Optional location / notes..."
                className="flex-1 border-2 border-ink bg-white px-2.5 py-1.5 text-xs"
              />
              <button type="submit" disabled={savingEvent} className="btn-coral text-xs px-3 flex items-center gap-1">
                {savingEvent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add Event
              </button>
            </div>
          </form>

          {loading && events.length === 0 ? (
            <p className="text-xs font-mono text-ink-muted py-6 text-center">Loading Google Calendar events...</p>
          ) : events.length === 0 ? (
            <p className="text-xs font-mono text-ink-muted py-6 text-center">
              No upcoming events in the next 7 days.
            </p>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {events.map((ev) => {
                const startIst = ev.start
                  ? new Date(ev.start).toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'All day';
                const evDate = ev.start
                  ? new Date(ev.start).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
                  : '';
                return (
                  <div key={ev.id} className="p-3 border-2 border-ink bg-cream-50 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        <span className="truncate">{ev.summary}</span>
                        {evDate === todayIst && (
                          <span className="px-1.5 py-0.5 bg-yellow border border-ink text-[9px] font-mono">TODAY</span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-ink-muted mt-0.5">
                        🕒 {startIst} IST {ev.location ? `· 📍 ${ev.location}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {ev.htmlLink && (
                        <a
                          href={ev.htmlLink}
                          target="_blank"
                          rel="noreferrer"
                          title="Open in Google Calendar"
                          className="p-1.5 border border-ink bg-white hover:bg-cream"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDeleteEvent(ev.id)}
                        title="Delete event"
                        className="p-1.5 border border-ink text-coral hover:bg-coral hover:text-white"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TasksPage;
