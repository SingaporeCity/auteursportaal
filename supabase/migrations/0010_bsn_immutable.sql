-- ============================================================================
-- 0010_bsn_immutable.sql
-- ============================================================================
-- BSN is een door de overheid uitgegeven, persoonsgebonden identifier dat
-- normaal gesproken niet wijzigt. Wijziging na eerste vaststelling is in vrijwel
-- alle gevallen ongewenst (fraude-risico, social engineering, of admin-fout).
--
-- Deze trigger maakt BSN immutable na eerste invoer. Toegestaan:
--   - NULL → value      (eerste invoer door auteur of CSV-import)
--   - value → identical (no-op update — geen wijziging)
-- Geblokkeerd:
--   - value → other     (elke daadwerkelijke wijziging)
--   - value → NULL      (verwijderen van BSN)
--
-- BEWUST geen carve-out voor admin of service-role. Correcties van een
-- foutief ingevoerde BSN moeten via Supabase Studio (direct SQL met admin-
-- toegang), wat een audit-trail oplevert via Supabase platform-logs.
-- Friction is hier feature, niet bug — een echte BSN-wijziging is uitzondering
-- en moet pijnlijk genoeg zijn dat het gemerkt wordt.
--
-- Defense-in-depth: Edge Function `import-authors-csv` skipt ook al
-- BSN-overschrijven, en frontend (`profile.ts`) verbiedt BSN in change-request
-- flow. Deze trigger is de hardste laag.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_bsn_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Geen verandering aan BSN? Niets te doen.
    IF OLD.bsn IS NOT DISTINCT FROM NEW.bsn THEN
        RETURN NEW;
    END IF;

    -- Eerste invoer (NULL of leeg → value): toegestaan.
    IF OLD.bsn IS NULL OR OLD.bsn = '' THEN
        RETURN NEW;
    END IF;

    -- Elke andere transitie: blokkeren.
    RAISE EXCEPTION 'BSN is na eerste invoer onveranderlijk. Voor correctie: contact rights@noordhoff.nl (vereist directe DB-edit via Supabase Studio).'
        USING ERRCODE = '42501'; -- insufficient_privilege
END;
$$;

CREATE TRIGGER authors_enforce_bsn_immutable
    BEFORE UPDATE OF bsn ON authors
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_bsn_immutable();

-- ----------------------------------------------------------------------------
-- IT-review notes
-- ----------------------------------------------------------------------------
-- 1. Geen `SECURITY DEFINER` op de functie: trigger draait in caller-context
--    zodat de exception terugbubbelt naar PostgREST/Edge Function/SQL-client.
-- 2. Geen GRANT EXECUTE nodig op de functie — triggers worden door Postgres
--    intern aangeroepen, niet door clients.
-- 3. `CREATE OR REPLACE FUNCTION` + nieuwe `CREATE TRIGGER`: bestaande trigger
--    op `authors` (`update_authors_updated_at` uit 0001 + `authors_sync_is_active`
--    uit 0006 + `authors_enforce_onboarding_transition` uit 0006) blijven
--    draaien onafhankelijk. Trigger-firing-orde is alfabetisch op trigger-naam,
--    dus `authors_enforce_bsn_immutable` vuurt vóór `authors_enforce_onboarding_*`
--    en vóór `authors_sync_is_active`. Dat klopt: BSN-check moet eerst.
