-- 0011_licensed_devices_missing_columns.sql
-- ----------------------------------------------------------------------------
-- Production fix for the Gym Admin Payments page 400:
--   "Could not find the license_key column of 'licensed_devices' in the
--   schema cache"
--
-- Root cause (proven live, 2026-08-17): the app (deviceService.js
-- registerDevice, carried over from the Firestore-era licensedDevices
-- collection shape which stored licenseKey + registeredAt) INSERTs
-- license_key and registered_at on licensed_devices, but NO migration ever
-- created these columns (0001-0010 audited; docs/SUPABASE_DDL_SPEC.md
-- section 4.25 also omitted them). PostgREST therefore rejects the INSERT
-- with HTTP 400 -> LicenseGuard blocks the page with "License Required /
-- License validation error. Please try again or contact support."
-- Live information_schema confirmed the table has exactly the 0001 column
-- set (id, gym_id, device_id, device_name, platform, app_version,
-- user_agent, status, created_by, last_seen, created_at, updated_at).
--
-- Fix: add the two missing nullable columns. Additive only - zero data
-- change, zero RLS change (all licensed_devices policies are
-- gym-ownership-based, no column references), zero constraint change.
-- The NOTIFY reloads the PostgREST schema cache at commit (standard
-- Supabase practice; harmless if the cache already reloaded).
-- ----------------------------------------------------------------------------

alter table public.licensed_devices
  add column if not exists license_key   text,
  add column if not exists registered_at timestamptz;

notify pgrst, 'reload schema';