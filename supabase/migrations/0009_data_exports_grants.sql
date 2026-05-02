-- ============================================================================
-- 0009_data_exports_grants.sql
-- ============================================================================
-- HOTFIX: 0008 vergat GRANTs op de nieuwe `data_exports` tabel. Het Supabase
-- project heeft "Automatically expose new tables" UIT, dus elke nieuwe tabel
-- (en functie) moet expliciet GRANTed worden — ook aan service_role, want
-- al bypasset het RLS, het mist anders de basale Postgres-tabel-rechten.
--
-- Symptoom voor fix: Edge Function `export-authors-csv` faalt met
-- "permission denied for table data_exports" bij de INSERT van de audit-rij.
--
-- Hetzelfde geldt voor de `is_active_author()` helper-functie uit 0006: voor
-- consistentie met `is_admin()` (die wel EXECUTE-rechten kreeg in 0004) ook
-- die expliciet GRANTen.
-- ============================================================================

-- service_role mag alles op data_exports (audit-INSERT vanuit Edge Function)
GRANT ALL ON data_exports TO service_role;

-- authenticated mag SELECT — RLS-policy `data_exports_admin_select` filtert
-- vervolgens op `is_admin()`. Geen INSERT/UPDATE/DELETE voor authenticated:
-- alle writes gaan exclusief via Edge Function met service-role.
GRANT SELECT ON data_exports TO authenticated;

-- Helper-functie uit 0006 — analoog aan is_admin() in 0004.
GRANT EXECUTE ON FUNCTION public.is_active_author() TO anon, authenticated, service_role;
