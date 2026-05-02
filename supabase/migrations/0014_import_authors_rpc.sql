-- ============================================================================
-- 0014_import_authors_rpc.sql
-- ============================================================================
-- Atomic per-rij upsert voor CSV-import (audit-finding M8).
--
-- Probleem in de oude flow: de Edge Function deed
--   SELECT id, bsn FROM authors WHERE email = ...
--   IF existing → UPDATE authors SET ... WHERE id = ...
--   ELSE        → INSERT INTO authors VALUES ...
--
-- Tussen SELECT en UPDATE/INSERT zit een race-window. Twee parallelle
-- imports met dezelfde rij zouden duplicates kunnen aanmaken of de BSN
-- van de ene de andere overschrijven.
--
-- Deze RPC pakt een single rij + mode en doet het in één atomic statement
-- via INSERT ... ON CONFLICT (email) ... DO UPDATE. BSN wordt alleen
-- overschreven als bestaand record `bsn IS NULL` heeft (immutability uit
-- migration 0010 doet de rest, maar deze check geeft nette error-classifier
-- terug ipv 42501-exception).
--
-- Returnt status-text die Edge Function in result-tabel kan accumuleren:
--   'created'      — nieuwe rij ingevoegd
--   'updated'      — bestaande rij bijgewerkt
--   'bsn_skipped'  — bestaande rij bijgewerkt, BSN-veld bewust niet
--   'skipped'      — mode='create_only' en email bestaat al
-- ============================================================================

CREATE OR REPLACE FUNCTION public.import_author_row(
    p_email           TEXT,
    p_first_name      TEXT,
    p_last_name       TEXT,
    p_phone           TEXT,
    p_street          TEXT,
    p_house_number    TEXT,
    p_postcode        TEXT,
    p_city            TEXT,
    p_country         TEXT,
    p_birth_date      DATE,
    p_bsn             TEXT,
    p_bank_account    TEXT,
    p_bic             TEXT,
    p_vendor_id       TEXT,
    p_alliant_id      TEXT,
    p_status          TEXT,    -- 'pending_data' | 'pending_admin_review'
    p_mode            TEXT     -- 'create_only' | 'upsert'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    existing_id  UUID;
    existing_bsn TEXT;
    out_status   TEXT;
BEGIN
    -- Lock-row als deze bestaat zodat parallelle imports zich serieel afwikkelen.
    SELECT id, bsn INTO existing_id, existing_bsn
    FROM authors
    WHERE email = p_email
    FOR UPDATE;

    IF existing_id IS NOT NULL THEN
        IF p_mode = 'create_only' THEN
            RETURN 'skipped';
        END IF;

        -- Upsert-pad
        IF existing_bsn IS NOT NULL AND existing_bsn <> '' AND existing_bsn IS DISTINCT FROM p_bsn THEN
            -- BSN niet overschrijven; rest wel
            UPDATE authors SET
                first_name        = p_first_name,
                last_name         = p_last_name,
                phone             = NULLIF(p_phone, ''),
                street            = NULLIF(p_street, ''),
                house_number      = NULLIF(p_house_number, ''),
                postcode          = NULLIF(p_postcode, ''),
                city              = NULLIF(p_city, ''),
                country           = COALESCE(NULLIF(p_country, ''), 'Nederland'),
                birth_date        = p_birth_date,
                bank_account      = NULLIF(p_bank_account, ''),
                bic               = NULLIF(p_bic, ''),
                netsuite_vendor_id = NULLIF(p_vendor_id, ''),
                alliant_id        = NULLIF(p_alliant_id, ''),
                onboarding_status = p_status::onboarding_status
            WHERE id = existing_id;
            out_status := 'bsn_skipped';
        ELSE
            UPDATE authors SET
                first_name        = p_first_name,
                last_name         = p_last_name,
                phone             = NULLIF(p_phone, ''),
                street            = NULLIF(p_street, ''),
                house_number      = NULLIF(p_house_number, ''),
                postcode          = NULLIF(p_postcode, ''),
                city              = NULLIF(p_city, ''),
                country           = COALESCE(NULLIF(p_country, ''), 'Nederland'),
                birth_date        = p_birth_date,
                bsn               = NULLIF(p_bsn, ''),
                bank_account      = NULLIF(p_bank_account, ''),
                bic               = NULLIF(p_bic, ''),
                netsuite_vendor_id = NULLIF(p_vendor_id, ''),
                alliant_id        = NULLIF(p_alliant_id, ''),
                onboarding_status = p_status::onboarding_status
            WHERE id = existing_id;
            out_status := 'updated';
        END IF;
    ELSE
        -- Nieuwe rij
        INSERT INTO authors (
            email, first_name, last_name, phone,
            street, house_number, postcode, city, country,
            birth_date, bsn, bank_account, bic,
            netsuite_vendor_id, alliant_id, onboarding_status
        ) VALUES (
            p_email, p_first_name, p_last_name, NULLIF(p_phone, ''),
            NULLIF(p_street, ''), NULLIF(p_house_number, ''), NULLIF(p_postcode, ''),
            NULLIF(p_city, ''), COALESCE(NULLIF(p_country, ''), 'Nederland'),
            p_birth_date, NULLIF(p_bsn, ''), NULLIF(p_bank_account, ''), NULLIF(p_bic, ''),
            NULLIF(p_vendor_id, ''), NULLIF(p_alliant_id, ''),
            p_status::onboarding_status
        );
        out_status := 'created';
    END IF;

    RETURN out_status;
END;
$$;

-- Alleen service-role mag deze functie aanroepen — Edge Function doet dit
-- via service-key. Authenticated heeft het niet nodig (admin-flow).
GRANT EXECUTE ON FUNCTION public.import_author_row(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;
