import React, { useState } from 'react';
import { Phone, ShieldAlert, CheckCircle2, MessageSquare, Plus, Send, AlertTriangle } from 'lucide-react';

export const WhatsAppPage: React.FC = () => {
  const [unknownContactAction, setUnknownContactAction] = useState('ask');

  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-mint text-ink text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Phone className="w-3.5 h-3.5" />
            <span>OFFICIAL WHATSAPP BUSINESS PLATFORM</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">WhatsApp Communications Manager</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Controlled communications via Meta Cloud API. No unofficial web scraping. Incoming messages route through webhook, drafts require owner approval before sending.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost text-xs">Verify Webhook</button>
          <button className="btn-coral text-xs">Sync Conversations</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Rules & Security */}
        <div className="space-y-4">
          <div className="bg-white border-3 border-ink p-4 shadow-brutal">
            <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 mb-3">
              UNKNOWN CONTACT POLICY
            </h3>
            <p className="text-xs text-ink-muted mb-3">
              Pudhusa yaaradhu unknown number-la message panna enna pannanum?
            </p>
            <div className="space-y-2 text-xs font-bold">
              {[
                { id: 'notify', label: '1. Notify only (No reply)' },
                { id: 'draft', label: '2. Karen drafts reply (No auto-send)' },
                { id: 'ask', label: '3. Ask owner approval before send' },
                { id: 'auto', label: '4. Permitted introductory template' },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className="flex items-center gap-2 p-2 border border-ink bg-cream-50 hover:bg-cream-100 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="unknownPolicy"
                    checked={unknownContactAction === opt.id}
                    onChange={() => setUnknownContactAction(opt.id)}
                    className="accent-coral"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-yellow/20 border-3 border-ink p-4 shadow-brutal text-xs">
            <div className="flex items-center gap-2 font-black mb-1">
              <AlertTriangle className="w-4 h-4 text-ink" />
              <span>PLATFORM RESTRICTIONS NOTICE</span>
            </div>
            <p className="text-ink/80 leading-relaxed text-[11px]">
              WhatsApp Cloud API enforces a 24-hour customer service window for free-form replies. Messages outside the window require approved template messages.
            </p>
          </div>
        </div>

        {/* Right Columns: Active Conversations / Approvals Queue */}
        <div className="md:col-span-2 space-y-4">
          <div className="bg-white border-3 border-ink p-4 shadow-brutal">
            <div className="flex items-center justify-between border-b-2 border-ink pb-2 mb-3">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-coral" />
                DRAFT & APPROVAL QUEUE
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 border border-ink bg-yellow font-bold">
                1 PENDING
              </span>
            </div>

            <div className="p-3 border-2 border-ink bg-cream-100 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span>From: +91 98765 43210 (Demo Contact)</span>
                <span className="text-[10px] font-mono text-ink-muted">Today 18:30</span>
              </div>
              <p className="text-xs bg-white p-2 border border-ink font-mono">
                "Hello, presentation slides ready aacha?"
              </p>
              <div className="text-xs font-bold text-coral">
                Karen Suggested Draft (Thanglish):
              </div>
              <p className="text-xs bg-cream-50 p-2 border border-ink italic">
                "Yes, slides almost ready! Review mudichutu tonight send panren."
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button className="px-3 py-1 bg-white border-2 border-ink text-xs font-bold hover:bg-cream-200">
                  Edit Draft
                </button>
                <button className="px-3 py-1 bg-coral text-white border-2 border-ink text-xs font-bold shadow-brutal-sm hover:bg-coral-600 flex items-center gap-1">
                  <Send className="w-3.5 h-3.5" />
                  Approve & Send
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white border-3 border-ink p-4 shadow-brutal">
            <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 mb-3">
              CONFIGURATION PARAMETERS
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-2 border border-ink bg-cream-50">
                <span className="text-ink-muted block text-[10px]">PHONE NUMBER ID</span>
                <span className="font-bold">Not configured (Check .env)</span>
              </div>
              <div className="p-2 border border-ink bg-cream-50">
                <span className="text-ink-muted block text-[10px]">WEBHOOK STATUS</span>
                <span className="font-bold text-mint">LISTENING /api/telegram/webhook</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default WhatsAppPage;
