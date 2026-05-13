-- =============================================================================
-- 0016_contracts_bucket.sql — aparte storage-bucket voor contract-PDFs
--
-- Tot nu toe gebruikte de auteur-Contracten-tab de `statements`-bucket voor
-- de PDF-downloads (legacy van de demo-data). Met de nieuwe admin-upload-
-- flow krijgen contracts een eigen bucket zodat:
--   - statements (royalty-afrekeningen) en contracts gescheiden zijn,
--   - RLS-policies semantisch kloppen,
--   - de bucket-naam in de UI niet meer misleidt.
--
-- Padconventie: {author_uuid}/{contract_id}.pdf
-- Eerste path-segment is de auteur-UUID zodat de "auteur ziet eigen rijen"-
-- policy hetzelfde foldername(name)[1] = auth.uid() patroon kan gebruiken
-- als statements + expense-receipts.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', false)
ON CONFLICT (id) DO NOTHING;

-- Auteurs mogen eigen contract-PDFs downloaden (via signed URL gegenereerd
-- door de frontend); admins mogen alle contracten lezen.
CREATE POLICY "contracts_select_own_or_admin"
    ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'contracts'
        AND (
            auth.uid()::text = (storage.foldername(name))[1]
            OR public.is_admin()
        )
    );

-- Alleen admins mogen contracten toevoegen, vervangen of verwijderen.
-- Auteurs mogen GEEN eigen contracten uploaden (in tegenstelling tot
-- expense-receipts) — admin-only beheer.
CREATE POLICY "contracts_admin_all"
    ON storage.objects
    FOR ALL
    USING (
        bucket_id = 'contracts'
        AND public.is_admin()
    )
    WITH CHECK (
        bucket_id = 'contracts'
        AND public.is_admin()
    );
