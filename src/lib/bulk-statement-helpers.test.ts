import { describe, it, expect } from 'vitest';
import {
  parseStatementFilename,
  parseBedragenExcel,
  lookupAmount,
  buildMonthTitle,
  derivePaymentDate,
} from './bulk-statement-helpers';

describe('parseStatementFilename', () => {
  it('parset standaard NU_SC-filename', () => {
    const result = parseStatementFilename('NU_SC_2651307_G. de Jong_202512.pdf');
    expect(result).toEqual({
      alliantId: '2651307',
      displayName: 'G. de Jong',
      year: 2025,
      month: 12,
      yyyymm: '202512',
    });
  });

  it('accepteert namen met koppeltekens en spaties', () => {
    const result = parseStatementFilename('NU_SC_2644800_van Dijk-Jansen_202403.pdf');
    expect(result).toEqual({
      alliantId: '2644800',
      displayName: 'van Dijk-Jansen',
      year: 2024,
      month: 3,
      yyyymm: '202403',
    });
  });

  it('is hoofdletter-ongevoelig voor de extensie', () => {
    const result = parseStatementFilename('NU_SC_1_Naam_202101.PDF');
    if ('error' in result) {
      throw new Error('verwacht success');
    }
    expect(result.year).toBe(2021);
  });

  it('verwerpt filenames zonder NU_SC-prefix', () => {
    expect(parseStatementFilename('SC_1234_Naam_202512.pdf')).toHaveProperty('error');
    expect(parseStatementFilename('factuur.pdf')).toHaveProperty('error');
  });

  it('verwerpt ongeldige maand', () => {
    const result = parseStatementFilename('NU_SC_1_Naam_202513.pdf');
    expect(result).toEqual({ error: expect.stringContaining('Maand') as unknown });
  });

  it('verwerpt jaar buiten bereik', () => {
    expect(parseStatementFilename('NU_SC_1_Naam_201912.pdf')).toHaveProperty('error');
    expect(parseStatementFilename('NU_SC_1_Naam_209912.pdf')).toHaveProperty('error');
  });

  it('verwerpt niet-numerieke alliant_id', () => {
    expect(parseStatementFilename('NU_SC_ABC_Naam_202512.pdf')).toHaveProperty('error');
  });
});

describe('parseBedragenExcel + lookupAmount', () => {
  // Minimale XLSX-stub voor de pure parser-tests. We mocken alleen wat onze
  // parser gebruikt: `read` + `utils.sheet_to_json`. Geen echte Excel-files
  // nodig in unit-test.
  function buildMockXLSX(
    headerRow: unknown[],
    dataRows: unknown[][]
  ): {
    XLSX: Parameters<typeof parseBedragenExcel>[1];
    buffer: ArrayBuffer;
  } {
    const sheet = { __rows__: [headerRow, ...dataRows] };
    const wb = { SheetNames: ['Sheet1'], Sheets: { Sheet1: sheet } };
    const XLSX = {
      read: () => wb,
      utils: {
        sheet_to_json: (_s: typeof sheet) => _s.__rows__,
      },
    } as unknown as Parameters<typeof parseBedragenExcel>[1];
    return { XLSX, buffer: new ArrayBuffer(0) };
  }

  it('parset header + 2 rijen (één met yyyymm, één default)', () => {
    const { XLSX, buffer } = buildMockXLSX(
      ['alliant_id', 'amount', 'yyyymm'],
      [
        ['2651307', 1234.56, '202512'],
        ['2644800', 750.25, ''],
      ]
    );
    const map = parseBedragenExcel(buffer, XLSX);
    if (!(map instanceof Map)) {
      throw new Error(`expected Map, got error: ${JSON.stringify(map)}`);
    }
    expect(lookupAmount(map, '2651307', '202512')).toBe(1234.56);
    expect(lookupAmount(map, '2651307', '202501')).toBeNull(); // geen default voor deze auteur
    expect(lookupAmount(map, '2644800', '202512')).toBe(750.25); // default-fallback
    expect(lookupAmount(map, '2644800', '202402')).toBe(750.25); // default-fallback voor andere maand
    expect(lookupAmount(map, '9999', '202512')).toBeNull(); // onbekende auteur
  });

  it('verwerpt verkeerde kolomvolgorde', () => {
    const { XLSX, buffer } = buildMockXLSX(
      ['amount', 'alliant_id', 'yyyymm'],
      [[100, '2651307', '202512']]
    );
    const result = parseBedragenExcel(buffer, XLSX);
    expect(result).toHaveProperty('error');
  });

  it('verwerpt ongeldige yyyymm-string', () => {
    const { XLSX, buffer } = buildMockXLSX(
      ['alliant_id', 'amount', 'yyyymm'],
      [['2651307', 100, 'december']]
    );
    const result = parseBedragenExcel(buffer, XLSX);
    expect(result).toHaveProperty('error');
  });

  it('accepteert NL-style komma-decimaal in string-bedragen', () => {
    const { XLSX, buffer } = buildMockXLSX(
      ['alliant_id', 'amount', 'yyyymm'],
      [['2651307', '1.234,56', '202512']]
    );
    const map = parseBedragenExcel(buffer, XLSX);
    if (!(map instanceof Map)) {
      throw new Error('expected Map');
    }
    expect(lookupAmount(map, '2651307', '202512')).toBe(1234.56);
  });

  it('rondt bedragen af op 2 decimalen', () => {
    const { XLSX, buffer } = buildMockXLSX(
      ['alliant_id', 'amount', 'yyyymm'],
      [
        ['1', 1.234567, ''], // moet → 1.23
        ['2', 99.999, ''], // moet → 100
      ]
    );
    const map = parseBedragenExcel(buffer, XLSX);
    if (!(map instanceof Map)) {
      throw new Error('expected Map');
    }
    expect(lookupAmount(map, '1', '202512')).toBe(1.23);
    expect(lookupAmount(map, '2', '202512')).toBe(100);
  });

  it('yyyymm-rij overruled de default voor dezelfde auteur', () => {
    const { XLSX, buffer } = buildMockXLSX(
      ['alliant_id', 'amount', 'yyyymm'],
      [
        ['100', 50, ''], // default
        ['100', 999, '202512'], // specific
      ]
    );
    const map = parseBedragenExcel(buffer, XLSX);
    if (!(map instanceof Map)) {
      throw new Error('expected Map');
    }
    expect(lookupAmount(map, '100', '202512')).toBe(999);
    expect(lookupAmount(map, '100', '202401')).toBe(50); // andere maand → default
  });
});

describe('buildMonthTitle', () => {
  it('royalty NL: alleen jaar (statement is per boekjaar)', () => {
    expect(buildMonthTitle('royalty', 2025, 12, 'nl')).toBe('Royalty uitkering over 2025');
    expect(buildMonthTitle('royalty', 2024, 3, 'nl')).toBe('Royalty uitkering over 2024');
  });

  it('royalty EN: alleen jaar', () => {
    expect(buildMonthTitle('royalty', 2025, 12, 'en')).toBe('Royalty payment for 2025');
  });

  it('jaaropgave: alleen jaar, geen maand', () => {
    expect(buildMonthTitle('jaaropgave', 2025, 12, 'nl')).toBe('Jaaropgave 2025');
    expect(buildMonthTitle('jaaropgave', 2025, 1, 'en')).toBe('Annual statement 2025');
  });

  it('subsidiary + foreign tonen wel maand', () => {
    expect(buildMonthTitle('subsidiary', 2025, 6, 'nl')).toBe('Nevenrechten-afrekening juni 2025');
    expect(buildMonthTitle('foreign', 2025, 7, 'en')).toBe('Foreign rights statement July 2025');
  });

  it('sv valt terug op NL-formattering', () => {
    expect(buildMonthTitle('royalty', 2025, 12, 'sv')).toBe('Royalty uitkering over 2025');
  });
});

describe('derivePaymentDate', () => {
  it('royalty shift naar Q1 van het volgende jaar', () => {
    expect(derivePaymentDate('royalty', 2025, 12)).toBe('2026-03-01');
    expect(derivePaymentDate('royalty', 2024, 6)).toBe('2025-03-01');
  });

  it('subsidiary/foreign/jaaropgave gebruiken statement-periode', () => {
    expect(derivePaymentDate('subsidiary', 2025, 6)).toBe('2025-06-01');
    expect(derivePaymentDate('foreign', 2025, 7)).toBe('2025-07-01');
    expect(derivePaymentDate('jaaropgave', 2025, 12)).toBe('2025-12-01');
  });
});
