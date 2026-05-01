-- =============================================================================
-- 0004_grants.sql — Expliciete GRANTs voor de portal-rollen.
--
-- Nodig omdat in het Supabase project de toggle "Automatically expose new
-- tables and functions" UIT staat (best practice: per-tabel handmatig
-- exposen). Dit migration script doet dat expliciet voor alle tabellen
-- die het portaal gebruikt.
--
-- Rollen:
--   service_role      — backend/Edge Functions/seed-scripts (RLS-bypass)
--   authenticated     — ingelogde users via PostgREST (RLS afgedwongen)
--   anon              — niet-ingelogde users (bijna geen rechten — alle
--                       reads gaan langs RLS, en RLS staat niets toe zonder auth.uid())
--
-- Run NA 0001/0002/0003.
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- service_role mag alles (bypassed RLS sowieso, maar GRANT is nodig voor
-- PostgREST om de tabel überhaupt te kunnen vinden)
GRANT ALL ON authors, contracts, payments, forecasts, change_requests,
             login_history, expenses
    TO service_role;

-- authenticated mag CRUD doen, maar RLS bepaalt welke rijen
GRANT SELECT, INSERT, UPDATE, DELETE
    ON authors, contracts, payments, forecasts, change_requests,
       login_history, expenses
    TO authenticated;

-- Helper-functie moet aanroepbaar zijn voor RLS-evaluatie
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- Sequence-rechten zijn niet nodig: alle PK's gebruiken uuid_generate_v4(),
-- geen serial/identity columns.
