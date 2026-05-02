-- ============================================================================
-- 0011_last_exported_at_lock.sql
-- ============================================================================
-- Audit-finding M1: `authors.last_exported_at` was via `authors_update_own`
-- RLS-policy door auteur zelf te overschrijven. Een kwaadwillende auteur
-- (of malware met diens JWT) kon `last_exported_at = '2099-01-01'` zetten,
-- waardoor wijzigingen aan eigen IBAN/adres nooit meer in een NetSuite-
-- export zouden opduiken — de admin merkt het niet, de wijzigingen syncen
-- niet, NetSuite blijft uit sync met portaal.
--
-- Postgres ondersteunt geen column-level RLS. Dus: trigger die voor non-
-- service-role calls de oude waarde herstelt — net als een column-WITH-CHECK.
-- Service-role (Edge Function `export-authors-csv`) mag wél bijwerken.
-- Admin via portaal heeft dit veld niet nodig (wijziging gaat via export-flow,
-- dat is service-role).
--
-- Defense-in-depth bij H9 audit-trail (toekomstig): hier zou óók een
-- audit-row geschreven kunnen worden bij elke service-role-update; voor nu
-- houden we het minimaal — `data_exports`-tabel logt al elke export.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lock_last_exported_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Service-role mag last_exported_at wijzigen (Edge Function)
    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Niet-service-role (auteur, admin via portaal): forceer OLD-waarde.
    -- Geen exception — silent revert. Frontend stuurt dit veld nooit, dus
    -- als het wél via PostgREST wordt meegestuurd, is dat een tampering-
    -- poging die we stilletjes negeren ipv error te tonen.
    IF NEW.last_exported_at IS DISTINCT FROM OLD.last_exported_at THEN
        NEW.last_exported_at := OLD.last_exported_at;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER authors_lock_last_exported_at
    BEFORE UPDATE OF last_exported_at ON authors
    FOR EACH ROW
    EXECUTE FUNCTION public.lock_last_exported_at();

-- ----------------------------------------------------------------------------
-- IT-review notes
-- ----------------------------------------------------------------------------
-- 1. Geen `SECURITY DEFINER`: trigger draait in caller-context. `auth.role()`
--    geeft de JWT-claim, dus de service-role-check is exploit-vrij.
-- 2. Trigger fires alleen bij UPDATE OF last_exported_at — geen overhead
--    bij andere kolom-wijzigingen.
-- 3. Combineert met bestaande `enforce_bsn_immutable` (0010) en
--    `enforce_onboarding_transition` (0006/0007) — alle drie BEFORE UPDATE
--    triggers, alfabetische volgorde garandeert geen interactie-issues.
