/**
 * Gedeelde app-header voor auteur-dashboard én admin-pagina.
 *
 * Layout (5-koloms grid zoals demo):
 *   logo + sub-label  |  search-trigger  |  taal-toggle  |  dark-toggle  |  logout
 *
 * Greeting staat NIET meer in de header — die is verplaatst naar de
 * `welcome-section` boven de tabs (zie `welcome-section.ts`).
 *
 * @module views/shared/header
 */

import { signOut } from '@/auth';
import { t, getLocale, setLocale, listSupportedLocales } from '@/lib/i18n';
import { toggleTheme } from '@/lib/theme';
import type { SupportedLocale } from '@/i18n/types';
import { openCommandPalette } from './command-palette';

export function buildAppHeader(): HTMLElement {
  const header = document.createElement('header');
  header.className = 'app-header';

  // -- Brand (logo + AUTEURSPORTAAL label)
  const brand = document.createElement('div');
  brand.className = 'app-header-brand';

  const logo = document.createElement('img');
  logo.src = '/noordhoff-logo.png';
  logo.alt = 'Noordhoff';
  logo.className = 'app-header-logo';
  brand.appendChild(logo);

  const divider = document.createElement('div');
  divider.className = 'app-header-divider';
  brand.appendChild(divider);

  const sub = document.createElement('span');
  sub.className = 'app-header-sub';
  sub.textContent = t('header.app_label');
  brand.appendChild(sub);

  header.appendChild(brand);

  // -- Search trigger (opent command palette)
  header.appendChild(buildSearchTrigger());

  // -- Acties container
  const actions = document.createElement('div');
  actions.className = 'app-header-actions';

  actions.appendChild(buildLangToggle());

  const themeBtn = document.createElement('button');
  themeBtn.type = 'button';
  themeBtn.className = 'theme-toggle';
  themeBtn.title = 'Wissel licht/donker';
  themeBtn.setAttribute('aria-label', 'Wissel licht of donker thema');
  themeBtn.addEventListener('click', () => {
    toggleTheme();
  });
  actions.appendChild(themeBtn);

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'app-header-logout';
  logoutBtn.textContent = t('auth.logout');
  logoutBtn.addEventListener('click', () => {
    void signOut();
  });
  actions.appendChild(logoutBtn);

  header.appendChild(actions);
  return header;
}

function buildSearchTrigger(): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'header-search-trigger';
  btn.setAttribute('aria-label', 'Zoeken (Ctrl+K)');

  const iconWrap = document.createElement('span');
  iconWrap.className = 'header-search-icon';
  iconWrap.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  btn.appendChild(iconWrap);

  const label = document.createElement('span');
  label.className = 'header-search-label';
  label.textContent = t('header.search_label');
  btn.appendChild(label);

  const kbd = document.createElement('kbd');
  kbd.className = 'header-search-kbd';
  const isMac = navigator.userAgent.includes('Mac');
  kbd.textContent = isMac ? '⌘K' : 'Ctrl K';
  btn.appendChild(kbd);

  btn.addEventListener('click', () => {
    openCommandPalette();
  });
  return btn;
}

function buildLangToggle(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'lang-toggle';
  const current = getLocale();

  for (const locale of listSupportedLocales()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lang-toggle-btn';
    if (locale === current) {
      btn.classList.add('active');
    }
    btn.textContent = locale.toUpperCase();
    btn.addEventListener('click', () => {
      setLocale(locale satisfies SupportedLocale);
      window.location.reload();
    });
    wrap.appendChild(btn);
  }
  return wrap;
}
