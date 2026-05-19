-- ============================================================================
-- 0017_audit_author_deleted.sql
-- ============================================================================
-- Voegt enum-waarde 'author_deleted' toe aan audit_action_type zodat de
-- delete-author Edge Function kan loggen wie wat verwijderde. Voorkomt dat
-- een DROP TYPE + recreate nodig is (oude rows blijven geldig).
--
-- `audit_actions.actor_id` heeft al `ON DELETE SET NULL` (0012:62), dus de
-- audit-trail van een verwijderde auteur blijft intact — alleen de actor-
-- referentie wordt NULL als de admin zelf later wordt verwijderd.
--
-- De DELETE wordt al deels gelogd door bestaande triggers:
--   - `payments_audit` (0012:310) logt 'payment_deleted' voor elke CASCADE
--   - `authors_audit_change` is AFTER UPDATE — vuurt niet op DELETE
-- Daarom schrijft de Edge Function bovenop dit één 'author_deleted' row als
-- top-level marker zodat in het audit-overzicht zichtbaar is wie de delete
-- triggerde.
-- ============================================================================

ALTER TYPE audit_action_type ADD VALUE IF NOT EXISTS 'author_deleted';
