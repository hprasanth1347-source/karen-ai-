import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { generateAIReply } from '../services/ai.service.js';

const META_BASE_URL = `https://graph.facebook.com/${config.META_GRAPH_API_VERSION || 'v21.0'}`;

let conversationsCache: { expiresAt: number; data: InstagramThread[] } | null = null;
let profileCache: { expiresAt: number; data: InstagramProfile } | null = null;
let mediaCache: { expiresAt: number; data: InstagramMediaItem[] } | null = null;

async function metaFetch(url: string, init?: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export interface InstagramProfile {
  id: string;
  name: string;
  username: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
}

export interface InstagramMediaItem {
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

export interface InstagramAttachmentItem {
  id?: string;
  type: 'image' | 'video' | 'reel' | 'audio' | 'share' | 'file';
  url: string;
  previewUrl?: string;
  mimeType?: string;
  title?: string;
}

export interface InstagramMessage {
  id: string;
  created_time: string;
  from: { id: string; username: string };
  to?: { data: Array<{ id: string; username: string }> };
  message: string;
  attachments?: InstagramAttachmentItem[];
}

export function parseMessageAttachments(rawMsg: any): InstagramAttachmentItem[] {
  const attachments: InstagramAttachmentItem[] = [];
  const rawAtts = rawMsg.attachments?.data || rawMsg.attachments || [];
  if (Array.isArray(rawAtts)) {
    for (const att of rawAtts) {
      const type = (att.type || (att.image_data ? 'image' : att.video_data ? 'video' : 'file')).toLowerCase();
      const url =
        att.image_data?.url ||
        att.image_data?.preview_url ||
        att.video_data?.url ||
        att.file_url ||
        att.payload?.url ||
        '';
      const previewUrl = att.image_data?.preview_url || att.image_data?.url || att.video_data?.preview_url || url;
      if (url) {
        attachments.push({
          id: att.id,
          type: type as any,
          url,
          previewUrl,
          mimeType: att.mime_type,
          title: att.name || att.payload?.title,
        });
      }
    }
  }
  const rawShares = rawMsg.shares?.data || rawMsg.shares || [];
  if (Array.isArray(rawShares)) {
    for (const s of rawShares) {
      if (s.link) {
        attachments.push({
          id: s.id,
          type: 'share',
          url: s.link,
          previewUrl: s.link,
          title: s.name || 'Shared Post / Reel',
        });
      }
    }
  }
  return attachments;
}

export interface InstagramThread {
  id: string;
  updated_time: string;
  snippet?: string;
  participant: { id: string; username: string };
  participants?: Array<{ id: string; username: string }>;
  unread_count?: number;
  messages?: InstagramMessage[];
}

export async function getInstagramProfile(): Promise<InstagramProfile> {
  if (profileCache && profileCache.expiresAt > Date.now()) {
    return profileCache.data;
  }
  const token = config.INSTAGRAM_ACCESS_TOKEN;
  const accountId = config.INSTAGRAM_ACCOUNT_ID || '';

  if (!token) {
    return {
      id: accountId,
      name: 'Hari Prasath',
      username: config.INSTAGRAM_USERNAME || '',
      profile_picture_url: '',
      followers_count: 1420,
      media_count: 58,
    };
  }

  try {
    const res = await metaFetch(
      `${META_BASE_URL}/${accountId}?fields=id,name,username,profile_picture_url&access_token=${token}`
    );
    if (!res.ok) {
      return {
        id: accountId,
        name: 'Hari Prasath',
        username: config.INSTAGRAM_USERNAME || '',
      };
    }
    const data = await res.json();
    const profile = {
      id: data.id,
      name: data.name || 'Hari Prasath',
      username: data.username || config.INSTAGRAM_USERNAME || '',
      profile_picture_url: data.profile_picture_url,
    };
    profileCache = { expiresAt: Date.now() + 60_000, data: profile };
    return profile;
  } catch (err) {
    logger.error('Failed to get Instagram profile:', err);
    if (profileCache) return profileCache.data;
    return {
      id: accountId,
      name: 'Hari Prasath',
      username: config.INSTAGRAM_USERNAME || '',
    };
  }
}

export async function getInstagramMedia(): Promise<InstagramMediaItem[]> {
  if (mediaCache && mediaCache.expiresAt > Date.now()) {
    return mediaCache.data;
  }
  const token = config.INSTAGRAM_ACCESS_TOKEN;
  const accountId = config.INSTAGRAM_ACCOUNT_ID || '';

  if (!token) return [];

  try {
    const url = `${META_BASE_URL}/${accountId}/media?fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count&access_token=${token}`;
    const res = await metaFetch(url);
    if (!res.ok) {
      logger.warn('Failed to fetch Instagram media:', await res.text());
      return [];
    }
    const json = await res.json();
    const media = json.data || [];
    mediaCache = { expiresAt: Date.now() + 30_000, data: media };
    return media;
  } catch (err) {
    logger.error('Error fetching Instagram media:', err);
    if (mediaCache) return mediaCache.data;
    return [];
  }
}

export async function getInstagramConversations(): Promise<InstagramThread[]> {
  if (conversationsCache && conversationsCache.expiresAt > Date.now()) {
    return conversationsCache.data;
  }
  const token = config.INSTAGRAM_ACCESS_TOKEN;
  const accountId = config.INSTAGRAM_ACCOUNT_ID || '';
  const ownerUsername = config.INSTAGRAM_USERNAME || '';

  if (!token) {
    throw new Error('Instagram is not connected. Add a server-side Instagram access token first.');
  }

  try {
    // Single-call nested field expansion with attachments & shares
    const url = `${META_BASE_URL}/${accountId}/conversations?platform=instagram&fields=id,updated_time,participants,messages.limit(20){id,created_time,from,to,message,attachments{id,mime_type,image_data,video_data,file_url,type},shares}&limit=10&access_token=${token}`;
    const res = await metaFetch(url);
    if (!res.ok) {
      const errorBody = (await res.json().catch(() => ({}))) as {
        error?: { message?: string; code?: number };
      };
      throw new Error(
        errorBody.error?.message || `Instagram conversation request failed (${res.status}).`
      );
    }

    const json = await res.json();
    const rawThreads = Array.isArray(json.data) ? json.data : [];

    const threads: InstagramThread[] = rawThreads.map((t: any): InstagramThread => {
      const rawMsgs = t.messages?.data || [];
      const msgs: InstagramMessage[] = rawMsgs.map((m: any) => ({
        id: m.id,
        created_time: m.created_time,
        from: m.from,
        to: m.to,
        message: m.message || (m.attachments ? '[Media Attachment]' : ''),
        attachments: parseMessageAttachments(m),
      }));
      const participants: Array<{ id: string; username: string }> = t.participants?.data || [];
      const lastMsg = msgs[0];

      let otherUser = { id: '', username: 'friend' };
      for (const p of participants) {
        if (p.username && p.username !== ownerUsername) {
          otherUser = p;
          break;
        }
      }
      if (!otherUser.id && lastMsg) {
        if (lastMsg.from?.username && lastMsg.from.username !== ownerUsername) {
          otherUser = lastMsg.from;
        }
      }

      return {
        id: t.id,
        updated_time: t.updated_time,
        snippet: lastMsg?.message || (lastMsg?.attachments?.length ? '📷 Photo / Media' : 'New message'),
        participant: otherUser,
        participants,
        messages: msgs,
      };
    });

    conversationsCache = { expiresAt: Date.now() + 3000, data: threads };
    return threads;
  } catch (err) {
    logger.error('Error fetching Instagram conversations:', err);
    if (conversationsCache) return conversationsCache.data;
    throw err instanceof Error ? err : new Error('Instagram conversation sync failed.');
  }
}

export async function getThreadDetails(threadId: string): Promise<InstagramMessage[]> {
  const token = config.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return [];

  try {
    const res = await metaFetch(
      `${META_BASE_URL}/${threadId}?fields=messages.limit(30){id,created_time,from,to,message,attachments{id,mime_type,image_data,video_data,file_url,type},shares}&access_token=${token}`
    );
    if (!res.ok) return [];
    const json = await res.json();
    const rawList = json.messages?.data || [];
    return rawList.map((m: any) => ({
      id: m.id,
      created_time: m.created_time,
      from: m.from,
      to: m.to,
      message: m.message || (m.attachments ? '[Media Attachment]' : ''),
      attachments: parseMessageAttachments(m),
    }));
  } catch (err) {
    logger.error('Error fetching thread details:', err);
    return [];
  }
}

export async function sendInstagramMessage(
  recipientId: string,
  text: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const token = config.INSTAGRAM_ACCESS_TOKEN;
  const accountId = config.INSTAGRAM_ACCOUNT_ID || '';

  if (!token) {
    return { success: false, error: 'Instagram is not connected. Add a valid server-side access token first.' };
  }

  try {
    const res = await metaFetch(`${META_BASE_URL}/${accountId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    }, 7000);

    const json = await res.json();
    if (!res.ok) {
      return { success: false, error: json.error?.message || 'Meta API error' };
    }
    conversationsCache = null;
    return { success: true, messageId: json.message_id };
  } catch (err: any) {
    logger.error('Error sending Instagram message:', err);
    return { success: false, error: err.message };
  }
}

export async function draftInstagramReply(
  incomingMessage: string,
  senderUsername?: string,
  preferredProvider?: 'groq' | 'gemini' | 'copilot',
  preferredModel?: string
): Promise<string> {
  const prompt = `User @${senderUsername || 'friend'} sent this Instagram DM to Hari: "${incomingMessage}".
Draft a single, friendly, natural Thanglish response (Tamil in English letters + conversational English) that Hari can approve and send back immediately. Keep it warm, casual, and under 2 sentences.`;

  const replyObj = await generateAIReply(prompt, [], preferredProvider, preferredModel);
  return replyObj.reply;
}

// Known VIP contacts cache for instant resolution
const KNOWN_CONTACTS: Record<string, { id: string; username: string }> = {
  raghul: { id: '1681852029959817', username: '_.raghul._.15' },
  '_.raghul._.15': { id: '1681852029959817', username: '_.raghul._.15' },
  ragul: { id: '1681852029959817', username: '_.raghul._.15' },
  rahul: { id: '1681852029959817', username: '_.raghul._.15' },
  prasath: { id: '1181569317555695', username: '_.prasath.pvt_' },
  '_.prasath.pvt_': { id: '1181569317555695', username: '_.prasath.pvt_' },
  pranav: { id: '29049333121424868', username: 'pranav._prvt_' },
  'pranav._prvt_': { id: '29049333121424868', username: 'pranav._prvt_' },
  buvanesh: { id: '1753418056357823', username: '_buvanesh____' },
  '_buvanesh____': { id: '1753418056357823', username: '_buvanesh____' },
};

/**
 * Fuzzy resolve recipient by name or username from active threads & cache
 */
export async function resolveInstagramRecipient(
  query: string
): Promise<{ id: string; username: string } | null> {
  const clean = query.toLowerCase().replace(/[@._\s-]/g, '');

  // 1. Direct dictionary match
  for (const [key, val] of Object.entries(KNOWN_CONTACTS)) {
    const cleanKey = key.toLowerCase().replace(/[@._\s-]/g, '');
    if (clean.includes(cleanKey) || cleanKey.includes(clean)) {
      return val;
    }
  }

  // 2. Search active conversations
  try {
    const threads = await getInstagramConversations();
    for (const t of threads) {
      if (t.participant?.username && t.participant?.id) {
        const uClean = t.participant.username.toLowerCase().replace(/[@._\s-]/g, '');
        if (clean.includes(uClean) || uClean.includes(clean)) {
          return t.participant;
        }
      }
    }
  } catch (err) {
    logger.warn('Could not inspect conversations for recipient resolution:', err);
  }

  return null;
}

export interface VoiceCommandResult {
  success: boolean;
  action: 'send_message' | 'draft_reply' | 'check_messages' | 'list_posts' | 'chat';
  recipient?: { id: string; username: string };
  messageText?: string;
  replyMessage: string;
  aiProvider: string;
  aiModel: string;
  metaMessageId?: string;
}

/**
 * Full Instagram Voice Command Orchestrator
 * Supports Groq, Gemini, and GitHub Copilot models.
 * E.g. "send msg to raghul I am on the way", "tell raghul hello", "raghul ku message anupu"
 */
export async function executeInstagramVoiceCommand(
  rawCommand: string,
  preferredProvider?: 'groq' | 'gemini' | 'copilot',
  preferredModel?: string
): Promise<VoiceCommandResult> {
  const command = rawCommand.trim();

  // Step 1: Use AI to parse the intent, recipient, and message text
  const parsePrompt = `You are Karen's Instagram Voice Intent Parser.
The user spoke this command: "${command}"

Respond ONLY with a valid JSON object (no markdown, no backticks, no other text):
{
  "action": "send_message" | "draft_reply" | "check_messages" | "list_posts" | "chat",
  "recipient": "recipient name or username mentioned (e.g. raghul), or null",
  "messageText": "exact message to send or draft, or null"
}`;

  let action = 'chat';
  let recipientQuery = '';
  let messageText = '';
  let providerUsed = preferredProvider || 'groq';
  let modelUsed = preferredModel || 'qwen/qwen3.8-27b';

  try {
    const aiRes = await generateAIReply(parsePrompt, [], preferredProvider, preferredModel);
    providerUsed = aiRes.provider as any;
    modelUsed = aiRes.model;

    // Clean JSON response
    const jsonStr = aiRes.reply.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    if (parsed.action) action = parsed.action;
    if (parsed.recipient) recipientQuery = parsed.recipient;
    if (parsed.messageText) messageText = parsed.messageText;
  } catch (err) {
    logger.warn('AI intent parsing failed, using regex fallback:', err);
  }

  // Regex Fallback if AI didn't catch recipient or message text
  if (!recipientQuery || !messageText) {
    // Tamil / Thanglish: "raghul ku message anupu <text>" or "raghul ku solu <text>"
    const tamilMatch = command.match(/^(.+?)\s*(?:ku|kku)\s*(?:msg|message|anupu|solu)\s*[:\s-]?\s*(.+)$/i);
    if (tamilMatch) {
      action = 'send_message';
      recipientQuery = tamilMatch[1].trim();
      messageText = tamilMatch[2].trim();
    } else {
      // English: "send msg to raghul <text>" or "tell raghul <text>" or "dm raghul <text>"
      const engMatch = command.match(/^(?:send\s+msg\s+to|send\s+message\s+to|send\s+dm\s+to|tell|dm|msg)\s+([a-zA-Z0-9_.]+)\s+(?:saying\s+|that\s+|:\s*)?(.+)$/i);
      if (engMatch) {
        action = 'send_message';
        recipientQuery = engMatch[1].trim();
        messageText = engMatch[2].trim();
      }
    }
  }

  // Handle Intent: send_message
  if (action === 'send_message' || (recipientQuery && messageText)) {
    const recipient = await resolveInstagramRecipient(recipientQuery || 'raghul');

    if (!recipient) {
      return {
        success: false,
        action: 'send_message',
        replyMessage: `Ennala "${recipientQuery}" oda Instagram account-a kandupudika mudiyala thalaiva. Direct handle solunga (e.g. _.raghul._.15).`,
        aiProvider: providerUsed,
        aiModel: modelUsed,
      };
    }

    if (!messageText) {
      return {
        success: false,
        action: 'send_message',
        recipient,
        replyMessage: `@${recipient.username} ku enna message anupanum nu solunga thalaiva!`,
        aiProvider: providerUsed,
        aiModel: modelUsed,
      };
    }

    // Dispatch message live to Instagram
    const sendResult = await sendInstagramMessage(recipient.id, messageText);

    if (sendResult.success) {
      return {
        success: true,
        action: 'send_message',
        recipient,
        messageText,
        metaMessageId: sendResult.messageId,
        replyMessage: `Done thalaiva! Message sent to @${recipient.username}: "${messageText}".`,
        aiProvider: providerUsed,
        aiModel: modelUsed,
      };
    } else {
      return {
        success: false,
        action: 'send_message',
        recipient,
        messageText,
        replyMessage: `Message dispatch failed: ${sendResult.error || 'Meta API restriction'}.`,
        aiProvider: providerUsed,
        aiModel: modelUsed,
      };
    }
  }

  // Handle Intent: check_messages
  if (action === 'check_messages' || command.toLowerCase().includes('check') || command.toLowerCase().includes('messages')) {
    try {
      const threads = await getInstagramConversations();
      const top3 = threads.slice(0, 3).map(t => `@${t.participant?.username || 'user'}: "${t.snippet}"`).join(' | ');
      return {
        success: true,
        action: 'check_messages',
        replyMessage: `Unga latest DMs: ${top3 || 'No unread messages'}.`,
        aiProvider: providerUsed,
        aiModel: modelUsed,
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'check_messages',
        replyMessage: `Could not fetch DMs: ${err.message}`,
        aiProvider: providerUsed,
        aiModel: modelUsed,
      };
    }
  }

  // Default conversational Thanglish reply
  const chatReply = await generateAIReply(
    `Owner Hari gave this Instagram assistant instruction: "${command}". Respond helpfully in 1-2 conversational Thanglish sentences.`,
    [],
    preferredProvider,
    preferredModel
  );

  return {
    success: true,
    action: 'chat',
    replyMessage: chatReply.reply,
    aiProvider: chatReply.provider,
    aiModel: chatReply.model,
  };
}
