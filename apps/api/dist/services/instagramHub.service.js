import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { supabaseAdmin } from '../config/supabase.js';
import { loadInstagramTokensWithStatus } from './persistence.service.js';
import { sendTelegramMessage } from '../providers/telegram.js';
import { generateAIReply } from './ai.service.js';
import { wrapUntrustedContent } from './actionPolicy.service.js';
const META_BASE_URL = `https://graph.facebook.com/${config.META_GRAPH_API_VERSION || 'v21.0'}`;
async function getIgCredentials(userId) {
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
export async function getInstagramConnectionHealth(userId) {
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
        const profileRes = await fetch(`${META_BASE_URL}/${encodeURIComponent(accountId)}?fields=id,username,name,profile_picture_url,followers_count,media_count&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
        const profileJson = (await profileRes.json().catch(() => ({})));
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
        let permissions = [];
        const permRes = await fetch(`${META_BASE_URL}/me/permissions?access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
        if (permRes?.ok) {
            const permJson = (await permRes.json().catch(() => ({})));
            permissions = (permJson.data || []).filter((p) => p.status === 'granted').map((p) => p.permission);
        }
        if (supabaseAdmin) {
            await supabaseAdmin
                .from('instagram_accounts')
                .upsert({
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
            }, { onConflict: 'ig_account_id' })
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
    }
    catch (err) {
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
export async function getMyReels(userId) {
    const { token, accountId } = await getIgCredentials(userId);
    if (!token || !accountId)
        return [];
    const fields = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
    const res = await fetch(`${META_BASE_URL}/${encodeURIComponent(accountId)}/media?fields=${fields}&limit=25&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!res?.ok)
        return [];
    const json = (await res.json().catch(() => ({})));
    const items = (json.data || []).filter((m) => m.media_product_type === 'REELS' || m.media_type === 'VIDEO');
    const mapped = items.map((m) => ({
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
            .upsert(mapped.map((r) => ({
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
        })), { onConflict: 'id' })
            .then(() => { }, () => { });
    }
    return mapped;
}
export async function getTaggedReels(userId) {
    const { token, accountId } = await getIgCredentials(userId);
    if (!token || !accountId)
        return [];
    const fields = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,username';
    const res = await fetch(`${META_BASE_URL}/${encodeURIComponent(accountId)}/tags?fields=${fields}&limit=25&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!res?.ok)
        return [];
    const json = (await res.json().catch(() => ({})));
    const items = (json.data || []).filter((m) => m.media_product_type === 'REELS' || m.media_type === 'VIDEO');
    return items.map((m) => ({
        id: m.id,
        source: 'tagged_reels',
        creatorUsername: m.username || 'unknown',
        caption: m.caption || '',
        thumbnailUrl: m.thumbnail_url || m.media_url,
        mediaUrl: m.media_url,
        permalink: m.permalink,
        publishedAt: m.timestamp,
        mediaProductType: m.media_product_type || m.media_type,
    }));
}
export async function getAllReels(options) {
    const [myReels, taggedReels] = await Promise.all([
        getMyReels(options?.userId),
        getTaggedReels(options?.userId),
    ]);
    let combined = options?.source === 'my_reels'
        ? myReels
        : options?.source === 'tagged_reels'
            ? taggedReels
            : [...myReels, ...taggedReels];
    if (options?.search) {
        const q = options.search.toLowerCase();
        combined = combined.filter((r) => r.caption.toLowerCase().includes(q) || r.creatorUsername.toLowerCase().includes(q));
    }
    combined.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    return { myReels, taggedReels, all: combined };
}
export async function getStoryInsights(storyId, token) {
    const metrics = 'impressions,reach,replies,exits,taps_forward,taps_back';
    const res = await fetch(`${META_BASE_URL}/${encodeURIComponent(storyId)}/insights?metric=${metrics}&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(6000) }).catch(() => null);
    if (!res?.ok)
        return undefined;
    const json = (await res.json().catch(() => ({})));
    const getVal = (name) => {
        const val = json.data?.find((m) => m.name === name)?.values?.[0]?.value;
        if (typeof val !== 'number' || val < 0)
            return null; // preserve -1/unavailable as null, never fabricate
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
export async function getActiveStories(userId) {
    const { token, accountId } = await getIgCredentials(userId);
    if (!token || !accountId)
        return [];
    const res = await fetch(`${META_BASE_URL}/${encodeURIComponent(accountId)}/stories?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!res?.ok)
        return [];
    const json = (await res.json().catch(() => ({})));
    const raw = json.data || [];
    const stories = await Promise.all(raw.map(async (s) => {
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
    }));
    return stories;
}
// ─── Follower & Unfollower Monitor (Permitted Data Only) ─────────────────────
export async function getFollowerMonitorSummary(userId) {
    const health = await getInstagramConnectionHealth(userId);
    let followersCount = 0;
    if (supabaseAdmin && health.accountId) {
        const { data } = await supabaseAdmin
            .from('instagram_accounts')
            .select('followers_count')
            .eq('ig_account_id', health.accountId)
            .maybeSingle();
        followersCount = data?.followers_count || 0;
    }
    let recentEvents = [];
    if (supabaseAdmin) {
        const { data: logs } = await supabaseAdmin
            .from('instagram_activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);
        if (logs) {
            recentEvents = logs.map((l) => ({
                type: l.event_type,
                username: l.actor_username || 'unknown',
                summary: l.summary,
                timestamp: l.created_at,
            }));
        }
    }
    return {
        followersCount,
        recentEvents,
        uncertainUnfollowsNote: 'Meta Graph API does not expose a full follower username list. Missing-account unfollow alerts are labeled "Uncertain" unless confirmed via permitted webhooks.',
    };
}
// ─── Comments & Mentions Webhook Handlers ────────────────────────────────────
export async function handleInstagramCommentEvent(input) {
    const safeText = wrapUntrustedContent('instagram_comment', input.text);
    let aiReplyText = '';
    try {
        const ai = await generateAIReply(`Draft a short, friendly Instagram comment reply to @${input.username} who commented: ${safeText}`, [], undefined, undefined, AbortSignal.timeout(8000), { skipSkills: true });
        aiReplyText = ai.reply;
    }
    catch (err) {
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
    await sendTelegramMessage(`KAREN AI - INSTAGRAM ALERT\n\nNEW COMMENT\n\nFrom: @${input.username}\nMedia ID: ${input.mediaId}\nSuggested Reply: ${aiReplyText.slice(0, 200)}`).catch(() => { });
}
export async function handleInstagramMentionEvent(input) {
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
    await sendTelegramMessage(`KAREN AI - INSTAGRAM ALERT\n\nNEW MENTION / TAGGED REEL\n\nCreator: @${input.creatorUsername}\n${input.permalink ? `Open: ${input.permalink}` : ''}`).catch(() => { });
}
const notifiedNoteEventKeys = new Set();
const inMemoryNoteActivity = [];
export async function handleInstagramNoteActivityEvent(input) {
    if (notifiedNoteEventKeys.has(input.eventKey)) {
        return { recorded: false, duplicate: true };
    }
    notifiedNoteEventKeys.add(input.eventKey);
    const timestampIst = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const actorUsername = input.actorUsername || 'unknown';
    const apiSupported = input.activityType === 'note_reply';
    const item = {
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
    await sendTelegramMessage(`KAREN AI - INSTAGRAM NOTES ALERT\n\nActivity: ${label}\nUser: @${actorUsername}${input.noteText ? `\nNote: "${input.noteText.slice(0, 120)}"` : ''}${input.replyText ? `\nReply: "${input.replyText.slice(0, 140)}"` : ''}\nTime: ${timestampIst} IST`).catch(() => { });
    return { recorded: true, duplicate: false };
}
export async function getInstagramNotesActivity() {
    let events = [...inMemoryNoteActivity];
    if (supabaseAdmin) {
        const { data } = await supabaseAdmin
            .from('instagram_notes_activity')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(30);
        if (data && data.length > 0) {
            events = data.map((row) => ({
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
        supportNotice: 'Official Meta Graph API supports Instagram Note replies delivered via DM webhooks. Instagram Note likes are not exposed by Meta Graph API (shown as Unavailable instead of fabricated).',
    };
}
