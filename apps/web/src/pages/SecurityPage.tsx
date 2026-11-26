import React, { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { api } from '../lib/api';

export const SecurityPage: React.FC = () => {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api
      .get('/integrations/status')
      .then((res) => setStatus(res.data?.data ?? null))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal">
        <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-mint text-[#0A0A0A] text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
          <Shield className="w-3.5 h-3.5" />
          <span>OWNER-ONLY FAIL-CLOSED SECURITY</span>
        </div>
        <h1 className="text-xl md:text-2xl font-black">Security &amp; Access Controls</h1>
        <p className="text-xs text-ink-muted mt-1">AES-256-GCM token encryption, fail-closed JWT auth, and outbound approval gating.</p>
      </div>

      <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-2 text-xs font-mono">
        <div>Auth Mode: Fail-Closed Supabase JWT + Owner Verification</div>
        <div>Token Encryption: AES-256-GCM (`provider_connections`)</div>
        <div>Google Status: {String(status?.googleStatus || 'checking...')}</div>
        <div>Instagram Status: {String(status?.instagramStatus || 'checking...')}</div>
        <div>Telegram Connected: {status?.telegram ? 'Yes' : 'No'}</div>
      </div>
    </div>
  );
};
export default SecurityPage;
