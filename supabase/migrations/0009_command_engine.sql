-- Migration 0009: Command Understanding Engine state (pending_actions, command_macros, chat_command_state, telegram_updates_dedupe)

CREATE TABLE IF NOT EXISTS public.pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_key TEXT NOT NULL,
  user_id UUID NULL,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt_question TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_actions_chat_status
  ON public.pending_actions (chat_key, status, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.command_macros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL,
  trigger_phrase TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_command_macros_trigger
  ON public.command_macros (LOWER(trigger_phrase));

CREATE TABLE IF NOT EXISTS public.chat_command_state (
  chat_key TEXT PRIMARY KEY,
  last_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_uploaded_file JSONB NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.telegram_updates_dedupe (
  update_id BIGINT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.command_macros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_command_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_updates_dedupe ENABLE ROW LEVEL SECURITY;
