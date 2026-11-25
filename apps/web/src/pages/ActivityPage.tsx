import React, { useState } from 'react';
import { History, Download, Filter, Search } from 'lucide-react';

export const ActivityPage: React.FC = () => {
  const activities = [
    { id: '1', action: 'DATABASE_MIGRATION', actor: 'system', details: 'Applied 0002_karen_ultra_complete.sql with 22 tables & RLS', time: '2026-11-23 21:46 IST' },
    { id: '2', action: 'VOICE_POLICY_CHECK', actor: 'system', details: 'Confirmed female voice ID; male fallback blocked', time: '2026-11-23 21:30 IST' },
    { id: '3', action: 'CORE_INIT', actor: 'owner', details: 'Karen AI Personal AI OS started in development mode', time: '2026-11-23 21:15 IST' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-yellow text-ink text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <History className="w-3.5 h-3.5" />
            <span>TAMPER-RESISTANT ACTIVITY & AUDIT LOG</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Activity History</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Complete trace of all system logins, AI tool invocations, external message actions, document queries, and configuration modifications.
          </p>
        </div>
      </div>

      <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2">EVENT LOG</h3>
        <div className="space-y-2 text-xs font-mono">
          {activities.map((act) => (
            <div key={act.id} className="p-3 border-2 border-ink bg-cream-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 font-bold">
                  <span className="text-coral">{act.action}</span>
                  <span className="text-ink-muted text-[10px]">by {act.actor}</span>
                </div>
                <p className="text-ink font-sans text-xs mt-0.5">{act.details}</p>
              </div>
              <span className="text-[10px] text-ink-muted shrink-0">{act.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default ActivityPage;
