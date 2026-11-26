-- Migration 0008: Google Custom Search cache, daily quota tracking, and owner brand settings

CREATE TABLE IF NOT EXISTS public.search_cache (
  query_hash TEXT PRIMARY KEY,
  normalized_query TEXT NOT NULL,
  freshness TEXT NOT NULL CHECK (freshness IN ('breaking', 'recent', 'any')),
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_cache_expires_at
  ON public.search_cache (expires_at);

CREATE TABLE IF NOT EXISTS public.search_usage (
  date TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  alerted_80 BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.search_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_usage ENABLE ROW LEVEL SECURITY;

-- Service role manages search cache & usage; authenticated owner may read usage stats
DROP POLICY IF EXISTS "Owner read search_usage" ON public.search_usage;
CREATE POLICY "Owner read search_usage"
  ON public.search_usage
  FOR SELECT
  USING (auth.role() = 'authenticated');
