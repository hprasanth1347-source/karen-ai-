# Supabase PostgreSQL Integration Guide

## Setup Steps
1. Navigate to [Supabase](https://supabase.com) and create a new project.
2. In the left sidebar, click on **SQL Editor**.
3. Create a new query and paste the complete migration:
   `supabase/migrations/0002_karen_ultra_complete.sql`
4. Click **Run**. All 22 tables, updated_at triggers, indexes, and Row Level Security policies will be established.
5. In **Project Settings > API**, copy:
   - `Project URL` ➜ `SUPABASE_URL`
   - `anon public key` ➜ `SUPABASE_ANON_KEY`
   - `service_role secret` ➜ `SUPABASE_SERVICE_ROLE_KEY`
6. In **Authentication > Providers**, keep Email enabled. (Disable public sign-ups in Production).
