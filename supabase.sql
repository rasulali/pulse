-- Add unverification tracking columns to linkedin profiles
alter table public.linkedin
  add column if not exists unverified_reason text,
  add column if not exists unverified_details jsonb,
  add column if not exists unverified_at timestamptz;
