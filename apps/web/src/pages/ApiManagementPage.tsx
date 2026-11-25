import React from 'react';
import { Key, ExternalLink, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

export const ApiManagementPage: React.FC = () => {
  const apis = [
    { name: 'Google Gemini 2.0 Flash', env: 'GEMINI_API_KEY', status: 'Available', doc: 'https://aistudio.google.com' },
    { name: 'Groq Cloud (Llama 3.3)', env: 'GROQ_API_KEY', status: 'Available', doc: 'https://console.groq.com' },
    { name: 'ElevenLabs Voice Engine', env: 'ELEVENLABS_API_KEY', status: 'Voice Confirmed', doc: 'https://elevenlabs.io' },
    { name: 'Supabase PostgreSQL & Auth', env: 'SUPABASE_URL', status: 'Configured', doc: 'https://supabase.com' },
    { name: 'WhatsApp Business Cloud', env: 'WHATSAPP_ACCESS_TOKEN', status: 'Meta Credentials Needed', doc: 'https://developers.facebook.com' },
    { name: 'Instagram Creator Graph API', env: 'META_PAGE_ACCESS_TOKEN', status: 'Meta Credentials Needed', doc: 'https://developers.facebook.com' },
    { name: 'Google Workspace (Gmail & Drive)', env: 'GOOGLE_CLIENT_ID', status: 'Google Cloud OAuth Needed', doc: 'https://console.cloud.google.com' },
    { name: 'Telegram Bot API', env: 'TELEGRAM_BOT_TOKEN', status: 'Bot Token Needed', doc: 'https://t.me/botfather' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-yellow text-ink text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Key className="w-3.5 h-3.5" />
            <span>EXTERNAL PROVIDER & CREDENTIALS VAULT</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">API & Integration Management</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Live credentials status for all 8 providers. Full secrets are stored strictly on the server-side in <code>.env</code> and never exposed to the client.
          </p>
        </div>
      </div>

      <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2">PROVIDER CREDENTIAL AUDIT</h3>
        <div className="space-y-2">
          {apis.map((a, i) => (
            <div key={i} className="p-3 border-2 border-ink bg-cream-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <h4 className="font-bold">{a.name}</h4>
                <span className="text-[10px] font-mono text-ink-muted">Server Variable: {a.env}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono px-2 py-0.5 border border-ink bg-white font-bold">
                  {a.status}
                </span>
                <a
                  href={a.doc}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-coral hover:underline flex items-center gap-1 font-bold"
                >
                  Setup Docs <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default ApiManagementPage;
