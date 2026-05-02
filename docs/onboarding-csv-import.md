# NetSuite-CSV-import voor auteurs

Documentatie voor de admin-rol om bestaande auteurs vanuit NetSuite naar het portaal te importeren.

## Hoe werkt het

1. **Export** auteursdata uit NetSuite met onderstaande kolomvolgorde + headers (UTF-8, comma-separated).
2. **Upload** in het admin-portaal via "📥 Importeer NetSuite CSV" → kies modus (`Alleen nieuwe` of `Bestaande bijwerken`) → preview → bevestig.
3. **Resultaat**: per rij wordt op basis van data-volledigheid de status gezet:
   - **Alle verplichte velden ingevuld + valide** → `pending_admin_review` (admin reviewt + activeert per auteur)
   - **Eén of meer velden ontbreken** → `pending_data` (admin stuurt invite-mail; auteur vult zelf aan)
   - **Onherstelbaar fout** (ongeldig email/IBAN/postcode/BSN/birth_date) → rij overgeslagen, getoond in error-rapport

## Vereiste CSV-kolommen (vaste volgorde)

```
email,first_name,last_name,phone,street,house_number,postcode,city,country,birth_date,bsn,bank_account,bic,vendor_id,alliant_id
```

| Kolom          | Type          | Verplicht voor activatie?            | Validatie                               |
| -------------- | ------------- | ------------------------------------ | --------------------------------------- |
| `email`        | string        | ✅ ja (DB unique + NOT NULL)         | RFC-5322-light regex                    |
| `first_name`   | string        | ✅ ja (DB NOT NULL)                  | non-empty                               |
| `last_name`    | string        | ✅ ja (DB NOT NULL)                  | non-empty                               |
| `phone`        | string        | ✅ ja (voor activatie)               | non-empty                               |
| `street`       | string        | ✅ ja                                | non-empty                               |
| `house_number` | string        | ✅ ja                                | non-empty                               |
| `postcode`     | string        | ✅ ja                                | NL-format `1234 AB`                     |
| `city`         | string        | ✅ ja                                | non-empty                               |
| `country`      | string        | ✅ ja (default `Nederland` als leeg) | non-empty                               |
| `birth_date`   | date          | ✅ ja                                | `YYYY-MM-DD`                            |
| `bsn`          | string        | ✅ ja                                | 9 cijfers + 11-proef                    |
| `bank_account` | string (IBAN) | ✅ ja                                | mod-97-checksum                         |
| `bic`          | string        | ✅ ja                                | non-empty                               |
| `vendor_id`    | string        | optioneel maar aanbevolen            | non-empty (NetSuite Internal Vendor ID) |
| `alliant_id`   | string        | optioneel                            | non-empty                               |

Lege cel = veld ontbreekt. Onbekende of foutief geformatteerde waarde = de rij wordt afgewezen met error-rapport.

## Voorbeeld

Zie `docs/netsuite-author-import-template.csv` voor twee voorbeeld-rijen:

- Charlotte Phillips (alle velden ingevuld → `pending_admin_review`)
- "Nieuwe auteur" (alleen email + naam + vendor_id → `pending_data`, auteur vult zelf aan)

## Flow per status na import

### `pending_admin_review`

1. Admin opent admin-portaal → ziet oranje "Wacht op review" badge
2. Admin reviewt data (controleert NetSuite-export op typos)
3. Admin klikt **Activeer** → Edge Function `create-accounts mode=activate` maakt auth-user + verstuurt recovery-mail + zet status `active`
4. Auteur ontvangt mail → kiest wachtwoord → logt in → ziet alle 7 tabs

### `pending_data`

1. Admin opent admin-portaal → ziet gele "Wacht op auteur" badge
2. Admin klikt **Stuur uitnodiging** → Edge Function `create-accounts mode=invite` maakt auth-user + verstuurt mail + zet `invited_at`
3. Auteur ontvangt mail → kiest wachtwoord → logt in → ziet alleen profile-tab + onboarding-banner
4. Auteur vult ontbrekende velden in → klikt **Activeer mijn account**
5. Status wordt `pending_admin_review` → admin krijgt zichtbare badge → klikt **Activeer** → flow gaat verder als boven
6. Geen reactie binnen 14 dagen? Admin filtert "uitgenodigd > 14d", klikt **Stuur reminder** (zelfde Edge Function, zet `reminder_sent_at`)

## Beperkingen

- **⚠️ Email rate-limit (BLOKKER bij bulk)**: Supabase's ingebouwde mailer doet 3 mails/uur. Bij bulk-onboarding (CSV met 100+ rijen + per-rij "Stuur uitnodiging") loopt dat na een paar klikken vast met `over_email_send_rate_limit`. **Configureer eerst een externe SMTP-provider** (Resend/SendGrid/SES) — zie README sectie 8.
- **Email is auth-key**. Auteurs kunnen hun email NIET zelf wijzigen na invite — admin moet via NetSuite + nieuwe CSV-import bijwerken.
- **BSN is na eerste invoer immutable** (iter 7). Als CSV een BSN bevat voor een bestaand record met al ingevulde BSN, wordt dat veld silent geskipt — `bsn_skipped` counter in result-modal toont hoeveel rijen dat betrof. Correcties van foutief ingevulde BSN: contact `rights@noordhoff.nl` (vereist directe DB-edit via Supabase Studio).
- **Edge Function timeout**: standaard 60s. Voor zeer grote batches (2500+ rows) kan splitsen in chunks van ~500 nodig zijn.
- **Email-mismatch met bestaand `auth.users`**: als CSV-email niet matcht een bestaand auth-account maakt het systeem een nieuwe auth-user. Dit kan tot duplicaten leiden bij hercreatie. Importeer dus alleen na zorgvuldige sync met NetSuite.

## CLI-alternatief (toekomstig)

Niet beschikbaar in iter 4 — alleen via admin-portaal.
