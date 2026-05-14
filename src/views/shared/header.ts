/**
 * Gedeelde app-header voor auteur-dashboard én admin-pagina.
 *
 * Layout (links → rechts):
 *   logo + AUTEURSPORTAAL-label  |  zoek-trigger (Ctrl/⌘K)  |  taal-toggle
 *                                                           |  user-chip
 *                                                           |  uitloggen
 *
 * @module views/shared/header
 */

import { signOut } from '@/auth';
import type { AuthorRow } from '@/auth';
import { t, getLocale, setLocale, listSupportedLocales } from '@/lib/i18n';
import type { SupportedLocale } from '@/i18n/types';
import { openCommandPalette } from './command-palette';

export function buildAppHeader(user: AuthorRow): HTMLElement {
  const header = document.createElement('header');
  header.className = 'app-header';

  header.appendChild(buildBrand());
  header.appendChild(buildSearchTrigger());

  const actions = document.createElement('div');
  actions.className = 'app-header-actions';
  actions.appendChild(buildLangToggle());
  actions.appendChild(buildUserChip(user));
  actions.appendChild(buildLogoutBtn());
  header.appendChild(actions);

  return header;
}

function buildBrand(): HTMLElement {
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

  return brand;
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

function buildUserChip(user: AuthorRow): HTMLElement {
  const chip = document.createElement('div');
  chip.className = 'app-header-user';
  if (user.is_admin) {
    chip.classList.add('app-header-user--admin');
  }
  chip.setAttribute('aria-label', `Ingelogd als ${user.first_name} ${user.last_name}`);

  const avatar = document.createElement('span');
  avatar.className = 'app-header-user-avatar';
  avatar.textContent = computeInitials(user.first_name, user.last_name);
  avatar.setAttribute('aria-hidden', 'true');
  chip.appendChild(avatar);

  const meta = document.createElement('span');
  meta.className = 'app-header-user-meta';

  const name = document.createElement('span');
  name.className = 'app-header-user-name';
  name.textContent = `${user.first_name} ${user.last_name}`.trim();
  meta.appendChild(name);

  if (user.is_admin) {
    const role = document.createElement('span');
    role.className = 'app-header-user-role';
    role.textContent = t('header.role_admin');
    meta.appendChild(role);
  }

  chip.appendChild(meta);
  return chip;
}

function buildLogoutBtn(): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'app-header-logout';
  btn.textContent = t('auth.logout');
  btn.addEventListener('click', () => {
    void signOut();
  });
  return btn;
}

function computeInitials(first: string, last: string): string {
  const f = first.trim()[0] ?? '';
  const l = last.trim()[0] ?? '';
  const initials = `${f}${l}`.toUpperCase();
  return initials === '' ? '·' : initials;
}
