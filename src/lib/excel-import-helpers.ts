/**
 * Pure helpers voor de Excel-bulk-import van bestaande auteurs (admin-flow).
 *
 * Frontend parset het Excel-bestand client-side met SheetJS en mapt elke rij
 * naar de body-shape die de `bulk-create-existing-authors` Edge Function
 * verwacht. Deze module bevat de niet-validerende normalisatie-stappen:
 *
 *   - `parseExcelSerialDate`  — Excel-serial (1900-based) → ISO 'YYYY-MM-DD'
 *   - `isPlausibleBirthDate`  — afvang placeholders (year < 1920 of > 2010)
 *   - `splitName`             — "A Baken-van Hannen" → first/last (em-dash
 *                                voor bedrijven met BV/NV/V.O.F./etc.)
 *   - `splitAddress`          — "Waag 61" → street + huisnummer
 *   - `normalizeCountry`      — "Netherlands"/"NL"/"" → "Nederland"
 *   - `normalizePostcode`     — "1234ab" → "1234 AB"
 *
 * Email/IBAN/BSN-validatie hergebruikt `@/lib/validate`. Server doet dezelfde
 * validatie opnieuw — pas op met de twee copies; semantiek moet matchen
 * (zie `supabase/functions/bulk-create-existing-authors/index.ts`).
 *
 * @module lib/excel-import-helpers
 */

const COMPANY_SUFFIX_RE =
  /\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|vof|stichting|holding|gmbh|ltd|llc|s\.?a\.?|coöperatie|coop)\b/i;

/**
 * Excel-cellen met dates komen door SheetJS als numeric serial (dagen sinds
 * 1900-01-01, met de 1900-leap-year-bug verrekend). Deze functie converteert
 * naar ISO `YYYY-MM-DD`. Leeg/NaN/negatief → lege string (= NULL in DB).
 *
 * Excel-bug: 1900 wordt als schrikkeljaar beschouwd (Feb 29, 1900 = serial 60).
 * Voor serials < 60 is offset 25568 correct; vanaf serial 60+ is dat 25569.
 *
 * @example parseExcelSerialDate(20311) === '1955-08-10'
 * @example parseExcelSerialDate(1) === '1900-01-01'   // Excel placeholder
 */
export function parseExcelSerialDate(serial: unknown): string {
  if (typeof serial === 'string' && ISO_DATE_RE.test(serial)) {
    return serial; // al ISO
  }
  if (typeof serial !== 'number' || !Number.isFinite(serial) || serial <= 0) {
    return '';
  }
  const offset = serial < 60 ? 25568 : 25569;
  const ms = (serial - offset) * 86400 * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${String(y).padStart(4, '0')}-${m}-${day}`;
}

/**
 * Plausibility-check: alleen geboortedatums tussen 1920-01-01 en 2010-12-31
 * gelden als bruikbaar. Excel-placeholders (zoals serial 1 → 1900-01-01)
 * worden afgevangen; idem datums in de toekomst of voor 1920 (auteur zou dan
 * 100+ jaar oud zijn — bijna zeker een data-fout).
 */
export function isPlausibleBirthDate(iso: string): boolean {
  if (!ISO_DATE_RE.test(iso)) {
    return false;
  }
  const year = Number(iso.slice(0, 4));
  return year >= 1920 && year <= 2010;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Splits Excel-"Name" in first/last. Strip eerst leading punctuatie/whitespace
 * (bv. ". Projectbureau Odino bv" → "Projectbureau Odino bv"). Detecteer
 * bedrijfssuffix (bv/B.V./NV/V.O.F./stichting/etc.) → `first_name='—'` (em-dash)
 * en de volledige naam wordt last_name. Anders: split op eerste spatie.
 *
 * Singletons (één woord) krijgen ook em-dash als first_name omdat first_name
 * NOT NULL is in DB.
 *
 * @example splitName('A Baken-van Hannen')  → { first_name: 'A',  last_name: 'Baken-van Hannen' }
 * @example splitName('. Projectbureau bv')  → { first_name: '—',  last_name: 'Projectbureau bv' }
 * @example splitName('')                    → { first_name: '—',  last_name: '—' }
 */
export function splitName(rawName: string): { first_name: string; last_name: string } {
  const cleaned = rawName.replace(/^[.\s]+/, '').replace(/\s+$/, '');
  if (cleaned === '') {
    return { first_name: '—', last_name: '—' };
  }
  if (COMPANY_SUFFIX_RE.test(cleaned)) {
    return { first_name: '—', last_name: truncate(cleaned, 100) };
  }
  const idx = cleaned.indexOf(' ');
  if (idx === -1) {
    return { first_name: '—', last_name: truncate(cleaned, 100) };
  }
  return {
    first_name: truncate(cleaned.slice(0, idx), 100),
    last_name: truncate(cleaned.slice(idx + 1).trim(), 100),
  };
}

/**
 * Splits "Billing Address 1" (één veld) in street + huisnummer. Regex pakt
 * vanaf rechts het eerste cijfer-token, inclusief letter-suffixen ("12-A").
 * Geen match → street=volledig, house_number=''.
 *
 * @example splitAddress('Waag 61')          → { street: 'Waag', house_number: '61' }
 * @example splitAddress('Hoofdstraat 12-A') → { street: 'Hoofdstraat', house_number: '12-A' }
 * @example splitAddress('Postbus')          → { street: 'Postbus', house_number: '' }
 */
export function splitAddress(line: string): { street: string; house_number: string } {
  const trimmed = line.trim();
  if (trimmed === '') {
    return { street: '', house_number: '' };
  }
  const m = ADDRESS_RE.exec(trimmed);
  if (m === null) {
    return { street: truncate(trimmed, 255), house_number: '' };
  }
  return {
    street: truncate((m[1] ?? '').trim(), 255),
    house_number: truncate((m[2] ?? '').trim(), 20),
  };
}

const ADDRESS_RE = /^(.+?)\s+(\d+[\d\s\-/A-Za-z]*)$/;

/**
 * Normaliseer landennaam naar de DB-default 'Nederland'. NetSuite exporteert
 * meestal `Netherlands`; lege string of `NL`-varianten worden ook gemapt.
 * Overige landen worden ongewijzigd doorgegeven.
 */
export function normalizeCountry(c: string): string {
  const lower = c.trim().toLowerCase();
  if (lower === '' || lower === 'netherlands' || lower === 'nederland' || lower === 'nl') {
    return 'Nederland';
  }
  return c.trim();
}

/**
 * NL-postcode naar canonieke `1234 AB` vorm (4 cijfers, spatie, 2 hoofdletters).
 * Niet-NL-formaat wordt onveranderd teruggegeven; server-validatie pakt het op.
 */
export function normalizePostcode(p: string): string {
  const compact = p.replace(/\s/g, '').toUpperCase();
  const m = POSTCODE_RE.exec(compact);
  if (m === null) {
    return p.trim();
  }
  return `${m[1] ?? ''} ${m[2] ?? ''}`;
}

const POSTCODE_RE = /^(\d{4})([A-Z]{2})$/;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}
