/**
 * Welcome-section — staat boven de tabs-container, niet in de header.
 * Toont tijds-gebonden begroeting + tagline (zoals demo).
 *
 * @module views/shared/welcome-section
 */

import type { AuthorRow } from '@/auth';
import { t } from '@/lib/i18n';

export function buildWelcomeSection(author: AuthorRow): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'welcome-section';

  const heading = document.createElement('h1');
  heading.className = 'welcome-heading';
  heading.textContent = `${greetingFor(new Date())}, ${author.first_name}`;
  wrap.appendChild(heading);

  const tagline = document.createElement('p');
  tagline.className = 'welcome-tagline';
  tagline.textContent = t('app.tagline');
  wrap.appendChild(tagline);

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
