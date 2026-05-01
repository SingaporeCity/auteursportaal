-- =============================================================================
-- 0003_expenses.sql — Declaraties (expenses) tabel + RLS
--
-- Vervangt de localStorage-fallback uit de demo-versie. Echte Supabase-backed
-- declaraties met admin-approval-flow.
--
-- Run NA 0001_initial_schema.sql en 0002_storage_buckets.sql.
-- =============================================================================

CREATE TABLE expenses (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id         UUID NOT NULL REFERENCES authors(id) ON DELETE CASCADE,

    description       VARCHAR(255) NOT NULL,
    amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    currency          CHAR(3) NOT NULL DEFAULT 'EUR',
    expense_type      VARCHAR(20) NOT NULL DEFAULT 'onkosten'
                      CHECK (expense_type IN ('onkosten', 'idc')),

    receipt_path      VARCHAR(500),  -- Storage-pad in expense-receipts bucket

    status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),

    submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at      TIMESTAMPTZ,
    processed_by      UUID REFERENCES authors(id),
    rejection_reason  TEXT,
    paid_at           TIMESTAMPTZ
);

CREATE INDEX idx_expenses_author        ON expenses(author_id);
CREATE INDEX idx_expenses_status        ON expenses(status);
CREATE INDEX idx_expenses_submitted     ON expenses(submitted_at DESC);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Auteurs zien hun eigen declaraties; admins zien alles
CREATE POLICY expenses_select_own_or_admin ON expenses
    FOR SELECT USING (author_id = auth.uid() OR public.is_admin());

-- Auteurs mogen alleen hun eigen declaraties indienen
CREATE POLICY expenses_insert_own ON expenses
    FOR INSERT WITH CHECK (author_id = auth.uid());

-- Alleen admins beoordelen / wijzigen status
CREATE POLICY expenses_admin_update ON expenses
    FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Admins mogen verwijderen (bv bij dubbele indiening)
CREATE POLICY expenses_admin_delete ON expenses
    FOR DELETE USING (public.is_admin());
