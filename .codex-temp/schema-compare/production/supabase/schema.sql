-- supabase/schema.sql
-- NOTE: This file could not be auto-generated via `supabase db dump` because
-- Docker Desktop is not running locally and the migration history has a known
-- mismatch with the remote. It must be regenerated after migration history is
-- repaired and Docker is available.
--
-- The definitions below reflect the intended current state of the public schema,
-- maintained manually until an automated dump can replace this file.

-- Enum: app_role
-- Last updated: 2026-04-12 (migration 20260412030000_add_gerencia_role)
CREATE TYPE public.app_role AS ENUM (
  'recepcao',
  'atendimento',
  'admin',
  'gerencia'
);
