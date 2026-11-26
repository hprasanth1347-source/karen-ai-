-- ============================================================================
-- KAREN AI — Skills System Tables, Indexes, and RLS (Migration 0007)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  license TEXT NOT NULL DEFAULT 'MIT',
  type TEXT NOT NULL CHECK (type IN ('instruction', 'script')),
  source TEXT NOT NULL DEFAULT 'karen' CHECK (source IN ('vendor', 'karen', 'custom', 'community')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  required_runner BOOLEAN NOT NULL DEFAULT false,
  allowed_tools TEXT[] NOT NULL DEFAULT '{}',
  network_allowlist TEXT[] NOT NULL DEFAULT '{}',
  triggers TEXT[] NOT NULL DEFAULT '{}',
  selftest_status TEXT NOT NULL DEFAULT 'untested' CHECK (selftest_status IN ('untested', 'passed', 'failed')),
  selftest_output TEXT,
  last_used_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS public.skill_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  content TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(skill_id, relative_path)
);

CREATE TABLE IF NOT EXISTS public.skill_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  script_name TEXT,
  inputs_hash TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  exit_code INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'blocked', 'timeout')),
  logs TEXT,
  output_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skills_user_enabled ON public.skills(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_skill_files_skill ON public.skill_files(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_runs_user_created ON public.skill_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_runs_expires ON public.skill_runs(expires_at);

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skills_owner" ON public.skills
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "skill_files_owner" ON public.skill_files
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "skill_runs_owner" ON public.skill_runs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
