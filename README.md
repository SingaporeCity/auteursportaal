# Noordhoff Auteursportaal

Productie-versie van het Noordhoff Auteursportaal. Auteurs kunnen hun royalty-afrekeningen, contracten, prognoses en jaaropgaven inzien. Een Noordhoff-administrator beheert auteur-accounts, uploadt statements en activeert nieuwe auteurs voor toegang.

## 1. Wat is dit

Een TypeScript single-page applicatie die op GitHub Pages draait, met Supabase als backend voor authenticatie, database en file-storage. Het portaal vervangt de eerdere demo-versie (`SingaporeCity/Royaltyportaal`) en is opgezet voor security-review door Infinitas IT.

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

Zie `docs/adr/` voor architectuurbeslissingen (TS-strict-vanilla-keuze, fresh-repo-strategie, RLS-whitelist-aanpak).

## 3. Lokale setup

**Vereisten**: Node.js 20+, een lokale `.env` (zie `.env.example`).

```bash
# 1. Clone (na repo aanmaak)
git clone git@github.com:SingaporeCity/auteursportaal.git
cd auteursportaal

# 2. Installeer dependencies
npm install

# 3. Maak .env aan op basis van het template
cp .env.example .env
# Vul de Supabase URL + anon key in (vraag bij Patrick voor productie-keys)

# 4. Start de dev-server
npm run dev
# → http://localhost:5173
```

**Beschikbare scripts:**

| Script                  | Doel                                              |
| ----------------------- | ------------------------------------------------- |
| `npm run dev`           | Start Vite dev-server met HMR                     |
| `npm run build`         | Productie-build naar `dist/`                      |
| `npm run preview`       | Lokale preview van de build                       |
| `npm run typecheck`     | TypeScript strict-check (geen output bij succes)  |
| `npm run lint`          | ESLint (incl. security + secret-detection regels) |
| `npm run lint:fix`      | Auto-fixable lint-issues fixen                    |
| `npm run format`        | Prettier op alle bestanden                        |
| `npm run test`          | Vitest unit-tests                                 |
| `npm run test:coverage` | Tests met coverage-rapport                        |
| `npm run test:e2e`      | Playwright E2E-tests                              |

Pre-commit-hook (Husky + lint-staged) draait automatisch ESLint + Prettier op staged files.

## 4. Deploy

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

## 5. Security

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

Strict CSP via meta-tag in `index.html`:

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

### Inputvalidatie

- Postcode (`isValidPostcodeNL`) en IBAN (`isValidIBAN` met mod-97-checksum) gevalideerd vóór save.
- BSN-validatie via 11-proef.
- Email-validatie.
- Alle wijzigingen door auteurs gaan via `change_requests`-tabel met admin-approval (geen directe writes naar `authors`).

## 6. Onboarding-flow

```mermaid
sequenceDiagram
  actor Admin as Admin
  participant Portal as Portaal
  participant Edge as Edge Function<br/>create-accounts
  participant DB as Supabase DB
  participant Mail as Email
  actor Auteur as Auteur

  Admin->>Portal: Maak nieuwe auteur aan (formulier)
  Portal->>DB: INSERT authors (is_active=false)
  Admin->>Portal: Upload statements/contracten
  Portal->>DB: INSERT payments + Storage upload
  Admin->>Portal: Klik "Activeer"
  Portal->>Edge: POST { email, author_id }
  Edge->>DB: auth.admin.createUser
  Edge->>DB: UPDATE authors SET is_active=true
  Edge->>Mail: generateLink(type=recovery)
  Mail->>Auteur: "Stel uw wachtwoord in"
  Auteur->>Portal: Klik link → set password
  Auteur->>Portal: Login (email + password)
  Portal->>DB: getSession + RLS-isolated SELECT
  Portal->>Auteur: Toon eigen dashboard
```

## 7. Testing

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

## 8. Bekende beperkingen

| Item                          | Status                                   | Toelichting                                                                                                                                               |
| ----------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
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
