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
  city         text check (city is null or char_length(city) <= 60),
  days         date[] not null check (
                 cardinality(days) between 1 and 3
                 and days <@ array['2026-12-04','2026-12-05','2026-12-06']::date[]
               ),
  attendees    smallint not null default 1 check (attendees between 1 and 5),
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

-- Lock the table down. The public never touches it directly:
-- inserts happen only through the `register` Edge Function (service role).
alter table public.registrations enable row level security;
revoke all on public.registrations from anon, authenticated;

-- ---------- Admin allowlist ----------
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Signed-in admins can read registrations (every column except ip_hash)
grant select (id, ticket_code, full_name, email, phone, city, days, attendees, created_at)
  on public.registrations to authenticated;

drop policy if exists "Admins can read registrations" on public.registrations;
create policy "Admins can read registrations"
  on public.registrations
  for select
  to authenticated
  using ((select public.is_admin()));

-- ---------- Dashboard numbers for the admin panel ----------
create or replace function public.registration_stats()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return json_build_object(
    'registrations', (select count(*) from public.registrations),
    'attendees',     (select coalesce(sum(attendees), 0) from public.registrations),
    'by_day', (
      select coalesce(json_object_agg(d, n), '{}'::json)
      from (
        select d, sum(r.attendees) as n
        from public.registrations r, unnest(r.days) as d
        group by d
      ) s
    )
  );
end;
$$;

revoke execute on function public.registration_stats() from public, anon;
grant execute on function public.registration_stats() to authenticated;

-- ---------- Add your admins ----------
-- Create the user first in Dashboard → Authentication → Users → Add user,
-- then list the same email here:
-- insert into public.admins (email) values ('admin@example.gov.in');
