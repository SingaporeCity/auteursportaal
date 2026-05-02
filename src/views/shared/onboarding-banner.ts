/**
 * Onboarding-banner — toont boven de tabs zolang de auteur niet `active` is.
 *
 * Twee varianten:
 *  - `pending_data` — auteur moet profiel aanvullen, andere tabs zijn disabled
 *  - `pending_admin_review` — auteur heeft ingediend, wacht op admin-OK
 *
 * Wordt gemount door `dashboard.ts` wanneer `mode === 'onboarding'`.
 *
 * @module views/shared/onboarding-banner
 */

import { t } from '@/lib/i18n';
import type { OnboardingStatus } from '@/types/db';

export function buildOnboardingBanner(status: OnboardingStatus): HTMLElement | null {
  if (status === 'active') {
    return null;
  }

  const wrap = document.createElement('section');
  wrap.className = `onboarding-banner onboarding-banner-${status}`;
  wrap.setAttribute('role', 'status');

  const icon = document.createElement('div');
  icon.className = 'onboarding-banner-icon';
  icon.setAttribute('aria-hidden', 'true');
  // Statische SVG-strings uit eigen module — niet gebruiker-gegenereerd
  // eslint-disable-next-line no-unsanitized/property -- statische SVG uit code
  icon.innerHTML =
    status === 'pending_data'
      ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
      : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  wrap.appendChild(icon);

  const body = document.createElement('div');
  body.className = 'onboarding-banner-body';

  const title = document.createElement('h2');
  title.className = 'onboarding-banner-title';
  title.textContent =
    status === 'pending_data'
      ? t('onboarding.banner_pending_data_title')
      : t('onboarding.banner_pending_review_title');
  body.appendChild(title);

  const text = document.createElement('p');
  text.className = 'onboarding-banner-text';
  text.textContent =
    status === 'pending_data'
      ? t('onboarding.banner_pending_data_text')
      : t('onboarding.banner_pending_review_text');
  body.appendChild(text);

  wrap.appendChild(body);
  return wrap;
}
