import React from 'react';
import { Send, ShieldCheck, CheckCircle2, AlertTriangle, Key, Terminal } from 'lucide-react';

export const TelegramPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2 py-0.5 bg-teal text-white text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-2">
            <Send className="w-3.5 h-3.5" />
            <span>TELEGRAM BOT API • OWNER-ONLY TUNNEL</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black">Telegram Remote Assistant Tunnel</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-xl">
            Control Karen remotely on the go. Send voice notes or texts on Telegram to ask questions, manage tasks, get email summaries, and approve pending actions.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pairing Instructions */}
        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-3">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center gap-2">
            <Key className="w-4 h-4 text-teal" />
            SECURE PAIRING SETUP
          </h3>
          <ol className="list-decimal list-inside space-y-2 text-xs text-ink/80 leading-relaxed">
            <li>Create your private bot using <code className="font-mono bg-cream-200 px-1 border border-ink">@BotFather</code> on Telegram.</li>
            <li>Copy the Bot Token into <code className="font-mono bg-cream-200 px-1 border border-ink">TELEGRAM_BOT_TOKEN</code> in <code className="font-mono">.env</code>.</li>
            <li>Get your personal Telegram user ID (via <code className="font-mono bg-cream-200 px-1 border border-ink">@userinfobot</code>) and add to <code className="font-mono">TELEGRAM_OWNER_CHAT_ID</code>.</li>
            <li>All messages from non-owner IDs will be rejected automatically.</li>
          </ol>
        </div>

        {/* Supported Commands */}
        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-3">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-coral" />
            SUPPORTED BOT COMMANDS
          </h3>
          <div className="space-y-2 text-xs font-mono">
            {[
              { cmd: '/status', desc: 'Get health report of Karen & integrations' },
              { cmd: '/digest', desc: 'Receive unread emails & urgent deadlines' },
              { cmd: '/task <name>', desc: 'Quickly create a task in IST timezone' },
              { cmd: '/approve <id>', desc: 'Approve a pending WhatsApp or email draft' },
              { cmd: '/reject <id>', desc: 'Cancel a pending automated send' },
            ].map((c, i) => (
              <div key={i} className="p-2 border border-ink bg-cream-50 flex items-center justify-between">
                <span className="font-bold text-coral">{c.cmd}</span>
                <span className="text-[11px] text-ink-muted">{c.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
export default TelegramPage;
