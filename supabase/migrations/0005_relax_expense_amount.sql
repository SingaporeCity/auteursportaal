-- =============================================================================
-- 0005_relax_expense_amount.sql
--
-- Relax `expenses.amount` CHECK constraint van `> 0` naar `>= 0`.
--
-- Reden: het indien-formulier (auteurszijde) is vereenvoudigd tot alleen
-- 'omschrijving + PDF-bon'. De auteur vult geen bedrag meer in — admin
-- bepaalt het bedrag tijdens beoordeling. Submit met `amount = 0` moet dus
-- mogelijk zijn als 'nog te bepalen'.
--
-- Run NA 0001-0004 in SQL Editor.
-- =============================================================================

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_amount_check;

ALTER TABLE expenses
    ADD CONSTRAINT expenses_amount_check CHECK (amount >= 0);
