import React, { useState } from 'react';
import { Bell, Filter, CheckCheck, Clock } from 'lucide-react';

export const NotificationsPage: React.FC = () => {
  const [filter, setFilter] = useState('all');

  const notifications = [
    { id: '1', title: 'Task Deadline: Friday 15:00', body: 'Project review presentation is scheduled in 2 days.', channel: 'tasks', priority: 'high', time: '10m ago' },
    { id: '2', title: 'AWS Cloud Invoice Extracted', body: 'Amount: $14.20 logged to financial documents.', channel: 'gmail', priority: 'normal', time: '2h ago' },
    { id: '3', title: 'Security Audit: Owner Logged In', body: 'Session verified from local development IP.', channel: 'security', priority: 'low', time: 'Today' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-yellow text-ink text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Bell className="w-3.5 h-3.5" />
            <span>UNIFIED NOTIFICATION CENTRE</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Notifications & Alerts</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Prioritized notifications across Web, Telegram, and Desktop channels with Asia/Kolkata quiet-hours compliance.
          </p>
        </div>
        <button className="btn-ghost text-xs flex items-center gap-1.5">
          <CheckCheck className="w-4 h-4" />
          Mark All Read
        </button>
      </div>

      <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
        <div className="flex gap-2 border-b-2 border-ink pb-3 overflow-x-auto text-xs font-mono font-bold">
          {['all', 'tasks', 'gmail', 'security'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 border-2 border-ink capitalize ${
                filter === f ? 'bg-coral text-white' : 'bg-cream-50 hover:bg-cream-100'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {notifications
            .filter((n) => filter === 'all' || n.channel === filter)
            .map((n) => (
              <div key={n.id} className="p-3 border-2 border-ink bg-cream-50 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs">{n.title}</span>
                    <span className={`text-[9px] font-mono uppercase px-1 border border-ink ${
                      n.priority === 'high' ? 'bg-coral text-white' : 'bg-cream-200'
                    }`}>
                      {n.priority}
                    </span>
                  </div>
                  <p className="text-xs text-ink/80 mt-1">{n.body}</p>
                </div>
                <span className="text-[10px] font-mono text-ink-muted whitespace-nowrap">{n.time}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
export default NotificationsPage;
