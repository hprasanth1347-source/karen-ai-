import React, { useEffect, useState } from 'react';
import { CheckSquare, Plus, Clock, Check, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

interface TaskItem {
  id: string;
  title: string;
  due: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'done';
  source: string;
}

export const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');

  useEffect(() => {
    let active = true;
    api
      .get('/tasks')
      .then((res) => {
        if (active) setTasks(res.data?.data ?? []);
      })
      .catch((err) => {
        if (active) {
          setError(
            err?.response?.status === 401
              ? 'Sign in at /auth to load and schedule live tasks.'
              : err?.response?.data?.error || 'Could not load tasks.'
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || saving) return;
    setError(null);
    setSaving(true);
    try {
      const res = await api.post('/tasks', {
        title: newTitle.trim(),
        due: newDue || undefined,
        priority: 'medium',
      });
      if (res.data?.data) {
        setTasks((prev) => [res.data.data, ...prev]);
      }
      setNewTitle('');
      setNewDue('');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to add task.');
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = async (id: string, currentStatus: TaskItem['status']) => {
    const nextStatus = currentStatus === 'done' ? 'todo' : 'done';
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: nextStatus } : t))
    );
    try {
      await api.patch(`/tasks/${id}`, { status: nextStatus });
    } catch {
      // Revert if failed
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: currentStatus } : t))
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-yellow text-ink text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <CheckSquare className="w-3.5 h-3.5" />
            <span>ACTION MANAGEMENT & DEADLINES</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Tasks & Action Items</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Live tasks created manually or scheduled directly by Karen AI Chat. Default timezone: Asia/Kolkata.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 border-2 border-ink bg-coral/15 text-coral text-xs font-bold">
          {error}
        </div>
      )}

      <form onSubmit={handleAdd} className="bg-white border-3 border-ink p-3 shadow-brutal flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a new task: e.g. 'Pay broadband bill before Friday'"
          className="flex-1 bg-cream-50 border-2 border-ink p-2 text-xs font-medium outline-none"
        />
        <input
          type="date"
          value={newDue}
          onChange={(e) => setNewDue(e.target.value)}
          className="bg-cream-50 border-2 border-ink p-2 text-xs font-mono outline-none"
        />
        <button type="submit" disabled={saving} className="btn-coral text-xs flex items-center justify-center gap-1.5 disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add Task
        </button>
      </form>

      <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-2">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2">TASK REGISTER ({tasks.length})</h3>
        {loading ? (
          <div className="text-xs font-mono flex items-center gap-2 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading tasks...
          </div>
        ) : (
          tasks.map((t) => (
            <div
              key={t.id}
              className={`p-3 border-2 border-ink flex items-center justify-between text-xs transition-all ${
                t.status === 'done' ? 'bg-cream-100 opacity-60 line-through' : 'bg-cream-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleTask(t.id, t.status)}
                  className={`w-5 h-5 border-2 border-ink flex items-center justify-center ${
                    t.status === 'done' ? 'bg-mint text-ink' : 'bg-white'
                  }`}
                >
                  {t.status === 'done' && <Check className="w-3.5 h-3.5" />}
                </button>
                <div>
                  <h4 className="font-bold">{t.title}</h4>
                  <span className="text-[10px] font-mono text-ink-muted flex items-center gap-2">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Due: {t.due || 'Unspecified'}</span>
                    <span>• Source: {t.source}</span>
                  </span>
                </div>
              </div>
              <span className={`px-2 py-0.5 border border-ink text-[10px] font-mono font-bold uppercase flex items-center gap-1 ${
                t.priority === 'urgent' ? 'bg-coral text-white' : t.priority === 'high' ? 'bg-yellow text-ink' : 'bg-white text-ink'
              }`}>
                <AlertCircle className="w-3 h-3" />
                {t.priority}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
export default TasksPage;
