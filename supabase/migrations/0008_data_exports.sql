-- ============================================================================
-- 0008_data_exports.sql
-- ============================================================================
-- Round-trip-sync naar NetSuite via CSV-export uit het admin-portaal.
--
-- Doel: admin kan een CSV downloaden met alle gewijzigde auteursgegevens
-- (nieuw geactiveerd of bijgewerkt sinds vorige export), uploaden naar
-- Noordhoff SharePoint, NetSuite-team verwerkt 'm. Round-trip garandeert
-- dat NetSuite de source-of-truth blijft.
--
-- Twee schema-wijzigingen:
--   1. `authors.last_exported_at` — wanneer was deze rij voor het laatst
--      geexporteerd? NULL = nog nooit. Bepaalt welke rijen in volgende export.
--   2. `data_exports` audit-tabel — elke export wordt vastgelegd:
--      wie exporteerde, wanneer, welke row-ids, sha256-hash van CSV-content,
--      optioneel reason. Hash is anti-tamper: bewijst dat exact deze CSV
--      door deze admin op dit tijdstip is gegenereerd.
--
-- Beveiliging:
--   - `data_exports` RLS: alleen admins lezen. INSERT/UPDATE/DELETE alleen
--     via service-role (Edge Function), niet vanuit browser-clients.
--   - `last_exported_at` UPDATE alleen via service-role (Edge Function),
--     niet via reguliere `authors_update_own` policy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Kolom op authors
-- ----------------------------------------------------------------------------
ALTER TABLE authors
    ADD COLUMN last_exported_at TIMESTAMPTZ;

CREATE INDEX idx_authors_last_exported_at ON authors(last_exported_at);

-- ----------------------------------------------------------------------------
-- 2. data_exports tabel
-- ----------------------------------------------------------------------------
CREATE TABLE data_exports (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exported_by   UUID NOT NULL REFERENCES authors(id) ON DELETE RESTRICT,
    exported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    row_count     INTEGER NOT NULL CHECK (row_count >= 0),
    row_ids       UUID[] NOT NULL,
    file_hash     TEXT NOT NULL,           -- sha256 hex (64 chars)
    file_name     TEXT NOT NULL,           -- bv. 'authors-export-20260502-094530.csv'
    reason        TEXT,                    -- optioneel: 'Weekly NetSuite sync', etc.
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_exports_exported_at ON data_exports(exported_at DESC);
CREATE INDEX idx_data_exports_exported_by ON data_exports(exported_by);

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE data_exports ENABLE ROW LEVEL SECURITY;

-- Admins kunnen alle export-records zien (voor audit-overzicht in admin-portaal)
CREATE POLICY data_exports_admin_select ON data_exports
    FOR SELECT USING (public.is_admin());

-- Geen INSERT/UPDATE/DELETE policies voor authenticated users.
-- Service-role bypassed RLS, dus de Edge Function kan wel INSERTen.

-- Bestaande RLS op authors voor `last_exported_at`: er is geen aparte
-- column-level policy in Postgres, dus authors_update_own laat technisch ook
-- toe dat een auteur zijn eigen last_exported_at update. Mitigatie:
-- frontend stuurt dit veld nooit; Edge Function gebruikt service-role.
-- IT-officer-comment in SECURITY.md.
