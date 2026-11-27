import React, { useEffect, useState } from 'react';
import { InstagramHubTabs } from '../components/instagram/InstagramHubTabs';
import { supabase } from '../lib/supabase';
import {
  Instagram,
  ShieldCheck,
  Heart,
  MessageSquare,
  Send,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  Bot,
  ToggleLeft,
  ToggleRight,
  Radio,
  Check,
  Clock,
  AlertTriangle,
  PhoneCall,
  Flame,
  KeyRound,
  X,
} from 'lucide-react';

interface InstagramProfile {
  id: string;
  name: string;
  username: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
}

interface AutoReplyLog {
  id: string;
  senderId: string;
  senderUsername: string;
  incomingText: string;
  replyText: string;
  intent?: 'greeting' | 'availability' | 'project' | 'help' | 'thanks' | 'general';
  urgentCategory?: 'MEDICAL_EMERGENCY' | 'PHONE_REQUEST' | 'URGENT_HELP' | 'MEDIA_OR_STORY' | 'IMPORTANT' | 'NORMAL';
  isEmergency?: boolean;
  metaMessageId?: string;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  timestamp: string;
  provider: string;
  error?: string;
}

interface AutoReplyConfig {
  enabled: boolean;
  triggerMode: 'all' | 'contains_hi';
  customTemplate?: string;
  customInstructions?: string;
  aiProvider: 'groq' | 'gemini' | 'copilot';
  aiModel?: string;
}

async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  let token: string | undefined;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem('karen_auth_session');
      if (raw) {
        token = (JSON.parse(raw) as { accessToken?: string }).accessToken;
      }
    } catch {
      // Ignore storage errors
    }
  }
  if (!token && supabase) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

const IG_CACHE_KEY = 'karen_ig_fast_cache_v3';

function readInitialCache() {
  try {
    const raw = sessionStorage.getItem(IG_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          profile: parsed.profile ?? null,
          vipList: Array.isArray(parsed.vipList) ? parsed.vipList : [],
          autoReplyConfig: parsed.autoReplyConfig ?? null,
          autoReplyLogs: Array.isArray(parsed.autoReplyLogs) ? parsed.autoReplyLogs : [],
          loaded: Boolean(parsed.loaded),
        };
      }
    }
  } catch {
    // Ignore storage quota
  }
  return {
    profile: null,
    vipList: [] as string[],
    autoReplyConfig: null as AutoReplyConfig | null,
    autoReplyLogs: [] as AutoReplyLog[],
    loaded: false,
  };
}

const cachedState = readInitialCache();

export const InstagramPage: React.FC = () => {
  const [profile, setProfile] = useState<InstagramProfile | null>(cachedState.profile);
  const [loading, setLoading] = useState(!cachedState.loaded);

  // VIP Contacts
  const [vipList, setVipList] = useState<string[]>(cachedState.vipList);
  const [newVip, setNewVip] = useState('');

  // Auto-Reply Engine State
  const [autoReplyConfig, setAutoReplyConfig] = useState<AutoReplyConfig>(
    cachedState.autoReplyConfig || {
      enabled: true,
      triggerMode: 'all',
      aiProvider: 'groq',
      aiModel: 'qwen/qwen3.8-27b',
    }
  );
  const [autoReplyLogs, setAutoReplyLogs] = useState<AutoReplyLog[]>(cachedState.autoReplyLogs || []);
  const [simulatingAutoReply, setSimulatingAutoReply] = useState(false);
  const [simulatedMessage, setSimulatedMessage] = useState('hi karen');
  const [scanningAutoReply, setScanningAutoReply] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Meta Token (SUAT) Modal State
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [accountIdInput, setAccountIdInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [tokenModalError, setTokenModalError] = useState<string | null>(null);

  // Ultra-fast data loader: only loads profile & auto-reply data (no heavy thread loading)
  const loadData = async () => {
    try {
      const [pRes, aRes, vRes] = await Promise.all([
        authenticatedFetch('/api/v1/instagram/profile'),
        authenticatedFetch('/api/v1/instagram/auto-reply'),
        authenticatedFetch('/api/v1/instagram/favourites'),
      ]);

      let nextProfile = profile;
      let nextConfig = autoReplyConfig;
      let nextLogs = autoReplyLogs;
      let nextVip = vipList;

      if (pRes.ok) {
        const p = (await pRes.json()).data;
        if (p) {
          nextProfile = p;
          setProfile(p);
        }
      }
      if (aRes.ok) {
        const aData = await aRes.json();
        if (aData.data?.config) {
          nextConfig = aData.data.config;
          setAutoReplyConfig(aData.data.config);
        }
        if (Array.isArray(aData.data?.logs)) {
          nextLogs = aData.data.logs;
          setAutoReplyLogs(aData.data.logs);
        }
      }
      if (vRes.ok) {
        const vData = await vRes.json();
        if (Array.isArray(vData.data)) {
          nextVip = vData.data;
          setVipList(vData.data);
        }
      }

      try {
        sessionStorage.setItem(
          IG_CACHE_KEY,
          JSON.stringify({
            profile: nextProfile,
            vipList: nextVip,
            autoReplyConfig: nextConfig,
            autoReplyLogs: nextLogs,
            loaded: true,
          })
        );
      } catch {
        // Ignore storage quota errors
      }
    } catch (err: any) {
      console.warn('Fast Instagram load notice:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMetaToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim() || savingToken) return;
    setSavingToken(true);
    setTokenModalError(null);
    try {
      const res = await authenticatedFetch('/api/v1/instagram/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: tokenInput.trim(),
          accountId: accountIdInput.trim() || undefined,
          expiresInDays: 365,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        throw new Error(d.error || 'Failed to verify and save Meta token.');
      }
      setShowTokenModal(false);
      setTokenInput('');
      setAccountIdInput('');
      setSendError(null);
      setSendSuccess(
        `Meta Token verified & connected${d.data?.username ? ` (@${d.data.username})` : ''}!`
      );
      void loadData();
    } catch (err: any) {
      setTokenModalError(err.message || 'Invalid token');
    } finally {
      setSavingToken(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Poll for live DMs & auto-replies every 5 seconds when tab is visible
  useEffect(() => {
    const timer = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const autoRes = await authenticatedFetch('/api/v1/instagram/auto-reply');
        if (autoRes.ok) {
          const d = await autoRes.json();
          if (Array.isArray(d.data?.logs)) {
            setAutoReplyLogs(d.data.logs);
          }
        }
      } catch {
        // Ignore background polling errors
      }
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleToggleAutoReply = async () => {
    try {
      const res = await authenticatedFetch('/api/v1/instagram/auto-reply/toggle', { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        setAutoReplyConfig(d.data);
      }
    } catch (err) {
      console.error('Failed to toggle auto-reply:', err);
    }
  };

  const handleUpdateAutoReplyConfig = async (patch: Partial<AutoReplyConfig>) => {
    try {
      const res = await authenticatedFetch('/api/v1/instagram/auto-reply/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const d = await res.json();
        setAutoReplyConfig(d.data);
        setSendSuccess('Auto-Reply configuration saved.');
      }
    } catch (err) {
      console.error('Failed to update auto-reply config:', err);
    }
  };

  const handleSimulateAutoReply = async (customMsg?: string) => {
    const msg = customMsg || simulatedMessage;
    if (!msg.trim() || simulatingAutoReply) return;
    setSimulatingAutoReply(true);
    setSendError(null);
    setSendSuccess(null);
    try {
      const res = await authenticatedFetch('/api/v1/instagram/auto-reply/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          senderUsername: '_.raghul._.15',
          senderId: '1681852029959817',
        }),
      });
      const d = await res.json();
      if (d.ok && d.data) {
        if (Array.isArray(d.data.logs)) {
          setAutoReplyLogs(d.data.logs);
        }
        if (d.data.autoReplied && d.data.replyText) {
          setSendSuccess(`Auto-replied to @_.raghul._.15 in <1s: "${d.data.replyText}"`);
        } else {
          setSendError(
            d.data.error ||
              (d.data.replyText
                ? `Generated reply "${d.data.replyText}", but Meta API dispatch failed.`
                : 'Auto-reply was skipped or Meta send failed.')
          );
        }
      } else {
        throw new Error(d.error || 'Auto-reply simulation failed');
      }
    } catch (err: any) {
      setSendError(err.message || 'Simulation error');
    } finally {
      setSimulatingAutoReply(false);
    }
  };

  const handleScanNow = async () => {
    setScanningAutoReply(true);
    setSendError(null);
    setSendSuccess(null);
    try {
      const res = await authenticatedFetch('/api/v1/instagram/auto-reply/poll', { method: 'POST' });
      const d = await res.json();
      if (d.ok && d.data) {
        if (Array.isArray(d.data.logs)) {
          setAutoReplyLogs(d.data.logs);
        }
        setSendSuccess(d.data.message || 'Checked active DMs. Auto-replies sent.');
      } else {
        throw new Error(d.error || 'Scan failed');
      }
    } catch (err: any) {
      setSendError(err.message || 'Scan error');
    } finally {
      setScanningAutoReply(false);
    }
  };

  const handleRetryDispatch = async (log: AutoReplyLog) => {
    setRetryingId(log.id);
    setSendError(null);
    setSendSuccess(null);
    try {
      const res = await authenticatedFetch('/api/v1/instagram/auto-reply/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: log.senderId,
          senderUsername: log.senderUsername,
          replyText: log.replyText,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        throw new Error(d.error || 'Meta dispatch retry failed.');
      }
      setSendSuccess(d.data.message || `Sent successfully to @${log.senderUsername}!`);
      void loadData();
    } catch (err: any) {
      setSendError(err.message || 'Retry failed');
    } finally {
      setRetryingId(null);
    }
  };

  const handleAddVip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVip.trim() || vipList.includes(newVip.trim())) return;
    const updated = [...vipList, newVip.trim()];
    setVipList(updated);
    authenticatedFetch('/api/v1/instagram/favourites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newVip.trim() }),
    }).catch(console.error);
    setNewVip('');
  };

  return (
    <div className="space-y-6">
      {/* 1. Header with Live Status */}
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {profile?.profile_picture_url ? (
            <img
              src={profile.profile_picture_url}
              alt={profile.username}
              referrerPolicy="no-referrer"
              className="w-14 h-14 border-3 border-ink shadow-brutal-sm object-cover"
            />
          ) : (
            <div className="w-14 h-14 bg-magenta text-white border-3 border-ink shadow-brutal-sm flex items-center justify-center font-black text-xl">
              <Instagram className="w-7 h-7" />
            </div>
          )}
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-mint text-ink text-[11px] font-mono font-bold border-2 border-ink shadow-brutal-sm mb-1">
              <span className="w-2 h-2 rounded-full bg-ink animate-pulse" />
              <span>24/7 AUTONOMOUS AUTO-DM ONLINE</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black">
              {profile?.name || 'Hari Prasath'}{' '}
              <span className="text-sm font-mono text-ink-muted">
                (@{profile?.username || 'hari.ii_14'})
              </span>
            </h1>
            <p className="text-xs text-ink-muted font-mono">
              Meta Graph API v21.0 • Response SLA: &lt;10s • Emergency Alerting via Telegram
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setTokenModalError(null);
              setShowTokenModal(true);
            }}
            className="btn-ghost text-xs flex items-center gap-1.5"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Meta Token</span>
          </button>
          <button
            type="button"
            onClick={() => void loadData()}
            className="btn-ghost text-xs flex items-center gap-1.5"
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Fast Refresh</span>
          </button>
          <a
            href={profile?.username ? `https://instagram.com/${profile.username}` : 'https://instagram.com'}
            target="_blank"
            rel="noreferrer"
            className="btn-brutal bg-magenta text-white text-xs hover:bg-magenta-600 flex items-center gap-1.5"
          >
            <span>Instagram</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Notifications */}
      {sendSuccess && (
        <div className="p-3 bg-mint text-ink border-3 border-ink shadow-brutal text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-ink shrink-0" />
            <span>{sendSuccess}</span>
          </div>
          <button onClick={() => setSendSuccess(null)} className="text-xs font-mono underline">
            Dismiss
          </button>
        </div>
      )}
      {sendError && (
        <div className="p-3 bg-red-100 text-red-900 border-3 border-ink shadow-brutal text-xs font-bold flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
            <span>{sendError}</span>
          </div>
          <div className="flex items-center gap-2">
            {/token|oauth|connect/i.test(sendError) && (
              <button
                type="button"
                onClick={() => {
                  setTokenModalError(null);
                  setShowTokenModal(true);
                }}
                className="px-2.5 py-1 bg-ink text-white text-[11px] font-mono font-bold border border-ink hover:bg-ink/80"
              >
                Update Meta Token
              </button>
            )}
            <button onClick={() => setSendError(null)} className="text-xs font-mono underline">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 2. KAREN 24/7 AUTO-DM ENGINE (Always On) */}
      <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b-2 border-ink pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-mint text-ink border-2 border-ink shadow-brutal-sm">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base md:text-lg font-black">
                  KAREN 24/7 AUTO-DM ENGINE
                </h2>
                <span
                  className={`px-2 py-0.5 text-[10px] font-mono font-black border border-ink flex items-center gap-1 ${
                    autoReplyConfig.enabled ? 'bg-mint text-ink' : 'bg-red-200 text-red-900'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      autoReplyConfig.enabled ? 'bg-ink animate-ping' : 'bg-red-600'
                    }`}
                  />
                  <span>{autoReplyConfig.enabled ? 'ACTIVE 24/7' : 'PAUSED'}</span>
                </span>
              </div>
              <p className="text-xs text-ink-muted">
                Replies automatically in &lt;10 seconds to every incoming DM in natural Chennai Thanglish.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleScanNow}
              disabled={scanningAutoReply}
              className="btn-ghost text-xs flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanningAutoReply ? 'animate-spin' : ''}`} />
              <span>{scanningAutoReply ? 'Scanning DMs…' : 'Scan & Auto-Reply'}</span>
            </button>
            <button
              type="button"
              onClick={handleToggleAutoReply}
              className={`btn-brutal text-xs flex items-center gap-1.5 shadow-brutal-sm ${
                autoReplyConfig.enabled
                  ? 'bg-ink text-white hover:bg-ink/80'
                  : 'bg-mint text-ink hover:bg-mint/80'
              }`}
            >
              {autoReplyConfig.enabled ? (
                <>
                  <ToggleRight className="w-4 h-4 text-mint" />
                  <span>Turn Off</span>
                </>
              ) : (
                <>
                  <ToggleLeft className="w-4 h-4 text-ink-muted" />
                  <span>Turn On</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Trigger Filter & AI Provider */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 bg-cream-50 border-2 border-ink space-y-2">
            <span className="text-xs font-mono font-bold block text-ink">
              1. INCOMING TRIGGER FILTER:
            </span>
            <div className="flex flex-col gap-1.5">
              <label
                className={`p-2 border-2 border-ink text-xs font-mono cursor-pointer flex items-center justify-between transition-colors ${
                  autoReplyConfig.triggerMode === 'all' ? 'bg-yellow border-black font-bold' : 'bg-white'
                }`}
                onClick={() => handleUpdateAutoReplyConfig({ triggerMode: 'all' })}
              >
                <div className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5" />
                  <span>All Incoming DMs (100% Autonomous 24/7)</span>
                </div>
                {autoReplyConfig.triggerMode === 'all' && <Check className="w-4 h-4" />}
              </label>

              <label
                className={`p-2 border-2 border-ink text-xs font-mono cursor-pointer flex items-center justify-between transition-colors ${
                  autoReplyConfig.triggerMode === 'contains_hi' ? 'bg-yellow border-black font-bold' : 'bg-white'
                }`}
                onClick={() => handleUpdateAutoReplyConfig({ triggerMode: 'contains_hi' })}
              >
                <div className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5" />
                  <span>Only when sender says "hi", "hello", "hey", or "karen"</span>
                </div>
                {autoReplyConfig.triggerMode === 'contains_hi' && <Check className="w-4 h-4" />}
              </label>
            </div>
          </div>

          <div className="p-3 bg-cream-50 border-2 border-ink space-y-2 flex flex-col justify-between">
            <div>
              <span className="text-xs font-mono font-bold block text-ink">
                2. AI MODEL SPEED:
              </span>
              <p className="text-[11px] text-ink-muted">
                Fast responses generated in under 1.5 seconds.
              </p>
            </div>
            <div className="flex border-2 border-ink shadow-brutal-sm bg-white">
              <button
                type="button"
                onClick={() => handleUpdateAutoReplyConfig({ aiProvider: 'groq', aiModel: 'qwen/qwen3.8-27b' })}
                className={`flex-1 py-1.5 text-xs font-bold transition-colors ${
                  autoReplyConfig.aiProvider === 'groq' ? 'bg-coral text-white' : 'hover:bg-cream-200 text-ink'
                }`}
              >
                Groq Qwen 3.8 (&lt;1s)
              </button>
              <button
                type="button"
                onClick={() => handleUpdateAutoReplyConfig({ aiProvider: 'gemini', aiModel: 'gemini-flash-lite-latest' })}
                className={`flex-1 py-1.5 text-xs font-bold border-l-2 border-ink transition-colors ${
                  autoReplyConfig.aiProvider === 'gemini' ? 'bg-mint text-ink' : 'hover:bg-cream-200 text-ink'
                }`}
              >
                Gemini Lite
              </button>
              <button
                type="button"
                onClick={() => handleUpdateAutoReplyConfig({ aiProvider: 'copilot', aiModel: 'gpt-4o-mini' })}
                className={`flex-1 py-1.5 text-xs font-bold border-l-2 border-ink transition-colors ${
                  autoReplyConfig.aiProvider === 'copilot' ? 'bg-magenta text-white' : 'hover:bg-cream-200 text-ink'
                }`}
              >
                GitHub Copilot
              </button>
            </div>
          </div>
        </div>

        {/* Live DM Stream Controls */}
        <div className="p-3 bg-mint/20 border-2 border-ink flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-ink">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-mint border border-ink animate-pulse" />
            <span>LIVE INSTAGRAM DM STREAM ACTIVE (AUTO-SYNC EVERY 5s)</span>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="btn-brutal bg-teal text-ink text-xs font-bold px-3 py-1.5 flex items-center gap-1.5 shadow-brutal-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Syncing Live DMs…' : 'Sync Live DMs'}</span>
          </button>
        </div>
      </div>

      {/* 3. LAST INCOMING DMS & AUTO-REPLIED MESSAGES FEED */}
      <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
        <div className="flex items-center justify-between border-b-2 border-ink pb-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-magenta" />
            <h2 className="font-black text-sm md:text-base">
              INCOMING DMS &amp; LAST AUTO-REPLY SENT ({autoReplyLogs.length})
            </h2>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 bg-mint border border-ink font-bold">
            REAL-TIME WEBHOOK STREAM
          </span>
        </div>

        {autoReplyLogs.length === 0 ? (
          <div className="p-8 text-center text-xs font-mono text-ink-muted border-2 border-dashed border-ink bg-cream-50 space-y-2">
            <p className="font-bold text-ink">No incoming DMs recorded yet.</p>
            <p className="text-[11px]">
              Karen is listening 24/7 on Meta Webhooks. As soon as anyone sends an Instagram DM to <strong>@hari.ii_14</strong>, Karen will reply within &lt;10 seconds and the message with Karen's response will appear here immediately.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Highlighted Last Auto-DM Sent */}
            <div className="p-3 bg-mint/25 border-2 border-ink shadow-brutal-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
              <div className="min-w-0">
                <span className="px-1.5 py-0.5 bg-ink text-white text-[10px] font-bold mr-2">LAST AUTO-DM SENT</span>
                <span className="font-bold">@{autoReplyLogs[0].senderUsername}:</span>{' '}
                <span className="text-ink break-words">"{autoReplyLogs[0].replyText}"</span>
              </div>
              <span className="text-[10px] text-ink-muted shrink-0">
                {autoReplyLogs[0].timestamp} • {autoReplyLogs[0].status}
              </span>
            </div>

            {autoReplyLogs.map((log) => {
              const isUrgent = Boolean(log.isEmergency || log.urgentCategory);

              return (
                <div
                  key={log.id}
                  className={`p-4 border-2 border-ink shadow-brutal-sm space-y-2.5 transition-all ${
                    isUrgent ? 'bg-red-50 border-red-700' : 'bg-cream-50'
                  }`}
                >
                  {/* Top Bar: Sender, Category, Emergency Badge, Time */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/20 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-ink text-white text-xs font-mono font-bold">
                        @{log.senderUsername}
                      </span>
                      {log.intent && (
                        <span className="px-1.5 py-0.5 bg-white border border-ink text-[10px] font-mono font-bold uppercase">
                          {log.intent}
                        </span>
                      )}
                      {isUrgent && (
                        <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-mono font-black border border-ink flex items-center gap-1 animate-pulse">
                          {log.urgentCategory === 'MEDICAL_EMERGENCY' ? (
                            <>
                              <Flame className="w-3 h-3" />
                              <span>🚨 MEDICAL EMERGENCY</span>
                            </>
                          ) : log.urgentCategory === 'PHONE_REQUEST' ? (
                            <>
                              <PhoneCall className="w-3 h-3" />
                              <span>📞 PHONE NUMBER REQUEST</span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-3 h-3" />
                              <span>⚠️ URGENT ALERT</span>
                            </>
                          )}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-mono text-ink-muted">
                      <Clock className="w-3 h-3" />
                      <span>{log.timestamp}</span>
                    </div>
                  </div>

                  {/* Message & Reply Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Incoming Message from Sender */}
                    <div className="p-3 bg-white border-2 border-ink space-y-1">
                      <div className="text-[10px] font-mono font-bold text-ink-muted uppercase">
                        Incoming Message from @{log.senderUsername}:
                      </div>
                      <p className="font-mono text-ink font-bold break-words">
                        "{log.incomingText}"
                      </p>
                    </div>

                    {/* Auto-DM Sent back by Karen */}
                    <div className="p-3 bg-mint/20 border-2 border-ink space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                        <span className="text-teal uppercase">Auto-DM Sent by Karen ({log.provider}):</span>
                        <span
                          className={`px-1.5 py-0.2 border border-ink text-[9px] font-bold ${
                            log.status === 'SENT'
                              ? 'bg-mint text-ink'
                              : log.error?.includes('limit reached')
                              ? 'bg-yellow text-ink'
                              : 'bg-red-200 text-red-900'
                          }`}
                        >
                          {log.status === 'SENT'
                            ? 'DISPATCHED'
                            : log.error?.includes('limit reached')
                            ? 'RATE LIMIT COOLDOWN'
                            : 'FAILED'}
                        </span>
                      </div>
                      <p className="font-mono text-ink font-semibold break-words">
                        "{log.replyText}"
                      </p>
                    </div>
                  </div>

                  {/* Delivery footer & Retry */}
                  <div className="flex flex-wrap items-center justify-between text-[10px] font-mono text-ink-muted pt-1">
                    <div>
                      {log.metaMessageId && <span>Meta Message ID: {log.metaMessageId}</span>}
                      {log.error && <span className="text-red-700 font-bold ml-2">Error: {log.error}</span>}
                      {isUrgent && <span className="text-red-700 font-bold ml-2">Telegram notification dispatched to Hari.</span>}
                    </div>

                    {log.status !== 'SENT' && (
                      <button
                        type="button"
                        onClick={() => handleRetryDispatch(log)}
                        disabled={retryingId === log.id}
                        className="px-2.5 py-1 bg-ink text-white font-bold hover:bg-ink/80 transition-colors shadow-brutal-sm flex items-center gap-1"
                      >
                        <RefreshCw className={`w-3 h-3 ${retryingId === log.id ? 'animate-spin' : ''}`} />
                        <span>Retry Dispatch</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. VIP Contacts & 8 Permitted Meta Skills */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-3">
          <div className="flex items-center justify-between border-b-2 border-ink pb-2">
            <h3 className="font-extrabold text-sm flex items-center gap-2">
              <Heart className="w-4 h-4 text-magenta" />
              VIP &amp; PRIORITY CONTACTS
            </h3>
            <span className="text-[10px] font-mono text-ink-muted">PRIORITY NOTIFICATIONS</span>
          </div>

          <form onSubmit={handleAddVip} className="flex gap-2">
            <input
              type="text"
              value={newVip}
              onChange={(e) => setNewVip(e.target.value)}
              placeholder="Add handle e.g. 'raghul'"
              className="flex-1 p-2 bg-cream-50 border-2 border-ink text-xs outline-none"
            />
            <button type="submit" className="btn-ghost text-xs flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" />
              <span>Add VIP</span>
            </button>
          </form>

          <div className="flex flex-wrap gap-2 pt-1">
            {vipList.map((handle) => (
              <span
                key={handle}
                className="px-2.5 py-1 bg-cream-100 border-2 border-ink text-xs font-mono font-bold flex items-center gap-1.5 shadow-brutal-sm"
              >
                <span>@{handle}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-3">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-mint" />
              8 META-PERMITTED INSTAGRAM SKILLS
            </span>
            <span className="text-[10px] font-mono text-mint font-bold px-1.5 py-0.5 bg-ink text-white">8/8 OPERATIONAL</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
            {[
              { name: 'ads_management', desc: 'Manage and optimize Meta Ad campaigns', status: 'ACTIVE' },
              { name: 'ads_read', desc: 'Read ad spend, reach, and conversion analytics', status: 'ACTIVE' },
              { name: 'instagram_basic', desc: 'Read creator profile info, media ID & feed', status: 'ACTIVE' },
              { name: 'instagram_manage_messages', desc: '24/7 Autonomous Auto-DM Engine (<10s)', status: 'ACTIVE' },
              { name: 'instagram_manage_comments', desc: 'Moderate, monitor & auto-reply to comments', status: 'ACTIVE' },
              { name: 'instagram_content_publish', desc: 'Publish Photos, Reels & Stories via API', status: 'ACTIVE' },
              { name: 'instagram_manage_insights', desc: 'Profile reach, impressions & follower stats', status: 'ACTIVE' },
              { name: 'instagram_manage_events', desc: 'Real-time webhook events & note activities', status: 'ACTIVE' },
            ].map((p, i) => (
              <div key={i} className="p-2 border border-ink bg-cream-50 flex items-center justify-between">
                <div>
                  <span className="font-bold text-ink">{p.name}</span>
                  <span className="text-[10px] text-ink-muted block font-sans">{p.desc}</span>
                </div>
                <span className="px-1.5 py-0.5 border border-ink bg-mint text-ink font-bold text-[9px]">
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. INSTAGRAM HUB (Reels Hub, Stories, Publish Content, Account Insights, Ads Manager, Followers, Activity) */}
      <InstagramHubTabs />

      {/* Meta System-User Access Token Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border-3 border-ink shadow-brutal max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b-2 border-ink pb-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-magenta" />
                <h3 className="font-black text-sm">UPDATE META ACCESS TOKEN (SUAT)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTokenModal(false)}
                className="p-1 hover:bg-cream-100 border border-ink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-ink-muted font-mono">
              Paste your Meta System-User Access Token (starts with <code className="bg-cream-100 px-1">EAA...</code> or <code className="bg-cream-100 px-1">IG...</code>). Karen verifies it with Meta Graph API before saving.
            </p>

            {tokenModalError && (
              <div className="p-2.5 bg-red-100 border-2 border-ink text-red-900 text-xs font-bold">
                {tokenModalError}
              </div>
            )}

            <form onSubmit={handleSaveMetaToken} className="space-y-3">
              <div>
                <label className="text-[11px] font-mono font-bold block mb-1">
                  System-User Access Token *
                </label>
                <textarea
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  rows={3}
                  required
                  placeholder="EAA... or IG..."
                  className="w-full p-2 bg-cream-50 border-2 border-ink text-xs font-mono outline-none focus:border-magenta"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono font-bold block mb-1">
                  Instagram Account ID (optional — auto-detected)
                </label>
                <input
                  type="text"
                  value={accountIdInput}
                  onChange={(e) => setAccountIdInput(e.target.value)}
                  placeholder="e.g. 178414..."
                  className="w-full p-2 bg-cream-50 border-2 border-ink text-xs font-mono outline-none focus:border-magenta"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowTokenModal(false)}
                  className="btn-ghost text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingToken || !tokenInput.trim()}
                  className="btn-brutal bg-magenta text-white text-xs font-bold px-4"
                >
                  {savingToken ? 'Verifying…' : 'Verify & Save Token'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstagramPage;
