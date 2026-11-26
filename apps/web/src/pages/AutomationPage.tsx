import React, { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import { api } from '../lib/api';

export const AutomationPage: React.FC = () => {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api.get('/integrations/status').then((r) => setStatus(r.data?.data ?? null)).catch(() => { });
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal">
        <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-yellow text-[#0A0A0A] text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
          <Cpu className="w-3.5 h-3.5" />
          <span>CRON &amp; AUTONOMOUS WORKFLOWS</span>
        </div>
        <h1 className="text-xl md:text-2xl font-black">Automation &amp; Daily Companion</h1>
        <p className="text-xs text-ink-muted mt-1">Scheduled Classroom sync, Meta token refresh, Daily Briefing, and Telegram alerts.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {[
          { name: 'Daily Briefing & Companion Tick', route: '/api/v1/cron/companion-tick', active: Boolean(status?.telegram) },
          { name: 'Classroom Deadline Sync', route: '/api/v1/cron/classroom-sync', active: Boolean(status?.google) },
          { name: 'Meta 60-Day Token Refresh', route: '/api/v1/cron/meta-token-refresh', active: Boolean(status?.instagram) },
          { name: '7-Day Skill File Purge', route: '/api/v1/cron/meta-token-refresh', active: true },
        ].map((job) => (
          <div key={job.name} className="bg-white border-2 border-ink p-3 shadow-brutal-sm space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-bold">{job.name}</span>
              <span className={`px-2 py-0.5 border border-ink font-mono text-[10px] font-bold ${job.active ? 'bg-mint' : 'bg-yellow'}`}>
                {job.active ? 'ACTIVE' : 'STANDBY'}
              </span>
            </div>
            <div className="font-mono text-[10px] text-ink-muted">{job.route}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
export default AutomationPage;
