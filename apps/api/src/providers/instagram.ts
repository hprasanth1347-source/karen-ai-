import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { generateAIReply } from '../services/ai.service.js';
import { loadInstagramTokensWithStatus } from '../services/persistence.service.js';

const META_BASE_URL = `https://graph.facebook.com/${config.META_GRAPH_API_VERSION || 'v21.0'}`;
const IG_BASE_URL = `https://graph.instagram.com/${config.META_GRAPH_API_VERSION || 'v21.0'}`;

function normalizeHandle(value?: string): string {
  return (value || '').trim().replace(/^@/, '').toLowerCase();
}

function isNumericId(value?: string): boolean {
  return Boolean(value && /^\d+$/.test(value.trim()));
}

async function resolveIgAuth(userId?: string): Promise<{
  token: string;
  accountId: string;
  pageId: string;
  isIgToken: boolean;
}> {
  let token = config.INSTAGRAM_ACCESS_TOKEN || config.META_PAGE_ACCESS_TOKEN || '';
  let accountId = config.INSTAGRAM_ACCOUNT_ID || '';
  let pageId = isNumericId(config.INSTAGRAM_PAGE_ID) ? config.INSTAGRAM_PAGE_ID : '';

  const stored = await loadInstagramTokensWithStatus(userId).catch(() => ({
    tokens: null,
    status: 'disconnected',
  }));
  if (stored.tokens && stored.status === 'connected') {
    token = stored.tokens.accessToken || token;
    accountId = stored.tokens.accountId || accountId;
    if (isNumericId(stored.tokens.pageId)) {
      pageId = stored.tokens.pageId;
    }
  }

  return {
    token: token.trim(),
    accountId: accountId.trim(),
    pageId: pageId.trim(),
    isIgToken: token.trim().startsWith('IG'),
  };
}

let conversationsCache: { expiresAt: number; data: InstagramThread[]; tokenSig: string } | null = null;
let preferredConvRoute: { baseNode: string; fieldIdx: number; tokenSig: string } | null = null;
let preferredSendEndpoint: { endpoint: string; tokenSig: string } | null = null;
let profileCache: { expiresAt: number; data: InstagramProfile; tokenSig: string } | null = null;
let mediaCache: { expiresAt: number; data: InstagramMediaItem[]; tokenSig: string } | null = null;
const usernameCache = new Map<string, { expiresAt: number; username: string }>();

export function invalidateInstagramCache(): void {
  conversationsCache = null;
  preferredConvRoute = null;
  preferredSendEndpoint = null;
  profileCache = null;
  mediaCache = null;
  usernameCache.clear();
}

function sortMessagesNewestFirst(msgs: InstagramMessage[]): InstagramMessage[] {
  return [...msgs].sort((a, b) => {
    const ta = a.created_time ? new Date(a.created_time).getTime() : 0;
    const tb = b.created_time ? new Date(b.created_time).getTime() : 0;
    return tb - ta;
  });
}

async function metaFetch(url: string, init?: RequestInit, timeoutMs = 4500): Promise<Response> {
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

export async function getInstagramProfile(userId?: string): Promise<InstagramProfile> {
  const { token, accountId, isIgToken } = await resolveIgAuth(userId);
  const tokenSig = token.slice(0, 14);
  if (profileCache && profileCache.expiresAt > Date.now() && profileCache.tokenSig === tokenSig) {
    return profileCache.data;
  }

  if (!token) {
    return {
      id: accountId,
      name: '',
      username: config.INSTAGRAM_USERNAME || '',
      profile_picture_url: '',
      followers_count: 0,
      media_count: 0,
    };
  }

  const urls = isIgToken
    ? [
      `${IG_BASE_URL}/me?fields=id,user_id,username,name,profile_picture_url,followers_count,media_count&access_token=${encodeURIComponent(token)}`,
      ...(accountId
        ? [
          `${META_BASE_URL}/${accountId}?fields=id,name,username,profile_picture_url,followers_count,media_count&access_token=${encodeURIComponent(token)}`,
        ]
        : []),
    ]
    : [
      ...(accountId
        ? [
          `${META_BASE_URL}/${accountId}?fields=id,name,username,profile_picture_url,followers_count,media_count&access_token=${encodeURIComponent(token)}`,
        ]
        : []),
      `${META_BASE_URL}/me?fields=id,name,username,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}&access_token=${encodeURIComponent(token)}`,
    ];

  try {
    for (const url of urls) {
      const res = await metaFetch(url).catch(() => null);
      if (!res?.ok) continue;
      const raw = (await res.json().catch(() => ({}))) as any;
      const data = raw.instagram_business_account || raw;
      const resolvedId = data.user_id || data.id || accountId;
      if (!resolvedId && !data.username) continue;
      const profile: InstagramProfile = {
        id: String(resolvedId || ''),
        name: data.name || data.username || '',
        username: data.username || config.INSTAGRAM_USERNAME || '',
        profile_picture_url: data.profile_picture_url,
        followers_count: data.followers_count,
        media_count: data.media_count,
      };
      profileCache = { expiresAt: Date.now() + 60_000, data: profile, tokenSig };
      return profile;
    }
  } catch (err) {
    logger.error('Failed to get Instagram profile:', err);
  }

  if (profileCache && profileCache.tokenSig === tokenSig) return profileCache.data;
  return {
    id: accountId,
    name: '',
    username: config.INSTAGRAM_USERNAME || '',
  };
}

export async function lookupInstagramUserById(
  igUserId: string,
  userId?: string
): Promise<string | null> {
  if (!igUserId) return null;
  const cached = usernameCache.get(igUserId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.username;
  }
  const { token, isIgToken } = await resolveIgAuth(userId);
  if (!token) return null;
  const base = isIgToken ? IG_BASE_URL : META_BASE_URL;
  try {
    const res = await metaFetch(
      `${base}/${encodeURIComponent(igUserId)}?fields=username,name&access_token=${encodeURIComponent(token)}`,
      undefined,
      900
    );
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { username?: string; name?: string };
      const uname = data.username || data.name;
      if (uname) {
        usernameCache.set(igUserId, { expiresAt: Date.now() + 10 * 60_000, username: uname });
        return uname;
      }
    }
  } catch {
    // Best-effort lookup under strict SLA budget
  }
  return null;
}

export async function getInstagramMedia(userId?: string): Promise<InstagramMediaItem[]> {
  const { token, accountId, isIgToken } = await resolveIgAuth(userId);
  const tokenSig = token.slice(0, 14);
  if (mediaCache && mediaCache.expiresAt > Date.now() && mediaCache.tokenSig === tokenSig) {
    return mediaCache.data;
  }

  if (!token) return [];

  const fields = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count';
  const urls = isIgToken
    ? [
      `${IG_BASE_URL}/me/media?fields=${fields}&access_token=${encodeURIComponent(token)}`,
      ...(accountId ? [`${META_BASE_URL}/${accountId}/media?fields=${fields}&access_token=${encodeURIComponent(token)}`] : []),
    ]
    : [
      ...(accountId ? [`${META_BASE_URL}/${accountId}/media?fields=${fields}&access_token=${encodeURIComponent(token)}`] : []),
      `${IG_BASE_URL}/me/media?fields=${fields}&access_token=${encodeURIComponent(token)}`,
    ];

  try {
    for (const url of urls) {
      const res = await metaFetch(url).catch(() => null);
      if (!res?.ok) continue;
      const json = (await res.json().catch(() => ({}))) as { data?: InstagramMediaItem[] };
      const media = json.data || [];
      mediaCache = { expiresAt: Date.now() + 30_000, data: media, tokenSig };
      return media;
    }
    return [];
  } catch (err) {
    logger.error('Error fetching Instagram media:', err);
    if (mediaCache && mediaCache.tokenSig === tokenSig) return mediaCache.data;
    return [];
  }
}

export async function getInstagramConversations(
  options?: { forceFresh?: boolean; userId?: string }
): Promise<InstagramThread[]> {
  const { token, accountId, pageId, isIgToken } = await resolveIgAuth(options?.userId);
  const tokenSig = token.slice(0, 14);
  if (
    !options?.forceFresh &&
    conversationsCache &&
    conversationsCache.expiresAt > Date.now() &&
    conversationsCache.tokenSig === tokenSig
  ) {
    return conversationsCache.data;
  }

  if (!token) {
    throw new Error('Instagram is not connected. Add a valid Instagram/Meta access token first.');
  }

  try {
    const fieldVariants = [
      'id,updated_time,participants,messages.limit(15){id,created_time,from,to,message,attachments{id,mime_type,image_data,video_data,file_url},shares}',
      'id,updated_time,participants,messages.limit(15){id,created_time,from,to,message,attachments{id,mime_type,image_data,video_data,file_url}}',
      'id,updated_time,participants,messages.limit(10){id,created_time,from,to,message}',
    ];

    const rawBaseNodes = isIgToken
      ? [
        `${IG_BASE_URL}/me`,
        ...(accountId ? [`${IG_BASE_URL}/${accountId}`, `${META_BASE_URL}/${accountId}`] : []),
        `${META_BASE_URL}/me`,
      ]
      : [
        ...(accountId ? [`${META_BASE_URL}/${accountId}`] : []),
        ...(pageId && pageId !== accountId ? [`${META_BASE_URL}/${pageId}`] : []),
        `${META_BASE_URL}/me`,
        `${IG_BASE_URL}/me`,
      ];

    const baseNodes = Array.from(new Set(rawBaseNodes));
    const orderedRoutes: Array<{ baseNode: string; fieldIdx: number }> = [];
    if (preferredConvRoute && preferredConvRoute.tokenSig === tokenSig && baseNodes.includes(preferredConvRoute.baseNode)) {
      orderedRoutes.push({ baseNode: preferredConvRoute.baseNode, fieldIdx: preferredConvRoute.fieldIdx });
    }
    for (const baseNode of baseNodes) {
      for (let fieldIdx = 0; fieldIdx < fieldVariants.length; fieldIdx++) {
        if (
          orderedRoutes[0]?.baseNode === baseNode &&
          orderedRoutes[0]?.fieldIdx === fieldIdx
        ) {
          continue;
        }
        orderedRoutes.push({ baseNode, fieldIdx });
      }
    }

    let res: Response | null = null;
    let json: { data?: any[] } | null = null;
    let lastErrBody: { error?: { message?: string; code?: number } } = {};
    const deadNodes = new Set<string>();

    for (const route of orderedRoutes) {
      if (deadNodes.has(route.baseNode)) continue;
      const fields = fieldVariants[route.fieldIdx];
      const url = `${route.baseNode}/conversations?platform=instagram&fields=${fields}&limit=15&access_token=${encodeURIComponent(token)}`;
      res = await metaFetch(url).catch(() => null);
      if (res?.ok) {
        json = (await res.json().catch(() => ({ data: [] }))) as { data?: any[] };
        preferredConvRoute = { baseNode: route.baseNode, fieldIdx: route.fieldIdx, tokenSig };
        break;
      }
      if (!res) continue;
      lastErrBody = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
      const errMsg = lastErrBody.error?.message || '';
      logger.warn('Instagram conversations attempt failed, trying fallback', {
        baseNode: route.baseNode,
        fieldIdx: route.fieldIdx,
        status: res.status,
        error: errMsg,
      });
      // Token error (190) / permission error (10/200) on Facebook Graph might still work on IG Graph if IG token,
      // but if not field-related (400 without subfield keyword), skip other field variants on the same base node.
      const isFieldError = res.status === 400 && /subfield|nonexisting field|cannot be accessed|unknown fields|shares|attachments/i.test(errMsg);
      if (!isFieldError) {
        deadNodes.add(route.baseNode);
      }
    }

    if (!res || !res.ok || !json) {
      preferredConvRoute = null;
      throw new Error(
        lastErrBody.error?.message || `Instagram conversation request failed (${res?.status || 500}).`
      );
    }

    const rawThreads = Array.isArray(json.data) ? json.data : [];

    let ownerUsername = config.INSTAGRAM_USERNAME || '';
    const profile = !ownerUsername || !accountId ? await getInstagramProfile(options?.userId).catch(() => null) : null;
    ownerUsername = ownerUsername || profile?.username || '';
    const normOwner = normalizeHandle(ownerUsername);
    const ownerIds = new Set([accountId, pageId, profile?.id].filter(Boolean));

    const threads: InstagramThread[] = rawThreads.map((t: any): InstagramThread => {
      const rawMsgs = t.messages?.data || [];
      const msgs: InstagramMessage[] = sortMessagesNewestFirst(
        rawMsgs.map((m: any) => ({
          id: m.id,
          created_time: m.created_time,
          from: m.from,
          to: m.to,
          message: m.message || (m.attachments ? '[Media Attachment]' : ''),
          attachments: parseMessageAttachments(m),
        }))
      );
      const participants: Array<{ id: string; username: string }> = t.participants?.data || [];
      const lastMsg = msgs[0];

      const isOwnerParticipant = (p?: { id?: string; username?: string }) =>
        Boolean((p?.id && ownerIds.has(p.id)) || (normOwner && normalizeHandle(p?.username) === normOwner));

      let otherUser = { id: '', username: 'friend' };
      for (const p of participants) {
        if ((p.id || p.username) && !isOwnerParticipant(p)) {
          otherUser = { id: p.id || '', username: p.username || 'friend' };
          break;
        }
      }
      if (!otherUser.id) {
        for (const m of msgs) {
          if (m.from?.id && !isOwnerParticipant(m.from)) {
            otherUser = { id: m.from.id, username: m.from.username || 'friend' };
            break;
          }
          const toTarget = m.to?.data?.find((u) => (u.id || u.username) && !isOwnerParticipant(u));
          if (toTarget?.id) {
            otherUser = { id: toTarget.id, username: toTarget.username || 'friend' };
            break;
          }
        }
      }
      if (otherUser.id && otherUser.username && otherUser.username !== 'friend') {
        usernameCache.set(otherUser.id, { expiresAt: Date.now() + 10 * 60_000, username: otherUser.username });
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

    conversationsCache = { expiresAt: Date.now() + 3000, data: threads, tokenSig };
    return threads;
  } catch (err) {
    logger.error('Error fetching Instagram conversations:', err);
    if (!options?.forceFresh && conversationsCache && conversationsCache.tokenSig === tokenSig) {
      return conversationsCache.data;
    }
    throw err instanceof Error ? err : new Error('Instagram conversation sync failed.');
  }
}

export async function getThreadDetails(threadId: string, userId?: string): Promise<InstagramMessage[]> {
  const { token, isIgToken } = await resolveIgAuth(userId);
  if (!token) return [];

  try {
    const fieldVariants = [
      'messages.limit(30){id,created_time,from,to,message,attachments{id,mime_type,image_data,video_data,file_url},shares}',
      'messages.limit(30){id,created_time,from,to,message,attachments{id,mime_type,image_data,video_data,file_url}}',
      'messages.limit(20){id,created_time,from,to,message}',
    ];
    const hosts = isIgToken ? [IG_BASE_URL, META_BASE_URL] : [META_BASE_URL, IG_BASE_URL];

    let res: Response | null = null;
    for (const host of hosts) {
      let hostRejected = false;
      for (const fields of fieldVariants) {
        res = await metaFetch(
          `${host}/${encodeURIComponent(threadId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`
        ).catch(() => null);
        if (res?.ok) break;
        if (!res || res.status !== 400) {
          hostRejected = true;
          break;
        }
      }
      if (res?.ok) break;
      if (hostRejected) continue;
    }

    if (!res || !res.ok) return [];
    const json = await res.json();
    const rawList = json.messages?.data || [];
    return sortMessagesNewestFirst(
      rawList.map((m: any) => ({
        id: m.id,
        created_time: m.created_time,
        from: m.from,
        to: m.to,
        message: m.message || (m.attachments ? '[Media Attachment]' : ''),
        attachments: parseMessageAttachments(m),
      }))
    );
  } catch (err) {
    logger.error('Error fetching thread details:', err);
    return [];
  }
}

export async function sendInstagramMessage(
  recipientId: string,
  text: string,
  userId?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { token, accountId, pageId, isIgToken } = await resolveIgAuth(userId);

  if (!token) {
    return { success: false, error: 'Instagram is not connected. Add a valid server-side access token first.' };
  }

  const tokenSig = token.slice(0, 14);
  const rawEndpoints = isIgToken
    ? [
      `${IG_BASE_URL}/me/messages`,
      ...(accountId ? [`${IG_BASE_URL}/${accountId}/messages`, `${META_BASE_URL}/${accountId}/messages`] : []),
      `${META_BASE_URL}/me/messages`,
    ]
    : [
      ...(pageId ? [`${META_BASE_URL}/${pageId}/messages`] : []),
      ...(accountId ? [`${META_BASE_URL}/${accountId}/messages`] : []),
      `${META_BASE_URL}/me/messages`,
      `${IG_BASE_URL}/me/messages`,
    ];

  const uniqueEndpoints = Array.from(new Set(rawEndpoints));
  const endpoints =
    preferredSendEndpoint && preferredSendEndpoint.tokenSig === tokenSig
      ? [preferredSendEndpoint.endpoint, ...uniqueEndpoints.filter((e) => e !== preferredSendEndpoint?.endpoint)]
      : uniqueEndpoints;

  let lastError = 'Meta API error';
  for (const endpoint of endpoints) {
    try {
      const res = await metaFetch(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text },
          }),
        },
        3500
      );

      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        preferredSendEndpoint = { endpoint, tokenSig };
        conversationsCache = null;
        return { success: true, messageId: json.message_id };
      }
      lastError = json.error?.message || `Meta API error (${res.status})`;
      logger.warn('Instagram send attempt failed, trying fallback endpoint if available', { endpoint, lastError });
    } catch (err: any) {
      lastError = err.message || 'Network error';
    }
  }
  preferredSendEndpoint = null;
  return { success: false, error: lastError };
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
