/**
 * Validators voor input-velden.
 *
 * Pure functies — geven `true` of `false`. Gebruik de `requireXxx` varianten
 * als je een fout wil throwen bij ongeldige input.
 *
 * @module lib/validate
 */

/**
 * Nederlands postcode-formaat (4 cijfers, optionele spatie, 2 letters).
 *
 * @example isValidPostcodeNL('1234 AB') === true
 * @example isValidPostcodeNL('4811DV') === true
 */
export function isValidPostcodeNL(postcode: string): boolean {
  return /^\d{4}\s?[A-Za-z]{2}$/.test(postcode.trim());
}

/**
 * Pragmatische email-validatie. Niet 100% RFC-5322 compliant, maar dekt 99.9%
 * van real-world inputs (incl. `+`-tags, subdomains, geldige TLDs).
 */
export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

/**
 * Valideert een IBAN via de mod-97 checksum (ISO 13616).
 * Lengte-check per land is niet ingebouwd — alleen het algoritme zelf.
 *
 * @example isValidIBAN('NL78ASNB0707684307') === true
 * @example isValidIBAN('NL00ASNB0707684307') === false
 */
export function isValidIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  if (cleaned.length < 15 || cleaned.length > 34) {
    return false;
  }
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleaned)) {
    return false;
  }

  // Eerste 4 tekens naar het einde
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);

  // Letters → digits (A=10, B=11, ..., Z=35)
  let numeric = '';
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      numeric += (code - 55).toString();
    } else if (code >= 48 && code <= 57) {
      numeric += char;
    } else {
      return false;
    }
  }

  // Mod-97 op een potentieel zeer groot getal — chunk-gewijze berekening
  let remainder = 0;
  for (const char of numeric) {
    remainder = (remainder * 10 + Number(char)) % 97;
  }
  return remainder === 1;
}

/**
 * Valideert een Nederlands BSN via de 11-proef.
 *
 * 11-proef: som van (digit[i] × gewicht[i]) moet deelbaar zijn door 11,
 * met gewichten 9, 8, 7, 6, 5, 4, 3, 2, -1 voor de 9 cijfers.
 *
 * BSN `000000000` (alle nullen) wordt expliciet als ONGELDIG behandeld omdat
 * dat geen toegekend BSN is, ook al passeert het de 11-proef wiskundig.
 *
 * @example isValidBSN('111222333') === true
 * @example isValidBSN('000000000') === false
 */
export function isValidBSN(bsn: string): boolean {
  const digits = bsn.replace(/\D/g, '');
  if (digits.length !== 9) {
    return false;
  }
  if (digits === '000000000') {
    return false;
  }

  const weights = [9, 8, 7, 6, 5, 4, 3, 2, -1];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const digit = digits.charCodeAt(i) - 48;
    const weight = weights[i];
    if (weight === undefined) {
      return false;
    }
    sum += digit * weight;
  }
  return sum % 11 === 0;
}

/**
 * Geeft een human-readable foutmelding terug, of `null` als alles OK is.
 * Gebruikt voor form-validatie waarbij je een foutbericht naast een veld
 * wilt tonen.
 */
export function validateProfileFields(input: {
  email?: string;
  postcode?: string;
  iban?: string;
  bsn?: string;
}): { field: keyof typeof input; message: string } | null {
  if (input.email !== undefined && input.email.length > 0 && !isValidEmail(input.email)) {
    return { field: 'email', message: 'Ongeldig e-mailadres' };
  }
  if (
    input.postcode !== undefined &&
    input.postcode.length > 0 &&
    !isValidPostcodeNL(input.postcode)
  ) {
    return { field: 'postcode', message: 'Ongeldige postcode (verwacht: 1234 AB)' };
  }
  if (input.iban !== undefined && input.iban.length > 0 && !isValidIBAN(input.iban)) {
    return { field: 'iban', message: 'Ongeldig IBAN-rekeningnummer' };
  }
  if (input.bsn !== undefined && input.bsn.length > 0 && !isValidBSN(input.bsn)) {
    return { field: 'bsn', message: 'Ongeldig BSN' };
  }
  return null;
}
