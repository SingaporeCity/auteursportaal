-- ============================================================================
-- 0018_change_requests_exported_at.sql
-- ============================================================================
-- Markeer welke goedgekeurde change_requests al naar NetSuite zijn
-- ge-exporteerd. Volgende export pakt alleen wijzigingen waar `exported_at`
-- IS NULL — voorkomt dubbele rijen in de Excel-export en geeft admin een
-- duidelijke "wat staat klaar voor de volgende batch"-view.
--
-- NULL = nog niet ge-exporteerd (of niet approved). Pas bij export-actie
-- in de Excel-export Edge Function wordt deze timestamp gezet (in dezelfde
-- transactie als het ophalen van de rijen, om race conditions te vermijden).
-- ============================================================================

ALTER TABLE change_requests
  ADD COLUMN IF NOT EXISTS exported_at TIMESTAMPTZ;

-- Index om de export-query (status='approved' AND exported_at IS NULL)
-- snel te houden ook bij groeiend volume aan change-requests.
CREATE INDEX IF NOT EXISTS idx_change_requests_export_pending
  ON change_requests (processed_at DESC)
  WHERE status = 'approved' AND exported_at IS NULL;
