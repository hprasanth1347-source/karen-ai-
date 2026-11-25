import React, { useState } from 'react';
import { CheckSquare, Plus, Clock, Check, AlertCircle } from 'lucide-react';

export const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState([
    { id: '1', title: 'Complete Karen Ultra Master Build Documentation', due: '2026-11-23', priority: 'urgent', status: 'in_progress', source: 'manual' },
    { id: '2', title: 'Review AWS Cloud Billing Statement ($14.20)', due: '2026-11-25', priority: 'medium', status: 'todo', source: 'email_derived' },
    { id: '3', title: 'Submit Semester Project Presentation Slides', due: '2026-11-27', priority: 'high', status: 'todo', source: 'document_derived' },
  ]);

  const [newTitle, setNewTitle] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setTasks((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        title: newTitle,
        due: '2026-11-24',
        priority: 'medium',
        status: 'todo',
        source: 'manual',
      },
    ]);
    setNewTitle('');
  };

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: t.status === 'done' ? 'todo' : 'done' } : t))
    );
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
            All tasks created manually, derived from analyzed emails, extracted from documents, or commanded via Voice and Telegram. Default timezone: Asia/Kolkata.
          </p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="bg-white border-3 border-ink p-3 shadow-brutal flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a new task: e.g. 'Pay broadband bill before Friday'"
          className="flex-1 bg-cream-50 border-2 border-ink p-2 text-xs font-medium outline-none"
        />
        <button type="submit" className="btn-coral text-xs flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      </form>

      <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-2">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2">TASK REGISTER</h3>
        {tasks.map((t) => (
          <div
            key={t.id}
            className={`p-3 border-2 border-ink flex items-center justify-between text-xs transition-all ${
              t.status === 'done' ? 'bg-cream-100 opacity-60 line-through' : 'bg-cream-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleTask(t.id)}
                className={`w-5 h-5 border-2 border-ink flex items-center justify-center ${
                  t.status === 'done' ? 'bg-mint text-ink' : 'bg-white'
                }`}
              >
                {t.status === 'done' && <Check className="w-3.5 h-3.5" />}
              </button>
              <div>
                <h4 className="font-bold">{t.title}</h4>
                <span className="text-[10px] font-mono text-ink-muted">
                  Due: {t.due} • Source: {t.source}
                </span>
              </div>
            </div>
            <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border border-ink ${
              t.priority === 'urgent' ? 'bg-coral text-white' : t.priority === 'high' ? 'bg-yellow text-ink' : 'bg-cream-200'
            }`}>
              {t.priority}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
export default TasksPage;
