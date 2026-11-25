import React from 'react';
import { Clock, Bell, Plus, CheckCircle2 } from 'lucide-react';

export const RemindersPage: React.FC = () => {
  const reminders = [
    { id: '1', title: 'College Review Submission Preparation', time: 'Tomorrow 09:00 IST', recurrence: 'One-off', channel: 'Telegram + Web' },
    { id: '2', title: 'Daily Evening Communication Check', time: 'Everyday 18:00 IST', recurrence: 'Daily', channel: 'Web' },
    { id: '3', title: 'Check Electricity Bill Payment Confirmation', time: '26 Nov 11:00 IST', recurrence: 'Monthly', channel: 'Telegram' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-mint text-ink text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Clock className="w-3.5 h-3.5" />
            <span>SCHEDULED ALARMS & DISPATCHER</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Scheduled Reminders</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Time-based alarms dispatched across Web and Telegram channels. Prevents duplicate firing with idempotency keys. Default timezone: Asia/Kolkata.
          </p>
        </div>
        <button className="btn-coral text-xs flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Set Reminder
        </button>
      </div>

      <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2">ACTIVE REMINDER SCHEDULE</h3>
        <div className="space-y-2">
          {reminders.map((r) => (
            <div key={r.id} className="p-3 border-2 border-ink bg-cream-50 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-ink" />
                <div>
                  <h4 className="font-bold">{r.title}</h4>
                  <span className="text-[10px] font-mono text-ink-muted">
                    Channel: {r.channel} • Repeat: {r.recurrence}
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 border border-ink bg-yellow/40 text-[10px] font-mono font-bold">
                {r.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default RemindersPage;
