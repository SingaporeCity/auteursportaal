-- ============================================================================
-- 0012_audit_actions.sql
-- ============================================================================
-- Forensische audit-trail (audit-findings H9 + M10).
--
-- Logt wie, wanneer, wat veranderde — voor compliance (AVG art. 5(2)
-- accountability + art. 32 logging) én incident-response.
--
-- Twee bronnen:
--   1. DB-triggers op key-tabellen — pakken automatisch UPDATEs op die via
--      portaal of admin-UI gaan, ook als de Edge Function een audit-row
--      vergeet te schrijven.
--   2. Edge Functions schrijven hogere-niveau-events (csv_imported,
--      invite_sent, etc.) waar trigger-logging onpraktisch is.
--
-- Beide schrijven naar dezelfde tabel met `actor_id` als de identifier
-- van wie de actie initieerde. NULL bij scheduled jobs / system-actions.
--
-- Beveiliging:
--   - RLS: alleen admins SELECT
--   - INSERT/UPDATE/DELETE alleen via service-role (Edge Function of trigger
--     met SECURITY DEFINER)
--   - `before`/`after` JSONB: NIET de hele rij — alleen de gewijzigde
--     velden, en BSN/IBAN nooit in plaintext (zie filter-functie hieronder)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Action-type enum
-- ----------------------------------------------------------------------------
CREATE TYPE audit_action_type AS ENUM (
    -- Author lifecycle
    'author_created',
    'author_invited',
    'author_reminded',
    'author_activated',
    'author_status_changed',
    -- Profile
    'profile_updated_direct',     -- onboarding-mode directe writes
    'change_request_created',
    'change_request_approved',
    'change_request_rejected',
    -- Payments / Statements
    'payment_created',
    'payment_updated',
    'payment_deleted',
    -- Expenses
    'expense_submitted',
    'expense_status_changed',
    -- Bulk operations
    'csv_imported',
    'csv_exported',
    -- Sessions
    'login_success'
);

-- ----------------------------------------------------------------------------
-- 2. audit_actions tabel
-- ----------------------------------------------------------------------------
CREATE TABLE audit_actions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_type   audit_action_type NOT NULL,
    actor_id      UUID REFERENCES authors(id) ON DELETE SET NULL,
    -- target: welke entiteit raakte het
    target_table  TEXT,
    target_id     UUID,
    -- voor/na: alleen gewijzigde velden, BSN/IBAN gemaskeerd
    before        JSONB,
    after         JSONB,
    -- context
    metadata      JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_actions_created_at ON audit_actions(created_at DESC);
CREATE INDEX idx_audit_actions_actor      ON audit_actions(actor_id);
CREATE INDEX idx_audit_actions_action     ON audit_actions(action_type);
CREATE INDEX idx_audit_actions_target     ON audit_actions(target_table, target_id);

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE audit_actions ENABLE ROW LEVEL SECURITY;

-- Admins kunnen lezen (voor audit-overview UI)
CREATE POLICY audit_actions_admin_select ON audit_actions
    FOR SELECT USING (public.is_admin());

-- Geen INSERT/UPDATE/DELETE policies voor authenticated.
-- Service-role bypassed RLS — Edge Functions + DB-triggers (SECURITY DEFINER)
-- schrijven via die rol.

-- ----------------------------------------------------------------------------
-- 4. GRANTs (project heeft auto-expose UIT)
-- ----------------------------------------------------------------------------
GRANT ALL ON audit_actions TO service_role;
GRANT SELECT ON audit_actions TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Helper: filter PII uit JSONB-snapshot
-- ----------------------------------------------------------------------------
-- Strip BSN/IBAN/bankrekening naar gemaskeerde versie zodat audit-rijen
-- niet onnodig PII bevatten. Wel behouden: naam, email, status, datums.
CREATE OR REPLACE FUNCTION public.audit_strip_pii(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    result JSONB := payload;
BEGIN
    IF result IS NULL THEN
        RETURN NULL;
    END IF;
    -- BSN: laatste 4 cijfers behouden voor herkenbaarheid
    IF result ? 'bsn' AND result->>'bsn' IS NOT NULL AND length(result->>'bsn') >= 4 THEN
        result := jsonb_set(
            result,
            '{bsn}',
            to_jsonb('•••••' || right(result->>'bsn', 4))
        );
    END IF;
    -- IBAN: alleen laatste 4 cijfers
    IF result ? 'bank_account' AND result->>'bank_account' IS NOT NULL AND length(result->>'bank_account') >= 4 THEN
        result := jsonb_set(
            result,
            '{bank_account}',
            to_jsonb('••••' || right(result->>'bank_account', 4))
        );
    END IF;
    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_strip_pii(JSONB) TO service_role, authenticated;

-- ----------------------------------------------------------------------------
-- 6. Trigger: audit op authors-status-changes + profile-updates
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_authors_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    actor UUID;
    diff_before JSONB := '{}';
    diff_after  JSONB := '{}';
    monitored TEXT[] := ARRAY[
        'first_name', 'last_name', 'phone', 'street', 'house_number',
        'postcode', 'city', 'country', 'birth_date', 'bsn', 'bank_account',
        'bic', 'email', 'is_admin', 'onboarding_status', 'is_active'
    ];
    field TEXT;
    old_val JSONB;
    new_val JSONB;
BEGIN
    actor := auth.uid();  -- NULL als trigger draait via service-role

    -- Bouw diff: alleen gemonitorde velden die daadwerkelijk veranderden
    FOREACH field IN ARRAY monitored LOOP
        old_val := to_jsonb(OLD)->field;
        new_val := to_jsonb(NEW)->field;
        IF old_val IS DISTINCT FROM new_val THEN
            diff_before := diff_before || jsonb_build_object(field, old_val);
            diff_after  := diff_after  || jsonb_build_object(field, new_val);
        END IF;
    END LOOP;

    -- Niets gemonitord gewijzigd? geen audit-row.
    IF diff_after = '{}'::JSONB THEN
        RETURN NEW;
    END IF;

    -- Bepaal action_type op basis van wat veranderde
    DECLARE
        atype audit_action_type := 'profile_updated_direct';
    BEGIN
        IF diff_after ? 'onboarding_status' THEN
            atype := 'author_status_changed';
        END IF;

        INSERT INTO audit_actions (
            action_type, actor_id, target_table, target_id,
            before, after, metadata
        ) VALUES (
            atype,
            actor,
            'authors',
            NEW.id,
            public.audit_strip_pii(diff_before),
            public.audit_strip_pii(diff_after),
            jsonb_build_object('via', CASE WHEN auth.role() = 'service_role' THEN 'service_role' ELSE 'user' END)
        );
    END;

    RETURN NEW;
END;
$$;

CREATE TRIGGER authors_audit_change
    AFTER UPDATE ON authors
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_authors_change();

-- ----------------------------------------------------------------------------
-- 7. Trigger: audit op change_requests
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_change_requests()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    actor UUID;
    atype audit_action_type;
BEGIN
    actor := auth.uid();

    IF TG_OP = 'INSERT' THEN
        atype := 'change_request_created';
        INSERT INTO audit_actions (
            action_type, actor_id, target_table, target_id, after, metadata
        ) VALUES (
            atype, actor, 'change_requests', NEW.id,
            jsonb_build_object('field_name', NEW.field_name, 'author_id', NEW.author_id),
            '{}'::JSONB
        );
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        IF NEW.status = 'approved' THEN
            atype := 'change_request_approved';
        ELSIF NEW.status = 'rejected' THEN
            atype := 'change_request_rejected';
        ELSE
            RETURN NEW;
        END IF;
        INSERT INTO audit_actions (
            action_type, actor_id, target_table, target_id, before, after, metadata
        ) VALUES (
            atype, actor, 'change_requests', NEW.id,
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status, 'field_name', NEW.field_name),
            jsonb_build_object('rejection_reason', NEW.rejection_reason)
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER change_requests_audit
    AFTER INSERT OR UPDATE ON change_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_change_requests();

-- ----------------------------------------------------------------------------
-- 8. Trigger: audit op payments (admin uploadt/wijzigt afrekeningen)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_payments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    actor UUID := auth.uid();
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_actions (
            action_type, actor_id, target_table, target_id, after
        ) VALUES (
            'payment_created', actor, 'payments', NEW.id,
            jsonb_build_object(
                'author_id', NEW.author_id, 'year', NEW.year, 'type', NEW.type,
                'amount', NEW.amount
            )
        );
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_actions (
            action_type, actor_id, target_table, target_id, before, after
        ) VALUES (
            'payment_updated', actor, 'payments', NEW.id,
            jsonb_build_object('amount', OLD.amount, 'file_path', OLD.file_path),
            jsonb_build_object('amount', NEW.amount, 'file_path', NEW.file_path)
        );
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_actions (
            action_type, actor_id, target_table, target_id, before
        ) VALUES (
            'payment_deleted', actor, 'payments', OLD.id,
            jsonb_build_object(
                'author_id', OLD.author_id, 'year', OLD.year, 'type', OLD.type,
                'amount', OLD.amount
            )
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER payments_audit
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_payments();

-- ----------------------------------------------------------------------------
-- 9. Trigger: audit op expenses status-changes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_expenses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    actor UUID := auth.uid();
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_actions (
            action_type, actor_id, target_table, target_id, after
        ) VALUES (
            'expense_submitted', actor, 'expenses', NEW.id,
            jsonb_build_object(
                'author_id', NEW.author_id, 'amount', NEW.amount,
                'expense_type', NEW.expense_type
            )
        );
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO audit_actions (
            action_type, actor_id, target_table, target_id, before, after, metadata
        ) VALUES (
            'expense_status_changed', actor, 'expenses', NEW.id,
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status),
            jsonb_build_object('rejection_reason', NEW.rejection_reason)
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER expenses_audit
    AFTER INSERT OR UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_expenses();

-- ----------------------------------------------------------------------------
-- 10. GRANTs voor functies
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.audit_authors_change() TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.audit_change_requests() TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.audit_payments() TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.audit_expenses() TO service_role, authenticated, anon;
