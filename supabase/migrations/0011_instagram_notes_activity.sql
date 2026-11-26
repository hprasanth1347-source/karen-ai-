-- Migration 0011: Instagram Notes Activity Monitor (deduped official API events only)

CREATE TABLE IF NOT EXISTS public.instagram_notes_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('note_reply', 'note_like', 'unsupported')),
  note_id TEXT,
  note_text TEXT,
  actor_id TEXT,
  actor_username TEXT,
  reply_text TEXT,
  api_supported BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.instagram_notes_activity ENABLE ROW LEVEL SECURITY;
