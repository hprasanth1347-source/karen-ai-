import React from 'react';
import { Mail, CheckCircle2, AlertCircle, FileText, Send, Sparkles } from 'lucide-react';

export const GmailPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-coral text-white text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Mail className="w-3.5 h-3.5" />
            <span>GOOGLE GMAIL API • OAUTH 2.0</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Gmail Intelligence & Daily Digest</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Read, categorize, summarize emails, extract action deadlines, and prepare AI draft replies. Emails are never silently sent without explicit owner approval.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost text-xs">Run Daily Digest</button>
          <button className="btn-coral text-xs">Fetch Latest Emails</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['Important', 'Personal', 'Work', 'Bills & Receipts', 'Promotions', 'Action Required'].map((cat, i) => (
          <div key={i} className="bg-white border-2 border-ink p-3 shadow-brutal-sm flex justify-between items-center">
            <span className="font-bold text-xs">{cat}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 border border-ink bg-cream-100">
              {i === 0 ? '3 Unread' : i === 3 ? '1 Bill Due' : '0 Pending'}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
        <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center justify-between">
          <span>EMAIL DIGEST & EXTRACTED DEADLINES</span>
          <span className="text-[10px] font-mono text-ink-muted">AI CLASSIFIED</span>
        </h3>

        <div className="space-y-3">
          <div className="p-3 border-2 border-ink bg-cream-50 space-y-2 text-xs">
            <div className="flex items-center justify-between font-bold">
              <span className="text-coral">Amazon Web Services • Cloud Billing Invoice</span>
              <span className="text-[10px] font-mono text-ink-muted">Today 09:15 AM</span>
            </div>
            <p className="text-ink/80 text-[11px]">
              Summary: Monthly cloud bill generated: \$14.20. Payment will be automatically deducted on 25th Nov.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-mint/40 border border-ink">
                ACTION: Logged to Finance Memory
              </span>
            </div>
          </div>

          <div className="p-3 border-2 border-ink bg-cream-50 space-y-2 text-xs">
            <div className="flex items-center justify-between font-bold">
              <span className="text-ink">University Coordinator • Project Review Schedule</span>
              <span className="text-[10px] font-mono text-ink-muted">Yesterday 16:40 PM</span>
            </div>
            <p className="text-ink/80 text-[11px]">
              Summary: Final code review deadline fixed for Friday 3:00 PM IST. Documentation submission required.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-yellow/40 border border-ink">
                DEADLINE: Fri 15:00 IST • Task Created
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default GmailPage;
