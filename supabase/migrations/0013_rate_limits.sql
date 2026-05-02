-- ============================================================================
-- 0013_rate_limits.sql
-- ============================================================================
-- Server-side rate-limiting voor Edge Functions (audit-finding H10).
--
-- Doel: voorkom dat een gecompromitteerd of misbruikt admin-account in korte
-- tijd duizenden invite-mails verstuurt, of een gigabyte CSV-export trekt.
-- Rate-limits zijn per actor (admin-UUID) + per action-key.
--
-- Strategie: fixed-window counter. Atomair via INSERT ... ON CONFLICT, geen
-- aparte locking nodig. Bij overschrijding krijgt de Edge Function `false`
-- terug en geeft die HTTP 429.
--
-- Tabel-rijen worden hergebruikt (één rij per actor+action), niet
-- per-request. Counter reset zodra window verloopt.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabel
-- ----------------------------------------------------------------------------
CREATE TABLE rate_limits (
    actor_id           UUID NOT NULL,
    action_key         TEXT NOT NULL,
    window_started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    count              INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (actor_id, action_key)
);

-- Index voor cleanup-jobs (optionele toekomstige feature)
CREATE INDEX idx_rate_limits_window ON rate_limits(window_started_at);

-- ----------------------------------------------------------------------------
-- 2. RLS — geen reads/writes vanuit clients. Alleen service-role.
-- ----------------------------------------------------------------------------
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- Geen policies = geen toegang voor authenticated/anon. Service-role bypassed.

GRANT ALL ON rate_limits TO service_role;
-- Geen GRANT voor authenticated/anon — admin ziet rate-limits niet (geen UI nodig)

-- ----------------------------------------------------------------------------
-- 3. Check-functie
-- ----------------------------------------------------------------------------
-- Returns true als request binnen rate-limit valt, false als overschreden.
-- Atomic via INSERT ... ON CONFLICT — geen race-condities tussen parallelle
-- Edge Function-instances.
--
-- Window-logica: als `now() - window_started_at > window_seconds`, reset
-- de teller naar 1 + start nieuw window. Anders verhoog teller.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_actor          UUID,
    p_action         TEXT,
    p_max            INTEGER,
    p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_count INTEGER;
BEGIN
    -- Atomair upsert + count-update
    INSERT INTO rate_limits (actor_id, action_key, window_started_at, count)
    VALUES (p_actor, p_action, NOW(), 1)
    ON CONFLICT (actor_id, action_key) DO UPDATE
        SET
            window_started_at = CASE
                WHEN NOW() - rate_limits.window_started_at > make_interval(secs => p_window_seconds)
                    THEN NOW()
                ELSE rate_limits.window_started_at
            END,
            count = CASE
                WHEN NOW() - rate_limits.window_started_at > make_interval(secs => p_window_seconds)
                    THEN 1  -- nieuw window: tellen vanaf 1
                ELSE rate_limits.count + 1
            END
        RETURNING count INTO current_count;

    -- Returneer true als binnen limiet
    RETURN current_count <= p_max;
END;
$$;

-- Alleen service-role mag deze functie aanroepen (Edge Functions doen dit
-- via service-role client). Authenticated heeft het niet nodig — er is
-- geen direct-RPC use case vanuit browser.
GRANT EXECUTE ON FUNCTION public.check_rate_limit(UUID, TEXT, INTEGER, INTEGER) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Cleanup helper (optioneel — handmatig of via cron)
-- ----------------------------------------------------------------------------
-- Verwijder counter-rijen van actors die >24u niets hebben gedaan.
-- Niet kritiek; voorkomt onbeperkte tabel-groei bij veel verschillende admins.
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted INTEGER;
BEGIN
    DELETE FROM rate_limits
    WHERE window_started_at < NOW() - INTERVAL '24 hours';
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RETURN deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_rate_limits() TO service_role;
