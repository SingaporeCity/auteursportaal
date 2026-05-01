-- =============================================================================
-- 0001_initial_schema.sql — Auteursportaal productie-schema
--
-- Bevat alle tabellen, indexes en Row Level Security policies voor het portaal.
-- Run als eerste in een schoon Supabase-project via SQL Editor.
--
-- Uitgesloten t.o.v. demo-versie:
--   * events / blog_posts / vacancies — publieke marketing-site is verwijderd
--   * sync_log — NetSuite-integratie is buiten scope
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE authors (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identifiers vanuit financiële administratie
    netsuite_vendor_id    VARCHAR(50)  UNIQUE,
    netsuite_internal_id  INTEGER      UNIQUE,
    alliant_id            VARCHAR(50),

    -- Account
    email                 VARCHAR(255) UNIQUE NOT NULL,

    -- Persoonlijk
    first_name            VARCHAR(100) NOT NULL,
    last_name             VARCHAR(100) NOT NULL,
    initials              VARCHAR(20),
    bsn                   VARCHAR(20),
    birth_date            DATE,

    -- Contact
    phone                 VARCHAR(50),

    -- Adres
    street                VARCHAR(255),
    house_number          VARCHAR(20),
    postcode              VARCHAR(20),
    city                  VARCHAR(100),
    country               VARCHAR(100) DEFAULT 'Nederland',

    -- Bank
    bank_account          VARCHAR(50),  -- IBAN
    bic                   VARCHAR(20),

    -- Toegang & status
    is_admin              BOOLEAN      NOT NULL DEFAULT false,
    is_active             BOOLEAN      NOT NULL DEFAULT false,  -- pas true na admin-activatie

    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    activated_at          TIMESTAMPTZ
);

CREATE TABLE contracts (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id             UUID NOT NULL REFERENCES authors(id) ON DELETE CASCADE,

    contract_number       VARCHAR(50)  NOT NULL,
    contract_name         VARCHAR(255),
    royalty_percentage    NUMERIC(5,2),
    start_date            DATE,
    end_date              DATE,
    file_path             VARCHAR(500), -- Storage-pad

    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE payments (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id             UUID NOT NULL REFERENCES authors(id) ON DELETE CASCADE,

    year                  INTEGER NOT NULL,
    type                  VARCHAR(20) NOT NULL CHECK (type IN ('royalty', 'subsidiary', 'foreign', 'jaaropgave')),
    amount                NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency              CHAR(3) NOT NULL DEFAULT 'EUR',

    title_nl              VARCHAR(255),
    title_en              VARCHAR(255),
    payment_date          DATE,
    file_path             VARCHAR(500),  -- Storage-pad

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Voorkomen van duplicate uploads
    UNIQUE (author_id, year, type, file_path)
);

CREATE TABLE forecasts (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id             UUID NOT NULL REFERENCES authors(id) ON DELETE CASCADE,

    year                  INTEGER NOT NULL,
    min_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
    max_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (author_id, year)
);

CREATE TABLE change_requests (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id             UUID NOT NULL REFERENCES authors(id) ON DELETE CASCADE,

    field_name            VARCHAR(50) NOT NULL,
    old_value             TEXT,
    new_value             TEXT,
    status                VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected')),

    requested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at          TIMESTAMPTZ,
    processed_by          UUID REFERENCES authors(id),
    rejection_reason      TEXT
);

CREATE TABLE login_history (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id             UUID NOT NULL REFERENCES authors(id) ON DELETE CASCADE,

    logged_in_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address            INET
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_authors_email             ON authors(email);
CREATE INDEX idx_authors_active            ON authors(is_active);
CREATE INDEX idx_contracts_author          ON contracts(author_id);
CREATE INDEX idx_payments_author           ON payments(author_id);
CREATE INDEX idx_payments_year             ON payments(year);
CREATE INDEX idx_payments_author_year      ON payments(author_id, year);
CREATE INDEX idx_forecasts_author          ON forecasts(author_id);
CREATE INDEX idx_change_requests_author    ON change_requests(author_id);
CREATE INDEX idx_change_requests_status    ON change_requests(status);
CREATE INDEX idx_login_history_author      ON login_history(author_id);
CREATE INDEX idx_login_history_logged_in   ON login_history(logged_in_at DESC);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM authors WHERE id = auth.uid() AND is_admin = true
    );
$$;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_authors_updated_at
    BEFORE UPDATE ON authors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE authors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecasts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_history    ENABLE ROW LEVEL SECURITY;

-- AUTHORS
CREATE POLICY authors_select_own_or_admin ON authors
    FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY authors_update_own ON authors
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY authors_admin_all ON authors
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- CONTRACTS
CREATE POLICY contracts_select_own_or_admin ON contracts
    FOR SELECT USING (author_id = auth.uid() OR public.is_admin());

CREATE POLICY contracts_admin_all ON contracts
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- PAYMENTS
CREATE POLICY payments_select_own_or_admin ON payments
    FOR SELECT USING (author_id = auth.uid() OR public.is_admin());

CREATE POLICY payments_admin_all ON payments
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- FORECASTS
CREATE POLICY forecasts_select_own_or_admin ON forecasts
    FOR SELECT USING (author_id = auth.uid() OR public.is_admin());

CREATE POLICY forecasts_admin_all ON forecasts
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- CHANGE_REQUESTS
CREATE POLICY change_requests_select_own_or_admin ON change_requests
    FOR SELECT USING (author_id = auth.uid() OR public.is_admin());

CREATE POLICY change_requests_insert_own ON change_requests
    FOR INSERT WITH CHECK (author_id = auth.uid());

CREATE POLICY change_requests_admin_update ON change_requests
    FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- LOGIN_HISTORY — strakker dan demo: alleen eigen rij invoegen
CREATE POLICY login_history_select_own_or_admin ON login_history
    FOR SELECT USING (author_id = auth.uid() OR public.is_admin());

CREATE POLICY login_history_insert_own ON login_history
    FOR INSERT WITH CHECK (author_id = auth.uid());
