-- =====================================================================
-- 12th India International Dance & Music Festival — registrations
-- Run once in Supabase: Dashboard → SQL Editor → paste → Run
-- =====================================================================

-- ---------- Registrations ----------
create table if not exists public.registrations (
  id           uuid primary key default gen_random_uuid(),
  ticket_code  text not null unique,
  full_name    text not null check (char_length(full_name) between 2 and 80),
  email        text not null check (char_length(email) between 5 and 254),
  phone        text not null check (phone ~ '^[6-9][0-9]{9}$'),
  days         date[] not null check (
                 cardinality(days) between 1 and 3
                 and days <@ array['2026-12-04','2026-12-05','2026-12-06']::date[]
               ),
  ip_hash      text,                       -- salted hash, used only for rate limiting
  created_at   timestamptz not null default now()
);

-- One registration per email (case-insensitive)
create unique index if not exists registrations_email_lower_key
  on public.registrations (lower(email));
create index if not exists registrations_created_at_idx
  on public.registrations (created_at desc);
create index if not exists registrations_ip_recent_idx
  on public.registrations (ip_hash, created_at);

-- Lock the table down completely. Nobody can read or write it from a browser.
-- Only the two Edge Functions touch it (they use the service role, which bypasses this):
--   `register`  saves a registration
--   `admin`     lists and exports registrations after the admin signs in
-- There are deliberately NO policies, so anonymous and signed-in users get nothing.
alter table public.registrations enable row level security;
revoke all on public.registrations from anon, authenticated;
