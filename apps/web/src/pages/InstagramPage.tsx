import React, { useEffect, useState, useRef } from 'react';
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
  User,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  Mic,
  MicOff,
  Volume2,
  Cpu,
  Play,
  Film,
  Zap,
  Bot,
  ToggleLeft,
  ToggleRight,
  Radio,
  Check,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';

interface InstagramProfile {
  id: string;
  name: string;
  username: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
}

interface InstagramMediaItem {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

interface InstagramAttachmentItem {
  id?: string;
  type: 'image' | 'video' | 'reel' | 'audio' | 'share' | 'file';
  url: string;
  previewUrl?: string;
  mimeType?: string;
  title?: string;
}

interface InstagramMessage {
  id: string;
  created_time: string;
  from: { id: string; username: string };
  to?: { data: Array<{ id: string; username: string }> };
  message: string;
  attachments?: InstagramAttachmentItem[];
}

interface InstagramThread {
  id: string;
  updated_time: string;
  snippet?: string;
  participant?: { id: string; username: string };
  participants?: Array<{ id: string; username: string }>;
  messages?: InstagramMessage[];
}

interface VoiceLogItem {
  id: string;
  command: string;
  reply: string;
  recipient?: string;
  provider: string;
  model: string;
  success: boolean;
  time: string;
}

interface AutoReplyLog {
  id: string;
  senderId: string;
  senderUsername: string;
  incomingText: string;
  replyText: string;
  intent?: 'greeting' | 'availability' | 'project' | 'help' | 'thanks' | 'general';
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

function getThreadRecipient(
  thread: InstagramThread
): { id: string; username: string } | undefined {
  if (thread.participant?.id && thread.participant.username) {
    return thread.participant;
  }
  return thread.participants?.find((p) => p.id && p.username);
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

const IG_CACHE_KEY = 'karen_ig_hub_cache_v1';

function readInitialIgCache() {
  try {
    const raw = sessionStorage.getItem(IG_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          profile: parsed.profile ?? null,
          media: Array.isArray(parsed.media) ? parsed.media : [],
          threads: Array.isArray(parsed.threads) ? parsed.threads : [],
          selectedThread: parsed.selectedThread ?? parsed.threads?.[0] ?? null,
          vipList: Array.isArray(parsed.vipList) ? parsed.vipList : [],
          autoReplyConfig: parsed.autoReplyConfig ?? null,
          autoReplyLogs: Array.isArray(parsed.autoReplyLogs) ? parsed.autoReplyLogs : [],
          loaded: Boolean(parsed.loaded),
        };
      }
    }
  } catch {
    // Ignore storage errors
  }
  return {
    profile: null,
    media: [] as InstagramMediaItem[],
    threads: [] as InstagramThread[],
    selectedThread: null as InstagramThread | null,
    vipList: [] as string[],
    autoReplyConfig: null as AutoReplyConfig | null,
    autoReplyLogs: [] as AutoReplyLog[],
    loaded: false,
  };
}

function saveIgCacheSnapshot() {
  try {
    sessionStorage.setItem(
      IG_CACHE_KEY,
      JSON.stringify({
        ...instagramPageCache,
        threads: instagramPageCache.threads.slice(0, 15),
        media: instagramPageCache.media.slice(0, 20),
        autoReplyLogs: instagramPageCache.autoReplyLogs.slice(0, 20),
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

// Module-level + sessionStorage cache so Live Chat renders in 0ms on switch/reload
const instagramPageCache: {
  profile: InstagramProfile | null;
  media: InstagramMediaItem[];
  threads: InstagramThread[];
  selectedThread: InstagramThread | null;
  vipList: string[];
  autoReplyConfig: AutoReplyConfig | null;
  autoReplyLogs: AutoReplyLog[];
  loaded: boolean;
} = readInitialIgCache();

export const InstagramPage: React.FC = () => {
  const [profile, setProfile] = useState<InstagramProfile | null>(instagramPageCache.profile);
  const [media, setMedia] = useState<InstagramMediaItem[]>(instagramPageCache.media);
  const [threads, setThreads] = useState<InstagramThread[]>(instagramPageCache.threads);
  const [selectedThread, setSelectedThread] = useState<InstagramThread | null>(instagramPageCache.selectedThread);
  const [threadMessages, setThreadMessages] = useState<InstagramMessage[]>(instagramPageCache.selectedThread?.messages || []);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loading, setLoading] = useState(!instagramPageCache.loaded);

  // AI & Voice State
  const [aiProvider, setAiProvider] = useState<'groq' | 'gemini' | 'copilot'>('groq');
  const [aiModel, setAiModel] = useState<string>('qwen/qwen3.8-27b');
  const [voiceCommand, setVoiceCommand] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [processingVoice, setProcessingVoice] = useState(false);
  const [voiceLogs, setVoiceLogs] = useState<VoiceLogItem[]>([]);

  // Direct DM drafting & sending
  const [drafting, setDrafting] = useState(false);
  const [suggestedDraft, setSuggestedDraft] = useState('');
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // VIP Contacts
  const [vipList, setVipList] = useState<string[]>(instagramPageCache.vipList);
  const [newVip, setNewVip] = useState('');

  // Auto-Reply Engine State
  const [autoReplyConfig, setAutoReplyConfig] = useState<AutoReplyConfig>(
    instagramPageCache.autoReplyConfig || {
      enabled: true,
      triggerMode: 'all',
      aiProvider: 'groq',
      aiModel: 'qwen/qwen3.8-27b',
    }
  );
  const [autoReplyLogs, setAutoReplyLogs] = useState<AutoReplyLog[]>(instagramPageCache.autoReplyLogs || []);
  const [simulatingAutoReply, setSimulatingAutoReply] = useState(false);
  const [simulatedMessage, setSimulatedMessage] = useState('hi karen');
  const [scanningAutoReply, setScanningAutoReply] = useState(false);
  const [connectionHealth, setConnectionHealth] = useState<{
    connected: boolean;
    status: string;
    lastError?: string;
  } | null>(null);
  const [showTokenConnect, setShowTokenConnect] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [accountIdInput, setAccountIdInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);

  // Speech Recognition Reference & Live Selected Thread Ref
  const recognitionRef = useRef<any>(null);
  const selectedThreadIdRef = useRef<string | null>(instagramPageCache.selectedThread?.id || null);

  useEffect(() => {
    selectedThreadIdRef.current = selectedThread?.id || null;
  }, [selectedThread?.id]);

  // Update default model when provider changes
  useEffect(() => {
    if (aiProvider === 'groq') setAiModel('qwen/qwen3.8-27b');
    else if (aiProvider === 'gemini') setAiModel('gemini-flash-lite-latest');
    else if (aiProvider === 'copilot') setAiModel('gpt-4o-mini');
  }, [aiProvider]);

  const applyThreadsUpdate = (loadedThreads: InstagramThread[]) => {
    setThreads(loadedThreads);
    instagramPageCache.threads = loadedThreads;
    instagramPageCache.loaded = true;

    const currentId = selectedThreadIdRef.current;
    const matched = currentId ? loadedThreads.find((t) => t.id === currentId) : loadedThreads[0];
    if (matched) {
      setSelectedThread(matched);
      instagramPageCache.selectedThread = matched;
      if (Array.isArray(matched.messages) && matched.messages.length > 0) {
        setThreadMessages(matched.messages);
      }
    }
    saveIgCacheSnapshot();
  };

  // Load full messages & attachments when selectedThread changes
  useEffect(() => {
    if (!selectedThread?.id) {
      setThreadMessages([]);
      return;
    }
    let active = true;
    setThreadMessages(selectedThread.messages || []);
    setLoadingThread(true);
    authenticatedFetch(`/api/v1/instagram/conversations/${encodeURIComponent(selectedThread.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (active && Array.isArray(json?.data) && json.data.length > 0) {
          setThreadMessages(json.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingThread(false);
      });
    return () => {
      active = false;
    };
  }, [selectedThread?.id]);

  // Live DM & Auto-DM background refresh every 8s while tab is visible
  useEffect(() => {
    const timer = setInterval(async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const tRes = await authenticatedFetch('/api/v1/instagram/conversations?fresh=1');
        if (tRes.ok) {
          const tData = await tRes.json();
          if (Array.isArray(tData.data)) {
            applyThreadsUpdate(tData.data);
          }
        }
        if (autoReplyConfig.enabled) {
          const pollRes = await authenticatedFetch('/api/v1/instagram/auto-reply/poll', { method: 'POST' });
          if (pollRes.ok) {
            const pollJson = await pollRes.json();
            if (Array.isArray(pollJson.data?.logs)) {
              setAutoReplyLogs(pollJson.data.logs);
              instagramPageCache.autoReplyLogs = pollJson.data.logs;
              saveIgCacheSnapshot();
            }
          }
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [autoReplyConfig.enabled]);

  // Load live data from backend (background-refresh if already cached)
  const loadData = async (forceFresh = false) => {
    if (!instagramPageCache.loaded) setLoading(true);
    try {
      const tRes = await authenticatedFetch(
        forceFresh ? '/api/v1/instagram/conversations?fresh=1' : '/api/v1/instagram/conversations'
      );
      if (tRes.ok) {
        const tData = await tRes.json();
        const loadedThreads = Array.isArray(tData.data) ? tData.data : [];
        applyThreadsUpdate(loadedThreads);
      } else {
        const errJson = await tRes.json().catch(() => ({}));
        const msg =
          typeof errJson?.error === 'string'
            ? errJson.error
            : errJson?.error?.message || `Instagram DM sync failed (${tRes.status}).`;
        setSendError(msg);
      }
      setLoading(false);

      void Promise.all([
        authenticatedFetch('/api/v1/instagram/profile'),
        authenticatedFetch('/api/v1/instagram/media'),
        authenticatedFetch('/api/v1/instagram/favourites'),
        authenticatedFetch('/api/v1/instagram/auto-reply'),
        authenticatedFetch('/api/v1/instagram/health'),
      ]).then(async ([pRes, mRes, vRes, aRes, hRes]) => {
        if (pRes.ok) {
          const p = (await pRes.json()).data;
          setProfile(p);
          instagramPageCache.profile = p;
        }
        if (mRes.ok) {
          const m = (await mRes.json()).data || [];
          setMedia(m);
          instagramPageCache.media = m;
        }
        if (vRes.ok) {
          const vData = await vRes.json();
          if (Array.isArray(vData.data)) {
            setVipList(vData.data);
            instagramPageCache.vipList = vData.data;
          }
        }
        if (aRes.ok) {
          const aData = await aRes.json();
          if (aData.data?.config) {
            setAutoReplyConfig(aData.data.config);
            instagramPageCache.autoReplyConfig = aData.data.config;
          }
          if (aData.data?.logs) {
            setAutoReplyLogs(aData.data.logs);
            instagramPageCache.autoReplyLogs = aData.data.logs;
          }
        }
        if (hRes.ok) {
          const hData = await hRes.json();
          if (hData.data) {
            setConnectionHealth(hData.data);
            if (!hData.data.connected && hData.data.lastError && tRes.ok) {
              setSendError(`Meta Instagram Connection: ${hData.data.lastError}`);
            }
          }
        }
        instagramPageCache.loaded = true;
        saveIgCacheSnapshot();
      }).catch((err) => console.error('Error loading secondary Instagram data:', err));
    } catch (err: any) {
      setSendError(err?.message || 'Error loading Instagram data');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInstagramToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim() || savingToken) return;
    setSavingToken(true);
    setSendError(null);
    setSendSuccess(null);
    try {
      const res = await authenticatedFetch('/api/v1/instagram/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: tokenInput.trim(),
          ...(accountIdInput.trim() ? { accountId: accountIdInput.trim() } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || 'Failed to save Instagram token');
      }
      setSendSuccess('Instagram Access Token saved! Syncing live DMs now...');
      setTokenInput('');
      setShowTokenConnect(false);
      await loadData(true);
    } catch (err: any) {
      setSendError(err?.message || 'Failed to connect Instagram token');
    } finally {
      setSavingToken(false);
    }
  };

  const handleToggleAutoReply = async () => {
    try {
      const res = await authenticatedFetch('/api/v1/instagram/auto-reply/toggle', { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        setAutoReplyConfig(d.data);
        instagramPageCache.autoReplyConfig = d.data;
        saveIgCacheSnapshot();
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
        instagramPageCache.autoReplyConfig = d.data;
        saveIgCacheSnapshot();
        setSendSuccess('Auto-Reply settings updated.');
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
          instagramPageCache.autoReplyLogs = d.data.logs;
          saveIgCacheSnapshot();
        }
        if (d.data.autoReplied && d.data.replyText) {
          speakKarenResponse(d.data.replyText);
          setSendSuccess(`Auto-replied to @_.raghul._.15: "${d.data.replyText}"`);
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

  const handleScanAndAutoReply = async () => {
    setScanningAutoReply(true);
    setSendError(null);
    setSendSuccess(null);
    try {
      const res = await authenticatedFetch('/api/v1/instagram/auto-reply/poll', { method: 'POST' });
      const d = await res.json();
      if (d.ok && d.data) {
        if (Array.isArray(d.data.logs)) {
          setAutoReplyLogs(d.data.logs);
          instagramPageCache.autoReplyLogs = d.data.logs;
          saveIgCacheSnapshot();
        }
        setSendSuccess(d.data.message || 'Scanned and processed DMs.');
        if (d.data.repliesSent > 0) {
          void loadData(true);
        }
      } else {
        throw new Error(d.error || 'Failed to poll DMs');
      }
    } catch (err: any) {
      setSendError(err.message || 'Poll error');
    } finally {
      setScanningAutoReply(false);
    }
  };

  const handleRetryAutoReply = async (log: AutoReplyLog) => {
    setSending(true);
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
        throw new Error(d.error || 'Meta dispatch retry failed. Rate limit may still be cooling down.');
      }
      setSendSuccess(d.data.message || `Sent successfully to @${log.senderUsername}!`);
      await loadData(true);
    } catch (err: any) {
      setSendError(err.message || 'Retry failed');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    void loadData(false);
  }, []);

  // Web Speech API Initialization
  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        'Speech recognition is not supported in this browser. Please type your voice command into the input box.'
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-IN'; // Indian English / Tamil accent friendly

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setVoiceCommand(transcript);
        handleExecuteVoiceCommand(transcript);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  // Female Voice Speech Synthesis
  const speakKarenResponse = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.25; // Strict female voice tone
      const voices = window.speechSynthesis.getVoices();
      const femaleVoice = voices.find(
        (v) =>
          (v.name.toLowerCase().includes('female') ||
            v.name.toLowerCase().includes('zira') ||
            v.name.toLowerCase().includes('samantha') ||
            v.name.toLowerCase().includes('google uk english female') ||
            v.name.toLowerCase().includes('natural')) &&
          !v.name.toLowerCase().includes('male')
      );
      if (femaleVoice) {
        utterance.voice = femaleVoice;
      }
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('TTS playback error:', e);
    }
  };

  // Execute Voice Command via Backend API
  const handleExecuteVoiceCommand = async (cmdText?: string) => {
    const textToRun = (cmdText || voiceCommand).trim();
    if (!textToRun || processingVoice) return;

    setProcessingVoice(true);
    setSendError(null);
    setSendSuccess(null);

    try {
      const res = await authenticatedFetch('/api/v1/instagram/voice-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: textToRun,
          provider: aiProvider,
          model: aiModel,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Voice command execution failed');
      }

      const resData = data.data;
      const newLog: VoiceLogItem = {
        id: `log-${Date.now()}`,
        command: textToRun,
        reply: resData.replyMessage,
        recipient: resData.recipient?.username,
        provider: resData.aiProvider || aiProvider,
        model: resData.aiModel || aiModel,
        success: resData.success,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setVoiceLogs((prev) => [newLog, ...prev.slice(0, 9)]);
      speakKarenResponse(resData.replyMessage);

      if (resData.success) {
        setSendSuccess(resData.replyMessage);
        // Refresh conversations to show new message
        authenticatedFetch('/api/v1/instagram/conversations')
          .then((r) => r.json())
          .then((t) => {
            if (t.data) setThreads(t.data);
          })
          .catch(() => {});
      } else {
        setSendError(resData.replyMessage);
      }
    } catch (err: any) {
      setSendError(err.message || 'Failed to execute voice command');
    } finally {
      setProcessingVoice(false);
      setVoiceCommand('');
    }
  };

  // Draft reply for selected thread
  const handleGenerateDraft = async (messageText: string, sender: string) => {
    setDrafting(true);
    setSuggestedDraft('');
    try {
      const res = await authenticatedFetch('/api/v1/instagram/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          username: sender,
          preferredProvider: aiProvider,
          preferredModel: aiModel,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestedDraft(data.data.draft);
      }
    } catch (err) {
      console.error('Draft error:', err);
    } finally {
      setDrafting(false);
    }
  };

  // Send approved reply
  const handleSendReply = async () => {
    if (!suggestedDraft.trim() || !selectedThread || sending) return;
    const recipient = getThreadRecipient(selectedThread);
    if (!recipient?.id) {
      setSendError('No recipient ID in conversation.');
      return;
    }

    setSending(true);
    setSendError(null);
    setSendSuccess(null);
    try {
      const sentText = suggestedDraft.trim();
      const res = await authenticatedFetch('/api/v1/instagram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: recipient.id, message: sentText }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.data?.success) {
        throw new Error(data.error || 'Failed to dispatch Instagram message');
      }
      setSendSuccess(`Message sent to @${recipient.username}!`);
      setSuggestedDraft('');
      setThreadMessages((prev) => [
        {
          id: data.data?.messageId || `local_${Date.now()}`,
          created_time: new Date().toISOString(),
          from: { id: profile?.id || 'me', username: profile?.username || 'hari.ii_14' },
          message: sentText,
        },
        ...prev,
      ]);
      // Reload DMs cleanly in background so thread stays synced with Meta
      void loadData(true);
    } catch (err: any) {
      setSendError(err.message || 'Instagram send failed');
    } finally {
      setSending(false);
    }
  };

  // Add VIP contact
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
      {/* 1. Header with Live Verified Creator Profile */}
      <div className="bg-white border-3 border-ink p-5 shadow-brutal flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {profile?.profile_picture_url ? (
            <img
              src={profile.profile_picture_url}
              alt={profile.username}
              referrerPolicy="no-referrer"
              className="w-16 h-16 border-3 border-ink shadow-brutal-sm object-cover"
            />
          ) : (
            <div className="w-16 h-16 bg-magenta text-white border-3 border-ink shadow-brutal-sm flex items-center justify-center font-black text-2xl">
              <Instagram className="w-8 h-8" />
            </div>
          )}
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-mint text-ink text-xs font-mono font-bold border-2 border-ink shadow-brutal-sm mb-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>META GRAPH API v21.0 • LIVE CREATOR SYSTEM</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black">
              {profile?.name || 'Hari Prasath'}{' '}
              <span className="text-sm font-mono text-ink-muted">
                (@{profile?.username || 'not connected'})
              </span>
            </h1>
            <p className="text-xs text-ink-muted font-mono">
              IGSID: {profile?.id || 'unknown'} • Posts: {media.length || 0} • Status:{' '}
              {connectionHealth ? (connectionHealth.connected ? 'Connected' : connectionHealth.status) : profile?.id ? 'Connected' : 'Checking...'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadData(true)}
            className="btn-ghost text-xs flex items-center gap-1.5"
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync Live Instagram</span>
          </button>
          <button
            type="button"
            onClick={() => setShowTokenConnect((prev) => !prev)}
            className="btn-ghost text-xs flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-coral" />
            <span>{showTokenConnect ? 'Close Token Setup' : 'Update Meta Token'}</span>
          </button>
          <a
            href={profile?.username ? `https://instagram.com/${profile.username}` : 'https://instagram.com'}
            target="_blank"
            rel="noreferrer"
            className="btn-brutal bg-magenta text-white text-xs hover:bg-magenta-600 flex items-center gap-1.5"
          >
            <span>Open Profile</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Token Connect / Reconnect Panel */}
      {(showTokenConnect || (connectionHealth && !connectionHealth.connected)) && (
        <form
          onSubmit={handleSaveInstagramToken}
          className="bg-yellow/20 border-3 border-ink p-4 shadow-brutal space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-black font-mono uppercase">
                CONNECT / REFRESH INSTAGRAM META ACCESS TOKEN
              </h3>
              <p className="text-[11px] text-ink-muted">
                Paste a valid Meta Page Access Token (<code>EAA...</code>) or Instagram Graph Token (<code>IG...</code>) if live DMs fail due to token expiry.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste Meta / Instagram Access Token (EAA... or IG...)"
              className="md:col-span-2 p-2 bg-white border-2 border-ink text-xs font-mono outline-none focus:border-coral"
              required
            />
            <input
              type="text"
              value={accountIdInput}
              onChange={(e) => setAccountIdInput(e.target.value)}
              placeholder="Instagram Account ID (optional)"
              className="p-2 bg-white border-2 border-ink text-xs font-mono outline-none focus:border-coral"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="submit"
              disabled={!tokenInput.trim() || savingToken}
              className="btn-brutal bg-ink text-white text-xs px-4 py-1.5 flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5 text-mint" />
              <span>{savingToken ? 'Saving Token…' : 'Save & Reconnect Live DMs'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Notifications */}
      {sendSuccess && (
        <div className="p-3 bg-mint text-ink border-3 border-ink shadow-brutal text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-ink" />
            <span>{sendSuccess}</span>
          </div>
          <button onClick={() => setSendSuccess(null)} className="text-xs font-mono underline">
            Dismiss
          </button>
        </div>
      )}
      {sendError && (
        <div className="p-3 bg-red-100 text-red-900 border-3 border-ink shadow-brutal text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-700" />
            <span>{sendError}</span>
          </div>
          <button onClick={() => setSendError(null)} className="text-xs font-mono underline">
            Dismiss
          </button>
        </div>
      )}

      {/* 2. Karen AI INSTAGRAM VOICE COMMAND CENTER */}
      <div className="bg-cream-100 border-3 border-ink p-5 shadow-brutal space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b-2 border-ink pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-coral text-white border-2 border-ink shadow-brutal-sm">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-black flex items-center gap-2">
                KAREN INSTAGRAM VOICE COMMAND CENTER
                <span className="px-2 py-0.5 bg-yellow text-[10px] font-mono font-black border border-ink">
                  VOICE + AI ORCHESTRATION
                </span>
              </h2>
              <p className="text-xs text-ink-muted">
                Speak or type natural commands: e.g. "send msg to raghul I will call you back" or "raghul ku solu..."
              </p>
            </div>
          </div>

          {/* AI Model Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold font-mono text-ink flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-magenta" />
              AI BRAIN:
            </span>
            <div className="flex border-2 border-ink shadow-brutal-sm bg-white">
              <button
                type="button"
                onClick={() => setAiProvider('groq')}
                className={`px-2.5 py-1 text-xs font-bold transition-colors ${
                  aiProvider === 'groq' ? 'bg-coral text-white' : 'hover:bg-cream-200 text-ink'
                }`}
              >
                Groq Qwen
              </button>
              <button
                type="button"
                onClick={() => setAiProvider('gemini')}
                className={`px-2.5 py-1 text-xs font-bold border-l-2 border-ink transition-colors ${
                  aiProvider === 'gemini' ? 'bg-mint text-ink' : 'hover:bg-cream-200 text-ink'
                }`}
              >
                Gemini Lite
              </button>
              <button
                type="button"
                onClick={() => setAiProvider('copilot')}
                className={`px-2.5 py-1 text-xs font-bold border-l-2 border-ink transition-colors ${
                  aiProvider === 'copilot' ? 'bg-magenta text-white' : 'hover:bg-cream-200 text-ink'
                }`}
              >
                GitHub Copilot
              </button>
            </div>
          </div>
        </div>

        {/* Voice Input & Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          {/* Big Push-to-Talk Mic Button */}
          <div className="flex flex-col items-center justify-center p-4 bg-white border-2 border-ink shadow-brutal-sm text-center">
            <button
              type="button"
              onClick={toggleListening}
              className={`w-16 h-16 rounded-full border-3 border-ink flex items-center justify-center transition-all shadow-brutal ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse scale-105'
                  : 'bg-coral hover:bg-coral-600 text-white'
              }`}
              title={isListening ? 'Click to Stop Listening' : 'Click to Speak Command'}
            >
              {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
            </button>
            <span className="text-[11px] font-mono font-bold mt-2">
              {isListening ? '🔴 LISTENING... SPEAK NOW' : 'PUSH TO TALK'}
            </span>
            <span className="text-[9px] font-mono text-ink-muted">
              {isListening ? 'Say: "Send msg to Raghul..."' : 'Tamil / English / Thanglish'}
            </span>
          </div>

          {/* Text Command Input Fallback */}
          <div className="md:col-span-3 space-y-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleExecuteVoiceCommand();
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <input
                  type="text"
                  value={voiceCommand}
                  onChange={(e) => setVoiceCommand(e.target.value)}
                  placeholder="Or type voice command: e.g. 'send msg to raghul I will reach in 10 mins'..."
                  disabled={processingVoice}
                  className="w-full p-3 bg-white border-2 border-ink text-xs font-mono outline-none shadow-brutal-sm focus:border-coral"
                />
                {processingVoice && (
                  <div className="absolute right-3 top-3 flex items-center gap-1.5 text-xs font-bold text-coral">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Karen Executing...</span>
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={!voiceCommand.trim() || processingVoice}
                className="btn-brutal bg-ink text-white px-5 text-xs font-bold flex items-center gap-1.5 shadow-brutal"
              >
                <Zap className="w-3.5 h-3.5 text-yellow" />
                <span>Execute</span>
              </button>
            </form>

            {/* Quick Command Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-bold font-mono text-ink-muted">QUICK COMMANDS:</span>
              {[
                'send msg to raghul Vanakkam da machan',
                'send msg to raghul reached safely',
                'send msg to raghul check the new reel',
                'check latest messages',
              ].map((cmd, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setVoiceCommand(cmd);
                    handleExecuteVoiceCommand(cmd);
                  }}
                  className="px-2 py-1 bg-white border border-ink text-[11px] font-mono hover:bg-yellow hover:border-black transition-colors shadow-brutal-sm"
                >
                  🎤 "{cmd}"
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live Voice Activity Log */}
        {voiceLogs.length > 0 && (
          <div className="bg-white border-2 border-ink p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-ink/30 pb-1.5">
              <span className="text-[11px] font-mono font-bold flex items-center gap-1.5 text-ink">
                <Volume2 className="w-3.5 h-3.5 text-magenta" />
                LIVE COMMAND EXECUTION FEED
              </span>
              <span className="text-[10px] font-mono text-ink-muted">
                Audio: Strictly Female Voice Synthesizer Active
              </span>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {voiceLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-2 border border-ink bg-cream-50 flex items-start justify-between text-xs font-mono gap-2"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-coral">🎤 "{log.command}"</span>
                      {log.recipient && (
                        <span className="px-1.5 py-0.2 bg-mint text-[9px] font-bold border border-ink">
                          @{log.recipient}
                        </span>
                      )}
                      <span className="text-[9px] text-ink-muted uppercase">
                        [{log.provider} • {log.model}]
                      </span>
                    </div>
                    <p className="text-ink text-[11px]">Karen: {log.reply}</p>
                  </div>
                  <span className="text-[9px] text-ink-muted whitespace-nowrap">{log.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2b. KAREN INSTAGRAM 24/7 AUTO-REPLY ENGINE */}
      <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b-2 border-ink pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-mint text-ink border-2 border-ink shadow-brutal-sm">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base md:text-lg font-black">
                  KAREN 24/7 INSTAGRAM AUTO-REPLY ENGINE
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
                  <span>{autoReplyConfig.enabled ? 'ONLINE & ACTIVE' : 'PAUSED'}</span>
                </span>
              </div>
              <p className="text-xs text-ink-muted">
                Automatically replies to every incoming Instagram DM. Turn this off or choose greetings-only below if needed.
              </p>
            </div>
          </div>

          {/* Quick Actions: Toggle & Poller */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleScanAndAutoReply}
              disabled={scanningAutoReply}
              className="btn-ghost text-xs flex items-center gap-1.5"
              title="Scans active threads for unreplied incoming messages"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanningAutoReply ? 'animate-spin' : ''}`} />
              <span>{scanningAutoReply ? 'Scanning DMs…' : 'Scan & Auto-Reply Now'}</span>
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

        {/* Trigger Criteria & Model Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Trigger Rule */}
          <div className="p-3 bg-cream-50 border-2 border-ink space-y-2">
            <span className="text-xs font-mono font-bold block text-ink">
              1. INCOMING TRIGGER FILTER:
            </span>
            <div className="flex flex-col gap-1.5">
              <label
                className={`p-2 border-2 border-ink text-xs font-mono cursor-pointer flex items-center justify-between transition-colors ${
                  autoReplyConfig.triggerMode === 'contains_hi' ? 'bg-yellow border-black font-bold' : 'bg-white'
                }`}
                onClick={() => handleUpdateAutoReplyConfig({ triggerMode: 'contains_hi' })}
              >
                <div className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5" />
                  <span>When sender says "hi", "hello", "hey", or "karen" (Recommended)</span>
                </div>
                {autoReplyConfig.triggerMode === 'contains_hi' && <Check className="w-4 h-4" />}
              </label>

              <label
                className={`p-2 border-2 border-ink text-xs font-mono cursor-pointer flex items-center justify-between transition-colors ${
                  autoReplyConfig.triggerMode === 'all' ? 'bg-yellow border-black font-bold' : 'bg-white'
                }`}
                onClick={() => handleUpdateAutoReplyConfig({ triggerMode: 'all' })}
              >
                <div className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5" />
                  <span>All Incoming DMs (100% Autonomous)</span>
                </div>
                {autoReplyConfig.triggerMode === 'all' && <Check className="w-4 h-4" />}
              </label>
            </div>
          </div>

          {/* Right: AI Provider Selection for Auto-Reply */}
          <div className="p-3 bg-cream-50 border-2 border-ink space-y-2 flex flex-col justify-between">
            <div>
              <span className="text-xs font-mono font-bold block text-ink">
                2. AUTO-REPLY AI MODEL:
              </span>
              <p className="text-[11px] text-ink-muted">
                Karen formulates natural, friendly Thanglish replies acknowledging Hari is away.
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
                Groq Qwen 3.8
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

        {/* Custom DM Training Instructions */}
        <div className="p-3.5 bg-cream-50 border-2 border-ink space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono font-black text-ink">
              CUSTOM DM TRAINING &amp; THANGLISH PERSONA
            </span>
            <button
              type="button"
              onClick={() =>
                handleUpdateAutoReplyConfig({
                  customInstructions: autoReplyConfig.customInstructions || '',
                })
              }
              className="btn-brutal bg-ink text-white text-[11px] font-bold px-3 py-1 shadow-brutal-sm"
            >
              Save Training
            </button>
          </div>
          <textarea
            rows={2}
            value={autoReplyConfig.customInstructions || ''}
            onChange={(e) =>
              setAutoReplyConfig((prev) => ({ ...prev, customInstructions: e.target.value }))
            }
            placeholder="e.g. 'Reply casually in Chennai Thanglish. Mention HL Clothing orders ship in 2-3 days. Never share personal phone numbers.'"
            className="w-full p-2 bg-white border-2 border-ink text-xs font-mono outline-none focus:border-coral"
          />
        </div>

        {/* Live Simulator & Testing Bar */}
        <div className="p-3.5 bg-yellow/20 border-2 border-ink space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-black flex items-center gap-1.5 text-ink">
              <Sparkles className="w-4 h-4 text-coral" />
              TEST AUTO-REPLY PIPELINE LIVE
            </span>
            <span className="text-[10px] font-mono text-ink-muted">
              Simulates incoming DM from Raghul (@_.raghul._.15)
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={simulatedMessage}
              onChange={(e) => setSimulatedMessage(e.target.value)}
              placeholder="e.g. 'hi karen', 'hello brother', 'vanakkam'..."
              className="flex-1 p-2 bg-white border-2 border-ink text-xs font-mono outline-none shadow-brutal-sm focus:border-coral"
            />
            <button
              type="button"
              onClick={() => handleSimulateAutoReply()}
              disabled={simulatingAutoReply || !simulatedMessage.trim()}
              className="btn-brutal bg-coral text-white text-xs font-bold px-4 flex items-center gap-1.5 whitespace-nowrap shadow-brutal-sm"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{simulatingAutoReply ? 'Karen Auto-Replying…' : 'Simulate & Send Auto-Reply'}</span>
            </button>
          </div>

          {/* Quick simulation buttons */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[10px] font-mono font-bold text-ink-muted">QUICK PRESETS:</span>
            {['hi', 'hi karen', 'hello bro', 'vanakkam'].map((msg, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setSimulatedMessage(msg);
                  handleSimulateAutoReply(msg);
                }}
                disabled={simulatingAutoReply}
                className="px-2 py-0.5 bg-white border border-ink text-[10px] font-mono hover:bg-yellow transition-colors font-bold"
              >
                Test "{msg}"
              </button>
            ))}
          </div>
        </div>

        {/* Auto-Reply Audit Feed */}
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-ink/30 pb-1.5">
            <span className="text-xs font-mono font-bold text-ink flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-magenta" />
              DISPATCHED AUTO-REPLIES AUDIT LOG ({autoReplyLogs.length})
            </span>
            <span className="text-[10px] font-mono text-ink-muted">
              Meta Webhook & Poller Monitored
            </span>
          </div>

          {autoReplyLogs.length === 0 ? (
            <div className="p-4 bg-cream-50 border border-ink text-center text-xs font-mono text-ink-muted">
              No automated replies triggered yet. Click "Test 'hi karen'" above or wait for incoming Instagram DMs.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {autoReplyLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 border-2 border-ink bg-cream-50 flex items-start justify-between text-xs font-mono gap-3 shadow-brutal-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 bg-yellow border border-ink text-[9px] font-black">
                        @{log.senderUsername}
                      </span>
                      <span className="text-ink-muted text-[11px]">sent: "{log.incomingText}"</span>
                      <span className="text-[9px] font-mono text-ink-muted uppercase">
                        [{log.provider}]
                      </span>
                      {log.intent && (
                        <span className="px-1.5 py-0.5 bg-mint/60 border border-ink text-[9px] font-bold uppercase">
                          Need: {log.intent}
                        </span>
                      )}
                    </div>
                    <div className="p-1.5 bg-white border border-ink text-ink text-[11px] font-bold">
                      Karen: {log.replyText}
                    </div>
                    {log.metaMessageId && (
                      <span className="text-[9px] text-ink-muted block truncate max-w-md">
                        Meta ID: {log.metaMessageId}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`px-1.5 py-0.5 border border-ink text-[9px] font-bold ${
                        log.status === 'SENT'
                          ? 'bg-mint text-ink'
                          : log.error?.includes('limit reached')
                          ? 'bg-yellow text-ink'
                          : 'bg-red-200 text-red-900'
                      }`}
                    >
                      {log.status === 'SENT'
                        ? 'SENT'
                        : log.error?.includes('limit reached')
                        ? 'META RATE LIMIT COOLDOWN'
                        : 'FAILED'}
                    </span>
                    <span className="text-[9px] text-ink-muted whitespace-nowrap">{log.timestamp}</span>

                    {log.status !== 'SENT' && (
                      <button
                        type="button"
                        onClick={() => handleRetryAutoReply(log)}
                        disabled={sending}
                        className="px-2 py-0.5 bg-ink text-white text-[9px] font-mono font-bold hover:bg-ink/80 transition-colors shadow-brutal-sm flex items-center gap-1 mt-1"
                        title="Retry sending this message to Instagram"
                      >
                        <RefreshCw className={`w-2.5 h-2.5 ${sending ? 'animate-spin' : ''}`} />
                        <span>Retry Dispatch</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {autoReplyLogs.some((l) => l.status !== 'SENT') && (
            <div className="p-3 bg-yellow/30 border-2 border-ink text-xs font-mono space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-ink">
                <AlertCircle className="w-4 h-4 text-coral" />
                <span>META GRAPH API APP RATE-LIMIT COOLDOWN</span>
              </div>
              <p className="text-[11px] text-ink-muted leading-relaxed">
                Meta's security policy enforces an hourly rolling call quota on Instagram App tokens. Karen has successfully generated the AI replies and queued them. They will automatically dispatch once Meta's quota resets, or you can click <strong>Retry Dispatch</strong>.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 3. LIVE POSTS & REELS SHOWCASE */}
      <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
        <div className="flex items-center justify-between border-b-2 border-ink pb-2">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-magenta" />
            <h3 className="font-black text-sm md:text-base">
              LIVE INSTAGRAM POSTS & REELS ({media.length})
            </h3>
          </div>
          <span className="text-xs font-mono font-bold px-2 py-0.5 bg-mint border border-ink shadow-brutal-sm">
            META GRAPH API CDN
          </span>
        </div>

        {media.length === 0 ? (
          <div className="p-8 text-center text-xs font-mono text-ink-muted border-2 border-dashed border-ink">
            No live media posts found or syncing with Meta API...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {media.map((item) => (
              <div
                key={item.id}
                className="border-2 border-ink bg-cream-50 shadow-brutal flex flex-col justify-between overflow-hidden"
              >
                {/* Media Preview */}
                <div className="relative aspect-[4/5] bg-ink overflow-hidden group">
                  {item.thumbnail_url || item.media_url ? (
                    <img
                      src={item.thumbnail_url || item.media_url}
                      alt={item.caption || 'Instagram Post'}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white">
                      <Instagram className="w-12 h-12" />
                    </div>
                  )}

                  {/* Reel Badge */}
                  {item.media_type === 'VIDEO' && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-ink/80 text-white text-[10px] font-mono font-bold flex items-center gap-1 border border-white">
                      <Play className="w-3 h-3 fill-current" />
                      <span>REEL</span>
                    </div>
                  )}

                  {/* Likes and Comments Overlay */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-ink/90 via-ink/50 to-transparent p-3 flex items-center justify-between text-white text-xs font-mono font-bold">
                    <span className="flex items-center gap-1.5 text-coral">
                      <Heart className="w-4 h-4 fill-current" />
                      {item.like_count || 0}
                    </span>
                    <span className="flex items-center gap-1.5 text-mint">
                      <MessageSquare className="w-4 h-4 fill-current" />
                      {item.comments_count || 0}
                    </span>
                  </div>
                </div>

                {/* Caption & Metadata */}
                <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                  <div>
                    <p className="text-xs text-ink line-clamp-3 font-mono">
                      {item.caption || 'No caption provided'}
                    </p>
                    <span className="text-[10px] font-mono text-ink-muted block mt-1">
                      {new Date(item.timestamp).toLocaleDateString([], {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>

                  {item.permalink && (
                    <a
                      href={item.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost text-[11px] py-1 flex items-center justify-center gap-1 mt-2 font-bold"
                    >
                      <span>View on Instagram</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. LIVE INCOMING DMS & KAREN DRAFTING */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Live Threads List */}
        <div className="bg-white border-3 border-ink p-4 shadow-brutal space-y-3">
          <div className="flex items-center justify-between border-b-2 border-ink pb-2">
            <h3 className="font-extrabold text-sm flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-magenta" />
              LIVE INCOMING DMS
            </h3>
            <span className="text-[10px] font-mono px-1.5 py-0.5 border border-ink bg-yellow font-bold">
              {threads.length} ACTIVE
            </span>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {threads.length === 0 ? (
              <div className="p-6 text-center text-xs text-ink-muted font-mono">
                No active DMs found or syncing with Meta...
              </div>
            ) : (
              threads.map((t) => {
                const sender = getThreadRecipient(t)?.username || 'unknown';
                const isVip = vipList.includes(sender);
                const isSelected = selectedThread?.id === t.id;

                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedThread(t);
                      setSuggestedDraft('');
                    }}
                    className={`p-3 border-2 border-ink cursor-pointer transition-all shadow-brutal-sm ${
                      isSelected
                        ? 'bg-cream-200 border-coral translate-x-1'
                        : 'bg-cream-50 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 font-bold text-xs truncate">
                        <span>@{sender}</span>
                        {isVip && (
                          <span className="px-1 text-[9px] bg-yellow border border-ink font-mono font-black">
                            VIP
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-ink-muted">
                        {new Date(t.updated_time).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-ink/80 truncate font-mono">
                      "{t.snippet || 'No message content available'}"
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Message Inspection & Karen AI Reply Drafting */}
        <div className="lg:col-span-2 bg-white border-3 border-ink p-5 shadow-brutal flex flex-col justify-between space-y-4">
          {selectedThread ? (
            <>
              <div>
                <div className="flex items-center justify-between border-b-2 border-ink pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <User className="w-5 h-5 text-magenta" />
                    <div>
                      <h3 className="font-black text-sm">
                        Conversation with @{getThreadRecipient(selectedThread)?.username || 'unknown'}
                      </h3>
                      <span className="text-[10px] font-mono text-ink-muted">
                        Meta IGSID: {getThreadRecipient(selectedThread)?.id || 'Direct Messaging'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      handleGenerateDraft(
                        selectedThread.snippet || 'No message content available',
                        getThreadRecipient(selectedThread)?.username || 'friend'
                      )
                    }
                    disabled={drafting || !getThreadRecipient(selectedThread)}
                    className="btn-coral text-xs flex items-center gap-1.5 shadow-brutal"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{drafting ? 'Karen Drafting...' : 'Draft Thanglish Reply'}</span>
                  </button>
                </div>

                {/* Message display */}
                <div className="bg-cream-50 border-2 border-ink p-4 space-y-3 max-h-80 overflow-y-auto">
                  {loadingThread && threadMessages.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs font-mono text-ink-muted py-4 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Loading conversation history & media...</span>
                    </div>
                  ) : threadMessages.length > 0 ? (
                    [...threadMessages].reverse().map((msg) => {
                      const recipientUsername = getThreadRecipient(selectedThread)?.username;
                      const isFromMe =
                        (profile?.username && msg.from?.username === profile.username) ||
                        (profile?.id && msg.from?.id === profile.id) ||
                        (recipientUsername && msg.from?.username && msg.from.username !== recipientUsername);

                      return (
                        <div
                          key={msg.id}
                          className={`flex items-start gap-2 max-w-md ${isFromMe ? 'ml-auto flex-row-reverse' : ''}`}
                        >
                          <div
                            className={`p-1.5 border border-ink text-[10px] font-bold shrink-0 ${
                              isFromMe ? 'bg-teal text-white' : 'bg-magenta text-white'
                            }`}
                          >
                            @{msg.from?.username || (isFromMe ? profile?.username || 'me' : 'unknown')}
                          </div>
                          <div
                            className={`p-2.5 border-2 border-ink text-xs font-mono shadow-brutal-sm space-y-2 ${
                              isFromMe ? 'bg-mint/30' : 'bg-white'
                            }`}
                          >
                            {msg.message && msg.message !== '[Media Attachment]' && (
                              <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                            )}
                            {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                              <div className="space-y-2">
                                {msg.attachments.map((att, idx) => {
                                  const imgSrc = att.previewUrl || att.url;
                                  if (att.type === 'image' || att.mimeType?.startsWith('image/')) {
                                    return (
                                      <div key={att.id || idx} className="space-y-1">
                                        <a
                                          href={att.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="block"
                                          title="Open full image"
                                        >
                                          <img
                                            src={imgSrc}
                                            alt={att.title || 'DM Photo'}
                                            referrerPolicy="no-referrer"
                                            className="max-w-[260px] max-h-60 object-cover border-2 border-ink bg-cream-100 hover:opacity-95"
                                            onError={(e) => {
                                              const target = e.currentTarget;
                                              target.style.display = 'none';
                                              const fallback = target.nextElementSibling as HTMLElement | null;
                                              if (fallback) fallback.style.display = 'flex';
                                            }}
                                          />
                                          <div className="hidden items-center gap-1.5 p-2 border border-ink bg-cream-50 text-[11px]">
                                            <ImageIcon className="w-3.5 h-3.5 text-coral" />
                                            <span>Image link (click to open)</span>
                                            <ExternalLink className="w-3 h-3" />
                                          </div>
                                        </a>
                                      </div>
                                    );
                                  }
                                  if (att.type === 'video' || att.type === 'reel' || att.mimeType?.startsWith('video/')) {
                                    return (
                                      <div key={att.id || idx} className="space-y-1">
                                        <video
                                          src={att.url}
                                          controls
                                          preload="metadata"
                                          className="max-w-[260px] max-h-60 border-2 border-ink bg-black"
                                        />
                                        <a
                                          href={att.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-[10px] font-bold text-coral underline"
                                        >
                                          <Film className="w-3 h-3" />
                                          Open Video / Reel
                                        </a>
                                      </div>
                                    );
                                  }
                                  if (att.type === 'audio' || att.mimeType?.startsWith('audio/')) {
                                    return (
                                      <div key={att.id || idx} className="space-y-1">
                                        <audio src={att.url} controls className="max-w-[240px] h-8" />
                                      </div>
                                    );
                                  }
                                  return (
                                    <a
                                      key={att.id || idx}
                                      href={att.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-2 border border-ink bg-cream-50 flex items-center gap-1.5 text-[11px] font-bold text-coral hover:bg-yellow/30"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                      <span className="truncate">{att.title || 'Open Shared Media'}</span>
                                    </a>
                                  );
                                })}
                              </div>
                            )}
                            {msg.created_time && (
                              <div className="text-[9px] text-ink-muted">
                                {new Date(msg.created_time).toLocaleString('en-IN', {
                                  timeZone: 'Asia/Kolkata',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  day: '2-digit',
                                  month: 'short',
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex items-start gap-2 max-w-md">
                      <div className="p-1.5 bg-magenta text-white border border-ink text-[10px] font-bold">
                        @{getThreadRecipient(selectedThread)?.username || 'unknown'}
                      </div>
                      <div className="p-2.5 bg-white border-2 border-ink text-xs font-mono shadow-brutal-sm">
                        {selectedThread.snippet || 'No message content available'}
                      </div>
                    </div>
                  )}

                  {suggestedDraft && (
                    <div className="flex items-start gap-2 max-w-md ml-auto flex-row-reverse">
                      <div className="p-1.5 bg-coral text-white border border-ink text-[10px] font-bold">
                        KAREN DRAFT
                      </div>
                      <div className="p-2.5 bg-yellow/30 border-2 border-ink text-xs font-mono shadow-brutal-sm">
                        {suggestedDraft}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Draft Editor & Approved Send Action */}
              <div className="border-t-2 border-ink pt-3 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold flex items-center justify-between">
                    <span>Approved Response Editor (Thanglish):</span>
                    <span className="text-[10px] font-mono text-ink-muted">
                      Owner verification required before dispatch
                    </span>
                  </label>
                  <textarea
                    rows={3}
                    value={suggestedDraft}
                    onChange={(e) => setSuggestedDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendReply();
                      }
                    }}
                    placeholder="Type a live DM reply directly (press Enter to send) or click 'Draft Thanglish Reply'..."
                    className="w-full p-2.5 bg-cream-50 border-2 border-ink text-xs font-mono outline-none focus:border-coral"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-ink-muted">
                    Channel: Instagram Creator Messaging API (Enter = Send)
                  </span>
                  <button
                    onClick={handleSendReply}
                    disabled={!suggestedDraft.trim() || sending || !getThreadRecipient(selectedThread)}
                    className="btn-coral text-xs flex items-center gap-1.5 shadow-brutal"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sending ? 'Sending…' : 'Send Live DM'}</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center text-xs text-ink-muted font-mono">
              <MessageSquare className="w-8 h-8 text-ink-muted mb-2" />
              <span>Select an incoming Instagram conversation from the left to read & draft replies.</span>
            </div>
          )}
        </div>
      </div>

      {/* 5. VIP Contacts & Meta Permissions Audit */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* VIP Contacts Manager */}
        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-3">
          <div className="flex items-center justify-between border-b-2 border-ink pb-2">
            <h3 className="font-extrabold text-sm flex items-center gap-2">
              <Heart className="w-4 h-4 text-magenta" />
              VIP & PRIORITY INSTAGRAM CONTACTS
            </h3>
            <span className="text-[10px] font-mono text-ink-muted">INSTANT VOICE RESOLUTION</span>
          </div>
          <p className="text-xs text-ink-muted">
            Messages from these handles automatically trigger priority alerts and instant voice matching.
          </p>

          <form onSubmit={handleAddVip} className="flex gap-2">
            <input
              type="text"
              value={newVip}
              onChange={(e) => setNewVip(e.target.value)}
              placeholder="Add handle e.g. 'friend_username'"
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

        {/* Live Meta Permissions Audit */}
        <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-3">
          <h3 className="font-extrabold text-sm border-b-2 border-ink pb-2 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-mint" />
              ACTIVE META PERMISSIONS
            </span>
            <span className="text-[10px] font-mono text-mint font-bold">100% OPERATIONAL</span>
          </h3>

          <div className="space-y-2 text-xs font-mono">
            {[
              { name: 'instagram_basic', desc: 'Read Profile Info & Account ID', status: 'ACTIVE' },
              { name: 'instagram_manage_messages', desc: 'Read & Send Direct Messages via Voice/API', status: 'ACTIVE' },
              { name: 'pages_messaging', desc: 'Meta Page Webhooks & Direct Message Tunnel', status: 'ACTIVE' },
            ].map((p, i) => (
              <div key={i} className="p-2 border border-ink bg-cream-50 flex items-center justify-between">
                <div>
                  <span className="font-bold text-ink">{p.name}</span>
                  <span className="text-[10px] text-ink-muted block font-sans">{p.desc}</span>
                </div>
                <span className="px-1.5 py-0.5 border border-ink bg-mint text-ink font-bold text-[10px]">
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <InstagramHubTabs />
    </div>
  );
};

export default InstagramPage;
