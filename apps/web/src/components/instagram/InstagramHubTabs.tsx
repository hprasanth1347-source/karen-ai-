import React, { useEffect, useState } from 'react';
import { Film, Share2, Eye, Activity, ExternalLink, Copy, Check, Users, Search } from 'lucide-react';
import { api } from '../../lib/api';

interface InstagramFollowerUser {
  id: string;
  username: string;
  name?: string;
  profilePictureUrl?: string;
  status: 'FOLLOWER' | 'FOLLOWING' | 'MUTUAL';
  firstObserved: string;
  lastActive: string;
  detectionStatus: 'ACTIVE' | 'NEW' | 'UNCERTAIN';
}

interface FollowersMonitorData {
  followersCount: number;
  followingCount: number;
  mutualCount: number;
  followers: InstagramFollowerUser[];
  following: InstagramFollowerUser[];
  recentEvents: Array<{ type: string; username: string; summary: string; timestamp: string }>;
  uncertainUnfollowsNote: string;
}

interface ReelItem {
  id: string;
  source: 'my_reels' | 'tagged_reels';
  creatorUsername: string;
  caption: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  permalink?: string;
  publishedAt: string;
  likeCount?: number | null;
  commentsCount?: number | null;
}

interface StoryItem {
  id: string;
  mediaType: string;
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

interface MonitorSummary {
  followersCount: number;
  recentEvents: Array<{ type: string; username: string; summary: string; timestamp: string }>;
  uncertainUnfollowsNote: string;
}

export const InstagramHubTabs: React.FC = () => {
  const [section, setSection] = useState<'reels' | 'stories' | 'followers' | 'monitor'>('reels');
  const [reelsTab, setReelsTab] = useState<'all' | 'my_reels' | 'tagged_reels'>('all');
  const [reelSearch, setReelSearch] = useState('');
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [monitor, setMonitor] = useState<MonitorSummary | null>(null);
  const [followersData, setFollowersData] = useState<FollowersMonitorData | null>(null);
  const [followTab, setFollowTab] = useState<'followers' | 'following' | 'mutual'>('followers');
  const [followSearch, setFollowSearch] = useState('');
  const [notesData, setNotesData] = useState<{
    events: Array<{ id: string; activityType: string; actorUsername: string; noteText?: string; replyText?: string; timestampIst: string }>;
    noteLikesSupported: boolean;
    supportNotice: string;
  } | null>(null);
  const [shareOpenId, setShareOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: { all: ReelItem[]; myReels?: ReelItem[]; taggedReels?: ReelItem[] } }>(
        `/instagram/reels?source=${reelsTab}&search=${encodeURIComponent(reelSearch)}`
      )
      .then((res) => {
        const payload = res.data?.data;
        if (reelsTab === 'tagged_reels' && Array.isArray(payload?.taggedReels) && (!payload?.all || payload.all.length === 0)) {
          setReels(payload.taggedReels);
        } else {
          setReels(payload?.all || []);
        }
      })
      .catch(() => setReels([]));
  }, [reelsTab, reelSearch]);

  useEffect(() => {
    if (section === 'stories') {
      api
        .get<{ data: StoryItem[] }>('/instagram/stories')
        .then((res) => setStories(res.data?.data || []))
        .catch(() => setStories([]));
    } else if (section === 'followers') {
      api
        .get<{ data: FollowersMonitorData }>('/instagram/followers')
        .then((res) => setFollowersData(res.data?.data || null))
        .catch(() => setFollowersData(null));
    } else if (section === 'monitor') {
      api
        .get<{ data: MonitorSummary }>('/instagram/monitor')
        .then((res) => setMonitor(res.data?.data || null))
        .catch(() => setMonitor(null));
      api
        .get<{ data: NonNullable<typeof notesData> }>('/instagram/notes-activity')
        .then((res) => setNotesData(res.data?.data || null))
        .catch(() => setNotesData(null));
    }
  }, [section]);

  const handleCopyLink = (id: string, url?: string) => {
    if (!url) return;
    navigator.clipboard?.writeText(url).catch(() => { });
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleNativeShare = (reel: ReelItem) => {
    if (navigator.share && reel.permalink) {
      navigator.share({ title: `Reel by @${reel.creatorUsername}`, url: reel.permalink }).catch(() => { });
    }
  };

  const fmtMetric = (val: number | null | undefined) =>
    val === null || val === undefined ? 'Below threshold / N/A' : String(val);

  return (
    <div className="bg-white border-3 border-ink p-5 shadow-brutal space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-ink pb-3">
        <h2 className="text-base font-black uppercase">Instagram Hub: Reels, Stories &amp; Activity</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'reels', label: 'Reels Hub', icon: Film },
            { id: 'stories', label: 'Stories & Analytics', icon: Eye },
            { id: 'followers', label: 'Followers & Following', icon: Users },
            { id: 'monitor', label: 'Activity Monitor', icon: Activity },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSection(t.id as 'reels' | 'stories' | 'followers' | 'monitor')}
                className={`px-3 py-1.5 text-xs font-bold border-2 border-ink flex items-center gap-1.5 ${section === t.id ? 'bg-coral text-white' : 'bg-cream-50 hover:bg-yellow/40'
                  }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {section === 'reels' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="flex gap-1.5">
              {[
                { id: 'all', label: 'All Reels' },
                { id: 'my_reels', label: 'My Reels' },
                { id: 'tagged_reels', label: 'Tagged Reels' },
              ].map((rt) => (
                <button
                  key={rt.id}
                  type="button"
                  onClick={() => setReelsTab(rt.id as 'all' | 'my_reels' | 'tagged_reels')}
                  className={`px-2.5 py-1 text-xs font-bold border-2 border-ink ${reelsTab === rt.id ? 'bg-ink text-white' : 'bg-white'
                    }`}
                >
                  {rt.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={reelSearch}
              onChange={(e) => setReelSearch(e.target.value)}
              placeholder="Search reels by caption or creator..."
              className="border-2 border-ink px-2.5 py-1 text-xs sm:w-64"
            />
          </div>

          {reels.length === 0 ? (
            <p className="text-xs font-mono text-ink-muted">
              {reelsTab === 'tagged_reels'
                ? 'No Tagged Reels found from Meta Graph API (/{ig-user-id}/tags).'
                : 'No Reels loaded yet (connect Instagram to sync My Reels and Tagged Reels).'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {reels.map((r) => (
                <div key={r.id} className="border-2 border-ink bg-cream-50 p-3 space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="px-1.5 py-0.5 border border-ink bg-white font-bold uppercase">
                      {r.source === 'my_reels' ? 'My Reel' : 'Tagged Reel'}
                    </span>
                    <span>@{r.creatorUsername}</span>
                  </div>
                  {r.thumbnailUrl && (
                    <img
                      src={r.thumbnailUrl}
                      alt={r.caption.slice(0, 40) || 'Reel'}
                      referrerPolicy="no-referrer"
                      className="w-full h-36 object-cover border border-ink"
                    />
                  )}
                  <p className="text-xs line-clamp-2">{r.caption || 'No caption'}</p>
                  <div className="flex items-center justify-between text-[11px] font-mono text-ink-muted">
                    <span>Likes: {r.likeCount ?? '—'} | Comments: {r.commentsCount ?? '—'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {r.permalink && (
                      <a
                        href={r.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 border border-ink bg-white text-[11px] font-bold flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open Reel
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setShareOpenId(shareOpenId === r.id ? null : r.id)}
                      className="px-2 py-1 border border-ink bg-yellow text-[11px] font-bold flex items-center gap-1"
                    >
                      <Share2 className="w-3 h-3" />
                      Share
                    </button>
                  </div>
                  {shareOpenId === r.id && r.permalink && (
                    <div className="border border-ink bg-white p-2 text-[11px] space-y-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => handleCopyLink(r.id, r.permalink)} className="px-2 py-0.5 border border-ink bg-cream-50 flex items-center gap-1">
                          {copiedId === r.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          Copy Link
                        </button>
                        {'share' in navigator && (
                          <button type="button" onClick={() => handleNativeShare(r)} className="px-2 py-0.5 border border-ink bg-cream-50">
                            Device Share
                          </button>
                        )}
                        <a href={`https://wa.me/?text=${encodeURIComponent(r.permalink)}`} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 border border-ink bg-mint">
                          WhatsApp
                        </a>
                        <a href={`https://t.me/share/url?url=${encodeURIComponent(r.permalink)}`} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 border border-ink bg-cream-50">
                          Telegram
                        </a>
                      </div>
                      <p className="text-[10px] text-ink-muted">Note: Shares the Reel URL; automatic Story reposting is not supported by Meta API.</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === 'stories' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-muted">
              Individual Story viewer usernames are not exposed by Meta Graph API. Use <strong>Open Instagram</strong> to inspect viewers.
            </p>
            <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" className="btn-teal px-3 py-1 text-xs font-bold">
              Open Instagram
            </a>
          </div>
          {stories.length === 0 ? (
            <p className="text-xs font-mono text-ink-muted">No active Stories found right now.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {stories.map((s) => (
                <div key={s.id} className="border-2 border-ink bg-cream-50 p-3 space-y-2 text-xs">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="font-bold">{s.mediaType}</span>
                    <span>ID: {s.id}</span>
                  </div>
                  {s.insights && (
                    <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono bg-white border border-ink p-2">
                      <div>Impr: {fmtMetric(s.insights.impressions)}</div>
                      <div>Reach: {fmtMetric(s.insights.reach)}</div>
                      <div>Replies: {fmtMetric(s.insights.replies)}</div>
                      <div>Exits: {fmtMetric(s.insights.exits)}</div>
                      <div>Fwd: {fmtMetric(s.insights.tapsForward)}</div>
                      <div>Back: {fmtMetric(s.insights.tapsBack)}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === 'followers' && (
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 border-2 border-ink bg-cream-50">
              <div className="text-[10px] font-mono text-ink-muted uppercase">Total Followers</div>
              <div className="text-xl font-black">{followersData?.followersCount ?? 0}</div>
            </div>
            <div className="p-3 border-2 border-ink bg-cream-50">
              <div className="text-[10px] font-mono text-ink-muted uppercase">Following</div>
              <div className="text-xl font-black">{followersData?.followingCount ?? 0}</div>
            </div>
            <div className="p-3 border-2 border-ink bg-mint/30">
              <div className="text-[10px] font-mono text-ink-muted uppercase">Mutual Connections</div>
              <div className="text-xl font-black">{followersData?.mutualCount ?? 0}</div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 justify-between">
            <div className="flex gap-1.5">
              {[
                { id: 'followers', label: `Followers (${followersData?.followers?.length ?? 0})` },
                { id: 'following', label: `Following (${followersData?.following?.length ?? 0})` },
                { id: 'mutual', label: 'Mutuals' },
              ].map((ft) => (
                <button
                  key={ft.id}
                  type="button"
                  onClick={() => setFollowTab(ft.id as 'followers' | 'following' | 'mutual')}
                  className={`px-2.5 py-1 text-xs font-bold border-2 border-ink ${followTab === ft.id ? 'bg-ink text-white' : 'bg-white'
                    }`}
                >
                  {ft.label}
                </button>
              ))}
            </div>
            <div className="relative sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-ink-muted" />
              <input
                type="text"
                value={followSearch}
                onChange={(e) => setFollowSearch(e.target.value)}
                placeholder="Search @username or name..."
                className="w-full border-2 border-ink pl-8 pr-2.5 py-1 text-xs"
              />
            </div>
          </div>

          {(() => {
            const baseList =
              followTab === 'following'
                ? followersData?.following || []
                : followTab === 'mutual'
                  ? (followersData?.followers || []).filter((u) => u.status === 'MUTUAL')
                  : followersData?.followers || [];
            const q = followSearch.trim().toLowerCase();
            const filtered = q
              ? baseList.filter(
                (u) =>
                  u.username.toLowerCase().includes(q) ||
                  (u.name || '').toLowerCase().includes(q)
              )
              : baseList;

            if (filtered.length === 0) {
              return (
                <p className="text-xs font-mono text-ink-muted py-4 text-center border border-ink bg-cream-50">
                  No individual accounts recorded yet. Meta Graph API only provides aggregate follower/following counts; accounts appear here as they interact via permitted webhooks.
                </p>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {filtered.map((u) => (
                  <div
                    key={u.id}
                    className="p-3 border-2 border-ink bg-cream-50 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={
                          u.profilePictureUrl ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username)}&background=FF6B6B&color=fff`
                        }
                        alt={u.username}
                        referrerPolicy="no-referrer"
                        className="w-9 h-9 rounded-full object-cover border-2 border-ink shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold truncate">@{u.username}</span>
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.5 border border-ink ${u.status === 'MUTUAL'
                                ? 'bg-mint text-ink'
                                : u.detectionStatus === 'NEW'
                                  ? 'bg-yellow text-ink'
                                  : 'bg-white text-ink'
                              }`}
                          >
                            {u.detectionStatus === 'NEW' ? 'NEW' : u.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-ink-muted truncate">
                          {u.name || 'Instagram User'} • Observed{' '}
                          {new Date(u.firstObserved).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </div>
                      </div>
                    </div>
                    <a
                      href={`https://www.instagram.com/${encodeURIComponent(u.username)}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 border border-ink bg-white text-[10px] font-bold flex items-center gap-1 shrink-0 hover:bg-yellow/40"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Profile
                    </a>
                  </div>
                ))}
              </div>
            );
          })()}

          {followersData?.uncertainUnfollowsNote && (
            <p className="text-[11px] text-ink-muted bg-cream-50 border border-ink p-2">
              {followersData.uncertainUnfollowsNote}
            </p>
          )}
        </div>
      )}

      {section === 'monitor' && (
        <div className="space-y-3 text-xs">
          <div className="p-3 border-2 border-ink bg-cream-50 font-mono">
            Current Followers: <strong>{monitor?.followersCount ?? 0}</strong>
          </div>
          {monitor?.uncertainUnfollowsNote && (
            <p className="text-[11px] text-ink-muted">{monitor.uncertainUnfollowsNote}</p>
          )}
          <div className="space-y-1.5">
            {(monitor?.recentEvents || []).map((ev, idx) => (
              <div key={idx} className="border border-ink p-2 bg-white flex justify-between">
                <span><strong>[{ev.type}]</strong> @{ev.username} — {ev.summary}</span>
                <span className="font-mono text-[10px] text-ink-muted">{ev.timestamp}</span>
              </div>
            ))}
          </div>

          <div className="border-t-2 border-ink pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-xs uppercase">Instagram Notes Activity</h3>
              <span className="text-[10px] font-mono px-1.5 py-0.5 border border-ink bg-yellow">
                Note Likes: {notesData?.noteLikesSupported ? 'Supported' : 'Unavailable (Meta API)'}
              </span>
            </div>
            {notesData?.supportNotice && (
              <p className="text-[11px] text-ink-muted">{notesData.supportNotice}</p>
            )}
            {(notesData?.events || []).length === 0 ? (
              <p className="text-[11px] font-mono text-ink-muted">No Note reply events recorded yet.</p>
            ) : (
              <div className="space-y-1.5">
                {notesData!.events.map((ne) => (
                  <div key={ne.id} className="border border-ink p-2 bg-cream-50 flex justify-between">
                    <span>
                      <strong>[{ne.activityType}]</strong> @{ne.actorUsername}
                      {ne.noteText ? ` on "${ne.noteText}"` : ''}
                      {ne.replyText ? `: ${ne.replyText}` : ''}
                    </span>
                    <span className="font-mono text-[10px] text-ink-muted">{ne.timestampIst}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
