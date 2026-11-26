import React, { useEffect, useState } from 'react';
import { Clock, Plus, CheckCircle2, Calendar } from 'lucide-react';
import { api } from '../lib/api';

interface TaskItem {
  id: string;
  title: string;
  due?: string;
  priority: string;
  status: string;
}

interface CalEvent {
  id: string;
  summary: string;
  start: string;
}

export const RemindersPage: React.FC = () => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, cRes] = await Promise.allSettled([
        api.get('/tasks'),
        api.get('/calendar/events?days=14'),
      ]);
      if (tRes.status === 'fulfilled') setTasks(tRes.value.data?.data ?? []);
      if (cRes.status === 'fulfilled') setEvents(cRes.value.data?.data ?? []);
    } catch {
      setError('Could not load reminders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    try {
      const res = await api.post('/tasks', {
        title: title.trim(),
        due: due || undefined,
        priority: 'high',
      });
      if (res.data?.data) setTasks((prev) => [res.data.data, ...prev]);
      if (addToCalendar && due) {
        const startIso = new Date(`${due}T09:00:00+05:30`).toISOString();
        await api.post('/calendar/events', { summary: title.trim(), startIso }).catch(() => {});
      }
      setTitle('');
      setDue('');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not save reminder.');
    }
  };

  const toggleDone = async (t: TaskItem) => {
    const nextStatus = t.status === 'done' ? 'todo' : 'done';
    await api.patch(`/tasks/${t.id}`, { status: nextStatus }).catch(() => {});
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: nextStatus } : x)));
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal">
        <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-coral text-[#0A0A0A] text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
          <Clock className="w-3.5 h-3.5" />
          <span>REMINDERS &amp; GOOGLE CALENDAR</span>
        </div>
        <h1 className="text-xl md:text-2xl font-black">Reminders &amp; Schedule</h1>
        <p className="text-xs text-ink-muted mt-1">Synced with Karen Tasks and Google Calendar.</p>
      </div>

      {error && <div className="bg-coral/20 border-2 border-ink p-3 text-xs font-bold">{error}</div>}

      <form onSubmit={handleCreate} className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Reminder title..."
            className="sm:col-span-2 border-2 border-ink p-2 text-xs font-bold"
          />
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="border-2 border-ink p-2 text-xs font-mono"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input type="checkbox" checked={addToCalendar} onChange={(e) => setAddToCalendar(e.target.checked)} />
            Also add to Google Calendar (9:00 AM IST)
          </label>
          <button type="submit" className="btn-coral text-xs flex items-center gap-1">
            <Plus className="w-4 h-4" />
            Add Reminder
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-2">
          <h2 className="font-black text-sm border-b-2 border-ink pb-1">Task Reminders</h2>
          {loading ? (
            <p className="text-xs font-mono text-ink-muted">Loading...</p>
          ) : tasks.length === 0 ? (
            <p className="text-xs text-ink-muted">No reminders yet.</p>
          ) : (
            tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between border border-ink p-2 text-xs">
                <div>
                  <div className={`font-bold ${t.status === 'done' ? 'line-through text-ink-muted' : ''}`}>{t.title}</div>
                  {t.due && <div className="text-[10px] font-mono text-ink-muted">Due: {t.due}</div>}
                </div>
                <button type="button" onClick={() => void toggleDone(t)} className="px-2 py-1 border border-ink bg-mint text-[10px] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {t.status === 'done' ? 'Reopen' : 'Done'}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-2">
          <h2 className="font-black text-sm border-b-2 border-ink pb-1 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-coral" />
            Google Calendar (Next 14 Days)
          </h2>
          {events.length === 0 ? (
            <p className="text-xs text-ink-muted">No upcoming Google Calendar events (or reconnect Google to grant Calendar scope).</p>
          ) : (
            events.map((ev) => (
              <div key={ev.id} className="border border-ink p-2 text-xs">
                <div className="font-bold">{ev.summary}</div>
                <div className="text-[10px] font-mono text-ink-muted">{ev.start}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
export default RemindersPage;
