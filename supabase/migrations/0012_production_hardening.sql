-- Forward Migration 0012: Production Hardening, Confirmation Flow, Reminders, Jobs, Telegram Links & Karen Times Newsroom

CREATE TABLE IF NOT EXISTS pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  preview TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_actions_user_status ON pending_actions(user_id, status, expires_at);
ALTER TABLE pending_actions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY pending_actions_owner ON pending_actions FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  due_at TIMESTAMPTZ NOT NULL,
  recurrence_rule TEXT,
  channel TEXT NOT NULL DEFAULT 'telegram' CHECK (channel IN ('telegram', 'web', 'email')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'failed', 'cancelled', 'completed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reminders_due_status ON reminders(status, due_at);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id, due_at);
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY reminders_owner ON reminders FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'dead')),
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  last_error TEXT,
  idempotency_key TEXT UNIQUE,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_jobs_poll ON jobs(status, run_at);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id, created_at DESC);
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY jobs_owner ON jobs FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS job_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_job_attempts_job ON job_attempts(job_id, attempt_number);

CREATE TABLE IF NOT EXISTS telegram_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_user_id TEXT UNIQUE,
  chat_id TEXT UNIQUE,
  link_code TEXT UNIQUE,
  code_expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_telegram_links_user ON telegram_links(user_id);
ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY telegram_links_owner ON telegram_links FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS karen_times_editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_date DATE NOT NULL,
  issue_number INT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('ta', 'en')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'awaiting_approval', 'published', 'failed')),
  pdf_url TEXT,
  cover_image_url TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  UNIQUE(edition_date, language)
);

CREATE TABLE IF NOT EXISTS karen_times_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id UUID REFERENCES karen_times_editions(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('ta', 'en')),
  section TEXT NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  published_source_at TIMESTAMPTZ,
  image_url TEXT,
  image_is_ai BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kt_articles_edition ON karen_times_articles(edition_id, section);

CREATE TABLE IF NOT EXISTS karen_times_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id UUID REFERENCES karen_times_editions(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'telegram',
  destination TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  ip_hash TEXT,
  request_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY audit_logs_owner ON audit_logs FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
