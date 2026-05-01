/**
 * i18n lookup-helper en taal-state.
 *
 * Drie ondersteunde talen (NL/EN/SV). Taalkeuze wordt persistent opgeslagen
 * in `localStorage` onder key `locale`. Bij missende sleutel valt de helper
 * terug op de fallback-taal (NL); ontbreekt de key dan ook daar, wordt de
 * key zelf teruggegeven (zichtbaar in UI als signaal van een bug).
 *
 * @module lib/i18n
 */

import { nl } from '@/i18n/nl';
import { en } from '@/i18n/en';
import { sv } from '@/i18n/sv';
import {
  type SupportedLocale,
  type TranslationKey,
  type Translations,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
} from '@/i18n/types';

const TRANSLATIONS: Record<SupportedLocale, Translations> = { nl, en, sv };

const LOCALE_STORAGE_KEY = 'locale';

let currentLocale: SupportedLocale = DEFAULT_LOCALE;

/**
 * Initialiseert de locale uit localStorage of de browser-voorkeur.
 * Roep deze één keer aan bij app-start (in `main.ts`).
 */
export function initLocale(): SupportedLocale {
  const stored = readStoredLocale();
  if (stored !== null) {
    currentLocale = stored;
    document.documentElement.lang = stored;
    return stored;
  }

  const browserLocale = detectBrowserLocale();
  currentLocale = browserLocale;
  document.documentElement.lang = browserLocale;
  return browserLocale;
}

/**
 * Wijzigt de actieve taal en persisteert de keuze.
 */
export function setLocale(locale: SupportedLocale): void {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    return;
  }
  currentLocale = locale;
  document.documentElement.lang = locale;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // localStorage kan disabled zijn (private browsing, strict cookie-policies).
    // Geen escalatie — taal is dan alleen geldig voor de huidige sessie.
  }
}

/**
 * Geeft de actieve taal terug.
 */
export function getLocale(): SupportedLocale {
  return currentLocale;
}

/**
 * Lookup-helper. Type-veilig: alleen bekende keys worden geaccepteerd.
 *
 * @example t('auth.login.submit') === 'Inloggen' (in NL)
 */
export function t(key: TranslationKey): string {
  const primary = TRANSLATIONS[currentLocale][key];
  if (primary.length > 0) {
    return primary;
  }
  return TRANSLATIONS[FALLBACK_LOCALE][key];
}

/**
 * Lijst alle ondersteunde talen op voor UI-pickers.
 */
export function listSupportedLocales(): readonly SupportedLocale[] {
  return SUPPORTED_LOCALES;
}

function readStoredLocale(): SupportedLocale | null {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (value !== null && isSupportedLocale(value)) {
      return value;
    }
  } catch {
    // localStorage onbeschikbaar — geen probleem, geef null terug.
  }
  return null;
}

function detectBrowserLocale(): SupportedLocale {
  const lang = navigator.language.slice(0, 2).toLowerCase();
  if (isSupportedLocale(lang)) {
    return lang;
  }
  return DEFAULT_LOCALE;
}

function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
