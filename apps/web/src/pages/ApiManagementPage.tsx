import React, { useEffect, useState } from 'react';
import { Key } from 'lucide-react';
import { api } from '../lib/api';

export const ApiManagementPage: React.FC = () => {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [search, setSearch] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api.get('/integrations/status').then((r) => setStatus(r.data?.data ?? null)).catch(() => {});
    api.get('/integrations/search-status').then((r) => setSearch(r.data?.data ?? null)).catch(() => {});
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal">
        <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-coral text-[#0A0A0A] text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
          <Key className="w-3.5 h-3.5" />
          <span>API &amp; PROVIDER KEYS</span>
        </div>
        <h1 className="text-xl md:text-2xl font-black">API Management</h1>
        <p className="text-xs text-ink-muted mt-1">Live configuration status for Groq, Gemini, Google Workspace, Meta, Telegram, and Custom Search.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
        {[
          { name: 'Groq AI', ok: Boolean(status?.groq) },
          { name: 'Google Gemini', ok: Boolean(status?.gemini) },
          { name: 'Google Workspace (Drive/Gmail/Cal/Sheets)', ok: Boolean(status?.google) },
          { name: 'Google Custom Search', ok: Boolean(search?.working) },
          { name: 'Instagram / Meta', ok: Boolean(status?.instagram) },
          { name: 'Telegram Bot', ok: Boolean(status?.telegram) },
        ].map((p) => (
          <div key={p.name} className="bg-white border-2 border-ink p-3 flex justify-between items-center shadow-brutal-sm">
            <span className="font-bold">{p.name}</span>
            <span className={`px-2 py-0.5 border border-ink font-bold ${p.ok ? 'bg-mint' : 'bg-yellow'}`}>
              {p.ok ? 'CONNECTED' : 'NEEDS SETUP'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
export default ApiManagementPage;
