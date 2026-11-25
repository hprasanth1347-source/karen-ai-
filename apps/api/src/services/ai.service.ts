import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { addMemory, getMemoryContextPrompt, type MemoryCategory } from './memory.service.js';
import {
  formatSearchContext,
  isWebSearchConfigured,
  searchWebWithGoogle,
  shouldSearchWeb,
} from './search.service.js';
import { getGoogleContextForPrompt, sendGmailMessage } from '../routes/googleDrive.js';
import { getDocumentsContextPrompt } from '../routes/documents.js';
import { addTask, getTasksContextPrompt, type TaskPriority } from './task.service.js';
import { getInstagramConversations, sendInstagramMessage } from '../providers/instagram.js';
import {
  createApprovalRequest,
  isSensitiveSend,
  type ApprovalItem,
} from './approval.service.js';
import { getLoveModeSystemPrompt } from './loveMode.service.js';

export type AIProvider = 'groq' | 'gemini' | 'copilot';

export class AIProviderError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'AIProviderError';
    this.statusCode = statusCode;
  }
}

export function getDefaultAIModel(provider: AIProvider): string {
  switch (provider) {
    case 'groq':
      return config.AUTON_MODEL_ID || 'qwen/qwen3.8-27b';
    case 'gemini':
      return 'gemini-flash-lite-latest';
    case 'copilot':
      return 'gpt-4o-mini';
    default:
      return 'qwen/qwen3.8-27b';
  }
}

export interface AIModelInfo {
  id: string;
  name: string;
}

export async function listAIModels(provider: AIProvider): Promise<AIModelInfo[]> {
  if (provider === 'groq') {
    const defaultModel = config.AUTON_MODEL_ID || 'qwen/qwen3.8-27b';
    return [
      { id: defaultModel, name: 'Qwen 3.8 27B (Ultra Fast)' },
      { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B' },
      { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B' },
      { id: 'allam-2-7b', name: 'Allam 2 7B' },
    ];
  }

  if (provider === 'gemini') {
    return [
      { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite (High Reliability)' },
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
      { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    ];
  }

  if (provider === 'copilot') {
    return [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (GitHub)' },
      { id: 'gpt-4o', name: 'GPT-4o (GitHub)' },
      { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
    ];
  }

  return [];
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

async function finalizeAIReply(
  rawReply: string,
  provider: string,
  model: string
): Promise<{ reply: string; provider: string; model: string; pendingApproval?: ApprovalItem }> {
  let cleaned = rawReply;
  let pendingApproval: ApprovalItem | undefined;

  const taskTagRegex = /\[\[TASK:\s*([^|\]]+?)(?:\s*\|\s*([^|\]]*?))?(?:\s*\|\s*(low|medium|high|urgent))?\s*\]\]/gi;
  for (const match of rawReply.matchAll(taskTagRegex)) {
    const title = match[1]?.trim();
    const due = match[2]?.trim() || undefined;
    const priority = (match[3]?.toLowerCase() as TaskPriority | undefined) || 'medium';
    if (title) {
      await addTask(title, due, priority, 'ai_scheduled');
    }
    cleaned = cleaned.replace(match[0], '').trim();
  }

  const memoryTagRegex = /\[\[MEMORY:\s*([^|\]]+?)(?:\s*\|\s*(personal|work|preference|fact|instruction|reminder|other))?\s*\]\]/gi;
  for (const match of rawReply.matchAll(memoryTagRegex)) {
    const content = match[1]?.trim();
    const category = (match[2]?.toLowerCase() as MemoryCategory | undefined) || 'personal';
    if (content) {
      await addMemory(content, category, undefined, 'ai_inference');
    }
    cleaned = cleaned.replace(match[0], '').trim();
  }

  const emailTagRegex = /\[\[SEND_EMAIL:\s*([^|\]]+?)\s*\|\s*([^|\]]+?)\s*\|\s*([^|\]]+?)(?:\s*\|\s*([^\]]*?))?\s*\]\]/gi;
  for (const match of rawReply.matchAll(emailTagRegex)) {
    const to = match[1]?.trim();
    const subject = match[2]?.trim();
    const body = match[3]?.trim();
    const attachmentQuery = match[4]?.trim() || '';
    if (to && subject && body) {
      if (isSensitiveSend(`${subject} ${body} ${attachmentQuery}`)) {
        pendingApproval = await createApprovalRequest(
          'send_email',
          `Send sensitive email "${subject}"${attachmentQuery ? ` (file: ${attachmentQuery})` : ''} to ${to}`,
          { to, subject, body, attachmentQuery }
        );
        cleaned += `\n\n⚠ Approval required before sending sensitive file/email to ${to}. Click "Approve & Send" below to confirm.`;
      } else {
        const res = await sendGmailMessage(to, subject, body, attachmentQuery || undefined);
        if (res.success) {
          cleaned += `\n\n✓ Email sent to ${to}${res.attachedFile ? ` (attached: ${res.attachedFile})` : ''}`;
        } else {
          cleaned += `\n\n(Note: Email to ${to} could not be sent: ${res.error})`;
        }
      }
    }
    cleaned = cleaned.replace(match[0], '').trim();
  }

  const instaTagRegex = /\[\[SEND_INSTA:\s*([^|\]]+?)\s*\|\s*([^\]]+?)\s*\]\]/gi;
  for (const match of rawReply.matchAll(instaTagRegex)) {
    const targetUser = match[1]?.trim().replace(/^@/, '').toLowerCase();
    const msg = match[2]?.trim();
    if (targetUser && msg) {
      if (isSensitiveSend(msg)) {
        pendingApproval = await createApprovalRequest(
          'send_insta',
          `Send sensitive Instagram DM to @${targetUser}`,
          { username: targetUser, message: msg }
        );
        cleaned += `\n\n⚠ Approval required before sending sensitive Instagram DM to @${targetUser}. Click "Approve & Send" below to confirm.`;
      } else {
        try {
          const threads = await getInstagramConversations();
          const found = threads.find(
            (t) =>
              t.participant?.username?.toLowerCase().includes(targetUser) ||
              t.participant?.id === targetUser
          );
          if (found?.participant?.id) {
            const res = await sendInstagramMessage(found.participant.id, msg);
            if (!res.success) {
              cleaned += `\n\n(Note: Instagram DM to @${targetUser} failed: ${res.error})`;
            }
          } else {
            cleaned += `\n\n(Note: Could not find an active Instagram DM thread for @${targetUser}.)`;
          }
        } catch (err) {
          logger.warn('AI chat Instagram send failed', { err });
        }
      }
    }
    cleaned = cleaned.replace(match[0], '').trim();
  }

  return { reply: cleaned.trim(), provider, model, pendingApproval };
}

export async function generateAIReply(
  prompt: string,
  history: Message[] = [],
  preferredProvider?: AIProvider,
  preferredModel?: string,
  signal?: AbortSignal
): Promise<{ reply: string; provider: string; model: string; pendingApproval?: ApprovalItem }> {
  // ── Love Mode prefix detection ──────────────────────────────────────────────
  const isLoveMode = prompt.startsWith('[LOVE_MODE] ');
  const cleanPrompt = isLoveMode ? prompt.slice('[LOVE_MODE] '.length) : prompt;

  const provider = preferredProvider || (config.DEFAULT_AI_PROVIDER as AIProvider) || 'groq';
  const reqSignal = signal ?? AbortSignal.timeout(15000);
  const needsSearch = !isLoveMode && shouldSearchWeb(cleanPrompt);
  const [searchResults, googleContext, memoryContext, tasksContext] = await Promise.all([
    needsSearch && isWebSearchConfigured()
      ? searchWebWithGoogle(cleanPrompt, 5, reqSignal)
      : Promise.resolve([]),
    isLoveMode ? Promise.resolve('') : getGoogleContextForPrompt(cleanPrompt),
    getMemoryContextPrompt(),
    isLoveMode ? Promise.resolve('') : getTasksContextPrompt(),
  ]);
  const docsContext = isLoveMode ? '' : getDocumentsContextPrompt();

  const nowIst = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'medium',
  });
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const systemPrompt = isLoveMode
    ? getLoveModeSystemPrompt() + memoryContext
    :
    `You are Karen AI, a sharp, loyal, and friendly female personal AI assistant for your owner Hari Prasath with full access across Personal Memory, Tasks, Document Vault, Google Drive, Gmail, Instagram, and Live Web Search.

⚠️ CRITICAL DATE OVERRIDE — IGNORE YOUR TRAINING CUTOFF DATE COMPLETELY:
The REAL current date and time right now is: ${nowIst} (ISO: ${todayIso}).
Your training data may reference an older year — that is STALE and WRONG. This server-injected date is ground truth. Always answer date/time questions using the date above. Never claim you lack real-time date access.

Language Rule: Communicate in clear, natural English by default. Only reply in Thanglish or Tamil if the user writes in Tamil/Thanglish or the prompt explicitly requests Thanglish (e.g., Instagram DMs).
Live Actions & Auto-Learning (append tags silently at the very end when applicable):
- Auto-Learn Rule: Whenever the user shares a useful, durable personal detail, preference, business rule, contact, or instruction (not already in Personal Details above, and not transient small talk), automatically save it by appending [[MEMORY: <concise standalone fact> | <personal|work|preference|fact|instruction|other>]].
- Schedule/create a task: [[TASK: <title> | <YYYY-MM-DD> | <low|medium|high|urgent>]]
- Send an email (or share/attach a Google Drive file like "aadhar" by email): [[SEND_EMAIL: <recipient_email(s)> | <subject> | <body with Drive link if found> | <optional_drive_filename_to_attach>]]
- Send an Instagram DM (or share a Drive file link via Instagram): [[SEND_INSTA: <instagram_username> | <message with Drive link if applicable>]]` +
    memoryContext +
    tasksContext +
    docsContext +
    googleContext +
    formatSearchContext(searchResults);

  // Use cleaned prompt (strips [LOVE_MODE] prefix if present)
  const effectivePrompt = isLoveMode ? cleanPrompt : prompt;

  // 1. Groq Cloud (Qwen 3.8 27B) - Verified & Operational
  if (provider === 'groq' && config.GROQ_API_KEY) {
    try {
      const messages = [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: effectivePrompt },
      ];

      const modelId = preferredModel || getDefaultAIModel('groq');

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          temperature: 0.6,
          max_tokens: 1024,
        }),
        signal: reqSignal,
      });

      if (res.ok) {
        const json = await res.json();
        const reply = json.choices?.[0]?.message?.content;
        if (reply) {
          return await finalizeAIReply(reply, 'groq', modelId);
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        logger.warn('Groq error, falling back:', errJson);
      }
    } catch (err) {
      logger.warn('Groq call failed, trying fallback', { err });
    }
  }

  // 2. Google Gemini API (gemini-flash-lite-latest) - Verified & Operational
  if ((provider === 'gemini' || !preferredProvider) && config.GEMINI_API_KEY) {
    try {
      const modelName = preferredModel || getDefaultAIModel('gemini');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.GEMINI_API_KEY}`;
      const basePayload = {
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          ...history.map((h) => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }],
          })),
          { role: 'user', parts: [{ text: effectivePrompt }] },
        ],
      };

      let res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          needsSearch ? { ...basePayload, tools: [{ google_search: {} }] } : basePayload
        ),
        signal: reqSignal,
      });

      if (!res.ok && needsSearch) {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(basePayload),
          signal: reqSignal,
        });
      }

      if (res.ok) {
        const json = await res.json();
        const reply = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) {
          return await finalizeAIReply(reply, 'gemini', modelName);
        }
      }
    } catch (err) {
      logger.warn('Gemini provider call failed', { err });
    }
  }

  // 3. GitHub Models / Copilot (gpt-4o-mini)
  const ghToken = config.GITHUB_TOKEN || config.COPILOT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if ((provider === 'copilot' || (!config.GROQ_API_KEY && !config.GEMINI_API_KEY)) && ghToken) {
    try {
      const model = preferredModel || 'gpt-4o-mini';
      const res = await fetch('https://models.inference.ai.azure.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ghToken}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            ...history.map((h) => ({ role: h.role, content: h.content })),
            { role: 'user', content: effectivePrompt },
          ],
        }),
        signal: reqSignal,
      });

      if (res.ok) {
        const json = await res.json();
        const reply = json.choices?.[0]?.message?.content;
        if (reply) {
          return await finalizeAIReply(reply, 'copilot', model);
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        logger.warn('GitHub Models call error:', errJson);
      }
    } catch (err) {
      logger.warn('GitHub Models call failed', { err });
    }
  }

  // 4. Default graceful fallback
  return {
    reply: `Hi Hari! I received your message: "${prompt}". I am ready to help whenever you need.`,
    provider: 'local-karen',
    model: 'karen-core-v1',
  };
}
