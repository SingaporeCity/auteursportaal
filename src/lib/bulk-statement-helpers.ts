/**
 * Pure helpers voor bulk-upload van royalty-statement-PDFs.
 *
 * Bevat parsing/validatie:
 *   - filename → alliant_id + auteursnaam (display) + year + month
 *   - Excel met bedragen → Map<alliant_id, { default?, byYyyymm }>
 *   - title-generatie per (type, year, month, locale)
 *   - amount-lookup met yyyymm-precisie + default-fallback
 *
 * Geen Supabase-calls, geen DOM — volledig testbaar in vitest.
 *
 * @module lib/bulk-statement-helpers
 */

import type * as XLSXNamespace from 'xlsx';
import type { PaymentType } from '@/types/db';
import type { SupportedLocale } from '@/i18n/types';

// ============================================================================
// Filename-parsing
// ============================================================================

export interface ParsedFilename {
  alliantId: string;
  displayName: string;
  year: number;
  month: number;
  yyyymm: string; // bv. '202512'
}

const FILENAME_RE = /^NU_SC_(\d+)_(.+?)_(\d{4})(\d{2})\.pdf$/i;
const CURRENT_YEAR_PLUS_ONE = new Date().getFullYear() + 1;

/**
 * Parset een NetSuite-statement-filename naar zijn semantische velden.
 *
 * Verwachte conventie: `NU_SC_<alliantId>_<naam>_<YYYYMM>.pdf`.
 *
 * @example parseStatementFilename('NU_SC_2651307_G. de Jong_202512.pdf')
 *   → { alliantId: '2651307', displayName: 'G. de Jong', year: 2025, month: 12, yyyymm: '202512' }
 */
export function parseStatementFilename(filename: string): ParsedFilename | { error: string } {
  const m = FILENAME_RE.exec(filename);
  if (m === null) {
    return {
      error: 'Filename volgt niet de conventie NU_SC_<alliantId>_<naam>_<YYYYMM>.pdf',
    };
  }
  const alliantId = m[1] ?? '';
  const displayName = m[2] ?? '';
  const year = Number(m[3] ?? '0');
  const month = Number(m[4] ?? '0');

  if (year < 2020 || year > CURRENT_YEAR_PLUS_ONE) {
    return {
      error: `Jaar ${String(year)} ligt buiten verwacht bereik (2020–${String(CURRENT_YEAR_PLUS_ONE)}).`,
    };
  }
  if (month < 1 || month > 12) {
    return { error: `Maand ${String(month)} is ongeldig (01–12 verwacht).` };
  }

  return {
    alliantId,
    displayName,
    year,
    month,
    yyyymm: `${String(year)}${String(month).padStart(2, '0')}`,
  };
}

// ============================================================================
// Excel-parsing voor bedragen
// ============================================================================

export interface BedragenEntry {
  /** Bedrag dat geldt zonder yyyymm-rij (admin-template heeft één rij/auteur). */
  default?: number;
  /** Specifieke yyyymm-koppelingen (overruled de default). */
  byYyyymm: Map<string, number>;
}

export type BedragenMap = Map<string, BedragenEntry>;

const BEDRAGEN_HEADERS = ['alliant_id', 'amount', 'yyyymm'] as const;

/**
 * Parset het bedragen-Excel naar een lookup-map. Verwacht strict 3 kolommen
 * in volgorde (case-insensitive). `yyyymm` mag per rij leeg zijn → die rij
 * dient als default voor alle batch-PDFs van die auteur.
 *
 * Rijen met dezelfde (alliant_id, yyyymm) → laatste wint (geen waarschuwing).
 */
export function parseBedragenExcel(
  buffer: ArrayBuffer,
  XLSX: typeof XLSXNamespace
): BedragenMap | { error: string } {
  let wb: XLSXNamespace.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'array' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Kon bedragen-Excel niet lezen: ${msg}` };
  }
  const sheetName = wb.SheetNames[0];
  if (sheetName === undefined) {
    return { error: 'Bedragen-Excel bevat geen werkblad.' };
  }
  const sheet = wb.Sheets[sheetName];
  if (sheet === undefined) {
    return { error: 'Bedragen-werkblad kon niet worden geopend.' };
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  });
  if (rows.length < 2) {
    return { error: 'Bedragen-Excel moet header + minstens 1 data-rij bevatten.' };
  }

  // Header-validatie (strikte volgorde, zoals excel-import.ts:42-55).
  const header = (rows[0] ?? []).map((c) => toCellString(c).trim().toLowerCase());
  for (let i = 0; i < BEDRAGEN_HEADERS.length; i++) {
    const expected = BEDRAGEN_HEADERS[i] ?? '';
    if (header[i] !== expected) {
      return {
        error: `Kolom ${String(i + 1)} verwacht "${expected}", maar gevonden "${header[i] ?? ''}".`,
      };
    }
  }

  const map: BedragenMap = new Map();
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r] ?? [];
    const isEmpty = cells.every((c) => c === null || c === undefined || c === '');
    if (isEmpty) {
      continue;
    }

    const alliantId = toCellString(cells[0]).trim();
    const amountRaw = cells[1];
    const yyyymmRaw = toCellString(cells[2]).trim();

    if (alliantId === '') {
      return { error: `Rij ${String(r + 1)}: alliant_id ontbreekt.` };
    }
    const amount = toAmountNumber(amountRaw);
    if (amount === null) {
      return { error: `Rij ${String(r + 1)} (${alliantId}): bedrag ongeldig.` };
    }

    let entry = map.get(alliantId);
    if (entry === undefined) {
      entry = { byYyyymm: new Map() };
      map.set(alliantId, entry);
    }
    if (yyyymmRaw === '') {
      entry.default = amount;
    } else {
      // Accepteer ook 6-cijferige numerieke waarden uit Excel
      const normalized = yyyymmRaw.replace(/\s/g, '');
      if (!/^\d{6}$/.test(normalized)) {
        return {
          error: `Rij ${String(r + 1)} (${alliantId}): yyyymm "${yyyymmRaw}" is ongeldig (6 cijfers verwacht).`,
        };
      }
      entry.byYyyymm.set(normalized, amount);
    }
  }

  return map;
}

/**
 * Zoekt het juiste bedrag op voor een auteur+maand. Volgorde:
 *   1. Exacte match op `yyyymm`.
 *   2. Default-bedrag (rij met lege yyyymm) voor de auteur.
 *   3. `null` als geen van beide bestaat — caller toont "bedrag ontbreekt".
 */
export function lookupAmount(map: BedragenMap, alliantId: string, yyyymm: string): number | null {
  const entry = map.get(alliantId);
  if (entry === undefined) {
    return null;
  }
  const exact = entry.byYyyymm.get(yyyymm);
  if (exact !== undefined) {
    return exact;
  }
  if (entry.default !== undefined) {
    return entry.default;
  }
  return null;
}

// ============================================================================
// Title-generatie
// ============================================================================

const NL_MONTHS = [
  'januari',
  'februari',
  'maart',
  'april',
  'mei',
  'juni',
  'juli',
  'augustus',
  'september',
  'oktober',
  'november',
  'december',
];
const EN_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const TYPE_LABELS_NL: Record<PaymentType, string> = {
  royalty: 'Royaltyafrekening',
  subsidiary: 'Nevenrechten-afrekening',
  foreign: 'Buitenlandse afrekening',
  jaaropgave: 'Jaaropgave',
};
const TYPE_LABELS_EN: Record<PaymentType, string> = {
  royalty: 'Royalty statement',
  subsidiary: 'Subsidiary rights statement',
  foreign: 'Foreign rights statement',
  jaaropgave: 'Annual statement',
};

/**
 * Bouwt een nette display-title voor één statement.
 *
 *  - `jaaropgave` en `royalty` tonen alleen het jaartal (geen maand). Royalty
 *    is per definitie een afrekening over een heel boekjaar, niet over de
 *    maand waarin het bestand is opgeleverd.
 *  - `subsidiary` en `foreign` tonen maand + jaar (per periode geleverd).
 *
 * @example buildMonthTitle('royalty', 2025, 12, 'nl') === 'Royalty uitkering over 2025'
 * @example buildMonthTitle('jaaropgave', 2025, 12, 'en') === 'Annual statement 2025'
 * @example buildMonthTitle('subsidiary', 2025, 6, 'nl') === 'Nevenrechten-afrekening juni 2025'
 */
export function buildMonthTitle(
  type: PaymentType,
  year: number,
  month: number,
  locale: SupportedLocale
): string {
  // Zweeds vertaalt voorlopig naar NL (geen vraag om SV-statements);
  // dat houdt de helper klein. Indien nodig later uitbreiden.
  const isEnglish = locale === 'en';
  const labels = isEnglish ? TYPE_LABELS_EN : TYPE_LABELS_NL;
  const label = labels[type];

  if (type === 'jaaropgave') {
    return `${label} ${String(year)}`;
  }
  if (type === 'royalty') {
    const prefix = isEnglish ? 'Royalty payment for' : 'Royalty uitkering over';
    return `${prefix} ${String(year)}`;
  }
  const months = isEnglish ? EN_MONTHS : NL_MONTHS;
  const m = months[month - 1] ?? String(month);
  return `${label} ${m} ${String(year)}`;
}

/**
 * Bepaalt de uitbetalings-datum (= veld `payments.payment_date`) voor een
 * nieuw statement op basis van type + statement-periode.
 *
 *  - `royalty` wordt jaarlijks afgerekend in het 1e kwartaal van het jaar
 *    NA het boekjaar. Een statement over boekjaar YYYY (ongeacht in welke
 *    maand het bestand wordt opgeleverd) krijgt dus `{YYYY+1}-03-01`. Dat
 *    zorgt dat het in de auteurs-Afrekeningen-tab onder het juiste uit-
 *    betaaljaar valt (matcht de werkelijke kasstroom).
 *  - Andere types gebruiken de statement-periode zelf als datum-anchor.
 */
export function derivePaymentDate(type: PaymentType, year: number, month: number): string {
  if (type === 'royalty') {
    return `${String(year + 1)}-03-01`;
  }
  return `${String(year)}-${String(month).padStart(2, '0')}-01`;
}

// ============================================================================
// Locale internals
// ============================================================================

function toCellString(c: unknown): string {
  if (c === null || c === undefined || c === '') {
    return '';
  }
  if (typeof c === 'string') {
    return c;
  }
  if (typeof c === 'number' || typeof c === 'boolean') {
    return String(c);
  }
  if (c instanceof Date) {
    return c.toISOString().slice(0, 10);
  }
  return '';
}

function toAmountNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.round(raw * 100) / 100; // Op 2 decimalen knippen
  }
  if (typeof raw === 'string') {
    // Excel kan strings teruggeven bij text-formatted cellen; sta ',' als
    // decimaalteken toe (NL-locale) en strip duizendtal-punten.
    const cleaned = raw.trim().replace(/\./g, '').replace(',', '.');
    if (cleaned === '') {
      return null;
    }
    const n = Number(cleaned);
    if (Number.isFinite(n)) {
      return Math.round(n * 100) / 100;
    }
  }
  return null;
}
