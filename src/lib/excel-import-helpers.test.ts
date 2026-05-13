import { describe, it, expect } from 'vitest';
import {
  splitName,
  splitAddress,
  normalizeCountry,
  normalizePostcode,
  parseExcelSerialDate,
  isPlausibleBirthDate,
} from './excel-import-helpers';

describe('splitName', () => {
  it('splits een normale persoon op de eerste spatie', () => {
    expect(splitName('A Baken-van Hannen')).toEqual({
      first_name: 'A',
      last_name: 'Baken-van Hannen',
    });
    expect(splitName('Patrick Jeeninga')).toEqual({
      first_name: 'Patrick',
      last_name: 'Jeeninga',
    });
  });

  it('strip leading punctuatie en whitespace', () => {
    expect(splitName('  . Projectbureau Odino bv')).toEqual({
      first_name: '—',
      last_name: 'Projectbureau Odino bv',
    });
    expect(splitName('...Jansen Pietersen')).toEqual({
      first_name: 'Jansen',
      last_name: 'Pietersen',
    });
  });

  it('detecteert bedrijfssuffix (bv/BV/B.V.) en zet em-dash als first_name', () => {
    expect(splitName('Projectbureau Odino bv')).toEqual({
      first_name: '—',
      last_name: 'Projectbureau Odino bv',
    });
    expect(splitName('Acme Corp B.V.')).toEqual({
      first_name: '—',
      last_name: 'Acme Corp B.V.',
    });
    expect(splitName('Iets N.V.')).toEqual({
      first_name: '—',
      last_name: 'Iets N.V.',
    });
    expect(splitName('Vof Hanssen & Co')).toEqual({
      first_name: '—',
      last_name: 'Vof Hanssen & Co',
    });
  });

  it('detecteert stichting/holding/gmbh als bedrijf', () => {
    expect(splitName('Stichting Lezen Nederland').first_name).toBe('—');
    expect(splitName('Schiphol Holding').first_name).toBe('—');
    expect(splitName('Springer GmbH').first_name).toBe('—');
  });

  it('valt terug op em-dash bij singletons en lege input', () => {
    expect(splitName('Cher')).toEqual({ first_name: '—', last_name: 'Cher' });
    expect(splitName('')).toEqual({ first_name: '—', last_name: '—' });
    expect(splitName('  .. ')).toEqual({ first_name: '—', last_name: '—' });
  });

  it('kapt overlange waarden af op 100 tekens', () => {
    const long = 'A'.repeat(150);
    const result = splitName(`Voornaam ${long}`);
    expect(result.first_name).toBe('Voornaam');
    expect(result.last_name).toHaveLength(100);
  });
});

describe('splitAddress', () => {
  it('splits "Waag 61" in street + huisnummer', () => {
    expect(splitAddress('Waag 61')).toEqual({ street: 'Waag', house_number: '61' });
  });

  it('splits "Smient 44" correct', () => {
    expect(splitAddress('Smient 44')).toEqual({ street: 'Smient', house_number: '44' });
  });

  it('houdt letter-suffix bij huisnummer', () => {
    expect(splitAddress('Hoofdstraat 12-A')).toEqual({
      street: 'Hoofdstraat',
      house_number: '12-A',
    });
    expect(splitAddress('Damrak 100bis')).toEqual({
      street: 'Damrak',
      house_number: '100bis',
    });
  });

  it('valt terug op street=volledig wanneer er geen nummer is', () => {
    expect(splitAddress('Postbus')).toEqual({ street: 'Postbus', house_number: '' });
    expect(splitAddress('Achterweg')).toEqual({ street: 'Achterweg', house_number: '' });
  });

  it('geeft lege waardes terug bij lege input', () => {
    expect(splitAddress('')).toEqual({ street: '', house_number: '' });
    expect(splitAddress('   ')).toEqual({ street: '', house_number: '' });
  });
});

describe('normalizeCountry', () => {
  it('mapt "Netherlands" en varianten naar "Nederland"', () => {
    expect(normalizeCountry('Netherlands')).toBe('Nederland');
    expect(normalizeCountry('netherlands')).toBe('Nederland');
    expect(normalizeCountry('NL')).toBe('Nederland');
    expect(normalizeCountry('nl')).toBe('Nederland');
    expect(normalizeCountry('Nederland')).toBe('Nederland');
    expect(normalizeCountry('')).toBe('Nederland');
  });

  it('laat onbekende landen ongewijzigd', () => {
    expect(normalizeCountry('Belgium')).toBe('Belgium');
    expect(normalizeCountry('Deutschland')).toBe('Deutschland');
  });
});

describe('normalizePostcode', () => {
  it('voegt spatie toe tussen cijfers en letters', () => {
    expect(normalizePostcode('1234AB')).toBe('1234 AB');
    expect(normalizePostcode('1234ab')).toBe('1234 AB');
    expect(normalizePostcode('1234 AB')).toBe('1234 AB');
  });

  it('laat niet-NL-formaat ongewijzigd', () => {
    expect(normalizePostcode('SW1A 1AA')).toBe('SW1A 1AA');
    expect(normalizePostcode('')).toBe('');
  });
});

describe('parseExcelSerialDate', () => {
  it('converteert Excel-serial 20311 naar 1955-08-10 (geverifieerd via XLSX.SSF)', () => {
    expect(parseExcelSerialDate(20311)).toBe('1955-08-10');
  });

  it('converteert serial 1 (Excel-epoch) naar 1900-01-01', () => {
    expect(parseExcelSerialDate(1)).toBe('1900-01-01');
  });

  it('accepteert al-ISO-strings ongewijzigd', () => {
    expect(parseExcelSerialDate('1990-05-12')).toBe('1990-05-12');
  });

  it('geeft lege string voor onbruikbare input', () => {
    expect(parseExcelSerialDate('')).toBe('');
    expect(parseExcelSerialDate(null)).toBe('');
    expect(parseExcelSerialDate(undefined)).toBe('');
    expect(parseExcelSerialDate(0)).toBe('');
    expect(parseExcelSerialDate(-100)).toBe('');
    expect(parseExcelSerialDate(NaN)).toBe('');
    expect(parseExcelSerialDate('niet-een-datum')).toBe('');
  });
});

describe('isPlausibleBirthDate', () => {
  it('accepteert datums tussen 1920 en 2010', () => {
    expect(isPlausibleBirthDate('1955-08-10')).toBe(true);
    expect(isPlausibleBirthDate('1920-01-01')).toBe(true);
    expect(isPlausibleBirthDate('2010-12-31')).toBe(true);
    expect(isPlausibleBirthDate('1985-06-15')).toBe(true);
  });

  it('verwerpt Excel-placeholders en onmogelijke datums', () => {
    expect(isPlausibleBirthDate('1900-01-01')).toBe(false); // serial 1
    expect(isPlausibleBirthDate('2020-05-10')).toBe(false); // minderjarig
    expect(isPlausibleBirthDate('1850-01-01')).toBe(false);
  });

  it('verwerpt foutief geformatteerde input', () => {
    expect(isPlausibleBirthDate('')).toBe(false);
    expect(isPlausibleBirthDate('1955/08/10')).toBe(false);
    expect(isPlausibleBirthDate('10-08-1955')).toBe(false);
    expect(isPlausibleBirthDate('niet-een-datum')).toBe(false);
  });
});
