-- ============================================================
-- FundPulse — run this ONCE in Supabase Dashboard → SQL Editor
-- Safe to re-run (idempotent).
--
-- Contains:
--   1. SECURITY FIX: lock down the news table (verified 2026-07-13:
--      the public anon key could INSERT and DELETE news rows)
--   2. NEW TABLE: alert_log — real alert history + same-day dedup
--      for the alert engine
-- ============================================================

-- ── 1. NEWS TABLE LOCKDOWN ──────────────────────────────────
-- Anyone may read news; ONLY the service role (GitHub Actions
-- news-fetcher) may write. Service role bypasses RLS, so no
-- write policy is needed for it.

alter table public.news enable row level security;

-- Drop EVERY existing policy on news, whatever it was named, then
-- recreate the single read-only policy. This guards against permissive
-- dashboard-created policies with unpredictable names.
do $$
declare p record;
begin
  for p in select polname from pg_policy where polrelid = 'public.news'::regclass loop
    execute format('drop policy %I on public.news', p.polname);
  end loop;
end $$;

create policy "news_public_read"
  on public.news for select
  to anon, authenticated
  using (true);

-- ── 2. ALERT LOG ────────────────────────────────────────────
-- One row per alert email actually sent. The unique constraint is
-- the dedup key: re-running the engine the same day can never
-- send the same alert twice.

create table if not exists public.alert_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  fund_id     text not null,
  fund_name   text,
  alert_type  text not null check (alert_type in ('drop', 'rise')),
  pct_change  numeric,
  today_nav   numeric,
  threshold   numeric,
  channel     text not null default 'email',
  nav_date    date not null,
  sent_at     timestamptz not null default now(),
  unique (user_id, fund_id, alert_type, nav_date)
);

create index if not exists alert_log_user_recent
  on public.alert_log (user_id, sent_at desc);

alter table public.alert_log enable row level security;

-- Users can read their own history (alerts screen). No client
-- write policies: only the engine (service role) inserts.
drop policy if exists "alert_log_select_own" on public.alert_log;
create policy "alert_log_select_own"
  on public.alert_log for select
  to authenticated
  using (auth.uid() = user_id);

-- ── 3. BELT-AND-BRACES ──────────────────────────────────────
-- These tables already behaved correctly when tested (anon reads
-- returned empty, anon insert denied), so their policies exist.
-- Enabling RLS again is a no-op but guards against accidental
-- future disablement.

alter table public.watchlist    enable row level security;
alter table public.alert_config enable row level security;
alter table public.profiles     enable row level security;
