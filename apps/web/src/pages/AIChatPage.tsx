import React, { useEffect, useRef, useState } from 'react';
import { Send, Bot, User, RefreshCw, Mic, Volume2, ShieldAlert, Check, X, History, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';

type AIProvider = 'gemini' | 'groq' | 'copilot';

interface AIModelOption {
  id: string;
  label: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  provider?: string;
  instagramSend?: {
    recipientId: string;
    username: string;
    message: string;
    status: 'pending' | 'sending' | 'sent' | 'failed';
    error?: string;
  };
  pendingApproval?: {
    id: string;
    summary: string;
    status: 'pending' | 'approved' | 'rejected' | 'submitting' | 'failed';
    error?: string;
  };
  generatedFiles?: Array<{ name: string; url: string; mimeType?: string }>;
  sources?: Array<{ title: string; url: string; displayLink: string }>;
}

interface InstagramConversation {
  id: string;
  participant?: { id: string; username: string };
  participants?: Array<{ id: string; username: string }>;
}

interface ApiEnvelope<T> {
  ok?: boolean;
  error?: string;
  data?: T;
}

function parseInstagramSendCommand(input: string): { recipient: string; message: string } | null {
  if (!/\b(?:instagram|insta|ig)\b/i.test(input)) return null;

  const recipientFirstMatch = input.match(
    /^\s*(?:please\s+)?send\s+(?:an?\s+)?(?:(?:instagram|insta|ig)\s+)?(?:direct\s+message|dm|message|msg|ms)\s+(?:to\s+)?(?:my\s+)?(?:friend\s+)?@?([a-z\d._]+)(?:\s+(?:(?:on|via|through)\s+)?(?:instagram|insta|ig))?\s*(?:(?:saying|that says)\s+|[:,—-]\s*)?(.+?)\s*$/i
  );
  const messageFirstMatch = input.match(
    /^\s*(?:please\s+)?send\s+["“]?(.+?)["”]?\s+to\s+(?:my\s+)?(?:friend\s+)?@?([a-z\d._]+)\s+(?:(?:on|via|through)\s+)?(?:instagram|insta|ig)\b\s*$/i
  );
  const match = recipientFirstMatch
    ? { recipient: recipientFirstMatch[1], message: recipientFirstMatch[2] }
    : messageFirstMatch
      ? { recipient: messageFirstMatch[2], message: messageFirstMatch[1] }
      : null;
  if (!match) return null;

  const message = match.message.trim().replace(/^(?:saying|that says|message is|text is)\s+/i, '');
  return message ? { recipient: match.recipient.replace(/^@/, ''), message } : null;
}

function isInstagramSendIntent(input: string): boolean {
  return /\b(?:send|message|dm|msg)\b/i.test(input) && /\b(?:instagram|insta|ig)\b/i.test(input);
}

function isSendFailureFeedback(input: string): boolean {
  return /\bno\b.*\bnot\s+send\b/i.test(input) || /\b(?:not sent|didn['’]?t send|did not send)\b/i.test(input);
}

function getConversationRecipient(
  conversation: InstagramConversation
): { id: string; username: string } | undefined {
  if (conversation.participant?.id && conversation.participant.username) {
    return conversation.participant;
  }
  return conversation.participants?.find((participant) => participant.id && participant.username);
}

async function readApiData<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(
      `The API returned an empty response (HTTP ${response.status}). Check that the backend is running.`
    );
  }

  let payload: ApiEnvelope<T>;
  try {
    payload = JSON.parse(body) as ApiEnvelope<T>;
  } catch {
    throw new Error(
      `The API returned invalid JSON (HTTP ${response.status}). Check the API server and proxy.`
    );
  }

  if (!response.ok || !payload.ok || payload.data === undefined) {
    throw new Error(payload.error || `API request failed (HTTP ${response.status}).`);
  }
  return payload.data;
}

interface SavedConversation {
  id: string;
  title: string;
  channel: string;
  message_count: number;
  last_message_at: string;
}

const LOCAL_LIBRARY_KEY = 'karen_chat_library_v1';

interface LocalLibraryStore {
  conversations: SavedConversation[];
  messages: Record<string, ChatMessage[]>;
}

function readLocalLibrary(): LocalLibraryStore {
  try {
    const raw = localStorage.getItem(LOCAL_LIBRARY_KEY);
    if (!raw) return { conversations: [], messages: {} };
    const parsed = JSON.parse(raw) as LocalLibraryStore;
    return {
      conversations: Array.isArray(parsed?.conversations) ? parsed.conversations : [],
      messages: parsed?.messages && typeof parsed.messages === 'object' ? parsed.messages : {},
    };
  } catch {
    return { conversations: [], messages: {} };
  }
}

function writeLocalLibrary(store: LocalLibraryStore): void {
  try {
    localStorage.setItem(
      LOCAL_LIBRARY_KEY,
      JSON.stringify({
        conversations: store.conversations.slice(0, 50),
        messages: store.messages,
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export const AIChatPage: React.FC = () => {
  const initialGreeting: ChatMessage = {
    id: '1',
    role: 'assistant',
    content:
      'Vanakkam! Naan ungalloda Karen AI. help eadha chum  venum ma ? Ennala reminders poda mudiyum, emails draft panna mudiyum, documents analyze panna mudiyum, and memory save panna mudiyum.',
    timestamp: 'Just now',
    provider: 'Karen Brain',
  };
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const savedId =
        localStorage.getItem('karen_active_conversation_id') ||
        sessionStorage.getItem('karen_active_conversation_id');
      if (savedId) {
        const local = readLocalLibrary();
        if (local.messages[savedId]?.length) return local.messages[savedId];
      }
    } catch {
      // Ignore
    }
    return [initialGreeting];
  });
  const [conversations, setConversations] = useState<SavedConversation[]>(() => readLocalLibrary().conversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    try {
      return (
        localStorage.getItem('karen_active_conversation_id') ||
        sessionStorage.getItem('karen_active_conversation_id')
      );
    } catch {
      return null;
    }
  });
  const activeConvIdRef = useRef<string | null>(activeConversationId);
  const [libraryOpen, setLibraryOpen] = useState<boolean>(true);
  const [libraryLoading, setLibraryLoading] = useState<boolean>(false);
  const [libraryError, setLibraryError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [saveFailure, setSaveFailure] = useState<{ userText: string; assistantText: string; providerName: string } | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<AIProvider>('groq');
  const [models, setModels] = useState<AIModelOption[]>([]);
  const [model, setModel] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelError, setModelError] = useState('');
  const sendingInstagramMessages = useRef(new Set<string>());
  const sendingLockRef = useRef(false);

  const persistActiveId = (id: string | null) => {
    activeConvIdRef.current = id;
    setActiveConversationId(id);
    try {
      if (id) {
        localStorage.setItem('karen_active_conversation_id', id);
        sessionStorage.setItem('karen_active_conversation_id', id);
      } else {
        localStorage.removeItem('karen_active_conversation_id');
        sessionStorage.removeItem('karen_active_conversation_id');
      }
    } catch {
      // Ignore storage errors
    }
  };

  const saveTurnToLibrary = async (userText: string, assistantText: string, providerName = 'Karen AI') => {
    try {
      setSaveFailure(null);
      let cid = activeConvIdRef.current;
      if (!cid) {
        const created = await api.post<{ ok: boolean; data: SavedConversation }>('/ai/conversations', {
          title: userText.trim().slice(0, 60) || 'New Chat',
        });
        cid = created.data?.data?.id || null;
        if (cid) persistActiveId(cid);
      }
      if (!cid) throw new Error('No conversation ID');
      const clientMsgId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      await api.post(`/ai/conversations/${cid}/messages`, {
        role: 'user',
        content: userText,
        channel: 'web',
        clientMessageId: clientMsgId,
      });
      await api.post(`/ai/conversations/${cid}/messages`, {
        role: 'assistant',
        content: assistantText,
        channel: 'web',
        provider: providerName,
        clientMessageId: `${clientMsgId}-assistant`,
      });
      void loadConversations(false);
    } catch {
      setSaveFailure({ userText, assistantText, providerName });
    }
  };

  const handleSelectConversation = async (id: string) => {
    try {
      const res = await api.get<{
        ok: boolean;
        data: Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; created_at: string; ai_provider?: string; ai_model?: string }>;
      }>(`/ai/conversations/${id}/messages`, { skipCache: true } as any);
      const rows = res.data?.data || [];
      persistActiveId(id);
      if (rows.length > 0) {
        const mapped: ChatMessage[] = rows
          .filter((r) => r.role === 'user' || r.role === 'assistant')
          .map((r) => ({
            id: r.id,
            role: r.role as 'user' | 'assistant',
            content: r.content,
            timestamp: new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            provider: r.ai_provider ? `${r.ai_provider.toUpperCase()}${r.ai_model ? ` · ${r.ai_model}` : ''}` : undefined,
          }));
        setMessages(mapped);
        const store = readLocalLibrary();
        store.messages[id] = mapped;
        writeLocalLibrary(store);
      } else {
        setMessages([initialGreeting]);
      }
    } catch {
      const localMsgs = readLocalLibrary().messages[id];
      if (localMsgs?.length) {
        persistActiveId(id);
        setMessages(localMsgs);
      }
    }
  };

  const loadConversations = async (restoreActive = false, qOverride?: string) => {
    setLibraryLoading(true);
    setLibraryError('');
    try {
      const qVal = (qOverride !== undefined ? qOverride : searchQuery).trim();
      const queryUrl = qVal ? `/ai/conversations?q=${encodeURIComponent(qVal)}` : '/ai/conversations';
      const res = await api.get<{ ok: boolean; data: SavedConversation[] }>(queryUrl, { skipCache: true } as any);
      const serverList = Array.isArray(res.data?.data) ? res.data.data : [];
      if (qVal) {
        setConversations(serverList);
        return;
      }
      const list = [...serverList].sort(
        (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      );
      setConversations(list);
      const localStore = readLocalLibrary();
      localStore.conversations = list;
      writeLocalLibrary(localStore);

      if (restoreActive) {
        const savedId = (() => {
          try {
            return (
              localStorage.getItem('karen_active_conversation_id') ||
              sessionStorage.getItem('karen_active_conversation_id')
            );
          } catch {
            return null;
          }
        })();
        if (savedId && list.some((c) => c.id === savedId)) {
          await handleSelectConversation(savedId);
        } else if (list.length > 0) {
          // Auto-resume latest saved chat so we never spawn a new chat on every reload/menu switch
          await handleSelectConversation(list[0].id);
        }
      }
    } catch (err: any) {
      setLibraryError(err?.response?.data?.error || 'Could not load saved chats.');
    } finally {
      setLibraryLoading(false);
    }
  };

  useEffect(() => {
    void loadConversations(true);
  }, []);

  const handleNewChat = async () => {
    setMessages([initialGreeting]);
    try {
      const res = await api.post<{ ok: boolean; data: SavedConversation }>('/ai/conversations', {
        title: `New Chat (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
      });
      const created = res.data?.data;
      if (created?.id) {
        persistActiveId(created.id);
        setConversations((prev) => {
          const next = [created, ...prev.filter((c) => c.id !== created.id)];
          const store = readLocalLibrary();
          store.conversations = next;
          store.messages[created.id] = [initialGreeting];
          writeLocalLibrary(store);
          return next;
        });
        return;
      }
    } catch {
      // Fallback to clearing active id so first message creates one
    }
    persistActiveId(null);
  };

  const handleDeleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const store = readLocalLibrary();
    store.conversations = store.conversations.filter((c) => c.id !== id);
    delete store.messages[id];
    writeLocalLibrary(store);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      handleNewChat();
    }
    try {
      await api.delete(`/ai/conversations/${id}`);
    } catch {
      // Ignore error
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setModels([]);
    setModel('');
    setModelError('');
    setModelsLoading(true);

    api
      .get<{ ok: boolean; data?: { defaultModel?: string; models?: Array<AIModelOption | string> }; error?: string }>(
        `/ai/models?provider=${provider}`,
        { signal: controller.signal }
      )
      .then((res) => {
        const data = res.data?.data;
        if (!res.data?.ok || !data) {
          throw new Error(res.data?.error || 'Unable to load models.');
        }
        const options = (data.models || [])
          .map((option) =>
            typeof option === 'string' ? { id: option, label: option } : option
          )
          .filter((option) => option && typeof option.id === 'string');

        setModels(options);
        const defaultModel = data.defaultModel || '';
        setModel(
          defaultModel && options.some((option) => option.id === defaultModel)
            ? defaultModel
            : options[0]?.id || ''
        );
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setModelError(err instanceof Error ? err.message : 'Unable to load models.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setModelsLoading(false);
        }
      });

    return () => controller.abort();
  }, [provider]);

  const [listening, setListening] = useState(false);

  const handleVoiceInput = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition || listening) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const spoken = event.results?.[0]?.[0]?.transcript || '';
      if (spoken) setInput((prev) => (prev ? `${prev} ${spoken}` : spoken));
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const handleSpeakReply = async (text: string) => {
    try {
      const res = await api.post('/voice/synthesize', { text }, { responseType: 'blob' });
      const audioUrl = URL.createObjectURL(res.data);
      const audio = new Audio(audioUrl);
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      await audio.play();
    } catch {
      // ElevenLabs female voice unconfigured; remain in text mode per policy
    }
  };

  const handleApprovalAction = async (
    messageId: string,
    approvalId: string,
    action: 'approve' | 'reject'
  ) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.pendingApproval
          ? { ...m, pendingApproval: { ...m.pendingApproval, status: 'submitting' } }
          : m
      )
    );
    try {
      await api.post(`/approvals/${approvalId}/${action}`);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.pendingApproval
            ? {
              ...m,
              pendingApproval: {
                ...m.pendingApproval,
                status: action === 'approve' ? 'approved' : 'rejected',
              },
            }
            : m
        )
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.pendingApproval
            ? {
              ...m,
              pendingApproval: {
                ...m.pendingApproval,
                status: 'failed',
                error: err?.response?.data?.error || 'Action failed.',
              },
            }
            : m
        )
      );
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading || sendingLockRef.current) return;
    sendingLockRef.current = true;
    const clientMessageId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    const currentInput = input;
    setInput('');
    setLoading(true);

    try {
      const directInstagramCommand = parseInstagramSendCommand(currentInput);
      const retryingSend = isSendFailureFeedback(currentInput);
      const previousInstagramRequest = retryingSend
        ? messages
          .slice()
          .reverse()
          .find(
            (message) => message.role === 'user' && parseInstagramSendCommand(message.content)
          )
        : undefined;
      const previousCommand = previousInstagramRequest
        ? parseInstagramSendCommand(previousInstagramRequest.content)
        : null;
      const instagramCommand =
        directInstagramCommand || previousCommand;

      if (retryingSend) {
        const existingAction = previousCommand
          ? messages
            .slice()
            .reverse()
            .find(
              (message) =>
                message.instagramSend?.message === previousCommand.message &&
                message.instagramSend.username
                  .toLowerCase()
                  .includes(previousCommand.recipient.toLowerCase())
            )
          : undefined;
        if (existingAction?.instagramSend) {
          const action = existingAction.instagramSend;
          const statusMessage =
            action.status === 'pending'
              ? `It hasn't been sent yet. Review the message to @${action.username} above and click Confirm & Send.`
              : action.status === 'sending'
                ? `The message to @${action.username} is still sending. Please wait for its status.`
                : action.status === 'sent'
                  ? `The app received confirmation that the message to @${action.username} was sent.`
                  : `The previous send to @${action.username} failed: ${action.error || 'Instagram send failed.'}`;
          setMessages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-instagram-status`,
              role: 'assistant',
              content: statusMessage,
              timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              provider: 'Instagram',
            },
          ]);
          return;
        }
      }

      if (instagramCommand) {
        const response = await api.get<{ data: InstagramConversation[] }>('/instagram/conversations');
        const conversations = response.data?.data || [];
        const matches = conversations
          .map((conversation) => ({
            recipient: getConversationRecipient(conversation),
          }))
          .filter(
            (entry): entry is { recipient: { id: string; username: string } } =>
              Boolean(entry.recipient?.id && entry.recipient.username)
          );
        const exactMatches = matches.filter(
          ({ recipient }) =>
            recipient.username.toLowerCase() === instagramCommand.recipient.toLowerCase()
        );
        const matchingRecipients = exactMatches.length
          ? exactMatches
          : matches.filter(({ recipient }) =>
            recipient.username.toLowerCase().includes(instagramCommand.recipient.toLowerCase())
          );
        const uniqueRecipients = Array.from(
          new Map(matchingRecipients.map(({ recipient }) => [recipient.id, recipient])).values()
        );

        let content: string;
        if (uniqueRecipients.length === 0) {
          content = `I couldn't find an active Instagram conversation for "${instagramCommand.recipient}". Sync your inbox and use the exact Instagram handle.`;
        } else if (uniqueRecipients.length > 1) {
          content = `I found multiple Instagram conversations matching "${instagramCommand.recipient}". Please use the exact handle: ${uniqueRecipients.map(({ username }) => `@${username}`).join(', ')}.`;
        } else {
          const recipient = uniqueRecipients[0];
          setMessages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-instagram-action`,
              role: 'assistant',
              content: `${retryingSend ? 'I found your earlier Instagram request. It has not been sent yet.' : 'Review this Instagram message before sending:'}`,
              timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              provider: 'Instagram',
              instagramSend: {
                recipientId: recipient.id,
                username: recipient.username,
                message: instagramCommand.message,
                status: 'pending',
              },
            },
          ]);
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-instagram-notice`,
            role: 'assistant',
            content,
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            provider: 'Instagram',
          },
        ]);
        void saveTurnToLibrary(currentInput, content, 'Instagram');
        return;
      }

      if (isInstagramSendIntent(currentInput)) {
        const helpMsg =
          'I can prepare an Instagram DM for approval. Try: “Send an Instagram message to @handle: your message”.';
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-instagram-help`,
            role: 'assistant',
            content: helpMsg,
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            provider: 'Instagram',
          },
        ]);
        void saveTurnToLibrary(currentInput, helpMsg, 'Instagram');
        return;
      }

      if (retryingSend) {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-send-help`,
            role: 'assistant',
            content:
              'I can’t identify an earlier Instagram send request in this chat. Please resend it as: “Send an Instagram message to @handle: your message”.',
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            provider: 'Instagram',
          },
        ]);
        return;
      }

      const axiosRes = await api.post<
        ApiEnvelope<{
          reply: string;
          provider: string;
          model: string;
          conversationId?: string;
          pendingApproval?: { id: string; summary: string };
          generatedFiles?: Array<{ name: string; url: string; mimeType?: string }>;
          sources?: Array<{ title: string; url: string; displayLink: string }>;
        }>
      >('/ai/chat', {
        message: currentInput,
        history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        provider,
        model: model || undefined,
        conversationId: activeConvIdRef.current || undefined,
        clientMessageId,
        currentPage: window.location.pathname,
      });

      const payload = axiosRes.data;
      if (!payload?.ok || !payload.data) {
        throw new Error(payload?.error || 'AI request failed.');
      }
      const result = payload.data;
      if (!result.reply) throw new Error('AI returned an empty response.');
      if (result.conversationId) {
        const cid = result.conversationId;
        persistActiveId(cid);
        setConversations((prev) => {
          const exists = prev.some((c) => c.id === cid);
          const nowIso = new Date().toISOString();
          const nextList = exists
            ? prev.map((c) =>
                c.id === cid ? { ...c, message_count: (c.message_count || 0) + 2, last_message_at: nowIso } : c
              )
            : [
                {
                  id: cid,
                  title: currentInput.trim().slice(0, 60) || 'New Chat',
                  channel: 'web',
                  message_count: 2,
                  last_message_at: nowIso,
                },
                ...prev,
              ];
          const store = readLocalLibrary();
          store.conversations = nextList;
          writeLocalLibrary(store);
          return nextList;
        });
        void loadConversations(false);
      }

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        provider: `${result.provider.toUpperCase()}${result.model ? ` · ${result.model}` : ''}`,
        pendingApproval: result.pendingApproval
          ? {
            id: result.pendingApproval.id,
            summary: result.pendingApproval.summary,
            status: 'pending',
          }
          : undefined,
        generatedFiles: result.generatedFiles || [],
        sources: result.sources || [],
      };
      setMessages((prev) => {
        const nextMsgs = [...prev, botMsg];
        if (result.conversationId) {
          const store = readLocalLibrary();
          store.messages[result.conversationId] = nextMsgs;
          writeLocalLibrary(store);
        }
        return nextMsgs;
      });
    } catch (err: any) {
      const msg = err?.response?.data?.error || (err instanceof Error ? err.message : 'AI request failed.');
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: msg,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        provider: 'System Notice',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      sendingLockRef.current = false;
      setLoading(false);
    }
  };

  const confirmInstagramSend = async (messageId: string) => {
    if (sendingInstagramMessages.current.has(messageId)) return;
    const target = messages.find((message) => message.id === messageId);
    if (!target?.instagramSend || target.instagramSend.status !== 'pending') return;

    sendingInstagramMessages.current.add(messageId);
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId && message.instagramSend
          ? { ...message, instagramSend: { ...message.instagramSend, status: 'sending' } }
          : message
      )
    );

    try {
      const response = await api.post<{ data: { success: boolean } }>('/instagram/send', {
        recipientId: target.instagramSend.recipientId,
        message: target.instagramSend.message,
      });
      const result = response.data?.data;
      if (!result?.success) throw new Error('Instagram did not confirm the message.');

      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId && message.instagramSend
            ? { ...message, instagramSend: { ...message.instagramSend, status: 'sent' } }
            : message
        )
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId && message.instagramSend
            ? {
              ...message,
              instagramSend: {
                ...message.instagramSend,
                status: 'failed',
                error: err instanceof Error ? err.message : 'Instagram send failed.',
              },
            }
            : message
        )
      );
    } finally {
      sendingInstagramMessages.current.delete(messageId);
    }
  };

  const samplePrompts = [
    'Inaiku enaku enna tasks irukku?',
    'Draft a friendly professional WhatsApp reply to client.',
    'Summarize my pending emails from today.',
    'Save to memory: College project presentation is on Friday.',
  ];

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-7rem)] gap-4">
      {/* Chat Library Sidebar */}
      <div className={`${libraryOpen ? 'w-full lg:w-64' : 'hidden'} bg-white border-3 border-ink shadow-brutal flex flex-col shrink-0 max-h-60 lg:max-h-full`}>
        <div className="p-3 border-b-2 border-ink flex items-center justify-between bg-cream-50">
          <span className="font-extrabold text-xs flex items-center gap-1.5">
            <History className="w-4 h-4 text-teal" />
            CHAT LIBRARY
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => void loadConversations(false)}
              title="Refresh saved chats"
              className="p-1 bg-white border border-ink hover:bg-cream-100"
            >
              <RefreshCw className={`w-3 h-3 ${libraryLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleNewChat}
              className="px-2 py-1 bg-teal text-white border border-ink font-mono text-[10px] font-bold flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> NEW
            </button>
          </div>
        </div>
        <div className="p-2 border-b border-ink/15 bg-cream-50">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              const val = e.target.value;
              setSearchQuery(val);
              void loadConversations(false, val);
            }}
            placeholder="Search saved chats..."
            className="w-full border-2 border-ink bg-white px-2 py-1 text-[11px] outline-none focus:border-coral"
          />
          {saveFailure && (
            <div className="mt-1.5 p-1.5 border border-coral bg-coral/10 text-[10px] font-bold text-coral flex items-center justify-between gap-1">
              <span>Message could not be saved.</span>
              <button
                type="button"
                onClick={() => void saveTurnToLibrary(saveFailure.userText, saveFailure.assistantText, saveFailure.providerName)}
                className="underline font-black"
              >
                Retry
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {libraryError && (
            <div className="text-[10px] font-mono text-red-700 p-1.5 border border-red-300 bg-red-50">
              {libraryError}
            </div>
          )}
          {libraryLoading && conversations.length === 0 ? (
            <div className="text-[11px] font-mono text-ink-muted p-2">
              Loading saved chats...
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-[11px] font-mono text-ink-muted p-2">
              No saved chats yet. Start chatting to save automatically.
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => void handleSelectConversation(conv.id)}
                className={`p-2 border-2 border-ink cursor-pointer flex items-center justify-between gap-2 text-xs ${activeConversationId === conv.id ? 'bg-yellow' : 'bg-cream-50 hover:bg-cream-100'
                  }`}
              >
                <div className="min-w-0">
                  <div className="font-bold truncate">{conv.title || 'Untitled Chat'}</div>
                  <div className="text-[10px] font-mono text-ink-muted">
                    {conv.message_count} msgs
                  </div>
                </div>
                <button
                  onClick={(e) => void handleDeleteConversation(e, conv.id)}
                  title="Delete chat"
                  className="p-1 text-coral hover:bg-coral hover:text-white border border-ink shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col space-y-4 min-w-0">
        {/* Header controls */}
        <div className="bg-white border-3 border-ink p-3 shadow-brutal flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLibraryOpen((v) => !v)}
              className="p-1.5 bg-cream-100 hover:bg-cream-200 border-2 border-ink shadow-brutal-sm"
              title="Toggle Chat Library"
            >
              <History className="w-4 h-4" />
            </button>
            <span className="p-1.5 bg-coral text-white border-2 border-ink shadow-brutal-sm">
              <Bot className="w-5 h-5" />
            </span>
            <div>
              <h2 className="font-extrabold text-sm leading-none">KAREN AI BRAIN</h2>
              <span className="text-[10px] font-mono text-ink-muted">
                Primary Language: English (Thanglish in Instagram DMs)
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex border-2 border-ink text-xs font-mono font-bold">
                <button
                  onClick={() => setProvider('groq')}
                  className={`px-2 py-1 ${provider === 'groq' ? 'bg-yellow text-ink' : 'bg-cream'}`}
                >
                  GROQ
                </button>
                <button
                  onClick={() => setProvider('gemini')}
                  className={`px-2 py-1 border-l-2 border-ink ${provider === 'gemini' ? 'bg-teal text-white' : 'bg-cream'}`}
                >
                  GEMINI
                </button>
                <button
                  onClick={() => setProvider('copilot')}
                  className={`px-2 py-1 border-l-2 border-ink ${provider === 'copilot' ? 'bg-blue-700 text-white' : 'bg-cream'}`}
                  title="Uses Copilot CLI sign-in or a supported COPILOT_GITHUB_TOKEN; classic PATs are unsupported."
                >
                  COPILOT
                </button>
              </div>
              <label className="flex items-center gap-1.5 text-[10px] font-mono font-bold">
                MODEL
                <select
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  disabled={modelsLoading || models.length === 0}
                  className="max-w-52 border-2 border-ink bg-white px-2 py-1 text-[11px] disabled:opacity-60"
                >
                  {modelsLoading && <option value="">Loading…</option>}
                  {!modelsLoading && models.length === 0 && <option value="">Unavailable</option>}
                  {models.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {modelError && (
              <p className="text-right text-[10px] font-mono text-red-700">{modelError}</p>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 bg-cream-50 border-3 border-ink p-4 shadow-brutal overflow-y-auto space-y-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex items-start gap-2.5 max-w-2xl ${m.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
            >
              <div
                className={`p-2 border-2 border-ink shrink-0 shadow-brutal-sm ${m.role === 'user' ? 'bg-teal text-white' : 'bg-coral text-white'
                  }`}
              >
                {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`p-3.5 border-2 border-ink shadow-brutal-sm text-xs leading-relaxed ${m.role === 'user'
                    ? 'bg-white text-ink'
                    : 'bg-white border-ink text-ink'
                  }`}
              >
                <div className="flex items-center justify-between gap-4 mb-1 text-[10px] font-mono text-ink-muted border-b border-ink/20 pb-1">
                  <span className="font-bold">
                    {m.role === 'user' ? 'OWNER' : m.provider || 'KAREN'}
                  </span>
                  <span>{m.timestamp}</span>
                </div>
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.instagramSend && (
                  <div className="mt-3 border-2 border-ink bg-cream-50 p-3 space-y-2">
                    <p className="font-bold">To: @{m.instagramSend.username}</p>
                    <p className="whitespace-pre-wrap border border-ink/30 bg-white p-2">
                      {m.instagramSend.message}
                    </p>
                    {m.instagramSend.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => void confirmInstagramSend(m.id)}
                        className="btn-coral text-xs flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Confirm & Send
                      </button>
                    )}
                    {m.instagramSend.status === 'sending' && <p>Sending to Instagram…</p>}
                    {m.instagramSend.status === 'sent' && (
                      <p className="font-bold text-green-700">Sent to @{m.instagramSend.username}.</p>
                    )}
                    {m.instagramSend.status === 'failed' && (
                      <p className="text-red-700">
                        Not sent: {m.instagramSend.error || 'Instagram send failed.'}
                      </p>
                    )}
                  </div>
                )}
                {m.pendingApproval && (
                  <div className="mt-3 p-2.5 border-2 border-ink bg-yellow/25 text-ink space-y-2">
                    <div className="font-bold flex items-center gap-1.5 text-[11px]">
                      <ShieldAlert className="w-3.5 h-3.5 text-coral" />
                      <span>{m.pendingApproval.summary}</span>
                    </div>
                    {m.pendingApproval.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleApprovalAction(m.id, m.pendingApproval!.id, 'approve')}
                          className="btn-teal px-3 py-1 text-[11px] flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          Approve &amp; Send
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprovalAction(m.id, m.pendingApproval!.id, 'reject')}
                          className="btn-ghost px-3 py-1 text-[11px] flex items-center gap-1"
                        >
                          <X className="w-3 h-3" />
                          Reject
                        </button>
                      </div>
                    )}
                    {m.pendingApproval.status === 'submitting' && <p>Processing...</p>}
                    {m.pendingApproval.status === 'approved' && (
                      <p className="font-bold text-green-700">✓ Approved and sent!</p>
                    )}
                    {m.pendingApproval.status === 'rejected' && (
                      <p className="font-bold text-ink-muted">Cancelled (not sent).</p>
                    )}
                    {m.pendingApproval.status === 'failed' && (
                      <p className="text-red-700">{m.pendingApproval.error}</p>
                    )}
                  </div>
                )}
                {m.generatedFiles && m.generatedFiles.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.generatedFiles.map((f, idx) => (
                      <a
                        key={`${f.name}-${idx}`}
                        href={f.url}
                        download={f.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-mint border-2 border-ink shadow-brutal-sm text-[11px] font-bold hover:bg-yellow transition-colors"
                      >
                        <span>Download {f.name}</span>
                      </a>
                    ))}
                  </div>
                )}
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.sources.map((s, idx) => (
                      <a
                        key={`${s.url}-${idx}`}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-cream-50 border border-ink text-[10px] font-mono hover:bg-yellow"
                        title={s.title}
                      >
                        <span>{s.displayLink || s.title}</span>
                      </a>
                    ))}
                  </div>
                )}
                {m.role === 'assistant' && (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleSpeakReply(m.content)}
                      className="px-2 py-0.5 border border-ink bg-cream-50 hover:bg-yellow text-[10px] font-mono font-bold flex items-center gap-1"
                      title="Speak with Karen female voice (requires ElevenLabs)"
                    >
                      <Volume2 className="w-3 h-3" />
                      Speak
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 p-3 bg-white border-2 border-ink shadow-brutal-sm w-fit text-xs font-mono">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-coral" />
              <span>Karen is thinking...</span>
            </div>
          )}
        </div>

        {/* Quick Prompts */}
        <div className="hidden sm:flex items-center gap-2 overflow-x-auto pb-1">
          {samplePrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => setInput(p)}
              className="px-2.5 py-1 bg-white border-2 border-ink hover:bg-cream-200 text-[11px] font-semibold whitespace-nowrap shadow-brutal-sm transition-all"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Input row */}
        <form onSubmit={handleSend} className="flex gap-2">
          <button
            type="button"
            onClick={handleVoiceInput}
            className={`btn-ghost px-3 flex items-center justify-center ${listening ? 'bg-coral text-white' : ''
              }`}
            title="Voice input"
          >
            <Mic className={`w-4 h-4 ${listening ? 'animate-pulse' : ''}`} />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Karen anything... (e.g. 'Send aadhar to abc@gmail.com', 'Schedule task tomorrow')"
            className="flex-1 bg-white border-3 border-ink px-4 py-2.5 text-xs font-medium outline-none focus:border-coral shadow-brutal"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="btn-coral px-5 flex items-center gap-2 text-xs"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  );
};
export default AIChatPage;
