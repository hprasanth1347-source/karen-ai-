import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, Search, RefreshCw, Unplug, ShieldCheck, AlertTriangle, Palette } from 'lucide-react';
import { api } from '../lib/api';
import { useGoogleIntegration } from '../hooks/useGoogleIntegration';

interface BrandSettings {
  brandName: string;
  primaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  tone: string;
}

export const SettingsPage: React.FC = () => {
  const {
    status: googleStatus,
    loading: googleLoading,
    error: googleError,
    refetch: refetchGoogle,
    connect: connectGoogle,
    disconnect: disconnectGoogle,
  } = useGoogleIntegration();
  const [language, setLanguage] = useState('thanglish');
  const [timezone] = useState('Asia/Kolkata (IST)');
  const [defaultAi, setDefaultAi] = useState('groq');
  const [brand, setBrand] = useState<BrandSettings>({
    brandName: 'Hari Prasath / Karen AI',
    primaryColor: '#1E293B',
    accentColor: '#E11D48',
    headingFont: 'Calibri',
    bodyFont: 'Calibri',
    tone: 'Clear, sharp, warm, and practical',
  });
  const [brandSaved, setBrandSaved] = useState('');
  const [searchStatus, setSearchStatus] = useState<{
    configured: boolean;
    working: boolean;
    lastErrorReason: string | null;
    usageToday: number;
    dailyLimit: number;
  } | null>(null);

  useEffect(() => {
    api
      .get('/settings/brand')
      .then((res) => {
        if (res.data?.data) setBrand((prev) => ({ ...prev, ...res.data.data }));
      })
      .catch(() => {});
    api
      .get('/integrations/search-status')
      .then((res) => setSearchStatus(res.data?.data || null))
      .catch(() => {});
  }, []);

  const handleSaveBrand = async () => {
    setBrandSaved('');
    try {
      await api.put('/settings/brand', brand);
      setBrandSaved('Brand settings saved.');
    } catch {
      setBrandSaved('Failed to save brand settings.');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal">
        <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-coral text-white text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
          <SettingsIcon className="w-3.5 h-3.5" />
          <span>SYSTEM PREFERENCES</span>
        </div>
        <h1 className="text-xl md:text-2xl font-black">Settings &amp; Configuration</h1>
        <p className="text-xs text-ink-muted mt-1">
          Configure Karen AI preferences, brand identity for generated documents, and live search diagnostics.
        </p>
      </div>

      <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2">PREFERENCES</h3>
        <div className="space-y-1">
          <label className="text-xs font-bold block">Primary AI Conversation Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-cream-50 border-2 border-ink p-2 text-xs font-bold"
          >
            <option value="thanglish">Thanglish (Tamil in Latin Script) — Default</option>
            <option value="tamil">Tamil (தமிழ்)</option>
            <option value="english">English</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold block">Default Timezone</label>
          <input
            type="text"
            value={timezone}
            disabled
            className="w-full bg-cream-100 border-2 border-ink p-2 text-xs font-mono font-bold text-ink-muted cursor-not-allowed"
          />
          <span className="text-[10px] text-ink-muted">Locked to Asia/Kolkata (+05:30).</span>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold block">Primary AI Provider</label>
          <select
            value={defaultAi}
            onChange={(e) => setDefaultAi(e.target.value)}
            className="w-full bg-cream-50 border-2 border-ink p-2 text-xs font-bold"
          >
            <option value="groq">Groq (Qwen / Llama — High Speed)</option>
            <option value="gemini">Google Gemini Flash (Multimodal &amp; Grounding)</option>
          </select>
        </div>
      </div>

      <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
        <div className="flex items-center gap-2 border-b-2 border-ink pb-2">
          <Palette className="w-4 h-4 text-coral" />
          <h3 className="font-extrabold text-sm">MY BRAND (USED IN DOCS, SLIDES &amp; WRITING)</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold block mb-1">Brand Name</label>
            <input
              type="text"
              value={brand.brandName}
              onChange={(e) => setBrand({ ...brand, brandName: e.target.value })}
              className="w-full bg-cream-50 border-2 border-ink p-2 text-xs font-bold"
            />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1">Tone</label>
            <input
              type="text"
              value={brand.tone}
              onChange={(e) => setBrand({ ...brand, tone: e.target.value })}
              className="w-full bg-cream-50 border-2 border-ink p-2 text-xs font-bold"
            />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1">Primary Color</label>
            <input
              type="text"
              value={brand.primaryColor}
              onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })}
              className="w-full bg-cream-50 border-2 border-ink p-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1">Accent Color</label>
            <input
              type="text"
              value={brand.accentColor}
              onChange={(e) => setBrand({ ...brand, accentColor: e.target.value })}
              className="w-full bg-cream-50 border-2 border-ink p-2 text-xs font-mono"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={handleSaveBrand} className="btn-coral text-xs flex items-center gap-1.5">
            <Save className="w-4 h-4" />
            Save Brand Settings
          </button>
          {brandSaved && <span className="text-xs font-mono font-bold text-ink">{brandSaved}</span>}
        </div>
      </div>

      <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink pb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal" />
            <h3 className="font-extrabold text-sm">GOOGLE ACCOUNT &amp; INTEGRATIONS</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refetchGoogle()}
              className="btn-ghost text-xs flex items-center gap-1"
              disabled={googleLoading}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${googleLoading ? 'animate-spin' : ''}`} />
              Refresh Status
            </button>
            {googleStatus.connected ? (
              <>
                <button
                  type="button"
                  onClick={() => void connectGoogle('drive')}
                  className="btn-teal text-xs"
                >
                  Reconnect / Permissions
                </button>
                <button
                  type="button"
                  onClick={() => void disconnectGoogle()}
                  className="btn-ghost text-xs text-coral flex items-center gap-1"
                >
                  <Unplug className="w-3.5 h-3.5" />
                  Disconnect Google
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void connectGoogle('drive')}
                className="btn-teal text-xs"
              >
                Sign in with Google
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono bg-cream-50 border-2 border-ink p-3">
          <div>
            <span className="text-ink-muted">Google Account:</span>{' '}
            <strong className={googleStatus.connected ? 'text-teal' : 'text-coral'}>
              {googleLoading ? 'Checking...' : googleStatus.connected ? 'Connected' : googleStatus.googleStatus === 'needs_reauth' ? 'Reconnection Required' : 'Disconnected'}
            </strong>
          </div>
          <div>
            <span className="text-ink-muted">Email:</span>{' '}
            <strong>{googleStatus.googleEmail || '—'}</strong>
          </div>
          <div>
            <span className="text-ink-muted">Last Connected:</span>{' '}
            <strong>
              {googleStatus.connectedAt
                ? new Date(googleStatus.connectedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                : '—'}
            </strong>
          </div>
          <div>
            <span className="text-ink-muted">Refresh Token:</span>{' '}
            <strong>{googleStatus.hasRefreshToken ? 'Stored (Auto-Refresh Active)' : 'Not Present'}</strong>
          </div>
        </div>

        {googleError && (
          <div className="p-2.5 border-2 border-ink bg-coral/15 text-coral text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{googleError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {([
            ['drive', 'Google Drive'],
            ['gmail', 'Gmail'],
            ['calendar', 'Google Calendar'],
            ['sheets', 'Google Sheets'],
            ['contacts', 'Google Contacts'],
            ['classroom', 'Google Classroom'],
          ] as const).map(([key, label]) => {
            const svc = googleStatus.services[key];
            const badge = svc.connected
              ? 'bg-teal text-white'
              : svc.status === 'permission_required'
                ? 'bg-yellow text-ink'
                : 'bg-cream-200 text-ink-muted';
            const statusText = svc.connected
              ? 'Connected'
              : svc.status === 'permission_required'
                ? 'Permission Required'
                : svc.status === 'error'
                  ? 'Error'
                  : 'Disconnected';
            return (
              <div key={key} className="border-2 border-ink p-2.5 bg-white flex flex-col justify-between gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{label}</span>
                  <span className={`px-1.5 py-0.5 text-[10px] font-mono font-bold border border-ink ${badge}`}>
                    {statusText}
                  </span>
                </div>
                {svc.error && !svc.connected && (
                  <p className="text-[10px] text-ink-muted">{svc.error}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-2">
        <div className="flex items-center gap-2 border-b-2 border-ink pb-2">
          <Search className="w-4 h-4 text-coral" />
          <h3 className="font-extrabold text-sm">LIVE WEB SEARCH DIAGNOSTICS</h3>
        </div>
        {searchStatus ? (
          <div className="text-xs font-mono space-y-1">
            <div>Configured: {searchStatus.configured ? 'Yes' : 'No'} | Working: {searchStatus.working ? 'Yes' : 'No'}</div>
            <div>Quota Used Today: {searchStatus.usageToday} / {searchStatus.dailyLimit}</div>
            {searchStatus.lastErrorReason && <div className="text-red-700">Error: {searchStatus.lastErrorReason}</div>}
          </div>
        ) : (
          <div className="text-xs font-mono text-ink-muted">Checking search status...</div>
        )}
        <p className="text-[11px] text-ink-muted">
          Checklist: enable <strong>Search the entire web</strong> in Google Programmable Search Engine (CX), verify API key restrictions, and keep daily usage within budget.
        </p>
      </div>
    </div>
  );
};
export default SettingsPage;
