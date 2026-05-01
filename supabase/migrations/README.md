# Database Migrations

Genummerde SQL-bestanden die in volgorde uitgevoerd moeten worden in een schoon Supabase productie-project.

## Volgorde

| #    | Bestand                    | Doel                                                                                                          |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 0001 | `0001_initial_schema.sql`  | Tabellen: `authors`, `contracts`, `payments`, `forecasts`, `change_requests`, `login_history` + indexes + RLS |
| 0002 | `0002_storage_buckets.sql` | Buckets `statements` + `expense-receipts` + RLS-policies                                                      |
| 0003 | `0003_expenses.sql`        | Tabel `expenses` + RLS (vervangt localStorage-fallback)                                                       |

## Hoe te runnen

### Optie A — Supabase Dashboard (eenvoudig)

1. Ga naar je productie-project op https://supabase.com/dashboard
2. SQL Editor → New query
3. Plak de inhoud van `0001_initial_schema.sql`, klik **Run**
4. Herhaal voor `0002` en `0003`
5. Verifieer in Table Editor dat alle tabellen + RLS aan staan (groen schildje per tabel)

### Optie B — Supabase CLI (advanced, voor lokale development)

```bash
supabase link --project-ref qcqjurglmrhdiuhawfee
supabase db push
```

## Eerste admin-account aanmaken

Na de migrations:

1. **Supabase Dashboard → Authentication → Users → Add user**
2. Email: `admin@noordhoff.nl` (of het echte admin-emailadres)
3. Auto Confirm User: ✓
4. Vink **Send invite email** uit (we doen dit handmatig)
5. Kopieer de gegenereerde User ID (UUID)
6. **SQL Editor**:
   ```sql
   INSERT INTO authors (id, email, first_name, last_name, is_admin, is_active, activated_at)
   VALUES (
     '<plak-de-user-id-hier>',
     'admin@noordhoff.nl',
     'Admin',
     'Infinitas',
     true,
     true,
     NOW()
   );
   ```
7. **Authentication → Users**: stuur recovery-mail naar admin@noordhoff.nl zodat de admin een wachtwoord kan instellen.

## Charlotte Phillips seeden

Wordt gedaan via `scripts/seed-charlotte.ts` (Task #16) — gebruikt service_role key lokaal.

Optioneel handmatig via SQL Editor (UUID wordt later vervangen door de Supabase auth_user_id na activatie):

```sql
INSERT INTO authors (
  netsuite_vendor_id, email, first_name, last_name,
  phone, street, house_number, postcode, city, country,
  bank_account, bic, is_admin, is_active
) VALUES (
  'V00022638',
  'cp071021@gmail.com',
  'Charlotte',
  'Phillips',
  '+31 6 30242036',
  'Nonnenveld',
  '96',
  '4811 DV',
  'Breda',
  'Nederland',
  'NL78ASNB0707684307',
  'ASNBNL21',
  false,
  false  -- pas op true zodra admin haar activeert
);
```

## Verificatie na migratie

Run in SQL Editor:

```sql
-- Alle tabellen RLS aan?
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
-- Verwacht: alle 7 tabellen rowsecurity = true

-- Buckets aanwezig?
SELECT id, name, public FROM storage.buckets;
-- Verwacht: statements (false), expense-receipts (false)

-- Policies op storage.objects?
SELECT policyname, tablename FROM pg_policies WHERE tablename = 'objects';
-- Verwacht: 5 policies (statements_*, expense_receipts_*)

-- is_admin helper-functie?
SELECT public.is_admin();
-- Geeft false (terecht — als niet-ingelogd)
```
