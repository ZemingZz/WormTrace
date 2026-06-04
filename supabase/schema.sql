-- ════════════════════════════════════════════════════════════════════════════
-- WormTrace — Supabase schema
-- Run this ONCE in your Supabase project: SQL Editor → New query → paste → Run.
-- It creates the tables and the Row-Level-Security (RLS) policies that make the
-- public "anon" key safe to ship in the app: every row is locked to its owner,
-- so users can only ever read/write their own data.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Profiles: one row per user, created at sign-up ───────────────────────
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text,
  research_consent boolean not null default false,
  consent_version  text,
  created_at       timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: owner can read"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles: owner can upsert"
  on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: owner can update"
  on public.profiles for update using (auth.uid() = id);

-- ── 2. Per-user app state (cloud sync of localStorage blobs) ────────────────
create table if not exists public.user_state (
  user_id    uuid not null references auth.users (id) on delete cascade,
  key        text not null,
  value      jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_state enable row level security;

create policy "user_state: owner full access"
  on public.user_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 3. Training-data contributions (the research server) ────────────────────
create table if not exists public.training_contributions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  format       text,
  version      text,
  plate_count  int default 0,
  payload      jsonb not null,
  created_at   timestamptz not null default now()
);

alter table public.training_contributions enable row level security;

-- Contributors can insert their own rows and read back their own submissions,
-- but cannot see anyone else's. Aggregate analysis is done by the lab using the
-- service-role key (which bypasses RLS) from a trusted backend / notebook.
create policy "contrib: owner can insert"
  on public.training_contributions for insert
  with check (auth.uid() = user_id and
              exists (select 1 from public.profiles p
                      where p.id = auth.uid() and p.research_consent));
create policy "contrib: owner can read own"
  on public.training_contributions for select
  using (auth.uid() = user_id);

-- ── 4. Keep profile.research_consent in sync from auth metadata on sign-up ──
-- Creates a profile row automatically when a user signs up, copying consent
-- from the sign-up metadata so the contrib insert policy works immediately.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, research_consent, consent_version)
  values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    coalesce((new.raw_user_meta_data ->> 'research_consent')::boolean, false),
    new.raw_user_meta_data ->> 'consent_version'
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
