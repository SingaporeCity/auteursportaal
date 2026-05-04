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

Stack: vanilla TypeScript (strict) + Vite-build, geserveerd als statische bundle door GitHub Pages, met Supabase als enige backend. Volledige laag-voor-laag beschrijving inclusief stack-tabel staat in [`docs/PORTAAL-OVERZICHT.md`](docs/PORTAAL-OVERZICHT.md) § 3.

Architectuur-onderbouwing:

- [`docs/adr/0001-typescript-strict-vanilla.md`](docs/adr/0001-typescript-strict-vanilla.md) — waarom geen framework
- [`docs/adr/0002-rls-whitelist-via-is-active.md`](docs/adr/0002-rls-whitelist-via-is-active.md) — toegangscontrole-aanpak

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

Het volledige bedreigingsmodel, alle RLS-policies per tabel, secret-management, productie-CSP, audit-trail-architectuur en CI-checks staan in [`docs/SECURITY.md`](docs/SECURITY.md). Voor een IT-georiënteerde samenvatting: [`docs/PORTAAL-OVERZICHT.md`](docs/PORTAAL-OVERZICHT.md) § 4.

In de codebase zelf vinden geautomatiseerde checks plaats:

- ESLint-regel `no-secrets/no-secrets` detecteert JWT-shaped strings, AWS keys en API-tokens in code.
- ESLint-regel `no-unsanitized/property` blokkeert `innerHTML` zonder sanitizer.
- CI verifieert per build dat `dist/` geen JWT met `role=service_role` of de string `SUPABASE_SERVICE_ROLE_KEY` bevat, en dat de productie-CSP geen `'unsafe-inline'` op `style-src` heeft.
- Pre-commit-hook (Husky) draait `eslint --fix` + `prettier --write` op staged files.

Inputvalidatie: postcode (`isValidPostcodeNL`), IBAN (mod-97-checksum), BSN (11-proef) en e-mail-format worden vóór elke save gevalideerd. Wijzigingen op het profiel door geactiveerde auteurs lopen via de `change_requests`-tabel met admin-approval — geen directe writes op `authors`.

## 5. Onboarding-flow en NetSuite-roundtrip

Auteurs worden door admin uitgenodigd via één van drie paden — handmatig formulier, incomplete CSV-import of complete CSV-import — en doorlopen een statemachine `pending_data` → `pending_admin_review` → `active`. Een DB-trigger (`enforce_onboarding_transition`) blokkeert ongeoorloofde overgangen, RLS-policies blokkeren data-toegang tot status `active` is bereikt, en elke stap wordt vastgelegd in tabel `audit_actions`. De round-trip naar NetSuite (CSV-export van gewijzigde rijen) loopt via een aparte admin-only Edge Function met SHA-256-audit-hash.

Volledige flow inclusief paden A/B/C, failure-modes, audit-trail-mapping per actie en round-trip-sync-architectuur staat in [`docs/PORTAAL-OVERZICHT.md`](docs/PORTAAL-OVERZICHT.md) §§ 7-8. CSV-format en validatie-regels in [`docs/onboarding-csv-import.md`](docs/onboarding-csv-import.md).

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

Productie-launch wordt **geblokkeerd door de standaard Supabase-mailer** (3 e-mails per uur, geen `noordhoff.nl`-branding). Vóór uitrol moet Infinitas IT een transactionele SMTP-provider configureren met SPF/DKIM/DMARC.

Volledige actuele lijst van openstaande items, randvoorwaarden bij IT/Legal en architectuur-observaties: [`docs/PORTAAL-OVERZICHT.md`](docs/PORTAAL-OVERZICHT.md) § 6. Auditrapport met openstaande findings (Critical/High/Medium/Low + Informational): [`docs/AUDIT-2026-05-02.md`](docs/AUDIT-2026-05-02.md).

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
