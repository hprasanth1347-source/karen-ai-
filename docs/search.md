# Google Custom Search (Programmable Search JSON API)

Karen AI uses Google Programmable Search (`https://www.googleapis.com/customsearch/v1`) as its live-data grounding source.

## Setup

1. Create a Programmable Search Engine at https://programmablesearchengine.google.com/ and enable **Search the entire web**.
2. Copy the **Search engine ID (`cx`)** into `GOOGLE_SEARCH_ENGINE_ID`.
3. Enable **Custom Search API** in Google Cloud Console and place the API key in `GOOGLE_SEARCH_API_KEY`.
   - If using API key restrictions, allow server-side HTTP requests (not HTTP referrer-only restrictions).
4. Set `SEARCH_DAILY_LIMIT=90` (default 90/day; free tier is 100/day). Karen alerts on Telegram at 80% usage and falls back cleanly at 100%.

## Caching & Freshness

- `breaking` (`d2`, `sort=date`): cached for **10 minutes**
- `recent` (`m1`): cached for **6 hours**
- `any`: cached for **24 hours**
- Cached in Supabase `search_cache` (`supabase/migrations/0008_search_cache_and_usage.sql`).

## Manual Verification Checklist

Ask Karen in web chat or Telegram:
1. `"who won the most recent IPL match"` -> verify sourced answer with clickable source chips/links.
2. `"latest iPhone price in India"` -> verify current price with source citations.
3. `"weather in Coimbatore today"` -> followed by `"and tomorrow?"` -> verify history-aware query rewrite & fresh sourced answer.
4. Check `/monitor` and `/settings` for live search health, daily quota usage, and cache hit rate.
