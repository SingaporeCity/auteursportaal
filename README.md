# Noordhoff Auteursportaal

Productie-versie van het Noordhoff Auteursportaal. Auteurs kunnen hun royalty-afrekeningen, contracten, prognoses en jaaropgaven inzien. Een Noordhoff-administrator beheert auteur-accounts, uploadt statements en activeert nieuwe auteurs voor toegang.

## 1. Wat is dit

Een TypeScript single-page applicatie die op GitHub Pages draait, met Supabase als backend voor authenticatie, database en file-storage. Het portaal vervangt de eerdere demo-versie (`SingaporeCity/Royaltyportaal`) en is opgezet voor security-review door Infinitas IT.

> **IT-review begint hier**: zie [`docs/PORTAAL-OVERZICHT.md`](docs/PORTAAL-OVERZICHT.md) voor een gebundelde uitleg van wat het portaal functioneel doet, hoe het in elkaar zit en welke openstaande items bij IT/Legal liggen. Deze README is verder ontwikkelaar-gericht (setup, deploy, CI).

**Stakeholders:**

- **Charlotte Phillips** (eerste echte auteur)
- **Noordhoff-administrator** (`admin@noordhoff.nl`) — beheert accounts en uploadt statements
- **Infinitas IT** — review, SSO-configuratie, custom domain

## 2. Architectuur

```
┌────────────────┐      ┌──────────────────────┐      ┌─────────────────┐
│  Browser       │ HTTPS│  GitHub Pages        │      │ Supabase        │
│  (auteur of    │─────▶│  mijn-noordhoff.nl   │─────▶│ - Auth          │
│   admin)       │      │  (statisch SPA)      │      │ - Postgres+RLS  │
└────────────────┘      └──────────────────────┘      │ - Storage       │
                                                       │ - Edge Functions│
                                                       └─────────────────┘
```

| Laag           | Stack                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Frontend       | TypeScript (strict), Vite, vanilla DOM, geen UI-framework             |
| Auth admin     | Microsoft Entra ID (OAuth, **placeholder** — pas actief na IT-config) |
| Auth auteur    | Supabase email + password met activate-email                          |
| Database       | Postgres met Row Level Security (RLS) op alle tabellen                |
| File storage   | Supabase Storage bucket `statements` (private, UUID-pad-isolatie)     |
| Edge Functions | Deno TypeScript (server-side, gebruikt service_role)                  |
| CI/CD          | GitHub Actions: lint + typecheck + tests + GH Pages deploy            |
| Custom domain  | `mijn-noordhoff.nl` (CNAME → GitHub Pages)                            |

### Documentatie voor IT-review

- **[docs/SECURITY.md](docs/SECURITY.md)** — bedreigingsmodel, RLS-policies per tabel, secret-management, XSS-prevention, CI-security-checks, bekende beperkingen
- **[docs/adr/0001-typescript-strict-vanilla.md](docs/adr/0001-typescript-strict-vanilla.md)** — waarom geen framework
- **[docs/adr/0002-rls-whitelist-via-is-active.md](docs/adr/0002-rls-whitelist-via-is-active.md)** — toegangscontrole-aanpak

## 3. Deploy

**Productie** wordt automatisch gedeployed bij elke push naar `main`:

1. GitHub Action `ci.yml` draait: `lint` → `typecheck` → `test` → `test:e2e`.
2. Bij groene CI: `deploy.yml` bouwt `dist/` met productie-env-vars en pusht naar de `gh-pages` branch.
3. GitHub Pages serveert `gh-pages` op `https://mijn-noordhoff.nl`.

**Repo secrets nodig in GitHub Actions:**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ADMIN_EMAIL`

Service-role-key staat NIET in repo-secrets — alleen lokaal en (waar nodig) in Supabase Edge Function secrets.

**Edge Functions** worden separaat gedeployed via Supabase CLI (handmatig, na lokale review):

```bash
supabase functions deploy create-accounts --project-ref qcqjurglmrhdiuhawfee
```

## 4. Security

### Secret-management

| Secret                        | Waar                                 | In repo?      | In bundle?                                    |
| ----------------------------- | ------------------------------------ | ------------- | --------------------------------------------- |
| Supabase URL                  | env-var                              | ✅ via secret | ✅ public                                     |
| Supabase **anon** key         | env-var                              | ✅ via secret | ✅ public-safe (JWT role=anon, RLS-beschermd) |
| Supabase **service_role** key | Edge Function secret + lokale `.env` | ❌ NOOIT      | ❌ NOOIT                                      |
| Microsoft OAuth client secret | Supabase Dashboard                   | ❌ NOOIT      | ❌ NOOIT                                      |

ESLint-regels die secret-leaks blokkeren:

- `no-secrets/no-secrets` — detecteert JWT-shaped strings, AWS keys, etc.
- `no-unsanitized/property` — blokkeert `innerHTML` zonder DOMPurify.

### Row Level Security (RLS)

Alle tabellen in `public` schema hebben RLS enabled. Policies zijn `auth.uid()`-based per author of `is_admin = true` voor admin. Storage bucket `statements` isoleert per UUID-pad.

Volledig overzicht (na schema-migratie): zie `supabase/migrations/`.

### Content Security Policy

Productie-CSP via Vite-plugin in `vite.config.ts:strictCspPlugin`. Dev-mode behoudt `'unsafe-inline'` voor HMR; productie-build vervangt het:

```
default-src 'self';
script-src 'self';
style-src 'self';
style-src-elem 'self';
style-src-attr 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self' https://*.supabase.co;
font-src 'self' data:;
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
frame-src 'self' https://*.supabase.co;
```

`style-src-attr 'unsafe-inline'` blijft staan zodat `el.style.X = value` (forecast-bars, payment-dot-colors) blijft werken; inline `<style>`-blokken worden geblokkeerd. CI-job verifieert per build dat `style-src` en `style-src-elem` geen `'unsafe-inline'` bevatten.

### Inputvalidatie

- Postcode (`isValidPostcodeNL`) en IBAN (`isValidIBAN` met mod-97-checksum) gevalideerd vóór save.
- BSN-validatie via 11-proef.
- Email-validatie.
- Alle wijzigingen door auteurs gaan via `change_requests`-tabel met admin-approval (geen directe writes naar `authors`).

## 5. Onboarding-flow

Elke auteur doorloopt een statemachine met drie statussen op de `authors`-tabel. Een DB-trigger (`enforce_onboarding_transition`, migration `0006`) blokkeert ongeoorloofde overgangen ongeacht of de UPDATE via portaal, Edge Function of directe service-role-call binnenkomt.

| Status                 | Betekenis                                        | Wie zet 'm?                                                                    |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `pending_data`         | Auteur is uitgenodigd maar profiel is incompleet | Default-waarde bij INSERT (handmatig of CSV-row met ontbrekende velden)        |
| `pending_admin_review` | Auteur heeft data ingediend, wacht op admin-OK   | Auteur klikt "Activeer mijn account" (DB-trigger zet `data_submitted_at`)      |
| `active`               | Volledig portaal-toegang                         | Admin klikt "Activeer" (DB-trigger zet `activated_at` + sync `is_active=true`) |

Drie paden door dezelfde statemachine. Welk pad doorlopen wordt hangt af van waar de auteur-data vandaan komt:

### Pad A — handmatig nieuwe auteur (geen CSV beschikbaar)

Gebruikt voor net-getekende auteurs of voor correcties waar admin een formulier prettiger vindt dan een CSV-export.

1. **Admin** opent het admin-portaal en klikt "+ Nieuwe auteur". Het formulier vraagt e-mail, voornaam, achternaam en optioneel een NetSuite-vendor-id.
2. **Frontend** voert een INSERT uit op `authors` met de default-status `pending_data`.
3. **Frontend** roept Edge Function `create-accounts` aan met `mode='invite'`. Die functie:
   - controleert via JWT dat de aanroeper admin is;
   - maakt een Supabase Auth-user aan met dezelfde UUID als de authors-rij (`auth.admin.createUser`);
   - vraagt Supabase een recovery-mail te versturen via het `/auth/v1/recover`-endpoint;
   - schrijft `invited_at = now()` terug op de authors-rij;
   - schrijft een `author_invited`-rij in `audit_actions`.
4. **Auteur** ontvangt een set-password-mail, klikt de link, kiest een wachtwoord en logt in.
5. **Auteur** ziet alleen het Profiel-tabblad. De zes andere tabs staan disabled met een slot-icoon. Een banner bovenaan legt uit dat de overige onderdelen vrijkomen zodra Noordhoff de aanvraag heeft beoordeeld.
6. **Auteur** vult de overige verplichte velden in. Pas wanneer alle 13 velden valide zijn (IBAN-mod-97, BSN-11-proef, postcode-NL, datum-format, e-mail-format) wordt de "Activeer mijn account"-knop enabled.
7. **Auteur** klikt op activeren. **Frontend** doet UPDATE `onboarding_status = 'pending_admin_review'`. De DB-trigger vult `data_submitted_at` met de huidige tijd en schrijft via een tweede trigger een `author_status_changed`-rij in `audit_actions`.
8. **Admin** ziet de auteur in het admin-overzicht met status-badge "Wacht op review". Admin reviewt de gegevens (vooral BSN en IBAN omdat die later onveranderlijk zijn) en klikt "Activeer".
9. **Frontend** roept `create-accounts` aan met `mode='activate'`. Die doet UPDATE `onboarding_status = 'active'`; de DB-trigger zet `activated_at` en synct `is_active = true`.
10. **Auteur** logt opnieuw in en heeft toegang tot alle zeven tabs.

**Wat kan fout gaan:**

- Recovery-mail komt niet aan (Supabase mailer-rate-limit, spam-filter): admin klikt opnieuw op "Stuur uitnodiging"; idempotent, schrijft een `author_reminded`-rij in plaats van `author_invited`.
- Auteur typt verkeerd BSN: na eerste opslag is BSN onveranderlijk (drie verdedigingslagen). Correctie alleen via Supabase Studio door de admin — bewust een hoge drempel.
- Edge Function timeout of 5xx: de frontend toont expliciet de foutmelding; status blijft op `pending_data` zodat retry mogelijk is. De rate-limiter telt mislukte calls niet anders dan succesvolle.

### Pad B — incomplete CSV-import

Gebruikt wanneer een NetSuite-export voor een batch auteurs deels lege velden heeft (bijvoorbeeld: BSN of geboortedatum is niet bekend in NetSuite).

Stappen 1-2 worden vervangen door een CSV-import-modal: admin kiest het bestand, het systeem valideert per rij en doet een INSERT op `authors` met `onboarding_status = 'pending_data'`. Voor elke import-actie schrijft de Edge Function één samenvattende `csv_imported`-rij in `audit_actions` met aantal-aangemaakt, aantal-bijgewerkt en eventuele fout-rijen.

Vanaf stap 3 (admin verstuurt invite) is de flow identiek aan pad A. Het verschil zit alleen in de **aanmaak**: in plaats van per auteur op "+ Nieuwe auteur" te klikken, krijgt admin een lijst rijen met een "Stuur uitnodiging"-knop per rij of in bulk.

### Pad C — complete CSV-import

Gebruikt voor de bulk-migratie van bestaande NetSuite-auteurs waarvoor alle 13 verplichte velden al bekend zijn. De stappen waarin de auteur zelf data invult worden overgeslagen.

1. **Admin** uploadt een CSV-export uit NetSuite met alle vereiste velden gevuld.
2. **Edge Function** `import-authors-csv` valideert per rij (e-mail-format, IBAN-mod-97, postcode-NL, BSN-11-proef, datum-format).
3. Voor elke valide rij wordt een INSERT op `authors` gedaan met `onboarding_status = 'pending_admin_review'`. De Edge Function herkent dat data compleet is en slaat de invite-stap over.
4. **Admin** ziet de geïmporteerde rijen in het admin-overzicht. Per rij of in bulk klikt admin op "Activeer".
5. **Frontend** roept `create-accounts` aan met `mode='activate'`. Voor auteurs zonder bestaande Auth-user wordt die alsnog aangemaakt en een eenmalige recovery-mail verstuurd. Voor auteurs die al een Auth-user hadden (bijvoorbeeld na een herstart van de migratie): alleen status-update, geen tweede mail.
6. **Auteur** ontvangt eenmalig de recovery-mail, kiest wachtwoord en heeft direct toegang tot alle zeven tabs.

**Wat kan fout gaan:**

- Eén rij bevat een ongeldig veld: andere rijen worden alsnog geïmporteerd; foutrijen komen in het rapport met regelnummer en foutreden. Admin repareert de CSV en importeert opnieuw met `mode='upsert'`; bestaande rijen worden bijgewerkt.
- BSN-clash bij upsert: BSN is onveranderlijk na eerste invoer. De Edge Function laat het BSN-veld in dat geval bewust over en verhoogt de `bsn_skipped`-teller in het rapport.
- CSV groter dan 10 MB: HTTP 413 zonder de import te proberen. Admin splitst de export en herhaalt.

### Reminders

Geen scheduler-infrastructuur. Admin gebruikt het filter "Wacht op auteur (>14d)" in het admin-overzicht. Naast elke gefilterde rij verschijnt een "Stuur reminder"-knop die `create-accounts` opnieuw aanroept met `mode='invite'`. Hierdoor wordt `reminder_sent_at = now()` gezet en een `author_reminded`-rij in `audit_actions` geschreven. De keuze voor handmatig is bewust: minder afhankelijkheden om te reviewen voor IT, en in praktijk goed werkbaar voor één admin met enkele tientallen open uitnodigingen.

### CSV-format

Volledige kolom-spec, validatie-regels per veld en voorbeeld-data: [docs/onboarding-csv-import.md](docs/onboarding-csv-import.md). Voorbeeld-template met dummy-data: [docs/netsuite-author-import-template.csv](docs/netsuite-author-import-template.csv).

### Toegangsbescherming op database-niveau

Frontend tab-gating is uitsluitend een UX-laag — niet de eigenlijke beveiliging. De data-tabellen `payments`, `contracts`, `forecasts` en `expenses` hebben een RLS-policy die SELECT alleen toelaat wanneer de aanroepende auteur status `active` heeft (via helper `is_active_author()`). Een auteur in `pending_data` of `pending_admin_review` die de Supabase API direct aanroept met zijn eigen JWT, krijgt nul rijen terug uit deze tabellen. Defense-in-depth: zelfs als de frontend door een bug een tab vrijgeeft, blokkeert RLS de query.

### Audit-trail per onboardings-actie

Elke onboardings-handeling resulteert in minstens één rij in `audit_actions`. Dit maakt forensische reconstructie mogelijk ("wie wijzigde Charlotte's IBAN op 2026-04-15?").

| Handeling                                  | `action_type`            | Geschreven door                                                           |
| ------------------------------------------ | ------------------------ | ------------------------------------------------------------------------- |
| Admin maakt auteur aan + verstuurt invite  | `author_invited`         | Edge Function `create-accounts` (mode=invite, eerste)                     |
| Admin verstuurt reminder                   | `author_reminded`        | Edge Function `create-accounts` (mode=invite, met `invited_at` al gevuld) |
| Auteur dient gegevens in                   | `author_status_changed`  | DB-trigger op `authors` (pending_data → pending_admin_review)             |
| Admin activeert                            | `author_status_changed`  | DB-trigger op `authors` (pending_admin_review → active)                   |
| CSV-import                                 | `csv_imported`           | Edge Function `import-authors-csv` (één samenvattende rij)                |
| Profiel-veld direct aangepast (onboarding) | `profile_updated_direct` | DB-trigger op `authors`                                                   |
| Wijzigingsverzoek aangemaakt/afgehandeld   | `change_request_*`       | DB-trigger op `change_requests`                                           |

PII-velden (BSN, IBAN) worden vóór opslag automatisch gemaskeerd via de `audit_strip_pii()`-helper — laatste vier cijfers blijven leesbaar voor herkenning, de rest wordt vervangen door bullets. Alleen admins kunnen `audit_actions` lezen; INSERT/UPDATE/DELETE is alleen mogelijk via service-role of trigger met `SECURITY DEFINER`. Volledige audit-architectuur in `docs/SECURITY.md` § 8.

## 5b. Round-trip-sync naar NetSuite (CSV-export)

Het portaal is geen source-of-truth — NetSuite blijft dat. Nieuwe of gewijzigde auteursgegevens worden via een CSV terug-gesynchroniseerd:

```
Admin klikt "📤 Export naar NetSuite" in admin-portaal
  ↓
Edge Function `export-authors-csv`:
  - Admin-check via JWT
  - Selecteert rijen waar last_exported_at IS NULL OR last_exported_at < updated_at
  - Bouwt CSV in zelfde 15-koloms format als import
  - Schrijft audit-row in `data_exports`: admin_id, timestamp, row_ids, sha256, reason
  - Update last_exported_at op de geëxporteerde rijen
  - Streamt CSV terug (geen tussenopslag in Supabase Storage)
  ↓
Browser-download → admin uploadt direct naar Noordhoff SharePoint
  ↓
NetSuite-team verwerkt CSV (handmatig of via NetSuite-import-tool)
```

**Beveiligingsmaatregelen**:

- **Admin-only**: Edge Function checkt `is_admin()` via JWT vóór query
- **Audit-trail**: `data_exports` tabel met sha256-hash van CSV-content (anti-tamper)
- **Geen dubbele exports**: `last_exported_at` per rij voorkomt dat dezelfde wijziging twee keer in CSV terechtkomt
- **Geen tussenopslag**: CSV wordt gestreamd, niet permanent opgeslagen in Supabase
- **AVG-retention**: admin uploadt + verwijdert lokaal binnen minuten; SharePoint-retention is verantwoordelijkheid van Noordhoff IT
- **Dataminimalisatie open punt**: huidige export bevat alle 15 velden per rij. Voor strenger AVG-naleving op termijn: alleen daadwerkelijk-gewijzigde velden meesturen (vereist diff-tracking)

## 6. Testing

```bash
# Unit-tests (Vitest, jsdom)
npm run test
npm run test:coverage   # threshold: 80% lines

# E2E (Playwright, chromium + firefox)
npm run test:e2e
npm run test:e2e:ui     # interactieve modus
```

E2E-scenarios:

- Admin SSO-login (mocked Azure callback) → admin-dashboard zichtbaar
- Niet-whitelisted SSO-login → "geen toegang" + uitgelogd
- Onboarding end-to-end (admin maakt auteur → upload → activeer → email → wachtwoord → login → eigen data zichtbaar, andermans data NIET zichtbaar)
- Profile-change-request goedkeuring

Test-database: aparte Supabase test-project of ephemeral via `supabase db reset --local`.

## 7. Bekende beperkingen

> ⚠️ **BLOKKER VOOR PRODUCTIE-LAUNCH — externe SMTP-provider vereist**
>
> Het portaal verstuurt e-mails (invite-link, recovery, reminder) via Supabase's ingebouwde mailer. Die mailer is **niet productie-geschikt**:
>
> - **Rate limit**: 3 e-mails per uur per project. Bij bulk-onboarding van honderden auteurs is de limiet meteen vol → flow valt stil met `over_email_send_rate_limit`.
> - **Volume nodig in productie**: ~5000+ e-mails per maand realistisch (2500 auteurs × invite + reminder + ad-hoc password-resets + activatiebevestigingen).
> - **Deliverability**: Supabase-mailer stuurt vanaf `noreply@mail.app.supabase.io` — Outlook/Hotmail markeert dat vaak als spam.
> - **Branding**: huidige mails komen niet vanuit `noordhoff.nl`-domein — slecht voor herkenning + vertrouwen door auteurs.
>
> **Vóór productie-launch moet Noordhoff IT een transactionele SMTP-provider kiezen + configureren.** Drie geschikte opties:
>
> | Provider     | Free tier              | Kosten productie    | Notities                                          |
> | ------------ | ---------------------- | ------------------- | ------------------------------------------------- |
> | **Resend**   | 3.000/maand            | ~$20 voor 50k mails | Modern, eenvoudige API, goede deliverability      |
> | **SendGrid** | 100/dag (=3.000/maand) | ~$20 voor 50k mails | Veel features, complexer dashboard                |
> | **AWS SES**  | 200/dag in sandbox     | ~$0,10 per 1k mails | Goedkoopst maar vereist AWS-account + meer config |
>
> **Configuratie**: na keuze van provider → Supabase Dashboard → Project Settings → Authentication → SMTP Settings → vul host/port/credentials in. Gebruik een DNS-geverifieerd `noreply@mijn-noordhoff.nl` of `noreply@noordhoff.nl` adres met SPF/DKIM/DMARC records (anders blijft spam-issue).

| Item                          | Status                                   | Toelichting                                                                                                                                               |
| ----------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Externe SMTP-provider**     | **BLOKKER — niet geconfigureerd**        | Zie waarschuwing hierboven. Productie-launch is afhankelijk van Resend/SendGrid/SES + DNS-records (SPF/DKIM/DMARC) op `noordhoff.nl`. Geen launch zonder. |
| Microsoft Entra ID SSO        | **Placeholder**                          | OAuth-call zit achter feature-flag `VITE_ADMIN_SSO_ENABLED=false`. Zet op `true` zodra Infinitas IT de Azure-tenant + admin consent heeft geconfigureerd. |
| Charlotte's BSN/geboortedatum | Placeholder (`000000000` / `1900-01-01`) | UI toont "ontbreekt" voor placeholderwaarden. Vervang met echte data zodra die intern bekend is.                                                          |
| Charlotte's Alliant ID        | Open                                     | Veld `NL00117322` uit NetSuite — onduidelijk of dit Alliant-ID of ander intern Noordhoff-nummer is. Geverifieerd worden door admin.                       |
| `sync-netsuite` Edge Function | Verwijderd                               | NetSuite-integratie buiten scope; CSV-import via admin-UI is voldoende voor pilot.                                                                        |
| Custom domain TLS             | Pending                                  | DNS-CNAME van `mijn-noordhoff.nl` schakelen pas na go-live van nieuwe repo. Verwacht ~5 min downtime.                                                     |

## Repo-structuur

```
.
├── src/
│   ├── auth/              # SSO placeholder, password-flow, session, whitelist
│   ├── dashboard/         # 7 tabs (start, payments, contracts, forecast, expenses, faq, profile)
│   ├── admin/             # Onboarding, upload, changes, content-management
│   ├── lib/               # supabase, format, validate, i18n, pdf
│   ├── i18n/              # nl, en, sv (type-veilig via TranslationKey union)
│   ├── types/             # db.ts (gegenereerd via supabase gen types)
│   ├── styles/            # CSS per domein
│   └── main.ts            # entry: route, init, dark-mode
├── tests/e2e/             # Playwright E2E specs
├── supabase/
│   ├── functions/         # Deno Edge Functions
│   └── migrations/        # SQL-migraties (in productie-project)
├── scripts/               # Lokale CLI (seed, bulk-upload) — gebruiken service_role
├── .github/workflows/     # CI + deploy
└── docs/adr/              # Architecture Decision Records
```

## Contact

Voor security-bevindingen of vragen: open een issue in deze repo of mail `rights@noordhoff.nl`.
