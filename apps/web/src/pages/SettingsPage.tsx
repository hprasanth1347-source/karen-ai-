import React, { useState } from 'react';
import { Settings, Save, ShieldCheck } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const [language, setLanguage] = useState('thanglish');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [defaultAi, setDefaultAi] = useState('groq');

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-cream-200 text-ink text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Settings className="w-3.5 h-3.5" />
            <span>OWNER & APPLICATION CONFIGURATION</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">System Settings</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Configure primary language (Thanglish default), regional timezone, active AI engine, and UI preferences.
          </p>
        </div>
      </div>

      <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4 max-w-xl">
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
          <span className="text-[10px] text-ink-muted">Locked to Asia/Kolkata (+05:30) per architecture specification.</span>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold block">Primary AI Provider</label>
          <select
            value={defaultAi}
            onChange={(e) => setDefaultAi(e.target.value)}
            className="w-full bg-cream-50 border-2 border-ink p-2 text-xs font-bold"
          >
            <option value="groq">Groq (Llama 3.3 70B Versatile — High Speed)</option>
            <option value="gemini">Google Gemini 2.0 Flash (Multimodal & Context)</option>
          </select>
        </div>

        <div className="pt-2">
          <button className="btn-coral text-xs flex items-center gap-1.5">
            <Save className="w-4 h-4" />
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
};
export default SettingsPage;
