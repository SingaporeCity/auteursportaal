-- =============================================================================
-- 0002_storage_buckets.sql — Buckets + storage RLS
--
-- Twee private buckets:
--   * statements        — royalty-afrekeningen, jaaropgaven, contracten (admin upload, auteur eigen download)
--   * expense-receipts  — bonnen voor declaraties (auteur upload eigen, admin alle download)
--
-- Padconventie: {author_uuid}/{type}/{year}/{filename}.pdf
--
-- Run NA 0001_initial_schema.sql.
-- =============================================================================

-- ============================================
-- BUCKET: statements
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('statements', 'statements', false)
ON CONFLICT (id) DO NOTHING;

-- Auteurs mogen eigen bestanden downloaden (path begint met hun UUID)
CREATE POLICY "statements_select_own"
    ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'statements'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Admins mogen alles in deze bucket
CREATE POLICY "statements_admin_all"
    ON storage.objects
    FOR ALL
    USING (
        bucket_id = 'statements'
        AND public.is_admin()
    )
    WITH CHECK (
        bucket_id = 'statements'
        AND public.is_admin()
    );

-- ============================================
-- BUCKET: expense-receipts
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Auteurs mogen eigen bonnen uploaden
CREATE POLICY "expense_receipts_insert_own"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'expense-receipts'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Auteurs mogen eigen bonnen downloaden
CREATE POLICY "expense_receipts_select_own"
    ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'expense-receipts'
        AND (
            auth.uid()::text = (storage.foldername(name))[1]
            OR public.is_admin()
        )
    );

-- Admins mogen verwijderen/bewerken
CREATE POLICY "expense_receipts_admin_modify"
    ON storage.objects
    FOR ALL
    USING (
        bucket_id = 'expense-receipts'
        AND public.is_admin()
    )
    WITH CHECK (
        bucket_id = 'expense-receipts'
        AND public.is_admin()
    );
