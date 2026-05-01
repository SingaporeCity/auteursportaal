import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatCompactCurrency,
  formatDate,
  formatBSNMasked,
  formatIBAN,
  formatPhoneNL,
} from './format';

// Intl gebruikt een non-breaking space (U+00A0) tussen valutasymbool en bedrag.
const NBSP = String.fromCharCode(0xa0);

describe('formatCurrency', () => {
  it('formatteert een geheel bedrag in euros', () => {
    expect(formatCurrency(1234)).toBe(`€${NBSP}1.234,00`);
  });

  it('rondt af op 2 decimalen', () => {
    expect(formatCurrency(1234.567)).toBe(`€${NBSP}1.234,57`);
  });

  it('toont negatieve bedragen', () => {
    expect(formatCurrency(-50)).toContain('50,00');
  });

  it('toont nul', () => {
    expect(formatCurrency(0)).toBe(`€${NBSP}0,00`);
  });
});

describe('formatCompactCurrency', () => {
  it('verkort grote bedragen', () => {
    const result = formatCompactCurrency(2400);
    expect(result).toMatch(/2[,.]4\s?K/);
  });
});

describe('formatDate', () => {
  it('formatteert een ISO-string in NL-stijl', () => {
    const result = formatDate('2025-03-15');
    expect(result).toMatch(/15.{0,2}mrt\.?.{0,2}2025/);
  });

  it('retourneert lege string voor ongeldige input', () => {
    expect(formatDate('niet-een-datum')).toBe('');
  });

  it('werkt met Date-object', () => {
    const result = formatDate(new Date(2025, 2, 15));
    expect(result).toMatch(/15.*2025/);
  });
});

describe('formatBSNMasked', () => {
  it('maskeert alle behalve laatste 4 cijfers', () => {
    expect(formatBSNMasked('123456789')).toBe('•••••6789');
  });

  it('werkt met 4 cijfers exact', () => {
    expect(formatBSNMasked('1234')).toBe('1234');
  });

  it('strippt niet-cijfers eerst', () => {
    expect(formatBSNMasked('123-456-789')).toBe('•••••6789');
  });

  it('handelt korte input af', () => {
    expect(formatBSNMasked('12')).toBe('••');
  });

  it('handelt lege string af', () => {
    expect(formatBSNMasked('')).toBe('•');
  });
});

describe('formatIBAN', () => {
  it('groepeert in blokken van 4', () => {
    expect(formatIBAN('NL78ASNB0707684307')).toBe('NL78 ASNB 0707 6843 07');
  });

  it('strippt bestaande spaties', () => {
    expect(formatIBAN('NL78 ASNB 0707 6843 07')).toBe('NL78 ASNB 0707 6843 07');
  });

  it('upper-cased lowercase input', () => {
    expect(formatIBAN('nl78asnb0707684307')).toBe('NL78 ASNB 0707 6843 07');
  });
});

describe('formatPhoneNL', () => {
  it('formatteert een mobiel nummer zonder prefix', () => {
    expect(formatPhoneNL('630242036')).toBe('+31 6 30242036');
  });

  it('formatteert mobiel met 06-prefix', () => {
    expect(formatPhoneNL('0630242036')).toBe('+31 6 30242036');
  });

  it('formatteert mobiel met 31-prefix', () => {
    expect(formatPhoneNL('31630242036')).toBe('+31 6 30242036');
  });

  it('formatteert mobiel met +31-prefix en streepjes', () => {
    expect(formatPhoneNL('+31-6-30242036')).toBe('+31 6 30242036');
  });

  it('handelt vast nummer af', () => {
    expect(formatPhoneNL('0505226922')).toBe('+31 50 5226922');
  });

  it('retourneert lege string voor lege input', () => {
    expect(formatPhoneNL('')).toBe('');
  });
});
