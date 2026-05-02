-- ============================================================================
-- 0006_onboarding_status.sql
-- ============================================================================
-- Introduceert een 3-staps onboarding-statemachine per auteur:
--   pending_data           — auteur is uitgenodigd, vult eigen data aan
--   pending_admin_review   — auteur heeft data ingediend, wacht op admin-OK
--   active                 — admin heeft geactiveerd, volledig portaal-toegang
--
-- `is_active` blijft tijdelijk bestaan voor backward-compat tijdens code-rollout.
-- Zodra alle code op `onboarding_status` draait wordt `is_active` gedropt
-- in een vervolg-migration.
--
-- RLS-policies op data-tabellen worden aangescherpt: alleen `active`-auteurs
-- kunnen eigen payments/contracts/forecasts/expenses zien (defense-in-depth).
--
-- Een DB-trigger blokkeert ongeoorloofde status-overgangen: een auteur kan
-- alleen `pending_data → pending_admin_review`, alle andere transities zijn
-- admin-only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enum-type
-- ----------------------------------------------------------------------------
CREATE TYPE onboarding_status AS ENUM (
    'pending_data',
    'pending_admin_review',
    'active'
);

-- ----------------------------------------------------------------------------
-- 2. Kolommen op `authors`
-- ----------------------------------------------------------------------------
ALTER TABLE authors
    ADD COLUMN onboarding_status onboarding_status NOT NULL DEFAULT 'pending_data',
    ADD COLUMN invited_at        TIMESTAMPTZ,
    ADD COLUMN data_submitted_at TIMESTAMPTZ,
    ADD COLUMN reminder_sent_at  TIMESTAMPTZ;
-- `activated_at` bestaat al

CREATE INDEX idx_authors_onboarding_status ON authors(onboarding_status);

-- ----------------------------------------------------------------------------
-- 3. Backfill — bestaande rijen
-- ----------------------------------------------------------------------------
-- Admins zijn altijd direct active
UPDATE authors
   SET onboarding_status = 'active'
 WHERE is_admin = true;

-- Bestaande actieve auteurs (Charlotte) → pending_admin_review
-- Conform user-keuze: admin moet expliciet activeren in nieuwe flow
UPDATE authors
   SET onboarding_status = 'pending_admin_review'
 WHERE is_admin = false
   AND is_active = true;

-- ----------------------------------------------------------------------------
-- 4. RLS-policies aanscherpen op data-tabellen (defense-in-depth)
-- ----------------------------------------------------------------------------
-- Helper-functie: is auth.uid() volledig active?
CREATE OR REPLACE FUNCTION public.is_active_author()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM authors
         WHERE id = auth.uid()
           AND onboarding_status = 'active'
    );
$$;

-- PAYMENTS
DROP POLICY IF EXISTS payments_select_own_or_admin ON payments;
CREATE POLICY payments_select_active_own_or_admin ON payments
    FOR SELECT USING (
        public.is_admin()
        OR (author_id = auth.uid() AND public.is_active_author())
    );

-- CONTRACTS
DROP POLICY IF EXISTS contracts_select_own_or_admin ON contracts;
CREATE POLICY contracts_select_active_own_or_admin ON contracts
    FOR SELECT USING (
        public.is_admin()
        OR (author_id = auth.uid() AND public.is_active_author())
    );

-- FORECASTS
DROP POLICY IF EXISTS forecasts_select_own_or_admin ON forecasts;
CREATE POLICY forecasts_select_active_own_or_admin ON forecasts
    FOR SELECT USING (
        public.is_admin()
        OR (author_id = auth.uid() AND public.is_active_author())
    );

-- EXPENSES (selectie + insert)
DROP POLICY IF EXISTS expenses_select_own_or_admin ON expenses;
CREATE POLICY expenses_select_active_own_or_admin ON expenses
    FOR SELECT USING (
        public.is_admin()
        OR (author_id = auth.uid() AND public.is_active_author())
    );

DROP POLICY IF EXISTS expenses_insert_own ON expenses;
CREATE POLICY expenses_insert_active_own ON expenses
    FOR INSERT WITH CHECK (
        author_id = auth.uid() AND public.is_active_author()
    );

-- AUTHORS — selectpolicy blijft (auteur moet eigen profiel kunnen lezen
-- in alle statussen om profile-tab te kunnen vullen). UPDATE-policy blijft
-- ook (auteur kan eigen rij wijzigen tijdens pending_data).

-- ----------------------------------------------------------------------------
-- 5. Trigger: blokkeer ongeoorloofde status-transities
-- ----------------------------------------------------------------------------
-- Auteur mag alleen pending_data → pending_admin_review.
-- Alle andere transities zijn admin-only.
-- Trigger zet automatisch `data_submitted_at` bij die transitie.
CREATE OR REPLACE FUNCTION public.enforce_onboarding_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Status onveranderd? Niets te checken.
    IF NEW.onboarding_status = OLD.onboarding_status THEN
        RETURN NEW;
    END IF;

    -- Admins mogen alle transities
    IF public.is_admin() THEN
        IF NEW.onboarding_status = 'active' AND OLD.onboarding_status <> 'active' THEN
            NEW.activated_at = NOW();
        END IF;
        RETURN NEW;
    END IF;

    -- Niet-admin: alleen pending_data → pending_admin_review toegestaan
    IF OLD.onboarding_status = 'pending_data'
       AND NEW.onboarding_status = 'pending_admin_review' THEN
        NEW.data_submitted_at = NOW();
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Status-transitie van % naar % is niet toegestaan voor niet-admin gebruikers',
                    OLD.onboarding_status, NEW.onboarding_status
                    USING ERRCODE = '42501'; -- insufficient_privilege
END;
$$;

CREATE TRIGGER authors_enforce_onboarding_transition
    BEFORE UPDATE OF onboarding_status ON authors
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_onboarding_transition();

-- ----------------------------------------------------------------------------
-- 6. Sync `is_active` voor backward-compat (tijdelijke trigger)
-- ----------------------------------------------------------------------------
-- Tot we `is_active` droppen, houden we beide kolommen synchroon.
CREATE OR REPLACE FUNCTION public.sync_is_active_with_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.is_active = (NEW.onboarding_status = 'active');
    RETURN NEW;
END;
$$;

CREATE TRIGGER authors_sync_is_active
    BEFORE INSERT OR UPDATE OF onboarding_status ON authors
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_is_active_with_status();

-- ----------------------------------------------------------------------------
-- COMMIT NOTES (voor IT-review)
-- ----------------------------------------------------------------------------
-- 1. `is_active_author()` is `SECURITY DEFINER` — draait met function-owner
--    privileges, NIET met de caller's. Dit is nodig zodat RLS niet recursief
--    triggert bij de subquery in policies. Hetzelfde patroon als `is_admin()`.
-- 2. `enforce_onboarding_transition()` is ook `SECURITY DEFINER` zodat het
--    `is_admin()` correct kan aanroepen. De trigger draait BEFORE UPDATE en
--    raise exception bij ongeoorloofde transitie — voorkomt status-zelf-promotie
--    via direct DB-toegang met author-JWT.
-- 3. `idx_authors_active` (op is_active) blijft staan tot we is_active droppen.
