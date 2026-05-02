# Security Overview

Dit document beschrijft de security-aanpak van het Auteursportaal voor IT-review door Infinitas IT. Het hoort bij de productie-versie (`SingaporeCity/auteursportaal`).

## 1. Bedreigingsmodel

| Dreiging                                                 | Mitigatie                                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cross-author data-leak (auteur A ziet data van auteur B) | Row Level Security (RLS) op alle tabellen; per-UUID Storage-pad-isolatie                                                                                           |
| Privilege escalation (auteur wordt admin)                | `is_admin` is alleen via service_role muteerbaar — niet exposed in client-side update-paden; RLS-policy laat geen UPDATE op `is_admin` toe via `authenticated` rol |
| Service-role-key leak in client bundle                   | Anon key is bewust public; service_role nooit in client of repo. CI verifieert via JWT-decode bij elke build dat geen JWT met `role=service_role` in `dist/` zit   |
| Persoonsgegevens in git history                          | Fresh-repo strategie: nieuwe repo zonder PII-history (oude `SingaporeCity/Royaltyportaal` wordt gearchiveerd)                                                      |
| Cross-Site Scripting (XSS)                               | Strict Content-Security-Policy + `eslint-plugin-no-unsanitized` blokkeert `innerHTML` op staged code; alle DOM-mutaties gaan via `createElement` + `textContent`   |
| CSRF op auth                                             | Supabase auth gebruikt PKCE-flow; geen ouder cookies/forms                                                                                                         |
| Dependency supply-chain                                  | Minimale dependency-tree (vanilla TS i.p.v. framework); `npm audit` in CI; Dependabot alerts geadviseerd                                                           |
| Niet-geactiveerde auteurs zien data                      | Frontend-whitelist + RLS-policy op `authors.is_active`; access-decision in `src/auth/whitelist.ts`                                                                 |
| Brute-force op login                                     | Supabase Auth heeft built-in rate-limiting per IP; minimale wachtwoord-lengte 12 tekens                                                                            |

## 2. Authenticatie

### Admin

- **Productie-doelstaat**: Microsoft Entra ID (Azure AD) via Supabase OAuth
- **Huidige status**: placeholder. Achter feature-flag `VITE_ADMIN_SSO_ENABLED`. Tot Infinitas IT de Azure-tenant + OAuth-app heeft geconfigureerd, gebruikt admin email + password als fallback
- **Whitelist**: in `src/auth/whitelist.ts`. Toegang als `is_admin = true` op `authors`-record dat matcht met `auth.uid()`

### Auteur

- **Email + password** met activate-mail flow:
  1. Admin maakt `authors`-record (`is_active = false`)
  2. Admin uploadt statements via admin-UI
  3. Admin klikt "Activeer" → Edge Function `create-accounts` wordt aangeroepen met JWT van admin
  4. Edge Function (server-side, service_role): admin-check → `auth.admin.createUser({ id: author_id, email })` met author-UUID → `generateLink({ type: 'recovery' })` → `is_active = true`
  5. Auteur klikt link in mail → set-password scherm → kan inloggen
- **Wachtwoord-reset**: standaard Supabase password-recovery flow
- **Toegang**: alleen geactiveerde auteurs (`is_active = true`); niet-geactiveerde profielen → "geen toegang" + auto-logout

### Sessies

- Supabase auth-tokens in `localStorage` (default Supabase-gedrag)
- Auto-refresh van access tokens (1u JWT, 1 maand refresh)
- `onAuthStateChange` listener in `main.ts` herrendert UI bij sign-in/out

## 3. Authorisatie — Row Level Security (RLS)

RLS staat aan op alle tabellen in `public` schema. De `is_admin()` helper-functie wordt door alle policies gebruikt en is `SECURITY DEFINER` om recursie te voorkomen.

### Per-tabel overzicht

| Tabel             | SELECT                               | INSERT                                                          | UPDATE                                     | DELETE       |
| ----------------- | ------------------------------------ | --------------------------------------------------------------- | ------------------------------------------ | ------------ |
| `authors`         | `auth.uid() = id OR is_admin`        | (admin only via service_role / Edge Fn)                         | `auth.uid() = id` (eigen profiel) of admin | (admin only) |
| `contracts`       | `author_id = auth.uid() OR is_admin` | admin only                                                      | admin only                                 | admin only   |
| `payments`        | `author_id = auth.uid() OR is_admin` | admin only                                                      | admin only                                 | admin only   |
| `forecasts`       | `author_id = auth.uid() OR is_admin` | admin only                                                      | admin only                                 | admin only   |
| `change_requests` | `author_id = auth.uid() OR is_admin` | `author_id = auth.uid()` (eigen)                                | admin only                                 | (geen)       |
| `login_history`   | `author_id = auth.uid() OR is_admin` | `author_id = auth.uid()` (alleen eigen rij — strakker dan demo) | (geen)                                     | (geen)       |
| `expenses`        | `author_id = auth.uid() OR is_admin` | `author_id = auth.uid()` (eigen indienen)                       | admin only                                 | admin only   |

Volledige policy-definities: `supabase/migrations/0001_initial_schema.sql` + `0003_expenses.sql`.

### GRANTs (`0004_grants.sql`)

"Auto-expose new tables" staat **uit** in het Supabase project — best practice voor expliciete toegang. De `0004_grants.sql` migration geeft per-tabel rechten aan `service_role`, `authenticated`, en `anon` (laatste alleen `USAGE` op het schema, geen tabel-toegang).

### Storage RLS

| Bucket             | SELECT                                       | INSERT/UPDATE/DELETE         |
| ------------------ | -------------------------------------------- | ---------------------------- |
| `statements`       | auteur eigen pad (`auth.uid()/...`) of admin | admin only                   |
| `expense-receipts` | auteur eigen pad of admin                    | auteur own INSERT, admin all |

Padconventie: `{author_uuid}/{type}/{year}/{filename}` — auth.uid() in pad-prefix wordt door policy `(storage.foldername(name))[1]` afgedwongen.

## 4. Secret-management

| Secret                        | Waar                              | In repo?                     | In bundle?                                          | In CI-secrets? |
| ----------------------------- | --------------------------------- | ---------------------------- | --------------------------------------------------- | -------------- |
| Supabase URL                  | env-var                           | ✅ via GitHub Actions secret | ✅ public                                           | ✅             |
| Supabase **anon** key         | env-var                           | ✅ via secret                | ✅ public-safe (JWT met `role=anon`, RLS-beschermd) | ✅             |
| Supabase **service_role** key | Edge Function-env + lokale `.env` | ❌ NOOIT                     | ❌ NOOIT                                            | ❌ NOOIT       |
| Microsoft OAuth client secret | Supabase Dashboard                | ❌ NOOIT                     | ❌ NOOIT                                            | ❌ NOOIT       |

`.env` is `.gitignored`. Op CI wordt build-time alleen anon-key gebruikt. Edge Functions krijgen `SUPABASE_SERVICE_ROLE_KEY` via Supabase's eigen secret-store (niet GitHub Actions).

### Geautomatiseerde checks

- ESLint: `eslint-plugin-no-secrets` faalt op JWT-shaped strings in committed code
- CI: na elke build wordt `dist/` afgespeeld met JWT-decoder; faalt als payload `role=service_role` ergens voorkomt
- CI: faalt als `SUPABASE_SERVICE_ROLE_KEY` als string in bundle staat
- GitHub: secret scanning + push protection aanbevolen aan in repo settings

## 5. Inputvalidatie

Locatie: `src/lib/validate.ts` met unit-tests in `src/lib/validate.test.ts`.

| Veld                | Validator                                                             | Waar gebruikt                                       |
| ------------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| Email               | RFC-pragmatisch regex (`isValidEmail`)                                | login, profile-edit, expense-form, admin-onboarding |
| Postcode NL         | `^\d{4}\s?[A-Za-z]{2}$`                                               | profile-edit                                        |
| IBAN                | mod-97 checksum (ISO 13616)                                           | profile-edit                                        |
| BSN                 | 11-proef + reject-all-zeros                                           | profile-edit                                        |
| PDF upload          | MIME `application/pdf` + max 10 MB (declaraties) / 25 MB (statements) | expense-form, admin-upload                          |
| Filename in Storage | `[^a-zA-Z0-9._-]` → `_` (sanitize)                                    | expense-form, admin-upload                          |

Validatie gebeurt client-side voor UX **én** server-side via Postgres-constraints (`CHECK` op enum-velden, `UNIQUE` op Vendor ID, etc.). Frontend-validatie kan worden omzeild — Postgres geeft uiteindelijk de garantie.

### BSN-immutability (iter 7, migration 0010)

BSN is na eerste invoer onwijzigbaar. Drie verdedigingslagen:

1. **Postgres trigger** `enforce_bsn_immutable` (`0010_bsn_immutable.sql`): blokkeert elke `UPDATE OF bsn` waarbij `OLD.bsn` non-null is en `NEW.bsn` afwijkt. Geen carve-out voor admin of service-role — correctie van een fout-ingevoerde BSN vereist directe SQL via Supabase Studio (auditeerbaar via Supabase platform-logs). Friction is hier feature.
2. **Edge Function `import-authors-csv`** skipt BSN-veld in update-payload als bestaand record een BSN heeft. Result-object reporteert `bsn_skipped` aantal.
3. **Frontend `profile.ts`**: `IMMUTABLE_FIELDS = {'bsn'}` — uitgesloten uit `change_requests`-flow + uit directe-write-pad in active-mode. Auteur kan eigen BSN inzien via "Toon BSN" toggle (30s zichtbaar, dan auto-mask) — AVG-art-15 inzagerecht eigen data.

BSN-masking via `formatBSNMasked` (laatste 4 cijfers zichtbaar) wordt overal gebruikt waar BSN in browser-DOM komt, behalve tijdens eerste invoer (auteur typt BSN tijdens onboarding).

## 6. XSS-prevention

### Content-Security-Policy (CSP)

In `index.html` als `<meta http-equiv>`:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self' https://*.supabase.co;
font-src 'self' data:;
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
```

`script-src 'self'` betekent: geen inline scripts, geen `eval`, geen externe CDN's. `frame-ancestors 'none'` voorkomt clickjacking.

### Geen innerHTML

Alle DOM-mutaties gaan via `document.createElement` + `el.textContent = ...`. Gegrep:

```
$ grep -rn 'innerHTML' src/
src/views/login.ts:62:  panel.innerHTML = '';   ← lege string-clear, geen user-input
src/views/admin.ts:217: form.innerHTML = '';    ← idem (verwijderd in laatste commit)
```

ESLint-regel `no-unsanitized/property` blokkeert toekomstige toevoegingen. Tijdens TS-port is elke DOM-rendering hervouwen vanuit zero.

### Geen `dangerouslySetInnerHTML` of vergelijkbare patterns

Geen framework-equivalent (vanilla TS-keuze, zie ADR `docs/adr/0001-typescript-strict-vanilla.md`).

## 7. Headers & cookies

GitHub Pages serveert static; HTTP security headers worden afgedwongen door:

- CSP via meta-tag (zoals boven)
- Vite-build levert `<meta name="referrer" content="strict-origin-when-cross-origin">`
- HTTPS enforced door GitHub Pages (custom domain met TLS)

Cookies: Supabase auth gebruikt `localStorage`, geen cookies voor auth — geen CSRF-aanval-vector. Geen tracking of analytics cookies.

## 8. Edge Functions

| Function             | Doel                                                                                     | Service-role gebruik                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `create-accounts`    | Auteur-invite + activatie: auth-user aanmaken + recovery-mail + status update            | Ja, voor `auth.admin.createUser` + UPDATE `onboarding_status`. Voorafgegaan door admin-JWT-check via caller |
| `import-authors-csv` | Bulk-import vanuit NetSuite-CSV: validate + INSERT/upsert `authors`-rijen                | Ja, voor INSERT/UPDATE op `authors` (bypass RLS). Admin-JWT-check op caller                                 |
| `export-authors-csv` | Round-trip-sync: CSV-export van gewijzigde rijen + audit-row + update `last_exported_at` | Ja, voor SELECT alle authors-rijen + INSERT in `data_exports`. Admin-JWT-check op caller                    |

Edge Functions draaien in Supabase's Deno-runtime, server-side. CORS in de function is gelimiteerd tot `mijn-noordhoff.nl` + `localhost:5173`. Caller moet een geldige admin-JWT meesturen.

### Data-egress: NetSuite-export

CSV-export bevat **bijzondere persoonsgegevens** (BSN/IBAN/adres/geboortedatum). Beveiligingsmaatregelen:

1. **Admin-only**: Edge Function `export-authors-csv` checkt `is_admin()` via caller-JWT vóór query.
2. **Audit-trail**: elke export wordt vastgelegd in `data_exports`-tabel:
   - `exported_by`, `exported_at`, `row_count`, `row_ids[]`, `file_hash` (sha256 hex), `file_name`, optionele `reason`
   - SHA256-hash bewijst dat exact deze CSV is gegenereerd (anti-tamper-bewijs bij audit/incident)
   - RLS: alleen admins lezen audit-rijen; INSERT/UPDATE/DELETE alleen via service-role
3. **State-tracking**: `authors.last_exported_at` per rij voorkomt dubbele exports → dubbele NetSuite-updates
4. **Geen tussenopslag**: CSV wordt gestreamd in HTTP-response, niet permanent in Supabase Storage
5. **AVG-retention** (verantwoordelijkheid Noordhoff IT, niet portaal): SharePoint-retentie + lokale verwijdering door admin binnen minuten na upload
6. **Open punt**: huidige export bevat alle 15 velden per gewijzigde rij. Voor strikter dataminimalisatie-principe op termijn: alleen daadwerkelijk-gewijzigde velden via diff-tracking op `change_requests`

## 9. CI/CD security

`.github/workflows/ci.yml`:

- ESLint (incl. `eslint-plugin-security`, `eslint-plugin-no-secrets`, `eslint-plugin-no-unsanitized`)
- TypeScript strict-check
- Vitest unit-tests
- Build → JWT-leak-check op `dist/`

`.github/workflows/deploy.yml`:

- Lint+typecheck als gate vóór build
- Same secret-scan
- Deploy naar GH Pages alleen als alles slaagt

## 10. Bekende beperkingen / open punten

| Item                                 | Status                    | Toelichting                                                                                                                                                                                                          |
| ------------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Microsoft Entra SSO                  | Placeholder               | Wacht op Infinitas IT: Azure tenant-ID + OAuth client-ID/secret + admin consent                                                                                                                                      |
| BSN/geboortedatum Charlotte          | Onbekend                  | Default placeholders (`000000000` / `1900-01-01`) — UI toont "ontbreekt"                                                                                                                                             |
| Custom domain TLS                    | Pending                   | DNS-CNAME-switch pas na go-live                                                                                                                                                                                      |
| Playwright E2E tests                 | In progress               | Task #20                                                                                                                                                                                                             |
| Email delivery (recovery + invite)   | Standaard Supabase mailer | Free tier: 3 emails/uur per project, vanaf `noreply@mail.app.supabase.io`. Hotmail/Outlook blokkeert vaak als spam. **Productie vereist eigen SMTP** (Resend / SendGrid / AWS SES) via Supabase Auth → SMTP settings |
| Audit logging buiten `login_history` | Niet voor MVP             | Profile-changes worden via `change_requests`-tabel gelogd; admin-acties (statement upload, change approval) hebben geen aparte audit-trail tabel                                                                     |
| Rate-limiting expense submissions    | Niet voor MVP             | Supabase platform-level rate-limiting; geen per-user throttle                                                                                                                                                        |
| MFA voor admin                       | Niet voor MVP             | Komt automatisch met SSO (Entra ID)                                                                                                                                                                                  |
| File-upload virusscan                | Niet voor MVP             | PDF-only enforcement; admin-only access. Voor zwaardere garantie: ClamAV-integratie via Edge Function                                                                                                                |

## 11. Verificatie / hoe te testen

### Live RLS-isolatie

1. Login als auteur A → debug-panel rechtsonder (alleen `npm run dev`) toont `RLS test: ✅ ziet 1 authors-record (alleen eigen)`
2. Login als auteur B → debug-panel toont nog steeds 1 record (eigen)
3. Login als admin → toont alle records

### Geen service_role in bundle

```bash
npm run build
node -e "
const fs = require('fs');
const path = require('path');
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|css|html)$/.test(e.name)) {
      const content = fs.readFileSync(p, 'utf8');
      const tokens = content.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
      for (const t of tokens) {
        const payload = JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString());
        if (payload.role === 'service_role') {
          console.error('LEAK in', p);
          process.exit(1);
        }
      }
    }
  }
}
walk('dist');
console.log('OK — geen service_role JWT in bundle');
"
```

### Lint + typecheck slagen

```bash
npm run lint    # 0 errors
npm run typecheck   # 0 errors
npm run test    # 72/72 passing
```

## Contact

Security-bevindingen: open een private security advisory op de GitHub-repo of mail Patrick Jeeninga rechtstreeks (out-of-band, niet via dit portaal).
