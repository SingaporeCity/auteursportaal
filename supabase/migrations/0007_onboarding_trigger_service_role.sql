-- ============================================================================
-- 0007_onboarding_trigger_service_role.sql
-- ============================================================================
-- HOTFIX: enforce_onboarding_transition() blokkeerde Edge Function-updates
-- naar `active` omdat de trigger `is_admin()` checkt op `auth.uid()` — en in
-- service-role-context is `auth.uid()` NULL, waardoor `is_admin()` false geeft.
--
-- De trigger valt dan door naar de strikte non-admin-check (alleen
-- `pending_data → pending_admin_review` toegestaan) en raised exception bij
-- elke andere transitie. Effect: admin klikt 'Activeer' in admin-portaal,
-- Edge Function probeert UPDATE met service-key, faalt met 42501, frontend
-- toont (door bug 2) toch "Geactiveerd" — maar status blijft pending_admin_review.
--
-- Deze migration herstelt de trigger zodat service-role óók geprivilegieerd is.
--
-- Veiligheid: `auth.role()` returnt de JWT-claim. Browser-JWTs (auteur of
-- admin) hebben role='authenticated', niet 'service_role'. Alleen server-side
-- code met de SUPABASE_SERVICE_ROLE_KEY (Edge Functions, scripts in scripts/)
-- krijgt service_role. Geen privilege-escalation-risk via deze fix.
-- ============================================================================

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

    -- Service-role context (Edge Functions, scripts) en admins mogen alle transities
    IF auth.role() = 'service_role' OR public.is_admin() THEN
        IF NEW.onboarding_status = 'active' AND OLD.onboarding_status <> 'active' THEN
            NEW.activated_at = NOW();
        END IF;
        RETURN NEW;
    END IF;

    -- Niet-admin auteur: alleen pending_data → pending_admin_review toegestaan
    IF OLD.onboarding_status = 'pending_data'
       AND NEW.onboarding_status = 'pending_admin_review' THEN
        NEW.data_submitted_at = NOW();
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Status-transitie van % naar % is niet toegestaan',
                    OLD.onboarding_status, NEW.onboarding_status
                    USING ERRCODE = '42501'; -- insufficient_privilege
END;
$$;

-- Trigger zelf hoeft niet opnieuw aangemaakt te worden — CREATE OR REPLACE
-- FUNCTION update de body in-place; bestaande TRIGGER-binding blijft geldig.
