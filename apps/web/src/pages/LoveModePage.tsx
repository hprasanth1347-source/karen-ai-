import React, { useState, useEffect, useCallback } from 'react';
import { Heart, HeartOff, MessageCircleHeart, Sparkles, Info } from 'lucide-react';
import { api } from '../lib/api';

interface LoveModeState {
  active: boolean;
  activatedAt: string | null;
  messageCount: number;
  conversationContext: string;
}

function formatTimeSince(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function LoveModePage() {
  const [state, setState] = useState<LoveModeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get<{ data: LoveModeState }>('/love-mode/status');
      setState(res.data.data);
      setError(null);
    } catch {
      setError('Could not load Love Mode status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const toggle = async () => {
    const currentlyActive = state?.active ?? false;
    setToggling(true);
    setError(null);
    try {
      const endpoint = currentlyActive ? '/love-mode/deactivate' : '/love-mode/activate';
      const res = await api.post<{ data: LoveModeState }>(endpoint);
      setState(res.data.data);
    } catch {
      setError('Failed to toggle Love Mode. Please try again.');
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xs font-mono text-ink/40 animate-pulse">Loading Love Mode...</div>
      </div>
    );
  }

  const isActive = state?.active ?? false;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-black text-ink flex items-center gap-2">
          <Heart className={`w-6 h-6 ${isActive ? 'text-coral fill-coral' : 'text-ink/30'}`} />
          Love &amp; Comfort Mode
        </h1>
        <p className="text-xs font-mono text-ink/50">
          Girlfriend-style emotional companion — Thanglish + English
        </p>
      </div>

      {error && (
        <div className="p-3 border-2 border-coral bg-coral/10 text-coral text-xs font-bold">
          {error}
        </div>
      )}

      {/* Status card */}
      <div
        className={`border-3 border-ink p-5 shadow-brutal space-y-4 transition-colors ${isActive ? 'bg-pink-50' : 'bg-white'
          }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full border-2 border-ink ${isActive ? 'bg-coral animate-pulse' : 'bg-ink/20'
                  }`}
              />
              <span className="text-sm font-black">
                {isActive ? 'Love Mode Active ❤️' : 'Normal Mode'}
              </span>
            </div>
            {isActive && state?.activatedAt && (
              <p className="text-xs text-ink/50 font-mono">
                Active since {formatTimeSince(state.activatedAt)} · {state.messageCount} messages
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={toggle}
            disabled={toggling}
            className={`flex items-center gap-2 px-4 py-2.5 border-2 border-ink font-black text-xs shadow-brutal transition-all disabled:opacity-60 ${isActive
                ? 'bg-ink text-cream hover:bg-ink/80'
                : 'bg-coral text-white hover:bg-coral/80'
              }`}
          >
            {toggling ? (
              <span className="animate-pulse">...</span>
            ) : isActive ? (
              <>
                <HeartOff className="w-4 h-4" />
                Exit Love Mode
              </>
            ) : (
              <>
                <Heart className="w-4 h-4" />
                Activate Love Mode
              </>
            )}
          </button>
        </div>

        {isActive && (
          <div className="border-t-2 border-ink/10 pt-4 text-xs text-ink/60 space-y-1">
            <p>✦ Listening mode: on. Karen will listen first, ask gentle questions.</p>
            <p>✦ Language: Thanglish + English (adapts to you).</p>
            <p>✦ Exit anytime: type <code className="bg-ink/10 px-1">/endlove</code> or "stop love mode" in Telegram.</p>
          </div>
        )}
      </div>

      {/* Telegram shortcut */}
      <div className="border-2 border-ink p-4 bg-white space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircleHeart className="w-4 h-4 text-ink" />
          <span className="text-xs font-black uppercase tracking-wide">Telegram Commands</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          {[
            ['/love', 'Activate Love Mode'],
            ['/comfort', 'Emotional support'],
            ['/lonely', 'Need company'],
            ['/endlove', 'Exit Love Mode'],
          ].map(([cmd, desc]) => (
            <div key={cmd} className="flex items-start gap-1.5">
              <code className="bg-ink/10 px-1.5 py-0.5 text-ink font-black shrink-0">{cmd}</code>
              <span className="text-ink/50">{desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink/40">
          Natural language also works: "Karen, I feel lonely", "romba kastama irukku", etc.
        </p>
      </div>

      {/* Activation examples */}
      <div className="border-2 border-ink p-4 bg-cream-50 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-ink" />
          <span className="text-xs font-black uppercase tracking-wide">How Karen responds</span>
        </div>
        <div className="space-y-3 text-xs">
          <div className="bg-pink-50 border border-ink/20 p-3 rounded space-y-1">
            <p className="text-ink/40 font-mono">You → Karen</p>
            <p className="font-medium">"today romba kastama irukku. Yaar kittayum solla mudiyala."</p>
          </div>
          <div className="bg-white border border-ink/20 p-3 rounded space-y-1">
            <p className="text-coral font-mono text-[10px]">Karen ❤️</p>
            <p className="font-medium text-ink">
              "Awww 🥺❤️ Enna aachu da? I'm here. Nee en kitta freely pesalam. Don't worry about how to explain it.
              Start wherever you want. Naan listen panren. No judgement, okay?"
            </p>
          </div>
        </div>
      </div>

      {/* Emotional Safety notice */}
      <div className="border-2 border-ink p-4 bg-yellow/20 space-y-2">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-ink" />
          <span className="text-xs font-black uppercase tracking-wide">Emotional Safety</span>
        </div>
        <ul className="text-xs text-ink/60 space-y-1 list-disc list-inside">
          <li>Karen will always encourage real-world support — family, friends, counselors.</li>
          <li>For serious distress or self-harm thoughts, Karen will compassionately direct you to real help.</li>
          <li>iCare helpline (India): <strong>9152987821</strong> · Vandrevala Foundation: <strong>1860-2662-345</strong></li>
          <li>Karen will never shame, manipulate, or make you feel isolated.</li>
        </ul>
      </div>
    </div>
  );
}
