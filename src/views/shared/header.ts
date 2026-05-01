/**
 * Gedeelde app-header voor auteur-dashboard én admin-pagina.
 * Bevat logo + sub-label + greeting + dark-mode toggle + uitloggen.
 *
 * @module views/shared/header
 */

import { signOut } from '@/auth';
import { t, getLocale, setLocale, listSupportedLocales } from '@/lib/i18n';
import { toggleTheme } from '@/lib/theme';
import type { SupportedLocale } from '@/i18n/types';

export function buildAppHeader(displayName: string): HTMLElement {
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
  sub.textContent = 'Auteursportaal';
  brand.appendChild(sub);

  header.appendChild(brand);

  // -- Acties (greeting + theme toggle + logout)
  const actions = document.createElement('div');
  actions.className = 'app-header-actions';

  const greeting = document.createElement('span');
  greeting.className = 'app-header-greeting';
  greeting.textContent = `${greetingFor(new Date())}, ${displayName}`;
  actions.appendChild(greeting);

  // Taal-toggle (NL / EN / SV)
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
      // Hard reload zodat alle gerenderde labels meedoen
      window.location.reload();
    });
    wrap.appendChild(btn);
  }
  return wrap;
}

function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 6) {
    return t('greeting.night');
  }
  if (hour < 12) {
    return t('greeting.morning');
  }
  if (hour < 18) {
    return t('greeting.afternoon');
  }
  return t('greeting.evening');
}
