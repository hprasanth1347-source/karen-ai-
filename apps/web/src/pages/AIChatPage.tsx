import React, { useEffect, useRef, useState } from 'react';
import { Send, Bot, User, RefreshCw } from 'lucide-react';

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

export const AIChatPage: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        'Vanakkam! Naan ungalloda Karen AI. help eadha chum  venum ma ? Ennala reminders poda mudiyum, emails draft panna mudiyum, documents analyze panna mudiyum, and memory save panna mudiyum.',
      timestamp: 'Just now',
      provider: 'Karen Brain',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<AIProvider>('groq');
  const [models, setModels] = useState<AIModelOption[]>([]);
  const [model, setModel] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelError, setModelError] = useState('');
  const sendingInstagramMessages = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    setModels([]);
    setModel('');
    setModelError('');
    setModelsLoading(true);

    fetch(`/api/ai/models?provider=${provider}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await readApiData<{
          defaultModel?: string;
          models?: Array<AIModelOption | string>;
        }>(res);
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

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

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
        const response = await fetch('/api/v1/instagram/conversations');
        const conversations = await readApiData<InstagramConversation[]>(response);
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
        return;
      }

      if (isInstagramSendIntent(currentInput)) {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-instagram-help`,
            role: 'assistant',
            content:
              'I can prepare an Instagram DM for approval. Try: “Send an Instagram message to @handle: your message”.',
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            provider: 'Instagram',
          },
        ]);
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

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: currentInput,
          history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
          provider,
          model: model || undefined,
        }),
      });

      const result = await readApiData<{ reply: string; provider: string; model: string }>(res);
      if (!result.reply) throw new Error('AI returned an empty response.');

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        provider: `${result.provider.toUpperCase()}${result.model ? ` · ${result.model}` : ''}`,
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: err instanceof Error ? err.message : 'AI request failed.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        provider: 'System Notice',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
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
      const response = await fetch('/api/v1/instagram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: target.instagramSend.recipientId,
          message: target.instagramSend.message,
        }),
      });
      const result = await readApiData<{ success: boolean }>(response);
      if (!result.success) throw new Error('Instagram did not confirm the message.');

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
    <div className="flex flex-col h-[calc(100vh-7rem)] space-y-4">
      {/* Header controls */}
      <div className="bg-white border-3 border-ink p-3 shadow-brutal flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-coral text-white border-2 border-ink shadow-brutal-sm">
            <Bot className="w-5 h-5" />
          </span>
          <div>
            <h2 className="font-extrabold text-sm leading-none">KAREN AI BRAIN</h2>
            <span className="text-[10px] font-mono text-ink-muted">
              Primary Language: Thanglish / Tamil / English
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
            className={`flex items-start gap-2.5 max-w-2xl ${
              m.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
            }`}
          >
            <div
              className={`p-2 border-2 border-ink shrink-0 shadow-brutal-sm ${
                m.role === 'user' ? 'bg-teal text-white' : 'bg-coral text-white'
              }`}
            >
              {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div
              className={`p-3.5 border-2 border-ink shadow-brutal-sm text-xs leading-relaxed ${
                m.role === 'user'
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
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 p-3 bg-white border-2 border-ink shadow-brutal-sm w-fit text-xs font-mono">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-coral" />
            <span>Karen is thinking in Thanglish...</span>
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
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Karen kitta edhavadhu kelunga... (e.g. Schedule a task, summarize emails)"
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
  );
};
export default AIChatPage;
