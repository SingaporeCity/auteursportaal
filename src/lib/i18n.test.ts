import { describe, it, expect, beforeEach } from 'vitest';
import { initLocale, setLocale, getLocale, t, listSupportedLocales } from './i18n';

describe('i18n', () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale('nl');
  });

  describe('setLocale + getLocale', () => {
    it('wisselt actieve taal', () => {
      setLocale('en');
      expect(getLocale()).toBe('en');
    });

    it('persisteert in localStorage', () => {
      setLocale('sv');
      expect(localStorage.getItem('locale')).toBe('sv');
    });

    it('zet document.documentElement.lang', () => {
      setLocale('en');
      expect(document.documentElement.lang).toBe('en');
    });

    it('negeert niet-ondersteunde taal', () => {
      setLocale('en');
      // @ts-expect-error — bewust ongeldig om runtime-gedrag te testen
      setLocale('fr');
      expect(getLocale()).toBe('en');
    });
  });

  describe('initLocale', () => {
    it('leest persisted taal uit localStorage', () => {
      localStorage.setItem('locale', 'sv');
      const result = initLocale();
      expect(result).toBe('sv');
      expect(getLocale()).toBe('sv');
    });

    it('valt terug op default als geen opgeslagen taal', () => {
      localStorage.removeItem('locale');
      const result = initLocale();
      expect(['nl', 'en', 'sv']).toContain(result);
    });
  });

  describe('t() lookup', () => {
    it('geeft NL-string voor bekende key in NL', () => {
      setLocale('nl');
      expect(t('auth.login.submit')).toBe('Inloggen');
    });

    it('geeft EN-string voor bekende key in EN', () => {
      setLocale('en');
      expect(t('auth.login.submit')).toBe('Sign in');
    });

    it('geeft SV-string voor bekende key in SV', () => {
      setLocale('sv');
      expect(t('auth.login.submit')).toBe('Logga in');
    });

    it('geeft tabs-namen consistent', () => {
      setLocale('nl');
      expect(t('tabs.payments')).toBe('Afrekeningen');
      setLocale('en');
      expect(t('tabs.payments')).toBe('Statements');
    });
  });

  describe('listSupportedLocales', () => {
    it('bevat nl, en en sv', () => {
      const locales = listSupportedLocales();
      expect(locales).toContain('nl');
      expect(locales).toContain('en');
      expect(locales).toContain('sv');
    });
  });
});
