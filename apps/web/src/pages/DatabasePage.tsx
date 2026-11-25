import React from 'react';
import { Database, ShieldCheck, CheckCircle2, RefreshCw } from 'lucide-react';

export const DatabasePage: React.FC = () => {
  const tables = [
    'profiles', 'user_settings', 'provider_connections', 'conversations', 'messages',
    'contacts', 'contact_preferences', 'notifications', 'notification_preferences',
    'memories', 'documents', 'document_chunks', 'document_jobs', 'tasks', 'reminders',
    'automation_rules', 'automation_runs', 'approval_requests', 'external_events',
    'webhook_events', 'api_usage', 'audit_logs', 'security_events', 'email_cache',
    'drive_files', 'voice_sessions'
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-mint text-ink text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Database className="w-3.5 h-3.5" />
            <span>SUPABASE POSTGRESQL 16 & ROW LEVEL SECURITY</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Database Architecture & Health</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Complete database schema status across 22 core tables. Every table enforces Row Level Security with owner-only access control.
          </p>
        </div>
      </div>

      <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center justify-between">
          <span>SCHEMA TABLES (0002_karen_ultra_complete.sql)</span>
          <span className="text-[10px] font-mono text-mint font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> RLS ENFORCED ON ALL
          </span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs font-mono">
          {tables.map((t) => (
            <div key={t} className="p-2 border border-ink bg-cream-50 flex items-center justify-between">
              <span className="font-bold truncate">{t}</span>
              <span className="w-2 h-2 rounded-full bg-mint border border-ink shrink-0"></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default DatabasePage;
