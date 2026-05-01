/**
 * Light/dark thema-management.
 *
 * Theme wordt opgeslagen in `localStorage` (key `theme`) en op
 * `<html data-theme="...">` toegepast. Bij eerste bezoek volgt de OS-voorkeur
 * (`prefers-color-scheme`).
 *
 * @module lib/theme
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

export function initTheme(): Theme {
  const stored = readStored();
  if (stored !== null) {
    apply(stored);
    return stored;
  }
  const systemDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial: Theme = systemDark ? 'dark' : 'light';
  apply(initial);
  return initial;
}

export function getTheme(): Theme {
  const explicit = document.documentElement.dataset['theme'];
  return explicit === 'dark' ? 'dark' : 'light';
}

export function setTheme(theme: Theme): void {
  apply(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode — sessie-only */
  }
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

function apply(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme;
}

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'dark' || value === 'light') {
      return value;
    }
  } catch {
    /* localStorage onbeschikbaar */
  }
  return null;
}
