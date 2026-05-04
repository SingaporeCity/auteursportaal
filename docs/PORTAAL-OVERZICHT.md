# Auteursportaal — overzicht voor IT-review

Versie: mei 2026 · Beheerder: Patrick Jeeninga (auteursrelaties Noordhoff)

Dit document bundelt voor Infinitas IT in één zitting wat het Auteursportaal is, wat het doet, hoe het in elkaar zit en welke afspraken nog open staan. Het is geen vervanging van de technische detail-docs (`README.md`, `docs/SECURITY.md`, `docs/AUDIT-2026-05-02.md`), maar een leeswijzer met genoeg context om een review te starten.

---

## 1. Wat is het Auteursportaal

Het Auteursportaal is een webapplicatie waarmee Noordhoff-auteurs hun eigen royalty-administratie online kunnen inzien en beheren. Voor 2026 ging dat per e-mail: jaarlijks een PDF naar 2.500 mailadressen, met regelmatig vragen om kopieën, bevestigingen van rekeningwijzigingen en correcties op declaraties. Het portaal bundelt die dagelijkse taken in één plek — de auteur logt in op `mijn-noordhoff.nl` en heeft direct toegang tot zijn afrekeningen, contracten, prognose en de mogelijkheid om gegevens of declaraties door te geven.

Eerste echte gebruiker is Charlotte Phillips. Zodra Infinitas IT akkoord geeft op de review, fasen we uit naar de overige actieve auteurs in NetSuite. Het portaal kent één admin-account (Patrick Jeeninga); bij ziekte of verlof zal een tweede admin worden aangewezen. Verdere uitbreiding van het admin-team is voorzien zodra het gebruik aantrekt.

De applicatie staat sinds 2 mei 2026 live op `https://mijn-noordhoff.nl`. Het oude demo-portaal op de openbare repo `SingaporeCity/Royaltyportaal` is op die datum offline gehaald en op privé gezet — die bevatte testdata en de PDF-bestanden van honderden auteurs in git history en is bewust achtergelaten.

---

## 2. Wat het portaal kan

Drie kernfuncties voor de auteur. Daaromheen een aantal tabbladen die context geven (Start, Contracten, Prognose, FAQ), maar de drie hieronder zijn waar het portaal voor bestaat.

### 2.1 Royalty-statements en jaaropgaven raadplegen

Tabblad: **Afrekeningen**

De auteur ziet een tijdlijn van alle eigen uitkeringen, gegroepeerd per uitbetaaljaar. Per regel staat het bedrag, de datum, het type (royalty's, nevenrechten, foreign rights of jaaropgave) en een PDF van de onderliggende afrekening. De auteur kan filteren op type en zoeken in titels. PDF's openen in een preview-paneel of zijn als download op te halen.

De technische opslag bestaat uit twee delen:

- Tabel `payments` — metadata per uitkering (bedrag, jaar, datum, type, vendor-id, pad naar de PDF)
- Storage-bucket `statements` — de PDF-bestanden zelf, met pad-isolatie per auteur (`{author_uuid}/royalty/2025/...`)

Admin (Patrick) zet payments-records in de tabel via het admin-portaal of via een NetSuite-CSV-import. De PDF's komen via de bulk-uploader of handmatige upload-knop in het admin-portaal in Storage terecht. De auteur ziet alleen eigen rijen — Row Level Security filtert dat op database-niveau, niet pas in de browser.

Charlotte's eerste echte data is in de productie-database geseed: drie payments-records (2024 / 2025 / 2026), bijbehorende PDF's in Storage, plus twee MW Methodeovereenkomst-contracten als referentie.

### 2.2 Persoonlijke gegevens beheren

Tabblad: **Profiel**

De auteur ziet zijn eigen profielgegevens — naam, adres (straat, huisnummer, postcode, woonplaats, land), telefoon, geboortedatum, BSN, IBAN, BIC, e-mail, NetSuite-vendor-id en Alliant-id. Alle 13 velden zijn verplicht voor activatie van het account. Dit komt voort uit een bewuste keuze: zonder deze gegevens kan Noordhoff geen royalty's uitbetalen, dus heeft een half-leeg profiel weinig zin.

Het portaal werkt in twee modi:

**Tijdens onboarding** (status `pending_data`) — de auteur vult zelf de velden in die NetSuite niet had aangeleverd. Schrijven gebeurt direct in de tabel `authors`, met validatie per veld. Pas als alles compleet is, kan de auteur op "Activeer mijn account" klikken; daarna wacht de aanvraag op admin-review.

**Na activatie** (status `active`) — directe wijziging is uitgeschakeld. Wijzigingen lopen via een verzoek-tot-wijziging-flow: de auteur stelt de nieuwe waarde voor, admin bekijkt en keurt goed of af. Het oude regime van "even snel een mailtje sturen om je IBAN te wijzigen" verdwijnt daarmee. Elke wijziging is na te lezen in tabel `change_requests`.

Twee bijzonderheden:

- **BSN is na eerste invoer onveranderlijk.** Drie verdedigingslagen voorkomen wijziging: een database-trigger die de UPDATE blokkeert ongeacht caller-rol, een check in de CSV-import-Edge-Function, en een front-end-lock op het invoerveld. Correctie van een verkeerde BSN gaat via Supabase Studio door Patrick — bewust een hoge drempel om fraude of social-engineering tegen te gaan.
- **IBAN-validatie via mod-97-checksum.** Bij elke save wordt het rekeningnummer wiskundig gecontroleerd. Een typo in het IBAN komt nooit verder dan het invoerscherm.

In de actieve modus kan de auteur zijn eigen BSN tijdelijk inzien via een "Toon BSN"-knop — 30 seconden zichtbaar, daarna automatisch weer gemaskeerd. Dit dekt het AVG-inzagerecht zonder het BSN permanent in de DOM te laten staan.

### 2.3 Declaraties indienen

Tabblad: **Declaraties**

Auteurs declareren onkosten en projectkosten in dit tabblad. Twee typen:

- **Onkostenformulier** — voor reiskosten, bureaukosten en andere kleine uitgaven die de auteur uit eigen zak heeft voorgeschoten.
- **IDC-projectformulier** — voor projectkosten die onder een specifiek IDC-cost-center vallen (bijvoorbeeld kosten gemaakt voor een specifieke methode-revisie).

De flow voor de auteur is in drie stappen:

1. **Het juiste formulier downloaden.** Het portaal toont twee formulier-cards bovenaan; één klik mailt naar `crediteuren@noordhoff.nl` met een verzoek om het juiste sjabloon. De auteur kan het sjabloon ook al eerder hebben gehad — dan is stap 1 niet meer nodig.
2. **Het formulier invullen** — digitaal of op papier. De auteur vult de eigen gegevens in, het bedrag, een omschrijving, het cost-center en eventuele onderbouwing. Bij reiskosten staat een verplicht veld voor het aantal kilometers.
3. **Uploaden als PDF** — via de drag-and-drop-zone in het portaal. De auteur kiest het bestand (max 10 MB), schrijft een korte omschrijving van waar de declaratie over gaat, en dient in.

In de UI staan vier spelregels die de auteur ziet voordat hij uploadt:

- **Originele bonnen of facturen** altijd meesturen bij de declaratie. Een declaratie zonder bonnen wordt afgewezen.
- **Alleen digitaal in PDF.** Declaraties kunnen alleen als PDF via dit portaal worden ingediend. Fysieke declaraties of MS Word/Excel-bestanden worden niet in behandeling genomen.
- **Kilometervergoedingen** opgeven volgens de ANWB Routeplanner tegen 21 cent per kilometer. Andere bedragen worden teruggezet naar dit tarief bij goedkeuring.
- **Omzetbelasting (BTW).** Het formulier in dit portaal is alleen voor auteurs die niet zijn aangemerkt als ondernemer voor de BTW. Auteurs mét BTW-status sturen hun eigen factuur in plaats van het formulier — daarop staan minimaal de "brand" en het "cost center". Hetzelfde indien-pad in het portaal werkt; het bestand is dan een eigen factuur in plaats van een ingevuld sjabloon.

Boven de upload toont het portaal de NetSuite-vendor-id van de auteur. Deze id moet op het formulier worden ingevuld zodat crediteuren de declaratie aan het juiste account kan koppelen. Charlotte's vendor-id is `V00022638`; voor andere auteurs verschilt deze.

Na indienen krijgt de declaratie een status:

| Status         | Betekenis                                                         |
| -------------- | ----------------------------------------------------------------- |
| In beoordeling | Crediteuren bekijkt het bestand en de bonnen                      |
| Goedgekeurd    | Klaar voor uitbetaling                                            |
| Afgewezen      | Met reden — auteur kan met aangepaste declaratie opnieuw indienen |
| Uitbetaald     | Bedrag is overgemaakt                                             |

De auteur ziet in zijn eigen declaratie-overzicht direct de actuele status, met datum-stempels per overgang. De technische opslag: tabel `expenses` voor de metadata (bedrag, type, status, omschrijving, datums), Storage-bucket `expense-receipts` voor de PDF-bestanden zelf, met dezelfde pad-isolatie als bij Storage `statements`.

Bedrag en exact type worden door admin ingevuld bij de beoordeling. De auteur hoeft die niet in het portaal in te kloppen — het bedrag staat al op het formulier dat hij uploadt. Dit voorkomt dubbele invoer en discussie over typefouten.

---

## 3. Architectuur in één pagina

**Frontend.** Vanilla TypeScript-strict gecompileerd via Vite, geen framework. Bewuste keuze om de supply-chain-attack-oppervlakte klein te houden — een framework als React of Vue voegt 200+ transitive dependencies toe; het portaal heeft er nu ongeveer 40, vooral build-tooling. De gebouwde bundle (~170 KB JS gzipped) wordt als statische bestanden geserveerd door GitHub Pages. Geen server-side rendering, geen Node.js in het kritieke pad. Volledige onderbouwing in `docs/adr/0001-typescript-strict-vanilla.md`.

**Backend.** Supabase op project `qcqjurglmrhdiuhawfee`, EU-regio. Vier onderdelen:

- **Postgres** — 10 tabellen in productie, allemaal met Row Level Security aan
- **Auth** — beheerd door Supabase, e-mail + wachtwoord-flow met JWT-sessies
- **Storage** — twee buckets (`statements`, `expense-receipts`), beide privé, beide met pad-isolatie per auteur-UUID
- **Edge Functions** — drie stuks, in Deno:
  - `create-accounts` — admin-only invite/activate van auteurs, stuurt recovery-mails
  - `import-authors-csv` — bulk-import vanuit een NetSuite-export (admin-only)
  - `export-authors-csv` — round-trip-sync naar NetSuite met SHA-256-audit-hash (admin-only)

**Authenticatie.**

Auteurs loggen in met e-mail + wachtwoord. Wachtwoord-reset gaat via een Supabase recovery-mail; de redirect-URL is vastgepind op `https://mijn-noordhoff.nl/auth/set-password` zodat een gestolen mail-link niet ergens anders bruikbaar is.

Admin-login werkt vandaag ook met e-mail + wachtwoord. Microsoft Entra ID is in de codebase voorbereid achter een feature-flag (`VITE_ADMIN_SSO_ENABLED`) maar wacht op Azure-tenant-config en een OAuth-app van Infinitas IT. Tot die tijd is de admin-flow beveiligd door een combinatie van een e-mail-whitelist (alleen vooraf bekende Noordhoff-adressen) en de `is_admin = true`-vlag op het bijbehorende `authors`-record. Beide moeten kloppen voordat het admin-portaal opent.

**Hosting.** Frontend op GitHub Pages onder de eigen repo `SingaporeCity/auteursportaal` (publiek voor IT-review). Custom domain `mijn-noordhoff.nl` met TLS-certificaat dat automatisch verlengt; volgende verloopdatum 22 juli 2026. Geen ander hosting-component — Supabase host de hele backend.

**Stack op één pagina:**

```
┌────────────────┐      ┌──────────────────────┐      ┌─────────────────┐
│  Browser       │ HTTPS│  GitHub Pages        │      │ Supabase        │
│  (auteur of    │─────▶│  mijn-noordhoff.nl   │─────▶│ - Auth          │
│   admin)       │      │  (statisch SPA)      │      │ - Postgres+RLS  │
└────────────────┘      └──────────────────────┘      │ - Storage       │
                                                       │ - Edge Functions│
                                                       └─────────────────┘
```

| Laag           | Stack                                                                                   |
| -------------- | --------------------------------------------------------------------------------------- |
| Frontend       | TypeScript (strict), Vite, vanilla DOM, geen UI-framework                               |
| Auth admin     | Microsoft Entra ID (OAuth, **placeholder** — pas actief na IT-config)                   |
| Auth auteur    | Supabase email + password met activate-email                                            |
| Database       | Postgres met Row Level Security (RLS) op alle tabellen                                  |
| File storage   | Supabase Storage buckets `statements` + `expense-receipts` (private, UUID-pad-isolatie) |
| Edge Functions | Deno TypeScript (server-side, gebruikt service_role)                                    |
| CI/CD          | GitHub Actions: lint + typecheck + tests + GH Pages deploy                              |
| Custom domain  | `mijn-noordhoff.nl` (CNAME → GitHub Pages, TLS auto-renew)                              |

---

## 4. Beveiliging — samenvatting

Een uitgebreid bedreigingsmodel met 18 dreigingen en bijbehorende mitigaties staat in `docs/SECURITY.md`. De hoofdmaatregelen, met verwijzing naar de detail-bron:

- **Row Level Security op alle 10 productie-tabellen.** Een auteur kan via de Supabase API alleen rijen lezen waar `author_id = auth.uid()` op klopt; admin-rijen vereisen een `is_admin = true`-record. Dit wordt afgedwongen door Postgres, niet door de frontend. Een Playwright E2E-test stelt actief vast dat een ingelogde auteur 0 rijen ziet bij de payments van een andere auteur. Zie `docs/SECURITY.md` § 3.

- **Productie-CSP zonder `unsafe-inline` op `style-src`.** Tijdens het bouwen wordt de Content-Security-Policy strakker gezet dan tijdens lokale ontwikkeling — `<style>`-blok-injectie via XSS is daarmee uitgesloten. CI controleert per build dat de strikte versie ook echt in de bundle terecht komt.

- **Forensische audit-trail in tabel `audit_actions`.** Bij elke wijziging op gevoelige tabellen (`authors`, `change_requests`, `payments`, `expenses`) schrijft een database-trigger een rij met wie, wat, wanneer. BSN en IBAN worden vóór opslag automatisch gemaskeerd via een helper-functie. Alleen admins lezen de tabel. Edge Functions schrijven additionele rijen voor hoge-niveau-events zoals `csv_imported` of `author_invited`. Zie `docs/SECURITY.md` § 8.

- **Per-actor rate-limiting** op alle drie de Edge Functions. Atomic `check_rate_limit()`-RPC met fixed-window counter — 60 calls per uur voor `create-accounts`, 10 voor `import-authors-csv`, 30 voor `export-authors-csv`. Overschrijding levert direct HTTP 429 op zonder de zware DB-actie uit te voeren.

- **BSN-immutability.** Drie verdedigingslagen zoals beschreven in 2.2. Onderbouwd in `docs/adr/0002-rls-whitelist-via-is-active.md` en migration `0010_bsn_immutable.sql`.

- **Geen secrets in repo of bundle.** De service-role-key (volledige database-toegang) zit alleen in Supabase Edge Function-env, niet in het Vite-bouw-proces of in `.env.example`. CI verifieert per build dat er geen JWT met `role=service_role` in `dist/` zit, en dat de string `SUPABASE_SERVICE_ROLE_KEY` niet voorkomt in de bundle.

- **Geen sourcemaps in productie-bundle.** Vite is geconfigureerd om sourcemaps alleen in dev-mode te genereren. CI faalt de build als er toch een `*.map`-bestand in `dist/` belandt.

- **Geen inline `<script>`-tags of `eval`.** `script-src 'self'` in de CSP blokkeert beide. `eslint-plugin-no-unsanitized` + `no-secrets` weren onveilige patronen al tijdens commit.

- **Round-trip-export integriteit.** Elke CSV-export naar NetSuite wordt vastgelegd in tabel `data_exports` met SHA-256-hash van de bestandsinhoud, lijst van geëxporteerde auteur-UUID's, exporteur en optionele reden. Achteraf is reproduceerbaar wat er op welk moment naar buiten is gegaan.

---

## 5. Wat IT en Legal moeten leveren

Niet alle onderdelen van een productie-klare omgeving zitten in de codebase. Hieronder de openstaande items die door Infinitas IT of Noordhoff Legal geregeld moeten worden, met hun audit-referentie:

| Item                               | Wie                  | Toelichting                                                                                                                                                                                                         |
| ---------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data Processing Agreements tekenen | Legal + IT           | Supabase, GitHub, SMTP-provider — verwerken BSN/IBAN namens Noordhoff. AVG art. 28(3). Audit-finding C2.                                                                                                            |
| Microsoft Entra SSO configureren   | Infinitas IT         | Azure-tenant-id, OAuth-app, admin consent. Code is voorbereid; feature-flag aan zetten zodra config geleverd is. Audit-finding H2.                                                                                  |
| Eigen SMTP-provider                | Infinitas IT         | Resend / SendGrid / AWS SES. Vereist SPF, DKIM en DMARC records op `noordhoff.nl`. Standaard Supabase-mailer doet 3 mails per uur en is een blokker zodra meer dan een handvol auteurs onboardt. Audit-finding H13. |
| MFA voor admin                     | Infinitas IT         | TOTP via Supabase als tussenstap totdat Entra SSO live is — daarna dwingt Entra zelf MFA conform tenant-policy. Audit-finding H2.                                                                                   |
| Privacy Policy + DPIA              | Noordhoff Legal      | AVG art. 13/14 (informatieplicht) + art. 35 (DPIA bij verwerking BSN). Audit-findings H3 en H6.                                                                                                                     |
| Data-retention-policy              | Noordhoff Legal + IT | Hoe lang houden we royalty-statements / declaraties / oude profielversies aan? AVG art. 5(1)(e). Audit-finding H5.                                                                                                  |
| Right-to-Erasure-procedure         | Legal + IT           | Hoe verwijderen we een auteur op verzoek (AVG art. 17), met alle bijbehorende Storage-objecten en audit-rijen? Audit-finding H4.                                                                                    |
| Branch-protection + Dependabot     | Patrick + IT         | Branch-protection rule op `main` + Dependabot security updates. Audit-finding H12 + L4.                                                                                                                             |

Zonder bovenstaande items kan het portaal in technische zin live, maar niet voldoen aan AVG-vereisten voor productie-uitrol naar 2.500 auteurs. Voor de Charlotte-pilot is de huidige set voldoende mits er expliciete DPA's worden getekend voor Supabase en GitHub.

---

## 6. Bekende beperkingen en open punten

Sinds 2 mei 2026 zijn 9 audit-findings gesloten in iter 7-9 (zie `docs/AUDIT-2026-05-02.md` voor de afzonderlijke status). Hieronder de huidige openstaande lijst — onderverdeeld in blokkers, randvoorwaarden en kleinere observaties.

### Blokker voor productie-launch (alleen pilot acceptabel)

> **Externe SMTP-provider vereist.** Het portaal verstuurt e-mails (invite-link, recovery, reminder) via de standaard Supabase-mailer. Die is niet productie-geschikt:
>
> - Rate-limit van 3 e-mails per uur per project — bij bulk-onboarding loopt dat meteen vast met `over_email_send_rate_limit`
> - Volume in productie: ~5.000 e-mails per maand bij 2.500 auteurs (invite + reminder + recovery + bevestigingen)
> - Deliverability: Supabase verstuurt vanuit `noreply@mail.app.supabase.io`; Outlook/Hotmail markeert dat vaak als spam
> - Branding: huidige mails komen niet vanuit `noordhoff.nl` — slecht voor herkenning en vertrouwen
>
> **Vóór productie-uitrol moet Infinitas IT een transactionele SMTP-provider configureren.** Drie opties:
>
> | Provider     | Free tier              | Kosten productie    | Notities                                      |
> | ------------ | ---------------------- | ------------------- | --------------------------------------------- |
> | **Resend**   | 3.000/maand            | ~$20 voor 50k mails | Modern, eenvoudige API, goede deliverability  |
> | **SendGrid** | 100/dag (=3.000/maand) | ~$20 voor 50k mails | Veel features, complexer dashboard            |
> | **AWS SES**  | 200/dag in sandbox     | ~$0,10 per 1k mails | Goedkoopst, vereist AWS-account + meer config |
>
> **Configuratie**: Supabase Dashboard → Project Settings → Authentication → SMTP Settings → host/port/credentials. Plus een DNS-geverifieerd `noreply@mijn-noordhoff.nl`-adres met SPF/DKIM/DMARC op `noordhoff.nl`. Zie audit-finding H13.

### Randvoorwaarden bij IT en Legal

Zie sectie 5 hierboven voor de volledige lijst (DPA's, Microsoft Entra SSO, MFA voor admin, Privacy Policy, retention-policy, Right-to-Erasure, branch-protection). Deze items horen niet in de codebase thuis maar moeten geleverd worden voor AVG-naleving bij uitrol naar 2.500 auteurs.

### Architectuur-observaties (geaccepteerd voor pilot, te heroverwegen bij schaal)

- **JWT in localStorage.** Auth-tokens worden in `localStorage` opgeslagen — Supabase JS SDK-default. Geen HttpOnly cookie. Een DOM-XSS in om het even welk pad zou tot token-exfiltratie kunnen leiden. Mitigaties draaien (strikte CSP, alle DOM-mutaties via `textContent`, ESLint `no-unsanitized`); voor productie-schaal is server-side cookie-flow via Cloudflare Workers de upgrade-route. Zie audit-finding H1.
- **Geen application-level encryption van BSN/IBAN.** Supabase doet volume-level disk-encryption. Application-level encryption (BSN alleen decryptbaar voor `is_admin()`-rol) is overwogen maar niet geïmplementeerd vanwege impact op IBAN-validatie + admin-overzicht. Audit-finding M5.
- **JWT-sessie blijft tot expiry geldig na logout.** `signOut()` ruimt lokale token op maar revoked de server-side JWT niet. Audit-finding M6.
- **`*.csv` blanket-rule in `.gitignore`** met whitelist-uitzondering voor de admin-import-template — bewust om te voorkomen dat ooit een echte auteur-CSV in git belandt.

### Operationele staat vandaag

- Charlotte's BSN, geboortedatum en Alliant-id zijn placeholders (`000000000` / `1900-01-01` / dummy-id). Charlotte vult deze zelf in zodra ze het portaal ingaat; validatie via 11-proef (BSN) en mod-97 (IBAN) gebeurt automatisch.
- Supabase Auth Redirect URL-allowlist is op 2 mei 2026 bijgewerkt naar `https://mijn-noordhoff.nl/**`; `http://localhost:5173/**` blijft staan voor lokale ontwikkeling.
- Productie-mail loopt nog via standaard Supabase-mailer (zie blokker hierboven).
- `sync-netsuite` Edge Function is bewust niet geport vanuit de oude demo-codebase — CSV-roundtrip is voldoende voor de pilot.

---

## 7. Onboarding van nieuwe auteurs

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

Volledige kolom-spec, validatie-regels per veld en voorbeeld-data: [`docs/onboarding-csv-import.md`](onboarding-csv-import.md). Voorbeeld-template met dummy-data: [`docs/netsuite-author-import-template.csv`](netsuite-author-import-template.csv).

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

---

## 8. Round-trip-sync naar NetSuite (CSV-export)

Het portaal is geen source-of-truth — NetSuite blijft dat. Nieuwe of gewijzigde auteursgegevens worden via een CSV terug-gesynchroniseerd:

```
Admin klikt "Export naar NetSuite" in admin-portaal
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

**Beveiligingsmaatregelen:**

- **Admin-only**: Edge Function checkt `is_admin()` via JWT vóór query
- **Audit-trail**: `data_exports`-tabel met SHA-256-hash van CSV-content (anti-tamper)
- **Geen dubbele exports**: `last_exported_at` per rij voorkomt dat dezelfde wijziging twee keer in CSV terechtkomt
- **Geen tussenopslag**: CSV wordt gestreamd, niet permanent opgeslagen in Supabase
- **Rate-limit**: 30 exports per uur per admin; daarboven HTTP 429
- **AVG-retention**: admin uploadt + verwijdert lokaal binnen minuten; SharePoint-retention is verantwoordelijkheid van Noordhoff IT
- **Open punt — dataminimalisatie**: huidige export bevat alle 15 velden per rij. Voor strenger AVG-naleving op termijn: alleen daadwerkelijk-gewijzigde velden meesturen (vereist diff-tracking via `change_requests`-tabel; zie audit-finding H7)

---

## 9. Bijlagen

Voor IT-reviewers die dieper willen graven:

- **`README.md`** — repo-introductie, deploy-pipeline, CI-checks, repo-structuur (developer-gericht)
- **`docs/SECURITY.md`** — bedreigingsmodel, RLS-policies per tabel, secret-management, Edge Function-architectuur, audit-trail, rate-limiting
- **`docs/AUDIT-2026-05-02.md`** — interne audit van 32 findings met severity, exploitation-pad, mitigatie en huidige status
- **`docs/onboarding-csv-import.md`** — NetSuite-CSV-flow, kolom-schema, validatie-regels, voorbeelden
- **`docs/netsuite-author-import-template.csv`** — kant-en-klaar template voor admin
- **`docs/adr/0001-typescript-strict-vanilla.md`** — onderbouwing van de framework-keuze
- **`docs/adr/0002-rls-whitelist-via-is-active.md`** — onderbouwing van de drie-laag access-architectuur

De repository staat op `https://github.com/SingaporeCity/auteursportaal` (publiek). De productie-Supabase-database is `qcqjurglmrhdiuhawfee` in de EU-regio; toegang tot het Supabase-dashboard kan op aanvraag worden verleend.

---

## 10. Contact

Vragen over dit document, het portaal of de review zelf — graag mailen naar **patrick.jeeninga@noordhoff.nl**.
