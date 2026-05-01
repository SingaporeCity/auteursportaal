/**
 * Formatters voor weergave van getallen, datums, en persoonlijke gegevens.
 *
 * Pure functies — geen side effects, geen DOM-toegang. Veilig om uit te roepen
 * in willekeurige render-paden.
 *
 * @module lib/format
 */

const NL = 'nl-NL';

/**
 * Formatteert een geldbedrag naar Euro met komma als decimaalteken.
 *
 * @example formatCurrency(1234.5) === '€ 1.234,50'
 */
export function formatCurrency(
  amount: number,
  options: { currency?: string; locale?: string } = {}
): string {
  const { currency = 'EUR', locale = NL } = options;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Compacte currency-weergave voor charts en mobiele tegels.
 *
 * @example formatCompactCurrency(2400) === '€ 2,4K'
 */
export function formatCompactCurrency(amount: number, locale = NL): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

/**
 * Formatteert een datum naar Nederlandse korte notatie.
 *
 * @example formatDate('2025-03-15') === '15 mrt 2025'
 */
export function formatDate(date: Date | string, locale = NL): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Maskeert een BSN: toont alleen de laatste 4 cijfers met bolletjes voor de rest.
 *
 * @example formatBSNMasked('123456789') === '•••••6789'
 */
export function formatBSNMasked(bsn: string): string {
  const digits = bsn.replace(/\D/g, '');
  if (digits.length < 4) {
    return '•'.repeat(Math.max(digits.length, 1));
  }
  const last4 = digits.slice(-4);
  const masked = '•'.repeat(digits.length - 4);
  return `${masked}${last4}`;
}

/**
 * Formatteert een IBAN in groepen van 4 tekens (uppercase).
 *
 * @example formatIBAN('NL78ASNB0707684307') === 'NL78 ASNB 0707 6843 07'
 */
export function formatIBAN(iban: string): string {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  return cleaned.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Formatteert een Nederlands mobiel of vast nummer naar internationale notatie.
 * Accepteert input met of zonder landcode, met of zonder spaties/streepjes.
 *
 * @example formatPhoneNL('630242036') === '+31 6 30242036'
 * @example formatPhoneNL('06-30242036') === '+31 6 30242036'
 * @example formatPhoneNL('+31630242036') === '+31 6 30242036'
 */
export function formatPhoneNL(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  // Strip 31-prefix als aanwezig
  const local = digits.startsWith('31')
    ? digits.slice(2)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits;

  if (local.length === 0) {
    return '';
  }

  // Mobiel begint met 6 en is 9 cijfers totaal (zonder 0 of 31 prefix)
  if (local.startsWith('6') && local.length === 9) {
    return `+31 6 ${local.slice(1)}`;
  }

  // Vast: 1 of 2-cijferig kengetal + abonneenummer (~7-8 cijfers)
  if (local.length >= 9 && local.length <= 10) {
    return `+31 ${local.slice(0, 2)} ${local.slice(2)}`;
  }

  return `+31 ${local}`;
}
