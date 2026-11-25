-- Karen Ultra core schema. Apply in Supabase SQL editor / migrations.
create extension if not exists pgcrypto;
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text,
 preferred_language text not null default 'thanglish',
 created_at timestamptz not null default now()
);
create table if not exists public.contacts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 display_name text not null, platform text not null check(platform in ('whatsapp','instagram','telegram','email')),
 external_id text not null, is_favourite boolean not null default false,
 can_auto_reply boolean not null default false, requires_approval boolean not null default true,
 created_at timestamptz not null default now(), unique(owner_id,platform,external_id)
);
create table if not exists public.provider_events (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 provider text not null, event_type text not null, external_event_id text,
 payload jsonb not null default '{}', received_at timestamptz not null default now(),
 unique(provider,external_event_id)
);
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null, body text not null, provider text, severity text not null default 'normal',
 read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.memories (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 fact text not null, category text not null default 'general', sensitive boolean not null default false,
 encrypted_value text, source text not null default 'user_taught', created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.documents (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 filename text not null, storage_path text not null, mime_type text, status text not null default 'uploaded',
 extracted_text text, created_at timestamptz not null default now()
);
create table if not exists public.approval_queue (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 provider text not null, recipient_id text not null, message text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','sent','failed')),
 approved_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 actor text not null, action text not null, provider text, target text, result text,
 metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table if not exists public.integration_settings (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 provider text not null, connected boolean not null default false, scopes text[] not null default '{}',
 updated_at timestamptz not null default now(), unique(owner_id,provider)
);
alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.provider_events enable row level security;
alter table public.notifications enable row level security;
alter table public.memories enable row level security;
alter table public.documents enable row level security;
alter table public.approval_queue enable row level security;
alter table public.audit_logs enable row level security;
alter table public.integration_settings enable row level security;
do $$ declare t text; begin
 foreach t in array array['profiles','contacts','provider_events','notifications','memories','documents','approval_queue','audit_logs','integration_settings'] loop
  execute format('drop policy if exists owner_all on public.%I',t);
  execute format('create policy owner_all on public.%I for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id)',t);
 end loop;
end $$;
