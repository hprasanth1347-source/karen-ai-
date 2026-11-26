-- Migration 0010: Ultimate Instagram AI Assistant Tables (Asia/Kolkata aware, no plaintext tokens)

CREATE TABLE IF NOT EXISTS public.instagram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_account_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  name TEXT,
  profile_picture_url TEXT,
  followers_count INTEGER DEFAULT 0,
  media_count INTEGER DEFAULT 0,
  login_flow TEXT NOT NULL DEFAULT 'facebook' CHECK (login_flow IN ('instagram', 'facebook')),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  connection_status TEXT NOT NULL DEFAULT 'connected',
  token_expires_at TIMESTAMPTZ,
  last_health_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_conversations (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  participant_username TEXT NOT NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  human_takeover BOOLEAN NOT NULL DEFAULT FALSE,
  window_expires_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_username TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'reel', 'video', 'audio', 'ig_post', 'story_reply')),
  body_text TEXT,
  is_story_reply BOOLEAN NOT NULL DEFAULT FALSE,
  story_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL,
  attachment_type TEXT NOT NULL,
  media_id TEXT,
  media_url TEXT,
  reel_title TEXT,
  reel_url TEXT,
  mime_type TEXT,
  accessible BOOLEAN NOT NULL DEFAULT FALSE,
  gemini_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_media (
  id TEXT PRIMARY KEY,
  ig_account_id TEXT,
  media_type TEXT NOT NULL,
  media_product_type TEXT,
  caption TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  permalink TEXT,
  like_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  views_count INTEGER,
  shares_count INTEGER,
  published_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_reels (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('my_reels', 'tagged_reels')),
  creator_username TEXT,
  caption TEXT,
  thumbnail_url TEXT,
  media_url TEXT,
  permalink TEXT,
  views_count INTEGER,
  like_count INTEGER,
  comments_count INTEGER,
  shares_count INTEGER,
  published_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_tagged_media (
  id TEXT PRIMARY KEY,
  creator_username TEXT,
  media_type TEXT,
  media_product_type TEXT,
  caption TEXT,
  thumbnail_url TEXT,
  permalink TEXT,
  published_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_stories (
  id TEXT PRIMARY KEY,
  media_type TEXT NOT NULL,
  media_url TEXT,
  thumbnail_url TEXT,
  permalink TEXT,
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_story_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id TEXT NOT NULL,
  impressions INTEGER,
  reach INTEGER,
  replies INTEGER,
  exits INTEGER,
  taps_forward INTEGER,
  taps_back INTEGER,
  source TEXT NOT NULL DEFAULT 'api' CHECK (source IN ('api', 'webhook')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_followers (
  ig_scoped_id TEXT PRIMARY KEY,
  username TEXT,
  status TEXT NOT NULL DEFAULT 'following' CHECK (status IN ('following', 'unfollowed_uncertain')),
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_follower_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  followers_count INTEGER NOT NULL DEFAULT 0,
  observed_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  actor_username TEXT,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_comments (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  username TEXT NOT NULL,
  text TEXT NOT NULL,
  ai_reply_text TEXT,
  replied BOOLEAN NOT NULL DEFAULT FALSE,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_mentions (
  id TEXT PRIMARY KEY,
  media_id TEXT,
  comment_id TEXT,
  creator_username TEXT,
  permalink TEXT,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_ai_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_username TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  reply_text TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_webhook_events (
  event_id TEXT PRIMARY KEY,
  object_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  items_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.instagram_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'instagram_accounts', 'instagram_conversations', 'instagram_messages', 'instagram_attachments',
    'instagram_media', 'instagram_reels', 'instagram_tagged_media', 'instagram_stories',
    'instagram_story_insights', 'instagram_followers', 'instagram_follower_snapshots',
    'instagram_activity_logs', 'instagram_comments', 'instagram_mentions',
    'instagram_ai_replies', 'instagram_webhook_events', 'instagram_sync_logs', 'instagram_processing_jobs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;
