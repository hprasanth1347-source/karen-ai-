-- Forward Migration 0014: Karen Automation Center

CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'paused' CHECK (status IN ('active', 'paused', 'draft')),
  version INT NOT NULL DEFAULT 1,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  retry_config JSONB NOT NULL DEFAULT '{"maxAttempts":3,"backoffMs":2000}'::jsonb,
  timeout_ms INT NOT NULL DEFAULT 30000,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automations_user_status ON automations(user_id, status);
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY automations_owner ON automations FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS automation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version INT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'awaiting_approval')),
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  idempotency_key TEXT UNIQUE,
  duration_ms INT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_automation_exec_user ON automation_executions(user_id, started_at DESC);
ALTER TABLE automation_executions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY automation_executions_owner ON automation_executions FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS automation_execution_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES automation_executions(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  duration_ms INT,
  output_summary TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automation_steps_exec ON automation_execution_steps(execution_id);
