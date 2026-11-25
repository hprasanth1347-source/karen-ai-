# Karen Ultra — Supabase Setup Guide

## Overview

Karen Ultra uses Supabase as its primary database and authentication layer. This guide walks you through creating a project, applying migrations, and bootstrapping the first owner account.

---

## 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in.
2. Click **New Project**.
3. Choose your organisation, give the project a name (e.g. `karen-ultra`), set a strong database password, and choose a region close to you.
4. Wait for provisioning (~2 minutes).

---

## 2. Get Your API Keys

In your Supabase project dashboard:

1. Go to **Settings → API**.
2. Copy the following:
   - **Project URL** → `SUPABASE_URL`
   - **anon (public) key** → `SUPABASE_ANON_KEY`
   - **service_role (secret) key** → `SUPABASE_SERVICE_ROLE_KEY`

Add these to your `.env` file:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

> **Never expose `SUPABASE_SERVICE_ROLE_KEY` in the browser or public client code.**

---

## 3. Apply Migrations via SQL Editor

Migrations are applied in order using Supabase's SQL editor:

1. In the Supabase dashboard, go to **SQL Editor**.
2. Click **New query**.
3. Apply migrations in order:

### Migration 0001 — Karen Core (starter tables)

Copy and paste the contents of `migrations/0001_karen_core.sql` and click **Run**.

### Migration 0002 — Karen Ultra Complete Schema

Copy and paste the contents of `migrations/0002_karen_ultra_complete.sql` and click **Run**.

This creates 22 tables, all indexes, triggers, and Row Level Security policies.

> If you get a "relation already exists" error, the migration was partially applied. Run each `CREATE TABLE IF NOT EXISTS` block individually.

### Migration 0003 — Seed Data (manual, post-bootstrap)

Do **not** run this automatically. After bootstrapping the first owner (step 6 below), replace `<paste-owner-uuid-here>` with your owner's UUID and run the relevant seed blocks.

---

## 4. Configure Supabase Auth

In **Authentication → Settings**:

1. **Email provider**: Enable Email/Password sign-in.
2. **Confirm email**: Disable "Enable email confirmations" for owner-only self-hosted use. If running multi-user, keep it enabled.
3. **Site URL**: Set to your frontend URL (e.g. `http://localhost:5173` for dev).
4. **Redirect URLs**: Add `http://localhost:5173/**` for local dev.

---

## 5. Verify RLS Is Working

RLS ensures each user can only access their own data.

### Test with anon key (should be blocked)

```bash
curl -X GET "https://your-project-ref.supabase.co/rest/v1/profiles" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
# Expected: 200 OK with empty array [] — RLS returns no rows for unauthenticated requests
```

### Test with a user JWT (should return only their rows)

```bash
# 1. Login and get JWT
curl -X POST "https://your-project-ref.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"your-password"}'
# Copy the access_token from the response

# 2. Query profiles with the JWT
curl -X GET "https://your-project-ref.supabase.co/rest/v1/profiles" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer ACCESS_TOKEN"
# Expected: array with only the owner's profile row
```

### Test with service_role key (bypasses RLS — admin only)

```bash
curl -X GET "https://your-project-ref.supabase.co/rest/v1/profiles" \
  -H "apikey: YOUR_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
# Expected: all profiles (use with caution — server-side only)
```

---

## 6. Bootstrap First Owner Account

The API has a protected bootstrap endpoint that creates the first owner account. It is only callable when **no profiles exist** in the database.

### Prerequisites

Set the bootstrap secret in your `.env`:

```env
BOOTSTRAP_SECRET=your-very-secret-bootstrap-token
```

### Call the endpoint

```bash
curl -X POST http://localhost:8080/api/v1/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@yourdomain.com",
    "password": "SuperSecurePassword123!",
    "displayName": "Karen Owner",
    "bootstrapSecret": "your-very-secret-bootstrap-token"
  }'
```

**Response on success:**

```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid...", "email": "owner@yourdomain.com" },
    "profile": { "id": "uuid...", "role": "owner", ... },
    "access_token": "eyJ..."
  }
}
```

After bootstrapping, run the seed data from `0003_karen_seed.sql` using the returned UUID.

> The bootstrap endpoint is **rate-limited to 1 request/hour** and permanently disabled once an owner account exists.

---

## 7. Enable pgvector Extension (for future embeddings)

For Phase 4 (Memory & Documents) the system will use vector embeddings for semantic search. Enable the extension now:

1. In Supabase dashboard, go to **Database → Extensions**.
2. Search for `vector` and click **Enable**.

Or in the SQL editor:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 8. Storage Bucket Setup

For document uploads:

1. In Supabase dashboard, go to **Storage**.
2. Create a new bucket named `documents`.
3. Set it to **Private** (not public).
4. Add a bucket policy to allow authenticated users to upload to their own prefix:

```sql
-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload own documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to read their own documents
CREATE POLICY "Users can read own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

---

## 9. Backup and Restore

### Backup with pg_dump

```bash
pg_dump \
  --host=db.your-project-ref.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --schema=public \
  --no-owner \
  --no-acl \
  -f karen_ultra_backup_$(date +%Y%m%d).sql
```

Enter your database password when prompted (found in **Settings → Database → Connection string**).

### Restore from backup

```bash
psql \
  --host=db.your-project-ref.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  -f karen_ultra_backup_YYYYMMDD.sql
```

> For automated backups, Supabase Pro plans include daily backups with PITR.

---

## Table Reference

| Table | Rows | Purpose |
|-------|------|---------|
| `profiles` | 1 (owner) | User profile linked to auth.users |
| `user_settings` | n | Key-value settings per user |
| `provider_connections` | n | OAuth/API connections to external providers |
| `conversations` | n | AI conversation threads |
| `messages` | n | Individual messages in conversations |
| `contacts` | n | Contacts from all platforms |
| `contact_preferences` | n | Per-contact notification/reply settings |
| `notifications` | n | In-app notification inbox |
| `notification_preferences` | n | Per-event notification channels |
| `memories` | n | AI memory/knowledge store |
| `documents` | n | Uploaded/synced documents |
| `document_chunks` | n | Chunked document text for RAG |
| `document_jobs` | n | Background processing jobs |
| `tasks` | n | Task management |
| `reminders` | n | Time-based reminders |
| `automation_rules` | n | Automation trigger-action rules |
| `automation_runs` | n | Automation execution history |
| `approval_requests` | n | Pending human approvals |
| `external_events` | n | Incoming events from external platforms |
| `webhook_events` | n | Raw webhook payloads |
| `api_usage` | n | AI/API token and cost tracking |
| `audit_logs` | n | Action audit trail |
| `security_events` | n | Security incident log |
| `email_cache` | n | Gmail message cache |
| `drive_files` | n | Google Drive file index |
| `voice_sessions` | n | ElevenLabs voice session log |
