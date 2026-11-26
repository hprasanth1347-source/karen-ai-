import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { supabaseAdmin } from '../config/supabase.js';
import { loadInstagramTokensWithStatus } from './persistence.service.js';
import { sendTelegramMessage } from '../providers/telegram.js';
import { generateAIReply } from './ai.service.js';
import { wrapUntrustedContent } from './actionPolicy.service.js';

const META_BASE_URL = `https://graph.facebook.com/${config.META_GRAPH_API_VERSION || 'v21.0'}`;

async function getIgCredentials(userId?: string): Promise<{ token: string; accountId: string; status: string }> {
  const stored = await loadInstagramTokensWithStatus(userId).catch(() => ({
    tokens: null,
    status: 'disconnected',
  }));
  const token = stored.tokens?.accessToken || config.INSTAGRAM_ACCESS_TOKEN || config.META_PAGE_ACCESS_TOKEN || '';
  const accountId = stored.tokens?.accountId || config.INSTAGRAM_ACCOUNT_ID || '';
  return {
    token,
    accountId,
    status: token ? 'connected' : stored.status,
  };
}

export interface InstagramConnectionHealth {
  connected: boolean;
  status: string;
  accountId: string;
  username?: string;
  loginFlow: 'instagram' | 'facebook';
  permissions: string[];
  tokenExpiresAt?: string | null;
  lastError?: string;
}

export async function getInstagramConnectionHealth(userId?: string): Promise<InstagramConnectionHealth> {
  const { token, accountId, status } = await getIgCredentials(userId);
  if (!token || !accountId) {
    return {
      connected: false,
      status: status || 'disconnected',
      accountId: accountId || '',
      loginFlow: 'facebook',
      permissions: [],
      lastError: 'Instagram access token or account ID is not configured.',
    };
  }

  try {
    const profileRes = await fetch(
      `${META_BASE_URL}/${encodeURIComponent(accountId)}?fields=id,username,name,profile_picture_url,followers_count,media_count&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const profileJson = (await profileRes.json().catch(() => ({}))) as any;
    if (!profileRes.ok || profileJson.error) {
      return {
        connected: false,
        status: 'needs_reauth',
        accountId,
        loginFlow: 'facebook',
        permissions: [],
        lastError: profileJson.error?.message || `Meta API returned ${profileRes.status}`,
      };
    }

    let permissions: string[] = [];
    const permRes = await fetch(
      `${META_BASE_URL}/me/permissions?access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(5000) }
    ).catch(() => null);
    if (permRes?.ok) {
      const permJson = (await permRes.json().catch(() => ({}))) as {
        data?: Array<{ permission: string; status: string }>;
      };
      permissions = (permJson.data || []).filter((p) => p.status === 'granted').map((p) => p.permission);
    }

    if (supabaseAdmin) {
      await supabaseAdmin
        .from('instagram_accounts')
        .upsert(
          {
            ig_account_id: profileJson.id || accountId,
            username: profileJson.username || config.INSTAGRAM_USERNAME || 'instagram',
            name: profileJson.name || null,
            profile_picture_url: profileJson.profile_picture_url || null,
            followers_count: profileJson.followers_count || 0,
            media_count: profileJson.media_count || 0,
            permissions,
            connection_status: 'connected',
            last_health_check_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'ig_account_id' }
        )
        .then(() => { }, () => { });
    }

    return {
      connected: true,
      status: 'connected',
      accountId: profileJson.id || accountId,
      username: profileJson.username,
      loginFlow: permissions.some((p) => p.startsWith('instagram_business_')) ? 'instagram' : 'facebook',
      permissions,
    };
  } catch (err) {
    return {
      connected: false,
      status: 'error',
      accountId,
      loginFlow: 'facebook',
      permissions: [],
      lastError: err instanceof Error ? err.message : 'Health check failed',
    };
  }
}

// ─── Reels Hub ────────────────────────────────────────────────────────────────

export interface ReelHubItem {
  id: string;
  source: 'my_reels' | 'tagged_reels';
  creatorUsername: string;
  caption: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  permalink?: string;
  publishedAt: string;
  viewsCount?: number | null;
  likeCount?: number | null;
  commentsCount?: number | null;
  sharesCount?: number | null;
  mediaProductType?: string;
}

export async function getMyReels(userId?: string): Promise<ReelHubItem[]> {
  const { token, accountId } = await getIgCredentials(userId);
  if (!token || !accountId) return [];

  const fields = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
  const res = await fetch(
    `${META_BASE_URL}/${encodeURIComponent(accountId)}/media?fields=${fields}&limit=25&access_token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(8000) }
  ).catch(() => null);

  if (!res?.ok) return [];
  const json = (await res.json().catch(() => ({}))) as { data?: any[] };
  const items = (json.data || []).filter(
    (m) => m.media_product_type === 'REELS' || m.media_type === 'VIDEO'
  );

  const mapped: ReelHubItem[] = items.map((m) => ({
    id: m.id,
    source: 'my_reels',
    creatorUsername: config.INSTAGRAM_USERNAME || 'me',
    caption: m.caption || '',
    thumbnailUrl: m.thumbnail_url || m.media_url,
    mediaUrl: m.media_url,
    permalink: m.permalink,
    publishedAt: m.timestamp,
    likeCount: m.like_count ?? null,
    commentsCount: m.comments_count ?? null,
    mediaProductType: m.media_product_type || m.media_type,
  }));

  if (supabaseAdmin && mapped.length > 0) {
    await supabaseAdmin
      .from('instagram_reels')
      .upsert(
        mapped.map((r) => ({
          id: r.id,
          source: r.source,
          creator_username: r.creatorUsername,
          caption: r.caption,
          thumbnail_url: r.thumbnailUrl || null,
          media_url: r.mediaUrl || null,
          permalink: r.permalink || null,
          like_count: r.likeCount,
          comments_count: r.commentsCount,
          published_at: r.publishedAt,
          synced_at: new Date().toISOString(),
        })),
        { onConflict: 'id' }
      )
      .then(() => { }, () => { });
  }

  return mapped;
}

export async function getTaggedReels(userId?: string): Promise<ReelHubItem[]> {
  const { token, accountId } = await getIgCredentials(userId);

  // 1. Try live Meta Graph API if credentials are present
  if (token && accountId) {
    try {
      const fields = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,username';
      const res = await fetch(
        `${META_BASE_URL}/${encodeURIComponent(accountId)}/tags?fields=${fields}&limit=25&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(8000) }
      ).catch(() => null);

      if (res?.ok) {
        const json = (await res.json().catch(() => ({}))) as { data?: any[] };
        const items = (json.data || []).filter(
          (m) => m.media_product_type === 'REELS' || m.media_type === 'VIDEO' || m.media_type === 'IMAGE' || m.media_type === 'CAROUSEL_ALBUM'
        );
        if (items.length > 0) {
          const mapped: ReelHubItem[] = items.map((m) => ({
            id: m.id,
            source: 'tagged_reels',
            creatorUsername: m.username || 'creator_friend',
            caption: m.caption || 'Tagged with @hari.ii_14',
            thumbnailUrl: m.thumbnail_url || m.media_url,
            mediaUrl: m.media_url,
            permalink: m.permalink || `https://www.instagram.com/p/${m.id}/`,
            publishedAt: m.timestamp || new Date().toISOString(),
            mediaProductType: m.media_product_type || m.media_type,
          }));

          // Persist live tagged reels for caching
          if (supabaseAdmin) {
            await supabaseAdmin
              .from('instagram_reels')
              .upsert(
                mapped.map((r) => ({
                  id: r.id,
                  source: r.source,
                  creator_username: r.creatorUsername,
                  caption: r.caption,
                  thumbnail_url: r.thumbnailUrl || null,
                  media_url: r.mediaUrl || null,
                  permalink: r.permalink || null,
                  published_at: r.publishedAt,
                  synced_at: new Date().toISOString(),
                })),
                { onConflict: 'id' }
              )
              .then(() => { }, () => { });
          }

          return mapped;
        }
      }
    } catch (err) {
      logger.warn('Failed to fetch tagged reels from Meta Graph API:', err);
    }
  }

  // 2. Fallback to cached/stored tagged reels
  if (supabaseAdmin) {
    const { data: dbTagged } = await supabaseAdmin
      .from('instagram_reels')
      .select('*')
      .eq('source', 'tagged_reels')
      .order('published_at', { ascending: false })
      .limit(10);
    if (dbTagged && dbTagged.length > 0) {
      return dbTagged.map((r: any) => ({
        id: r.id,
        source: 'tagged_reels',
        creatorUsername: r.creator_username,
        caption: r.caption,
        thumbnailUrl: r.thumbnail_url,
        mediaUrl: r.media_url,
        permalink: r.permalink,
        publishedAt: r.published_at,
        likeCount: r.like_count,
        commentsCount: r.comments_count,
        mediaProductType: 'REELS',
      }));
    }
  }

  // 3. No fake fallback data: return empty when no live or cached tagged reels exist
  return [];
}

export async function getAllReels(options?: {
  source?: 'my_reels' | 'tagged_reels' | 'all';
  search?: string;
  userId?: string;
}): Promise<{ myReels: ReelHubItem[]; taggedReels: ReelHubItem[]; all: ReelHubItem[] }> {
  const [myReels, taggedReels] = await Promise.all([
    getMyReels(options?.userId),
    getTaggedReels(options?.userId),
  ]);
  let combined =
    options?.source === 'my_reels'
      ? myReels
      : options?.source === 'tagged_reels'
        ? taggedReels
        : [...myReels, ...taggedReels];

  if (options?.search) {
    const q = options.search.toLowerCase();
    combined = combined.filter(
      (r) => r.caption.toLowerCase().includes(q) || r.creatorUsername.toLowerCase().includes(q)
    );
  }
  combined.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return { myReels, taggedReels, all: combined };
}

// ─── Stories Hub & Story Insights ─────────────────────────────────────────────

export interface StoryHubItem {
  id: string;
  mediaType: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  permalink?: string;
  publishedAt: string;
  expiresAt?: string;
  insights?: {
    impressions: number | null;
    reach: number | null;
    replies: number | null;
    exits: number | null;
    tapsForward: number | null;
    tapsBack: number | null;
  };
}

export async function getStoryInsights(storyId: string, token: string): Promise<StoryHubItem['insights']> {
  const metrics = 'impressions,reach,replies,exits,taps_forward,taps_back';
  const res = await fetch(
    `${META_BASE_URL}/${encodeURIComponent(storyId)}/insights?metric=${metrics}&access_token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(6000) }
  ).catch(() => null);

  if (!res?.ok) return undefined;
  const json = (await res.json().catch(() => ({}))) as {
    data?: Array<{ name: string; values?: Array<{ value: number }> }>;
  };
  const getVal = (name: string): number | null => {
    const val = json.data?.find((m) => m.name === name)?.values?.[0]?.value;
    if (typeof val !== 'number' || val < 0) return null; // preserve -1/unavailable as null, never fabricate
    return val;
  };

  const insights = {
    impressions: getVal('impressions'),
    reach: getVal('reach'),
    replies: getVal('replies'),
    exits: getVal('exits'),
    tapsForward: getVal('taps_forward'),
    tapsBack: getVal('taps_back'),
  };

  if (supabaseAdmin) {
    await supabaseAdmin
      .from('instagram_story_insights')
      .insert({
        story_id: storyId,
        impressions: insights.impressions,
        reach: insights.reach,
        replies: insights.replies,
        exits: insights.exits,
        taps_forward: insights.tapsForward,
        taps_back: insights.tapsBack,
        source: 'api',
      })
      .then(() => { }, () => { });
  }

  return insights;
}

export async function getActiveStories(userId?: string): Promise<StoryHubItem[]> {
  const { token, accountId } = await getIgCredentials(userId);
  if (!token || !accountId) return [];

  const res = await fetch(
    `${META_BASE_URL}/${encodeURIComponent(accountId)}/stories?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp&access_token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(8000) }
  ).catch(() => null);

  if (!res?.ok) return [];
  const json = (await res.json().catch(() => ({}))) as { data?: any[] };
  const raw = json.data || [];

  const stories = await Promise.all(
    raw.map(async (s): Promise<StoryHubItem> => {
      const insights = await getStoryInsights(s.id, token).catch(() => undefined);
      const publishedMs = s.timestamp ? new Date(s.timestamp).getTime() : Date.now();
      return {
        id: s.id,
        mediaType: s.media_type || 'IMAGE',
        mediaUrl: s.media_url,
        thumbnailUrl: s.thumbnail_url || s.media_url,
        permalink: s.permalink,
        publishedAt: s.timestamp,
        expiresAt: new Date(publishedMs + 24 * 60 * 60 * 1000).toISOString(),
        insights,
      };
    })
  );

  return stories;
}

// ─── Follower & Unfollower Monitor (Permitted Data Only) ─────────────────────

export interface InstagramFollowerUser {
  id: string;
  username: string;
  name?: string;
  profilePictureUrl?: string;
  status: 'FOLLOWER' | 'FOLLOWING' | 'MUTUAL';
  firstObserved: string;
  lastActive: string;
  detectionStatus: 'ACTIVE' | 'NEW' | 'UNCERTAIN';
}

export interface FollowerMonitorData {
  followersCount: number;
  followingCount: number;
  mutualCount: number;
  followers: InstagramFollowerUser[];
  following: InstagramFollowerUser[];
  recentEvents: Array<{ type: string; username: string; summary: string; timestamp: string }>;
  uncertainUnfollowsNote: string;
}

export async function getFollowersAndFollowing(userId?: string): Promise<FollowerMonitorData> {
  const { token, accountId } = await getIgCredentials(userId);
  let followersCount = 0;
  let followingCount = 0;

  if (token && accountId) {
    try {
      const res = await fetch(
        `${META_BASE_URL}/${encodeURIComponent(accountId)}?fields=followers_count,follows_count&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(8000) }
      ).catch(() => null);
      if (res?.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          followers_count?: number;
          follows_count?: number;
        };
        if (typeof json.followers_count === 'number') followersCount = json.followers_count;
        if (typeof json.follows_count === 'number') followingCount = json.follows_count;
      }
    } catch (err) {
      logger.warn('Failed to fetch followers_count/follows_count from Meta Graph API:', err);
    }
  }

  let followers: InstagramFollowerUser[] = [];
  let following: InstagramFollowerUser[] = [];
  let recentEvents: Array<{ type: string; username: string; summary: string; timestamp: string }> = [];

  if (supabaseAdmin) {
    if (!followersCount && accountId) {
      const { data: acc } = await supabaseAdmin
        .from('instagram_accounts')
        .select('followers_count')
        .eq('ig_account_id', accountId)
        .maybeSingle();
      if (typeof acc?.followers_count === 'number') followersCount = acc.followers_count;
    }

    const { data: observedRows } = await supabaseAdmin
      .from('instagram_followers')
      .select('*')
      .order('last_observed_at', { ascending: false })
      .limit(100);

    if (Array.isArray(observedRows) && observedRows.length > 0) {
      const mapped: InstagramFollowerUser[] = observedRows.map((row: any) => ({
        id: row.ig_scoped_id || row.id,
        username: row.username || 'unknown',
        name: row.name || undefined,
        profilePictureUrl: row.profile_picture_url || undefined,
        status: (row.relationship_status || 'FOLLOWER') as 'FOLLOWER' | 'FOLLOWING' | 'MUTUAL',
        firstObserved: row.first_observed_at || row.created_at || new Date().toISOString(),
        lastActive: row.last_observed_at || row.updated_at || new Date().toISOString(),
        detectionStatus: (row.detection_status || 'ACTIVE') as 'ACTIVE' | 'NEW' | 'UNCERTAIN',
      }));
      followers = mapped.filter((u) => u.status === 'FOLLOWER' || u.status === 'MUTUAL');
      following = mapped.filter((u) => u.status === 'FOLLOWING' || u.status === 'MUTUAL');
    }

    const { data: logs } = await supabaseAdmin
      .from('instagram_activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (logs && logs.length > 0) {
      recentEvents = logs.map((l: any) => ({
        type: l.event_type,
        username: l.actor_username || 'unknown',
        summary: l.summary,
        timestamp: l.created_at,
      }));
    }
  }

  const mutualCount = followers.filter((u) => u.status === 'MUTUAL').length;

  return {
    followersCount,
    followingCount,
    mutualCount,
    followers,
    following,
    recentEvents,
    uncertainUnfollowsNote:
      'Meta Graph API provides live follower/following counts but does not expose a full follower/following username list. Only real accounts observed via permitted webhooks/snapshots are listed here; missing-account unfollow alerts are labeled "Uncertain".',
  };
}

export async function getFollowerMonitorSummary(userId?: string): Promise<{
  followersCount: number;
  recentEvents: Array<{ type: string; username: string; summary: string; timestamp: string }>;
  uncertainUnfollowsNote: string;
}> {
  const data = await getFollowersAndFollowing(userId);
  return {
    followersCount: data.followersCount,
    recentEvents: data.recentEvents,
    uncertainUnfollowsNote: data.uncertainUnfollowsNote,
  };
}

// ─── Comments & Mentions Webhook Handlers ────────────────────────────────────

export async function handleInstagramCommentEvent(input: {
  commentId: string;
  mediaId: string;
  username: string;
  text: string;
  autoReply?: boolean;
}): Promise<void> {
  const safeText = wrapUntrustedContent('instagram_comment', input.text);
  let aiReplyText = '';
  try {
    const ai = await generateAIReply(
      `Draft a short, friendly Instagram comment reply to @${input.username} who commented: ${safeText}`,
      [],
      undefined,
      undefined,
      AbortSignal.timeout(8000),
      { skipSkills: true }
    );
    aiReplyText = ai.reply;
  } catch (err) {
    logger.warn('Failed to draft comment reply', { err });
  }

  if (supabaseAdmin) {
    await supabaseAdmin
      .from('instagram_comments')
      .upsert({
        id: input.commentId,
        media_id: input.mediaId,
        username: input.username,
        text: input.text,
        ai_reply_text: aiReplyText || null,
        replied: false,
      })
      .then(() => { }, () => { });
  }

  await sendTelegramMessage(
    `KAREN AI - INSTAGRAM ALERT\n\nNEW COMMENT\n\nFrom: @${input.username}\nMedia ID: ${input.mediaId}\nSuggested Reply: ${aiReplyText.slice(0, 200)}`
  ).catch(() => { });
}

export async function handleInstagramMentionEvent(input: {
  id: string;
  mediaId?: string;
  creatorUsername: string;
  permalink?: string;
  caption?: string;
}): Promise<void> {
  if (supabaseAdmin) {
    await supabaseAdmin
      .from('instagram_mentions')
      .upsert({
        id: input.id,
        media_id: input.mediaId || null,
        creator_username: input.creatorUsername,
        permalink: input.permalink || null,
        caption: input.caption || null,
      })
      .then(() => { }, () => { });
  }

  await sendTelegramMessage(
    `KAREN AI - INSTAGRAM ALERT\n\nNEW MENTION / TAGGED REEL\n\nCreator: @${input.creatorUsername}\n${input.permalink ? `Open: ${input.permalink}` : ''}`
  ).catch(() => { });
}

// ─── Instagram Notes Activity Monitor ─────────────────────────────────────────

export interface InstagramNoteActivityItem {
  id: string;
  eventKey: string;
  activityType: 'note_reply' | 'note_like' | 'unsupported';
  noteId?: string;
  noteText?: string;
  actorUsername: string;
  replyText?: string;
  apiSupported: boolean;
  timestampIst: string;
}

const notifiedNoteEventKeys = new Set<string>();
const inMemoryNoteActivity: InstagramNoteActivityItem[] = [];

export async function handleInstagramNoteActivityEvent(input: {
  eventKey: string;
  activityType: 'note_reply' | 'note_like' | 'unsupported';
  noteId?: string;
  noteText?: string;
  actorId?: string;
  actorUsername?: string;
  replyText?: string;
}): Promise<{ recorded: boolean; duplicate: boolean }> {
  if (notifiedNoteEventKeys.has(input.eventKey)) {
    return { recorded: false, duplicate: true };
  }
  notifiedNoteEventKeys.add(input.eventKey);

  const timestampIst = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const actorUsername = input.actorUsername || 'unknown';
  const apiSupported = input.activityType === 'note_reply';

  const item: InstagramNoteActivityItem = {
    id: input.eventKey,
    eventKey: input.eventKey,
    activityType: input.activityType,
    noteId: input.noteId,
    noteText: input.noteText,
    actorUsername,
    replyText: input.replyText,
    apiSupported,
    timestampIst,
  };
  inMemoryNoteActivity.unshift(item);

  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.from('instagram_notes_activity').insert({
      event_key: input.eventKey,
      activity_type: input.activityType,
      note_id: input.noteId || null,
      note_text: input.noteText || null,
      actor_id: input.actorId || null,
      actor_username: actorUsername,
      reply_text: input.replyText || null,
      api_supported: apiSupported,
    });
    if (error && error.code === '23505') {
      return { recorded: false, duplicate: true };
    }
  }

  const label = input.activityType === 'note_reply' ? 'NOTE REPLY' : input.activityType === 'note_like' ? 'NOTE LIKE' : 'UNSUPPORTED NOTE EVENT';
  await sendTelegramMessage(
    `KAREN AI - INSTAGRAM NOTES ALERT\n\nActivity: ${label}\nUser: @${actorUsername}${input.noteText ? `\nNote: "${input.noteText.slice(0, 120)}"` : ''
    }${input.replyText ? `\nReply: "${input.replyText.slice(0, 140)}"` : ''}\nTime: ${timestampIst} IST`
  ).catch(() => { });

  return { recorded: true, duplicate: false };
}

export async function getInstagramNotesActivity(): Promise<{
  events: InstagramNoteActivityItem[];
  noteLikesSupported: boolean;
  noteRepliesSupported: boolean;
  supportNotice: string;
}> {
  let events = [...inMemoryNoteActivity];
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from('instagram_notes_activity')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    if (data && data.length > 0) {
      events = data.map((row: any) => ({
        id: row.id,
        eventKey: row.event_key,
        activityType: row.activity_type,
        noteId: row.note_id || undefined,
        noteText: row.note_text || undefined,
        actorUsername: row.actor_username || 'unknown',
        replyText: row.reply_text || undefined,
        apiSupported: Boolean(row.api_supported),
        timestampIst: new Date(row.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      }));
    }
  }

  return {
    events,
    noteLikesSupported: false,
    noteRepliesSupported: true,
    supportNotice:
      'Official Meta Graph API supports Instagram Note replies delivered via DM webhooks. Instagram Note likes are not exposed by Meta Graph API (shown as Unavailable instead of fabricated).',
  };
}
