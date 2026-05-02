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

## 6. Bekende beperkingen en voortgang

Sinds de initiële audit op 2 mei 2026 is het volgende gesloten:

- Iter 7: BSN-immutability (M4)
- Iter 8: `last_exported_at`-lock, e-mail-enumeration-fix, CSV-size-guard, dist/-CI-checks (M1, M3, M9, L2)
- Iter 9: complete audit-trail, rate-limiting, atomic CSV-import, strikte productie-CSP (H1, H9, H10, M8, M10)

Nog open in `docs/AUDIT-2026-05-02.md`:

- 2 Critical (sourcemaps al opgelost in iter 0; DPA's wachten op Legal — zie sectie 5)
- 8 High openstaand, allemaal bij Infinitas IT of Legal (zie sectie 5)
- 6 Medium openstaand, voornamelijk procedurele items
- 5 Low openstaand, kosmetisch of nice-to-have

Operationele beperkingen vandaag:

- Charlotte's BSN, geboortedatum en Alliant-id zijn placeholders (`000000000` / `1900-01-01` / dummy-id). Charlotte vult deze zelf in zodra ze het portaal ingaat — het portaal valideert ze dan automatisch (BSN 11-proef + IBAN mod-97).
- Supabase Auth Redirect URL-allowlist is op 2 mei bijgewerkt naar `https://mijn-noordhoff.nl/**`; `http://localhost:5173/**` blijft staan voor lokale ontwikkeling.
- Productie-mail loopt nog via standaard Supabase-mailer. Voldoende voor één test-auteur, niet voor uitrol.

---

## 7. Onboarding van nieuwe auteurs

Drie paden, afhankelijk van waar de auteur-data vandaan komt:

**Pad A — handmatig.** Admin maakt 1 auteur aan via een form in het admin-portaal: e-mail, voornaam, achternaam, optioneel vendor-id. Het systeem stuurt direct een invite-mail. De auteur logt in, vult zelf de overige 9 verplichte velden in en klikt "Activeer mijn account". Admin reviewt en activeert.

**Pad B — incomplete CSV-import.** Admin importeert een NetSuite-CSV waarin sommige velden leeg zijn. Het systeem maakt de auteurs aan in de status `pending_data` en de admin kan er per rij of in bulk een invite-mail uit sturen. Verder identiek aan pad A.

**Pad C — complete CSV-import.** Admin importeert een NetSuite-CSV waarin alle 13 verplichte velden zijn ingevuld. Auteurs landen direct in `pending_admin_review`; admin hoeft alleen nog te reviewen en op activeren te klikken. De auteur ontvangt dan een recovery-mail om een wachtwoord in te stellen en kan direct alle tabbladen gebruiken.

De drie statussen — `pending_data`, `pending_admin_review`, `active` — zijn op database-niveau afgedwongen via een trigger die ongeoorloofde overgangen blokkeert, en op UI-niveau via een dual-mode dashboard dat tabbladen pas vrijgeeft zodra de status `active` is.

Volledig schema, voorbeeld-CSV en validatie-regels in `docs/onboarding-csv-import.md`.

---

## 8. Bijlagen

Voor IT-reviewers die dieper willen graven:

- **`README.md`** — lokale setup, deploy-pipeline, CI-checks, ontwikkelaars-instructies
- **`docs/SECURITY.md`** — bedreigingsmodel, RLS-policies per tabel, secret-management, Edge Function-architectuur, audit-trail, rate-limiting
- **`docs/AUDIT-2026-05-02.md`** — interne audit van 32 findings met severity, exploitation-pad, mitigatie en huidige status
- **`docs/onboarding-csv-import.md`** — NetSuite-CSV-flow, kolom-schema, validatie-regels, voorbeelden
- **`docs/netsuite-author-import-template.csv`** — kant-en-klaar template voor admin
- **`docs/adr/0001-typescript-strict-vanilla.md`** — onderbouwing van de framework-keuze
- **`docs/adr/0002-rls-whitelist-via-is-active.md`** — onderbouwing van de drie-laag access-architectuur

De repository staat op `https://github.com/SingaporeCity/auteursportaal` (publiek). De productie-Supabase-database is `qcqjurglmrhdiuhawfee` in de EU-regio; toegang tot het Supabase-dashboard kan op aanvraag worden verleend.

---

## 9. Contact

Vragen over dit document, het portaal of de review zelf — graag mailen naar **patrick.jeeninga@noordhoff.nl**.
