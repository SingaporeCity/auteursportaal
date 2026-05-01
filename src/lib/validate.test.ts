import { describe, it, expect } from 'vitest';
import {
  isValidPostcodeNL,
  isValidEmail,
  isValidIBAN,
  isValidBSN,
  validateProfileFields,
} from './validate';

describe('isValidPostcodeNL', () => {
  it('accepteert formaat met spatie', () => {
    expect(isValidPostcodeNL('1234 AB')).toBe(true);
    expect(isValidPostcodeNL('4811 DV')).toBe(true);
  });

  it('accepteert formaat zonder spatie', () => {
    expect(isValidPostcodeNL('4811DV')).toBe(true);
  });

  it('accepteert lowercase letters', () => {
    expect(isValidPostcodeNL('1234ab')).toBe(true);
  });

  it('verwerpt te weinig cijfers', () => {
    expect(isValidPostcodeNL('123 AB')).toBe(false);
  });

  it('verwerpt cijfers achteraan', () => {
    expect(isValidPostcodeNL('1234 12')).toBe(false);
  });

  it('verwerpt extra letters', () => {
    expect(isValidPostcodeNL('1234 ABC')).toBe(false);
  });

  it('verwerpt lege string', () => {
    expect(isValidPostcodeNL('')).toBe(false);
  });
});

describe('isValidEmail', () => {
  it('accepteert standaard email', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
  });

  it('accepteert subdomains', () => {
    expect(isValidEmail('user@mail.noordhoff.nl')).toBe(true);
  });

  it('accepteert plus-tag', () => {
    expect(isValidEmail('user+tag@example.com')).toBe(true);
  });

  it("accepteert Charlotte's gmail", () => {
    expect(isValidEmail('cp071021@gmail.com')).toBe(true);
  });

  it('verwerpt zonder @', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  it('verwerpt zonder domein', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('verwerpt zonder TLD', () => {
    expect(isValidEmail('user@example')).toBe(false);
  });

  it('verwerpt lege string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('verwerpt te lange input', () => {
    expect(isValidEmail('a'.repeat(255) + '@example.com')).toBe(false);
  });
});

describe('isValidIBAN', () => {
  it('accepteert geldig NL IBAN (Charlotte)', () => {
    expect(isValidIBAN('NL78ASNB0707684307')).toBe(true);
  });

  it('accepteert IBAN met spaties', () => {
    expect(isValidIBAN('NL78 ASNB 0707 6843 07')).toBe(true);
  });

  it('accepteert lowercase input', () => {
    expect(isValidIBAN('nl78asnb0707684307')).toBe(true);
  });

  it('accepteert ander geldig NL IBAN', () => {
    expect(isValidIBAN('NL91ABNA0417164300')).toBe(true);
  });

  it('verwerpt verkeerde checksum', () => {
    expect(isValidIBAN('NL00ASNB0707684307')).toBe(false);
  });

  it('verwerpt te korte string', () => {
    expect(isValidIBAN('NL78')).toBe(false);
  });

  it('verwerpt invalide tekens', () => {
    expect(isValidIBAN('NL78ASNB#707684307')).toBe(false);
  });

  it('verwerpt lege string', () => {
    expect(isValidIBAN('')).toBe(false);
  });
});

describe('isValidBSN', () => {
  it('accepteert geldig BSN', () => {
    // Wiskundig geldig: 1 * 9 + 1 * 8 + 1 * 7 + 2 * 6 + 2 * 5 + 2 * 4 + 3 * 3 + 3 * 2 + 3 * -1
    // = 9 + 8 + 7 + 12 + 10 + 8 + 9 + 6 - 3 = 66 → 66 % 11 = 0 ✓
    expect(isValidBSN('111222333')).toBe(true);
  });

  it('verwerpt alle nullen (placeholder)', () => {
    expect(isValidBSN('000000000')).toBe(false);
  });

  it('verwerpt 8-cijferige input', () => {
    expect(isValidBSN('11122233')).toBe(false);
  });

  it('verwerpt 10-cijferige input', () => {
    expect(isValidBSN('1112223334')).toBe(false);
  });

  it('verwerpt verkeerde checksum', () => {
    expect(isValidBSN('111222334')).toBe(false);
  });

  it('strippt niet-cijfers', () => {
    expect(isValidBSN('111-222-333')).toBe(true);
  });

  it('verwerpt lege string', () => {
    expect(isValidBSN('')).toBe(false);
  });
});

describe('validateProfileFields', () => {
  it('retourneert null bij geldige invoer', () => {
    expect(
      validateProfileFields({
        email: 'cp071021@gmail.com',
        postcode: '4811 DV',
        iban: 'NL78ASNB0707684307',
      })
    ).toBeNull();
  });

  it('flagt eerste ongeldige veld', () => {
    const result = validateProfileFields({
      email: 'invalid',
      postcode: '4811 DV',
    });
    expect(result?.field).toBe('email');
  });

  it('skipt lege velden', () => {
    expect(validateProfileFields({ email: '', postcode: '' })).toBeNull();
  });
});
