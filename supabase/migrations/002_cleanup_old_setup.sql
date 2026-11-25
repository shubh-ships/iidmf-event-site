-- =====================================================================
-- Cleanup script: ONLY for a database you already created from an EARLIER
-- version of 001_registrations.sql (one that had city / attendees, an
-- admins table, or the Supabase-login admin functions).
-- For a fresh setup with the current 001, skip this file.
-- Safe to run more than once. Existing registrations are kept.
-- =====================================================================

-- the old "admin can read" rule and the functions behind it
drop policy if exists "Admins can read registrations" on public.registrations;
drop function if exists public.registration_stats();
drop function if exists public.is_admin();
drop table if exists public.admins;

-- nobody reads the table from a browser any more; the `admin` Edge Function does it
revoke all on public.registrations from anon, authenticated;

-- New Supabase projects (since May 2026) give new tables no permissions by default,
-- so the Edge Functions' database user needs these two, explicitly.
grant select, insert on public.registrations to service_role;

-- fields the form no longer asks for
alter table public.registrations
  drop column if exists city,
  drop column if exists attendees;
