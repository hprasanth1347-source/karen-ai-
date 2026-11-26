-- ============================================================================
-- KAREN AI — Chat Library Hardening Migration (Additive & Non-Destructive)
-- Reuses existing public.conversations & public.messages tables.
-- Adds idempotency key (client_message_id), search index, and updated_at index.
-- ============================================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS client_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_client_id
  ON public.messages(conversation_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
  ON public.conversations(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_user_title
  ON public.conversations(user_id, title);
