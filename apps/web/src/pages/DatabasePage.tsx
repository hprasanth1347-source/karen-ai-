import React, { useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import { api } from '../lib/api';

export const DatabasePage: React.FC = () => {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api.get('/integrations/status').then((r) => setStatus(r.data?.data ?? null)).catch(() => {});
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal">
        <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-teal text-[#0A0A0A] text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
          <Database className="w-3.5 h-3.5" />
          <span>SUPABASE POSTGRESQL</span>
        </div>
        <h1 className="text-xl md:text-2xl font-black">Database &amp; Storage</h1>
        <p className="text-xs text-ink-muted mt-1">Permanent storage for Chat Library, Memories, Tasks, Classroom, Instagram, Search Cache &amp; Approvals.</p>
      </div>

      <div className="bg-white border-3 border-ink p-4 shadow-brutal text-xs font-mono space-y-2">
        <div>Supabase Connected: <strong>{status?.supabase ? 'Yes' : 'No'}</strong></div>
        <div>Migrations Applied: 0001 – 0011 (Core, Chat Library, Skills, Search Cache, Command Engine, Instagram Ultimate, Notes Activity)</div>
      </div>
    </div>
  );
};
export default DatabasePage;
