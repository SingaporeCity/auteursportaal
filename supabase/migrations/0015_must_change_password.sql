-- ============================================================================
-- 0015_must_change_password.sql
-- ============================================================================
-- Voeg kolommen toe voor de geforceerde wachtwoord-wijziging bij eerste login.
--
-- Test-fase context:
-- Bulk-import en de "Nieuwe auteur"-knop maken accounts aan met een vast
-- start-wachtwoord 'Noordhoff'. Bij de eerste inlog wordt de gebruiker
-- gedwongen een eigen wachtwoord te kiezen. Na succesvolle wijziging zet
-- de frontend zelf `must_change_password = false` (via authors_update_own
-- RLS-policy) + `password_changed_at = NOW()`.
--
-- `password_changed_at` dient als audit-helper en latere "ww te oud, vernieuw"-
-- policy; voor nu alleen-uitlees.
-- ============================================================================

ALTER TABLE authors
    ADD COLUMN must_change_password BOOLEAN     NOT NULL DEFAULT false,
    ADD COLUMN password_changed_at  TIMESTAMPTZ,
    -- Spiegel-kolom voor "heeft minstens 1 verified MFA-factor". Wordt
    -- synchroon gehouden via trigger op auth.mfa_factors (zie onder). Admin-
    -- UI gebruikt dit voor een 2FA-badge en filter zonder per-rij RPC-call.
    ADD COLUMN mfa_enrolled         BOOLEAN     NOT NULL DEFAULT false;

-- Bestaande actieve auteurs hebben al een eigen wachtwoord gekozen — niet
-- forceren dat ze opnieuw wijzigen. Default = false dekt dat al; deze
-- expliciete UPDATE is voor de duidelijkheid + voor toekomstige migraties
-- die de default zouden willen wijzigen.
UPDATE authors
   SET must_change_password = false
 WHERE onboarding_status = 'active';

CREATE INDEX idx_authors_must_change_password
    ON authors(must_change_password)
    WHERE must_change_password = true;

-- ============================================================================
-- Trigger: houdt `authors.mfa_enrolled` synchroon met auth.mfa_factors
-- ============================================================================
-- Wanneer een auteur een TOTP-factor verifieert / verwijdert (via admin-reset
-- of zelf) zet de trigger het spiegel-veld in `authors`. SECURITY DEFINER
-- omdat NEW.user_id naar auth-schema verwijst en de trigger zonder verhoogde
-- rechten geen UPDATE op authors zou mogen doen voor een andere user.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_authors_mfa_enrolled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    target_user_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_user_id := OLD.user_id;
    ELSE
        target_user_id := NEW.user_id;
    END IF;

    UPDATE public.authors
       SET mfa_enrolled = EXISTS (
           SELECT 1 FROM auth.mfa_factors
            WHERE user_id = target_user_id
              AND status = 'verified'
       )
     WHERE id = target_user_id;

    RETURN NULL; -- AFTER-trigger
END;
$$;

CREATE TRIGGER trg_sync_authors_mfa_enrolled
AFTER INSERT OR UPDATE OR DELETE ON auth.mfa_factors
FOR EACH ROW
EXECUTE FUNCTION public.sync_authors_mfa_enrolled();

-- Backfill: bestaande auteurs hebben in deze repo (greenfield 2FA) geen
-- factors, dus de DEFAULT false dekt het al. De expliciete UPDATE staat hier
-- voor toekomstige re-runs van deze migration op een gevulde DB.
UPDATE public.authors a
   SET mfa_enrolled = EXISTS (
       SELECT 1 FROM auth.mfa_factors mf
        WHERE mf.user_id = a.id
          AND mf.status = 'verified'
   );

-- ============================================================================
-- Admin-reset-MFA RPC
-- ============================================================================
-- Admins moeten een 2FA-factor kunnen wissen wanneer een auteur zijn/haar
-- device kwijt is. We doen dat via deze SECURITY DEFINER functie: bypasst RLS
-- op auth.mfa_factors (waar de client geen rechten op heeft) en checkt zelf
-- of de caller een admin is. Bij volgende inlog van de doel-auteur dwingt de
-- frontend automatisch een nieuwe enrollment af (mfa_enroll_required-pad in
-- main.ts).
--
-- Backup-codes zijn (nog) niet geïmplementeerd; admin-reset is voorlopig de
-- enige recovery-route.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_reset_mfa(p_author_id UUID)
RETURNS INTEGER  -- aantal verwijderde factors
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    deleted_count INTEGER;
    actor_uid     UUID;
BEGIN
    -- Admin-check: alleen ingelogde admin mag dit uitvoeren
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required'
              USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;

    actor_uid := auth.uid();

    DELETE FROM auth.mfa_factors
     WHERE user_id = p_author_id;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- Audit-log (H9/M10): MFA-reset is een gevoelige admin-actie. Hergebruik
    -- bestaande `author_status_changed`-enum met metadata-flag voor source.
    BEGIN
        INSERT INTO audit_actions (action_type, actor_id, target_table, target_id, metadata)
        VALUES (
            'author_status_changed',
            actor_uid,
            'authors',
            p_author_id,
            jsonb_build_object(
                'source', 'admin_reset_mfa',
                'factors_deleted', deleted_count
            )
        );
    EXCEPTION WHEN OTHERS THEN
        -- Audit-failure mag de DELETE niet ongedaan maken
        NULL;
    END;

    RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_mfa(UUID) TO authenticated;
