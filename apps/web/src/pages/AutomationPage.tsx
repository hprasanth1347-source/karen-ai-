import React, { useState } from 'react';
import { Cpu, Plus, Play, ShieldAlert, CheckCircle2 } from 'lucide-react';

export const AutomationPage: React.FC = () => {
  const [rules, setRules] = useState([
    { id: '1', name: 'Important Email Action Extractor', trigger: 'Gmail Received', action: 'Create Task + Notify', permission: 'notify', status: 'ACTIVE' },
    { id: '2', name: 'VIP WhatsApp Message Auto-Draft', trigger: 'WhatsApp Message (VIP)', action: 'Draft Thanglish Reply', permission: 'draft', status: 'ACTIVE' },
    { id: '3', name: 'Daily Morning Briefing (08:30 IST)', trigger: 'Cron 08:30 IST', action: 'Generate Daily Digest', permission: 'auto', status: 'ACTIVE' },
  ]);

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-electric text-white text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Cpu className="w-3.5 h-3.5" />
            <span>CONTROLLED AUTOMATION & BACKGROUND ENGINE</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Automation Centre</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Rule-based workflows with strictly bounded permissions: Notify only, Draft only, Ask before action, or Owner-authorized limited actions. No unrestricted shell scripts.
          </p>
        </div>
        <button className="btn-coral text-xs flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create Automation Rule
        </button>
      </div>

      <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2">ACTIVE AUTOMATION RULES</h3>
        <div className="space-y-3">
          {rules.map((r) => (
            <div key={r.id} className="p-3 border-2 border-ink bg-cream-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold">{r.name}</h4>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 border border-ink bg-mint text-ink font-bold">
                    {r.status}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-ink-muted mt-1">
                  Trigger: <span className="text-ink font-semibold">{r.trigger}</span> ➜ Action: <span className="text-ink font-semibold">{r.action}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 border border-ink bg-white font-bold">
                  LEVEL: {r.permission}
                </span>
                <button className="px-2 py-1 border border-ink bg-cream-200 text-[10px] font-bold hover:bg-cream-300">
                  Run Now
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default AutomationPage;
